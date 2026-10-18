#!/usr/bin/env node
// 0800 - 依赖图不得成环。
//
// 边来自语义底座解析出的真引用，所以成员撞类型名不会造出伪边，也就不会像
// 逐 token 的检查器那样把不相干的类型连成环。
import { readFileSync } from 'node:fs'
const args = process.argv.slice(2)

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const edges = new Map()
const edgeAt = new Map()
const byName = new Map()
for (const type of facts.types) {
  edges.set(type.name, new Set())
  if (!byName.has(type.name)) byName.set(type.name, type)
}

for (const ref of facts.references) {
  // A type referencing itself is not a dependency: it says nothing about who may
  // know whom, and a recursive structure is not a design defect. The base already
  // drops self edges, but this rule must not depend on that - the invariant
  // belongs where the graph is interpreted, not where the facts are collected.
  if (ref.from === ref.to) continue
  edges.get(ref.from)?.add(ref.to)
  // Where the edge was written. A cycle is judged in scope when any of its edges
  // touches a changed line, so every edge location is carried into the finding.
  const key = `${ref.from}|${ref.to}`
  if (!edgeAt.has(key)) edgeAt.set(key, { file: ref.file, line: ref.line })
}

// A type and its own nested types are one design unit: the nested type cannot
// exist without the outer one, so their mutual references describe no level
// inversion - there is no third party whose information order changed. A cycle
// confined to a single nesting tree is therefore not a cycle. A cycle that
// leaves the tree (one more type joins) is still reported.
const roots = new Map()
function outerOf(name) {
  if (roots.has(name)) return roots.get(name)
  let current = name
  const guard = new Set()
  for (;;) {
    const type = byName.get(current)
    if (!type || !type.containing || guard.has(current)) break
    guard.add(current)
    current = type.containing
  }
  roots.set(name, current)
  return current
}

const state = new Map()
const stack = []
const cycles = []

function visit(name) {
  const seen = state.get(name) ?? 0
  if (seen === 2) return
  if (seen === 1) {
    const names = stack.slice(stack.indexOf(name)).concat(name)
    // Same nesting tree: the loop stays inside one unit, so it is not a cycle.
    if (new Set(names.map(outerOf)).size === 1) return
    const text = names.join('  ->  ')
    if (!cycles.some((cycle) => cycle.text === text)) {
      const places = []
      for (let i = 0; i < names.length - 1; i++) {
        const at = edgeAt.get(`${names[i]}|${names[i + 1]}`)
        if (at) places.push(`${at.file}:${at.line}`)
      }
      cycles.push({ text, places })
    }
    return
  }
  state.set(name, 1)
  stack.push(name)
  for (const next of edges.get(name) ?? []) visit(next)
  stack.pop()
  state.set(name, 2)
}

for (const name of edges.keys()) visit(name)

for (const cycle of cycles) {
  const rest = cycle.places.slice(1).join('  ')
  console.log(`${cycle.places[0] ?? ''}  CYCLE  ${cycle.text}${rest ? `   [${rest}]` : ''}`)
}
process.exit(cycles.length === 0 ? 0 : 1)