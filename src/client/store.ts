/**
 * Per-session Debug Mode presentation state for the input-dock strip. The
 * state is transient and never changes the model-visible conversation.
 */
import type { StoreHandle } from '@deepseek-ai/dsh-client-ui-slots'

/** Debug Mode store state: transient UI mode, never persisted. */
export interface DebugModeState {
  /** Whether Debug Mode is active for the current session. */
  enabled: boolean
  /** Session-log baseline from the latest local `/debug` activation. */
  activationSeq: number | null
  /** Waiting assistant-message seq consumed by the latest Continue click. */
  consumedWaitingSeq: number | null
}

/** Declared action shape; the exported factory pins a stable return type. */
type DebugModeActions = {
  setEnabled: (draft: DebugModeState, enabled: boolean) => void
  activate: (draft: DebugModeState, sourceEventSeq: number) => void
  consumeWaiting: (draft: DebugModeState, waitingSeq: number) => void
}

/**
 * Declare the per-session Debug Mode state and its write surface.
 * @returns the shared store handle.
 */
export function createDebugModeStore(): StoreHandle<DebugModeState, DebugModeActions> {
  const spec = {
    init: (): DebugModeState => ({ enabled: false, activationSeq: null, consumedWaitingSeq: null }),
    actions: {
      setEnabled: (draft: DebugModeState, enabled: boolean) => { draft.enabled = enabled },
      activate: (draft: DebugModeState, sourceEventSeq: number) => {
        draft.enabled = true
        draft.activationSeq = sourceEventSeq
        draft.consumedWaitingSeq = null
      },
      consumeWaiting: (draft: DebugModeState, waitingSeq: number) => { draft.consumedWaitingSeq = waitingSeq },
    },
  }
  return {
    spec,
    create() {
      let state = spec.init()
      const listeners = new Set<() => void>()
      const update = (mutate: (draft: DebugModeState) => void): void => {
        const draft = { ...state }
        mutate(draft)
        state = draft
        for (const listener of [...listeners]) listener()
      }
      return {
        actions: {
          setEnabled: enabled => { update(draft => spec.actions.setEnabled(draft, enabled)) },
          activate: sourceEventSeq => { update(draft => spec.actions.activate(draft, sourceEventSeq)) },
          consumeWaiting: waitingSeq => { update(draft => spec.actions.consumeWaiting(draft, waitingSeq)) },
        },
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        clearPersisted: () => undefined,
      }
    },
  }
}
