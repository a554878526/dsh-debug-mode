/**
 * Per-session Debug Mode presentation state for the input-dock strip. The
 * state is transient and never changes the model-visible conversation.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Debug Mode store state: transient UI mode, never persisted. */
export interface DebugModeState {
  /** Whether Debug Mode is active for the current session. */
  enabled: boolean
  /** Durable setup-state event seq from the latest local `/debug` activation. */
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
export function createDebugModeStore(): EngineStoreHandle<DebugModeState, DebugModeActions> {
  return defineStore({
    init: (): DebugModeState => ({ enabled: false, activationSeq: null, consumedWaitingSeq: null }),
    actions: {
      setEnabled: (draft, enabled) => { draft.enabled = enabled },
      activate: (draft, sourceEventSeq) => {
        draft.enabled = true
        draft.activationSeq = sourceEventSeq
        draft.consumedWaitingSeq = null
      },
      consumeWaiting: (draft, waitingSeq) => { draft.consumedWaitingSeq = waitingSeq },
    },
  })
}
