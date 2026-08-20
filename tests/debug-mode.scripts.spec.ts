/** Packaged Debug Mode helper output that the model copies into product probes. */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../scripts/new_debug_session.py', import.meta.url))
describe('new_debug_session.py', () => {
  it('prints a background ingest handoff and fetch-only browser probe', () => {
    const output = execFileSync('python3', [SCRIPT, '--root', '.', '--session', 'script-test'], {
      encoding: 'utf8',
    })
    expect(output).toContain("Start ingest server with the shell tool's background option")
    expect(output).toContain('void fetch("http://127.0.0.1:8765/log"')
    expect(output).toContain('ingestUrl=http://127.0.0.1:8765/log')
    expect(output).toContain('CODEX_DEBUG_INGEST_FAILED')
    expect(output).toContain('console-only probes are invalid')
    expect(output).toContain('emit the exact <debug_reproduction_handoff> wrapper')
    expect(output).toContain('probeLocations, reproductionAction, and logPath')
    const replacer = '(_key, value) => typeof value === "bigint" ? value.toString() : value'
    expect(output.split(replacer)).toHaveLength(3)
    expect(output).toContain('body: JSON.stringify(payload,')
    expect(output).not.toContain('body: JSON.stringify(payload)')
    expect(output).not.toContain('console.info')
  })
})
