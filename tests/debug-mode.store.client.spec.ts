// @vitest-environment jsdom
/**
 * Debug Mode data pieces: the per-session store factory, the pinned submit
 * messages, the locale dictionaries, and the registered skill body. Pure
 * value/state assertions — no cordis context needed except the jsdom env for
 * the store engine's rAF fallback.
 */
import { describe, expect, it } from 'vitest'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { DEBUG_MODE_SKILL, debugModeSkill } from '../src/skill.ts'
import {
  DEBUG_MODE_COMMAND, DEBUG_MODE_CONTINUE_MESSAGE, DEBUG_MODE_ENABLE_MESSAGE, DEBUG_MODE_EXIT_MESSAGE,
  DEBUG_MODE_FIXED_MESSAGE, DEBUG_MODE_HANDOFF_CLOSE, DEBUG_MODE_HANDOFF_OPEN,
} from '../src/messages.ts'
import { createDebugModeStore } from '../src/client/store.ts'
import { en, zh } from '../src/client/locales.ts'

describe('createDebugModeStore', () => {
  it('initializes disabled', () => {
    const store = createDebugModeStore().create()
    expect(store.getSnapshot()).toEqual({ enabled: false, activationSeq: null, consumedWaitingSeq: null })
  })

  it('setEnabled is the complete write set', () => {
    const store = createDebugModeStore().create()
    store.actions.setEnabled(true)
    expect(store.getSnapshot()).toEqual({ enabled: true, activationSeq: null, consumedWaitingSeq: null })
    store.actions.setEnabled(false)
    expect(store.getSnapshot()).toEqual({ enabled: false, activationSeq: null, consumedWaitingSeq: null })
  })

  it('every create() is an independent instance', () => {
    const handle = createDebugModeStore()
    const a = handle.create()
    const b = handle.create()
    a.actions.setEnabled(true)
    expect(b.getSnapshot().enabled).toBe(false)
  })

  it('notifies subscribers on mutation', () => {
    const store = createDebugModeStore().create()
    const seen: boolean[] = []
    store.subscribe(() => { seen.push(store.getSnapshot().enabled) })
    store.actions.setEnabled(true)
    expect(seen).toEqual([true])
  })

  it('activation opens the dock and records its session-log baseline', () => {
    const store = createDebugModeStore().create()
    store.actions.activate(42)
    expect(store.getSnapshot()).toEqual({ enabled: true, activationSeq: 42, consumedWaitingSeq: null })
  })

  it('consumes one waiting round until a later waiting message appears', () => {
    const store = createDebugModeStore().create()
    store.actions.activate(42)
    store.actions.consumeWaiting(51)
    expect(store.getSnapshot()).toEqual({ enabled: true, activationSeq: 42, consumedWaitingSeq: 51 })
  })
})

describe('submit messages', () => {
  it('pins the loop-advance signals verbatim', () => {
    expect(DEBUG_MODE_COMMAND).toBe('debug')
    expect(DEBUG_MODE_ENABLE_MESSAGE).toBe('开启 Debug Mode')
    expect(DEBUG_MODE_CONTINUE_MESSAGE).toBe('继续分析')
    expect(DEBUG_MODE_FIXED_MESSAGE).toBe('已修复，请清理调试日志和插桩代码')
    expect(DEBUG_MODE_EXIT_MESSAGE).toBe('退出 Debug Mode')
    expect(DEBUG_MODE_HANDOFF_OPEN).toBe('<debug_reproduction_handoff>')
    expect(DEBUG_MODE_HANDOFF_CLOSE).toBe('</debug_reproduction_handoff>')
  })
})

describe('locale dictionaries', () => {
  it('en covers the zh key set exactly', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('DEBUG_MODE_SKILL', () => {
  it('is a runtime-sourced skill with a routing description and loop body', () => {
    expect(DEBUG_MODE_SKILL.name).toBe('debug-mode')
    expect(DEBUG_MODE_SKILL.source).toBe('runtime')
    expect(DEBUG_MODE_SKILL.description.length).toBeGreaterThan(0)
    expect(DEBUG_MODE_SKILL.content).toContain('继续分析')
    expect(DEBUG_MODE_SKILL.content).toContain('已修复')
    expect(DEBUG_MODE_SKILL.content).toContain('CODEX_DEBUG')
    expect(DEBUG_MODE_SKILL.content).toContain('Do not write a replacement session')
    expect(DEBUG_MODE_SKILL.content).toContain('at most two targeted searches')
    expect(DEBUG_MODE_SKILL.content).toContain('two targeted file reads')
    expect(DEBUG_MODE_SKILL.content).toContain('Never insert a console-only probe')
    expect(DEBUG_MODE_SKILL.content).toContain('<debug_reproduction_handoff>')
    expect(DEBUG_MODE_SKILL.content).toContain('Any other text-only conclusion is replaced')
    expect(DEBUG_MODE_SKILL.content).not.toContain('console.info')
  })

  it('publishes every packaged helper from the installed scripts directory', () => {
    const scriptsDirectory = '/installed/debug-mode/scripts'
    const skill = debugModeSkill(scriptsDirectory)
    expect(skill.resourceBase).toEqual({ kind: 'directory', path: scriptsDirectory })
    expect(renderSkillContent({ ...skill, provider: 'runtime' })).toContain(
      'Base directory for this skill: /installed/debug-mode/scripts',
    )
    for (const script of [
      'new_debug_session.py',
      'debug_ingest_server.py',
      'summarize_debug_log.py',
      'find_instrumentation.py',
    ]) {
      expect(DEBUG_MODE_SKILL.content).toContain(script)
    }
  })
})
