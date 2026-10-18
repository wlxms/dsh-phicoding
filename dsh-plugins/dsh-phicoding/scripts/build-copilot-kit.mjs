#!/usr/bin/env node
// 把 phicoding 打包成「VS Code Copilot 套件」。
//
// 不手工拷贝，而是从插件包**生成**——手工拷两份一定漂移，而漂移的规则比没有规则更糟。
//
//   node scripts/build-copilot-kit.mjs [输出目录]
//
// 产物：
//   .github/skills/<6 个技能>/SKILL.md    Copilot Agent Skills（开放标准，与 DSH 同一格式）
//   .github/copilot-instructions.md       常驻的那几行
//   phicoding/checks/                     检查器全套（含 C# 底座）
//   .vscode/tasks.json                    一键跑检查
//   .phicoding/config.json                项目配置模板
//   install.mjs                           把套件装进目标仓库
//   README.md
//
// 静态那几份放在 scripts/copilot-kit/，本脚本只负责把它们与技能、检查器装配到一起。
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..')
const templates = join(here, 'copilot-kit')
const out = resolve(process.argv[2] ?? join(pkg, '..', '..', 'dist', 'phicoding-copilot'))

const SKIP = new Set(['bin', 'obj', '.build', 'node_modules'])

async function copyTree(from, to) {
  const info = await stat(from)
  if (!info.isDirectory()) {
    await mkdir(dirname(to), { recursive: true })
    await cp(from, to)
    return
  }
  await mkdir(to, { recursive: true })
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    await copyTree(join(from, entry.name), join(to, entry.name))
  }
}

// Copilot 的两个硬要求：name 必须等于目录名；description 不超过 1024 字符。
// 不满足就**构建失败**，而不是产出一个装不进 Copilot 的套件。
async function installSkill(name, destination) {
  // 统一换行与 BOM 之后再解析：CRLF 会让行首锚点匹配不上，而那会表现成
  // "这个技能没有 frontmatter" —— 一个和真实原因无关的错误信息。
  const text = (await readFile(join(pkg, 'skills', name, 'SKILL.md'), 'utf8'))
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
  const header = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!header) throw new Error(`${name}/SKILL.md 没有 frontmatter`)
  const declared = /^name:\s*(.+)$/m.exec(header[1])?.[1]?.trim()
  if (declared !== name) throw new Error(`${name}/SKILL.md 的 name 与目录名不一致：${declared ?? '缺失'}`)
  const description = /^description:\s*(.+)$/m.exec(header[1])?.[1] ?? ''
  if (description.length > 1024) throw new Error(`${name} 的 description 有 ${description.length} 字符，超过 1024`)
  await mkdir(destination, { recursive: true })
  await writeFile(join(destination, 'SKILL.md'), text, 'utf8')
}

await rm(out, { recursive: true, force: true })

const skillNames = (await readdir(join(pkg, 'skills'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

for (const name of skillNames) await installSkill(name, join(out, '.github', 'skills', name))
await copyTree(join(pkg, 'checks'), join(out, 'phicoding', 'checks'))
await copyTree(templates, out)

console.log(`已生成：${out}`)
console.log(`  技能 ${skillNames.length} 个：${skillNames.join(' / ')}`)
