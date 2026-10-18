#!/usr/bin/env node
// 0500 的语义测试：注释是结构化记录。
//
// 格式：// pc: author=<用户名> date=<YYYY-MM-DD> note="…" [waive=<规则id,...> why=<类别>]
//
// 每一条约束都配一个反例——尤其是"字段表是封闭的"和"waive 必须说 why"，
// 这两条失效时，一条拼错的注释会静默通过，而它看起来完全合规。
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
    comment: '// pc: author=Administrator date=2026-10-18 note="为什么"',
    red: 0,
  },
  {
    name: '没写 pc: → 违规',
    comment: '// 作者 - 日期 : 旧写法',
    red: 1,
    expect: /必须以 pc: 开头/,
  },
  {
    name: 'author 与项目作者不符 → 违规',
    comment: '// pc: author=someone date=2026-10-18 note="x"',
    red: 1,
    expect: /项目作者是 Administrator/,
  },
  {
    name: '日期不是 YYYY-MM-DD → 违规',
    comment: '// pc: author=Administrator date=2026-10 note="x"',
    red: 1,
    expect: /date 要 YYYY-MM-DD/,
  },
  {
    name: '不认识的字段 → 违规（拼错的键不能静默通过）',
    comment: '// pc: author=Administrator date=2026-10-18 note="x" waiv=0650 why=data',
    red: 1,
    expect: /不认识的字段 waiv/,
  },
  {
    name: '既没 note 也没 waive → 违规（这条注释没说明什么）',
    comment: '// pc: author=Administrator date=2026-10-18',
    red: 1,
    expect: /缺 note/,
  },
  {
    name: 'waive 了却没说 why → 违规',
    comment: '// pc: author=Administrator date=2026-10-18 waive=0650',
    red: 1,
    expect: /却没说 why/,
  },
  {
    name: 'why 不在三类里 → 违规',
    comment: '// pc: author=Administrator date=2026-10-18 waive=0650 why=因为我乐意',
    red: 1,
    expect: /只认 data \/ serialization \/ plumbing/,
  },
  {
    name: '写了 why 却没有 waive → 违规',
    comment: '// pc: author=Administrator date=2026-10-18 note="x" why=data',
    red: 1,
    expect: /写了 why 但没有 waive/,
  },
  {
    name: 'note 里的引号要转义才能写 → 转义后放过',
    comment: '// pc: author=Administrator date=2026-10-18 note="他说\\"走这边\\""',
    red: 0,
  },
  {
    name: '引号没闭合 → 违规',
    comment: '// pc: author=Administrator date=2026-10-18 note="没闭合',
    red: 1,
    expect: /引号没有闭合/,
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
