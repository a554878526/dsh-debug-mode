/** `debug-mode` namespace dictionaries (UI-visible copy only; submit messages are pinned model text). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'dock.status': 'Debug Mode 已开启',
  'dock.setupHint': '正在准备日志与插桩，完成交接后才可继续',
  'dock.waitingHint': '复现后点「继续分析」；确认修复后点「已修复」',
  'dock.continue': '继续分析',
  'dock.fixed': '已修复',
  'dock.exit': '退出',
} satisfies Record<string, string>

/** The debug-mode namespace key union. */
export type DebugModeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'dock.status': 'Debug Mode on',
  'dock.setupHint': 'Preparing logs and probes; Continue unlocks after handoff',
  'dock.waitingHint': 'Reproduce, then Continue; Fixed when resolved',
  'dock.continue': 'Continue',
  'dock.fixed': 'Fixed',
  'dock.exit': 'Exit',
} satisfies Record<DebugModeKey, string>
