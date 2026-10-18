#!/usr/bin/env node
// 0400 - 名字必须符合它所属类别的范式。
//
// 这不是审美，是契约：读者看到 `*Attribute` 就知道它是特性，看到 `IFoo` 就知道
// 它是接口，不用点进去。而**类别必须从结构认出来**——用名字去认类别，再拿类别
// 去要求名字，规则只是在证明自己。
//
//   接口        结构：kind == interface          → I 开头
//   枚举        结构：kind == enum               → E 开头
//   特性        结构：基类链终点是 Attribute     → Attribute 结尾
//   异常        结构：基类链终点是 Exception     → Exception 结尾
//   扩展类      结构：含 this 首参的方法         → Extension 结尾
//                且当它只扩展一个本工程类型时，名字要以那个类型开头
//
// 枚举这条只在主干之外才真正生效：0300 在主干禁枚举，所以主干里恒为绿。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'append',
  inject: '\npublic interface Probe\n{\n}\n'
}

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

if (args.includes('--probe-spec')) {
  console.log(JSON.stringify(probe))
  process.exit(0)
}

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const byName = new Map()
for (const type of facts.types) if (!byName.has(type.name)) byName.set(type.name, type)

// 基类链的终点：一路走到底，直到某个基类不是本工程声明的类型。
// 特性与异常都在 BCL 里，所以"终点叫什么"就是唯一可用的判据。
function baseRoot(type) {
  let current = type
  const guard = new Set()
  for (;;) {
    const base = String(current.base ?? '').split('<')[0].trim()
    if (!base || guard.has(current.name)) return base || null
    guard.add(current.name)
    const up = byName.get(base)
    if (!up) return base
    current = up
  }
}

// `IEnumerable<T>` 的宿主叫 EnumerableExtensions，所以比较时去掉泛型参数。
const bare = (text) => String(text ?? '').split('<')[0].trim()

const hits = []
const at = (type) => `${type.file}:${type.line}`

for (const type of facts.types) {
  if (type.kind === 'interface') {
    if (!/^I[A-Z]/.test(type.name)) hits.push(`${at(type)}  接口 ${type.name} 要以 I 开头`)
    continue
  }

  if (type.kind === 'enum') {
    if (!/^E[A-Z]/.test(type.name)) hits.push(`${at(type)}  枚举 ${type.name} 要以 E 开头`)
    continue
  }

  const root = baseRoot(type)
  if (root === 'Attribute') {
    if (!type.name.endsWith('Attribute')) hits.push(`${at(type)}  特性 ${type.name} 要以 Attribute 结尾`)
    continue
  }
  if (root !== null && root.endsWith('Exception')) {
    if (!type.name.endsWith('Exception')) hits.push(`${at(type)}  异常 ${type.name} 要以 Exception 结尾`)
    continue
  }

  // 扩展方法宿主：由 `this` 首参认定，不由名字认定。
  const targets = [...new Set((type.members ?? []).map((member) => bare(member.extensionOf)).filter(Boolean))]
  if (targets.length === 0) continue

  const named = /Extensions?$/.test(type.name)
  if (!named) {
    hits.push(`${at(type)}  扩展类 ${type.name} 要以 Extension / Extensions 结尾`)
    continue
  }
  // 只扩展一个本工程类型时，名字还要说清扩展的是谁。目标在 BCL 里
  // （IEnumerable 之类）时不强求——那样会逼出 EnumerableListArrayExtensions。
  if (targets.length === 1 && byName.has(targets[0]) && !type.name.startsWith(targets[0])) {
    hits.push(`${at(type)}  扩展类 ${type.name} 只扩展 ${targets[0]}，名字要以 ${targets[0]} 开头`)
  }
}

for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)
