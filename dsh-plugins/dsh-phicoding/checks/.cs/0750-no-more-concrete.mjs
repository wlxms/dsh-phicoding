#!/usr/bin/env node
// 0750 - 引用了一族类型里的某一档，就不许再引用同一族里更具体的那一档。
//
// 这条不需要一张手写的等级表就能判：**初始引用的具体度，就是这条边界的上限。**
//
//   B 是接口      A 只许再引用同一族的接口      （族里最抽象那一档）
//   B 是抽象类    A 只许再引用抽象子类          （不许跨进具体实现）
//   B 是具体类    A 一个子类都不许再引用        （已经具体到底了）
//
// 为什么是这三档：A 引用了 B，说明 A 站在 B 这一档上看这个族。再引用更具体的
// 类型，就等于把"具体是谁"钉进了 A —— 那个抽象点成了装饰。
//
// **全项目判，不按目录划范围。** 判据是代码自身的性质：A 到底知不知道那个具体
// 类型，跟它放在哪个目录无关。主干是不是可判，跟这条规则无关。
//
// 工厂与组合根是唯一的正当例外：它们必然同时引用抽象和全部具现。那不是泄漏，
// 是职责。这种类型用一条注释显式放行，而不是靠一个目录边界悄悄放过：
//
//   // [作者 日期 waive=0750 why=plumbing] 这是工厂，它必须认识全部具现
//
// 豁免写在这个类型内部任意位置，对该类型的全部发现生效——被豁免的是"这个类型
// 的角色"，不是某一行。豁免数会打进摘要，否则"没人违规"和"全被豁免"长得一样。

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const byName = new Map()
for (const type of facts.types) if (!byName.has(type.name)) byName.set(type.name, type)

// 这条规则按名字查类型。两个同名类型（不同命名空间）会让它认错人，而认错之后
// 报的是"这里违规"或"这里没事"——两种都可能是假的。判不了就不判，并且说出来。
const seen = new Map()
for (const type of facts.types) seen.set(type.name, (seen.get(type.name) ?? 0) + 1)
const duplicated = [...seen].filter(([, count]) => count > 1).map(([name]) => name)
if (duplicated.length > 0) {
  console.log(`有同名类型（${duplicated.join(', ')}）—— 按名字查会串，先消除同名，跳过，不算通过。`)
  process.exit(3)
}

function bare(name) {
  if (!name) return null
  let text = String(name).trim()
  const generic = text.indexOf('<')
  if (generic >= 0) text = text.slice(0, generic)
  const dot = text.lastIndexOf('.')
  if (dot >= 0) text = text.slice(dot + 1)
  return text.replace(/\?$/, '').trim() || null
}

function parents(type) {
  return [bare(type.base), ...(type.interfaces ?? []).map(bare)].filter(Boolean)
}

const isInterface = (type) => type.kind === 'interface'
const isAbstract = (type) => !isInterface(type) && type.isAbstract === true

// 立刻能判出"这个 C 越界了吗"。返回越界说明，或 null。
function trespass(b, c) {
  if (isInterface(b)) {
    return isInterface(c) ? null : `引用了接口 ${b.name}，又引用了它的非接口子类 ${c.name}`
  }
  if (isAbstract(b)) {
    return isAbstract(c) ? null : `引用了抽象类 ${b.name}，又引用了它的具体子类 ${c.name}`
  }
  return `引用了具体类 ${b.name}，又引用了它的子类 ${c.name}`
}

// 沿继承链走到底。接口继承也算：IChild : IRoot 时 IRoot 的具体实现同样越界。
const cache = new Map()
function inherits(type, ancestor, seen = new Set()) {
  const key = `${type.name}>${ancestor}`
  if (cache.has(key)) return cache.get(key)
  if (seen.has(type.name)) return false
  seen.add(type.name)
  let hit = false
  for (const parent of parents(type)) {
    if (parent === ancestor) {
      hit = true
      break
    }
    const up = byName.get(parent)
    if (up && inherits(up, ancestor, seen)) {
      hit = true
      break
    }
  }
  cache.set(key, hit)
  return hit
}

// 一个类型和它自己的嵌套类型是同一个设计单元（与 0800 同一条判断）：外层类型
// 引用自己内部的实现，没有跨过任何信息边界。
const roots = new Map()
function outerOf(type) {
  if (roots.has(type.name)) return roots.get(type.name)
  let current = type
  const guard = new Set()
  for (;;) {
    if (!current.containing || guard.has(current.name)) break
    guard.add(current.name)
    const up = byName.get(current.containing)
    if (!up) break
    current = up
  }
  roots.set(type.name, current.name)
  return current.name
}

// 豁免：这个类型的角色本身允许同时认识抽象与具现（工厂、组合根）。
const waives = (comment) => String(comment.fields?.waive ?? '').split(',').map((one) => one.trim())

const hits = []
const excused = {}

for (const owner of facts.types) {
  const granted = (owner.comments ?? []).find((comment) => waives(comment).includes('0750'))
  if (granted) {
    const why = granted.fields?.why ?? 'unknown'
    excused[why] = (excused[why] ?? 0) + 1
    continue
  }

  // 这个类型直接引用的目标，按出现顺序，每个目标留第一条边（报错要指位置）。
  const targets = new Map()
  for (const ref of facts.references) {
    if (ref.from !== owner.name || ref.from === ref.to) continue
    if (!targets.has(ref.to)) targets.set(ref.to, ref)
  }
  if (targets.size < 2) continue

  for (const [baseName, baseRef] of targets) {
    const b = byName.get(baseName)
    if (!b) continue
    for (const [childName, childRef] of targets) {
      if (childName === baseName) continue
      const c = byName.get(childName)
      if (!c) continue
      if (!inherits(c, baseName)) continue
      if (outerOf(owner) === outerOf(c)) continue
      const why = trespass(b, c)
      if (!why) continue
      hits.push(`${childRef.file}:${childRef.line}  ${owner.name} ${why}（${baseName} 在 ${baseRef.line} 行）`)
    }
  }
}

for (const hit of hits) console.log(hit)

const total = Object.values(excused).reduce((sum, one) => sum + one, 0)
if (hits.length === 0 && total > 0) {
  // 豁免本身是事实。不报出来，"没人违规"和"全被豁免了"就分不清。
  const detail = Object.entries(excused).map(([why, n]) => `${why} ${n}`).join(' / ')
  console.log(`豁免 ${total} 个类型（${detail}）`)
}

process.exit(hits.length === 0 ? 0 : 1)
