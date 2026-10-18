#!/usr/bin/env node
// 0650 的语义测试：禁的是"按字面量分派"，不是"字符串当键"。
//
// 四种分派形状都要报；空串和字符串 ID 当键都要放过；豁免必须说清属于哪一类。
//
//   node string-dispatch.test.mjs
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')

const cases = [
  {
    name: '== 字面量 → 违规',
    source: 'public sealed class D { public bool A(string k) => k == "type1"; }',
    red: 1,
  },
  {
    name: '!= 字面量 → 违规',
    source: 'public sealed class D { public bool A(string k) => "type1" != k; }',
    red: 1,
  },
  {
    name: 'switch 语句 case 字面量 → 违规',
    source: 'public sealed class D { public int A(string k) { switch (k) { case "type1": return 1; } return 0; } }',
    red: 1,
  },
  {
    name: 'switch 表达式臂字面量 → 违规',
    source: 'public sealed class D { public int A(string k) => k switch { "type1" => 1, _ => 0 }; }',
    red: 1,
  },
  {
    name: 'is 字面量模式 → 违规',
    source: 'public sealed class D { public bool A(string k) => k is "type1"; }',
    red: 1,
  },
  {
    name: '空串不是名字 → 放过',
    source: 'public sealed class D { public bool A(string k) => k == ""; }',
    red: 0,
  },
  {
    name: '字符串 ID 当键 → 放过（旧规则的误报）',
    source: 'public sealed class I { } public sealed class D { public System.Collections.Generic.Dictionary<string, I> ById { get; } = new(); }',
    red: 0,
  },
  {
    name: '豁免·序列化 → 放过，且摘要把豁免数说清楚',
    source: `
public sealed class D
{
    // Administrator - 2026-10-18 : 豁免·序列化 —— 线格式里的 type 字段
    public bool A(string wire) => wire == "type1";
}`,
    red: 0,
    expect: /豁免 1 处（数据层 0 \/ 序列化 1 \/ 工程 0）/,
  },
  {
    name: '写了豁免但没说类别 → 违规（不是豁免）',
    source: `
public sealed class D
{
    // Administrator - 2026-10-18 : 豁免 —— 忘了写类别
    public bool A(string k) => k == "type1";
}`,
    red: 1,
    expect: /豁免没说是哪一类/,
  },
  {
    name: '豁免只管它所在的成员，不串到旁边 → 旁边那个仍违规',
    source: `
public sealed class D
{
    // Administrator - 2026-10-18 : 豁免·工程 —— 只管下一个成员
    public bool A(string k) => k == "type1";

    public bool B(string k) => k == "type2";
}`,
    red: 1,
  },
]

const results = []

for (const item of cases) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-dispatch-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(
    join(dir, '.phicoding', 'config.json'),
    JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator', plan: '' }),
  )
  await writeFile(join(dir, 'Types.cs'), `namespace T;\n\n${item.source}\n`)

  const result = spawnSync('node', [cli, '--root', dir, '--only', '0650'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })

  const red = out.match(/^\s{3}RED\s+0650/m) ? 1 : 0
  const hitLines = out.split('\n').filter((line) => /按字面量|豁免没说/.test(line)).length
  const summary = item.expect && item.red === 0 ? item.expect.test(out) : true
  const fine = red === item.red && hitLines === item.red && summary

  results.push({ name: item.name, ok: fine })
  console.log(`${fine ? '  ok   ' : '  FAIL '} ${item.name}`)
  if (!fine) {
    console.log(`         期望 RED=${item.red} 命中行=${item.red}${item.expect ? ' 且摘要匹配' : ''}`)
    console.log(out.split('\n').slice(-10).map((line) => `         ${line}`).join('\n'))
  }
}

const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `STRING-DISPATCH-TEST=PASS  ${results.length} 项` : `STRING-DISPATCH-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
