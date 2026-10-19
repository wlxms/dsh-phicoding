// 给一个还没配置过的工程，推断出 .phicoding/config.json。
//
// 两项都能从工程里读出来，不该让人手填：
//   主干   —— 用依赖图判"闭合"：某一组文件里的类型，没有任何一条引用指向组外。
//             这就是「主干只知抽象」的可观测形态，不需要用户先懂这套哲学。
//   作者   —— 取版本管理的用户名；没有版本管理才退回系统用户名。
//
// 判不出来时也要给结论并说明理由：宁可给一个可以反驳的猜测，也不要留一个空文件
// 让所有规则报"读不到配置"。
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CORE_NAMES = /^(core|domain|kernel|abstractions?|contracts?|model|entities)$/i
const toSlash = (text) => String(text).split('\\').join('/')
const depth = (dir) => dir.split('/').filter(Boolean).length

function author(root) {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8', timeout: 3000 }).trim()
    if (name) return { value: name, why: 'git config user.name' }
  } catch {
    // 没有 git、没配用户名、或者不是仓库——都不是错误，只是换一个来源。
  }
  const fallback = process.env.GIT_AUTHOR_NAME || process.env.USERNAME || process.env.USER
  return fallback
    ? { value: fallback, why: '系统用户名（没有可用的 git 用户名）' }
    : { value: 'unknown', why: '读不到任何用户名，请自行填写' }
}

// 所有"包含类型"的目录，含各级祖先。
function candidateDirs(files) {
  const dirs = new Set()
  for (const file of files) {
    const parts = file.split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  return [...dirs]
}

export function detect(facts, root) {
  const types = facts.types ?? []
  const refs = facts.references ?? []
  const files = types.map((type) => toSlash(type.file))
  const byName = new Map()
  for (const type of types) if (!byName.has(type.name)) byName.set(type.name, type)

  const fileOf = new Map(types.map((type) => [type.name, toSlash(type.file)]))
  const under = (file, dir) => file === dir || file.startsWith(dir + '/')

  // 每条引用落到"目标声明在哪个文件"，再看它是否还在同一组里。
  const edges = refs
    .filter((ref) => ref.from !== ref.to)
    .map((ref) => ({ from: fileOf.get(ref.from), to: fileOf.get(ref.to) }))
    .filter((edge) => edge.from && edge.to)

  const reasons = []
  let trunk = null

  const closed = []
  for (const dir of candidateDirs(files)) {
    const inside = files.filter((file) => under(file, dir))
    if (inside.length === 0) continue
    const leaking = edges.filter((edge) => under(edge.from, dir) && !under(edge.to, dir))
    if (leaking.length === 0) closed.push({ dir, size: inside.length })
  }

  if (closed.length > 0) {
    const named = closed.filter((one) => CORE_NAMES.test(one.dir.split('/').pop()))
    const pool = named.length > 0 ? named : closed
    // 同名时取更深的那个：`src/Core` 与 `Core` 同时闭合，后者更具体。
    pool.sort((a, b) => depth(b.dir) - depth(a.dir) || b.size - a.size)
    trunk = pool[0]
    reasons.push(`主干 ${trunk.dir}/ —— ${trunk.size} 个类型，没有一条引用指向它外面（闭合）`)
  } else {
    // 没有完全闭合的组：按"漏出去最少"选一个，并明确说这是妥协。
    const scored = candidateDirs(files)
      .map((dir) => {
        const inside = files.filter((file) => under(file, dir))
        const leaking = edges.filter((edge) => under(edge.from, dir) && !under(edge.to, dir)).length
        return { dir, size: inside.length, leaking }
      })
      .filter((one) => one.size > 0)
      .sort((a, b) => a.leaking - b.leaking || b.size - a.size)
    if (scored.length === 0) return null
    trunk = scored[0]
    reasons.push(`主干 ${trunk.dir}/ —— 没有完全闭合的目录，按"指向组外的引用最少"（${trunk.leaking} 条）选，建议你复核`)
  }

  // 变体：装得下"主干之外的任何类型"的最外层目录。
  const outside = files.filter((file) => !under(file, trunk.dir))
  const variantDirs = candidateDirs(outside)
    .filter((dir) => !under(trunk.dir, dir)) // 丢掉主干的祖先
    .filter((dir) => outside.some((file) => under(file, dir)))
  const topMost = variantDirs.filter((dir) => !variantDirs.some((other) => other !== dir && dir.startsWith(other + '/')))
  const variants = [...new Set(topMost)].sort()
  if (variants.length > 0) reasons.push(`变体 ${variants.join(' / ')}`)

  const who = author(root)
  reasons.push(`作者 ${who.value}（${who.why}）`)

  const config = {
    _说明: 'trunk 是主干（只知抽象的那块），variants 是具体实现。本文件由 `phicoding --init` 推断，可随时手改。',
    trunk: trunk.dir + '/',
    variants,
    trunkComments: 'formatted',
    author: who.value
  }
  if (existsSync(join(root, 'PLAN.md'))) config.plan = 'PLAN.md'

  return { config, reasons }
}

export async function save(root, config) {
  const dir = join(root, '.phicoding')
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'config.json')
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', 'utf8')
  return path
}
