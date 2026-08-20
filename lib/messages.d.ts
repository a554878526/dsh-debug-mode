/** Model-visible messages that advance the Debug Mode loop. */
/** Human command that enters Debug Mode from the composer's command menu. */
export declare const DEBUG_MODE_COMMAND = "debug";
/** Explicit text trigger recognized alongside the `/debug` command. */
export declare const DEBUG_MODE_ENABLE_MESSAGE = "\u5F00\u542F Debug Mode";
/** Requests another evidence-analysis iteration. */
export declare const DEBUG_MODE_CONTINUE_MESSAGE = "\u7EE7\u7EED\u5206\u6790";
/** Confirms the fix and requests cleanup of temporary diagnostics. */
export declare const DEBUG_MODE_FIXED_MESSAGE = "\u5DF2\u4FEE\u590D\uFF0C\u8BF7\u6E05\u7406\u8C03\u8BD5\u65E5\u5FD7\u548C\u63D2\u6869\u4EE3\u7801";
/** Cancels the Host-enforced Debug Mode phase without asking the model to respond. */
export declare const DEBUG_MODE_EXIT_MESSAGE = "\u9000\u51FA Debug Mode";
/** Exact wrapper opening the setup response's machine-readable handoff. */
export declare const DEBUG_MODE_HANDOFF_OPEN = "<debug_reproduction_handoff>";
/** Exact wrapper closing the setup response's machine-readable handoff. */
export declare const DEBUG_MODE_HANDOFF_CLOSE = "</debug_reproduction_handoff>";
/** Stable prefix of the Host-rendered reproduction instruction. */
export declare const DEBUG_MODE_WAITING_PREFIX = "Debug Mode is waiting for reproduction.";
