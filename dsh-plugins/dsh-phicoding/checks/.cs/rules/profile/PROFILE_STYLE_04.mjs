#!/usr/bin/env node
// PROFILE_STYLE_04 - project/personal profile: no switch statements.
//
// The C# skill's "double No" is a project convention, not a language law. It is
// opt-in through profiles.<language>.enable.noSwitch; full runs do not even
// start this rule while it is disabled.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))
let config = {}
try {
  config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))
} catch {
  // Missing profile -> disabled, not a silent pass.
}
if (config?.profiles?.cs?.enable?.noSwitch !== true) {
  console.log('profiles.cs.enable.noSwitch 未启用——跳过，不算通过。')
  process.exit(3)
}
const hits = []
for (const type of facts.types ?? []) {
  for (const line of type.switchLines ?? []) {
    hits.push(`${type.file}:${line}  ${type.name} 里的 switch（PROFILE_STYLE_04）`)
  }
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)
