/**
 * Per-session Debug Mode presentation state for the input-dock strip. The
 * state is transient and never changes the model-visible conversation.
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Declare the per-session Debug Mode state and its write surface.
 * @returns the shared store handle.
 */
export function createDebugModeStore() {
    return defineStore({
        init: () => ({ enabled: false, activationSeq: null, consumedWaitingSeq: null }),
        actions: {
            setEnabled: (draft, enabled) => { draft.enabled = enabled; },
            activate: (draft, sourceEventSeq) => {
                draft.enabled = true;
                draft.activationSeq = sourceEventSeq;
                draft.consumedWaitingSeq = null;
            },
            consumeWaiting: (draft, waitingSeq) => { draft.consumedWaitingSeq = waitingSeq; },
        },
    });
}
