#!/usr/bin/env node
// Self-test for the session-scope mechanism.
//
// The scope layer decides red / grey / soft, so it decides whether a real
// violation blocks. A bug here is invisible in the worst direction: it would
// report OK on code that violates the rules. So every promise it makes gets a
// counterexample here, and each counterexample names what it is falsifying.
//
//   node scope.test.mjs --fixture <project with .phicoding/config.json + levels.json>
//
// The fixture is copied to a temp dir; the original is never touched.
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')

const at = process.argv.indexOf('--fixture')
const fixture = at >= 0 ? process.argv[at + 1] : undefined
if (!fixture) {
  console.error('用法：node scope.test.mjs --fixture <项目目录>')
  console.error('该目录要带 .phicoding/config.json 与 levels.json，用来当真实工程。')
  process.exit(2)
}

const cleanEnv = { ...process.env }
delete cleanEnv.DSH_SESSION_ID

function run({ root, args = [], env = {} }) {
  const result = spawnSync('node', [cli, '--root', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...cleanEnv, ...env },
  })
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

const results = []
function expect(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail })
  console.log(`${condition ? '  ok   ' : '  FAIL '} ${name}${condition ? '' : `\n         ${detail}`}`)
}

async function fresh(base) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-scope-'))
  await cp(base, dir, {
    recursive: true,
    filter: (from) => !/[\\/](bin|obj|node_modules|\.git)$/.test(from),
  })
  return dir
}

async function edit(file, from, to) {
  const text = await readFile(file, 'utf8')
  if (!text.includes(from)) throw new Error(`fixture anchor missing in ${file}: ${from}`)
  await writeFile(file, text.replace(from, to))
}

console.log(`fixture: ${fixture}\n`)

// ---- 1. 没有基准就不许判 ----------------------------------------------------
{
  const dir = await fresh(fixture)
  const r = run({ root: dir, args: ['--diff'], env: { DSH_SESSION_ID: 'selftest-1' } })
  expect('无基准 → 硬失败 exit 2（不静默当成"什么都没改"）', r.status === 2 && r.out.includes('没有基准'), r.out.slice(-300))
  await rm(dir, { recursive: true, force: true })
}

// ---- 2. 未改动 → 既有违规全部落软，不挡 ------------------------------------
{
  const dir = await fresh(fixture)
  const env = { DSH_SESSION_ID: 'selftest-2' }
  run({ root: dir, args: ['--session-begin'], env })
  const r = run({ root: dir, args: ['--diff'], env })
  expect('未改动 → exit 0，且打印"软"', r.status === 0 && /软 \d+/.test(r.out), r.out.slice(-300))
  expect('未改动 → 摘要标出 (scope)，与 strict 的 OK 不是同一句话', r.out.includes('(scope)'), r.out.slice(-200))
  await rm(dir, { recursive: true, force: true })
}

// ---- 3. 行级精度：改一行，不把同文件别处的旧债拽进来 ----------------------
{
  const dir = await fresh(fixture)
  const env = { DSH_SESSION_ID: 'selftest-3' }
  run({ root: dir, args: ['--session-begin'], env })

  const probe = join(dir, 'Core', 'Adjust.cs')
  await edit(probe, 'public override int Of(Sheet sheet) => amount;', 'public override int Of(Sheet sheet) => amount * 1;')

  // 0700 的 finding 在 Adjust.cs 第 3 行，改的是第 10 行。文件粒度会把第 3 行
  // 一起算成"本次改动"，行粒度不会。这条就是判"轴选错了"的探针。
  const r = run({ root: dir, args: ['--diff'], env })
  const pulled = /RED\s+0700/.test(r.out)
  expect('行级精度 → 改第10行不把第3行的旧债算成本次改动', !pulled, r.out.slice(-600))
  expect('行级精度 → 该次改动仍判 OK', r.status === 0, r.out.slice(-200))
  await rm(dir, { recursive: true, force: true })
}

// ---- 4. 改动范围内的新违规必须拦 ------------------------------------------
{
  const dir = await fresh(fixture)
  const env = { DSH_SESSION_ID: 'selftest-4' }
  run({ root: dir, args: ['--session-begin'], env })

  const probe = join(dir, 'Core', 'Value.cs')
  await edit(
    probe,
    '    public void Add(int amount) => adds.Add(amount);',
    '    public void Add(int amount) => adds.Add(amount);\n\n    public void Probe(int amount)\n    {\n        if (amount > 0) adds.Add(amount);\n        else times.Add(1);\n    }',
  )

  const r = run({ root: dir, args: ['--diff'], env })
  expect('改动范围内新增 else → 拦（exit 1，且 RED 点名 0100）', r.status === 1 && /RED\s+0100-no-else/.test(r.out), r.out.slice(-600))
  await rm(dir, { recursive: true, force: true })
}

// ---- 5. 新文件：整个文件入范围 --------------------------------------------
{
  const dir = await fresh(fixture)
  const env = { DSH_SESSION_ID: 'selftest-5' }
  run({ root: dir, args: ['--session-begin'], env })
  await writeFile(
    join(dir, 'Core', 'Extra.cs'),
    'namespace Spine;\n\npublic abstract class Extra\n{\n    public abstract int Of(Sheet sheet);\n}\n',
  )

  const r = run({ root: dir, args: ['--diff'], env })
  // 0700 红（新抽象没有接口）；0850 不红——等级是可选的设计笔记，新类型没登记
  // 等级不算违规，只让覆盖率往下走。这条断言就是这条契约的探针。
  expect(
    '新文件 → 整文件入范围，0700 红但 0850 不红（等级是可选的）',
    r.status === 1 && /RED\s+0700/.test(r.out) && !/RED\s+0850/.test(r.out),
    r.out.slice(-700),
  )
  await rm(dir, { recursive: true, force: true })
}

// ---- 6. 动作账：不是我的改动不许算我头上 ----------------------------------
{
  const dir = await fresh(fixture)
  const env = { DSH_SESSION_ID: 'selftest-6' }
  run({ root: dir, args: ['--session-begin'], env })

  await writeFile(
    join(dir, 'Core', 'Extra.cs'),
    'namespace Spine;\n\npublic abstract class Extra\n{\n    public abstract int Of(Sheet sheet);\n}\n',
  )
  // 账里只认领 Value.cs（这次没改它）。Extra.cs 是改过的，但不在账里。
  await writeFile(
    join(dir, '.phicoding', 'ledger.jsonl'),
    `${JSON.stringify({ session: 'selftest-6', tool: 'edit', path: 'Core/Value.cs' })}\n`,
  )

  const r = run({ root: dir, args: ['--diff'], env })
  expect('账外改动 → 归灰，不挡（exit 0）', r.status === 0 && /grey\s+0700/.test(r.out), r.out.slice(-700))
  expect('账外改动 → 摘要把"归我/归灰"分开报', /归我 0 · 归灰 1/.test(r.out), r.out.slice(-200))
  await rm(dir, { recursive: true, force: true })
}

// ---- 7. 重拍基准会悄悄挪动基准，必须拒绝 ----------------------------------
{
  const dir = await fresh(fixture)
  const env = { DSH_SESSION_ID: 'selftest-8' }
  run({ root: dir, args: ['--session-begin'], env })
  const again = run({ root: dir, args: ['--session-begin'], env })
  expect('重拍基准 → 拒绝 exit 2（挪基准是静默失效）', again.status === 2 && again.out.includes('已经有基准'), again.out.slice(-300))
  await rm(dir, { recursive: true, force: true })
}

// ---- 9. strict 模式没被改动 ----------------------------------------------
{
  const dir = await fresh(fixture)
  const r = run({ root: dir })
  expect('strict 模式 → 不加 --diff 时仍是全量判据，输出里没有 (scope)', !r.out.includes('(scope)'), r.out.slice(-200))
  await rm(dir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log('')
console.log(failed === 0 ? `SCOPE-SELFTEST=PASS  ${results.length} 项` : `SCOPE-SELFTEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
