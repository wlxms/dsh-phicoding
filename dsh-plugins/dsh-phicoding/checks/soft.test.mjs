#!/usr/bin/env node
// Soft tier: a design-review finding is reported but never blocks the run.
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'phicoding.mjs')
const dir = await mkdtemp(join(tmpdir(), 'phicoding-soft-'))

try {
  await mkdir(join(dir, 'Core', 'Interfaces'), { recursive: true })
  await mkdir(join(dir, 'Core', 'Impl'), { recursive: true })
  await writeFile(join(dir, 'Core', 'Interfaces', 'IThing.cs'), `namespace T;
public interface IThing
{
    int Total { get; }
}
`)
  await writeFile(join(dir, 'Core', 'Interfaces', 'IHelper.cs'), `namespace T;
public interface IHelper
{
    int Value { get; }
}
`)
  await writeFile(join(dir, 'Core', 'Impl', 'Helper.cs'), `namespace T;
public sealed class Helper : IHelper
{
    public int Value => 1;
}
`)
  await writeFile(join(dir, 'Core', 'Impl', 'Thing.cs'), `namespace T;
public sealed class Thing : IThing
{
    private readonly Helper helper = new();

    public int Total => helper.Value;
}
`)

  const result = spawnSync('node', [cli, '--root', dir], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, DOTNET_NOLOGO: '1' }
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const checks = [
    ['SOFT_DESIGN_01 finding is reported as soft', /soft\s+SOFT_DESIGN_01/.test(out)],
    ['soft finding does not block', result.status === 0 && /PHICODING=OK/.test(out)]
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
  console.log(failed === 0 ? 'SOFT-TEST=PASS  2 项' : `SOFT-TEST=FAILED  ${failed}/2`)
  process.exitCode = failed === 0 ? 0 : 1
} finally {
  await rm(dir, { recursive: true, force: true })
}
