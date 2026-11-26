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
  '改动范围里没有可推断模块的源文件目录：规则没有判任何东西，skip 不等于通过。没有 Interfaces/ 时，规则会从本次改动文件的共享目录根推断模块；只有连根都推不出来才 skip。'

export const bare = (name) => {
  if (!name) return null
  let text = String(name).trim()
  const generic = text.indexOf('<')
  let arity = 0
  if (generic >= 0) {
    // `IActionExecutor<TConfig>` is a different CLR type from
    // `IActionExecutor`. The facts keep that distinction in the name.
    let depth = 0
    let commas = 0
    let closed = false
    for (let at = generic; at < text.length; at++) {
      const ch = text[at]
      if (ch === '<') depth++
      else if (ch === '>') {
        depth--
        if (depth === 0) { closed = true; break }
      } else if (ch === ',' && depth === 1) commas++
    }
    if (closed) arity = commas + 1
    text = text.slice(0, generic)
  }
  const dot = text.lastIndexOf('.')
  if (dot >= 0) text = text.slice(dot + 1)
  text = text.replace(/\?$/, '').trim()
  if (!text) return null
  return arity > 0 ? `${text}\`${arity}` : text
}

export const parents = (type) => [bare(type.base), ...(type.interfaces ?? []).map(bare)].filter(Boolean)

export const isInterfaceType = (type) => type.kind === INTERFACE

export const isClassType = (type) => CLASS.has(type.kind)

export const isDataAtom = (type) => DATA_ATOM.has(type.kind)

export const isInInterfaces = (file, module) => {
  let segments = split(file)
  if (module && module !== '.') segments = segments.slice(split(module).length)
  for (let at = 0; at < segments.length - 1; at++) if (segments[at] === 'Interfaces') return true
  return false
}

function split(file) {
  return String(file).replaceAll('\\', '/').split('/').filter(Boolean)
}

const normalizeDir = (dir) => String(dir ?? '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')

const parentDirOfDir = (dir) => {
  const parts = split(dir)
  parts.pop()
  return parts.join('/')
}

const moduleDir = (module) => (module === '.' ? '' : module)
const moduleName = (dir) => (dir === '' ? '.' : dir)

const parentDir = (file) => split(file).slice(0, -1).join('/')

function commonDirPrefix(dirs) {
  if (dirs.length === 0) return []
  const parts = dirs.map(split)
  const common = []
  for (let at = 0; ; at++) {
    const value = parts[0][at]
    if (value === undefined || parts.some((entry) => entry[at] !== value)) break
    common.push(value)
  }
  return common
}

// When a project has no Interfaces/ yet, infer modules from the files under
// review. The old project may be all red, but only the changed files are judged
// by the session scope; grouping only the changed files keeps the inferred
// modules small and relevant.
//
//   Game/.../Modules/{Rule,Item,Hero}/...  -> three module roots
//   one module, deeper files               -> the first segment after Modules
//
// Interface declarations under a changed file's Interfaces/ directory are
// stronger evidence: the directory above Interfaces/ is a module (or submodule).
// A forest root that is merely a descendant of such a module is dropped, so
// Interfaces/ at the module root does not turn its own subdirectories into
// sibling modules.
export function inferModules(facts, changedFiles) {
  const known = new Set(facts.files ?? (facts.types ?? []).map((type) => type.file))
  const files = Array.isArray(changedFiles)
    ? changedFiles.filter((file) => known.has(file))
    : [...known]
  if (files.length === 0) return []

  const dirs = [...new Set(files.map(parentDir).filter(Boolean))]
  if (dirs.length === 0) return []

  const modules = new Set()
  const interfaceRoots = new Set()
  for (const type of facts.types ?? []) {
    if (type.kind !== INTERFACE || !files.includes(type.file)) continue
    const segments = split(type.file)
    const at = segments.lastIndexOf('Interfaces')
    if (at > 0) interfaceRoots.add(segments.slice(0, at).join('/'))
  }

  const common = commonDirPrefix(dirs)
  const marker = common.lastIndexOf('Modules') >= 0 ? common.lastIndexOf('Modules') : common.lastIndexOf('Module')
  const moduleBase = marker >= 0 && marker + 1 < common.length ? common.slice(0, marker + 2).join('/') : null

  if (moduleBase) {
    modules.add(moduleBase)
  } else {
    const firsts = [...new Set(dirs.map((dir) => split(dir).slice(common.length).filter(Boolean)[0]))].filter(Boolean)
    if (firsts.length > 0) {
      for (const first of firsts) modules.add([...common, first].join('/'))
    } else if (common.length > 0) {
      modules.add(common.join('/'))
    }
  }

  for (const root of interfaceRoots) modules.add(root)

  // An interface-derived module is already inside its parent module. Keep the
  // parent, but do not turn a normal child directory into a sibling module.
  const inferredRoots = [...interfaceRoots]
  for (const module of [...modules]) {
    if (inferredRoots.includes(module)) continue
    if (inferredRoots.some((root) => module.startsWith(`${root}/`))) modules.delete(module)
  }

  return [...modules].filter(Boolean).sort((left, right) => left.length - right.length)
}

// A module is a directory with an Interfaces/ child. Empty Interfaces counts:
// the directory fact list is the source of truth, not the .cs file list.
function directoriesOf(facts, files) {
  const dirs = new Set((facts.directories ?? []).map(normalizeDir))
  dirs.add('')
  for (const file of files) {
    let dir = parentDirOfDir(file)
    while (true) {
      dirs.add(dir)
      if (dir === '') break
      dir = parentDirOfDir(dir)
    }
  }
  return dirs
}

export function layout(facts, changedFiles) {
  const files = facts.files ?? [...new Set((facts.types ?? []).map((type) => type.file))]
  const directories = directoriesOf(facts, files)
  const moduleDirs = [...directories].filter((dir) => directories.has(dir === '' ? 'Interfaces' : `${dir}/Interfaces`))
  const declared = moduleDirs.map(moduleName).sort((left, right) => left.length - right.length)
  const inferred = declared.length === 0
  const rawModules = inferred ? inferModules(facts, changedFiles) : declared
  const modules = inferred ? rawModules.map(moduleName) : rawModules

  const moduleOf = (file) => {
    let found = null
    for (const module of modules) {
      if (module === '.') continue
      const dir = moduleDir(module)
      if (file === dir || file.startsWith(`${dir}/`)) found = module
    }
    if (!found && modules.includes('.')) found = '.'
    return found
  }

  const isDescendant = (module, ancestor) => {
    if (module === ancestor) return false
    if (ancestor === '.') return module !== '.'
    if (module === '.') return false
    return module.startsWith(`${ancestor}/`)
  }

  const parentOf = (module) => {
    if (module === '.') return null
    let found = modules.includes('.') ? '.' : null
    for (const other of modules) {
      if (other === '.' || other === module) continue
      if (isDescendant(module, other)) found = other
    }
    return found
  }

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
    directories,
    modules,
    declared,
    inferred,
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
  if (module == null) return false
  const rest = module === '.' ? split(file) : split(file).slice(split(module).length)
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
export function checkStructure(facts, changedFiles) {
  const state = layout(facts, changedFiles)
  if (state.modules.length === 0) return { skip: SKIP }

  const findings = []
  for (const type of facts.types ?? []) {
    const module = state.moduleOf(type.file)
    if (type.kind === INTERFACE) {
      if (module && !isInInterfaces(type.file, module)) {
        findings.push(`${type.file}:${type.line}  接口 ${type.name} 不在 Interfaces/ 下（接口必须放模块的 Interfaces/）`)
      }
      continue
    }
    if (module && isInInterfaces(type.file, module)) {
      findings.push(`${type.file}:${type.line}  Interfaces/ 下只能放接口：发现 ${type.kind} ${type.name}`)
      continue
    }
    if (type.containing) continue // 嵌套类型按实现内部处理，归软审
    if (!isDataAtom(type)) continue
    if (module == null) continue
    if (!isInModels(type.file, module)) {
      findings.push(`${type.file}:${type.line}  数据原子必须放 Models/：${type.kind} ${type.name}`)
    }
  }
  return { findings }
}

// ---- H2 · 概念层引用集合 ---------------------------------------------------
export function checkReferences(facts, changedFiles) {
  const state = layout(facts, changedFiles)
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
export function checkModuleEdges(facts, changedFiles) {
  const state = layout(facts, changedFiles)
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
    if (from == null) continue // 组合根 / 边界：允许知道全部
    const to = state.moduleOf(target.file)

    if (to == null) {
      findings.push(`${ref.file}:${ref.line}  模块 ${from} 引用了模块外的边界/组合根类型 ${target.name}（反向依赖）`)
      continue
    }
    if (from === to) continue
    if (state.isDescendant(to, from)) {
      findings.push(`${ref.file}:${ref.line}  父模块 ${from} 引用了子模块 ${to} 的类型 ${target.name}（父模块不许知道子模块）`)
      continue
    }
    if (state.isDescendant(from, to)) {
      // A child module may only look upward at the ancestor's interface
      // surface. Implementations, Models, Config DTOs and concrete aggregate
      // roots are not part of that surface.
      if (target.kind !== INTERFACE || !isInInterfaces(target.file, to)) {
        findings.push(
          `${ref.file}:${ref.line}  子模块 ${from} 引用了祖先模块 ${to} 的${target.kind} ${target.name}（子模块只能引用祖先 Interfaces/ 下的接口）`
        )
      }
      continue
    }
    // 非祖先之间：允许，但要进环检查。
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

// ---- H5 · directory units --------------------------------------------------
// The unit is a file or a directory entry under one parent. A directory unit
// includes its whole subtree. `Player/Character.cs` and `Player/Interfaces`
// (including ICharacter.cs under it) are siblings under Player.

const parentDirectory = (file) => split(file).slice(0, -1).join('/')

const isUnder = (file, directory) => {
  if (directory === '') return file !== ''
  return file === directory || file.startsWith(`${directory}/`)
}

function knownReferenceEdges(facts, state) {
  const edges = []
  const seen = new Set()
  // Directory rules treat struct/record struct as value data, not as a
  // directory-level collaborator. Type-level cycles that go through a struct
  // are still covered by META_REF_ACYCLIC_02; this filter is deliberately local to M rules.
  const isStructData = (type) => type?.kind === 'struct' || type?.kind === 'recordstruct'
  for (const ref of facts.references ?? []) {
    if (!ref.from || !ref.to || ref.from === ref.to) continue
    const source = state.byName.get(ref.from)
    const target = state.byName.get(ref.to)
    if (!source || !target) continue
    if (isStructData(source) || isStructData(target)) continue
    const key = `${ref.from}|${ref.to}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ from: ref.from, to: ref.to, file: ref.file, line: ref.line, source, target })
  }
  return edges
}

function uniquePlaces(edges) {
  const places = []
  for (const edge of edges) {
    const place = `${edge.ref.file}:${edge.ref.line}`
    if (!places.includes(place)) places.push(place)
  }
  return places
}

// META_DIR_CLASS_01: every strongly connected component of the type reference graph must be
// co-located in one directory. Same-directory file cycles are allowed; any SCC
// spanning directories is red. There is no special root exemption: file cycles
// must not cross directories.
export function checkSccSameDirectory(facts) {
  const state = layout(facts)
  if (state.duplicated.size > 0) return { skip: SKIP_DUPLICATED(state.duplicated) }

  const edges = knownReferenceEdges(facts, state)
  const components = cyclesOf([...state.byName.keys()], edges)
  const findings = []
  for (const component of components) {
    const types = component.modules.map((name) => state.byName.get(name)).filter(Boolean)
    const directories = [...new Set(types.map((type) => parentDirectory(type.file)))]
    if (directories.length <= 1) continue
    const places = types.map((type) => `${type.file}:${type.line}`).join('  ')
    findings.push(`${places}  SCC 跨目录：${directories.map((dir) => dir || '.').join(' / ')}`)
  }
  return { findings }
}

// META_DIR_ACYCLIC_01: find the lowest common ancestor directory of the source
// and target, then take the first divergent segment under that ancestor:
//   - a direct file is a file unit;
//   - a directory subtree is a directory unit.
// File-file edges are SCC's job and never enter this graph. All remaining unit
// edges are checked as one full SCC; there is no root exemption.
export function checkSiblingAcyclic(facts) {
  const state = layout(facts)
  if (state.duplicated.size > 0) return { skip: SKIP_DUPLICATED(state.duplicated) }

  const units = new Set()
  const byEdge = new Map()

  const unitAt = (file, dir, commonParts, rel) => {
    if (rel.length === 0) return `file:${file}`
    return `dir:${[...commonParts, rel[0]].filter(Boolean).join('/')}`
  }

  for (const edge of knownReferenceEdges(facts, state)) {
    const sourceDir = parentDirectory(edge.source.file)
    const targetDir = parentDirectory(edge.target.file)
    if (sourceDir === targetDir) continue

    const sourceParts = split(sourceDir)
    const targetParts = split(targetDir)
    let common = 0
    while (
      common < sourceParts.length &&
      common < targetParts.length &&
      sourceParts[common] === targetParts[common]
    ) common++

    const commonParts = sourceParts.slice(0, common)
    const fromUnit = unitAt(edge.source.file, sourceDir, commonParts, sourceParts.slice(common))
    const toUnit = unitAt(edge.target.file, targetDir, commonParts, targetParts.slice(common))
    if (fromUnit === toUnit) continue
    // File-to-file cycles belong to META_DIR_CLASS_01. M-05 only judges edges
    // that contain a directory unit.
    if (fromUnit.startsWith('file:') && toUnit.startsWith('file:')) continue

    units.add(fromUnit)
    units.add(toUnit)
    const key = `${fromUnit}>${toUnit}`
    if (!byEdge.has(key)) byEdge.set(key, { from: fromUnit, to: toUnit, ref: edge })
  }

  const findings = []
  for (const component of cyclesOf([...units], [...byEdge.values()])) {
    const places = uniquePlaces(component.edges)
    findings.push(`${places.join('  ')}  目录单元成环：${component.modules.join(' -> ')}`)
  }
  return { findings }
}

// ---- H4a · 同接口多实现拆分 ------------------------------------------------
export function checkPlacement(facts, changedFiles) {
  const state = layout(facts, changedFiles)
  if (state.modules.length === 0) return { skip: SKIP }
  if (state.duplicated.size > 0) return { skip: SKIP_DUPLICATED(state.duplicated) }

  const concepts = conceptInterfaces(state)
  if (concepts.size === 0) {
    // With inferred modules there may simply be no concept interface yet. That is
    // not an optional input: META_DIR_CLASS_02 already reports interfaces outside Interfaces/.
    return state.inferred ? { findings: [] } : { skip: 'Interfaces/ 下没有接口可判：跳过，不算通过。' }
  }

  const byDirectory = new Map() // dir -> [{ type, maximal }]
  for (const type of facts.types ?? []) {
    if (!isClassType(type) || type.isAbstract) continue
    const module = state.moduleOf(type.file)
    if (module == null) continue
    if (isInInterfaces(type.file, module)) continue
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
  placement: checkPlacement,
  'scc-same-directory': checkSccSameDirectory,
  'sibling-acyclic': checkSiblingAcyclic
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
  const changedAt = args.indexOf('--changed')
  let changedFiles
  if (changedAt >= 0) {
    try {
      changedFiles = JSON.parse(readFileSync(args[changedAt + 1], 'utf8'))
    } catch (error) {
      console.error(`layout.mjs: 读不到 changed.json：${error.message}`)
      process.exit(2)
    }
  }
  const result = check(facts, changedFiles)
  if (result.skip) {
    console.log(result.skip)
    process.exit(3)
  }
  for (const line of result.findings) console.log(line)
  process.exit(result.findings.length === 0 ? 0 : 1)
}

export const checks = CHECKS
