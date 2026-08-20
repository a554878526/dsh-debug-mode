/**
 * Debug Mode host half: registers the runtime-first `debug-mode` skill and an
 * optional `/debug` command. The command queues the pinned activation context
 * for the next real user turn without waking the model; the browser half turns
 * its local success acknowledgment into the dock UI.
 * Continue and fixed remain model-visible messages; Exit submits a Host-owned
 * control message that deactivates the process-local phase before any model request.
 * @module dsh-debug-mode
 */
import type { Context } from '@deepseek-ai/cordis';
/** Test seam over the installed scripts-directory resolver. */
export declare const internals: {
    resolveResourceBase: () => string;
};
/** Cordis plugin name. */
export declare const name = "debug-mode";
/** Hard dependency: this plugin exists only to contribute the skill. */
export declare const inject: string[];
export { DEBUG_MODE_COMMAND } from './messages.ts';
/**
 * Register the debug-mode skill as a lifecycle-owned effect.
 * @param ctx - host context carrying the skill registry.
 */
export declare function apply(ctx: Context): void;
