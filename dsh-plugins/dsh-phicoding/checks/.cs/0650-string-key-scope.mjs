#!/usr/bin/env node
// 0650 - 字符串当键只许出现在指定的那个类型里。
//
// 键一旦是字符串，就必须再造一个类来承载这个字符串的含义，而主干里从此
// 写不出 is（见 phicoding-shape 的按类型索引定理）。所以只留一个窄缝。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    public Dictionary<string, int> Probe = [];'
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
  console.log('读不到项目配置。窄缝在哪必须由项目声明，规则不许自己猜。')
  process.exit(1)
}

const trunk = config.trunk
const owner = config.stringKeyOwner
if (!trunk || !owner) {
  console.log('项目配置里缺 trunk 或 stringKeyOwner。')
  process.exit(1)
}

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))
const keyed = /^Dictionary<\s*string\s*,/

const hits = []
for (const type of facts.types) {
  if (!type.file.startsWith(trunk)) continue
  if (type.name === owner) continue
  for (const member of type.members ?? []) {
    if (!keyed.test(member.type ?? '')) continue
    hits.push(`${type.file}:${member.line}  ${type.name}.${member.name} : ${member.type}`)
  }
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)