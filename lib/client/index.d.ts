/**
 * Debug Mode browser half: a command-activated input-dock control strip over
 * transient per-session state. The local `/debug` acknowledgment opens it;
 * continue/fixed submit model-visible loop messages, while exit submits the
 * Host-owned deactivation signal and closes the browser UI.
 * @module dsh-debug-mode/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type DebugModeKey } from './locales.ts';
export type { DebugModeDockInjected, DebugModeDockProps } from './slots.ts';
export type { DebugModeKey } from './locales.ts';
export type { DebugModeState } from './store.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The Debug Mode controls' copy. */
        'debug-mode': DebugModeKey;
    }
}
/** Required services: slots, command execution acknowledgments, and copy. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionaries and command-activated dock.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
