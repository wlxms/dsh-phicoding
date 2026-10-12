#!/usr/bin/env node
// 0400 - 命名里不出现填充词。
//
// Manager / Service / Helper / Util / Impl 都是在说"我还没想清楚我是什么"。
// 名字说不清职责，说明职责本身没切开。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    public int Manager() => 0;'
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
  console.log('读不到项目配置。作用域无从确定——这是失败，不是通过。')
  process.exit(1)
}
const trunk = config.trunk
if (!trunk) {
  console.log('项目配置里没有 trunk。主干是哪一块必须由项目声明，规则不许自己猜。')
  process.exit(1)
}
const inTrunk = (type) => type.file.startsWith(trunk)
const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const filler = /(manager|service|helper|util|impl)/i
const hits = []
for (const type of facts.types) {
  if (filler.test(type.name)) hits.push(`${type.file}:${type.line}  类型名 ${type.name}`)
  for (const member of type.members ?? []) {
    if (filler.test(member.name)) hits.push(`${type.file}:${member.line}  成员名 ${type.name}.${member.name}`)
  }
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)