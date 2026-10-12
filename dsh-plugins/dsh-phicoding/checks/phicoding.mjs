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
//   phicoding --root <dir> [--only <id>] [--probe] [--list] [--json]
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
const wantProbe = flag('--probe')
// Rules are generic; a project's shape is not. Which directory is the trunk,
// what the comment format is, who the author is - all of that belongs to the
// project, so a rule reads it from here rather than hard-coding it.
const configPath = value('--config') ?? join(root, '.phicoding', 'config.json')

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

function runRule(rule, factsPath, levelsPath, toolsDir, runRoot) {
  const ext = extname(rule.path).toLowerCase()
  // --rules points at the language's rule directory, so a project rule can check
  // that the rule it names actually exists instead of trusting a hand-kept list.
  const common = ['--facts', factsPath, '--levels', levelsPath, '--config', configPath, '--rules', toolsDir, '--root', runRoot]
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

// ---- probe -----------------------------------------------------------------
// Each rule may declare a `probe`: what to inject to make it, and only it, go
// red. A rule without one is reported as an uncovered gap rather than passed
// over - the gap is the finding.
async function probeSpec(rule) {
  const ext = extname(rule.path).toLowerCase()
  const node = ext === '.mjs' || ext === '.js'
  const launcher = node ? 'node' : ext === '.sh' ? 'sh' : rule.path
  const argv = node || ext === '.sh' ? [rule.path, '--probe-spec'] : ['--probe-spec']
  const asked = spawnSync(launcher, argv, { encoding: 'utf8' })
  if (asked.status !== 0) return null
  try {
    return JSON.parse((asked.stdout ?? '').trim())
  } catch {
    return null
  }
}

async function copyTree(from, to) {
  await mkdir(to, { recursive: true })
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const src = join(from, entry.name)
    const dst = join(to, entry.name)
    if (entry.isDirectory()) await copyTree(src, dst)
    else await copyFile(src, dst)
  }
}

// Every probe runs against a throwaway COPY of the project.
//
// A checker must not write to the code it is judging. Injecting in place and
// restoring afterwards looks equivalent and is not: a crash, a Ctrl-C or a
// killed process leaves the injection behind, so the act of checking silently
// modifies the project. The original tree stays read-only.
async function runProbes(dll, allRules, levelsPath, toolsDir, sourceRoot, baseRed) {
  const results = []
  for (const rule of allRules) {
    // The net had a precondition nobody wrote down: it compared against an
    // absolute "nothing else is red". One rule the project already violates then
    // reddens every other rule's probe, and the whole net reads FAIL for one
    // unrelated reason. So the baseline is measured first, and a rule that is
    // already red says so instead of pretending its probe proved anything.
    if (baseRed.has(rule.id)) {
      results.push({ id: rule.id, verdict: 'baseline-red' })
      continue
    }
    const spec = await probeSpec(rule)
    if (!spec) {
      results.push({ id: rule.id, verdict: 'no-probe' })
      continue
    }

    const copy = await mkdtemp(join(tmpdir(), 'phicoding-probe-'))
    try {
      await copyTree(sourceRoot, copy)
      const target = join(copy, spec.file)
      if (!existsSync(target)) {
        results.push({ id: rule.id, verdict: 'probe-file-missing', detail: spec.file })
        continue
      }
      const original = await readFile(target, 'utf8')

      // A probe edits an existing type rather than appending a new one. A new
      // type would be unregistered, which reddens the registration rule too -
      // and a probe must redden exactly the rule it belongs to.
      if (spec.kind === 'replace' && !original.includes(spec.find)) {
        results.push({ id: rule.id, verdict: 'probe-anchor-missing', detail: spec.find.slice(0, 60) })
        continue
      }

      await writeFile(target, spec.kind === 'create'
        ? spec.inject
        : spec.kind === 'replace'
          ? original.replace(spec.find, spec.with)
          : original + '\n' + spec.inject, 'utf8')

      const probeFacts = join(copy, '.probe-facts.json')
      const payload = runBase(dll, copy, probeFacts)
      // The base returns the JSON; a rule reads it from disk. Forgetting this
      // line made every rule fail with "cannot read facts" and the probe net
      // reported it as every rule reddening every other - which is exactly what
      // the net is for.
      await writeFile(probeFacts, payload.text, 'utf8')
      const red = allRules.map((r) => runRule(r, probeFacts, levelsPath, toolsDir, copy)).filter((r) => !r.ok)
      const mine = red.filter((r) => r.id === rule.id)
      const others = red.filter((r) => r.id !== rule.id && !baseRed.has(r.id))
      results.push({
        id: rule.id,
        verdict: mine.length === 1 && others.length === 0
          ? 'ok'
          : mine.length === 0
            ? 'stayed-green'
            : `reddened-others: ${others.map((o) => o.id).join(', ')}`
      })
    } finally {
      // The original is untouched either way; this only cleans the scratch copy.
      await rm(copy, { recursive: true, force: true })
    }
  }
  return results
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

const report = { root, languages: [], failed: 0 }

for (const lang of active) {
  const entry = { ext: lang.ext, files: lang.count, rules: [], probes: [] }
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
  // Levels are a project's own design declaration, not the checker's data: two
  // projects with the same code have different level maps. So it lives with the
  // project, and --levels exists for when the root is a subdirectory of it.
  const levelsPath = value('--levels') ?? join(root, 'levels.json')

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

  if (wantProbe) {
    const baseRed = new Set(
      all.map((r) => runRule(r, factsPath, levelsPath, lang.dir, root)).filter((r) => !r.ok).map((r) => r.id)
    )
    entry.probes = await runProbes(dll, all, levelsPath, lang.dir, root, baseRed)
    for (const p of entry.probes) {
      const quiet = p.verdict === 'ok' || p.verdict === 'no-probe' || p.verdict === 'baseline-red'
      const mark = p.verdict === 'ok' ? 'ok  ' : p.verdict === 'no-probe' ? 'GAP ' : p.verdict === 'baseline-red' ? 'BASE' : 'FAIL'
      console.log(`   ${mark} ${p.id}${p.detail ? '  ' + p.detail : ''}${quiet ? '' : '  ' + p.verdict}`)
      if (!quiet) report.failed++
    }
    const gaps = entry.probes.filter((p) => p.verdict === 'no-probe').length
    if (gaps > 0) console.log(`   探针覆盖缺口 ${gaps} 条 —— 没被反例验过的规则，等于没验过`)
    const already = entry.probes.filter((p) => p.verdict === 'baseline-red')
    if (already.length > 0) {
      console.log(`   基线已红 ${already.length} 条：${already.map((p) => p.id).join(', ')}`)
      console.log('   规则确实会红（项目自己证的），但探针证明不了它只红自己 —— 把项目修绿，这条网才算完整')
    }
    await rm(dir, { recursive: true, force: true })
    report.languages.push(entry)
    continue
  }

  for (const rule of chosen) {
    const result = runRule(rule, factsPath, levelsPath, lang.dir, root)
    entry.rules.push(result)
    if (result.ok) {
      console.log(`   green ${result.id}`)
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
console.log(report.failed === 0 ? 'PHICODING=OK' : `PHICODING=FAILED  ${report.failed} 项`)
process.exit(report.failed === 0 ? 0 : 1)
