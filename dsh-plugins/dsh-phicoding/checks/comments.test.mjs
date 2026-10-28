#!/usr/bin/env node
// 0500 的语义测试：注释是结构化记录。
//
// 格式：// [<作者> <日期> <key=value> ...] <原因>
//
// 方括号里是可解析的部分（按空格切），方括号外是给人看的原因。每一条约束都配
// 一个反例——尤其是"字段表是封闭的"和"waive 必须说 why"，这两条失效时，一条
// 拼错的注释会静默通过，而它看起来完全合规。
//
//   node comments.test.mjs
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')

const cases = [
  {
    name: '合规注释 → 放过',
    comment: '// [Administrator 2026-10-18] 为什么',
    red: 0,
  },
  {
    name: '原因里随便写：引号、逗号、方括号、中文标点都不需要转义',
    comment: '// [Administrator 2026-10-18] 他说"走这边"，于是取 items[0]；这就是原因',
    red: 0,
  },
  {
    name: '没有方括号 → 违规',
    comment: '// 作者 - 日期 : 旧写法',
    red: 1,
    expect: /必须以 \[作者 日期\] 开头/,
  },
  {
    name: '方括号没闭合 → 违规',
    comment: '// [Administrator 2026-10-18 没闭合',
    red: 1,
    expect: /方括号没有闭合/,
  },
  {
    name: '方括号里只有作者 → 违规',
    comment: '// [Administrator] x',
    red: 1,
    expect: /至少要「作者 日期」两项/,
  },
  {
    name: '作者与项目作者不符 → 违规',
    comment: '// [someone 2026-10-18] x',
    red: 1,
    expect: /项目作者是 Administrator/,
  },
  {
    name: '日期不是 YYYY-MM-DD → 违规',
    comment: '// [Administrator 2026-10] x',
    red: 1,
    expect: /日期要 YYYY-MM-DD/,
  },
  {
    name: '方括号后面没写原因 → 违规',
    comment: '// [Administrator 2026-10-18]',
    red: 1,
    expect: /缺原因/,
  },
  {
    name: '不认识的字段 → 违规（拼错的键不能静默通过）',
    comment: '// [Administrator 2026-10-18 waiv=0750 why=data] x',
    red: 1,
    expect: /不认识的字段 waiv/,
  },
  {
    name: '方括号里出现裸词 → 违规（第三项起必须是 key=value）',
    comment: '// [Administrator 2026-10-18 随便] x',
    red: 1,
    expect: /不是 key=value/,
  },
  {
    name: 'waive 了却没说 why → 违规',
    comment: '// [Administrator 2026-10-18 waive=0750] x',
    red: 1,
    expect: /却没说 why/,
  },
  {
    name: 'why 不在三类里 → 违规',
    comment: '// [Administrator 2026-10-18 waive=0750 why=因为我乐意] x',
    red: 1,
    expect: /只认 data \/ serialization \/ plumbing/,
  },
  {
    name: '写了 why 却没有 waive → 违规',
    comment: '// [Administrator 2026-10-18 why=data] x',
    red: 1,
    expect: /写了 why 但没有 waive/,
  },
  {
    name: 'waive 多个规则 → 放过',
    comment: '// [Administrator 2026-10-18 waive=0750,0700 why=plumbing] x',
    red: 0,
  },
]

const results = []

for (const item of cases) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-comments-'))
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(
    join(dir, '.phicoding', 'config.json'),
    JSON.stringify({ trunk: '.', variants: [], trunkComments: 'formatted', author: 'Administrator', plan: '' }),
  )
  await writeFile(
    join(dir, 'Types.cs'),
    `namespace T;\n\npublic sealed class D\n{\n${item.comment}\n    public int Value => 0;\n}\n`,
  )

  const result = spawnSync('node', [cli, '--root', dir, '--only', '0500'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })

  const red = out.match(/^\s{3}RED\s+0500/m) ? 1 : 0
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
console.log(failed === 0 ? `COMMENTS-TEST=PASS  ${results.length} 项` : `COMMENTS-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
