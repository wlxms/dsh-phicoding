#!/usr/bin/env node
// 0600 的语义测试：什么时候"没有空行"算违规。
//
// 这条规则的边界全在数字与"什么算空行"上，所以每个用例只动一个变量：
// 20 / 21 行、空行落在代码里 / 字符串里 / 注释里、空白行是不是空行。
// 只断言"报了 0 处"证明不了规则真的看了——所以每个红用例都点名它要的那一行。
//
//   node blank-lines.test.mjs
//
// 一个用例单独一个临时工程，跑 --only 0600；最后一个用例直接喂假 facts 给规则，
// 证"底座没有空行事实"时退出码是 3 而不是 0。
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')
const rule = join(here, '.cs', '0600-blank-line-groups.mjs')

// 一个方法：签名 + { + N 条语句（可在第 i 条前插空行） + }。
// 总行数 = N + 插的空行数 + 3。
function method(name, statements, blanks = []) {
  const lines = [`    public void ${name}()`, '    {']
  const gaps = new Set(blanks)
  for (let i = 1; i <= statements; i++) {
    if (gaps.has(i)) lines.push('')
    lines.push(`        var v${i} = ${i};`)
  }
  lines.push('    }')
  return lines.join('\n')
}

// 一个文件只有一个类：类头 + 成员（'' 表示一个空行）+ 类尾。
function classFile(members) {
  return ['public sealed class Sample', '{', ...members, '}'].join('\n') + '\n'
}

function lineOf(source, needle) {
  return source.split('\n').findIndex((line) => line.includes(needle)) + 1
}

const cases = []

// 20 行：不超过阈值，不判。类自身留了空行，保证红的只可能是方法。
{
  const big = method('Big', 17)
  const source = classFile(['    public int Value { get; set; }', '', big])
  cases.push({ name: '方法正好 20 行、无空行 → 不报（边界）', source, lines: [] })
}

// 21 行：超过阈值且内部零空行，必须点名方法那一行。
{
  const big = method('Big', 18)
  const source = classFile(['    public int Value { get; set; }', '', big])
  cases.push({ name: '方法 21 行、无空行 → 报', source, lines: [lineOf(source, 'public void Big()')] })
}

// 同样是 21 行，但组间有一行空行：长度不豁免，空行豁免。
{
  const big = method('Big', 17, [9])
  const source = classFile(['    public int Value { get; set; }', '', big])
  cases.push({ name: '方法 21 行、有一行空行 → 不报', source, lines: [] })
}

// 类自己超长且一行空行都没有：报的是类，不是它下面那些短方法。
{
  const source = classFile([1, 2, 3, 4, 5, 6].map((i) => method(`M${i}`, 0)))
  cases.push({ name: '类 21 行、成员之间没有空行 → 报类', source, lines: [1] })
}

// 类超长但成员之间有空行：分组存在，不报。
{
  const members = []
  for (let i = 1; i <= 4; i++) {
    if (i > 1) members.push('')
    members.push(method(`M${i}`, 3))
  }
  const source = classFile(members)
  cases.push({ name: '类超过 20 行、成员之间有空行 → 不报', source, lines: [] })
}

// 空行只在逐字字符串里：那是内容，不算分组。
{
  const statements = Array.from({ length: 15 }, (_, i) => `        var v${i + 1} = ${i + 1};`).join('\n')
  const body = [
    '    public void Big()',
    '    {',
    '        var text = @"first',
    '',
    'last";',
    statements,
    '    }',
  ].join('\n')
  const source = classFile(['    public string Text { get; set; } = "";', '', body])
  cases.push({ name: '空行只在字符串里 → 仍报', source, lines: [lineOf(source, 'public void Big()')] })
}

// 只有空格的空白行：读起来一样是空行，必须算。
{
  const statements = Array.from({ length: 17 }, (_, i) => `        var v${i + 1} = ${i + 1};`)
  statements.splice(8, 0, '        ')
  const body = ['    public void Big()', '    {', ...statements, '    }'].join('\n')
  const source = classFile(['    public int Value { get; set; }', '', body])
  cases.push({ name: '只有空格的空白行 → 算空行，不报', source, lines: [] })
}

// 空行只在多行注释里：同样是内容，不算分组。
{
  const statements = Array.from({ length: 15 }, (_, i) => `        var v${i + 1} = ${i + 1};`).join('\n')
  const body = [
    '    public void Big()',
    '    {',
    '        /*',
    '',
    '        */',
    statements,
    '    }',
  ].join('\n')
  const source = classFile(['    public int Value { get; set; }', '', body])
  cases.push({ name: '空行只在多行注释里 → 仍报', source, lines: [lineOf(source, 'public void Big()')] })
}

const results = []

for (const item of cases) {
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-blank-'))
  await writeFile(join(dir, 'Shapes.cs'), item.source)

  const result = spawnSync('node', [cli, '--root', dir, '--only', '0600'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })

  const reported = [...out.matchAll(/Shapes\.cs:(\d+)\s/g)]
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b)
  const want = [...item.lines].sort((a, b) => a - b)
  const samePlaces = reported.length === want.length && want.every((line, at) => reported[at] === line)
  // 期望无违规时退出码也必须是 0：否则"规则没跑"会被当成"干净"。
  const statusOk = want.length > 0 ? result.status === 1 : result.status === 0
  const ok = samePlaces && statusOk

  results.push({ name: item.name, ok })
  const detail = want.length === 0 ? '期望 0 处' : `期望 ${want.join(', ')} 行`
  console.log(`${ok ? '  ok   ' : '  FAIL '} ${item.name}   ${detail}`)
  if (!ok) {
    console.log(`         实际：${reported.length === 0 ? '（无）' : reported.join(', ')}   exit=${result.status}`)
    console.log(out.split('\n').slice(-8).map((line) => `         ${line}`).join('\n'))
  }
}

// 底座没给空行事实：规则必须说"判不了"，而不是"没事"。
{
  const dir = await mkdtemp(join(tmpdir(), 'phicoding-blank-facts-'))
  const factsPath = join(dir, 'facts.json')
  await writeFile(
    factsPath,
    JSON.stringify({
      types: [{ name: 'X', kind: 'class', file: 'X.cs', line: 1, endLine: 40, members: [] }],
      references: [],
    }),
  )
  const result = spawnSync(
    'node',
    [rule, '--facts', factsPath, '--config', join(dir, 'config.json'), '--rules', here, '--root', dir],
    { encoding: 'utf8' },
  )
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  await rm(dir, { recursive: true, force: true })
  const ok = result.status === 3 && out.includes('不算通过')
  results.push({ name: '底座没有空行事实 → exit 3，不算通过', ok })
  console.log(`${ok ? '  ok   ' : '  FAIL '} 底座没有空行事实 → exit 3，不算通过   exit=${result.status}`)
}

const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(failed === 0 ? `BLANK-LINE-TEST=PASS  ${results.length} 项` : `BLANK-LINE-TEST=FAILED  ${failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
