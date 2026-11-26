#!/usr/bin/env node
// The tier manifest must cover every built-in rule, in one place and in order.
// A rule that silently falls out of the manifest would bypass the progressive gate.
import { allCatalogRules, canReplaceRule, classify, META_STAGES, PROFILE_RULES, SOFT_RULES } from './tiers.mjs'

const results = []
const expect = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? '  ok   ' : '  FAIL '} ${name}`)
  if (!ok && detail) console.log(`         ${detail}`)
}

const builtIn = [
  'META_SURFACE_01',
  'META_DIR_CLASS_04',
  'META_SURFACE_02',
  'META_SURFACE_03',
  'META_SURFACE_04',
  'META_REF_LEVEL_01',
  'SOFT_DESIGN_01',
  'SOFT_DESIGN_02',
  'META_REF_ACYCLIC_01',
  'META_REF_ACYCLIC_02',
  'PROFILE_STYLE_01',
  'META_NAMING_01',
  'META_NAMING_02',
  'PROFILE_STYLE_02',
  'PROFILE_STYLE_03',
  'PROFILE_STYLE_04',
  'PROFILE_FILE_01',
  'META_DIR_CLASS_02',
  'META_SURFACE_05',
  'META_DIR_CLASS_03',
  'META_DIR_CLASS_01',
  'META_DIR_ACYCLIC_01'
]

const catalog = allCatalogRules()
expect('catalog covers all built-in rules', builtIn.every((id) => catalog.includes(id)), builtIn.filter((id) => !catalog.includes(id)).join(', '))
expect('catalog has no duplicates', new Set(catalog).size === catalog.length, catalog.join(', '))
expect('six meta stages', META_STAGES.length === 6 && META_STAGES.every((stage, index) => stage.id && stage.label && stage.rules.length > 0 && stage.rules.every((id) => classify(id).stage === index + 1)))
expect('META_REF_LEVEL_01 is the only reference level stage rule', classify('META_REF_LEVEL_01').stage === 2 && META_STAGES[1].rules.length === 1)
expect('META_DIR_ACYCLIC_01 is the directory acyclic stage', classify('META_DIR_ACYCLIC_01').stage === 3)
expect('META_DIR_CLASS_02/META_DIR_CLASS_03/META_DIR_CLASS_01/META_DIR_CLASS_04 are directory classification', ['META_DIR_CLASS_02', 'META_DIR_CLASS_03', 'META_DIR_CLASS_01', 'META_DIR_CLASS_04'].every((id) => classify(id).stage === 4))
expect('META_SURFACE_01/META_SURFACE_02/META_SURFACE_03/META_SURFACE_04/META_SURFACE_05 are module surface', ['META_SURFACE_01', 'META_SURFACE_02', 'META_SURFACE_03', 'META_SURFACE_04', 'META_SURFACE_05'].every((id) => classify(id).stage === 5))
expect('META_NAMING_01/META_NAMING_02 are naming profile', ['META_NAMING_01', 'META_NAMING_02'].every((id) => classify(id).stage === 6))
expect('PROFILE_STYLE_02/PROFILE_STYLE_03/PROFILE_STYLE_01 are profile', ['PROFILE_STYLE_02', 'PROFILE_STYLE_03', 'PROFILE_STYLE_01'].every((id) => classify(id).tier === 'profile'))
expect('SOFT_DESIGN_01/SOFT_DESIGN_02 are soft', ['SOFT_DESIGN_01', 'SOFT_DESIGN_02'].every((id) => classify(id).tier === 'soft'))
expect('unknown project rule is profile, not meta', classify('X-99-project-rule').tier === 'profile' && classify('X-99-project-rule').unclassified === true)
expect('profile has no duplicate rule', new Set(PROFILE_RULES).size === PROFILE_RULES.length)
expect('soft has no duplicate rule', new Set(SOFT_RULES).size === SOFT_RULES.length)
expect('structural rules are protected from adapter replacement', ['META_REF_ACYCLIC_01', 'META_REF_LEVEL_01', 'META_DIR_ACYCLIC_01', 'META_DIR_CLASS_02', 'META_DIR_CLASS_03'].every((id) => !canReplaceRule(id)))
expect('naming/profile/soft rules are replaceable by an adapter', ['META_NAMING_01', 'META_NAMING_02', 'PROFILE_STYLE_01', 'SOFT_DESIGN_01'].every((id) => canReplaceRule(id)))

const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `TIERS-TEST=PASS  ${results.length} 项` : `TIERS-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
