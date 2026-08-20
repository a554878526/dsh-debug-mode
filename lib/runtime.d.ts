/** Host enforcement for the Debug Mode reproduction barrier. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { DebugModePhase } from './types.ts';
/** Process-local control used by the command and Host enforcement hooks. */
export interface DebugModeRuntimeController {
    /** Start a fresh Debug Mode activation for one agent. */
    activate(agent: Agent): void;
    /** Read the current process-local phase for diagnostics and tests. */
    phase(sessionId: SessionId): DebugModePhase;
}
/**
 * Register process-local phase transitions, waiting policy, and setup-response enforcement.
 * @param ctx - Host context carrying sessions, tools, and the Agent lifecycle events.
 */
export declare function installDebugModeRuntime(ctx: Context): DebugModeRuntimeController;
