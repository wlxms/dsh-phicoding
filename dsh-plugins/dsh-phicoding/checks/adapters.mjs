// Project Adaptation Layer loader.
//
// A project may provide `.phicoding/adapter.json` (or point at another manifest
// with `--adapter`). The adapter has five explicit powers:
//
//   facts      enrich facts with semantic evidence
//   naming     supply naming policy to the universal naming rules
//   severity   tune rule strength
//   replace    replace a rule implementation (protected rules are rejected)
//   decorate   post-process one rule's findings, with a visible trace
//
// It never becomes an implicit pass: missing/broken adapter modules are errors,
// unknown rule ids are errors, and suppressed findings are reported as adapter
// traces instead of disappearing.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canReplaceRule, resolveRuleId } from './tiers.mjs'

const SEVERITIES = new Set(['error', 'warn', 'info', 'off'])
const BUILTINS = new Map([['unreal', new URL('./adapters/unreal.mjs', import.meta.url)]])

const moduleUrl = (path) => pathToFileURL(path).href

function resolvePath(base, path) {
  return isAbsolute(path) ? path : resolve(base, path)
}

async function importModule(path, what) {
  if (!existsSync(path)) throw new Error(`${what} 不存在：${path}`)
  try {
    return await import(moduleUrl(path))
  } catch (error) {
    throw new Error(`${what} 加载失败：${error.message}`)
  }
}

async function loadFactsAdapter(manifest, base) {
  const name = manifest.facts ?? (manifest.engine ? `builtin:${manifest.engine}` : undefined)
  if (!name) return undefined
  if (name.startsWith('builtin:')) {
    const builtin = name.slice('builtin:'.length)
    const location = BUILTINS.get(builtin)
    if (!location) throw new Error(`未知内建 facts 适配器：${builtin}`)
    return { name, module: await import(location.href) }
  }
  const path = resolvePath(base, name)
  return { name, module: await importModule(path, `facts 适配器 ${name}`) }
}

async function loadDecorators(manifest, base) {
  const list = manifest.rules?.decorate ?? []
  if (!Array.isArray(list)) throw new Error('adapter.rules.decorate 必须是数组')
  const loaded = []
  for (const entry of list) {
    const path = resolvePath(base, typeof entry === 'string' ? entry : entry.path)
    const module = await importModule(path, `decorator ${path}`)
    const decorator = module.default ?? module
    if (!decorator || typeof decorator.after !== 'function') {
      throw new Error(`decorator ${path} 必须导出 after({ ruleId, lines, facts, config })`)
    }
    const appliesTo = decorator.appliesTo ?? decorator.rules ?? entry.appliesTo
    loaded.push({
      id: decorator.id ?? path,
      appliesTo: new Set(Array.isArray(appliesTo) ? appliesTo.map(resolveRuleId) : appliesTo ? [resolveRuleId(appliesTo)] : []),
      after: decorator.after,
      path
    })
  }
  return loaded
}

function loadSeverity(manifest) {
  const raw = manifest.rules?.severity ?? {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('adapter.rules.severity 必须是对象')
  const severity = new Map()
  for (const [id, value] of Object.entries(raw)) {
    const rule = resolveRuleId(id)
    if (!SEVERITIES.has(value)) throw new Error(`adapter.rules.severity.${id} 只能是 error/warn/info/off`)
    severity.set(rule, value)
  }
  return severity
}

function loadReplacements(manifest, base) {
  const raw = manifest.rules?.replace ?? {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('adapter.rules.replace 必须是对象')
  const replace = new Map()
  for (const [id, entry] of Object.entries(raw)) {
    const rule = resolveRuleId(id)
    if (!canReplaceRule(rule)) throw new Error(`protected 规则不能替换：${rule}`)
    const path = resolvePath(base, typeof entry === 'string' ? entry : entry.path)
    if (!existsSync(path)) throw new Error(`适配层替换规则不存在：${path}`)
    replace.set(rule, { id: rule, path })
  }
  return replace
}

function loadAdditions(manifest, base) {
  const raw = manifest.rules?.add ?? []
  if (!Array.isArray(raw)) throw new Error('adapter.rules.add 必须是数组')
  return raw.map((entry) => {
    const path = resolvePath(base, typeof entry === 'string' ? entry : entry.path)
    if (!existsSync(path)) throw new Error(`项目规则不存在：${path}`)
    const id = typeof entry === 'object' && entry.id ? entry.id : path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
    return { id, path, file: path, local: true, adapter: true }
  })
}

async function loadNaming(manifest, base) {
  const naming = manifest.naming
  if (!naming) return undefined
  if (typeof naming === 'string') {
    const path = resolvePath(base, naming)
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      throw new Error(`适配层命名策略读不到：${path}（${error.message}）`)
    }
  }
  if (typeof naming !== 'object' || Array.isArray(naming)) throw new Error('adapter.naming 必须是对象或 JSON 路径')
  return naming
}

async function loadRuleScope(manifest, base) {
  return {
    severity: loadSeverity(manifest),
    replace: loadReplacements(manifest, base),
    additions: loadAdditions(manifest, base),
    decorators: await loadDecorators(manifest, base)
  }
}

const mergeNamed = (base, override) => {
  if (!override) return base
  const result = { ...(base ?? {}), ...override }
  for (const key of ['interface', 'enum', 'attribute', 'exception', 'extension', 'family']) {
    if (base?.[key] || override[key]) result[key] = { ...(base?.[key] ?? {}), ...(override[key] ?? {}) }
  }
  return result
}

export function viewFor(adapter, language) {
  if (!adapter) return null
  const key = String(language ?? '').replace(/^\./, '')
  const profile = adapter.profiles?.get(key) ?? {}
  return {
    id: adapter.id,
    engine: adapter.engine,
    language: key,
    naming: mergeNamed(adapter.naming, profile.naming),
    placement: profile.placement ?? adapter.placement,
    options: { ...(profile.options ?? {}) },
    severity: new Map([...adapter.severity, ...(profile.severity ?? [])]),
    replace: new Map([...adapter.replace, ...(profile.replace ?? [])]),
    additions: [...adapter.additions, ...(profile.additions ?? [])],
    decorators: [...adapter.decorators, ...(profile.decorators ?? [])]
  }
}

export async function loadAdapter({ root, manifestPath }) {
  const path = manifestPath ?? join(root, '.phicoding', 'adapter.json')
  if (!existsSync(path)) {
    if (manifestPath) throw new Error(`适配层不存在：${path}`)
    return null
  }

  let manifest
  try {
    manifest = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`适配层不是合法 JSON：${path}（${error.message}）`)
  }
  const base = dirname(path)
  const factsAdapter = await loadFactsAdapter(manifest, base)
  const naming = await loadNaming(manifest, base)
  const placement = manifest.placement
  if (placement !== undefined && (typeof placement !== 'object' || Array.isArray(placement))) {
    throw new Error('adapter.placement 必须是对象')
  }
  const scope = await loadRuleScope(manifest, base)
  const profiles = new Map()
  if (manifest.profiles !== undefined) {
    if (typeof manifest.profiles !== 'object' || Array.isArray(manifest.profiles)) {
      throw new Error('adapter.profiles 必须按语言分组')
    }
    for (const [language, raw] of Object.entries(manifest.profiles)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`adapter.profiles.${language} 必须是对象`)
      const profilePlacement = raw.placement
      if (profilePlacement !== undefined && (typeof profilePlacement !== 'object' || Array.isArray(profilePlacement))) {
        throw new Error(`adapter.profiles.${language}.placement 必须是对象`)
      }
      profiles.set(language, {
        naming: await loadNaming(raw, base),
        placement: profilePlacement,
        options: {
          ...(raw.options ?? {}),
          enable: { ...(raw.options?.enable ?? {}), ...(raw.enable ?? {}) }
        },
        ...(await loadRuleScope(raw, base))
      })
    }
  }

  return {
    id: manifest.id ?? 'project',
    description: manifest.description ?? '',
    manifestPath: path,
    scope: manifest.scope ?? '.',
    engine: manifest.engine,
    factsAdapter,
    naming,
    placement,
    profiles,
    ...scope
  }
}

export async function enrichFacts(adapter, facts, context) {
  if (!adapter?.factsAdapter) return facts
  const enrich = adapter.factsAdapter.module.enrich
  if (typeof enrich !== 'function') {
    throw new Error(`facts 适配器 ${adapter.factsAdapter.name} 必须导出 enrich(facts, context)`)
  }
  const enriched = await enrich(facts, context)
  if (!enriched || !Array.isArray(enriched.types)) {
    throw new Error(`facts 适配器 ${adapter.factsAdapter.name} 返回了非法 facts`)
  }
  return enriched
}

export async function decorate(adapter, { ruleId, lines, facts, config, changedFiles }) {
  if (!adapter || adapter.decorators.length === 0) return { lines, trace: [] }
  let current = lines
  const trace = []
  for (const decorator of adapter.decorators) {
    if (decorator.appliesTo.size > 0 && !decorator.appliesTo.has(ruleId)) continue
    const result = await decorator.after({ ruleId, lines: current, facts, config, changedFiles })
    if (!result || !Array.isArray(result.lines)) {
      throw new Error(`decorator ${decorator.id} 必须返回 { lines, trace? }`)
    }
    current = result.lines
    for (const entry of result.trace ?? []) {
      trace.push({ ...entry, decorator: decorator.id })
    }
  }
  return { lines: current, trace }
}

export function effectiveConfig(config, view, language = view?.language) {
  if (!view) return config
  const key = String(language ?? view.language ?? '').replace(/^\./, '')
  const projectProfile = key ? config?.profiles?.[key] ?? {} : {}
  const profile = { ...projectProfile, ...(view.options ?? {}) }
  return {
    ...config,
    adapter: {
      id: view.id,
      engine: view.engine,
      language,
      naming: view.naming,
      placement: view.placement,
      severity: Object.fromEntries(view.severity),
      replace: [...view.replace.keys()],
      decorators: view.decorators.map((decorator) => decorator.id)
    },
    ...(view.naming ? { naming: view.naming } : {}),
    ...(view.placement ? { placement: view.placement } : {}),
    ...(key ? { profiles: { ...(config?.profiles ?? {}), [key]: profile } } : {})
  }
}
