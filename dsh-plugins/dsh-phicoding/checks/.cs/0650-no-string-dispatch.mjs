#!/usr/bin/env node
// 0650 - 主干里不许按字符串字面量分派。
//
// 禁的不是"字符串当键"。Dictionary<string, Item> 里的 string 可能是 itemId ——
// 那是数据，不是类型名，按键的种类判会把正常设计一起判死。
//
// 真正要禁的是：**拿一个字面量去决定走哪条路**。
//   switch (kind) { case "sword": ... }
//   if (kind == "sword") ...
//   kind is "sword"
// 那一行把"种类"从 CLR 类型降级成了一串字符：写错不编译报错、加一种要改主干、
// 而且它恰好是"名字进了主干"最直接的形状。
//
// 有些场合逃不掉：反序列化要读线格式里的 "type" 字段，数据层的字段名也是字符串。
// 所以默认禁用，**用结构化注释显式豁免**，而且豁免必须说明属于哪一类：
//
//   // pc: author=wlxms date=2026-10-18 waive=0650 why=serialization note="线格式里的 type 字段"
//
// why 只有三类（见 0500）：data / serialization / plumbing。注释本身的格式由 0500 判，
// 这条规则只读 waive 与 why 两个字段——**一套格式，两处规则共用**。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    public bool Probe(string kind) => kind == "探针分类";'
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
  console.log('没有项目配置 —— 主干范围无从确定，跳过，不算通过。')
  process.exit(3)
}
if (config.trunk === undefined || config.trunk === null) {
  console.log('项目配置里没有 trunk。主干是哪一块必须由项目声明，规则不许自己猜。')
  process.exit(3)
}

const trunk = String(config.trunk)
  .split('\\')
  .join('/')
  .replace(/^\.\/?/, '')
  .replace(/\/$/, '')
const inTrunk = (file) => trunk === '' || String(file).split('\\').join('/').startsWith(trunk)

// 豁免必须点名类别，否则它只是一句"我觉得可以"。
// 格式的合法性由 0500 判；这条规则只读 waive / why 两个字段。
const waives = (comment) => String(comment.fields?.waive ?? '').split(',').map((one) => one.trim())

function enclosing(members, line) {
  let best
  for (const member of members ?? []) {
    if (member.line === undefined || member.endLine === undefined) continue
    if (line < member.line || line > member.endLine) continue
    if (!best || member.endLine - member.line < best.endLine - best.line) best = member
  }
  return best
}

// 注释写在成员上方时落在 Span 之外，但在 FullSpan 之内（见 facts 的 firstLine）。
function withinMember(member, line) {
  if (member === undefined) return false
  const start = member.firstLine ?? member.line
  return line >= start && line <= member.endLine
}

const shown = []
const excused = {}

for (const type of facts.types) {
  if (!inTrunk(type.file)) continue
  for (const dispatch of type.dispatches ?? []) {
    // 空串不是名字。它只表达"有没有值"，不携带任何分类信息。
    if (dispatch.literal.length === 0) continue

    const member = enclosing(type.members, dispatch.line)
    const inScope = (comment) =>
      member === undefined ? comment.line === dispatch.line : withinMember(member, comment.line)
    const nearby = (type.comments ?? []).filter(inScope)

    const granted = nearby.find((comment) => waives(comment).includes('0650'))
    if (granted) {
      const why = granted.fields?.why ?? 'unknown'
      excused[why] = (excused[why] ?? 0) + 1
      continue
    }
    shown.push(`${type.file}:${dispatch.line}  ${type.name} 按字面量 "${dispatch.literal}" 分派（${dispatch.kind}）`)
  }
}

for (const hit of shown) console.log(hit)

const total = Object.values(excused).reduce((sum, one) => sum + one, 0)
if (shown.length === 0 && total > 0) {
  // 豁免本身是事实，要说出来。否则"没人违规"和"全被豁免了"长得一模一样。
  const detail = Object.entries(excused).map(([why, n]) => `${why} ${n}`).join(' / ')
  console.log(`豁免 ${total} 处（${detail}）`)
}

process.exit(shown.length === 0 ? 0 : 1)
