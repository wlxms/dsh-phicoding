#!/usr/bin/env node
// levels.json 是可选输入，不是正式依赖。
//
// 这条性质容易被"改着改着"弄丢：只要有人把某条规则改成"读不到就报错"，一个
// 设计笔记就又变回了构建闸。所以每条承诺都配一个反例。
//
//   node levels.test.mjs
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')

async function project(levels) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-levels-'))
  await writeFile(
    join(dir, 'Types.cs'),
    'namespace T;\n\npublic sealed class Plain { }\n\npublic sealed class Other { }\n',
  )
  if (levels !== undefined) await writeFile(join(dir, 'levels.json'), JSON.stringify(levels, null, 2))
  return dir
}

function run(root, rule) {
  const result = spawnSync('node', [cli, '--root', root, '--only', rule], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' },
  })
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

const results = []
function expect(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? '  ok   ' : '  FAIL '} ${name}`)
  if (!ok) console.log(detail.split('\n').slice(-8).map((line) => `         ${line}`).join('\n'))
}

// 1 / 2. 没有 levels.json：两条都跳过，整体不算失败
{
  const dir = await project(undefined)
  const a = run(dir, '0850')
  const b = run(dir, '0900')
  expect('没有 levels → 0850 跳过且 exit 0（不是失败）', a.status === 0 && /skip\s+0850/.test(a.out), a.out)
  expect('没有 levels → 0900 跳过且 exit 0', b.status === 0 && /skip\s+0900/.test(b.out), b.out)
  expect('跳过必须写在摘要里（不能混进干净的 OK）', /跳过 1 条/.test(a.out), a.out)
  await rm(dir, { recursive: true, force: true })
}

// 3. 登记了不存在的类型：这是漂了，要报
{
  const dir = await project({ Plain: 0, Ghost: 1 })
  const a = run(dir, '0850')
  expect('levels 里有不存在的类型 → 报 GHOST 且 exit 1', a.status === 1 && /GHOST\s+Ghost/.test(a.out), a.out)
  await rm(dir, { recursive: true, force: true })
}

// 4. 只登记了一部分：合法，但覆盖情况必须打出来（否则"悄悄少判"与"干净"同形）
{
  const dir = await project({ Plain: 0 })
  const a = run(dir, '0850')
  expect('部分登记 → exit 0（完整性不再是硬要求）', a.status === 0, a.out)
  expect('部分登记 → 打覆盖率 1/2', /覆盖 1\/2/.test(a.out), a.out)
  await rm(dir, { recursive: true, force: true })
}

const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `LEVELS-TEST=PASS  ${results.length} 项` : `LEVELS-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
