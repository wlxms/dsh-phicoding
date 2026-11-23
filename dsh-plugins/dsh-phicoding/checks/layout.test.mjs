#!/usr/bin/env node
// 0900–0930 的语义测试。
//
// 规则契约本来就是"读 facts 判断"：底座解析，规则判断，规则之间互不知道。
// 所以这里直接喂 facts 给 layout.mjs 的纯函数，不经过 dotnet 底座、不起子进程。
// 规则脚本本身只是薄壳；CLI 集成由 `--list` 与真实工程另验。
//
// 每条用例只证明一条判据的边界：会红的造红例，合法的造反例（不红）。
import { checkModuleEdges, checkPlacement, checkReferences, checkStructure } from './layout.mjs'

const results = []

const type = (name, kind, file, extra = {}) => ({
  name,
  kind,
  file,
  line: extra.line ?? 3,
  base: extra.base ?? null,
  interfaces: extra.interfaces ?? [],
  isAbstract: extra.isAbstract ?? false,
  containing: extra.containing ?? null
})

const ref = (from, file, to, line = 10) => ({ from, file, to, line })

const facts = (types, references = [], extraFiles = []) => ({
  language: 'cs',
  files: [...new Set([...types.map((one) => one.file), ...extraFiles])],
  types,
  references
})

// 一个合法模块的骨架：Combat 有概念层 + Models + 概念实现目录，Sub 是子模块。
const baseTypes = [
  type('IElement', 'interface', 'Combat/Interfaces/IElement.cs'),
  type('IAdditivePass', 'interface', 'Combat/Interfaces/IAdditivePass.cs', { base: 'IElement' }),
  type('Range', 'struct', 'Combat/Models/Range.cs'),
  type('Mode', 'enum', 'Combat/Models/Mode.cs'),
  type('Flat', 'class', 'Combat/Element/Flat.cs', { interfaces: ['IAdditivePass'] }),
  type('Score', 'class', 'Combat/Element/Score.cs', { interfaces: ['IAdditivePass'] }),
  type('ISub', 'interface', 'Combat/Sub/Interfaces/ISub.cs'),
  type('Sub', 'class', 'Combat/Sub/Impl/Sub.cs', { interfaces: ['ISub'] }),
  type('Composition', 'class', 'App/Composition.cs')
]

const baseRefs = [
  ref('IElement', 'Combat/Interfaces/IElement.cs', 'Range', 4),
  ref('IAdditivePass', 'Combat/Interfaces/IAdditivePass.cs', 'IElement', 3),
  ref('Sub', 'Combat/Sub/Impl/Sub.cs', 'IAdditivePass', 5),
  ref('Composition', 'App/Composition.cs', 'Flat', 5),
  ref('Composition', 'App/Composition.cs', 'Sub', 6)
]

function expect(name, run, options) {
  let result
  try {
    result = run()
  } catch (error) {
    results.push({ name, ok: false, detail: `抛错：${error.message}` })
    return
  }
  const skip = Boolean(result.skip)
  const findings = result.findings ?? []
  let ok = skip === Boolean(options.skip) && findings.length === (options.findings ?? 0)
  if (ok && options.skipMatch) ok = options.skipMatch.test(result.skip ?? '')
  if (ok && options.match) ok = findings.some((line) => options.match.test(line))
  if (ok && options.noMatch) ok = findings.every((line) => !options.noMatch.test(line))
  results.push({
    name,
    ok,
    detail: skip ? `skip：${result.skip}` : findings.map((line) => `  ${line}`).join('\n')
  })
}

// ---- 0900 · H1 结构 --------------------------------------------------------
expect('合法骨架：Interfaces 只接口、数据原子在 Models', () => checkStructure(facts(baseTypes, baseRefs)), {
  findings: 0
})

expect('Interfaces/ 里出现 class → 红', () => {
  const types = [...baseTypes, type('Bad', 'class', 'Combat/Interfaces/Bad.cs')]
  return checkStructure(facts(types, baseRefs))
}, { findings: 1, match: /Interfaces\/ 下只能放接口/ })

expect('struct 放在模块根而不是 Models/ → 红', () => {
  const types = [...baseTypes, type('Loose', 'struct', 'Combat/Loose.cs')]
  return checkStructure(facts(types, baseRefs))
}, { findings: 1, match: /数据原子必须放 Models/ })

expect('enum 放在模块根 → 红（数据原子同样受限）', () => {
  const types = [...baseTypes, type('LooseMode', 'enum', 'Combat/LooseMode.cs')]
  return checkStructure(facts(types, baseRefs))
}, { findings: 1 })

expect('record struct 放在模块根 → 红（它也是数据原子）', () => {
  const types = [...baseTypes, type('LooseRecord', 'recordstruct', 'Combat/LooseRecord.cs')]
  return checkStructure(facts(types, baseRefs))
}, { findings: 1 })

expect('抽象类放进 Interfaces/ → 红（它属于具体侧）', () => {
  const types = [...baseTypes, type('Base', 'class', 'Combat/Interfaces/Base.cs', { isAbstract: true })]
  return checkStructure(facts(types, baseRefs))
}, { findings: 1 })

expect('嵌套数据原子不判（归软审）', () => {
  const types = [...baseTypes, type('Nested', 'struct', 'Combat/Loose.cs', { containing: 'Outer' })]
  return checkStructure(facts(types, baseRefs))
}, { findings: 0 })

expect('没有任何 Interfaces/ → 跳过，且明确要求软审按“未采用”处理', () => {
  const types = [type('Plain', 'class', 'src/Plain.cs')]
  return checkStructure(facts(types))
}, { skip: true, skipMatch: /未采用接口模块标准/ })

// ---- 0910 · H2 概念层引用集合 ----------------------------------------------
expect('接口引用本模块具体类 → 红', () => {
  const types = [
    type('IElement', 'interface', 'Combat/Interfaces/IElement.cs'),
    type('Helper', 'class', 'Combat/Impl/Helper.cs')
  ]
  const refs = [ref('IElement', 'Combat/Interfaces/IElement.cs', 'Helper')]
  return checkReferences(facts(types, refs))
}, { findings: 1, match: /本模块的具体类型/ })

expect('接口引用本模块抽象类 → 红', () => {
  const types = [
    type('IElement', 'interface', 'Combat/Interfaces/IElement.cs'),
    type('Base', 'class', 'Combat/Impl/Base.cs', { isAbstract: true })
  ]
  const refs = [ref('IElement', 'Combat/Interfaces/IElement.cs', 'Base')]
  return checkReferences(facts(types, refs))
}, { findings: 1 })

expect('接口引用外部模块的具体类 → 合法（已知事实）', () => {
  const types = [
    type('IElement', 'interface', 'Combat/Interfaces/IElement.cs'),
    type('RuleThing', 'class', 'Rules/Impl/RuleThing.cs')
  ]
  const refs = [ref('IElement', 'Combat/Interfaces/IElement.cs', 'RuleThing')]
  return checkReferences(facts(types, refs))
}, { findings: 0 })

expect('接口引用 Models 下的 struct → 合法', () => {
  return checkReferences(facts(baseTypes, baseRefs))
}, { findings: 0 })

expect('同名类型 → 跳过，不猜', () => {
  const types = [
    type('IElement', 'interface', 'A/Interfaces/IElement.cs'),
    type('IElement', 'interface', 'B/Interfaces/IElement.cs')
  ]
  return checkReferences(facts(types))
}, { skip: true })

// ---- 0920 · H3 模块单向 ----------------------------------------------------
const twoModules = [
  type('IA', 'interface', 'A/Interfaces/IA.cs'),
  type('IB', 'interface', 'B/Interfaces/IB.cs'),
  type('AThing', 'class', 'A/Impl/AThing.cs'),
  type('BThing', 'class', 'B/Impl/BThing.cs')
]

expect('父模块引用子模块类型 → 红', () => {
  const types = [
    type('ICombat', 'interface', 'Combat/Interfaces/ICombat.cs'),
    type('ISub', 'interface', 'Combat/Sub/Interfaces/ISub.cs'),
    type('ParentThing', 'class', 'Combat/Impl/ParentThing.cs'),
    type('SubThing', 'class', 'Combat/Sub/Impl/SubThing.cs')
  ]
  const refs = [ref('ParentThing', 'Combat/Impl/ParentThing.cs', 'SubThing')]
  return checkModuleEdges(facts(types, refs))
}, { findings: 1, match: /父模块.*子模块/ })

expect('子模块引用父模块类型 → 合法', () => {
  const types = [
    type('ICombat', 'interface', 'Combat/Interfaces/ICombat.cs'),
    type('ISub', 'interface', 'Combat/Sub/Interfaces/ISub.cs'),
    type('ParentThing', 'class', 'Combat/Impl/ParentThing.cs'),
    type('SubThing', 'class', 'Combat/Sub/Impl/SubThing.cs')
  ]
  const refs = [ref('SubThing', 'Combat/Sub/Impl/SubThing.cs', 'ParentThing')]
  return checkModuleEdges(facts(types, refs))
}, { findings: 0 })

expect('两个模块互引 → 红（成环）', () => {
  const refs = [
    ref('AThing', 'A/Impl/AThing.cs', 'BThing'),
    ref('BThing', 'B/Impl/BThing.cs', 'AThing')
  ]
  return checkModuleEdges(facts(twoModules, refs))
}, { findings: 1, match: /成环/ })

expect('模块引用模块外的边界/组合根 → 红', () => {
  const types = [
    type('ICombat', 'interface', 'Combat/Interfaces/ICombat.cs'),
    type('CombatThing', 'class', 'Combat/Impl/CombatThing.cs'),
    type('Composition', 'class', 'App/Composition.cs')
  ]
  const refs = [ref('CombatThing', 'Combat/Impl/CombatThing.cs', 'Composition')]
  return checkModuleEdges(facts(types, refs))
}, { findings: 1, match: /边界\/组合根/ })

expect('组合根引用模块 → 合法（组合根在模块树外）', () => {
  return checkModuleEdges(facts(baseTypes, baseRefs))
}, { findings: 0 })

// ---- 0930 · H4a 同接口多实现拆分 ------------------------------------------
const mixTypes = [
  type('IAdditivePass', 'interface', 'Combat/Interfaces/IAdditivePass.cs'),
  type('IOther', 'interface', 'Combat/Interfaces/IOther.cs'),
  type('First', 'class', 'Combat/Mix/First.cs', { interfaces: ['IAdditivePass'] }),
  type('Second', 'class', 'Combat/Mix/Second.cs', { interfaces: ['IAdditivePass'] }),
  type('Other', 'class', 'Combat/Mix/Other.cs', { interfaces: ['IOther'] })
]

expect('同一目录：同接口 2 个实现 + 别的接口实现 → 红', () => {
  return checkPlacement(facts(mixTypes))
}, { findings: 1, match: /应拆到概念实现目录/ })

expect('同一目录只有同一接口的多个实现 → 合法', () => {
  const types = [
    type('IAdditivePass', 'interface', 'Combat/Interfaces/IAdditivePass.cs'),
    type('First', 'class', 'Combat/AdditivePass/First.cs', { interfaces: ['IAdditivePass'] }),
    type('Second', 'class', 'Combat/AdditivePass/Second.cs', { interfaces: ['IAdditivePass'] })
  ]
  return checkPlacement(facts(types))
}, { findings: 0 })

expect('抽象类不算实现（不触发拆分）', () => {
  const types = [
    ...mixTypes,
    type('Base', 'class', 'Combat/Mix/Base.cs', { interfaces: ['IAdditivePass'], isAbstract: true })
  ]
  return checkPlacement(facts(types))
}, { findings: 1 })

expect('同一批多接口类（IA + IB）不触发 H4a：归 GCD 软审', () => {
  const types = [
    type('IA', 'interface', 'Combat/Interfaces/IA.cs'),
    type('IB', 'interface', 'Combat/Interfaces/IB.cs'),
    type('BothA', 'class', 'Combat/Mix/BothA.cs', { interfaces: ['IA', 'IB'] }),
    type('BothB', 'class', 'Combat/Mix/BothB.cs', { interfaces: ['IA', 'IB'] })
  ]
  return checkPlacement(facts(types))
}, { findings: 0 })

expect('不同模块的同接口实现各算各的目录 → 不跨模块聚合', () => {
  const types = [
    type('IAdd', 'interface', 'A/Interfaces/IAdd.cs'),
    type('IAdd2', 'interface', 'B/Interfaces/IAdd2.cs'),
    type('A1', 'class', 'A/AdditivePass/A1.cs', { interfaces: ['IAdd'] }),
    type('A2', 'class', 'A/AdditivePass/A2.cs', { interfaces: ['IAdd'] }),
    type('B1', 'class', 'B/AdditivePass/B1.cs', { interfaces: ['IAdd2'] }),
    type('B2', 'class', 'B/AdditivePass/B2.cs', { interfaces: ['IAdd2'] })
  ]
  return checkPlacement(facts(types))
}, { findings: 0 })

expect('Models 数据域先豁免（不触发拆分）', () => {
  const types = [
    type('IAdditivePass', 'interface', 'Combat/Interfaces/IAdditivePass.cs'),
    type('IOther', 'interface', 'Combat/Interfaces/IOther.cs'),
    type('First', 'class', 'Combat/Models/First.cs', { interfaces: ['IAdditivePass'] }),
    type('Second', 'class', 'Combat/Models/Second.cs', { interfaces: ['IAdditivePass'] }),
    type('Other', 'class', 'Combat/Models/Other.cs', { interfaces: ['IOther'] })
  ]
  return checkPlacement(facts(types))
}, { findings: 0 })

expect('同名类型 → 跳过，不猜', () => {
  const types = [
    type('IAdd', 'interface', 'A/Interfaces/IAdd.cs'),
    type('IAdd', 'interface', 'B/Interfaces/IAdd.cs')
  ]
  return checkPlacement(facts(types))
}, { skip: true })

// ---- 汇总 ------------------------------------------------------------------
let failed = 0
for (const item of results) {
  if (!item.ok) failed++
  console.log(`${item.ok ? '  ok   ' : '  FAIL '} ${item.name}`)
  if (!item.ok && item.detail) console.log(item.detail.split('\n').map((line) => `         ${line}`).join('\n'))
}
console.log('')
console.log(failed === 0 ? `LAYOUT-TEST=PASS  ${results.length} 项` : `LAYOUT-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
