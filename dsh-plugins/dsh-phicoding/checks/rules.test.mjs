#!/usr/bin/env node
// C/D family semantics, fed by synthetic facts.
//
// Network/toolchain independent on purpose: the base is tested separately; this
// file proves the role model and the three dependency relations, and it can run
// in an environment where spawning dotnet is not allowed.
import { buildModel } from './.cs/model.mjs'
import {
  checkBehaviorHasInterface,
  checkInterfacePurity,
  checkModuleDataClassHasInterface,
  checkPureData,
  checkPureDtoIsolation
} from './.cs/contract.mjs'
import {
  checkConcreteAcyclic,
  checkConstructionBoundary,
  checkNoConcreteHold,
  checkReferenceDegree,
  checkStructReferenceAcyclic
} from './.cs/dependency.mjs'

const results = []
function expect(name, check, options = {}) {
  let value
  try {
    value = check()
  } catch (error) {
    results.push({ name, ok: false, detail: `threw: ${error.message}` })
    return
  }
  const findings = value.findings ?? []
  const skip = value.skip ?? null
  let ok = Boolean(skip) === Boolean(options.skip)
  if (ok && options.skipMatch) ok = options.skipMatch.test(skip ?? '')
  if (ok) ok = findings.length === (options.findings ?? 0)
  if (ok && options.match) ok = findings.some((line) => options.match.test(line))
  if (ok && options.noMatch) ok = findings.every((line) => !options.noMatch.test(line))
  results.push({ name, ok, detail: skip ?? findings.join('\n') })
}

const file = (name, folder = '') => `${folder ? `${folder}/` : ''}${name}.cs`
const type = (name, kind, folder, extra = {}) => ({
  name,
  kind,
  file: file(name, folder),
  line: extra.line ?? 2,
  endLine: extra.endLine ?? 2,
  isAbstract: extra.isAbstract ?? false,
  isSealed: extra.isSealed ?? kind === 'class',
  isStatic: extra.isStatic ?? false,
  containing: extra.containing ?? null,
  base: extra.base ?? null,
  interfaces: extra.interfaces ?? [],
  members: extra.members ?? [],
  creations: extra.creations ?? [],
  comments: extra.comments ?? []
})
const member = (name, kind, typeName, line = 3, extra = {}) => ({
  name,
  kind,
  type: typeName,
  parameters: extra.parameters ?? [],
  access: extra.access ?? 'public',
  line,
  endLine: extra.endLine ?? line,
  hasBody: extra.hasBody ?? false,
  isStatic: extra.isStatic ?? false,
  extensionOf: extra.extensionOf ?? null
})
const ref = (from, to, atLine = 4, folder = '', kind = 'use') => ({
  from,
  to,
  file: file(from, folder),
  line: atLine,
  kind
})
const facts = (types, references = [], files = []) => ({
  language: 'cs',
  files: [...new Set([...types.map((one) => one.file), ...files])],
  types,
  references
})

// ---- META_SURFACE_01 -----------------------------------------------------------------
{
  const data = type('Money', 'struct', 'Combat/Models')
  const impl = type('Weapon', 'class', 'Combat/Weapon', { base: 'IWeapon' })
  const api = type('IWeapon', 'interface', 'Combat/Interfaces')
  const model = facts([api, data, impl], [
    ref('IWeapon', 'Money', 3, 'Combat/Interfaces'),
    ref('IWeapon', 'Weapon', 4, 'Combat/Interfaces')
  ])
  expect('META_SURFACE_01 interface may see data, not concrete', () =>
    checkInterfacePurity(buildModel(model)), { findings: 1, match: /Warrior|Weapon/ })
}

// ---- META_SURFACE_01 external PureDTO and module data -------------------------------
{
  const api = type('IBox', 'interface', 'Combat/Interfaces')
  const dto = type('SetDto', 'class', 'Config')
  const impl = type('Box', 'class', 'Combat/Box', { base: 'IBox' })
  const model = facts([api, dto, impl], [
    ref('IBox', 'SetDto', 3, 'Combat/Interfaces')
  ])
  expect('META_SURFACE_01 external PureDTO is allowed in an interface', () =>
    checkInterfacePurity(buildModel(model)), { findings: 0 })
}

{
  const api = type('IBox', 'interface', 'Combat/Interfaces')
  const data = type('LooseData', 'class', 'Combat/Models')
  const model = facts([api, data], [
    ref('IBox', 'LooseData', 3, 'Combat/Interfaces')
  ])
  expect('META_SURFACE_01 module class data without an interface is red', () =>
    checkInterfacePurity(buildModel(model)), { findings: 1, match: /LooseData/ })
}

// ---- META_DIR_CLASS_04 -----------------------------------------------------------------
{
  const behaviorStruct = type('Pool', 'struct', 'Combat/Models', {
    members: [member('Add', 'method', 'void')]
  })
  const interfaceStruct = type('Mod', 'struct', 'Combat/Models', {
    members: [member('Stat', 'property', 'IStat')]
  })
  const interfaceType = type('IStat', 'interface', 'Combat/Interfaces')
  const badRecord = type('BadRecord', 'record', 'Combat/Models', {
    members: [member('Move', 'method', 'void')]
  })
  const model = facts([behaviorStruct, interfaceStruct, interfaceType, badRecord], [])
  expect('META_DIR_CLASS_04 structs are data regardless of methods/interface fields; record behavior is red', () =>
    checkPureData(buildModel(model)), {
    findings: 1,
    match: /BadRecord/,
    noMatch: /Pool|Mod\b/
  })
}

// ---- META_SURFACE_02 -----------------------------------------------------------------
{
  const iface = type('IThing', 'interface', 'Combat/Interfaces')
  const thing = type('Thing', 'class', 'Combat/Impl', { base: 'IThing' })
  const helper = type('Helper', 'class', 'Combat/Impl', {
    members: [member('Run', 'method', 'void')]
  })
  const root = type('Composition', 'class', 'App', {
    members: [member('Run', 'method', 'void')]
  })
  const data = type('Range', 'struct', 'Combat/Models')
  const model = facts([iface, thing, helper, root, data], [])
  expect('META_SURFACE_02 behavior class in module needs interface; data/root exempt', () =>
    checkBehaviorHasInterface(buildModel(model)), { findings: 1, match: /Helper/ })
}

// No modules: META_SURFACE_02 still catches abstract classes (the old 0700 invariant).
{
  const abstract = type('Adjust', 'class', 'Core', { isAbstract: true })
  const concrete = type('Flat', 'class', 'Core')
  const model = facts([abstract, concrete], [])
  expect('META_SURFACE_02 no-module project still checks abstract classes', () =>
    checkBehaviorHasInterface(buildModel(model)), { findings: 1, match: /Adjust/ })
}

// External/generated base classes: their interfaces are not in facts. Do not
// turn that missing information into a red finding.
{
  const iface = type('IThing', 'interface', 'Combat/Interfaces')
  const generated = type('Generated', 'class', 'Combat/Impl', { base: 'ExternalBase' })
  const model = facts([iface, generated], [])
  expect('META_SURFACE_02 external base is unjudged, not red', () =>
    checkBehaviorHasInterface(buildModel(model)), { skip: true, skipMatch: /基类不在 facts/ })
}

// ---- META_SURFACE_03 -----------------------------------------------------------------
{
  const iface = type('IThing', 'interface', 'Combat/Interfaces')
  const moduleData = type('LooseData', 'class', 'Combat/Models')
  const dto = type('SetDto', 'class', 'Config')
  const generatedDto = type('GeneratedDto', 'class', 'Configs')
  const model = facts([iface, moduleData, dto, generatedDto], [])
  expect('META_SURFACE_03 module class data needs an interface; Config/Configs PureDTO exempt', () =>
    checkModuleDataClassHasInterface(buildModel(model)), { findings: 1, match: /LooseData/ })
}

// ---- META_SURFACE_04 -----------------------------------------------------------------
{
  const iface = type('IThing', 'interface', 'Combat/Interfaces')
  const domainData = type('Mod', 'struct', 'Combat/Models')
  const dto = type('SetDto', 'class', 'Config')
  const own = type('ModDto', 'class', 'Config')
  const model = facts([iface, domainData, dto, own], [
    ref('SetDto', 'Mod', 3, 'Config'),
    ref('SetDto', 'ModDto', 4, 'Config')
  ])
  expect('META_SURFACE_04 PureDTO cannot reference module-owned types', () =>
    checkPureDtoIsolation(buildModel(model)), { findings: 1, match: /SetDto.*Mod\b/ })
}

// ---- role features: multiple roots / root implementation / factory ---------
{
  const ia = type('IA', 'interface', 'Combat/Interfaces')
  const ib = type('IB', 'interface', 'Combat/Interfaces')
  const a = type('A', 'class', 'Combat/Impl', { base: 'IA' })
  const b = type('B', 'class', 'Combat/Impl', { base: 'IB' })
  const model = buildModel(facts([ia, ib, a, b], []))
  expect('multiple concept roots are allowed and each implementation is a root', () => ({
    findings: [
      ...(model.isConceptRoot('IA') ? [] : ['IA not a root']),
      ...(model.isConceptRoot('IB') ? [] : ['IB not a root']),
      ...(model.isRootImplementation('A') && model.isAggregateRoot('A') ? [] : ['A not a root implementation']),
      ...(model.isRootImplementation('B') && model.isAggregateRoot('B') ? [] : ['B not a root implementation'])
    ]
  }), { findings: 0 })
}

{
  const i = type('IThing', 'interface', 'Combat/Interfaces')
  const thing = type('Thing', 'class', 'Combat/Impl', { base: 'IThing' })
  const factory = type('Factory', 'class', 'Combat/Impl', {
    members: [member('Make', 'method', 'IThing')],
    creations: [{ to: 'Thing', line: 4 }]
  })
  const model = buildModel(facts([i, thing, factory], []))
  expect('factory shape is a feature, not a root implementation', () => ({
    findings: [
      ...(model.isFactory('Factory') ? [] : ['Factory not detected']),
      ...(model.isRootImplementation('Factory') ? ['Factory should not be a root implementation'] : [])
    ]
  }), { findings: 0 })
}

// ---- META_REF_LEVEL_01 -----------------------------------------------------------------
{
  const api = type('IThing', 'interface', 'Combat/Impl')
  const impl = type('Thing', 'class', 'Combat/Impl', { base: 'IThing' })
  const helper = type('Helper', 'class', 'Combat/Impl')
  const model = facts([api, impl, helper], [
    ref('Helper', 'IThing', 3, 'Combat/Impl'),
    ref('Helper', 'Thing', 4, 'Combat/Impl')
  ])
  expect('META_REF_LEVEL_01 is global even without concept roots', () =>
    checkReferenceDegree(buildModel(model)), { findings: 1, match: /Helper/ })
}
{
  const ir = type('IRoot', 'interface', 'Core/Interfaces')
  const ic = type('IChild', 'interface', 'Core/Interfaces', { base: 'IRoot' })
  const ar = type('AbsRoot', 'abstract', 'Core/Interfaces', { isAbstract: true, base: 'IRoot' })
  const ac = type('AbsChild', 'abstract', 'Core/Interfaces', { isAbstract: true, base: 'AbsRoot' })
  const cr = type('ConcRoot', 'class', 'Core/Impl', { base: 'AbsRoot' })
  const owner = type('A', 'class', 'Core/Impl', {
    base: 'IChild',
    members: [member('Any', 'property', 'IRoot'), member('Too', 'property', 'AbsRoot')]
  })
  const model = facts([ir, ic, ar, ac, cr, owner], [
    ref('A', 'IRoot', 4, 'Core/Impl'),
    ref('A', 'AbsRoot', 4, 'Core/Impl')
  ])
  expect('META_REF_LEVEL_01 interface degree cannot also see an abstract implementation', () =>
    checkReferenceDegree(buildModel(model)), { findings: 1, match: /A/ })
}

// A generic type argument at an invocation is still a reference for a root
// implementation: being a registration/type token does not exempt it.
{
  const api = type('IThing', 'interface', 'Combat/Interfaces')
  const impl = type('Thing', 'class', 'Combat/Impl', { base: 'IThing' })
  const owner = type('Owner', 'class', 'Combat/Impl', { base: 'IThing' })
  const model = facts([api, impl, owner], [
    ref('Owner', 'IThing', 3, 'Combat/Impl'),
    ref('Owner', 'Thing', 4, 'Combat/Impl', 'type-argument')
  ])
  expect('META_REF_LEVEL_01 type argument is still a root reference', () =>
    checkReferenceDegree(buildModel(model)), { findings: 1, match: /Owner/ })
}

// Contract references are baseline; only the extra concrete reference is red.
{
  const product = type('IProduct', 'interface', 'Combat/Interfaces')
  const concrete = type('ConcreteProduct', 'class', 'Combat/Impl', { base: 'IProduct' })
  const contract = type('IThing', 'interface', 'Combat/Interfaces', {
    members: [member('Make', 'method', 'void', 3, { parameters: ['IProduct'] })]
  })
  const thing = type('Thing', 'class', 'Combat/Impl', { base: 'IThing' })
  const model = facts([product, concrete, contract, thing], [
    ref('Thing', 'ConcreteProduct', 4, 'Combat/Impl')
  ])
  expect('META_REF_LEVEL_01 contract parameter reference is baseline', () =>
    checkReferenceDegree(buildModel(model)), { findings: 1, match: /Thing/ })
}

// Generic type arguments supplied by the implementation are required by the
// external contract (`IExecutor<ConcreteConfig>`); they are not extra leaks.
{
  const config = type('IConfig', 'interface', 'Combat/Interfaces')
  const concrete = type('ConcreteConfig', 'class', 'Combat/Impl', { base: 'IConfig' })
  const executor = type('IExecutor', 'interface', 'Combat/Interfaces', {
    members: [member('Run', 'method', 'void', 3, { parameters: ['IConfig'] })]
  })
  const impl = type('Impl', 'class', 'Combat/Impl', { interfaces: ['IExecutor<ConcreteConfig>'] })
  const model = facts([config, concrete, executor, impl], [
    ref('Impl', 'IConfig', 4, 'Combat/Impl'),
    ref('Impl', 'ConcreteConfig', 5, 'Combat/Impl')
  ])
  expect('META_REF_LEVEL_01 generic contract argument is required baseline', () =>
    checkReferenceDegree(buildModel(model)), { findings: 0 })
}

// A base class contract member is required; a private base member is not.
{
  const product = type('IProduct', 'interface', 'Combat/Interfaces')
  const concrete = type('ConcreteProduct', 'class', 'Combat/Impl', { base: 'IProduct' })
  const base = type('Base', 'abstract', 'Combat/Impl', {
    isAbstract: true,
    members: [
      member('Take', 'method', 'IProduct', 3, { parameters: ['IProduct'] }),
      member('hidden', 'field', 'ConcreteProduct', 4, { access: 'private' })
    ]
  })
  const derived = type('Derived', 'class', 'Combat/Impl', { base: 'Base' })
  const model = facts([product, concrete, base, derived], [
    ref('Derived', 'IProduct', 5, 'Combat/Impl'),
    ref('Derived', 'ConcreteProduct', 6, 'Combat/Impl')
  ])
  expect('META_REF_LEVEL_01 ignores the base-inherited interface; private base member does not force it', () =>
    checkReferenceDegree(buildModel(model)), { findings: 0 })
}

// A base class forces the interface view into every derived type. That forced
// reference must be removed from both baseline and recomputed target set; the
// concrete field the derived type adds is then judged only among its own refs.
{
  const target = type('ISubjectTarget', 'interface', 'Interfaces')
  const concrete = type('UWYSubjectTarget', 'class', 'Subjects', { base: 'ISubjectTarget' })
  const base = type('UWYSubjectFraming', 'abstract', 'Framings', {
    isAbstract: true,
    members: [member('Subjects', 'property', 'ISubjectTarget', 3)]
  })
  const framing = type('UWYAttentionFraming', 'class', 'Framings', {
    base: 'UWYSubjectFraming',
    members: [
      member('SubjectA', 'property', 'UWYSubjectTarget', 4),
      member('SubjectB', 'property', 'UWYSubjectTarget', 5)
    ]
  })
  const model = facts([target, concrete, base, framing], [
    ref('UWYAttentionFraming', 'UWYSubjectTarget', 4, 'Framings'),
    ref('UWYAttentionFraming', 'UWYSubjectTarget', 5, 'Framings')
  ])
  expect('META_REF_LEVEL_01 ignores base-inherited interface; recomputes the derived set', () =>
    checkReferenceDegree(buildModel(model)), { findings: 0 })
}

// A directly implemented interface is still the owner's own contract; only the
// base-inherited interface is removed from the recomputed set.
{
  const root = type('IRoot', 'interface', 'Core/Interfaces')
  const concrete = type('ConcRoot', 'class', 'Core/Impl', { base: 'IRoot' })
  const owner = type('Owner', 'class', 'Core/Impl', { interfaces: ['IRoot'] })
  const model = facts([root, concrete, owner], [
    ref('Owner', 'IRoot', 4, 'Core/Impl'),
    ref('Owner', 'ConcRoot', 5, 'Core/Impl')
  ])
  expect('META_REF_LEVEL_01 still flags a direct interface delta', () =>
    checkReferenceDegree(buildModel(model)), { findings: 1, match: /Owner/ })
}

// ---- SOFT_DESIGN_01 -----------------------------------------------------------------
{
  const iw = type('IWeapon', 'interface', 'Combat/Interfaces')
  const il = type('ILexer', 'interface', 'Combat/Interfaces')
  const lexer = type('Lexer', 'class', 'Combat/Lexer', { base: 'ILexer' })
  const logging = type('LoggingWeapon', 'class', 'Combat/Weapon', {
    base: 'IWeapon',
    members: [member('inner', 'field', 'IWeapon')]
  })
  const parser = type('Parser', 'class', 'Combat/Parser', {
    base: 'IParser',
    members: [member('lexer', 'field', 'Lexer')]
  })
  const ip = type('IParser', 'interface', 'Combat/Interfaces')
  const model = facts([iw, il, lexer, logging, parser, ip], [])
  expect('SOFT_DESIGN_01 decorator holds interface and passes', () =>
    checkNoConcreteHold(buildModel(model)), { findings: 1, match: /Parser/ })
}

// A non-root helper may hold a concrete implementation; SOFT_DESIGN_01 only judges
// root/aggregate implementations.
{
  const api = type('IThing', 'interface', 'Combat/Interfaces')
  const impl = type('Thing', 'class', 'Combat/Impl', { base: 'IThing' })
  const helper = type('Helper', 'class', 'Combat/Impl', {
    members: [member('thing', 'field', 'Thing')]
  })
  const model = facts([api, impl, helper], [])
  expect('SOFT_DESIGN_01 non-root helper may hold a concrete field', () =>
    checkNoConcreteHold(buildModel(model)), { findings: 0 })
}

// SOFT_DESIGN_01 is per root implementation: every implementation is checked.
{
  const api = type('IThing', 'interface', 'Combat/Interfaces')
  const impl = type('Thing', 'class', 'Combat/Impl', { base: 'IThing' })
  const first = type('FirstRoot', 'class', 'Combat/Impl', {
    base: 'IThing',
    members: [member('thing', 'field', 'Thing')]
  })
  const second = type('SecondRoot', 'class', 'Combat/Impl', {
    base: 'IThing',
    members: [member('thing', 'field', 'Thing')]
  })
  const model = facts([api, impl, first, second], [])
  expect('SOFT_DESIGN_01 checks every root implementation independently', () =>
    checkNoConcreteHold(buildModel(model)), { findings: 2 })
}

// ---- SOFT_DESIGN_02 -----------------------------------------------------------------
{
  const iw = type('IWeapon', 'interface', 'Combat/Interfaces')
  const sword = type('Sword', 'class', 'Combat/Weapon', { base: 'IWeapon' })
  const a = type('A', 'class', 'Combat/Impl', {
    members: [member('Make', 'method', 'IWeapon')],
    creations: [{ to: 'Sword', line: 4 }]
  })
  const b = type('B', 'class', 'Combat/Impl', {
    members: [member('Make', 'method', 'IWeapon')],
    creations: [{ to: 'Sword', line: 5 }]
  })
  const model = facts([iw, sword, a, b], [])
  expect('SOFT_DESIGN_02 two construction sites for one concrete type are red', () =>
    checkConstructionBoundary(buildModel(model)), { findings: 1, match: /Sword/ })
}

// ---- META_REF_ACYCLIC_01 -----------------------------------------------------------------
{
  const a = type('A', 'class', 'Combat/Impl', {
    members: [member('b', 'field', 'B')]
  })
  const b = type('B', 'class', 'Combat/Impl', {
    members: [member('a', 'field', 'A')]
  })
  const model = facts([a, b], [])
  expect('META_REF_ACYCLIC_01 concrete field cycle is red', () => checkConcreteAcyclic(buildModel(model)), {
    findings: 1,
    match: /CYCLE/
  })
}

// Nested implementation detail: a cycle inside one outer type is one unit.
{
  const host = type('Host', 'class', 'Core/Impl', {
    members: [member('part', 'field', 'Piece')]
  })
  const piece = type('Piece', 'class', 'Core/Impl', {
    containing: 'Host',
    members: [member('back', 'field', 'Host')]
  })
  const model = facts([host, piece], [])
  expect('META_REF_ACYCLIC_01 nested tree cycle is one unit', () => checkConcreteAcyclic(buildModel(model)), {
    findings: 0
  })
}

// Construction-only cycle: no concrete fields, only two `new` sites.
{
  const a = type('A', 'class', 'Core/Impl', { creations: [{ to: 'B', line: 3 }] })
  const b = type('B', 'class', 'Core/Impl', { creations: [{ to: 'A', line: 4 }] })
  const model = facts([a, b], [])
  expect('META_REF_ACYCLIC_01 construction-only cycle is red', () => checkConcreteAcyclic(buildModel(model)), {
    findings: 1,
    match: /CYCLE/
  })
}

// ---- META_REF_ACYCLIC_02 -----------------------------------------------------------------
// A struct is data, but its references are still edges in the dependency graph.
{
  const ia = type('IA', 'interface', 'Core/Interfaces')
  const ib = type('IB', 'interface', 'Core/Interfaces')
  const data = type('Data', 'struct', 'Core/Models')
  const cycle = facts([ia, ib, data], [
    ref('IA', 'Data', 3, 'Core/Interfaces'),
    ref('Data', 'IB', 4, 'Core/Models'),
    ref('IB', 'IA', 5, 'Core/Interfaces')
  ])
  expect('META_REF_ACYCLIC_02 IA -> struct -> IB -> IA is a cycle', () =>
    checkStructReferenceAcyclic(buildModel(cycle)), { findings: 1, match: /CYCLE/ })
}

// Pure interface cycles are not this rule's job; they stay in soft review.
{
  const ia = type('IA', 'interface', 'Core/Interfaces')
  const ib = type('IB', 'interface', 'Core/Interfaces')
  const cycle = facts([ia, ib], [
    ref('IA', 'IB', 3, 'Core/Interfaces'),
    ref('IB', 'IA', 4, 'Core/Interfaces')
  ])
  expect('META_REF_ACYCLIC_02 pure interface cycle is left to soft review', () =>
    checkStructReferenceAcyclic(buildModel(cycle)), { findings: 0 })
}

// A state host may create its concrete state at one construction site and hold
// only IState; the decorator/state examples must not be false positives.
{
  const im = type('IStateMachine', 'interface', 'State/Interfaces')
  const is = type('IState', 'interface', 'State/Interfaces')
  const machine = type('Machine', 'class', 'State/Impl', {
    base: 'IStateMachine',
    members: [member('current', 'property', 'IState')],
    creations: [{ to: 'Idle', line: 4 }]
  })
  const idle = type('Idle', 'class', 'State/Impl', { base: 'IState' })
  const model = facts([im, is, machine, idle], [
    ref('Machine', 'IState', 4, 'State/Impl'),
    ref('Machine', 'Idle', 4, 'State/Impl')
  ])
  expect('META_REF_LEVEL_01/SOFT_DESIGN_01/META_REF_ACYCLIC_01 state host is green', () => ({
    findings: [
      ...(checkReferenceDegree(buildModel(model)).findings ?? []),
      ...(checkNoConcreteHold(buildModel(model)).findings ?? []),
      ...(checkConcreteAcyclic(buildModel(model)).findings ?? [])
    ]
  }), { findings: 0 })
}

console.log('')
const failed = results.filter((result) => !result.ok)
for (const result of results) {
  console.log(`${result.ok ? '  ok   ' : '  FAIL '} ${result.name}`)
  if (!result.ok && result.detail) console.log(`         ${result.detail.split('\n').join('\n         ')}`)
}
console.log('')
console.log(failed.length === 0 ? `RULES-TEST=PASS  ${results.length} 项` : `RULES-TEST=FAILED  ${failed.length}/${results.length}`)
process.exit(failed.length === 0 ? 0 : 1)
