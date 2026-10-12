#!/usr/bin/env node
// 0900 - 一个类型不得引用等级比它高的类型。
//
// 无环检查抓不到这条：A 引用了 B 而 B 根本不回头，不是环，但 A 越界了。
// 只有事先定好的等级才判得出"这条边不该有"。
// 探针挑 Slot -> Sheet：Slot 是 L0、Sheet 是 L1，越界；而 Sheet 到不了 Slot，
// 所以不会顺手造出一个环。先前用的是 Value -> Thing，它同时满足
// Thing -> Sheet -> Value 成环，把 0800 也打红了 —— 探针必须只打自己那一条，
// 否则它什么都没证明。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    public Sheet Probe() => null;'
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

let levels
try {
  levels = JSON.parse(readFileSync(args[args.indexOf('--levels') + 1], 'utf8'))
} catch {
  console.log('读不到 levels.json。等级无从判定——这是失败，不是通过。')
  process.exit(1)
}

// 嵌套类型取它外层类型的等级 —— 它在同一个声明体里。
const owner = new Map(facts.types.map((t) => [t.name, t.containing ?? t.name]))
const levelOf = (name) => levels[owner.get(name) ?? name]

const seen = new Set()
const problems = []
for (const ref of facts.references) {
  const from = levelOf(ref.from)
  const to = levelOf(ref.to)
  if (from === undefined || to === undefined) continue
  if (from >= to) continue
  const key = `${ref.from}|${ref.to}`
  if (seen.has(key)) continue
  seen.add(key)
  problems.push(`UPWARD  ${ref.from}(L${from}) -> ${ref.to}(L${to})   ${ref.file}:${ref.line}`)
}

for (const problem of problems) console.log(problem)
process.exit(problems.length === 0 ? 0 : 1)