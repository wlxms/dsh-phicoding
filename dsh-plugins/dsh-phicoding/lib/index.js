// dsh-phicoding: the resident phicoding skill family for the DeepSeek Harness.
//
// A Cordis plugin that registers one skill provider into the HOST layer of the
// `ctx.skills` registry. A bundle row (a repository plugin) files into the
// global layer, so every agent preset's scope chain merges these skills — that
// is what makes them resident, with no user configuration.
//
// Skill bodies live in `../skills/<name>/SKILL.md`; the provider locates them
// from `import.meta.url` (an assembly fact of this package, never user config)
// and loads bodies on demand — `list()` reads frontmatter only.
//
// @module dsh-phicoding
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const name = 'dsh-phicoding'
const inject = ['skills']

/**
 * Registry precedence for packaged skill providers. Lower ranks win duplicate
 * names. This sits above the bundled root (600) and below the user roots
 * (user-dsh 400 / user-agents 500), so a user's own skill still overrides a
 * packaged one, and this package overrides a bundled duplicate.
 */
const PACKAGED_SKILL_RANK = 550

/** The source bucket these skills advertise under (prompt-visible metadata). */
const SOURCE = 'custom'

/** kebab-case, matching @deepseek-ai/dsh-skill's isSkillName contract. */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Parse the YAML frontmatter block of a SKILL.md into metadata plus body.
 *
 * Handles plain scalars, quoted scalars, and folded block scalars
 * (`key: >` followed by indented lines, joined with single spaces per YAML
 * semantics). A plain scalar containing ": " is NOT valid YAML — the trap that
 * silently drops a skill — so this package keeps every description on one line
 * and this parser fails closed: a malformed block yields null, and the skill is
 * skipped rather than half-registered. The verify script catches that.
 * @param text - raw skill file contents.
 * @returns parsed metadata and the markdown body, or null without frontmatter.
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null
  const block = text.slice(3, end)
  const body = text.slice(end + 4).replace(/^\n+/, '')
  const metadata = {}
  let currentKey = null
  let folded = false
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trimEnd()
    if (/^[ \t]/.test(line) && currentKey !== null) {
      const value = line.trim()
      if (value) {
        metadata[currentKey] = folded
          ? `${metadata[currentKey]} ${value}`
          : `${metadata[currentKey]}\n${value}`
      }
      continue
    }
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!match) {
      currentKey = null
      folded = false
      continue
    }
    let value = match[2].trim()
    folded = value === '>' || value === '>-' || value === '>+'
    if (folded) {
      value = ''
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    metadata[match[1]] = value
    currentKey = folded ? match[1] : null
  }
  return { metadata, body }
}

/**
 * Read and parse one skill directory's SKILL.md.
 * @param skillFile - absolute path to the SKILL.md file.
 * @param signal - optional cancellation.
 * @returns the parsed record, or undefined when the file is missing or malformed.
 */
async function parseSkillFile(skillFile, signal) {
  let text
  try {
    text = await readFile(skillFile, 'utf8')
  } catch {
    return undefined
  }
  if (signal?.aborted) return undefined
  const parsed = parseFrontmatter(text)
  if (parsed === null) return undefined
  return {
    name: parsed.metadata.name ?? '',
    description: parsed.metadata.description ?? '',
    whenToUse: parsed.metadata.whenToUse,
    metadata: parsed.metadata,
    content: parsed.body,
  }
}

/**
 * Map an optional `disable-model-invocation: true` onto DSH's invocation flags.
 * @param metadata - parsed frontmatter metadata.
 * @returns the DSH invocation record.
 */
function invocationFrom(metadata) {
  if (metadata['disable-model-invocation'] === 'true') {
    return { modelInvocable: false, userInvocable: true }
  }
  return { modelInvocable: true, userInvocable: true }
}

/**
 * Discover packaged skill candidates by scanning this package's `skills/`
 * directory: one subdirectory per skill, each carrying a SKILL.md.
 * A candidate that cannot produce a valid kebab-case name and a description is
 * skipped, so one broken file never takes the whole family down.
 * @param skillsRoot - absolute path to this package's skills directory.
 * @param signal - optional cancellation.
 * @returns the candidate list.
 */
async function discoverCandidates(skillsRoot, signal) {
  let entries
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates = []
  for (const entry of entries) {
    if (signal?.aborted) break
    if (!entry.isDirectory()) continue
    const skillDir = join(skillsRoot, entry.name)
    const skillFile = join(skillDir, 'SKILL.md')
    const parsed = await parseSkillFile(skillFile, signal)
    if (parsed === undefined) continue
    if (!parsed.name || !SKILL_NAME_RE.test(parsed.name)) continue
    if (!parsed.description) continue
    candidates.push({
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
      invocation: invocationFrom(parsed.metadata),
      source: SOURCE,
      provider: name,
      rank: PACKAGED_SKILL_RANK,
      locator: skillDir,
      path: skillFile,
      ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {}),
    })
  }
  return candidates
}

/** Register the packaged design provider on `ctx.skills`. */
function apply(ctx) {
  const skillsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
  ctx.skills.registerProvider((_control) => ({
    name,
    async list(options) {
      // The observation form marks this discovery complete so the registry may
      // cache it; a bare array would be re-scanned on every catalog read.
      return { candidates: await discoverCandidates(skillsRoot, options.signal), complete: true }
    },
    async get(candidate, options) {
      const parsed = await parseSkillFile(candidate.path, options.signal)
      if (parsed === undefined) return undefined
      return {
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
        invocation: invocationFrom(parsed.metadata),
        source: SOURCE,
        provider: name,
        resourceBase: { kind: 'directory', path: candidate.locator },
        path: candidate.path,
        ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {}),
        content: parsed.content,
      }
    },
  }))
}

export { apply, name, inject, parseFrontmatter, discoverCandidates, PACKAGED_SKILL_RANK }
export default { apply, name, inject }

