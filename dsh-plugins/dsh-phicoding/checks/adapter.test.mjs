#!/usr/bin/env node
// Project Adaptation Layer semantics.
//
// The adapter is not allowed to become an invisible pass. These cases pin:
//   * UE's UClass(Abstract) becomes a semantic fact, so D-03 stops counting a
//     semantically abstract base as a concrete implementation;
//   * naming policy can be supplied by the project without editing the rule;
//   * severity is reported as WARN, not silently green;
//   * a decorator suppression is reported and counted as suppression;
//   * structural rules are protected from replacement.
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')
const results = []

function run(dir, args) {
  const result = spawnSync('node', [cli, '--root', dir, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' }
  })
  return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

async function withProject(files, adapter, args) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-adapter-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(
    join(dir, '.phicoding', 'config.json'),
    JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator' })
  )
  if (adapter) await writeFile(join(dir, '.phicoding', 'adapter.json'), JSON.stringify(adapter))
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  }
  const result = run(dir, [...(adapter ? ['--adapter', join(dir, '.phicoding', 'adapter.json')] : []), ...args])
  await rm(dir, { recursive: true, force: true })
  return result
}

{
  const source = 'public interface Foo { }'
  const result = await withProject(
    { 'Types.cs': `namespace T;\n\n${source}\n` },
    { id: 'test', rules: { severity: { META_NAMING_01: 'warn' } } },
    ['--only', 'META_NAMING_01']
  )
  results.push({
    name: 'adapter severity downgrade is WARN, not green',
    ok: result.code === 0 && /WARN\s+META_NAMING_01/.test(result.out) && /强度降级/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\n\npublic interface Foo { }\n' },
    { id: 'test', rules: { severity: { META_NAMING_01: 'off' } } },
    ['--only', 'META_NAMING_01']
  )
  results.push({
    name: 'adapter off is reported, not green',
    ok: result.code === 0 && /off\s+META_NAMING_01/.test(result.out) && /适配层关闭/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\n\npublic interface WFoo { }\n' },
    { id: 'test', naming: { interface: { prefix: 'W' } } },
    ['--only', 'META_NAMING_01']
  )
  results.push({
    name: 'adapter naming policy replaces the universal pattern',
    ok: result.code === 0 && /green\s+META_NAMING_01/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Models/Mode.cs': 'namespace T;\npublic enum Mode { A }\n' },
    null,
    ['--only', 'META_DIR_CLASS_02']
  )
  results.push({
    name: 'atom placement is checked without any Interfaces/ module',
    ok: result.code === 0 && /green\s+META_DIR_CLASS_02/.test(result.out) && !/skip\s+META_DIR_CLASS_02/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class First { }\npublic sealed class Second { }\n' },
    { id: 'test', profiles: { cs: { options: { oneTypePerFile: true } } } },
    ['--only', 'PROFILE_FILE_01']
  )
  results.push({
    name: 'language profile enables one type per file',
    ok: result.code !== 0 && /RED\s+PROFILE_FILE_01/.test(result.out) && /Second/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class First { }\npublic sealed class Second { }\n' },
    { id: 'test', profiles: { cs: { options: { oneTypePerFile: true } } } },
    []
  )
  results.push({
    name: 'enabled profile rule runs in the full progressive check',
    ok: result.code !== 0 && /RED\s+PROFILE_FILE_01/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class First { }\npublic sealed class Second { }\n' },
    null,
    []
  )
  results.push({
    name: 'disabled profile rule is not even reported as a skip in a full run',
    ok: result.code === 0 && !/PROFILE_FILE_01/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class Foo { }\npublic sealed class Foo<T> { }\n' },
    { id: 'test', profiles: { cs: { options: { oneTypePerFile: true } } } },
    ['--only', 'PROFILE_FILE_01']
  )
  results.push({
    name: 'same-name generic companion is exempt from one type per file',
    ok: result.code === 0 && /green\s+PROFILE_FILE_01/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class First { }\npublic sealed class Second<T> { }\n' },
    { id: 'test', profiles: { cs: { options: { oneTypePerFile: true } } } },
    ['--only', 'PROFILE_FILE_01']
  )
  results.push({
    name: 'a generic class with a different name is not exempt',
    ok: result.code !== 0 && /RED\s+PROFILE_FILE_01/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class First { public sealed class Nested { } }\n' },
    { id: 'test', profiles: { cs: { options: { oneTypePerFile: true } } } },
    ['--only', 'PROFILE_FILE_01']
  )
  results.push({
    name: 'one type per file ignores nested types',
    ok: result.code === 0 && /green\s+PROFILE_FILE_01/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class First { }\n' },
    { id: 'test', profiles: { cs: { placement: { atoms: { enum: ['Enums'] } } } } },
    ['--only', 'META_DIR_CLASS_02']
  )
  results.push({
    name: 'language profile can override placement independently',
    ok: result.code === 0 && /green\s+META_DIR_CLASS_02/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\n\npublic interface Foo { }\n' },
    { id: 'test', profiles: { cs: { rules: { severity: { META_NAMING_01: 'warn' } } } } },
    ['--only', 'META_NAMING_01']
  )
  results.push({
    name: 'language profile can tune severity',
    ok: result.code === 0 && /WARN\s+META_NAMING_01/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class First { }\n' },
    null,
    ['--only', 'PROFILE_FILE_01']
  )
  results.push({
    name: 'one type per file is opt-in, not a universal default',
    ok: result.code === 0 && /skip\s+PROFILE_FILE_01/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\npublic sealed class First { public void Run(int x) { switch (x) { case 0: break; default: break; } } }\n' },
    { id: 'test', profiles: { cs: { enable: { noSwitch: true } } } },
    ['--only', 'PROFILE_STYLE_04']
  )
  results.push({
    name: 'project profile can enable the no-switch rule',
    ok: result.code !== 0 && /RED\s+PROFILE_STYLE_04/.test(result.out),
    out: result.out
  })
}

{
  const result = await withProject(
    { 'Types.cs': 'namespace T;\n\npublic interface Foo { }\n' },
    { id: 'test', profiles: { cs: { enable: { naming: false } } } },
    []
  )
  results.push({
    name: 'project profile can disable naming as a stage',
    ok: result.code === 0 && !/RED\s+META_NAMING_01/.test(result.out),
    out: result.out
  })
}

{
  const files = {
    'Interfaces/IThing.cs': 'namespace T;\npublic interface IThing { }\n',
    'Enums/Mode.cs': 'namespace T;\npublic enum Mode { A }\n'
  }
  const without = await withProject(files, null, ['--only', 'META_DIR_CLASS_02'])
  const withAdapter = await withProject(
    files,
    { id: 'test', placement: { cs: { atoms: { enum: ['Enums'] } } } },
    ['--only', 'META_DIR_CLASS_02']
  )
  results.push({
    name: 'adapter placement policy can move enums out of Models/',
    ok: /RED\s+META_DIR_CLASS_02/.test(without.out) && /green\s+META_DIR_CLASS_02/.test(withAdapter.out),
    out: `${without.out}\n--- with adapter ---\n${withAdapter.out}`
  })
}

{
  const files = {
    'Interfaces/ISubject.cs': 'namespace T;\npublic interface ISubject { }\n',
    'Interfaces/IOther.cs': 'namespace T;\npublic interface IOther { }\n',
    'Impl/Subject.cs': `namespace T;
[UClass(ClassFlags.Abstract)]
public partial class SubjectBase : ISubject { }
[UClass(ClassFlags.DefaultToInstanced)]
public partial class SubjectImpl : SubjectBase { }
`,
    'Impl/Other.cs': `namespace T;
[UClass(ClassFlags.DefaultToInstanced)]
public partial class OtherImpl : IOther { }
`
  }
  const without = await withProject(files, null, ['--only', 'META_DIR_CLASS_03'])
  const withAdapter = await withProject(files, { id: 'test', engine: 'unreal' }, ['--only', 'META_DIR_CLASS_03'])
  results.push({
    name: 'UE UClass(Abstract) is a semantic fact for D-03',
    ok: /RED\s+META_DIR_CLASS_03/.test(without.out) && /green\s+META_DIR_CLASS_03/.test(withAdapter.out),
    out: `${without.out}\n--- with adapter ---\n${withAdapter.out}`
  })
}

{
  const decorator = `export default {
  id: 'test-suppress',
  appliesTo: ['META_NAMING_01'],
  after({ lines }) {
    return { lines: [], trace: lines.map(() => ({ action: 'suppress', reason: 'test decorator' })) }
  }
}
`
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-adapter-decorator-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(join(dir, '.phicoding', 'config.json'), JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator' }))
  await writeFile(join(dir, 'Types.cs'), 'namespace T;\n\npublic interface Foo { }\n')
  await writeFile(join(dir, 'decorator.mjs'), decorator)
  await writeFile(join(dir, '.phicoding', 'adapter.json'), JSON.stringify({
    id: 'test',
    rules: { decorate: ['../decorator.mjs'] }
  }))
  const result = run(dir, ['--adapter', join(dir, '.phicoding', 'adapter.json'), '--only', 'META_NAMING_01'])
  await rm(dir, { recursive: true, force: true })
  results.push({
    name: 'decorator suppression is visible, not silent',
    ok: result.code === 0 && /adapter\s+META_NAMING_01\s+suppressed/.test(result.out) && /适配层抑制/.test(result.out),
    out: result.out
  })
}

{
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-adapter-add-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(join(dir, '.phicoding', 'config.json'), JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator' }))
  await writeFile(join(dir, 'Types.cs'), 'namespace T;\n\npublic sealed class Foo { }\n')
  await writeFile(join(dir, 'project-rule.mjs'), "console.log('Types.cs:3  project rule')\nprocess.exit(1)\n")
  await writeFile(join(dir, '.phicoding', 'adapter.json'), JSON.stringify({
    id: 'test',
    rules: { add: [{ id: 'WY_TEST_01', path: '../project-rule.mjs' }] }
  }))
  const result = run(dir, ['--adapter', join(dir, '.phicoding', 'adapter.json'), '--only', 'WY_TEST_01'])
  await rm(dir, { recursive: true, force: true })
  results.push({
    name: 'adapter can add a project rule',
    ok: result.code !== 0 && /RED\s+WY_TEST_01/.test(result.out),
    out: result.out
  })
}

{
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-adapter-replace-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(join(dir, '.phicoding', 'config.json'), JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator' }))
  await writeFile(join(dir, 'Types.cs'), 'namespace T;\n\npublic interface Foo { }\n')
  await writeFile(join(dir, 'replacement.mjs'), 'process.exit(0)\n')
  await writeFile(join(dir, '.phicoding', 'adapter.json'), JSON.stringify({
    id: 'test',
    rules: { replace: { META_NAMING_01: '../replacement.mjs' } }
  }))
  const result = run(dir, ['--adapter', join(dir, '.phicoding', 'adapter.json'), '--only', 'META_NAMING_01'])
  await rm(dir, { recursive: true, force: true })
  results.push({
    name: 'adapter can replace a non-protected rule',
    ok: result.code === 0 && /green\s+META_NAMING_01/.test(result.out),
    out: result.out
  })
}

{
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-adapter-protected-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(join(dir, '.phicoding', 'config.json'), JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator' }))
  await writeFile(join(dir, 'Types.cs'), 'namespace T;\n\npublic sealed class Foo { }\n')
  await writeFile(join(dir, 'fake.mjs'), 'process.exit(0)\n')
  await writeFile(join(dir, '.phicoding', 'adapter.json'), JSON.stringify({
    id: 'test',
    rules: { replace: { META_REF_LEVEL_01: '../fake.mjs' } }
  }))
  const result = run(dir, ['--adapter', join(dir, '.phicoding', 'adapter.json'), '--only', 'META_REF_LEVEL_01'])
  await rm(dir, { recursive: true, force: true })
  results.push({
    name: 'protected rule replacement is rejected',
    ok: result.code !== 0 && /protected 规则不能替换/.test(result.out),
    out: result.out
  })
}

for (const result of results) {
  console.log(`${result.ok ? '  ok   ' : '  FAIL '} ${result.name}`)
  if (!result.ok) console.log(`         ${result.out?.split('\n').slice(-8).join('\n         ') ?? ''}`)
}
const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `ADAPTER-TEST=PASS  ${results.length} 项` : `ADAPTER-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
