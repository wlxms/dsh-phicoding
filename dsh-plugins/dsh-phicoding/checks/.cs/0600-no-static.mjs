#!/usr/bin/env node
// 0600 - 主干里不出现 static。
//
// 静态成员是进程级状态：它的生命周期不跟着谁走，所以"状态只有一份"这条
// 它永远说不清是哪一份。伴随症状是字典键为实例，那些实例永不释放。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    public static int Probe;'
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

const hits = []
for (const type of facts.types) {
  if (!inTrunk(type)) continue
  if (type.isStatic) hits.push(`${type.file}:${type.line}  静态类型 ${type.name}`)
  for (const member of type.members ?? []) {
    if (member.isStatic) hits.push(`${type.file}:${member.line}  静态成员 ${type.name}.${member.name}`)
  }
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)