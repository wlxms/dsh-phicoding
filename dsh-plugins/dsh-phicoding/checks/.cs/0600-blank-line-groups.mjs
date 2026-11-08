#!/usr/bin/env node
// 0600 - 超过 20 行的方法 / 类，内部不能一行空行都没有。
//
// 分组本身是软要求：按用途切成几组、刀口切在哪，取决于设计意图，机器判不了，
// 硬要判就是拿一行行号猜意图。机器只判一条底线——**一个长块里连一行空行都没有，
// 读者就看不到任何边界**，那是"没分组"的充分证据，不是风格偏好。
//
// 所以这条只判两件事：跨度超过 20 行，且内部空行数为 0。二者都成立才红。
//
// 空行事实来自底座，底座只解析不判断：空白行（只有空格也算）在内，多行字符串、
// 多行注释内部的空行不算——那是内容，不是分组。
//
// 判不判得了写在输出里：底座没给 blankLines 这条事实时就 exit 3，不算通过。

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const LIMIT = 20

// "类"是 class 那一族：class / struct / record / record struct。
// interface 与 enum 不在本规则射程内：成员列表天然一行一条，硬按行数判会误伤。
const CLASS_KINDS = new Set(['class', 'struct', 'record', 'recordstruct'])

// 方法契约：方法体、构造函数体都是"一个方法"。
const METHOD_KINDS = new Set(['method', 'constructor'])

if (!facts.types.some((type) => Array.isArray(type.blankLines))) {
  console.log('底座没有输出 blankLines 事实——判不了这一条，跳过，不算通过。')
  process.exit(3)
}

const findings = []

function judge(where, label) {
  if (where.endLine === undefined || where.endLine === null) return
  const length = where.endLine - where.line + 1
  if (length <= LIMIT) return
  if ((where.blankLines ?? []).length > 0) return
  findings.push(`${where.file}:${where.line}  ${label} 跨度 ${length} 行，内部一行空行都没有——超过 ${LIMIT} 行要按用途分组，组与组之间空一行`)
}

for (const type of facts.types) {
  if (CLASS_KINDS.has(type.kind)) {
    judge(type, `${type.kind} ${type.name}`)
  }
  for (const member of type.members ?? []) {
    if (!METHOD_KINDS.has(member.kind)) continue
    judge({ ...member, file: type.file }, `${member.kind} ${type.name}.${member.name}`)
  }
}

for (const finding of findings) console.log(finding)
process.exit(findings.length === 0 ? 0 : 1)
