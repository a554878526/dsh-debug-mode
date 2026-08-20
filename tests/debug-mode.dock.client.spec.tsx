// @vitest-environment jsdom
/**
 * DebugModeDock: the loop strip above the composer. It renders only while
 * Debug Mode is enabled. Command activation opens it, continue advances the
 * loop, fixed submits cleanup and closes it, and exit closes it locally.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DebugModeDock } from '../src/client/DebugModeDock.tsx'
import type { DebugModeState } from '../src/client/store.ts'
import { DEBUG_MODE_CONTINUE_MESSAGE, DEBUG_MODE_FIXED_MESSAGE } from '../src/client/slots.ts'
import { zh } from '../src/client/locales.ts'

const t: Parameters<typeof DebugModeDock>[0]['t'] = (key) => zh[key as keyof typeof zh]

function props(enabled: boolean, waitingSeq: number | null = null, consumedWaitingSeq: number | null = null) {
  let activate = (_sourceEventSeq: number): void => {}
  const setEnabled = vi.fn()
  const activateAction = vi.fn()
  const consumeWaiting = vi.fn()
  const setDraft = vi.fn()
  const submit = vi.fn()
  return {
    useStore: (sel: (s: DebugModeState) => unknown) => sel({
      enabled, activationSeq: enabled ? 5 : null, consumedWaitingSeq,
    }),
    useSession: (sel: (snapshot: unknown) => unknown) => sel({
      nodes: waitingSeq === null ? [] : [{
        kind: 'assistant', seq: waitingSeq, blocks: [{ kind: 'text', text: 'Debug Mode is waiting for reproduction.' }],
      }],
    }),
    actions: { setEnabled, activate: activateAction, consumeWaiting },
    inputActions: { setDraft, submit },
    subscribeActivation: (listener: (sourceEventSeq: number) => void) => {
      activate = listener
      return () => { activate = (_sourceEventSeq: number) => {} }
    },
    t,
    activate: () => { activate(5) },
    activateAction,
    consumeWaiting,
    setEnabled,
    setDraft,
    submit,
  } as unknown as Parameters<typeof DebugModeDock>[0] & {
    activate: () => void
    activateAction: typeof activateAction
    consumeWaiting: typeof consumeWaiting
    setEnabled: typeof setEnabled
    setDraft: typeof setDraft
    submit: typeof submit
  }
}

afterEach(cleanup)

describe('DebugModeDock', () => {
  it('renders nothing while Debug Mode is off', () => {
    const p = props(false)
    const { container } = render(<DebugModeDock {...p} />)
    expect(container.firstChild).toBeNull()
    p.activate()
    expect(p.activateAction).toHaveBeenCalledWith(5)
  })

  it('disables Continue while setup has no committed handoff', () => {
    render(<DebugModeDock {...props(true)} />)
    expect(screen.getByText('Debug Mode 已开启')).toBeTruthy()
    expect(screen.getByText('正在准备日志与插桩，完成交接后才可继续')).toBeTruthy()
    expect(screen.getByRole('button', { name: '继续分析' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: '已修复' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '退出' })).toBeTruthy()
  })

  it('继续分析 submits the pinned continue message', () => {
    const p = props(true, 6)
    render(<DebugModeDock {...p} />)
    expect(screen.getByText('复现后点「继续分析」；确认修复后点「已修复」')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '继续分析' }))
    expect(p.setDraft).toHaveBeenCalledWith(DEBUG_MODE_CONTINUE_MESSAGE)
    expect(p.submit).toHaveBeenCalledTimes(1)
    expect(p.consumeWaiting).toHaveBeenCalledWith(6)
    expect(p.setEnabled).not.toHaveBeenCalled()
  })

  it('requires a newer waiting message before Continue can run again', () => {
    const consumed = props(true, 6, 6)
    const { rerender } = render(<DebugModeDock {...consumed} />)
    expect(screen.getByRole('button', { name: '继续分析' })).toHaveProperty('disabled', true)
    rerender(<DebugModeDock {...props(true, 7, 6)} />)
    expect(screen.getByRole('button', { name: '继续分析' })).toHaveProperty('disabled', false)
  })

  it('已修复 submits cleanup and closes the dock', () => {
    const p = props(true)
    render(<DebugModeDock {...p} />)
    fireEvent.click(screen.getByRole('button', { name: '已修复' }))
    expect(p.setDraft).toHaveBeenCalledWith(DEBUG_MODE_FIXED_MESSAGE)
    expect(p.submit).toHaveBeenCalledTimes(1)
    expect(p.setEnabled).toHaveBeenCalledWith(false)
  })

  it('退出 submits the host deactivation signal and closes the dock', () => {
    const p = props(true)
    render(<DebugModeDock {...p} />)
    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    expect(p.setEnabled).toHaveBeenCalledWith(false)
    expect(p.setDraft).toHaveBeenCalledWith('退出 Debug Mode')
    expect(p.submit).toHaveBeenCalledTimes(1)
  })
})
