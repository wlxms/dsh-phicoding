#!/usr/bin/env node
// 0500 - 主干里的注释。
//
// 哲学的原话是"不写注释，只有破坏编码哲学时才写"——注释是**允许的**，
// 有条件的。所以默认是校格式，不是禁止：一条合格的注释不该被判红。
// 项目若确实要更严，可以配 trunkComments: "forbidden" 自己收紧。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    // 一条没有作者日期的注释'
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

const mode = config.trunkComments ?? 'formatted'
const hits = []

for (const type of facts.types) {
  if (!inTrunk(type)) continue
  for (const comment of type.comments ?? []) {
    const text = comment.text.trim()
    if (mode === 'forbidden') {
      hits.push(`${type.file}:${comment.line}  主干里不该有注释：${text.slice(0, 40)}`)
      continue
    }
    const shape = /^\/\/ *(\S+) - (\d{4}-\d{2}-\d{2}) : (.+)$/
    const matched = shape.exec(text)
    if (!matched) {
      hits.push(`${type.file}:${comment.line}  注释格式不对（要 // 作者 - 日期 : 内容）：${text.slice(0, 40)}`)
    } else if (config.author && matched[1] !== config.author) {
      hits.push(`${type.file}:${comment.line}  注释作者是 ${matched[1]}，项目作者是 ${config.author}`)
    }
  }
}
for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)