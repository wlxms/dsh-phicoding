#!/usr/bin/env node
// PROFILE_FILE_01 - language-level opt-in: one top-level type per file.
//
// The project adapter enables it under profiles.<language>.oneTypePerFile.
// It is opt-in on purpose: a one-class-per-file convention is a project choice,
// not a universal law. Nested types never count. A generic companion with the
// same base name (Foo + Foo<T>) is exempt by default because it is a distinct
// CLR arity, not a second top-level concept.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))
let config = {}
try {
  config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))
} catch {
  // Opt-in profile absent -> not applicable, never a silent pass.
}
const raw = config?.profiles?.cs?.oneTypePerFile
const enabled = raw === true || raw?.enabled === true
if (!enabled) {
  console.log('profiles.cs.oneTypePerFile 未启用——跳过，不算通过。')
  process.exit(3)
}
const kinds = new Set(raw?.kinds ?? ['class', 'record'])
const baseName = (name) => String(name ?? '').replace(/`\d+$/, '')
const displayName = (type) => {
  const arity = type.arity ?? 0
  if (arity === 0) return baseName(type.name)
  const parameters = Array.from({ length: arity }, (_, index) => `T${index + 1}`).join(', ')
  return `${baseName(type.name)}<${parameters}>`
}
const files = new Map()
for (const type of facts.types ?? []) {
  if (type.containing) continue
  if (!kinds.has(type.kind)) continue
  if (!files.has(type.file)) files.set(type.file, [])
  const list = files.get(type.file)
  const arity = type.arity ?? 0
  // A partial declaration is the same logical type; keep the first declaration.
  if (list.some((one) => one.name === type.name && (one.arity ?? 0) === arity)) continue
  list.push(type)
}

const hits = []
for (const [file, types] of files) {
  const counted = []
  for (const type of types) {
    const sameName = types.filter((other) => baseName(other.name) === baseName(type.name))
    const generic = (type.arity ?? 0) > 0
    // C# permits Foo and Foo<T> (different arity) in one namespace. The generic
    // same-name declaration is a companion, not a second concept; a *different*
    // generic name remains a finding.
    const companion = generic && sameName.length > 1 && raw?.exemptGenericSameName !== false
    if (companion) continue
    counted.push(type)
  }
  if (counted.length <= 1) continue
  const ordered = [...counted].sort((left, right) => left.line - right.line)
  for (const type of ordered.slice(1)) {
    hits.push(`${file}:${type.line}  一个文件只能有一个 top-level ${[...kinds].join('/')}：${displayName(type)}（PROFILE_FILE_01）`)
  }
}

for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)
