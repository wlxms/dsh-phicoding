#!/usr/bin/env node
// 0200 - 主干里不出现 switch。
//
// 分支一旦按值分派，加一种就要回来改这里一次；设计模式优先，就是把这种
// "每次都要回来改"的地方消灭掉。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    public int Probe(int x) { switch (x) { default: return 0; } }'
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
  for (const line of type.switchLines ?? []) hits.push(`${type.file}:${line}  ${type.name} 里的 switch`)
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)