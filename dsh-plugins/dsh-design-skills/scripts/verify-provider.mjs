// Verify the dsh-design-skills provider without a running harness: register it
// against a fake ctx, enumerate the catalog, and load every body.
//
// It also guards the trap that silently drops a SKILL.md in this harness: a
// frontmatter value containing an ASCII ": " is not a valid YAML plain scalar.
// The provider's own parser is tolerant, but anything that reads the file with
// a real YAML parser would fail, so this script treats it as a hard error.
//
// Usage: node scripts/verify-provider.mjs   (exit 0 = all good)
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { apply, name as providerName } from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const skillsRoot = join(root, 'skills')

const failures = []
const fail = (m) => failures.push(m)

// ── 1. 原始文件层：frontmatter 能不能被真 YAML 解析器接受 ──────────────
const dirs = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

const rows = []
for (const dir of dirs) {
  const file = join(skillsRoot, dir, 'SKILL.md')
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    fail(`${dir}: SKILL.md 读不到`)
    continue
  }
  if (!text.startsWith('---')) { fail(`${dir}: 没有 frontmatter`); continue }
  const end = text.indexOf('\n---', 3)
  if (end === -1) { fail(`${dir}: frontmatter 没有闭合`); continue }
  const block = text.slice(3, end)
  const lines = block.split('\n').filter((l) => l.trim().length > 0)

  const nameLine = lines.find((l) => l.startsWith('name:'))
  const descLine = lines.find((l) => l.startsWith('description:'))
  if (!nameLine) fail(`${dir}: frontmatter 缺 name`)
  if (!descLine) fail(`${dir}: frontmatter 缺 description`)

  const declared = nameLine ? nameLine.slice('name:'.length).trim() : ''
  if (declared !== dir) fail(`${dir}: name "${declared}" 与目录名不一致`)

  if (descLine) {
    const value = descLine.slice('description:'.length).trim()
    if (value.length < 40) fail(`${dir}: description 太短，语义搜索会找不到它`)
    // 唯一的硬错误：ASCII ": " 出现在值里 = 非法 plain scalar
    if (value.includes(': ')) fail(`${dir}: description 含 ASCII ": " —— 真 YAML 解析器会拒绝这个文件`)
    if (value.startsWith('>') || value.startsWith('|')) fail(`${dir}: description 用了块标量，请压成一行`)
  }

  const body = text.slice(end + 4).replace(/^\n+/, '')
  if (body.length < 200) fail(`${dir}: 正文太短（${body.length}B）`)

  rows.push({ dir, bytes: text.length, desc: descLine ? descLine.slice('description:'.length).trim().length : 0 })
}

// ── 2. provider 层：注册 → list → get ──────────────────────────────────
let provider
const ctx = {
  skills: {
    registerProvider(factory) {
      provider = factory({ signal: new AbortController().signal, invalidate() {} })
      return () => {}
    },
  },
}
apply(ctx)

if (!provider) fail('apply() 没有注册 provider')
let listed = []
if (provider) {
  if (provider.name !== providerName) fail(`provider.name 应为 ${providerName}，实际 ${provider.name}`)
  const observation = await provider.list({})
  listed = Array.isArray(observation) ? observation : observation.candidates
  if (!Array.isArray(observation) && observation.complete !== true) fail('list() 的 complete 不是 true，目录不会被缓存')
}
if (listed.length !== dirs.length) fail(`list() 返回 ${listed.length} 条，目录里有 ${dirs.length} 个技能`)

const seen = new Set()
for (const candidate of listed) {
  if (seen.has(candidate.name)) fail(`重名：${candidate.name}`)
  seen.add(candidate.name)
  if (basename(candidate.locator) !== candidate.name) fail(`${candidate.name}: locator 指向 ${candidate.locator}`)
  if (!candidate.rank || typeof candidate.rank !== 'number') fail(`${candidate.name}: 缺 rank`)
  if (!candidate.invocation || typeof candidate.invocation.modelInvocable !== 'boolean') fail(`${candidate.name}: 缺 invocation`)
  if (!candidate.description) fail(`${candidate.name}: 缺 description`)
  const full = provider ? await provider.get(candidate, {}) : undefined
  if (!full) { fail(`${candidate.name}: get() 返回 undefined`); continue }
  if (!full.content || full.content.length < 200) fail(`${candidate.name}: 正文没被加载`)
  if (full.resourceBase?.kind !== 'directory') fail(`${candidate.name}: 缺 directory resourceBase`)
}

// ── 输出 ───────────────────────────────────────────────────────────────
console.log(`provider   ${providerName}`)
console.log(`skills dir ${skillsRoot}`)
console.log('')
console.log('dir'.padEnd(18) + 'bytes'.padStart(7) + '  desc')
for (const r of rows) console.log(r.dir.padEnd(18) + String(r.bytes).padStart(7) + '  ' + r.desc + ' chars')
console.log('')
console.log(`dirs=${dirs.length}  listed=${listed.length}  loadedBodies=${listed.length}`)
if (failures.length === 0) {
  console.log('VERIFY=PASS')
  process.exit(0)
}
console.log('')
for (const f of failures) console.log('FAIL  ' + f)
console.log(`VERIFY=FAIL failures=${failures.length}`)
process.exit(1)
