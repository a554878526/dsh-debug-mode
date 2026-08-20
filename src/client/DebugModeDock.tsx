/**
 * Debug Mode dock strip. The local `/debug` acknowledgment opens it; continue
 * advances the model-visible loop, fixed submits cleanup and closes the dock,
 * and exit submits Host deactivation before closing the dock.
 */
import { useEffect } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DebugModeDockProps } from './slots.ts'
import {
  DEBUG_MODE_CONTINUE_MESSAGE, DEBUG_MODE_EXIT_MESSAGE, DEBUG_MODE_FIXED_MESSAGE, DEBUG_MODE_WAITING_PREFIX,
} from './slots.ts'
import css from './DebugModeDock.module.css'

/**
 * The dock strip.
 * @param props - runtime share (input kit), store share, and locale seat.
 */
export function DebugModeDock({
  useStore, useSession, actions, inputActions, subscribeActivation, t,
}: DebugModeDockProps & PropsLocale<'debug-mode'>) {
  const enabled = useStore(state => state.enabled)
  const activationSeq = useStore(state => state.activationSeq)
  const consumedWaitingSeq = useStore(state => state.consumedWaitingSeq)
  const waitingSeq = useSession((snapshot) => {
    if (activationSeq === null) return null
    let latest: number | null = null
    for (const node of snapshot.nodes) {
      if (node.kind === 'assistant' && node.seq > activationSeq
        && node.blocks.some(block => block.kind === 'text' && block.text.startsWith(DEBUG_MODE_WAITING_PREFIX))) {
        latest = latest === null ? node.seq : Math.max(latest, node.seq)
      }
    }
    return latest
  })
  const waitingForReproduction = waitingSeq !== null
    && (consumedWaitingSeq === null || waitingSeq > consumedWaitingSeq)
  useEffect(
    () => subscribeActivation((sourceEventSeq) => { actions.activate(sourceEventSeq) }),
    [actions, subscribeActivation],
  )
  if (!enabled) return null

  const send = (message: string) => {
    inputActions.setDraft(message)
    inputActions.submit()
  }

  const continueAnalysis = (): void => {
    if (waitingSeq === null) return
    actions.consumeWaiting(waitingSeq)
    send(DEBUG_MODE_CONTINUE_MESSAGE)
  }

  const fixed = (): void => {
    send(DEBUG_MODE_FIXED_MESSAGE)
    actions.setEnabled(false)
  }

  const exit = (): void => {
    send(DEBUG_MODE_EXIT_MESSAGE)
    actions.setEnabled(false)
  }

  return (
    <div className={css.dock} data-debug-mode-dock>
      <div className={css.bar}>
        <span className={css.status}>{t('dock.status')}</span>
        <span className={css.hint}>{t(waitingForReproduction ? 'dock.waitingHint' : 'dock.setupHint')}</span>
        <button type="button" className={css.continue} disabled={!waitingForReproduction} onClick={continueAnalysis}>
          {t('dock.continue')}
        </button>
        <button type="button" className={css.fixed} onClick={fixed}>
          {t('dock.fixed')}
        </button>
        <button type="button" className={css.exit} onClick={exit}>
          {t('dock.exit')}
        </button>
      </div>
    </div>
  )
}
