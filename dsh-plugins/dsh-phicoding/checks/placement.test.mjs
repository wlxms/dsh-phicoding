#!/usr/bin/env node
// Placement policy semantics.
//
// Atomic types are categories, not a hard-coded Models/ directory. The policy
// can put enum/struct/recordstruct in project-specific directories, and may
// allow a nested enum only when it is used inside its containing type.
import { checkStructure } from './layout.mjs'
import { placementPolicy } from './placement.mjs'

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
const facts = (types, references = [], directories = []) => ({
  language: 'cs',
  files: [...new Set(types.map((one) => one.file))],
  directories,
  types,
  references
})
const module = (types, references = [], directories = ['Combat', 'Combat/Interfaces']) =>
  facts(types, references, directories)

const expect = (name, run, options = {}) => {
  let result
  try {
    result = run()
  } catch (error) {
    results.push({ name, ok: false, detail: `抛错：${error.message}` })
    return
  }
  const findings = result.findings ?? []
  const ok =
    findings.length === (options.findings ?? 0) &&
    (!options.match || findings.some((line) => options.match.test(line))) &&
    (!options.noMatch || findings.every((line) => !options.noMatch.test(line)))
  results.push({ name, ok, detail: findings.join('\n') })
}

const base = [type('IThing', 'interface', 'Combat/Interfaces/IThing.cs')]

{
  const model = facts([type('Mode', 'enum', 'Models/Mode.cs')])
  expect('atom placement works without any Interfaces/ module', () =>
    checkStructure(model, undefined, { placement: placementPolicy({}, 'cs') }), { findings: 0 })
}

{
  const model = facts([type('Mode', 'enum', 'Mode.cs')])
  expect('atom at project root is still checked without a module', () =>
    checkStructure(model, undefined, { placement: placementPolicy({}, 'cs') }), { findings: 1, match: /数据原子必须放 Models/ })
}

{
  const model = facts([type('Mode', 'enum', 'Enums/Mode.cs')])
  expect('configured atom directory works without a module', () => {
    const policy = placementPolicy({ placement: { cs: { atoms: { enum: ['Enums'] } } } }, 'cs')
    return checkStructure(model, undefined, { placement: policy })
  }, { findings: 0 })
}

{
  const model = module([...base, type('Mode', 'enum', 'Combat/Models/Mode.cs')])
  expect('default enum directory stays Models/', () =>
    checkStructure(model, undefined, { placement: placementPolicy({}, 'cs') }), { findings: 0 })
}

{
  const model = module([...base, type('Mode', 'enum', 'Combat/Enums/Mode.cs')])
  expect('enum can be configured into Enums/', () => {
    const policy = placementPolicy({ placement: { cs: { atoms: { enum: ['Enums'] } } } }, 'cs')
    return checkStructure(model, undefined, { placement: policy })
  }, { findings: 0 })
}

{
  const model = module([...base, type('Mode', 'enum', 'Combat/Models/Mode.cs')])
  expect('a configured enum directory rejects Models/', () => {
    const policy = placementPolicy({ placement: { cs: { atoms: { enum: ['Enums'] } } } }, 'cs')
    return checkStructure(model, undefined, { placement: policy })
  }, { findings: 1, match: /Enum|Enums|Mode/ })
}

{
  const model = module([
    ...base,
    type('Outer', 'class', 'Combat/Outer.cs'),
    type('Mode', 'enum', 'Combat/Outer.cs', { containing: 'Outer' }),
    type('Other', 'class', 'Combat/Other.cs')
  ], [ref('Outer', 'Combat/Outer.cs', 'Mode'), ref('Other', 'Combat/Other.cs', 'Mode')])
  expect('nested enum used only by its containing type is green', () => {
    const policy = placementPolicy({ placement: { cs: { nested: { enum: { allow: true, scope: 'containing' } } } } }, 'cs')
    return checkStructure(module([
      ...base,
      type('Outer', 'class', 'Combat/Outer.cs'),
      type('Mode', 'enum', 'Combat/Outer.cs', { containing: 'Outer' })
    ], [ref('Outer', 'Combat/Outer.cs', 'Mode')]), undefined, { placement: policy })
  }, { findings: 0 })
  expect('nested enum used outside its containing type is red', () => {
    const policy = placementPolicy({ placement: { cs: { nested: { enum: { allow: true, scope: 'containing' } } } } }, 'cs')
    return checkStructure(model, undefined, { placement: policy })
  }, { findings: 1, match: /只能在其包含类型 Outer 内使用/ })
}

{
  const model = module([
    ...base,
    type('Outer', 'class', 'Combat/Outer.cs'),
    type('Mode', 'enum', 'Combat/Outer.cs', { containing: 'Outer' })
  ])
  expect('nested enum can be disabled by policy', () => {
    const policy = placementPolicy({ placement: { cs: { nested: { enum: { allow: false } } } } }, 'cs')
    return checkStructure(model, undefined, { placement: policy })
  }, { findings: 1, match: /不允许嵌套/ })
}

{
  const invalid = { placement: { cs: { atoms: { enum: [] } } } }
  let threw = false
  try {
    placementPolicy(invalid, 'cs')
  } catch {
    threw = true
  }
  results.push({ name: 'empty atom directory is a config error, not a pass', ok: threw })
}

for (const result of results) {
  console.log(`${result.ok ? '  ok   ' : '  FAIL '} ${result.name}`)
  if (!result.ok && result.detail) console.log(`         ${result.detail}`)
}
const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `PLACEMENT-TEST=PASS  ${results.length} 项` : `PLACEMENT-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
