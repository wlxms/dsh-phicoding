// Placement policy shared by the directory rules.
//
// "Atomic" is a semantic category, not a directory name. Which directory each
// category lives in is a project/language choice; the rule only enforces the
// configured choice. Defaults keep the old Models/ behavior for compatibility.
//
//   atoms.enum          -> directories allowed for top-level enums
//   atoms.struct        -> directories allowed for top-level structs
//   atoms.recordstruct  -> directories allowed for top-level record structs
//   nested.enum         -> allow nested enums; scope=containing means they may
//                          be used only inside their containing type
//
// A project may set these per language under `placement.<language>`; the C#
// wrapper asks for `cs`. Missing values fall back to the default; an explicitly
// empty directory list is a configuration error, never "no rule".

export const ATOM_KINDS = ['enum', 'struct', 'recordstruct']

export const DEFAULT_PLACEMENT = {
  interfaces: ['Interfaces'],
  models: ['Models'],
  atoms: {
    enum: ['Models'],
    struct: ['Models'],
    recordstruct: ['Models']
  },
  nested: {
    enum: { allow: true, scope: 'containing' },
    struct: { allow: true },
    recordstruct: { allow: true }
  }
}

const split = (value) => String(value ?? '').replaceAll('\\', '/').split('/').filter(Boolean)

const normalizeDirs = (value, name) => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`placement ${name} 必须是非空目录数组`)
  }
  return value.map((entry) => String(entry).replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')).filter(Boolean)
}

const mergeNested = (base, override) => {
  const result = { ...base }
  for (const [kind, value] of Object.entries(override ?? {})) {
    result[kind] = { ...(base[kind] ?? {}), ...value }
  }
  return result
}

export function placementPolicy(config, language = 'cs') {
  const raw = config?.profiles?.[language]?.placement ?? config?.placement?.[language] ?? config?.placement?.default ?? config?.placement ?? {}
  const atoms = { ...DEFAULT_PLACEMENT.atoms }
  for (const [kind, value] of Object.entries(raw.atoms ?? {})) {
    atoms[kind] = normalizeDirs(value, `atoms.${kind}`) ?? atoms[kind]
  }
  const policy = {
    interfaces: normalizeDirs(raw.interfaces, 'interfaces') ?? DEFAULT_PLACEMENT.interfaces,
    models: normalizeDirs(raw.models, 'models') ?? DEFAULT_PLACEMENT.models,
    atoms,
    nested: mergeNested(DEFAULT_PLACEMENT.nested, raw.nested)
  }
  for (const kind of ATOM_KINDS) {
    if (!Array.isArray(policy.atoms[kind]) || policy.atoms[kind].length === 0) {
      throw new Error(`placement ${language}.atoms.${kind} 必须是非空目录数组`)
    }
  }
  for (const [kind, nested] of Object.entries(policy.nested)) {
    if (nested?.scope !== undefined && nested.scope !== 'containing') {
      throw new Error(`placement ${language}.nested.${kind}.scope 只支持 containing`)
    }
  }
  return policy
}

export function isInDirs(file, module, dirs) {
  if (module == null) return false
  const rest = module === '.' ? split(file) : split(file).slice(split(module).length)
  const parent = rest.slice(0, -1)
  for (const dir of dirs ?? []) {
    const parts = split(dir)
    if (parts.length === 0) continue
    for (let at = 0; at + parts.length <= parent.length; at++) {
      if (parts.every((part, index) => parent[at + index] === part)) return true
    }
  }
  return false
}

export function isInAnyAtomicDir(file, module, policy) {
  return ATOM_KINDS.some((kind) => isInDirs(file, module, policy.atoms[kind]))
}

export function isInDataArea(file, module, policy) {
  return isInDirs(file, module, policy.models) || isInAnyAtomicDir(file, module, policy)
}
