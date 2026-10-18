#!/usr/bin/env node
// 0500 - 注释是结构化记录，不是散文。
//
// 格式（一条注释一行）：
//
//   // pc: author=<用户名> date=<YYYY-MM-DD> note="<为什么>" [waive=<规则id,...> why=<类别>]
//
// 为什么不是"作者 - 日期 : 内容"：那种写法靠位置分隔，作者名里有空格、内容里有
// 冒号就崩，而且规则只能靠正则硬猜。键值对没有这种歧义——字段由底座解析好，
// 规则读字段，一条注释可以同时承载追溯信息与豁免声明，不必各发明一套写法。
//
// 字段
//   author  必填，必须等于项目作者
//   date    必填，YYYY-MM-DD
//   note    可选（与 waive 至少有一个）：为什么写这条注释
//   waive   可选：逗号分隔的规则 id，声明这些规则对这条注释所在成员不生效
//   why     有 waive 时必填：豁免属于哪一类 —— data / serialization / plumbing
//
// why 只有三类，说不清是哪一类就不是可豁免的情况。字段表是封闭的：不认识的键
// 报错，否则拼错的键会静默失效，而那条注释看起来完全合规。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    // 随手写一句\n    public int Probe => 0;'
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
  console.log('没有项目配置 —— 作者与注释策略无从确定，跳过，不算通过。')
  process.exit(3)
}

const FIELDS = new Set(['author', 'date', 'note', 'waive', 'why'])
const WHY = new Set(['data', 'serialization', 'plumbing'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const mode = config.trunkComments ?? 'formatted'

const hits = []

for (const type of facts.types) {
  for (const comment of type.comments ?? []) {
    const at = `${type.file}:${comment.line}`

    if (mode === 'forbidden') {
      hits.push(`${at}  这个项目不许有注释：${comment.text.trim().slice(0, 40)}`)
      continue
    }
    if (comment.error) {
      hits.push(`${at}  ${comment.error}`)
      continue
    }

    const fields = comment.fields ?? {}
    const unknown = Object.keys(fields).filter((key) => !FIELDS.has(key))
    if (unknown.length > 0) {
      hits.push(`${at}  不认识的字段 ${unknown.join(', ')}（只有 author / date / note / waive / why）`)
      continue
    }

    if (!fields.author) hits.push(`${at}  缺 author`)
    else if (config.author && fields.author !== config.author) {
      hits.push(`${at}  author 是 ${fields.author}，项目作者是 ${config.author}`)
    }

    if (!fields.date) hits.push(`${at}  缺 date`)
    else if (!DATE.test(fields.date)) hits.push(`${at}  date 要 YYYY-MM-DD，现在是 ${fields.date}`)

    if (!fields.note && !fields.waive) hits.push(`${at}  缺 note（这条注释没说要说明什么）`)

    if (fields.waive) {
      const ids = fields.waive.split(',').map((one) => one.trim()).filter(Boolean)
      if (ids.length === 0) hits.push(`${at}  waive 是空的`)
      if (!fields.why) hits.push(`${at}  waive 了 ${fields.waive} 却没说 why（data / serialization / plumbing）`)
      else if (!WHY.has(fields.why)) hits.push(`${at}  why 是 ${fields.why}，只认 data / serialization / plumbing`)
    } else if (fields.why) {
      hits.push(`${at}  写了 why 但没有 waive`)
    }
  }
}

for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)
