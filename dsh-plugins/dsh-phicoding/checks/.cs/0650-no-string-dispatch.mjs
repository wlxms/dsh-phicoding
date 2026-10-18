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
// 所以默认禁用，**用注释显式豁免**，而且豁免必须说明属于哪一类：
//
//   // 作者 - 日期 : 豁免·序列化 —— JsonElement 的 type 是线格式，不是类型名
//
// 三类：数据层 / 序列化 / 工程。说不清是哪一类，就不是可豁免的情况。
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
const CATEGORY = /豁免\s*[·:：]\s*(数据层|序列化|工程)/
const MENTIONS = /豁免/

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
const excused = { 数据层: 0, 序列化: 0, 工程: 0 }
const bad = []

for (const type of facts.types) {
  if (!inTrunk(type.file)) continue
  for (const dispatch of type.dispatches ?? []) {
    // 空串不是名字。它只表达"有没有值"，不携带任何分类信息。
    if (dispatch.literal.length === 0) continue

    const member = enclosing(type.members, dispatch.line)
    const inScope = (comment) =>
      member === undefined ? comment.line === dispatch.line : withinMember(member, comment.line)
    const nearby = (type.comments ?? []).filter(inScope)

    const granted = nearby.find((comment) => CATEGORY.test(comment.text))
    if (granted) {
      excused[CATEGORY.exec(granted.text)[1]] += 1
      continue
    }
    // 写了"豁免"却没说类别 —— 这不是豁免，是没想清楚。
    if (nearby.some((comment) => MENTIONS.test(comment.text))) {
      bad.push(`${type.file}:${dispatch.line}  豁免没说是哪一类（要 豁免·数据层 / 序列化 / 工程）：${dispatch.literal}`)
      continue
    }
    shown.push(`${type.file}:${dispatch.line}  ${type.name} 按字面量 "${dispatch.literal}" 分派（${dispatch.kind}）`)
  }
}

for (const hit of shown) console.log(hit)
for (const hit of bad) console.log(hit)

const total = excused.数据层 + excused.序列化 + excused.工程
if (shown.length === 0 && bad.length === 0 && total > 0) {
  // 豁免本身是事实，要说出来。否则"没人违规"和"全被豁免了"长得一模一样。
  console.log(`豁免 ${total} 处（数据层 ${excused.数据层} / 序列化 ${excused.序列化} / 工程 ${excused.工程}）`)
}

process.exit(shown.length === 0 && bad.length === 0 ? 0 : 1)
