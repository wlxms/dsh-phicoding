// Shared model for C# rules.
//
// The base prints syntax facts. This file turns them into the three things rules
// are allowed to talk about:
//
//   roles       Data / Interface / Abstract / Concrete / Utility / Extension / Root
//   features    ConceptRoot / RootImplementation / AggregateRoot / Factory
//   relations   implements / uses / holds / creates
//   graphs      contract, implementation, module
//
// No rule parses source or re-derives a role. If a rule needs a new fact, the
// fact is added here once and every rule gets it.

import { readFileSync } from 'node:fs'
import { bare, implementedInterfaces, isInInterfaces, layout } from '../layout.mjs'

const DATA_KINDS = new Set(['enum', 'struct', 'record', 'recordstruct', 'class'])
const HOLD_MEMBER_KINDS = new Set(['field', 'property', 'event', 'eventfield'])
const BEHAVIOR_MEMBER_KINDS = new Set([
  'method',
  'indexer',
  'operator',
  'conversionoperator',
  'destructor',
  'event',
  'eventfield'
])

export const isInterface = (type) => type?.kind === 'interface'

export const parents = (type) => [bare(type?.base), ...(type?.interfaces ?? []).map(bare)].filter(Boolean)

const split = (file) => String(file ?? '').replaceAll('\\', '/').split('/').filter(Boolean)

const getOuter = (type, byName) => {
  let current = type
  const guard = new Set()
  for (;;) {
    if (!current?.containing || guard.has(current.name)) break
    guard.add(current.name)
    const up = byName.get(current.containing)
    if (!up) break
    current = up
  }
  return current?.name ?? null
}

const isBehaviorMember = (member) => {
  if (!member) return false
  if (BEHAVIOR_MEMBER_KINDS.has(member.kind)) return true
  if (member.kind === 'property') return member.hasBody === true
  return false
}

const hasBehavior = (type) => (type.members ?? []).some(isBehaviorMember)

const dataShape = (type) => {
  if (!type) return false
  // A struct is a value type and is always data in this model. Its methods are
  // behavior to be judged by a separate struct-behavior rule, not by turning it
  // into a class-shaped concept with an interface. Likewise an enum is data.
  if (type.kind === 'struct' || type.kind === 'recordstruct' || type.kind === 'enum') return true
  if (type.kind === 'interface' || type.isStatic || type.isAbstract) return false
  if (!DATA_KINDS.has(type.kind)) return false
  if (type.kind === 'class' && !type.isSealed) return false
  if (parents(type).length > 0) return false
  return !hasBehavior(type)
}

// Names in a type expression that are project types. We deliberately do not try
// to resolve `List<Lexer>`: the known names are enough to answer "does this
// field mention a concrete project type?", and external/BCL names stay unknown.
const knownNamesIn = (text, byName) => {
  const found = new Set()
  for (const match of String(text ?? '').matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    if (byName.has(match[0])) found.add(match[0])
  }
  return found
}

export function buildModel(facts, changedFiles) {
  const state = layout(facts, changedFiles)
  const byName = state.byName
  // Module rules may infer roots from the changed files, but C/D role semantics
  // stay on declared Interfaces/ modules: a project that has not adopted the
  // module standard should not suddenly lose its concrete-class exemptions.
  const modules = state.declared
  const duplicates = state.duplicated

  const outerOf = (typeOrName) => {
    const type = typeof typeOrName === 'string' ? byName.get(typeOrName) : typeOrName
    return type ? getOuter(type, byName) : null
  }

  const sameUnit = (left, right) => {
    const a = typeof left === 'string' ? left : left?.name
    const b = typeof right === 'string' ? right : right?.name
    return Boolean(a && b && outerOf(a) === outerOf(b))
  }

  const implemented = (type) => implementedInterfaces(type, state)
  // The facts base is syntax-only. An external base class is not in byName, so
  // its interfaces cannot be seen; a rule must not turn that gap into a red.
  const hasUnknownBase = (type) => {
    const seen = new Set()
    let current = type
    while (current) {
      if (seen.has(current.name)) return false
      seen.add(current.name)
      const base = bare(current.base)
      if (!base) return false
      const parent = byName.get(base)
      if (!parent) return true
      current = parent
    }
    return false
  }

  const isConfigPath = (file) => split(file).some((segment) => segment === 'Config' || segment === 'Configs')
  const moduleOf = (file) => state.moduleOf(file)
  const isExternalPath = (file) => moduleOf(file) == null || isConfigPath(file)
  const isValueData = (type) => ['struct', 'recordstruct', 'enum'].includes(type?.kind)
  const isPureDto = (type) => {
    if (!type || !['class', 'record'].includes(type.kind)) return false
    if (!isExternalPath(type.file)) return false
    if (implemented(type).size > 0) return false
    // Config DTOs are often generated, but behavior still disqualifies a class
    // from being a pure data fact unless it is a true data shape.
    return dataShape(type)
  }
  const isModuleDataClass = (type) => {
    if (!type || !['class', 'record'].includes(type.kind)) return false
    if (isExternalPath(type.file)) return false
    return dataShape(type)
  }

  // Interface graph per module. A concept root is a source (in-degree 0);
  // multiple roots are allowed. Roots are not a global uniqueness invariant.
  const conceptRoots = new Map()
  const conceptRootNames = new Set()
  const interfaceNodes = new Map()
  for (const type of facts.types ?? []) {
    if (type.kind !== 'interface') continue
    const module = state.moduleOf(type.file)
    if (module == null || !isInInterfaces(type.file, module)) continue
    interfaceNodes.set(type.name, type)
  }
  const incoming = new Set()
  for (const ref of facts.references ?? []) {
    const source = byName.get(ref.from)
    const target = byName.get(ref.to)
    if (!source || !target) continue
    if (source.kind !== 'interface' || target.kind !== 'interface') continue
    if (!interfaceNodes.has(source.name) || !interfaceNodes.has(target.name)) continue
    if (state.moduleOf(source.file) !== state.moduleOf(target.file)) continue
    incoming.add(target.name)
  }
  for (const [name, type] of interfaceNodes) {
    if (incoming.has(name)) continue
    const module = state.moduleOf(type.file)
    if (!conceptRoots.has(module)) conceptRoots.set(module, new Set())
    conceptRoots.get(module).add(name)
    conceptRootNames.add(name)
  }

  // A root implementation is a concrete class in the root's module that
  // implements that root interface. Multiple implementations are allowed; each
  // one is judged as a root implementation on its own.
  const rootImplementations = new Set()
  const aggregateRoots = new Set()
  for (const type of facts.types ?? []) {
    if (!['class', 'record'].includes(type.kind) || type.isAbstract || dataShape(type)) continue
    const module = state.moduleOf(type.file)
    if (module == null) continue
    const roots = conceptRoots.get(module)
    if (!roots) continue
    const implementedByType = implemented(type)
    if ([...roots].some((root) => implementedByType.has(root))) {
      rootImplementations.add(type.name)
      // The four-root model treats a concept-root implementation as the
      // aggregate implementation of that root. Multiple aggregate roots are
      // legal and each one is checked independently.
      aggregateRoots.add(type.name)
    }
  }

  const data = new Set()
  const utility = new Set()
  const extension = new Set()
  const roles = new Map()

  const roleOf = (type) => {
    if (!type) return 'unknown'
    if (roles.has(type.name)) return roles.get(type.name)
    let role
    if (isInterface(type)) role = 'interface'
    else if (dataShape(type)) role = 'data'
    else if (type.isStatic && (type.members ?? []).some((member) => member.extensionOf)) role = 'extension'
    else if (type.isStatic && /(?:Utility|Util|Helper)$/.test(type.name)) role = 'utility'
    else if (type.isStatic) role = 'static'
    else if (modules.length > 0 && state.moduleOf(type.file) == null) role = 'root'
    else if (type.isAbstract) role = 'abstract'
    else if (implemented(type).size > 0) role = 'concrete'
    else role = 'invalid'
    roles.set(type.name, role)
    if (role === 'data') data.add(type.name)
    if (role === 'utility') utility.add(type.name)
    if (role === 'extension') extension.add(type.name)
    return role
  }

  for (const type of facts.types ?? []) roleOf(type)

  const holds = []
  for (const owner of facts.types ?? []) {
    for (const member of owner.members ?? []) {
      if (!HOLD_MEMBER_KINDS.has(member.kind) || !member.type) continue
      for (const target of knownNamesIn(member.type, byName)) {
        if (target === owner.name) continue
        holds.push({
          from: owner.name,
          to: target,
          file: owner.file,
          line: member.line,
          member: member.name,
          isStatic: member.isStatic === true
        })
      }
    }
  }

  const creates = []
  for (const owner of facts.types ?? []) {
    for (const creation of owner.creations ?? []) {
      if (!byName.has(creation.to)) continue
      creates.push({
        from: owner.name,
        to: creation.to,
        file: owner.file,
        line: creation.line
      })
    }
  }

  const references = (facts.references ?? []).map((ref) => ({
    ...ref,
    target: byName.get(ref.to) ?? null,
    source: byName.get(ref.from) ?? null
  }))

  // Factory is a feature, not a declaration: it constructs concrete types, but
  // only through creates/type-token; it does not store concrete instances and
  // does not expose concrete types in its members.
  const factoryNames = new Set()
  const creationAt = new Set(creates.map((create) => `${create.from}|${create.to}|${create.line}`))
  for (const type of facts.types ?? []) {
    if (!['class', 'record'].includes(type.kind) || type.isAbstract || dataShape(type)) continue
    const ownCreations = creates.filter((create) => create.from === type.name)
    if (ownCreations.length === 0) continue
    const isConcreteTarget = (name) => ['concrete', 'invalid', 'root'].includes(roleOf(byName.get(name)))
    const badHold = holds.some((hold) => hold.from === type.name && isConcreteTarget(hold.to))
    const badUse = references.some(
      (ref) =>
        ref.from === type.name &&
        isConcreteTarget(ref.to) &&
        ref.kind !== 'type-argument' &&
        ref.kind !== 'type-token' &&
        !creationAt.has(`${ref.from}|${ref.to}|${ref.line}`)
    )
    const badMember = (type.members ?? []).some(
      (member) =>
        member.type &&
        [...knownNamesIn(member.type, byName)].some((name) => isConcreteTarget(name) && name !== type.name)
    )
    if (!badHold && !badUse && !badMember) factoryNames.add(type.name)
  }

  // Contract surface for META_REF_LEVEL_01. Only declarations needed to satisfy an
  // interface/base contract are baseline; base implementation bodies and
  // private/static base members are not.
  const memberContractNames = (member) => {
    const names = new Set()
    if (member.type) for (const name of knownNamesIn(member.type, byName)) names.add(name)
    for (const parameter of member.parameters ?? []) {
      for (const name of knownNamesIn(parameter, byName)) names.add(name)
    }
    return names
  }
  const isBaseContractMember = (member) => {
    const access = member.access ?? 'public'
    if (access === 'private') return false
    if (member.isStatic === true) return false
    return true
  }
  const interfaceContract = (name, seen) => {
    const found = new Set()
    const type = byName.get(name)
    if (!type || type.kind !== 'interface' || seen.has(name)) return found
    seen.add(name)
    found.add(name)
    for (const parent of parents(type)) {
      found.add(parent)
      for (const one of interfaceContract(parent, seen)) found.add(one)
    }
    for (const member of type.members ?? []) for (const one of memberContractNames(member)) found.add(one)
    return found
  }
  const baseContract = (name, seen) => {
    const found = new Set()
    const type = byName.get(name)
    if (!type || type.kind === 'interface' || seen.has(name)) return found
    seen.add(name)
    found.add(name)
    for (const parent of parents(type)) {
      found.add(parent)
      const parentType = byName.get(parent)
      if (parentType?.kind === 'interface') {
        for (const one of interfaceContract(parent, new Set())) found.add(one)
      } else {
        for (const one of baseContract(parent, seen)) found.add(one)
      }
    }
    for (const member of type.members ?? []) {
      if (!isBaseContractMember(member)) continue
      for (const one of memberContractNames(member)) found.add(one)
    }
    return found
  }
  const requiredReferences = (owner) => {
    const required = new Set()
    // Implementing `IActionExecutor<LogActionConfig>` requires the concrete
    // type argument itself; it is an implementation choice demanded by the
    // contract, not a free extra reference.
    if (owner.base) for (const name of knownNamesIn(owner.base, byName)) required.add(name)
    for (const text of owner.interfaces ?? []) {
      for (const name of knownNamesIn(text, byName)) required.add(name)
    }
    for (const name of implemented(owner)) {
      required.add(name)
      for (const one of interfaceContract(name, new Set())) required.add(one)
    }
    let base = bare(owner.base)
    const seenBases = new Set()
    while (base) {
      required.add(base)
      for (const one of baseContract(base, seenBases)) required.add(one)
      const baseType = byName.get(base)
      if (!baseType) break
      base = bare(baseType.base)
    }
    return required
  }

  return {
    facts,
    state,
    byName,
    modules,
    duplicates,
    conceptRoots,
    rootImplementations,
    aggregateRoots,
    factories: factoryNames,
    isConceptRoot: (name) => conceptRootNames.has(name),
    isRootImplementation: (name) => rootImplementations.has(name),
    isAggregateRoot: (name) => aggregateRoots.has(name),
    isFactory: (name) => factoryNames.has(name),
    requiredReferences,
    roleOf,
    data,
    utility,
    extension,
    holds,
    creates,
    hasCreationFacts: (facts.types ?? []).every((type) => Array.isArray(type.creations)),
    references,
    implemented,
    hasUnknownBase,
    outerOf,
    sameUnit,
    moduleOf,
    isConfigPath,
    isExternalPath,
    isValueData,
    isPureDto,
    isModuleDataClass,
    isBehavior: (name) => ['abstract', 'concrete', 'invalid', 'utility', 'static'].includes(roleOf(byName.get(name))),
    isConcreteClass: (name) => {
      const type = byName.get(name)
      if (!type) return false
      if (!['class', 'record'].includes(type.kind)) return false
      const role = roleOf(type)
      return !['interface', 'abstract', 'static', 'utility', 'extension', 'root'].includes(role)
    },
    isRoot: (name) => roleOf(byName.get(name)) === 'root',
    skip: (message) => ({ skip: message })
  }
}

export const duplicateSkip = (model) => {
  if (model.duplicates.size === 0) return null
  return `有同名类型（${[...model.duplicates].join(', ')}）—— 按名字查会串，先消除同名，跳过，不算通过。`
}

export const waives = (type, ids) => {
  const wanted = new Set(ids)
  const comments = type?.comments ?? []
  for (const comment of comments) {
    const fields = comment.fields ?? {}
    const granted = String(fields.waive ?? '').split(',').map((one) => one.trim())
    const why = fields.why ?? 'unknown'
    if (granted.some((id) => wanted.has(id))) return why
  }
  return null
}

// A compact SCC/cycle helper for the implementation graph. Self loops and
// nested-type cycles are handled by the caller; this returns elementary cycles
// through a DFS and keeps one representative per cycle shape.
export function cyclesOf(edges) {
  const adjacency = new Map()
  const edgeAt = new Map()
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    adjacency.get(edge.from).push(edge.to)
    const key = `${edge.from}|${edge.to}`
    if (!edgeAt.has(key)) edgeAt.set(key, edge)
  }

  const state = new Map()
  const stack = []
  const found = []

  const visit = (name) => {
    const seen = state.get(name) ?? 0
    if (seen === 2) return
    if (seen === 1) {
      const names = stack.slice(stack.indexOf(name)).concat(name)
      if (names[0] === names[names.length - 1]) {
        const text = names.join('  ->  ')
        if (!found.some((cycle) => cycle.text === text)) {
          const places = []
          for (let i = 0; i < names.length - 1; i++) {
            const edge = edgeAt.get(`${names[i]}|${names[i + 1]}`)
            if (edge) places.push(`${edge.file}:${edge.line}`)
          }
          found.push({ text, names, places })
        }
      }
      return
    }
    state.set(name, 1)
    stack.push(name)
    for (const next of adjacency.get(name) ?? []) visit(next)
    stack.pop()
    state.set(name, 2)
  }

  for (const name of adjacency.keys()) visit(name)
  return found
}

export function runCheck(check) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--facts')
  if (at < 0) {
    console.error('rule: 缺少 --facts')
    process.exit(2)
  }
  let facts
  try {
    facts = JSON.parse(readFileSync(args[at + 1], 'utf8'))
  } catch (error) {
    console.error(`rule: 读不到 facts.json：${error.message}`)
    process.exit(2)
  }
  const changedAt = args.indexOf('--changed')
  let changedFiles
  if (changedAt >= 0) {
    try {
      changedFiles = JSON.parse(readFileSync(args[changedAt + 1], 'utf8'))
    } catch (error) {
      console.error(`rule: 读不到 changed.json：${error.message}`)
      process.exit(2)
    }
  }
  let result
  try {
    result = check(buildModel(facts, changedFiles))
  } catch (error) {
    console.error(`rule: 判断失败：${error.message}`)
    process.exit(2)
  }
  if (result.skip) {
    console.log(result.skip)
    process.exit(3)
  }
  for (const note of result.notes ?? []) console.log(note)
  for (const finding of result.findings ?? []) console.log(finding)
  process.exit((result.findings ?? []).length === 0 ? 0 : 1)
}

export { isInInterfaces }
