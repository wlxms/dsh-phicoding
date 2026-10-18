#!/usr/bin/env node
// 0400 的语义测试：名字必须符合它所属类别的范式。
//
// 每一类都配正例与反例；反例里有一条专门验证"基类在 BCL 中间层也要认出来"
// （ArgumentException 不是 Exception，但终点是）。扩展类还多两条：
// 只扩展一个本工程类型时要说清是谁；扩展 BCL 类型时不强求。
//
//   node naming.test.mjs
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')

const cases = [
  { name: '接口 I 开头 → 放过', source: 'public interface IFoo { }', red: 0 },
  { name: '接口没有 I 开头 → 违规', source: 'public interface Foo { }', red: 1, expect: /要以 I 开头/ },
  { name: '枚举 E 开头 → 放过', source: 'public enum EKind { A }', red: 0 },
  { name: '枚举没有 E 开头 → 违规', source: 'public enum Kind { A }', red: 1, expect: /要以 E 开头/ },
  { name: '特性以 Attribute 结尾 → 放过', source: 'public sealed class MarkAttribute : Attribute { }', red: 0 },
  { name: '特性没有 Attribute 结尾 → 违规', source: 'public sealed class Mark : Attribute { }', red: 1, expect: /要以 Attribute 结尾/ },
  { name: '异常以 Exception 结尾 → 放过', source: 'public sealed class BrokenException : Exception { }', red: 0 },
  { name: '异常没有 Exception 结尾 → 违规', source: 'public sealed class Broken : Exception { }', red: 1, expect: /要以 Exception 结尾/ },
  {
    name: '基类在 BCL 中间层也要认出来（ArgumentException）',
    source: 'public sealed class Broken : ArgumentException { }',
    red: 1,
    expect: /要以 Exception 结尾/,
  },
  {
    name: '扩展类 {目标}Extensions → 放过',
    source: 'public sealed class Foo { }\npublic static class FooExtensions { public static int Twice(this Foo f) => 0; }',
    red: 0,
  },
  {
    name: '扩展类没有 Extension 结尾 → 违规',
    source: 'public sealed class Foo { }\npublic static class Tools { public static int Twice(this Foo f) => 0; }',
    red: 1,
    expect: /要以 Extension \/ Extensions 结尾/,
  },
  {
    name: '只扩展一个本工程类型却没说清是谁 → 违规',
    source: 'public sealed class Foo { }\npublic static class BarExtension { public static int Twice(this Foo f) => 0; }',
    red: 1,
    expect: /要以 Foo 开头/,
  },
  {
    name: '扩展 BCL 类型不强求目标名（EnumerableExtensions）→ 放过',
    source: 'public static class EnumerableExtensions { public static int Twice(this System.Collections.Generic.IEnumerable<int> xs) => 0; }',
    red: 0,
  },
  { name: '普通类不套任何范式 → 放过', source: 'public sealed class Foo { }', red: 0 },
  { name: '泛型接口 I 开头 → 放过', source: 'public interface ISlot<T> { }', red: 0 },
]

const results = []

for (const item of cases) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-naming-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(
    join(dir, '.phicoding', 'config.json'),
    JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator', plan: '' }),
  )
  await writeFile(join(dir, 'Types.cs'), `namespace T;\n\n${item.source}\n`)

  const result = spawnSync('node', [cli, '--root', dir, '--only', '0400'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })

  const red = out.match(/^\s{3}RED\s+0400/m) ? 1 : 0
  const explained = !item.expect || item.expect.test(out)
  const fine = red === item.red && explained

  results.push({ name: item.name, ok: fine })
  console.log(`${fine ? '  ok   ' : '  FAIL '} ${item.name}`)
  if (!fine) {
    console.log(`         期望 RED=${item.red}${item.expect ? ' 且消息匹配' : ''}`)
    console.log(out.split('\n').slice(-8).map((line) => `         ${line}`).join('\n'))
  }
}

const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `NAMING-TEST=PASS  ${results.length} 项` : `NAMING-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
