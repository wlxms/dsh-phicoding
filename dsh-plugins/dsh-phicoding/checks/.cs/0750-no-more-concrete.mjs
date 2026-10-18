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
// 类型，就等于把"具体是谁"钉进了 A —— 那个抽象点成了装饰。档位越高，允许的
// 具体度越高：接口只认接口，抽象类只认抽象类，具体类不认任何子类。
//
// 只查主干。工厂必然同时引用抽象和它全部的具现，那是工厂的职责，不是泄漏 ——
// 所以主干在哪必须由项目声明，规则不许自己猜。

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

let config
try {
  config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))
} catch {
  console.log('没有项目配置 —— 主干范围无从确定，跳过，不算通过。')
  process.exit(3)
}

// "." 与 "" 都表示"整个项目都是主干"。不归一化的话 trunk = "." 会让
// `Types.cs`.startsWith(".") 为假：规则不报错，只是永远不判，读起来像干净。
const trunk = String(config.trunk ?? '')
  .split('\\')
  .join('/')
  .replace(/^\.\/?/, '')
  .replace(/\/$/, '')
if (config.trunk === undefined || config.trunk === null) {
  console.log('项目配置里没有 trunk。主干是哪一块必须由项目声明，规则不许自己猜。')
  process.exit(3)
}

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
const isConcrete = (type) => !isInterface(type) && type.isAbstract !== true

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

const inTrunk = (file) => trunk === '' || String(file).split('\\').join('/').startsWith(trunk)

const hits = []
for (const owner of facts.types) {
  if (!inTrunk(owner.file)) continue

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
process.exit(hits.length === 0 ? 0 : 1)
