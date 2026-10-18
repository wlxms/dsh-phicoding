#!/usr/bin/env node
// phicoding - the checker CLI.
//
// Two layers, and the split is the whole design:
//
//   base   one per language, under checks/<.ext>/facts/. It parses and prints
//          facts.json. It does not judge.
//   rules  one script per rule, under checks/<.ext>/, named <priority>-<name>.
//          Each reads facts.json and decides. It does not parse.
//
// So a rule needs no knowledge of Roslyn (or of C#, or of any language), the
// parse happens once no matter how many rules run, and adding a rule means
// dropping a file in a directory - never editing a list. The rule set and its
// order are both derived from the file names.
//
// A base that fails is a hard error. It is never "no rules, so nothing failed":
// a checker that goes blind reports the same thing as success.
//
// Usage:
//   phicoding --root <dir> [--only <id>] [--list] [--json]
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as scope from './scope.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SKIP = new Set(['bin', 'obj', 'node_modules', '.git', '.build'])

// ---- arguments -------------------------------------------------------------
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name) => {
  const at = argv.indexOf(name)
  return at >= 0 ? argv[at + 1] : undefined
}

const root = value('--root') ?? process.cwd()
const only = value('--only')
const wantList = flag('--list')
const wantJson = flag('--json')
// Rules are generic; a project's shape is not. Which directory is the trunk,
// what the comment format is, who the author is - all of that belongs to the
// project, so a rule reads it from here rather than hard-coding it.
const configPath = value('--config') ?? join(root, '.phicoding', 'config.json')

// ---- session scope ---------------------------------------------------------
// An established project already violates most of these rules, and a checker that
// reports all of it at once is ignored. So the session can narrow what counts:
// only what this session touched is enforced, everything else is measured but not
// blocking. See scope.mjs for why the comparison alone cannot attribute a change.
const wantBegin = flag('--session-begin')
const wantDiff = flag('--diff')
const sessionId = value('--session') ?? process.env.DSH_SESSION_ID

if (wantBegin) {
  if (!sessionId) {
    console.error('phicoding: --session-begin 需要会话标识。用 --session <id> 指定，或设置 DSH_SESSION_ID。')
    process.exit(2)
  }
  if (existsSync(scope.manifestPath(root, sessionId)) && !flag('--force')) {
    // Recapturing moves the baseline, and the move is invisible afterwards: every
    // change made before the second capture would silently stop counting.
    console.error(`phicoding: 本会话已经有基准了（${sessionId}）。重拍会把基准挪到此刻，之前改的东西会被当成没改。加 --force 才能覆盖。`)
    process.exit(2)
  }
  const manifest = await scope.capture({ root, session: sessionId })
  console.log(`基准已拍：${sessionId}`)
  console.log(`  文件 ${manifest.files} 个 / ${manifest.bytes} 字节   内容模式 ${manifest.mode}（存了 ${manifest.contents} 个文件的内容）`)
  console.log(`  ${scope.manifestPath(root, sessionId)}`)
  process.exit(0)
}

// ---- language directories --------------------------------------------------
// A directory whose name starts with "." is a language, and its name is the
// file extension that language owns. Adding a language adds no code here.
async function languages() {
  const found = []
  for (const entry of await readdir(here, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('.')) continue
    found.push({ ext: entry.name, dir: join(here, entry.name) })
  }
  return found.sort((a, b) => a.ext.localeCompare(b.ext))
}

async function filesWithExt(dir, ext, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await filesWithExt(path, ext, out)
    else if (entry.name.endsWith(ext)) out.push(path)
  }
  return out
}

// ---- rules -----------------------------------------------------------------
// name = <4-digit priority>-<rule name>.<any>. Order comes from the file name,
// so inserting a rule never means renumbering or editing anything else.
async function rulesOf(langDir, extraDir) {
  const found = []
  for (const [dir, local] of [[langDir, false], [extraDir, true]]) {
    if (!dir || !existsSync(dir)) continue
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (!/^\d{4}-.+\.(mjs|js|sh|cmd|exe|py)$/.test(entry.name)) continue
      found.push({ id: entry.name.replace(/\.[^.]+$/, ''), path: join(dir, entry.name), file: entry.name, local })
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file))
}

// A project's own rules live with the project: they encode choices that belong
// to one design (which strings are data, what the display language is) and would
// be wrong imposed on every other project.
const localRules = join(root, '.phicoding', 'rules')

function runRule(rule, factsPath, toolsDir, runRoot) {
  const ext = extname(rule.path).toLowerCase()
  // --rules points at the language's rule directory, so a project rule can check
  // that the rule it names actually exists instead of trusting a hand-kept list.
  const common = ['--facts', factsPath, '--config', configPath, '--rules', toolsDir, '--root', runRoot]
  const launched = ext === '.mjs' || ext === '.js'
    ? ['node', [rule.path, ...common]]
    : ext === '.sh'
      ? ['sh', [rule.path, ...common]]
      : [rule.path, common]
  const result = spawnSync(launched[0], launched[1], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return {
    id: rule.id,
    file: rule.file,
    ok: result.status === 0,
    // Exit 3 means "not applicable": an optional input is absent, so the rule judged
    // nothing. It is neither a pass nor a failure, and it must not be printed as one.
    skipped: result.status === 3,
    status: result.status,
    output: (result.stdout ?? '').trim(),
    error: (result.stderr ?? '').trim()
  }
}

// ---- the base --------------------------------------------------------------
async function ensureBase(langDir) {
  const factsDir = join(langDir, 'facts')
  const buildDir = join(langDir, '.build')
  const dll = join(buildDir, 'Facts.dll')
  if (existsSync(dll)) return dll

  if (!existsSync(join(factsDir, 'Facts.csproj'))) {
    throw new Error(`没有底座：${relative(here, factsDir)} 里找不到 Facts.csproj`)
  }
  if (spawnSync('dotnet', ['--version'], { encoding: 'utf8' }).status !== 0) {
    throw new Error('这台机器上没有 dotnet。PhiCoding 的 C# 底座需要 .NET SDK：https://dotnet.microsoft.com/download')
  }
  process.stderr.write('phicoding: 首次运行，编译 C# 底座（静默，失败才出声）…\n')
  // Build output is captured, not inherited: MSBuild and Roslyn speak English
  // and volume, and a passing build has nothing worth saying. Only a failure
  // speaks, and only its last lines.
  const built = spawnSync('dotnet', ['publish', factsDir, '-c', 'Release', '-o', buildDir, '--nologo', '-v', 'quiet', '-clp:NoSummary'], {
    encoding: 'utf8',
    env: { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' }
  })
  if (built.status !== 0 || !existsSync(dll)) {
    const tail = `${built.stdout ?? ''}${built.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n')
    throw new Error(`底座编译失败（退出码 ${built.status}）。规则一条都不会跑——这是失败，不是"全部通过"。\n${tail}`)
  }
  return dll
}

function runBase(dll, targetRoot, factsPath) {
  const result = spawnSync('dotnet', [dll, targetRoot], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (result.status !== 0) {
    throw new Error(`底座退出码 ${result.status}：${(result.stderr ?? '').trim()}`)
  }
  const text = (result.stdout ?? '').trim()
  if (!text.startsWith('{')) {
    throw new Error(`底座没有输出 facts JSON：${text.slice(0, 200)}`)
  }
  const facts = JSON.parse(text)
  if (!Array.isArray(facts.types) || facts.types.length === 0) {
    throw new Error(`底座扫到 0 个类型（根目录 ${root}）。扫不到就是失败，不许当成"没有违规"。`)
  }
  return { facts, text }
}


// ---- main ------------------------------------------------------------------
const langDirs = await languages()

if (wantList) {
  for (const lang of langDirs) {
    console.log(`${lang.ext}/`)
    for (const rule of await rulesOf(lang.dir, localRules)) {
      console.log(`  ${rule.id}${rule.local ? '   (项目)' : ''}`)
    }
  }
  process.exit(0)
}

const active = []
for (const lang of langDirs) {
  const hits = await filesWithExt(root, lang.ext)
  if (hits.length > 0) active.push({ ...lang, count: hits.length })
}

if (active.length === 0) {
  console.error(`phicoding: ${root} 下没有找到任何已支持语言的文件（支持：${langDirs.map((l) => l.ext).join(' ')}）`)
  process.exit(2)
}

const report = { root, languages: [], failed: 0, soft: 0, grey: 0, skipped: 0 }

// ---- findings and scope ----------------------------------------------------
// A rule prints one finding per line. Every `path:line` inside the line is one of
// the finding's locations; the first is the primary one. A finding with no
// location cannot be scoped, and an unscopable failure is always blocking -
// "I could not read my config" must never soften into "not mine".
const LOCATION = /([A-Za-z0-9_.\-\\/]+\.[A-Za-z0-9]+):(\d+)/g

function locationsIn(line) {
  const found = []
  for (const match of line.matchAll(LOCATION)) {
    found.push({ file: match[1].replaceAll('\\', '/'), line: Number(match[2]) })
  }
  return found
}

function firstLine(text) {
  return (text ?? '').split('\n').find((line) => line.trim()) ?? ''
}

function classify(result, mine, other) {
  const red = []
  const grey = []
  const soft = []
  for (const line of (result.output ?? '').split('\n')) {
    if (!line.trim()) continue
    const places = locationsIn(line)
    if (places.length === 0) {
      red.push(line)
      continue
    }
    const mineHit = places.some((place) => scope.inScope(mine, place.file, place.line))
    if (mineHit) {
      red.push(line)
      continue
    }
    // Changed during the session but not claimed by this session's ledger: very
    // likely another agent working in the same directory, or a change made through
    // a shell. It is reported, but it is not this session's to block on.
    const otherHit = places.some((place) => scope.inScope(other, place.file, place.line))
    ;(otherHit ? grey : soft).push(line)
  }
  return { red, grey, soft }
}

let mine
let other
let scopeInfo
if (wantDiff) {
  if (!sessionId) {
    console.error('phicoding: --diff 需要会话标识。用 --session <id> 指定，或设置 DSH_SESSION_ID。')
    process.exit(2)
  }
  const snapshot = await scope.loadCapture(root, sessionId)
  if (!snapshot) {
    // Not "everything changed", and not "nothing changed": there is no baseline,
    // so there is nothing honest to compare against.
    console.error(`phicoding: 本会话没有基准（${sessionId}）。先跑 --session-begin。`)
    process.exit(2)
  }
  const comparison = await scope.compare(root, snapshot)
  const ledger = scope.loadLedger(root, sessionId)
  const attributed = scope.attribute(comparison.changed, ledger)
  mine = attributed.mine
  other = attributed.other
  scopeInfo = {
    session: sessionId,
    mode: snapshot.mode,
    changed: comparison.changed.size,
    mine: attributed.mine.size,
    other: attributed.other.size,
    added: comparison.added.length,
    removed: comparison.removed.length,
    skipped: comparison.skipped,
    ledger: ledger !== undefined,
  }
  const mode = scopeInfo.ledger ? '账内归我 / 账外归灰' : '无动作账，改动全部归我'
  console.log(`== scope  ${sessionId}  模式 ${snapshot.mode} · ${mode}`)
  console.log(`   改动 ${scopeInfo.changed} 文件（新增 ${scopeInfo.added}）· 跳过 ${scopeInfo.skipped} 文件未变`)
  console.log('')
}

for (const lang of active) {
  const entry = { ext: lang.ext, files: lang.count, rules: [] }
  console.log(`== ${lang.ext}  ${lang.count} 个文件`)

  let dll
  try {
    dll = await ensureBase(lang.dir)
  } catch (error) {
    console.log(`   BASE 失败：${error.message}`)
    entry.baseFailed = error.message
    report.failed++
    report.languages.push(entry)
    continue
  }

  const dir = await mkdtemp(join(tmpdir(), 'phicoding-'))
  const factsPath = join(dir, 'facts.json')
  let facts
  try {
    const payload = runBase(dll, root, factsPath)
    facts = payload.facts
    await writeFile(factsPath, payload.text, 'utf8')
  } catch (error) {
    console.log(`   BASE 失败：${error.message}`)
    entry.baseFailed = error.message
    report.failed++
    await rm(dir, { recursive: true, force: true })
    report.languages.push(entry)
    continue
  }

  console.log(`   底座：types=${facts.types.length}  refs=${facts.references.length}`)

  const all = await rulesOf(lang.dir, localRules)
  const chosen = only ? all.filter((r) => r.id.includes(only)) : all

  for (const rule of chosen) {
    const result = runRule(rule, factsPath, lang.dir, root)
    entry.rules.push(result)

    if (wantDiff) {
      // A green rule found nothing anywhere, which is also nothing in scope. It
      // must be reported before classification: an empty output is not evidence of
      // a broken rule, it is evidence of a clean one.
      if (result.ok) {
        console.log(`   green ${result.id}`)
        if (result.output) for (const line of result.output.split('\n')) console.log(`           ${line}`)
        continue
      }
      if (result.skipped) {
        console.log(`   skip  ${result.id}   ${firstLine(result.output)}`)
        report.skipped++
        continue
      }
      const { red, grey, soft } = classify(result, mine, other)
      // A rule that exited non-zero without producing a scoped finding did not
      // "find nothing in my scope" - it failed. That is blocking either way.
      const broke = red.length === 0 && grey.length === 0 && soft.length === 0
      if (red.length > 0 || broke) {
        console.log(`   RED   ${result.id}   ${broke ? '（没有产出任何可定位的 finding）' : red.length + ' 处'}`)
        for (const line of red) console.log(`           ${line}`)
        report.failed++
      } else if (grey.length > 0) {
        console.log(`   grey  ${result.id}   ${grey.length} 处（改过但不在本会话的账里，未挡）`)
        for (const line of grey) console.log(`           ${line}`)
        report.grey += grey.length
      } else {
        console.log(`   soft  ${result.id}   ${soft.length} 处（改动范围外，未挡）`)
        report.soft += soft.length
      }
      if (result.error) {
        const brief = result.error.split('\n')
        for (const line of brief.slice(0, 8)) console.log(`           ! ${line}`)
        if (brief.length > 8) console.log('           ! …')
      }
      continue
    }

    if (result.ok) {
      console.log(`   green ${result.id}`)
      if (result.output) for (const line of result.output.split('\n')) console.log(`           ${line}`)
    } else if (result.skipped) {
      // Not applicable: an optional input is absent. Printing this as `green` would
      // claim the rule looked and found nothing; it looked at nothing.
      console.log(`   skip  ${result.id}   ${firstLine(result.output)}`)
      report.skipped++
    } else {
      console.log(`   RED   ${result.id}`)
      if (result.output) for (const line of result.output.split('\n')) console.log(`           ${line}`)
      // A Node stack trace is not a finding: eight lines are enough to see what
      // broke, and the rest is noise the reader has to wade through.
      if (result.error) {
        const brief = result.error.split('\n')
        for (const line of brief.slice(0, 8)) console.log(`           ! ${line}`)
        if (brief.length > 8) console.log('           ! …')
      }
      report.failed++
    }
  }

  if (chosen.length === 0) {
    console.log(`   RED   没有规则（${lang.dir} 下没有 <优先级>-<名称> 脚本）`)
    report.failed++
  }

  await rm(dir, { recursive: true, force: true })
  report.languages.push(entry)
}

if (wantJson) console.log(JSON.stringify(report, null, 2))
console.log('')
// A skipped rule judged nothing. It must never be folded into a plain OK, or the
// summary would claim coverage the run did not have.
const tail = report.skipped > 0 ? `  跳过 ${report.skipped} 条（可选输入缺失，不算通过）` : ''
if (wantDiff) {
  // A scoped pass and a strict pass mean different things. Printing the same line
  // for both would turn "nothing changed" into "compliant" - the exact silent
  // downgrade this checker exists to refuse.
  console.log(`scope  ${scopeInfo.session} · 模式 ${scopeInfo.mode} · 改动 ${scopeInfo.changed} 文件 · 归我 ${scopeInfo.mine} · 归灰 ${scopeInfo.other}`)
  console.log(
    report.failed === 0
      ? `PHICODING=OK  (scope)  红 0 · 灰 ${report.grey} · 软 ${report.soft}${tail}`
      : `PHICODING=FAILED  ${report.failed} 项（scope）${tail}`
  )
} else {
  console.log(report.failed === 0 ? `PHICODING=OK${tail}` : `PHICODING=FAILED  ${report.failed} 项${tail}`)
}
process.exit(report.failed === 0 ? 0 : 1)
