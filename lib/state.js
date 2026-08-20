/** Durable Debug Mode state folding and transition validation. */
const DEBUG_MODE_STATE_VERSION = 1;
/** State before the first activation or after explicit deactivation. */
export const INACTIVE_DEBUG_MODE_STATE = Object.freeze({
    version: DEBUG_MODE_STATE_VERSION,
    phase: 'inactive',
});
/**
 * Return the last durable Debug Mode state.
 * @param events - complete session events in append order.
 * @returns the last recorded state, or the inactive initial state.
 */
export function foldDebugModeState(events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type === 'debug-mode/state')
            return event.data;
    }
    return INACTIVE_DEBUG_MODE_STATE;
}
/** Build one full state payload for a phase transition. */
function debugModeState(phase, handoff) {
    if (phase !== 'waiting-for-repro') {
        return Object.freeze({ version: DEBUG_MODE_STATE_VERSION, phase });
    }
    if (handoff === undefined)
        throw new TypeError('waiting-for-repro requires a handoff');
    return Object.freeze({
        version: DEBUG_MODE_STATE_VERSION,
        phase: 'waiting-for-repro',
        handoff: Object.freeze({
            probeLocations: Object.freeze([...handoff.probeLocations]),
            reproductionAction: handoff.reproductionAction,
            logPath: handoff.logPath,
        }),
    });
}
/**
 * Append a Debug Mode state transition to its owning session.
 * @param session - session that owns the Debug Mode phase.
 * @param transition - phase plus its required handoff when entering the wait state.
 * @returns the committed durable state event.
 */
export function appendDebugModeState(session, ...transition) {
    const [phase, handoff] = transition;
    if (phase !== 'waiting-for-repro') {
        return session.append('debug-mode/state', debugModeState(phase));
    }
    return session.append('debug-mode/state', debugModeState(phase, handoff));
}
