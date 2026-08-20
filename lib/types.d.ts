/** Durable Debug Mode state owned by one session. */
export type DebugModePhase = 'setup' | 'waiting-for-repro' | 'analyzing' | 'inactive';
/** Reproduction handoff committed before Debug Mode waits for the user. */
export interface DebugModeHandoff {
    readonly probeLocations: readonly string[];
    readonly reproductionAction: string;
    readonly logPath: string;
}
/** Full current Debug Mode state stored in each `debug-mode/state` event. */
export type DebugModeStateEventData = {
    readonly version: 1;
    readonly phase: Exclude<DebugModePhase, 'waiting-for-repro'>;
    readonly handoff?: never;
} | {
    readonly version: 1;
    readonly phase: 'waiting-for-repro';
    readonly handoff: DebugModeHandoff;
};
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** Current Debug Mode phase; last event wins and survives session reload. */
        'debug-mode/state': DebugModeStateEventData;
    }
}
