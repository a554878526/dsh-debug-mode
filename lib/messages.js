/** Model-visible messages that advance the Debug Mode loop. */
/** Human command that enters Debug Mode from the composer's command menu. */
export const DEBUG_MODE_COMMAND = 'debug';
/** Explicit text trigger recognized alongside the `/debug` command. */
export const DEBUG_MODE_ENABLE_MESSAGE = 'Enable Debug Mode';
/** Requests another evidence-analysis iteration. */
export const DEBUG_MODE_CONTINUE_MESSAGE = 'Continue analysis';
/** Confirms the fix and requests cleanup of temporary diagnostics. */
export const DEBUG_MODE_FIXED_MESSAGE = 'Fixed. Clean up debug logs and instrumentation.';
/** Cancels the Host-enforced Debug Mode phase without asking the model to respond. */
export const DEBUG_MODE_EXIT_MESSAGE = 'Exit Debug Mode';
/** Exact wrapper opening the setup response's machine-readable handoff. */
export const DEBUG_MODE_HANDOFF_OPEN = '<debug_reproduction_handoff>';
/** Exact wrapper closing the setup response's machine-readable handoff. */
export const DEBUG_MODE_HANDOFF_CLOSE = '</debug_reproduction_handoff>';
/** Stable prefix of the Host-rendered reproduction instruction. */
export const DEBUG_MODE_WAITING_PREFIX = 'Debug Mode is waiting for reproduction.';
