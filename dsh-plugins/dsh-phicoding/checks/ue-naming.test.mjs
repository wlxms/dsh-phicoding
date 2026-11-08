#!/usr/bin/env node
// 0450 的语义测试：UE 家族前缀。
//
// 判据是"沿基类链走到工程外那个名字的首字母"，所以每一族都要有正例与反例；
// 另外两条边界必须验：**非 UE 工程不能误报**（AIBase 不是 Actor）、
// **接口与枚举不重复报**（那是 0400 的活）。
//
//   node ue-naming.test.mjs
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')

// 每个用例都自带一个"UE 锚点"，否则规则会按不适用跳过。
const cases = [
  {
    name: 'Actor 族正例：A 开头 → 放过',
    source: 'public class AMyActor : ACharacter { }',
    red: 0,
  },
  {
    name: 'Actor 族反例：不以 A 开头 → 违规',
    source: 'public class MyActor : ACharacter { }',
    red: 1,
    expect: /基类链终点是 ACharacter（A 族）/,
  },
  {
    name: 'UObject 族正例：U 开头 → 放过',
    source: 'public class UMyThing : UObject { }',
    red: 0,
  },
  {
    name: 'UObject 族反例：不以 U 开头 → 违规',
    source: 'public class MyThing : UObject { }',
    red: 1,
    expect: /（U 族）/,
  },
  {
    name: '隔一层本工程基类也能追到终端',
    source: 'public abstract class ABaseActor : AActor { }\npublic sealed class BadActor : ABaseActor { }',
    red: 1,
    expect: /BadActor 的基类链终点是 AActor（A 族）/,
  },
  {
    name: '结构体族 F：FTableRowBase 的子类要以 F 开头',
    source: 'public class MyRow : FTableRowBase { }',
    red: 1,
    expect: /（F 族）/,
  },
  {
    name: '接口与枚举不重复报（那是 0400 的活）',
    source: 'public class AMyActor : ACharacter { }\npublic interface Foo { }\npublic enum Kind { A }',
    red: 0,
  },
  {
    name: '非 UE 工程 → 不适用跳过，而不是误报',
    source: 'public class Monster : AIBase { }',
    skip: true,
  },
]

const results = []

for (const item of cases) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-ue-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(
    join(dir, '.phicoding', 'config.json'),
    JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator', plan: '' }),
  )
  await writeFile(join(dir, 'Types.cs'), `namespace T;\n\n${item.source}\n`)

  const result = spawnSync('node', [cli, '--root', dir, '--only', '0450'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })

  let ok
  if (item.skip) {
    ok = result.status === 0 && /skip\s+0450/.test(out) && /没有 UE 根类型/.test(out)
  } else {
    const red = out.match(/^\s{3}RED\s+0450/m) ? 1 : 0
    const hitLines = out.split('\n').filter((line) => /基类链终点是/.test(line)).length
    const explained = !item.expect || item.expect.test(out)
    ok = red === item.red && hitLines === item.red && explained
  }

  results.push({ name: item.name, ok })
  console.log(`${ok ? '  ok   ' : '  FAIL '} ${item.name}`)
  if (!ok) {
    console.log(`         期望 ${item.skip ? '跳过' : item.red + ' 处'}`)
    console.log(out.split('\n').slice(-8).map((line) => `         ${line}`).join('\n'))
  }
}

const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `UE-NAMING-TEST=PASS  ${results.length} 项` : `UE-NAMING-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
