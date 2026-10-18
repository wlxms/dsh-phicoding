#!/usr/bin/env node
// 1200 - 给人看的字面量必须是中文。
//
// 这是项目约定（中国风），不是编码哲学——所以它住在项目里，不跟着通用规则走。
// 长度 >= 2 才判：单个字母常是格式串或标记，不是画面文字。
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

let config = {}
try {
  config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))
} catch {
  console.log('读不到项目配置。')
  process.exit(1)
}

const scopes = [config.trunk, ...(config.variants ?? [])].filter(Boolean)
if (scopes.length === 0) {
  console.log('项目配置里没有 trunk 或 variants。')
  process.exit(1)
}

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))
const cjk = /[\u4e00-\u9fff]/

const hits = []
for (const type of facts.types) {
  if (!scopes.some((s) => type.file.startsWith(s))) continue
  for (const one of type.strings ?? []) {
    if (one.value.length < 2) continue
    if (cjk.test(one.value)) continue
    hits.push(`${type.file}:${one.line}  画面文字不是中文：${JSON.stringify(one.value)}`)
  }
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)