#!/usr/bin/env node
// 1000 - 主干里的字面量不得与变体目录里的字面量重合。
//
// 这一条是项目自己的：哪些字符串算"数据名"由这个项目的目录划分决定。
// 判据用集合求交，不用子串——子串会让一个空串把整棵树判红。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    public string Probe() => "手";'
}

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

if (args.includes('--probe-spec')) {
  console.log(JSON.stringify(probe))
  process.exit(0)
}

let config = {}
try {
  config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))
} catch {
  console.log('读不到项目配置。')
  process.exit(1)
}

const trunk = config.trunk
const variants = config.variants ?? []
if (!trunk) {
  console.log('项目配置里没有 trunk。')
  process.exit(1)
}
const inVariants = (t) => variants.some((v) => t.file.startsWith(v))

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const dataNames = new Set()
for (const type of facts.types) {
  if (!inVariants(type)) continue
  for (const one of type.strings ?? []) dataNames.add(one.value)
}

const hits = []
for (const type of facts.types) {
  if (!type.file.startsWith(trunk)) continue
  for (const one of type.strings ?? []) {
    if (dataNames.has(one.value)) hits.push(`${type.file}:${one.line}  主干里出现数据名 ${JSON.stringify(one.value)}`)
  }
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)