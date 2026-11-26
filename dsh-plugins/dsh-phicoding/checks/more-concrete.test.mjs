#!/usr/bin/env node
// 0750 的语义测试：引用的具体度，就是这条边界的上限。
//
// 规则说三件事，每一件都要有正例和反例 —— 只证明"会红"证明不了边界画在哪：
//
//   B 是接口      → A 只许再引用接口
//   B 是抽象类    → A 只许再引用抽象子类
//   B 是具体类    → A 一个子类都不许再引用
//
//   node more-concrete.test.mjs
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')

const family = `
namespace T;

public interface IRoot { }
public interface IChild : IRoot { }
public abstract class AbsRoot : IRoot { }
public abstract class AbsChild : AbsRoot { }
public class ConcRoot : AbsRoot { }
public sealed class ConcSub : ConcRoot { }
public sealed class Other { }
`

const cases = [
  {
    name: '接口档 + 非接口子类 → 违规',
    source: `${family}
public sealed class A { public void Use(IRoot any, AbsRoot too) { } }
`,
    red: 1,
  },
  {
    name: '接口档 + 接口子类 → 合法',
    source: `${family}
public sealed class A { public void Use(IRoot any, IChild still) { } }
`,
    red: 0,
  },
  {
    name: '抽象档 + 具体子类 → 违规',
    source: `${family}
public sealed class A { public void Use(AbsRoot any, ConcRoot too) { } }
`,
    red: 1,
  },
  {
    name: '抽象档 + 抽象子类 → 合法',
    source: `${family}
public sealed class A { public void Use(AbsRoot any, AbsChild still) { } }
`,
    red: 0,
  },
  {
    name: '具体档 + 子类 → 违规（具体到底了，不许再往下）',
    source: `${family}
public sealed class A { public void Use(ConcRoot any, ConcSub too) { } }
`,
    red: 1,
  },
  {
    name: '具体档 + 兄弟（同父不同枝）→ 合法',
    source: `${family}
public sealed class Sibling : AbsRoot { }
public sealed class A { public void Use(ConcRoot any, Sibling other) { } }
`,
    red: 0,
  },
  {
    name: '族外类型 → 合法',
    source: `${family}
public sealed class A { public void Use(IRoot any, Other unrelated) { } }
`,
    red: 0,
  },
  {
    name: '全局判（同时引用抽象与全部具现）→ 红，不看它在哪个目录',
    layout: {
      'Core/Interfaces/Types.cs': `${family}`,
      'Core/Forge.cs': `namespace T;

public sealed class Forge
{
    public void Use(IRoot any, ConcRoot made) { }
}
`,
    },
    red: 1,
  },
  {
    name: 'META_REF_LEVEL_01 接受显式 waive',
    layout: {
      'Core/Interfaces/Types.cs': `${family}`,
      'Core/Forge.cs': `namespace T;

// [Administrator 2026-10-18 waive=META_REF_LEVEL_01 why=plumbing] UE 只能按具体类型注册
public sealed class Forge
{
    public void Use(IRoot any, ConcRoot made) { }
}
`,
    },
    red: 0,
    expect: /豁免 1 个类型（plumbing 1）/,
  },
  {
    name: 'waive 只放行写了它的类型，旧 D-01 别名仍生效',
    layout: {
      'Core/Interfaces/Types.cs': `${family}
// [Administrator 2026-10-18 waive=D-01 why=plumbing] 只放行我自己
public sealed class Forge
{
    public void Use(IRoot any, ConcRoot made) { }
}

public sealed class Sloppy
{
    public void Use(IRoot any, ConcRoot made) { }
}
`,
    },
    red: 1,
    findings: 1,
  },
  {
    name: '同名类型 → 跳过而不是猜（按名字查会串）',
    trunk: '.',
    layout: {
      'A.cs': `namespace A;

public interface IRoot { }
public class ConcRoot : IRoot { }

public sealed class User
{
    public void Use(IRoot any, ConcRoot made) { }
}
`,
      'B.cs': `namespace B;

public interface IRoot { }
public class ConcRoot { }
`,
    },
    skip: true,
  },
]

const results = []

for (const item of cases) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-tier-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(
    join(dir, '.phicoding', 'config.json'),
    JSON.stringify({ trunk: item.trunk ?? '.', variants: [], trunkComments: 'formatted', author: 'x', plan: '' }),
  )
  if (item.layout) {
    for (const [path, text] of Object.entries(item.layout)) {
      await mkdir(dirname(join(dir, path)), { recursive: true })
      await writeFile(join(dir, path), text)
    }
  } else {
    await mkdir(join(dir, 'Core', 'Interfaces'), { recursive: true })
    await writeFile(join(dir, 'Core', 'Interfaces', 'Types.cs'), item.source)
  }

  const result = spawnSync('node', [cli, '--root', dir, '--only', 'META_REF_LEVEL_01'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })

  let ok
  if (item.skip) {
    ok = result.status === 0 && /skip\s+META_REF_LEVEL_01/.test(out) && /同名类型/.test(out)
  } else {
    const red = out.match(/^\s{3}RED\s+META_REF_LEVEL_01/m) ? 1 : 0
    const hitLines = out.split('\n').filter((line) => /引用了.*又引用了/.test(line)).length
    const expectedFindings = item.findings ?? item.red
    const expectedRed = item.red > 0 ? 1 : 0
    const explained = !item.expect || item.expect.test(out)
    ok = red === expectedRed && hitLines === expectedFindings && explained
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
console.log(failed === 0 ? `MORE-CONCRETE-TEST=PASS  ${results.length} 项` : `MORE-CONCRETE-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
