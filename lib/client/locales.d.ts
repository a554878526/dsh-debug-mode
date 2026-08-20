/** `debug-mode` namespace dictionaries (UI-visible copy only; submit messages are pinned model text). */
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    'dock.status': string;
    'dock.setupHint': string;
    'dock.waitingHint': string;
    'dock.continue': string;
    'dock.fixed': string;
    'dock.exit': string;
};
/** The debug-mode namespace key union. */
export type DebugModeKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: {
    'dock.status': string;
    'dock.setupHint': string;
    'dock.waitingHint': string;
    'dock.continue': string;
    'dock.fixed': string;
    'dock.exit': string;
};
