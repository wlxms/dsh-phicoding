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
public sealed class A { public IRoot Any { get; set; } = null!; public AbsRoot Too { get; set; } = null!; }
`,
    red: 1,
  },
  {
    name: '接口档 + 接口子类 → 合法',
    source: `${family}
public sealed class A { public IRoot Any { get; set; } = null!; public IChild Still { get; set; } = null!; }
`,
    red: 0,
  },
  {
    name: '抽象档 + 具体子类 → 违规',
    source: `${family}
public sealed class A { public AbsRoot Any { get; set; } = null!; public ConcRoot Too { get; set; } = null!; }
`,
    red: 1,
  },
  {
    name: '抽象档 + 抽象子类 → 合法',
    source: `${family}
public sealed class A { public AbsRoot Any { get; set; } = null!; public AbsChild Still { get; set; } = null!; }
`,
    red: 0,
  },
  {
    name: '具体档 + 子类 → 违规（具体到底了，不许再往下）',
    source: `${family}
public sealed class A { public ConcRoot Any { get; set; } = null!; public ConcSub Too { get; set; } = null!; }
`,
    red: 1,
  },
  {
    name: '具体档 + 兄弟（同父不同枝）→ 合法',
    source: `${family}
public sealed class Sibling : AbsRoot { }
public sealed class A { public ConcRoot Any { get; set; } = null!; public Sibling Other { get; set; } = null!; }
`,
    red: 0,
  },
  {
    name: '族外类型 → 合法',
    source: `${family}
public sealed class A { public IRoot Any { get; set; } = null!; public Other Unrelated { get; set; } = null!; }
`,
    red: 0,
  },
  {
    name: '工厂（同时引用抽象与全部具现）→ 全局判，不管它在哪个目录',
    layout: {
      'Core/Types.cs': `${family}`,
      'Data/Forge.cs': `namespace T;

public sealed class Forge
{
    public IRoot Any { get; set; } = null!;
    public ConcRoot Made { get; set; } = null!;
}
`,
    },
    red: 1,
  },
  {
    name: '同一个工厂写了 waive=0750 → 放过，且摘要报告豁免',
    layout: {
      'Core/Types.cs': `${family}`,
      'Data/Forge.cs': `namespace T;

// [Administrator 2026-10-18 waive=0750 why=plumbing] 这是工厂，它必须认识全部具现
public sealed class Forge
{
    public IRoot Any { get; set; } = null!;
    public ConcRoot Made { get; set; } = null!;
}
`,
    },
    red: 0,
    expect: /豁免 1 个类型（plumbing 1）/,
  },
  {
    name: '豁免只作用于写了它的那个类型 → 旁边那个仍违规',
    layout: {
      'Core/Types.cs': `${family}
// [Administrator 2026-10-18 waive=0750 why=plumbing] 只放行我自己
public sealed class Forge
{
    public IRoot Any { get; set; } = null!;
    public ConcRoot Made { get; set; } = null!;
}

public sealed class Sloppy
{
    public IRoot Any { get; set; } = null!;
    public ConcRoot Made { get; set; } = null!;
}
`,
    },
    red: 1,
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
    public IRoot Any { get; set; } = null!;
    public ConcRoot Made { get; set; } = null!;
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
    await writeFile(join(dir, 'Types.cs'), item.source)
  }

  const result = spawnSync('node', [cli, '--root', dir, '--only', '0750'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })

  let ok
  if (item.skip) {
    ok = result.status === 0 && /skip\s+0750/.test(out) && /同名类型/.test(out)
  } else {
    const red = out.match(/^\s{3}RED\s+0750/m) ? 1 : 0
    const hitLines = out.split('\n').filter((line) => /引用了.*又引用了/.test(line)).length
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
console.log(failed === 0 ? `MORE-CONCRETE-TEST=PASS  ${results.length} 项` : `MORE-CONCRETE-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
