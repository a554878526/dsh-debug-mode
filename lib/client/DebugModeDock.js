import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Debug Mode dock strip. The local `/debug` acknowledgment opens it; continue
 * advances the model-visible loop, fixed submits cleanup and closes the dock,
 * and exit submits Host deactivation before closing the dock.
 */
import { useEffect } from 'react';
import { DEBUG_MODE_CONTINUE_MESSAGE, DEBUG_MODE_EXIT_MESSAGE, DEBUG_MODE_FIXED_MESSAGE, DEBUG_MODE_WAITING_PREFIX, } from "./slots.js";
import css from './DebugModeDock.module.css';
/**
 * The dock strip.
 * @param props - runtime share (input kit), store share, and locale seat.
 */
export function DebugModeDock({ useStore, useSession, actions, inputActions, subscribeActivation, t, }) {
    const enabled = useStore(state => state.enabled);
    const activationSeq = useStore(state => state.activationSeq);
    const consumedWaitingSeq = useStore(state => state.consumedWaitingSeq);
    const waitingSeq = useSession((snapshot) => {
        if (activationSeq === null)
            return null;
        let latest = null;
        for (const node of snapshot.nodes) {
            if (node.kind === 'assistant' && node.seq > activationSeq
                && node.blocks.some(block => block.kind === 'text' && block.text.startsWith(DEBUG_MODE_WAITING_PREFIX))) {
                latest = latest === null ? node.seq : Math.max(latest, node.seq);
            }
        }
        return latest;
    });
    const waitingForReproduction = waitingSeq !== null
        && (consumedWaitingSeq === null || waitingSeq > consumedWaitingSeq);
    useEffect(() => subscribeActivation((sourceEventSeq) => { actions.activate(sourceEventSeq); }), [actions, subscribeActivation]);
    if (!enabled)
        return null;
    const send = (message) => {
        inputActions.setDraft(message);
        inputActions.submit();
    };
    const continueAnalysis = () => {
        if (waitingSeq === null)
            return;
        actions.consumeWaiting(waitingSeq);
        send(DEBUG_MODE_CONTINUE_MESSAGE);
    };
    const fixed = () => {
        send(DEBUG_MODE_FIXED_MESSAGE);
        actions.setEnabled(false);
    };
    const exit = () => {
        send(DEBUG_MODE_EXIT_MESSAGE);
        actions.setEnabled(false);
    };
    return (_jsx("div", { className: css.dock, "data-debug-mode-dock": true, children: _jsxs("div", { className: css.bar, children: [_jsx("span", { className: css.status, children: t('dock.status') }), _jsx("span", { className: css.hint, children: t(waitingForReproduction ? 'dock.waitingHint' : 'dock.setupHint') }), _jsx("button", { type: "button", className: css.continue, disabled: !waitingForReproduction, onClick: continueAnalysis, children: t('dock.continue') }), _jsx("button", { type: "button", className: css.fixed, onClick: fixed, children: t('dock.fixed') }), _jsx("button", { type: "button", className: css.exit, onClick: exit, children: t('dock.exit') })] }) }));
}
