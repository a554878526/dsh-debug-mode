/**
 * Declare the per-session Debug Mode state and its write surface.
 * @returns the shared store handle.
 */
export function createDebugModeStore() {
    const spec = {
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
    };
    return {
        spec,
        create() {
            let state = spec.init();
            const listeners = new Set();
            const update = (mutate) => {
                const draft = { ...state };
                mutate(draft);
                state = draft;
                for (const listener of [...listeners])
                    listener();
            };
            return {
                actions: {
                    setEnabled: enabled => { update(draft => spec.actions.setEnabled(draft, enabled)); },
                    activate: sourceEventSeq => { update(draft => spec.actions.activate(draft, sourceEventSeq)); },
                    consumeWaiting: waitingSeq => { update(draft => spec.actions.consumeWaiting(draft, waitingSeq)); },
                },
                getSnapshot: () => state,
                subscribe(listener) {
                    listeners.add(listener);
                    return () => { listeners.delete(listener); };
                },
                clearPersisted: () => undefined,
            };
        },
    };
}
