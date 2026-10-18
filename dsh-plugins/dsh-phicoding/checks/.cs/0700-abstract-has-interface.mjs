#!/usr/bin/env node
// 0700 - 每个抽象至少实现一个接口。
//
// 接口是最小的公开面（见 phicoding 的接口节）：一个层级里能被公开的东西，
// 最底下那一档就是接口。抽象是公开面，所以抽象必须被接口覆盖。
//
// 判据的限：只查"有没有接口"，不查"接口有没有覆盖它的完整抽象面"。
// 底座不记录成员级的 abstract 修饰符，那一半归哲学法官软审，不在这里假装查到。
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const interfaces = new Set(facts.types.filter((t) => t.kind === 'interface').map((t) => t.name))
const byName = new Map(facts.types.map((t) => [t.name, t]))

// `class X : IFoo` 与 `class X : Base, IFoo` 在语法树里落点不同：前者进 base，
// 后者只有第一个进 base。两边都要看——只读 interfaces 会静默漏掉一半。
const bases = (type) => [type.base, ...(type.interfaces ?? [])].map(bare).filter(Boolean)

function bare(name) {
  if (!name) return null
  let text = name.trim()
  const generic = text.indexOf('<')
  if (generic >= 0) text = text.slice(0, generic)
  const dot = text.lastIndexOf('.')
  if (dot >= 0) text = text.slice(dot + 1)
  return text.replace(/\?$/, '').trim() || null
}

// 接口会被继承：`Slot : ISlot` 之后，`Weapon : Slot` 也是 ISlot，不必再声明一次。
// 所以沿基类链走到底，走到谁声明了接口都算数。
function covered(type, seen = new Set()) {
  if (seen.has(type.name)) return false
  seen.add(type.name)
  for (const name of bases(type)) {
    if (interfaces.has(name)) return true
    const parent = byName.get(name)
    if (parent && covered(parent, seen)) return true
  }
  return false
}

// 基类链上出现既不是本工程接口、也不是本工程类型的名字——那是外部类型，
// 是接口还是基类，纯语法树判不了。判不了就不报，不猜。
function judgeable(type, seen = new Set()) {
  if (seen.has(type.name)) return true
  seen.add(type.name)
  for (const name of bases(type)) {
    if (interfaces.has(name)) continue
    const parent = byName.get(name)
    if (!parent) return false
    if (!judgeable(parent, seen)) return false
  }
  return true
}

const hits = []
for (const type of facts.types) {
  if (!type.isAbstract) continue
  if (type.kind !== 'class' && type.kind !== 'record') continue
  if (covered(type)) continue
  if (!judgeable(type)) continue
  hits.push(`${type.file}:${type.line}  抽象 ${type.name} 没有实现任何接口`)
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)
