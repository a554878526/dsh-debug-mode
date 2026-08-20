/** Model-visible messages that advance the Debug Mode loop. */
/** Human command that enters Debug Mode from the composer's command menu. */
export const DEBUG_MODE_COMMAND = 'debug';
/** Explicit text trigger recognized alongside the `/debug` command. */
export const DEBUG_MODE_ENABLE_MESSAGE = '开启 Debug Mode';
/** Requests another evidence-analysis iteration. */
export const DEBUG_MODE_CONTINUE_MESSAGE = '继续分析';
/** Confirms the fix and requests cleanup of temporary diagnostics. */
export const DEBUG_MODE_FIXED_MESSAGE = '已修复，请清理调试日志和插桩代码';
/** Cancels the Host-enforced Debug Mode phase without asking the model to respond. */
export const DEBUG_MODE_EXIT_MESSAGE = '退出 Debug Mode';
/** Exact wrapper opening the setup response's machine-readable handoff. */
export const DEBUG_MODE_HANDOFF_OPEN = '<debug_reproduction_handoff>';
/** Exact wrapper closing the setup response's machine-readable handoff. */
export const DEBUG_MODE_HANDOFF_CLOSE = '</debug_reproduction_handoff>';
/** Stable prefix of the Host-rendered reproduction instruction. */
export const DEBUG_MODE_WAITING_PREFIX = 'Debug Mode is waiting for reproduction.';
