#!/usr/bin/env node
// 1300 - 规划里的每条锚点都要说得出谁在守它，而且那个守卫要真的存在。
//
// 锚点是规划的产物，不是代码的属性——所以它在项目里，不在通用规则里。
// 只核两件事：每条锚点有归属；归属指向的规则真的在目录里。
// 规则清单从目录扫，不手写。
export const probe = {
  file: 'PLAN.md',
  kind: 'append',
  inject: '\n| A99 | 探针锚点 | 无 |\n'
}

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)

if (args.includes('--probe-spec')) {
  console.log(JSON.stringify(probe))
  process.exit(0)
}

const root = args[args.indexOf('--root') + 1]
const toolsDir = args[args.indexOf('--rules') + 1]

let config = {}
try {
  config = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'))
} catch {
  console.log('读不到项目配置。')
  process.exit(1)
}

const planPath = join(root, config.plan ?? 'PLAN.md')
let plan
try {
  plan = readFileSync(planPath, 'utf8')
} catch {
  console.log(`读不到规划 ${planPath}。锚点无从核对——这是失败，不是通过。`)
  process.exit(1)
}

let guard
try {
  guard = JSON.parse(readFileSync(join(root, '.phicoding', 'anchors.json'), 'utf8'))
} catch {
  console.log('读不到 .phicoding/anchors.json。每条锚点由谁守，必须写下来。')
  process.exit(1)
}

// 锚点在规划里是一张表的第一列 —— 但规划里还有其他表（失败记录、规格留白、
// 探针），它们也用第一列当编号。所以按锚点前缀匹配，前缀由项目声明。
const prefix = config.anchorPrefix ?? 'A'
const pattern = new RegExp('^\\|\\s*(' + prefix + '\\d+[a-z]?)\\s*\\|')
const declared = new Set()
for (const line of plan.split('\n')) {
  const row = pattern.exec(line.trim())
  if (row) declared.add(row[1])
}

// 规则清单从两个目录扫出来 —— 手写的只能是派生不出来的那一维。
const ruleIds = new Set()
for (const dir of [toolsDir, join(root, '.phicoding', 'rules')]) {
  if (!dir || !existsSync(dir)) continue
  for (const name of readdirSync(dir)) {
    if (/^\d{4}-.+\.(mjs|js|sh|cmd|exe|py)$/.test(name)) ruleIds.add(name.replace(/\.[^.]+$/, ''))
  }
}

const reserved = new Set(['Spec', 'probe', 'all-rules'])
const hits = []

for (const anchor of declared) {
  if (!(anchor in guard)) {
    hits.push(`ORPHAN   锚点 ${anchor} 没有守卫——规划里写了它，但没说谁守`)
    continue
  }
  const owner = guard[anchor]
  if (reserved.has(owner)) continue
  if (!ruleIds.has(owner)) hits.push(`MISSING  锚点 ${anchor} 指向的守卫 ${owner} 不在规则目录里`)
}

const owners = Object.keys(guard).filter((k) => !k.startsWith('_'))
for (const anchor of owners) {
  if (!declared.has(anchor)) hits.push(`GHOST    守卫表里有 ${anchor}，规划里没有这条锚点`)
}

for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)