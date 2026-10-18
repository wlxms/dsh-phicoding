#!/usr/bin/env node
// 0500 - 注释只许是追溯注释：// 作者 - 日期 : 内容
//
// 全项目，不只是主干。理由：注释的规矩是编码层的（编1 代码即注释、编2 注释可
// 追溯），而编码规则没有"哪个目录可以例外"这一说——主干与变体都是人读的代码。
//
// 判据只有两条：格式对得上；作者与本项目的版本管理用户名一致。
// `trunkComments: "forbidden"` 是项目自选的一档：一条注释都不许出现。
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
  // The author is project metadata. Without it the rule cannot judge the one thing
  // it exists for, so it says so instead of passing.
  console.log('没有项目配置 —— 作者与注释策略无从确定，跳过，不算通过。')
  process.exit(3)
}

const mode = config.trunkComments ?? 'formatted'
const hits = []

for (const type of facts.types) {
  for (const comment of type.comments ?? []) {
    const text = comment.text.trim()
    if (mode === 'forbidden') {
      hits.push(`${type.file}:${comment.line}  这个项目不许有注释：${text.slice(0, 40)}`)
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
