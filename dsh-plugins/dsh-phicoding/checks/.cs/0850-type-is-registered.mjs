#!/usr/bin/env node
// 0850 - 每个类型都要有等级；名单双向核。
//
// 键集是从源码派生的，不是手写清单，所以"新加的类型漏登记"这一侧不会漂。
// 反方向也要核：登记里有、源码里没有，说明名单已经和代码脱节。
export const probe = {
  file: 'Core/Value.cs',
  kind: 'replace',
  find: 'public sealed class Value(int origin)',
  with: 'public sealed class ValueProbe(int origin)'
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

// Levels are an OPTIONAL input: a design note the philosophy judge may keep, not a
// list every project must maintain. So a missing file is "not applicable" (exit 3),
// never a failure - and completeness is reported, not enforced.
let levels
try {
  levels = JSON.parse(readFileSync(args[args.indexOf('--levels') + 1], 'utf8'))
} catch {
  console.log('没有 levels.json —— 等级是可选输入，跳过，不算通过。')
  process.exit(3)
}

// 嵌套类型不单独登记：它活在外部类型的声明体里，看不见外部看不见的东西。
const declared = new Set(facts.types.filter((t) => !t.containing).map((t) => t.name))
const listed = new Set(Object.keys(levels).filter((k) => !k.startsWith('_')))
const problems = []

// 同名二义：等级按名字查，一个名字两处声明就没法判定。Roslyn 解析引用不受
// 影响（它认符号不认名字），所以这不是"造伪边"，而是"等级表有歧义"。
const owners = new Map()
for (const type of facts.types) {
  if (type.containing) continue
  if (!owners.has(type.name)) owners.set(type.name, [])
  owners.get(type.name).push(type)
}
for (const [name, where] of owners) {
  if (where.length > 1) {
    const places = where.map((type) => `${type.file}:${type.line}`).join('  ')
    problems.push(`${places}  AMBIGUOUS  ${name}   在 ${where.map((type) => type.file).join(' 与 ')} 各声明一次`)
  }
}

// GHOST: the map names a type that no longer exists. That is drift in an opt-in
// file, and drift misleads the judge - cheap to fix, so it stays a finding.
// There is deliberately no UNLISTED direction: "every type must have a level" is
// exactly the completeness demand that would make levels.json a formal dependency.
for (const name of listed) if (!declared.has(name)) problems.push(`GHOST     ${name}   登记里有，源码里没有`)

for (const problem of problems) console.log(problem)

if (problems.length === 0) {
  // Coverage is printed, not enforced. A partial map is legitimate - the types it
  // skips simply do not take part in level judgement - but it must be visible, or a
  // map that quietly stops covering things looks exactly like a clean run.
  const covered = [...declared].filter((name) => listed.has(name)).length
  console.log(`覆盖 ${covered}/${declared.size} 个类型（未覆盖的类型不参与等级判定）`)
}

process.exit(problems.length === 0 ? 0 : 1)