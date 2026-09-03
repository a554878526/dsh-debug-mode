/** `debug-mode` namespace dictionaries (UI-visible copy only; submit messages are pinned model text). */

/** English dictionary and key-set source of truth. */
export const en = {
  'dock.status': 'Debug Mode on',
  'dock.setupHint': 'Preparing logs and probes; Continue unlocks after handoff',
  'dock.waitingHint': 'Reproduce, then Continue; Fixed when resolved',
  'dock.continue': 'Continue',
  'dock.fixed': 'Fixed',
  'dock.exit': 'Exit',
} satisfies Record<string, string>

/** The debug-mode namespace key union. */
export type DebugModeKey = keyof typeof en

/** Keep the plugin UI English in Chinese-locale DSH installations. */
export const zh = en satisfies Record<DebugModeKey, string>
