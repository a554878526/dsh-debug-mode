import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../scripts/repair_debug_mode_sessions.py', import.meta.url))
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function unpack(path: string): Array<Record<string, unknown>> {
  const raw = execFileSync('zstd', ['-q', '-d', '-c', path], { encoding: 'utf8' })
  return raw.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
}

describe('repair_debug_mode_sessions.py', () => {
  it('dry-runs, backs up, and marks only legacy Debug Mode events ignorable', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-debug-mode-repair-'))
    roots.push(root)
    const home = join(root, 'home')
    const archive = join(home, 'sessions', 'workspace', 'session-test', 'session.jsonl.zstd')
    const plain = join(root, 'session.jsonl')
    const backup = join(root, 'backup')
    mkdirSync(dirname(archive), { recursive: true })
    const events = [
      { type: 'user/message', seq: 0, time: 1, data: { message: 'keep' } },
      { type: 'debug-mode/state', seq: 1, time: 2, data: { version: 1, phase: 'setup' } },
      { type: 'debug-mode/state', seq: 2, time: 3, data: { version: 1, phase: 'inactive' }, ignorable: true },
    ]
    writeFileSync(plain, events.map(event => JSON.stringify(event)).join('\n') + '\n')
    execFileSync('zstd', ['-q', '-f', plain, '-o', archive])
    const original = readFileSync(archive)

    const dryRun = execFileSync('python3', [SCRIPT, '--dsh-home', home], { encoding: 'utf8' })
    expect(dryRun).toContain('affectedSessions=1')
    expect(dryRun).toContain('affectedEvents=1')
    expect(dryRun).toContain('mode=dry-run')
    expect(readFileSync(archive)).toEqual(original)

    const applied = execFileSync('python3', [
      SCRIPT, '--dsh-home', home, '--backup-dir', backup, '--apply',
    ], { encoding: 'utf8' })
    expect(applied).toContain('mode=applied')
    const repaired = unpack(archive)
    expect(repaired[0]).toEqual(events[0])
    expect(repaired[1]).toMatchObject({ type: 'debug-mode/state', ignorable: true })
    expect(repaired[2]).toEqual(events[2])
    expect(readFileSync(join(backup, 'sessions', 'workspace', 'session-test', 'session.jsonl.zstd')))
      .toEqual(original)

    const after = execFileSync('python3', [SCRIPT, '--dsh-home', home], { encoding: 'utf8' })
    expect(after).toContain('affectedSessions=0')
    expect(after).toContain('affectedEvents=0')
  })
})
