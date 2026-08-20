/** Host enforcement for the Debug Mode reproduction barrier. */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Register durable phase transitions, waiting policy, and setup-response enforcement.
 * @param ctx - Host context carrying sessions, tools, and the Agent lifecycle events.
 */
export declare function installDebugModeRuntime(ctx: Context): void;
