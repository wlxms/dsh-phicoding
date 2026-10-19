#!/usr/bin/env node
// 把本套件装进目标仓库。已存在的文件不覆盖，只报告。
//
//   node install.mjs <目标仓库> [--force]
import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const kit = dirname(fileURLToPath(import.meta.url))
const target = resolve(process.argv[2] ?? '.')
const force = process.argv.includes('--force')
const ITEMS = ['.github', 'phicoding', '.vscode']

let copied = 0
let skipped = 0

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function place(from, to) {
  const info = await stat(from)
  if (info.isDirectory()) {
    await mkdir(to, { recursive: true })
    for (const entry of await readdir(from)) await place(join(from, entry), join(to, entry))
    return
  }
  if (!force && (await exists(to))) {
    console.log('  跳过（已存在） ' + to)
    skipped++
    return
  }
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to)
  console.log('  写入 ' + to)
  copied++
}

for (const item of ITEMS) await place(join(kit, item), join(target, item))

console.log('')
console.log('完成：写入 ' + copied + ' 个文件，跳过 ' + skipped + ' 个。')
console.log('下一步：直接跑 node phicoding/checks/phicoding.mjs --root .')
console.log('第一次运行会自动推断 trunk / variants / author 并生成 .phicoding/config.json。')
