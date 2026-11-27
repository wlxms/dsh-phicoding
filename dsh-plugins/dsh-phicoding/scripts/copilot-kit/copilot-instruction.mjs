#!/usr/bin/env node
// Merge the phicoding user-level instruction into an existing Copilot user
// instruction file without clobbering the user's own personal instructions.
//
//   node copilot-instruction.mjs <template> <target> <skillsDir> <runner>
//   node copilot-instruction.mjs --remove <target>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const START = '<!-- phicoding:start -->'
const END = '<!-- phicoding:end -->'

const [template, target, skillsDir, runner] = process.argv.slice(2)

function withoutBlock(text) {
  const start = text.indexOf(START)
  const end = text.indexOf(END)
  if (start < 0 || end < start) return text
  return `${text.slice(0, start)}${text.slice(end + END.length)}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

if (template === '--remove') {
  const file = target
  if (!existsSync(file)) process.exit(0)
  const next = withoutBlock(readFileSync(file, 'utf8')).trim()
  if (next.length === 0) writeFileSync(file, '', 'utf8')
  else writeFileSync(file, next + '\n', 'utf8')
  process.exit(0)
}

if (!target || !skillsDir || !runner) {
  console.error('用法：node copilot-instruction.mjs <template> <target> <skillsDir> <runner>')
  process.exit(2)
}

const tidy = (path) => path.replace(/\\/g, '/')
const rendered = readFileSync(template, 'utf8')
  .replace(/\{\{SKILLS_DIR\}\}/g, () => tidy(skillsDir))
  .replace(/\{\{RUNNER\}\}/g, () => tidy(runner))
  .trim()

const existing = existsSync(target) ? readFileSync(target, 'utf8') : ''
const body = existing.trim() ? withoutBlock(existing) : ''
const next = `${body.trim()}\n\n${rendered}\n`.replace(/^\n+/, '')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, next, 'utf8')
console.log(`  instruction → ${target}`)
