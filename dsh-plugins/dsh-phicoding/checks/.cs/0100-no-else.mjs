#!/usr/bin/env node
// 0100 - 主干里不出现 else。
//
// 判据来自语义底座对每个类型内部的扫描，不是文本 grep：注释与字符串里的
// "else" 不算，条件表达式也不被误判成语句。
export const probe = {
  file: 'Core/Value.cs',
  kind: 'replace',
  find: '    public void Add(int amount) => adds.Add(amount);',
  with: '    public void Add(int amount) => adds.Add(amount);\n\n    public int Probe(int x) { if (x > 0) return 1; else return 0; }'
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

const hits = []
for (const type of facts.types) {
  for (const line of type.elseLines ?? []) hits.push(`${type.file}:${line}  ${type.name} 里的 else`)
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)