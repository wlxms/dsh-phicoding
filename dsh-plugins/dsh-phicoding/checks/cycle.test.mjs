#!/usr/bin/env node
// 0800 的语义测试：什么样的引用回环算违规。
//
// 这条规则判的是"谁可以知道谁"，所以它必须精确到形状：自引用不算、嵌套树内部
// 互指不算、而任何多出一个类型的环都要报。只断言"有环"是不够的——那证明不了
// 豁免范围没有扩大。
//
//   node cycle.test.mjs
//
// 每个形状独立一个临时工程，跑 --only 0800，断言退出码与出现的环序列。
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')

const cases = [
  {
    name: '自引用不算环',
    source: `
namespace T;
public sealed class Link { public Link Next { get; set; } = null!; }
`,
    cycles: [],
  },
  {
    name: '泛型自引用不算环',
    source: `
namespace T;
public sealed class Node<T> { public Node<T> Next { get; set; } = null!; }
`,
    cycles: [],
  },
  {
    name: '两节点环要报',
    source: `
namespace T;
public sealed class A { public B Other { get; set; } = null!; }
public sealed class B { public A Other { get; set; } = null!; }
`,
    cycles: ['A  ->  B  ->  A'],
  },
  {
    name: '三节点环要报',
    source: `
namespace T;
public sealed class X { public Y Y { get; set; } = null!; }
public sealed class Y { public Z Z { get; set; } = null!; }
public sealed class Z { public X X { get; set; } = null!; }
`,
    cycles: ['X  ->  Y  ->  Z  ->  X'],
  },
  {
    name: '菱形不是环',
    source: `
namespace T;
public sealed class D { }
public sealed class E { public D D { get; set; } = null!; }
public sealed class F { public D D { get; set; } = null!; }
public sealed class G { public E E { get; set; } = null!; public F F { get; set; } = null!; }
`,
    cycles: [],
  },
  {
    name: '纯嵌套树内部互指不算环',
    source: `
namespace T;
public sealed class Host
{
    public Piece Part { get; set; } = null!;
    public sealed class Piece { public Host Back { get; set; } = null!; }
}
`,
    cycles: [],
  },
  {
    name: '跨出嵌套树的环要报',
    source: `
namespace T;
public sealed class Host
{
    public Piece Part { get; set; } = null!;
    public sealed class Piece { public Link Back { get; set; } = null!; }
}
public sealed class Link { public Host Up { get; set; } = null!; }
`,
    cycles: ['Host  ->  Piece  ->  Link  ->  Host'],
  },
  {
    name: '接口继承与实现不算环',
    source: `
namespace T;
public interface IRoot { }
public interface IChild : IRoot { }
public sealed class Impl : IChild { }
`,
    cycles: [],
  },
]

const results = []

for (const item of cases) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-cycle-'))
  await writeFile(join(dir, 'Shapes.cs'), item.source)

  const result = spawnSync('node', [cli, '--root', dir, '--only', '0800'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })

  const reported = [...out.matchAll(/CYCLE\s+(.+?)(?:\s{3}\[|$)/gm)].map((match) => match[1].trim())
  const want = item.cycles.length
  const got = reported.length

  let ok = got === want
  if (ok) {
    for (const expected of item.cycles) {
      if (!reported.includes(expected)) ok = false
    }
  }
  // 期望无环时，退出码也必须是 0：只比环序列会漏掉"规则压根没跑"这种情况。
  if (ok && want === 0 && result.status !== 0) ok = false

  results.push({ name: item.name, ok })
  const detail = want === 0 ? '无环' : `环 ${want} 条`
  console.log(`${ok ? '  ok   ' : '  FAIL '} ${item.name}   期望 ${detail}`)
  if (!ok) {
    console.log(`         实际环：${reported.length === 0 ? '（无）' : reported.join(' | ')}`)
    console.log(`         exit=${result.status}`)
    console.log(out.split('\n').slice(-8).map((line) => `         ${line}`).join('\n'))
  }
}

const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `CYCLE-TEST=PASS  ${results.length} 项` : `CYCLE-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
