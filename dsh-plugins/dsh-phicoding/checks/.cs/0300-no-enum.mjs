#!/usr/bin/env node
// 0300 - 主干里不出现 enum。
//
// 需求里"多类抽象"要用类型表达：枚举能表达的种类是封闭的，加一个要在所有
// switch 它的地方回来改；类型是开放的，加一个不动别人。
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

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
  if (type.kind !== 'enum') continue
  hits.push(`${type.file}:${type.line}  enum ${type.name}`)
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)