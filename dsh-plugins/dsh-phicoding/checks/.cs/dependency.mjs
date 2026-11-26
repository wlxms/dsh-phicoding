// D-family: dependency rules.
//
// The three relations are deliberately separate:
//   uses     any mention in source                     -> META_REF_LEVEL_01 (root implementations only)
//   holds    field/property/event stored in a type    -> SOFT_DESIGN_01 (root implementations only)
//   creates  explicit new                            -> SOFT_DESIGN_02/META_REF_ACYCLIC_01
//
// A decorator holds IWeapon (interface), so it appears in holds but not as a
// concrete edge. A state-machine host holds IState and creates Idle/Running;
// only the creation edge is concrete. This is why the family can allow both
// patterns without a declaration.

import { bare } from '../layout.mjs'
import { cyclesOf, duplicateSkip, parents, waives } from './model.mjs'

const isInterface = (type) => type?.kind === 'interface'
const isAbstract = (type) => Boolean(type) && !isInterface(type) && type.isAbstract === true

function inherits(byName, type, ancestor, cache, seen = new Set()) {
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
    if (up && inherits(byName, up, ancestor, cache, seen)) {
      hit = true
      break
    }
  }
  cache.set(key, hit)
  return hit
}

function trespass(b, c) {
  if (isInterface(b)) return isInterface(c) ? null : `引用了接口 ${b.name}，又引用了它的非接口子类 ${c.name}`
  if (isAbstract(b)) return isAbstract(c) ? null : `引用了抽象类 ${b.name}，又引用了它的具体子类 ${c.name}`
  return `引用了具体类 ${b.name}，又引用了它的子类 ${c.name}`
}

// META_REF_LEVEL_01: reference level. Required contract references (interfaces and base
// contract surfaces, recursively) are the baseline. Only the implementation's
// extra references (delta) are checked. This makes the rule global and hard
// without punishing types the contract forced the implementation to name. An explicit
// waive is an escape hatch for engine/plumbing constraints (for example a UE subsystem
// that can only be looked up by concrete type); it excuses only the annotated type.
export function checkReferenceDegree(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }

  const cache = new Map()
  const hits = []
  const excused = {}
  const creationAt = new Set(model.creates.map((create) => `${create.from}|${create.to}|${create.line}`))

  for (const owner of model.facts.types ?? []) {
    if (owner.kind === 'interface') continue

    const why = waives(owner, ['META_REF_LEVEL_01', 'D-01', '0750'])
    if (why) {
      excused[why] = (excused[why] ?? 0) + 1
      continue
    }

    const required = model.requiredReferences(owner)
    const targets = new Map()
    for (const ref of model.references) {
      if (ref.from !== owner.name || ref.from === ref.to) continue
      // A construction edge is SOFT_DESIGN_02's subject; it is not a reference-level use.
      if (creationAt.has(`${ref.from}|${ref.to}|${ref.line}`)) continue
      if (!targets.has(ref.to)) targets.set(ref.to, ref)
    }

    const requiredTargets = [...required]
      .map((name) => [name, model.byName.get(name)])
      .filter(([, type]) => Boolean(type))
    const delta = new Map([...targets].filter(([name]) => !required.has(name)))
    if (delta.size === 0) continue

    for (const [childName, childRef] of delta) {
      const child = model.byName.get(childName)
      if (!child) continue
      if (model.sameUnit(owner, child)) continue

      // New reference vs the ceiling established by required contract types.
      for (const [baseName, base] of requiredTargets) {
        if (!inherits(model.byName, child, baseName, cache)) continue
        const reason = trespass(base, child)
        if (!reason) continue
        hits.push(`${childRef.file}:${childRef.line}  ${owner.name} ${reason}（契约 ${baseName}）`)
      }

      // Two new references in the same family are still a level leak.
      for (const [otherName] of delta) {
        if (otherName === childName) continue
        const other = model.byName.get(otherName)
        if (!other) continue
        if (!inherits(model.byName, child, otherName, cache)) continue
        const reason = trespass(other, child)
        if (!reason) continue
        hits.push(`${childRef.file}:${childRef.line}  ${owner.name} ${reason}（新增引用 ${otherName}）`)
      }
    }
  }

  const total = Object.values(excused).reduce((sum, count) => sum + count, 0)
  const notes = []
  if (hits.length === 0 && total > 0) {
    const detail = Object.entries(excused).map(([why, count]) => `${why} ${count}`).join(' / ')
    notes.push(`豁免 ${total} 个类型（${detail}）`)
  }
  return { findings: hits, notes }
}

// SOFT_DESIGN_01: a root implementation / aggregate root field/property/event may store
// interfaces, pure data or external facts. Storing a concrete implementation
// is the leak; construction is a separate act and belongs to SOFT_DESIGN_02. Multiple
// root implementations are allowed and each one is checked independently.
export function checkNoConcreteHold(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }
  if (model.conceptRoots.size === 0) {
    return { skip: '没有可判定的概念根：根实现未知，跳过，不算通过。' }
  }
  if (model.rootImplementations.size === 0) {
    return { skip: '概念根没有实现：根实现未知，跳过，不算通过。' }
  }

  const findings = []
  const excused = {}

  for (const owner of model.facts.types ?? []) {
    if (!model.isRootImplementation(owner.name) && !model.isAggregateRoot(owner.name)) continue
    const why = waives(owner, ['SOFT_DESIGN_01', '0750'])
    if (why) {
      excused[why] = (excused[why] ?? 0) + 1
      continue
    }

    for (const hold of model.holds) {
      if (hold.from !== owner.name) continue
      const target = model.byName.get(hold.to)
      if (!target) continue
      const targetRole = model.roleOf(target)
      if (!['concrete', 'invalid', 'root'].includes(targetRole)) continue
      if (model.sameUnit(owner, target)) continue
      findings.push(
        `${hold.file}:${hold.line}  ${owner.name} 的成员 ${hold.member} 持有具体实现 ${target.name}（字段/属性只能保存接口或纯数据）`
      )
    }
  }

  for (const finding of findings) {
    // findings are printed by runCheck
  }
  const total = Object.values(excused).reduce((sum, count) => sum + count, 0)
  const notes = []
  if (findings.length === 0 && total > 0) {
    const detail = Object.entries(excused).map(([why, count]) => `${why} ${count}`).join(' / ')
    notes.push(`豁免 ${total} 个类型（${detail}）`)
  }
  return { findings, notes }
}

// SOFT_DESIGN_02: explicit construction of a concrete project type is allowed at one
// construction site. A composition root or extension may always do it; otherwise
// exactly one non-root class must be the creator of a given target.
export function checkConstructionBoundary(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }
  if (!model.hasCreationFacts) {
    return { skip: '底座没有提供 creations 事实：构造边界判不了，跳过，不算通过。' }
  }

  const creators = new Map()
  const findings = []
  for (const create of model.creates) {
    const source = model.byName.get(create.from)
    const target = model.byName.get(create.to)
    if (!source || !target) continue
    const targetRole = model.roleOf(target)
    if (targetRole === 'data' || targetRole === 'interface') continue
    if (model.isRoot(source.name) || model.roleOf(source) === 'extension') continue
    if (model.roleOf(source) === 'utility') {
      findings.push(`${create.file}:${create.line}  工具类 ${source.name} 不应构造具体类型 ${target.name}`)
      continue
    }
    if (!creators.has(target.name)) creators.set(target.name, new Set())
    creators.get(target.name).add(source.name)
  }

  for (const [target, sources] of creators) {
    if (sources.size <= 1) continue
    const first = [...sources][0]
    findings.push(`${model.byName.get(first).file}:${model.byName.get(first).line}  具体类型 ${target} 有 ${sources.size} 个构造点（${[...sources].join(', ')}）；构造必须收敛到一个 owner/组合根`)
  }
  return { findings }
}

// META_REF_ACYCLIC_01: the concrete implementation graph must be acyclic. Interface references,
// interface self-reference and nested same-unit types do not enter this graph.
export function checkConcreteAcyclic(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }

  const edges = []
  for (const hold of model.holds) {
    if (!model.isConcreteClass(hold.from) || !model.isConcreteClass(hold.to)) continue
    edges.push({ from: hold.from, to: hold.to, file: hold.file, line: hold.line })
  }
  if (model.hasCreationFacts) {
    for (const create of model.creates) {
      if (!model.isConcreteClass(create.from) || !model.isConcreteClass(create.to)) continue
      edges.push({ from: create.from, to: create.to, file: create.file, line: create.line })
    }
  }

  const cycles = cyclesOf(edges)
  const findings = []
  for (const cycle of cycles) {
    // A cycle confined to one nesting tree is one design unit, not a level
    // inversion. A cycle that leaves the tree is still reported.
    if (new Set(cycle.names.map((name) => model.outerOf(name))).size === 1) continue
    const rest = cycle.places.slice(1).join('  ')
    findings.push(`${cycle.places[0] ?? ''}  CYCLE  ${cycle.text}${rest ? `   [${rest}]` : ''}`)
  }
  return { findings }
}

// META_REF_ACYCLIC_02: a struct is still a dependency node. It may hold interfaces and be
// referenced by interfaces, but it may not close a reference cycle:
// IA -> struct -> IB -> IA is a cycle even though each edge looks legal in
// isolation. Only cycles containing a struct report here; pure interface cycles
// remain a soft review, and concrete-class cycles stay in META_REF_ACYCLIC_01.
export function checkStructReferenceAcyclic(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }

  const edges = []
  const seen = new Set()
  for (const ref of model.references) {
    if (!ref.source || !ref.target) continue
    if (ref.from === ref.to) continue
    const key = `${ref.from}|${ref.to}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ from: ref.from, to: ref.to, file: ref.file, line: ref.line })
  }

  const isStruct = (name) => {
    const type = model.byName.get(name)
    return type?.kind === 'struct' || type?.kind === 'recordstruct'
  }

  const findings = []
  for (const cycle of cyclesOf(edges)) {
    if (!cycle.names.some(isStruct)) continue
    // A cycle confined to one nesting tree is one design unit. The struct rule
    // follows the same escape hatch as META_REF_ACYCLIC_01; leaving the tree is still red.
    if (new Set(cycle.names.map((name) => model.outerOf(name))).size === 1) continue
    const rest = cycle.places.slice(1).join('  ')
    findings.push(`${cycle.places[0] ?? ''}  CYCLE  ${cycle.text}${rest ? `   [${rest}]` : ''}`)
  }
  return { findings }
}

export { bare }
