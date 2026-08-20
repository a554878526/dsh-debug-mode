/** Durable Debug Mode state rejects malformed payloads and impossible transitions. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import * as DebugModeInvariant from '../src/invariant.ts'
import type {} from '../src/types.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(DebugModeInvariant)
  return ctx
}

/** Recover the Host session service inside this dual-face package's Client aggregate test. */
function hostSessions(ctx: Context): SessionStore {
  return ctx.get('sessions') as unknown as SessionStore
}

describe('Debug Mode invariants', () => {
  it('rejects waiting without setup and its owning handoff call', async () => {
    const ctx = await setup()
    const session = hostSessions(ctx).create(SessionId('debug-mode-invariant-wait'))
    expect(() => {
      session.append('debug-mode/state', {
        version: 1,
        phase: 'waiting-for-repro',
        handoff: {
          probeLocations: ['src/value.ts:select'],
          reproductionAction: 'Copy once.',
          logPath: '.codex-debug/debug.jsonl',
        },
      })
    }).toThrow(/cannot enter waiting-for-repro from inactive/)
    await ctx.fiber.dispose()
  })

  it('rejects incomplete handoffs and invalid phase order', async () => {
    const ctx = await setup()
    const malformed = hostSessions(ctx).create(SessionId('debug-mode-invariant-payload'))
    malformed.append('debug-mode/state', { version: 1, phase: 'setup' })
    expect(() => {
      malformed.append('debug-mode/state', {
        version: 1,
        phase: 'waiting-for-repro',
        handoff: { probeLocations: [], reproductionAction: '', logPath: '' },
      })
    }).toThrow(/requires non-empty probes/)

    const invalid = hostSessions(ctx).create(SessionId('debug-mode-invariant-analyze'))
    invalid.append('debug-mode/state', { version: 1, phase: 'setup' })
    expect(() => {
      invalid.append('debug-mode/state', { version: 1, phase: 'analyzing' })
    }).toThrow(/cannot enter analyzing from setup/)
    await ctx.fiber.dispose()
  })
})
