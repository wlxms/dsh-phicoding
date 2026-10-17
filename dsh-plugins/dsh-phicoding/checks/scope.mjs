// Session scope: what did *this* session change?
//
// Two facts, two jobs, and keeping them apart is the whole design:
//
//   capture  a photograph of the tree taken before the work starts. It answers
//            "is this file different from the baseline?" and, when the tree is
//            small enough, "which lines differ".
//   ledger   one line per structured edit, written by whoever performed it. It
//            answers "was that change mine?" - which a tree comparison can never
//            answer, because in a shared directory someone else's work looks
//            exactly like yours.
//
// So the comparison never decides attribution on its own: with no ledger every
// change counts as mine (conservative, the safe direction), and with a ledger the
// changes it does not mention are downgraded instead of blamed on me.
//
// Nothing here parses code. This module only decides ranges.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

// `.phicoding` is skipped on purpose: the capture and the ledger live there, so
// including them would make every diff report its own bookkeeping as a change.
const SKIP = new Set(['bin', 'obj', 'node_modules', '.git', '.build', '.phicoding', '.recovery-tmp', 'dist', '.vs'])

// A file bigger than this is not stored; a change to it therefore widens to the
// whole file. Over-approximating is allowed. Missing a change is not.
const FILE_CONTENT_CAP = 2 * 1024 * 1024
const TOTAL_CONTENT_CAP = 64 * 1024 * 1024

export const sha = (buffer) => createHash('sha256').update(buffer).digest('hex')

export function toPosix(path) {
  return path.split(sep).join('/')
}

async function walk(root, dir = root, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(root, full, out)
      continue
    }
    if (entry.isFile()) out.push(toPosix(relative(root, full)))
  }
  return out
}

export async function filesOf(root) {
  return (await walk(root)).sort()
}

// Per-file work is syscall bound, not byte bound: 2000 tiny files cost the same as
// 2000 large ones. A bounded pool turns a serial stat storm into a few round trips
// without risking EMFILE on a big tree.
const CONCURRENCY = 32

async function mapLimit(items, fn) {
  const out = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      out[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return out
}

async function writeAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

function captureDir(root) {
  return join(root, '.phicoding', 'captures')
}

export function manifestPath(root, session) {
  return join(captureDir(root), `${session}.manifest.json`)
}

export function contentPath(root, session) {
  return join(captureDir(root), `${session}.content.json.gz`)
}

/**
 * Photograph the tree.
 *
 * Content is kept only when the whole tree fits under the cap. Hash-only mode is
 * still correct - it just widens every change to the whole file, which is why the
 * mode is recorded and printed rather than silently chosen.
 */
export async function capture({ root, session, startedAt = Date.now() }) {
  const paths = await filesOf(root)
  const files = {}
  const texts = {}
  let bytes = 0
  let stored = 0

  const read = await mapLimit(paths, async (path) => {
    const full = join(root, path)
    const info = await stat(full)
    const buffer = await readFile(full)
    return { path, mtime: info.mtimeMs, buffer }
  })

  // Kept serial on purpose: `stored` is a running budget for the total cap, and a
  // concurrent version would let the total overshoot it.
  for (const { path, mtime, buffer } of read) {
    bytes += buffer.length
    const record = { size: buffer.length, mtime, sha: sha(buffer) }
    if (buffer.length <= FILE_CONTENT_CAP && stored + buffer.length <= TOTAL_CONTENT_CAP && isText(buffer)) {
      texts[path] = buffer.toString('utf8')
      stored += buffer.length
      record.text = true
    }
    files[path] = record
  }

  const mode = Object.keys(texts).length > 0 ? (stored < bytes ? 'partial' : 'content') : 'hash'
  const manifest = {
    session,
    root,
    startedAt,
    mode,
    files: Object.keys(files).length,
    bytes,
    contents: Object.keys(texts).length,
    fingerprint: Object.fromEntries(Object.entries(files).map(([path, record]) => [path, record])),
  }

  await mkdir(captureDir(root), { recursive: true })
  if (Object.keys(texts).length > 0) {
    await writeAtomic(contentPath(root, session), gzipSync(JSON.stringify(texts)))
  }
  await writeAtomic(manifestPath(root, session), JSON.stringify(manifest, null, 2))
  return manifest
}

function isText(buffer) {
  // A cheap binary probe: a NUL byte in the first 8 KB is enough to say "do not
  // store this as text". Storing a binary as utf8 would corrupt it silently.
  const window = buffer.subarray(0, Math.min(buffer.length, 8192))
  return !window.includes(0)
}

export async function loadCapture(root, session) {
  const path = manifestPath(root, session)
  if (!existsSync(path)) return undefined
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  let texts = {}
  if (existsSync(contentPath(root, session))) {
    texts = JSON.parse(gunzipSync(await readFile(contentPath(root, session))).toString('utf8'))
  }
  return { ...manifest, texts }
}

/**
 * Line ranges that differ, in NEW coordinates, 1-based.
 *
 * Common prefix and suffix are trimmed, so the common case - one contiguous edit
 * inside a large file - comes out exact. Several scattered edits widen to one span
 * covering them all. That is deliberate: a wider scope only checks more.
 */
export function changedRanges(oldText, newText) {
  if (oldText === newText) return []
  const before = oldText.split(/\r?\n/)
  const after = newText.split(/\r?\n/)

  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++

  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) tail++

  const from = head + 1
  const to = after.length - tail
  // A pure deletion leaves nothing in the new file, so there is no line to judge.
  return from > to ? [] : [{ from, to }]
}

/**
 * Compare the tree against the capture.
 * @returns {{ changed: Map<string, object>, added: string[], removed: string[], skipped: number }}
 */
export async function compare(root, snapshot) {
  const paths = await filesOf(root)
  const manifest = snapshot.fingerprint ?? snapshot.files ?? {}

  const verdicts = await mapLimit(paths, async (path) => {
    const info = await stat(join(root, path))
    const record = manifest[path]

    if (!record) return { path, kind: 'added' }

    // The fast path. `size` and `mtime` both matching is the rsync heuristic:
    // re-reading and re-hashing every file on every run is the cost this avoids.
    if (record.size === info.size && Math.abs(record.mtime - info.mtimeMs) < 1) return { path, kind: 'same' }

    const buffer = await readFile(join(root, path))
    if (sha(buffer) === record.sha) return { path, kind: 'same' }

    const before = snapshot.texts?.[path]
    if (typeof before !== 'string') return { path, kind: 'edited', whole: true, ranges: [] }
    return { path, kind: 'edited', whole: false, ranges: changedRanges(before, buffer.toString('utf8')) }
  })

  // Assembled in path order, not in completion order: the report must be the same
  // run to run, and a pool does not finish in order.
  const changed = new Map()
  const added = []
  let skipped = 0
  for (const verdict of verdicts) {
    if (verdict.kind === 'same') {
      skipped++
      continue
    }
    if (verdict.kind === 'added') {
      added.push(verdict.path)
      changed.set(verdict.path, { whole: true, ranges: [], reason: 'new' })
      continue
    }
    changed.set(verdict.path, {
      whole: verdict.whole,
      ranges: verdict.ranges,
      reason: verdict.whole ? 'edited-no-text' : 'edited',
    })
  }

  const removed = []
  for (const path of Object.keys(manifest)) if (!existsSync(join(root, path))) removed.push(path)

  return { changed, added, removed, skipped }
}

export function loadLedger(root, session) {
  const path = join(root, '.phicoding', 'ledger.jsonl')
  if (!existsSync(path)) return undefined
  const entries = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (!session || entry.session === session) entries.push(entry)
    } catch {
      // A torn last line is possible while another process is appending. Skipping
      // it loses attribution for one edit; failing the run loses the whole check.
    }
  }
  return entries
}

/**
 * Narrow the comparison to what the ledger admits.
 *
 * With no ledger, every change is mine: that is the conservative default and it
 * never under-reports. With a ledger, the changes it does not mention become
 * "not mine" - which is exactly the concurrent-editing case.
 */
export function attribute(changed, ledger) {
  if (!ledger) return { mine: changed, other: new Map() }

  const claimed = new Set()
  for (const entry of ledger) {
    if (entry.path) claimed.add(entry.path)
  }

  const mine = new Map()
  const other = new Map()
  for (const [path, entry] of changed) {
    if (claimed.has(path)) mine.set(path, entry)
    else other.set(path, entry)
  }
  return { mine, other }
}

export function inScope(scope, file, line) {
  const entry = scope.get(file)
  if (!entry) return false
  if (entry.whole) return true
  return entry.ranges.some((range) => line >= range.from && line <= range.to)
}

export function counts(scope) {
  let ranges = 0
  for (const entry of scope.values()) ranges += entry.whole ? 1 : entry.ranges.length
  return { files: scope.size, ranges }
}
