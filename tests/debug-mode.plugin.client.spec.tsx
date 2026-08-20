// @vitest-environment jsdom
/**
 * Debug Mode plugin halves on a real cordis Context with fake faces.
 *
 * Browser half: registers the command-activated loop strip at
 * `conversation.input.dock` and drops it when the fiber unloads (HMR safety).
 *
 * Host half: registers the `debug-mode` skill into the skills registry and
 * disposes the registration with the fiber.
 */
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CommandId, type CommandDefinition } from '@deepseek-ai/dsh-commands'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply, DEBUG_MODE_COMMAND, internals } from '../src/index.ts'
import { debugModeSkill } from '../src/skill.ts'

const SID = 'debug-mode-test' as SessionId

afterEach(cleanup)

/** Boot the browser half over fake slots/locale faces. */
async function benchBrowser() {
  const ctx = new Context()
  let pluginCtx: Context | undefined
  const entries: Array<{ options: Record<string, unknown>, component: unknown }> = []
  const slots = {
    inject: (_name: string, register: () => () => void) => {
      if (pluginCtx === undefined) throw new Error('client plugin context is not active')
      pluginCtx.effect(register)
    },
    register: (options: Record<string, unknown>, component: unknown) => {
      const entry = { options, component, ...options }
      entries.push(entry)
      return () => { entries.splice(entries.indexOf(entry), 1) }
    },
    entries: (_name: string) => entries,
  }
  ctx.provide('slots', slots)
  ctx.provide('locale', { register: () => () => undefined })
  ctx.provide('commandUi', {})
  const fiber = ctx.plugin({
    inject: [...inject],
    apply(runtimeCtx) {
      pluginCtx = runtimeCtx
      apply(runtimeCtx)
    },
  })
  return {
    ctx,
    fiber,
    dockEntry: () => entries[0],
  }
}

describe('ui-debug-mode browser plugin', () => {
  it('registers the command-activated dock strip', async () => {
    const b = await benchBrowser()
    await b.fiber.await()

    const dock = b.dockEntry()
    expect(dock?.options).toMatchObject({ id: 'debug-mode', order: 20 })
    expect(dock?.locale).toBe('debug-mode')

    expect(dock?.store).toBeDefined()

    const injected = dock?.inject?.(SID as never) as { subscribeActivation(listener: (sourceEventSeq: number) => void): () => void }
    const activated = vi.fn()
    const unsubscribe = injected.subscribeActivation(activated)
    b.ctx.emit('command/executed', SID, DEBUG_MODE_COMMAND, { kind: 'success', text: 'started', sourceEventSeq: 5 })
    expect(activated).toHaveBeenCalledWith(5)
    b.ctx.emit('command/executed', SID, 'other', { kind: 'success', text: 'ignored' })
    b.ctx.emit('command/executed', SID, DEBUG_MODE_COMMAND, { kind: 'error', text: 'ignored' })
    expect(activated).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('drops the dock entry when the plugin fiber unloads (HMR safety)', async () => {
    const b = await benchBrowser()
    await b.fiber.await()
    expect(b.dockEntry()).toBeDefined()
    await b.fiber.dispose()
    expect(b.dockEntry()).toBeUndefined()
  })
})

describe('ui-debug-mode host plugin', () => {
  it('registers the skill and /debug command, then disposes the skill', async () => {
    const ctx = new Context()
    const disposer = vi.fn()
    const register = vi.fn(() => disposer)
    const commandRegister = vi.fn<(definition: CommandDefinition) => void>()
    const flush = vi.fn(() => Promise.resolve())
    const append = vi.fn(() => ({ seq: 17 }))
    ctx.provide('skills', { register })
    ctx.provide('commands', { register: commandRegister })
    ctx.provide('llm', {})
    ctx.provide('sessions', { flush, get: vi.fn(), list: () => [] })
    ctx.provide('tools', { guard: vi.fn(), register: vi.fn() })
    const resolveResourceBase = internals.resolveResourceBase
    internals.resolveResourceBase = () => '/installed/debug-mode/scripts'
    const fiber = ctx.plugin({ inject: ['llm', 'sessions', 'skills', 'tools'], apply: nodeApply })
    await fiber.await()

    expect(register).toHaveBeenCalledWith(debugModeSkill('/installed/debug-mode/scripts'))
    expect(disposer).not.toHaveBeenCalled()
    expect(commandRegister).toHaveBeenCalledTimes(1)
    const command = commandRegister.mock.calls[0]?.[0]
    if (command === undefined) throw new Error('Debug Mode command was not registered')
    const inject = vi.fn()
    const agent = {
      status: 'idle',
      session: { append, events: [] },
      inject,
    } as unknown as Agent
    expect(command).toMatchObject({ name: DEBUG_MODE_COMMAND, description: 'Start Debug Mode' })
    await expect(command.handler({
      commandId: CommandId('debug-mode-command'),
      agent,
      rawInput: '',
      attachments: [],
      signal: new AbortController().signal,
    })).resolves.toEqual({ kind: 'success', sourceEventSeq: 17 })
    expect(append).toHaveBeenCalledWith('debug-mode/state', { version: 1, phase: 'setup' })
    const skill = debugModeSkill('/installed/debug-mode/scripts')
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({
      content: [{ type: 'text', text: renderSkillContent({ ...skill, provider: 'runtime' }) }],
      source: { kind: 'plugin', plugin: 'debug-mode' },
    }))
    expect(flush).toHaveBeenCalledWith(agent.session)

    await fiber.dispose()
    expect(disposer).toHaveBeenCalledTimes(1)
    internals.resolveResourceBase = resolveResourceBase
  })
})
