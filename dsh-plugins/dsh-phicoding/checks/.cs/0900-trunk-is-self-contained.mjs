#!/usr/bin/env node
// 0900 - 主干只引用主干里声明的类型。
//
// 这条接替了原来的等级表。等级表要回答"谁在谁上面"，而那需要一张全局图；
// 主干的自足性不需要——只看每条引用两端的类型各自声明在哪个目录。
//
//   Core/A.cs 里出现 Data/B.cs 声明的类型  → 违规
//
// 为什么这等价于"主干只知抽象"：主干是最低等级，它要用的契约必须长在它自己
// 里面。一旦它引用外部的类型，那外部类型就比它高——不管中间隔了几层。
// 探针往主干里追加一个只引用 Data 类型的新类型。用"新类型"而不是"给已有类型
// 加字段"，是为了让它没有入边：给 Value 加一个 Sword 字段会连成
// Value → Sword → Equip → Sheet → Value 的环，把 0800 一起打红。
export const probe = {
  file: 'Core/Value.cs',
  kind: 'append',
  inject: '\npublic sealed class ProbeLeak\n{\n    public Sword Leak { get; } = null!;\n}\n'
}

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
if (args.includes('--probe-spec')) {
  console.log(JSON.stringify(probe))
  process.exit(0)
}

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

let config
try {
  config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))
} catch {
  console.log('没有项目配置 —— 主干范围无从确定，跳过，不算通过。')
  process.exit(3)
}
if (config.trunk === undefined || config.trunk === null) {
  console.log('项目配置里没有 trunk。主干是哪一块必须由项目声明，规则不许自己猜。')
  process.exit(3)
}

// "." 与 "" 都表示"整个项目都是主干"。不归一化的话 trunk = "." 会让
// `Types.cs`.startsWith(".") 为假：规则不报错，只是永远不判，读起来像干净。
const trunk = String(config.trunk)
  .split('\\')
  .join('/')
  .replace(/^\.\/?/, '')
  .replace(/\/$/, '')
const inTrunk = (file) => trunk === '' || String(file).split('\\').join('/').startsWith(trunk)

const byName = new Map()
for (const type of facts.types) if (!byName.has(type.name)) byName.set(type.name, type)

// 同名类型会让"这个名字是谁"变得不确定；判不了就不判，并且说出来。
const seen = new Map()
for (const type of facts.types) seen.set(type.name, (seen.get(type.name) ?? 0) + 1)
const duplicated = [...seen].filter(([, count]) => count > 1).map(([name]) => name)
if (duplicated.length > 0) {
  console.log(`有同名类型（${duplicated.join(', ')}）—— 按名字查会串，先消除同名，跳过，不算通过。`)
  process.exit(3)
}

const hits = []
for (const ref of facts.references) {
  if (ref.from === ref.to) continue
  const owner = byName.get(ref.from)
  const target = byName.get(ref.to)
  if (!owner || !target) continue
  // 只看"主干的类型发出了这条引用"。反向（外部引用主干）不算违规：外部本来就
  // 该依赖主干，那是单向依赖的正确方向。
  if (!inTrunk(owner.file)) continue
  if (inTrunk(target.file)) continue
  hits.push(`${ref.file}:${ref.line}  ${ref.from}（主干）引用了 ${ref.to}（${target.file}），主干不再自足`)
}

for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)
