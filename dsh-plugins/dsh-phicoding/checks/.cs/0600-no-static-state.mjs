#!/usr/bin/env node
// 0600 - 主干里不许有可变的静态状态。
//
// 禁的不是 static 这个关键字。C# 没有模块系统，static class 就是模块：
// 静态方法、扩展方法、常量、static readonly 的不可变值，全是好写法。
//
// 危险的是另一件事：**静态的、可变的、生命周期超过一次调用的状态**。
// 它是隐式全局变量——谁都能改，谁都不负责，测试之间互相污染，热重载不重置。
//
// 还有一个更具体的形状（phicoding-shape 早就写了）：
//   **静态集合按实例类型索引** —— 外挂账本。容器不暴露自己的键，账本只好挂在
//   外面；实例销毁了账本还留着。所以 static readonly 也不是免死金牌：它只保证
//   引用不换，里面的条目照样会泄漏。
export const probe = {
  file: 'Core/Slot.cs',
  kind: 'replace',
  find: '    public string Name { get; } = name;',
  with: '    public string Name { get; } = name;\n\n    public static int Probe;'
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

// "." 与 "" 都表示"整个项目都是主干"。不归一化的话 trunk = "." 会让
// `Types.cs`.startsWith(".") 为假：规则不报错，只是永远不判，读起来像干净。
const trunk = String(config.trunk)
  .split('\\')
  .join('/')
  .replace(/^\.\/?/, '')
  .replace(/\/$/, '')
const inTrunk = (file) => trunk === '' || String(file).split('\\').join('/').startsWith(trunk)

// 本工程声明的类型名，用来判"这个静态集合的键是不是实例"。
const declared = new Set(facts.types.map((type) => type.name))

// 账本天生是静态的：没有构造注入的地方（Unity、程序入口），"谁在这"只能挂在
// 一个进程级容器上。所以开一个**声明式**的窄缝——由项目点名哪几个类型是账本，
// 规则不许自己猜。缝只有一处，写在配置里，可评审。
const owners = new Set(config.staticStateOwners ?? [])

function keyedByInstance(typeText) {
  if (!typeText) return false
  for (const name of declared) {
    if (new RegExp(`\\b${name}\\b`).test(typeText)) return true
  }
  return false
}

const hits = []
for (const type of facts.types) {
  if (!inTrunk(type.file)) continue
  if (owners.has(type.name)) continue
  for (const member of type.members ?? []) {
    if (!member.isStatic) continue
    // 行为不是状态。静态方法不持有任何东西。
    if (member.kind === 'method') continue
    if (member.isConst) continue

    if (member.isReadOnly) {
      // 引用不再换，但集合会。按实例索引的静态集合就是外挂账本。
      if (keyedByInstance(member.type)) {
        hits.push(`${type.file}:${member.line}  ${type.name}.${member.name} 是静态集合却按实例索引（外挂账本）：${member.type}`)
      }
      continue
    }
    hits.push(`${type.file}:${member.line}  ${type.name}.${member.name} 是可变静态状态（隐式全局变量）`)
  }
}

for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)
