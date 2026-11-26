#!/usr/bin/env node
// Semi-hard profile: with profile.mode=warn a style finding is printed as WARN and
// does not block; the same tier can be raised to error by config.
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')
const dir = await mkdtemp(join(tmpdir(), 'phicoding-profile-'))

const longBody = Array.from({ length: 24 }, (_, index) => `        Total += ${index};`).join('\n')

try {
  await mkdir(join(dir, 'Core', 'Interfaces'), { recursive: true })
  await mkdir(join(dir, 'Core', 'Impl'), { recursive: true })
  await mkdir(join(dir, '.phicoding'), { recursive: true })
  await writeFile(join(dir, 'Core', 'Interfaces', 'IThing.cs'), `namespace T;
public interface IThing
{
    int Total { get; }
}
`)
  await writeFile(join(dir, 'Core', 'Impl', 'Thing.cs'), `namespace T;
public sealed class Thing : IThing
{
    public int Total { get; private set; }

    public void Run()
    {
${longBody}
    }
}
`)
  await writeFile(join(dir, '.phicoding', 'config.json'), JSON.stringify({
    trunk: 'Core/',
    variants: [],
    trunkComments: 'formatted',
    author: 'selftest',
    profile: { mode: 'warn' }
  }))

  const result = spawnSync('node', [cli, '--root', dir], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' }
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const checks = [
    ['profile finding is WARN, not RED', /WARN\s+PROFILE_STYLE_03/.test(out) && !/RED\s+PROFILE_STYLE_03/.test(out)],
    ['profile warning does not block the run', result.status === 0 && /PHICODING=OK/.test(out) && /WARN\s+\d+\s+处/.test(out)]
  ]
  let failed = 0
  for (const [name, ok] of checks) {
    console.log(`${ok ? '  ok   ' : '  FAIL '} ${name}`)
    if (!ok) {
      failed++
      console.log(out.split('\n').slice(-25).map((line) => `         ${line}`).join('\n'))
    }
  }
  console.log('')
  console.log(failed === 0 ? 'PROFILE-TEST=PASS  2 项' : `PROFILE-TEST=FAILED  ${failed}/2`)
  process.exitCode = failed === 0 ? 0 : 1
} finally {
  await rm(dir, { recursive: true, force: true })
}
