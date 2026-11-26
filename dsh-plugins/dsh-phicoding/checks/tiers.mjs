// Rule tiers and the progressive meta gate.
//
// IDs are LEVEL_MODULE_CODE:
//
//   LEVEL   META / PROFILE / SOFT
//   MODULE  logical module inside the level
//   CODE    two-digit rule number
//
// Examples: META_REF_ACYCLIC_01, META_SURFACE_03, PROFILE_STYLE_02, SOFT_DESIGN_01.
// A failed meta stage blocks every later stage. Profile is configurable; soft
// never blocks.

export const META_STAGES = [
  {
    id: 'reference-acyclic',
    label: '引用无环',
    module: 'REF_ACYCLIC',
    rules: ['META_REF_ACYCLIC_01', 'META_REF_ACYCLIC_02']
  },
  {
    id: 'reference-level',
    label: '引用等级',
    module: 'REF_LEVEL',
    rules: ['META_REF_LEVEL_01']
  },
  {
    id: 'directory-acyclic',
    label: '目录无环',
    module: 'DIR_ACYCLIC',
    rules: ['META_DIR_ACYCLIC_01']
  },
  {
    id: 'directory-classification',
    label: '目录归类',
    module: 'DIR_CLASS',
    rules: ['META_DIR_CLASS_01', 'META_DIR_CLASS_02', 'META_DIR_CLASS_03', 'META_DIR_CLASS_04']
  },
  {
    id: 'module-surface',
    label: '模块接口',
    module: 'SURFACE',
    rules: ['META_SURFACE_01', 'META_SURFACE_02', 'META_SURFACE_03', 'META_SURFACE_04', 'META_SURFACE_05']
  },
  {
    id: 'naming-profile',
    label: '命名 profile',
    module: 'NAMING',
    rules: ['META_NAMING_01', 'META_NAMING_02']
  }
]

export const PROFILE_RULES = ['PROFILE_STYLE_01', 'PROFILE_STYLE_02', 'PROFILE_STYLE_03', 'PROFILE_STYLE_04', 'PROFILE_FILE_01']
export const SOFT_RULES = ['SOFT_DESIGN_01', 'SOFT_DESIGN_02']

// A project adapter may replace a rule implementation only when the rule's
// invariant is project-shaped. Structural/pipeline rules stay in the universal
// core; adapters can enrich facts or adjust severity, not replace them.
export const PROTECTED_RULES = new Set([
  'META_REF_ACYCLIC_01',
  'META_REF_ACYCLIC_02',
  'META_REF_LEVEL_01',
  'META_DIR_ACYCLIC_01',
  'META_DIR_CLASS_01',
  'META_DIR_CLASS_02',
  'META_DIR_CLASS_03'
])

export function canReplaceRule(id) {
  return !PROTECTED_RULES.has(resolveRuleId(id))
}

// Project/personal profile gates. These are deliberate policy choices, not
// universal laws: a project can turn naming/directory/style/concept rules off
// without making the core dependency invariants optional.
export function ruleEnabled(id, language, config) {
  const rule = resolveRuleId(id)
  const key = String(language ?? '').replace(/^\./, '')
  const profile = config?.profiles?.[key] ?? {}
  const enable = profile.enable ?? {}
  const on = (name, fallback = true) => (enable[name] === undefined ? fallback : enable[name] !== false)
  if (rule === 'PROFILE_FILE_01') {
    const value = profile.oneTypePerFile
    return value === true || value?.enabled === true
  }
  if (rule === 'META_DIR_CLASS_04') return enable.dataPurity === true
  if (rule === 'PROFILE_STYLE_04') return enable.noSwitch === true
  if (rule === 'PROFILE_STYLE_01') return on('noElse')
  if (rule === 'PROFILE_STYLE_02') return on('comments')
  if (rule === 'PROFILE_STYLE_03') return on('blankLines')
  if (['META_NAMING_01', 'META_NAMING_02'].includes(rule)) return on('naming')
  if (['META_DIR_ACYCLIC_01', 'META_DIR_CLASS_01', 'META_DIR_CLASS_02', 'META_DIR_CLASS_03'].includes(rule)) {
    return on('directoryModel')
  }
  if (['META_SURFACE_02', 'META_SURFACE_03'].includes(rule)) return on('conceptProgramming')
  return true
}

// Backward-compatible name used by the CLI and older tests.
export function profileRuleEnabled(id, language, config) {
  return ruleEnabled(id, language, config)
}

// Transition aliases. Old C/D/M/number IDs and the intermediate dash IDs still
// resolve; emitted IDs and documentation always use LEVEL_MODULE_CODE.
export const LEGACY_ALIASES = {
  'C-01-interface-purity': 'META_SURFACE_01',
  'C-02-pure-data': 'META_DIR_CLASS_04',
  'C-03-behavior-has-interface': 'META_SURFACE_02',
  'C-04-reference-data-has-interface': 'META_SURFACE_03',
  'C-05-pure-dto-isolation': 'META_SURFACE_04',
  'D-01-reference-degree': 'META_REF_LEVEL_01',
  'D-02-no-concrete-hold': 'SOFT_DESIGN_01',
  'D-03-construction-boundary': 'SOFT_DESIGN_02',
  'D-04-concrete-acyclic': 'META_REF_ACYCLIC_01',
  'D-05-struct-reference-acyclic': 'META_REF_ACYCLIC_02',
  '0100-no-else': 'PROFILE_STYLE_01',
  '0400-naming-pattern': 'META_NAMING_01',
  '0450-ue-naming': 'META_NAMING_02',
  '0500-comments': 'PROFILE_STYLE_02',
  '0600-blank-line-groups': 'PROFILE_STYLE_03',
  '0900-interface-structure': 'META_DIR_CLASS_02',
  '0920-module-one-way': 'META_SURFACE_05',
  '0930-implementation-placement': 'META_DIR_CLASS_03',
  'M-04-scc-same-directory': 'META_DIR_CLASS_01',
  'M-05-sibling-acyclic': 'META_DIR_ACYCLIC_01',
  'C-01': 'META_SURFACE_01',
  'C-02': 'META_DIR_CLASS_04',
  'C-03': 'META_SURFACE_02',
  'C-04': 'META_SURFACE_03',
  'C-05': 'META_SURFACE_04',
  'D-01': 'META_REF_LEVEL_01',
  'D-02': 'SOFT_DESIGN_01',
  'D-03': 'SOFT_DESIGN_02',
  'D-04': 'META_REF_ACYCLIC_01',
  'D-05': 'META_REF_ACYCLIC_02',
  '0100': 'PROFILE_STYLE_01',
  '0400': 'META_NAMING_01',
  '0450': 'META_NAMING_02',
  '0500': 'PROFILE_STYLE_02',
  '0600': 'PROFILE_STYLE_03',
  '0900': 'META_DIR_CLASS_02',
  '0920': 'META_SURFACE_05',
  '0930': 'META_DIR_CLASS_03',
  'M-04': 'META_DIR_CLASS_01',
  'M-05': 'META_DIR_ACYCLIC_01',
  'META-1-01-concrete-acyclic': 'META_REF_ACYCLIC_01',
  'META-1-02-struct-acyclic': 'META_REF_ACYCLIC_02',
  'META-2-01-reference-degree': 'META_REF_LEVEL_01',
  'META-3-01-sibling-acyclic': 'META_DIR_ACYCLIC_01',
  'META-4-01-scc-same-directory': 'META_DIR_CLASS_01',
  'META-4-02-interface-structure': 'META_DIR_CLASS_02',
  'META-4-03-implementation-placement': 'META_DIR_CLASS_03',
  'META-4-04-pure-data': 'META_DIR_CLASS_04',
  'META-5-01-interface-purity': 'META_SURFACE_01',
  'META-5-02-behavior-has-interface': 'META_SURFACE_02',
  'META-5-03-reference-data-has-interface': 'META_SURFACE_03',
  'META-5-04-pure-dto-isolation': 'META_SURFACE_04',
  'META-5-05-module-one-way': 'META_SURFACE_05',
  'META-6-01-naming-pattern': 'META_NAMING_01',
  'META-6-02-ue-naming': 'META_NAMING_02',
  'PROFILE-1-01-no-else': 'PROFILE_STYLE_01',
  'PROFILE-1-02-comments': 'PROFILE_STYLE_02',
  'PROFILE-1-03-blank-line-groups': 'PROFILE_STYLE_03',
  'SOFT-1-01-no-concrete-hold': 'SOFT_DESIGN_01',
  'SOFT-1-02-construction-boundary': 'SOFT_DESIGN_02'
}

const matches = (id, prefix) => id === prefix || id.startsWith(prefix)
const find = (rules, id) => rules.find((prefix) => matches(id, prefix))

export function classify(id) {
  const normalized = LEGACY_ALIASES[id] ?? id
  for (let index = 0; index < META_STAGES.length; index++) {
    const stage = META_STAGES[index]
    if (find(stage.rules, normalized)) {
      return { tier: 'meta', stage: index + 1, label: stage.label, module: stage.module }
    }
  }
  if (find(PROFILE_RULES, normalized)) return { tier: 'profile', label: '项目风格', module: 'STYLE' }
  if (find(SOFT_RULES, normalized)) return { tier: 'soft', label: '设计审查', module: 'DESIGN' }
  return { tier: 'profile', label: '项目规则', unclassified: true }
}

export function stageRules(rules, index) {
  const stage = META_STAGES[index]
  return rules.filter((rule) => find(stage.rules, rule.id))
}

export function profileRules(rules) {
  return rules.filter((rule) => classify(rule.id).tier === 'profile')
}

export function softRules(rules) {
  return rules.filter((rule) => classify(rule.id).tier === 'soft')
}

export function allCatalogRules() {
  return [...META_STAGES.flatMap((stage) => stage.rules), ...PROFILE_RULES, ...SOFT_RULES]
}

export function resolveRuleId(id) {
  return LEGACY_ALIASES[id] ?? id
}
