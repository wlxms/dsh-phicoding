// Information-level check for a C# type graph.
//
// The problem this solves: a dependency graph can be checked for CYCLES without
// knowing anything, but it cannot be checked for a WRONG EDGE. An acyclic graph
// still admits `Value (level 0) -> Thing (level 3)` - nothing turns back, so it
// is not a cycle, and yet the edge must not exist.
//
// Deciding that needs an expectation that is not in the code. This script takes
// that expectation from a JSON file and compares it against a type set it scans
// for itself:
//
//   * the KEY SET comes from the source  -> it cannot drift, because it is not
//     typed by hand. A new type is automatically in it.
//   * the LEVELS come from the JSON      -> the one dimension source cannot
//     supply, so the one dimension a human writes.
//
// Handing over only the non-derivable dimension is the whole point. A hand-kept
// list of types would be a second copy of the code, and a second copy goes
// stale silently.
//
// Usage: node check-levels.mjs <source dir> <levels.json>
//
//   levels.json = { "Value": 0, "Sheet": 1, "Equip": 2, ... }
//
// Reports, and fails on: an upward edge, a type in the JSON but not in source,
// a type in source but not in the JSON, a cycle, or a blind scan.
import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { sources, strip, typesIn, references } from './graph.mjs'

const [root, levelsPath] = process.argv.slice(2)
if (!root || !levelsPath) {
  console.error('usage: node check-levels.mjs <source dir> <levels.json>')
  process.exit(2)
}

const levels = JSON.parse(await readFile(levelsPath, 'utf8'))
const files = await sources(root)

// name -> the files that declare it. Two files declaring one name is an
// ambiguity, not something to resolve silently.
const declared = new Map()
const bodies = new Map()

for (const file of files) {
  const text = strip(await readFile(file, 'utf8'))
  bodies.set(file, text)
  for (const type of typesIn(text)) {
    if (!declared.has(type.name)) declared.set(type.name, new Map())
    declared.get(type.name).set(file, type)
  }
}

const ambiguous = [...declared].filter(([, owners]) => owners.size > 1)

// A blind scan must fail, never pass. An anchored regex once reported
// types=0 edges=0 CYCLES=0 for a tree it never looked at.
if (declared.size === 0) {
  console.log(`files=${files.length}  types=0`)
  console.log('BLIND  the scan found no types at all - refusing to report a result')
  process.exit(1)
}

const edges = new Map([...declared.keys()].map((name) => [name, new Set()]))

for (const [owner, owners] of declared) {
  for (const file of owners.keys()) {
    const text = bodies.get(file)
    const span = owners.get(file)
    const body = text.slice(span.start, span.end)
    for (const other of declared.keys()) {
      if (other === owner) continue
      if (!references(body, other)) continue
      for (const where of declared.get(other).keys()) {
        void where
        edges.get(owner).add(other)
      }
    }
  }
}

const linked = [...edges].filter(([, to]) => to.size > 0)
const edgeCount = linked.reduce((n, [, to]) => n + to.size, 0)
console.log(`files=${files.length}  types=${declared.size}  edges=${edgeCount}`)

for (const [from, to] of linked) {
  console.log(`  ${from}  ->  ${[...to].join(', ')}`)
}

// ---- levels ---------------------------------------------------------------
const unlisted = [...declared.keys()].filter((name) => !(name in levels))
const ghost = Object.keys(levels).filter((name) => !declared.has(name))
const upward = []

for (const [from, to] of edges) {
  if (!(from in levels)) continue
  for (const target of to) {
    if (!(target in levels)) continue
    if (levels[from] < levels[target]) {
      upward.push(`${from}(L${levels[from]}) -> ${target}(L${levels[target]})`)
    }
  }
}

// ---- cycles ---------------------------------------------------------------
const state = new Map()
const stack = []
const cycles = []

function visit(name) {
  const seen = state.get(name) ?? 0
  if (seen === 2) return
  if (seen === 1) {
    cycles.push(stack.slice(stack.indexOf(name)).concat(name).join('  ->  '))
    return
  }
  state.set(name, 1)
  stack.push(name)
  for (const next of edges.get(name)) visit(next)
  stack.pop()
  state.set(name, 2)
}

for (const name of declared.keys()) visit(name)

// ---- report ---------------------------------------------------------------
console.log('')
console.log(`LEVELS  ok       登记 ${Object.keys(levels).length}，源码 ${declared.size}`)

for (const name of ghost) console.log(`GHOST     ${name}  (登记里有，源码里没有)`)
for (const name of unlisted) console.log(`UNLISTED  ${name}  (源码里有，没登记)`)
for (const one of upward) console.log(`UPWARD    ${one}`)

if (ambiguous.length > 0) {
  for (const [name, owners] of ambiguous) {
    console.log(`AMBIGUOUS  ${name}  ->  ${[...owners.keys()].map((f) => relative(root, f)).join(', ')}`)
  }
}

console.log('')
for (const cycle of cycles) console.log(`CYCLE  ${cycle}`)

const bad = ghost.length + unlisted.length + upward.length + cycles.length
console.log(`GHOST=${ghost.length}  UNLISTED=${unlisted.length}  UPWARD=${upward.length}  CYCLES=${cycles.length}`)

if (bad > 0) process.exit(1)
console.log('LEVELS=OK')
process.exit(0)
