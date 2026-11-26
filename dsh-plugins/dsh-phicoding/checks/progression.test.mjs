#!/usr/bin/env node
// The meta gate is progressive: a failed stage blocks every later stage.
// This is the falsifier for "it still ran the rest and pretended they were clean".
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')
const dir = await mkdtemp(join(tmpdir(), 'phicoding-progression-'))

try {
  await mkdir(join(dir, 'A'), { recursive: true })
  await mkdir(join(dir, 'B'), { recursive: true })
  await writeFile(join(dir, 'A', 'A.cs'), `namespace T;
public abstract class A
{
    public B? Partner { get; set; }
}
`)
  await writeFile(join(dir, 'B', 'B.cs'), `namespace T;
public abstract class B
{
    public A? Partner { get; set; }
}
`)

  const result = spawnSync('node', [cli, '--root', dir], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' }
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const checks = [
    ['directory cycle is reported by the meta stage', /META\s+3\/6\s+目录无环/.test(out) && /RED\s+META_DIR_ACYCLIC_01/.test(out)],
    ['later meta stages are blocked, not green', /BLOCKED\s+META\s+4\/6/.test(out) && /BLOCKED\s+META\s+5\/6/.test(out)],
    ['profile and soft are blocked', /BLOCKED\s+PROFILE/.test(out) && /BLOCKED\s+SOFT/.test(out)],
    ['the run fails', result.status === 1 && /PHICODING=FAILED/.test(out)],
    ['blocked rules are not reported as pass', !/green\s+META_NAMING_01/.test(out)]
  ]
  let failed = 0
  for (const [name, ok] of checks) {
    console.log(`${ok ? '  ok   ' : '  FAIL '} ${name}`)
    if (!ok) {
      failed++
      console.log(out.split('\n').slice(-20).map((line) => `         ${line}`).join('\n'))
    }
  }
  console.log('')
  console.log(failed === 0 ? 'PROGRESSION-TEST=PASS  5 项' : `PROGRESSION-TEST=FAILED  ${failed}/5`)
  process.exitCode = failed === 0 ? 0 : 1
} finally {
  await rm(dir, { recursive: true, force: true })
}
