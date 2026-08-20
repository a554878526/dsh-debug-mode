/**
 * Debug Mode browser half: a command-activated input-dock control strip over
 * transient per-session state. The local `/debug` acknowledgment opens it;
 * continue/fixed submit model-visible loop messages, while exit submits the
 * Host-owned deactivation signal and closes the browser UI.
 * @module dsh-debug-mode/client
 */
import { DebugModeDock } from "./DebugModeDock.js";
import { en, zh } from "./locales.js";
import { createDebugModeStore } from "./store.js";
import { DEBUG_MODE_COMMAND } from "../messages.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'debug-mode';
/** Required services: slots, command execution acknowledgments, and copy. */
export const inject = ['slots', 'commandUi', 'locale'];
/**
 * Client plugin body: register the dictionaries and command-activated dock.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-debug-mode: dictionaries');
    const store = createDebugModeStore();
    const activationListeners = new Map();
    ctx.on('command/executed', (sessionId, command, result) => {
        if (command !== DEBUG_MODE_COMMAND || result.kind !== 'success' || result.sourceEventSeq === undefined)
            return;
        for (const listener of activationListeners.get(sessionId) ?? [])
            listener(result.sourceEventSeq);
    });
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'debug-mode',
        order: 20,
        locale: NS,
        store,
        inject: (sessionId) => ({
            subscribeActivation: (listener) => {
                const listeners = activationListeners.get(sessionId) ?? new Set();
                listeners.add(listener);
                activationListeners.set(sessionId, listeners);
                return () => {
                    listeners.delete(listener);
                    if (listeners.size === 0)
                        activationListeners.delete(sessionId);
                };
            },
        }),
    }, DebugModeDock));
}
