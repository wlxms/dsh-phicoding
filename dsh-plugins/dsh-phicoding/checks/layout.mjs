#!/usr/bin/env node
// 接口模块的目录/依赖派生 + 硬检查共用逻辑。
//
// 规则仍然是独立进程：它们只 import 这里的纯函数，然后 exit 0 / 1 / 3。
// 测试也 import 这里，直接喂一段 facts —— 底座契约本来就把"解析"和"判断"分开了。
//
// 本文件只吃 facts 的 files / types / references，不读源码目录，不解析 C#。
//
// 判据的限（规则头里也要写一遍，这里是总限）：
//   * 底座只收 BaseTypeDeclaration：**delegate 不在 facts 里**。所以
//     "delegate 必须放 Models" 现在判不了，归软审；接口里引用 delegate 也看不到。
//   * 类型解析按名字。两个同名类型会让规则认错人 —— 需要名字的检查直接 exit 3，
//     不猜（与 0750 同一条纪律）。
//   * 聚合根 / 组合根的识别只能靠命名或清单，是软判；H5/H6 不在这里硬判。
//   * GCD 落点、外部概念路径、抽象类"对应目录"的目录名派生都带命名判断，先软审。

import { readFileSync } from 'node:fs'

const INTERFACE = 'interface'
const CLASS = new Set(['class', 'record'])
const DATA_ATOM = new Set(['struct', 'recordstruct', 'enum'])
const SKIP =
  '未发现 Interfaces/ 模块：本工程未采用接口模块标准。跳过不等于通过；软审必须要求迁移，或登记项目级豁免（原因 / 范围 / 期限）。'

export const bare = (name) => {
  if (!name) return null
  let text = String(name).trim()
  const generic = text.indexOf('<')
  if (generic >= 0) text = text.slice(0, generic)
  const dot = text.lastIndexOf('.')
  if (dot >= 0) text = text.slice(dot + 1)
  return text.replace(/\?$/, '').trim() || null
}

export const parents = (type) => [bare(type.base), ...(type.interfaces ?? []).map(bare)].filter(Boolean)

export const isInterfaceType = (type) => type.kind === INTERFACE

export const isClassType = (type) => CLASS.has(type.kind)

export const isDataAtom = (type) => DATA_ATOM.has(type.kind)

export const isInInterfaces = (file) => {
  const segments = split(file)
  for (let at = 0; at < segments.length - 1; at++) if (segments[at] === 'Interfaces') return true
  return false
}

function split(file) {
  return String(file).replaceAll('\\', '/').split('/').filter(Boolean)
}

// 一个文件可能落在若干模块之下。模块 = 某个 Interfaces/ 的父目录。
// 工程根的 Interfaces/（模块路径为空）不算模块：模块必须有名字，边界归组合根。
function modulesOfFile(file) {
  const segments = split(file)
  const found = []
  for (let at = 0; at < segments.length - 1; at++) {
    if (segments[at] === 'Interfaces') {
      const module = segments.slice(0, at).join('/')
      if (module) found.push(module)
    }
  }
  return found
}

export function layout(facts) {
  const files = facts.files ?? [...new Set((facts.types ?? []).map((type) => type.file))]
  const modules = [...new Set(files.flatMap(modulesOfFile))].sort((left, right) => left.length - right.length)

  const moduleOf = (file) => {
    let found = null
    for (const module of modules) {
      if (file === module || file.startsWith(`${module}/`)) found = module
    }
    return found
  }

  const parentOf = (module) => {
    let found = null
    for (const other of modules) {
      if (other !== module && (module === other || module.startsWith(`${other}/`))) found = other
    }
    return found
  }

  const isDescendant = (module, ancestor) => module.startsWith(`${ancestor}/`)

  const byName = new Map()
  const duplicated = new Set()
  for (const type of facts.types ?? []) {
    if (byName.has(type.name)) duplicated.add(type.name)
    else byName.set(type.name, type)
  }

  const byFileAndName = new Map()
  for (const type of facts.types ?? []) {
    const key = `${type.file}|${type.name}`
    if (!byFileAndName.has(key)) byFileAndName.set(key, type)
  }

  return {
    facts,
    files,
    modules,
    moduleOf,
    parentOf,
    isDescendant,
    byName,
    byFileAndName,
    duplicated
  }
}

// 数据原子必须在本模块的 Models/ 下（模块路径之后的目录里出现 Models）。
export function isInModels(file, module) {
  if (!module) return false
  const rest = split(file).slice(split(module).length)
  return rest.slice(0, -1).includes('Models')
}

// 接口的祖先闭包（含自己）。
export function interfaceAncestors(name, state, seen = new Set()) {
  const found = new Set()
  const walk = (current) => {
    if (seen.has(current)) return
    seen.add(current)
    found.add(current)
    const type = state.byName.get(current)
    if (!type || type.kind !== INTERFACE) return
    for (const parent of parents(type)) walk(parent)
  }
  walk(name)
  return found
}

// 一个类型实现（直接或沿基类 / 接口继承）的全部项目接口。
export function implementedInterfaces(type, state) {
  const found = new Set()
  const seen = new Set()
  const walk = (name) => {
    if (seen.has(name)) return
    seen.add(name)
    const current = state.byName.get(name)
    if (!current) return
    if (current.kind === INTERFACE) found.add(current.name)
    for (const parent of parents(current)) walk(parent)
  }
  for (const parent of parents(type)) walk(parent)
  return found
}

export function conceptInterfaces(state) {
  return new Map(
    (state.facts.types ?? [])
      .filter((type) => type.kind === INTERFACE && isInInterfaces(type.file) && state.moduleOf(type.file))
      .map((type) => [type.name, type])
  )
}

// 一个类型实现的概念接口里，去掉被别的实现接口继承的那些（只留最具体的）。
export function maximalConcepts(type, concepts, state) {
  const all = [...implementedInterfaces(type, state)].filter((name) => concepts.has(name))
  return all.filter((name) => !all.some((other) => other !== name && interfaceAncestors(other, state).has(name)))
}

const SKIP_DUPLICATED = (duplicated) =>
  `有同名类型（${[...duplicated].join(', ')}）—— 按名字查会串，先消除同名，跳过，不算通过。`

// ---- H1 · 结构 -------------------------------------------------------------
export function checkStructure(facts) {
  const state = layout(facts)
  if (state.modules.length === 0) return { skip: SKIP }

  const findings = []
  for (const type of facts.types ?? []) {
    if (isInInterfaces(type.file)) {
      if (type.kind !== INTERFACE) {
        findings.push(`${type.file}:${type.line}  Interfaces/ 下只能放接口：发现 ${type.kind} ${type.name}`)
      }
      continue
    }
    if (type.containing) continue // 嵌套类型按实现内部处理，归软审
    if (!isDataAtom(type)) continue
    const module = state.moduleOf(type.file)
    if (!module) continue
    if (!isInModels(type.file, module)) {
      findings.push(`${type.file}:${type.line}  数据原子必须放 Models/：${type.kind} ${type.name}`)
    }
  }
  return { findings }
}

// ---- H2 · 概念层引用集合 ---------------------------------------------------
export function checkReferences(facts) {
  const state = layout(facts)
  if (state.modules.length === 0) return { skip: SKIP }
  if (state.duplicated.size > 0) return { skip: SKIP_DUPLICATED(state.duplicated) }

  const concepts = conceptInterfaces(state)
  if (concepts.size === 0) return { skip: 'Interfaces/ 下没有接口可判：跳过，不算通过。' }

  const findings = []
  for (const type of concepts.values()) {
    const module = state.moduleOf(type.file)
    for (const ref of facts.references ?? []) {
      if (ref.from !== type.name || ref.file !== type.file) continue
      const target = state.byName.get(ref.to)
      if (!target) continue // 工程外 / BCL：忽略
      if (target.kind === INTERFACE) continue
      if (isDataAtom(target)) continue
      if (!isClassType(target)) continue
      const targetModule = state.moduleOf(target.file)
      if (targetModule === module) {
        findings.push(
          `${ref.file}:${ref.line}  ${type.name} 引用了本模块的具体类型 ${target.name}（概念层不许依赖本模块实现；外部具体类才可作为已知事实）`
        )
      }
    }
  }
  return { findings }
}

// ---- H3 · 模块单向 ---------------------------------------------------------
export function checkModuleEdges(facts) {
  const state = layout(facts)
  if (state.modules.length === 0) return { skip: SKIP }
  if (state.duplicated.size > 0) return { skip: SKIP_DUPLICATED(state.duplicated) }

  const findings = []
  const edges = new Map() // `${from}>${to}` -> 第一条引用

  for (const ref of facts.references ?? []) {
    const source = state.byFileAndName.get(`${ref.file}|${ref.from}`)
    if (!source) continue
    const target = state.byName.get(ref.to)
    if (!target) continue
    const from = state.moduleOf(source.file)
    if (!from) continue // 组合根 / 边界：允许知道全部
    const to = state.moduleOf(target.file)

    if (!to) {
      findings.push(`${ref.file}:${ref.line}  模块 ${from} 引用了模块外的边界/组合根类型 ${target.name}（反向依赖）`)
      continue
    }
    if (from === to) continue
    if (state.isDescendant(to, from)) {
      findings.push(`${ref.file}:${ref.line}  父模块 ${from} 引用了子模块 ${to} 的类型 ${target.name}（父模块不许知道子模块）`)
      continue
    }
    // 子 → 祖先：允许；非祖先之间：允许，但要进环检查。
    const key = `${from}>${to}`
    if (!edges.has(key)) edges.set(key, { from, to, ref })
  }

  for (const cycle of cyclesOf(state.modules, [...edges.values()])) {
    const edge = cycle.edges[0]
    findings.push(
      `${edge.ref.file}:${edge.ref.line}  模块之间成环：${cycle.modules.join(' → ')}（单向依赖被打破）`
    )
  }

  return { findings }
}

// Tarjan：模块图里大小 > 1 的强连通分量就是环。
function cyclesOf(modules, edges) {
  const index = new Map()
  const low = new Map()
  const stack = []
  const onStack = new Set()
  const adjacency = new Map(modules.map((module) => [module, []]))
  for (const edge of edges) adjacency.get(edge.from)?.push(edge)
  let next = 0
  const found = []

  const visit = (node) => {
    index.set(node, next)
    low.set(node, next)
    next++
    stack.push(node)
    onStack.add(node)
    for (const edge of adjacency.get(node) ?? []) {
      if (!index.has(edge.to)) {
        visit(edge.to)
        low.set(node, Math.min(low.get(node), low.get(edge.to)))
      } else if (onStack.has(edge.to)) {
        low.set(node, Math.min(low.get(node), index.get(edge.to)))
      }
    }
    if (low.get(node) !== index.get(node)) return
    const component = []
    for (;;) {
      const taken = stack.pop()
      onStack.delete(taken)
      component.push(taken)
      if (taken === node) break
    }
    if (component.length < 2) return
    const inside = new Set(component)
    found.push({
      modules: component,
      edges: edges.filter((edge) => inside.has(edge.from) && inside.has(edge.to))
    })
  }

  for (const module of modules) if (!index.has(module)) visit(module)
  return found.filter((cycle) => cycle.edges.length > 0)
}

// ---- H4a · 同接口多实现拆分 ------------------------------------------------
export function checkPlacement(facts) {
  const state = layout(facts)
  if (state.modules.length === 0) return { skip: SKIP }
  if (state.duplicated.size > 0) return { skip: SKIP_DUPLICATED(state.duplicated) }

  const concepts = conceptInterfaces(state)
  if (concepts.size === 0) return { skip: 'Interfaces/ 下没有接口可判：跳过，不算通过。' }

  const byDirectory = new Map() // dir -> [{ type, maximal }]
  for (const type of facts.types ?? []) {
    if (!isClassType(type) || type.isAbstract) continue
    const module = state.moduleOf(type.file)
    if (!module) continue
    if (isInInterfaces(type.file)) continue
    if (isInModels(type.file, module)) continue // Models 是数据域，先豁免（软审另行处理）
    const maximal = maximalConcepts(type, concepts, state)
    if (maximal.length === 0) continue
    const segments = split(type.file)
    const directory = segments.slice(0, -1).join('/')
    if (!byDirectory.has(directory)) byDirectory.set(directory, [])
    byDirectory.get(directory).push({ type, maximal })
  }

  const findings = []
  for (const [directory, entries] of byDirectory) {
    const names = [...new Set(entries.flatMap((entry) => entry.maximal))]
    for (const name of names) {
      const mine = entries.filter((entry) => entry.maximal.includes(name))
      if (mine.length < 2) continue
      // "别的接口实现" = 另一类实现，且不是同一批"多接口类"自己造成的。
      // 一个类同时实现 I 和 J 时，它是 I 的实现，不算 I 旁边的"别的实现"；
      // 那种情况归 GCD 落点软审，不在这里要求拆。
      const mixed = entries.some(
        (entry) => !entry.maximal.includes(name) && entry.maximal.some((other) => other !== name)
      )
      if (!mixed) continue
      const first = mine[0].type
      findings.push(
        `${first.file}:${first.line}  目录 ${directory || '.'}/ 里 ${name} 有 ${mine.length} 个实现，且还混着别的接口实现；这些实现应拆到概念实现目录`
      )
    }
  }
  return { findings }
}

// ---- 规则脚本的统一入口 ----------------------------------------------------
const CHECKS = {
  structure: checkStructure,
  references: checkReferences,
  'module-one-way': checkModuleEdges,
  placement: checkPlacement
}

export function run(name) {
  const check = CHECKS[name]
  if (!check) {
    console.error(`layout.mjs: 未知检查 ${name}`)
    process.exit(2)
  }
  const args = process.argv.slice(2)
  const at = args.indexOf('--facts')
  if (at < 0) {
    console.error('layout.mjs: 缺少 --facts')
    process.exit(2)
  }
  let facts
  try {
    facts = JSON.parse(readFileSync(args[at + 1], 'utf8'))
  } catch (error) {
    console.error(`layout.mjs: 读不到 facts.json：${error.message}`)
    process.exit(2)
  }
  const result = check(facts)
  if (result.skip) {
    console.log(result.skip)
    process.exit(3)
  }
  for (const line of result.findings) console.log(line)
  process.exit(result.findings.length === 0 ? 0 : 1)
}

export const checks = CHECKS
