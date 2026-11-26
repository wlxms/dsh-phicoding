// C-family: contract rules.
//
// These rules answer one question only: what may a contract see, and which
// types are contracts/data rather than behavior? They do not judge modules or
// concrete construction; that is D/M.

import { duplicateSkip, isInInterfaces } from './model.mjs'

const line = (type) => `${type.file}:${type.line}`

// META_SURFACE_01: an interface may mention interfaces, value data (struct/enum), and
// external PureDTOs. A module-internal class concept must be used through its
// interface; a class data without a contract is not allowed to leak in.
// Unknown external names are left alone: without a symbol table there is no
// honest way to call an external class concrete.
export function checkInterfacePurity(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }

  const findings = []
  for (const type of model.facts.types ?? []) {
    if (type.kind !== 'interface') continue
    for (const ref of model.references) {
      if (ref.from !== type.name || ref.file !== type.file) continue
      const target = ref.target
      if (!target) continue
      if (target.kind === 'interface') continue
      if (model.isValueData(target)) continue
      if (model.isPureDto(target)) continue
      if (model.isModuleDataClass(target)) {
        findings.push(
          `${ref.file}:${ref.line}  接口 ${type.name} 引用了模块内 class 数据 ${target.name}（模块内 class 数据必须由接口约束；PureDTO 请移到 Config/）`
        )
        continue
      }
      findings.push(
        `${ref.file}:${ref.line}  接口 ${type.name} 引用了${target.kind} ${target.name}（契约层只能引用接口、value data 或外部 PureDTO）`
      )
    }
  }
  return { findings }
}

// META_DIR_CLASS_04: pure data is a closed shape, not a class that happens to have properties.
// Structs are excluded on purpose: a struct is always data in this model, even if
// it carries methods. Struct behavior is a separate (soft) concern; judging it
// through data-purity would force a value type into a class/interface shape.
// Records/classes still have to be field-only to be data, and their data fields
// may not hold interfaces or behavior classes.
export function checkPureData(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }

  const findings = []
  const dataKinds = new Set(['enum', 'record'])
  for (const type of model.facts.types ?? []) {
    if (type.kind === 'struct' || type.kind === 'recordstruct') continue
    const role = model.roleOf(type)
    if (dataKinds.has(type.kind) && role !== 'data') {
      findings.push(`${line(type)}  ${type.kind} ${type.name} 有行为或继承，不是纯数据（纯数据只能有字段/自动属性/构造）`)
      continue
    }
    if (role !== 'data') continue

    for (const member of type.members ?? []) {
      if (member.kind !== 'field' && member.kind !== 'property') continue
      for (const targetName of namesIn(member.type, model.byName)) {
        const target = model.byName.get(targetName)
        if (!target) continue
        if (model.roleOf(target) === 'data') continue
        findings.push(
          `${type.file}:${member.line}  纯数据 ${type.name} 的成员 ${member.name} 引用了${target.kind} ${target.name}（数据字段只能引用纯数据）`
        )
      }
    }
  }
  return { findings }
}

// META_SURFACE_02: every behavior class in a module is covered by an interface. Data,
// utilities, extensions, nested implementation details and the composition root
// are outside this rule.
export function checkBehaviorHasInterface(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }

  // Without Interfaces/ modules we can still judge the old 0700 invariant:
  // abstract classes are public surfaces and need a contract. Concrete classes
  // are only added to this rule once the project has adopted module layout.
  const abstractOnly = model.modules.length === 0
  const findings = []
  const unjudged = []
  let judged = 0
  for (const type of model.facts.types ?? []) {
    if (type.kind !== 'class' && type.kind !== 'record') continue
    if (type.containing) continue // 嵌套实现细节先归软审
    const role = model.roleOf(type)
    if (!['abstract', 'concrete', 'invalid'].includes(role)) continue
    if (model.implemented(type).size > 0) continue
    if (model.hasUnknownBase(type)) {
      unjudged.push(type.name)
      continue
    }
    judged++
    if (abstractOnly && role !== 'abstract') continue
    findings.push(`${line(type)}  行为类 ${type.name} 没有实现任何接口`)
  }
  if (findings.length === 0 && judged === 0 && unjudged.length > 0) {
    return { skip: `行为类的基类不在 facts 内（外部/生成基类），接口实现不可见，未判：${unjudged.join(', ')}` }
  }
  const notes = unjudged.length > 0
    ? [`外部/生成基类不可见，未判 ${unjudged.length} 个行为类：${unjudged.join(', ')}`]
    : []
  return { findings, notes }
}

// META_SURFACE_03: a class data concept inside a module must have a contract interface.
// External/therefore PureDTO classes are deliberately outside this rule: they
// are the "no interface, but also no module-internal knowledge" exception.
export function checkModuleDataClassHasInterface(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }

  const findings = []
  for (const type of model.facts.types ?? []) {
    if (!model.isModuleDataClass(type)) continue
    findings.push(
      `${line(type)}  模块内 class 数据 ${type.name} 没有接口约束（模块内数据概念必须有接口；纯配置 DTO 请放 Config/）`
    )
  }
  return { findings }
}

// META_SURFACE_04: a PureDTO is external known data. It may be referenced by the module,
// but it may not depend back on module-owned types.
export function checkPureDtoIsolation(model) {
  const duplicated = duplicateSkip(model)
  if (duplicated) return { skip: duplicated }

  const findings = []
  for (const type of model.facts.types ?? []) {
    if (!model.isPureDto(type)) continue
    for (const ref of model.references) {
      if (ref.from !== type.name || ref.file !== type.file) continue
      const target = ref.target
      if (!target) continue
      const targetModule = model.moduleOf(target.file)
      if (!targetModule || model.isConfigPath(target.file)) continue
      findings.push(
        `${ref.file}:${ref.line}  PureDTO ${type.name} 引用了模块内 ${target.kind} ${target.name}（DTO 只能引用基础类型、自身 DTO 或其他外部数据）`
      )
    }
  }
  return { findings }
}

// Shared by META_DIR_CLASS_04 and future data rules.
function namesIn(text, byName) {
  const found = new Set()
  for (const match of String(text ?? '').matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    if (byName.has(match[0])) found.add(match[0])
  }
  return found
}

export { isInInterfaces }
