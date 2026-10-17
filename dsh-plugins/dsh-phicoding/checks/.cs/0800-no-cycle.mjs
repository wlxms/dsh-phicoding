#!/usr/bin/env node
// 0800 - 依赖图不得成环。
//
// 边来自语义底座解析出的真引用，所以成员撞类型名不会造出伪边，也就不会像
// 逐 token 的检查器那样把不相干的类型连成环。
export const probe = {
  file: 'Core/Sheet.cs',
  kind: 'replace',
  find: '    public bool Tagged(string mark) => marks.Contains(mark);',
  with: '    public bool Tagged(string mark) => marks.Contains(mark);\n\n    public Shift Probe() => null;'
}

import { readFileSync } from 'node:fs'
const args = process.argv.slice(2)

// 声明探针：由 CLI 派子进程来问，而不是被 import —— 导入会执行规则本身。
// 这样任何语言写的规则都能提供探针。
if (args.includes('--probe-spec')) {
  console.log(JSON.stringify(probe))
  process.exit(0)
}

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const edges = new Map()
const edgeAt = new Map()
for (const type of facts.types) edges.set(type.name, new Set())
for (const ref of facts.references) {
  edges.get(ref.from)?.add(ref.to)
  // Where the edge was written. A cycle is judged in scope when any of its edges
  // touches a changed line, so every edge location is carried into the finding.
  const key = `${ref.from}|${ref.to}`
  if (!edgeAt.has(key)) edgeAt.set(key, { file: ref.file, line: ref.line })
}

const state = new Map()
const stack = []
const cycles = []

function visit(name) {
  const seen = state.get(name) ?? 0
  if (seen === 2) return
  if (seen === 1) {
    const names = stack.slice(stack.indexOf(name)).concat(name)
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