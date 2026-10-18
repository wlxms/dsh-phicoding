#!/usr/bin/env node
// 0500 - 注释是结构化记录，不是散文。
//
// 格式（一条注释一行）：
//
//   // [<作者> <日期> <key=value> ...] <原因>
//
// 方括号里按空格切：前两项固定是作者与日期，其余只能是 key=value。
// 方括号外整段是原因，**随便写**——不需要引号，也不需要转义，因为它不再是
// "某个字段的值"。可解析的那部分进括号，人话留在外面。
//
//   // [wlxms 2026-10-18] 这里硬编码了 Atlas 类型，因为打包期才能确定落盘摘要
//   // [wlxms 2026-10-18 waive=0650 why=serialization] 线格式里的 type 字段，反序列化必须读
//
// 字段
//   author  必填（第一项）：必须等于项目作者
//   date    必填（第二项）：YYYY-MM-DD
//   reason  必填（方括号之后）：为什么写这条注释
//   waive   按需：逗号分隔的规则 id，对这条注释所在的成员不生效
//   why     有 waive 时必填：data / serialization / plumbing
//
// 字段表是封闭的：不认识的键报错，否则拼错的键会静默失效，而那条注释看起来
// 完全合规。
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

let config
try {
  config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))
} catch {
  console.log('没有项目配置 —— 作者与注释策略无从确定，跳过，不算通过。')
  process.exit(3)
}

const FIELDS = new Set(['author', 'date', 'reason', 'waive', 'why'])
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
      hits.push(`${at}  不认识的字段 ${unknown.join(', ')}（只有 waive / why）`)
      continue
    }

    if (!fields.author) hits.push(`${at}  缺作者`)
    else if (config.author && fields.author !== config.author) {
      hits.push(`${at}  作者是 ${fields.author}，项目作者是 ${config.author}`)
    }

    if (!fields.date) hits.push(`${at}  缺日期`)
    else if (!DATE.test(fields.date)) hits.push(`${at}  日期要 YYYY-MM-DD，现在是 ${fields.date}`)

    if (!fields.reason) hits.push(`${at}  方括号后面缺原因（这条注释要说明什么）`)

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
