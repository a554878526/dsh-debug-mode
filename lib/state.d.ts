/** Durable Debug Mode state folding and transition validation. */
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import type { DebugModeHandoff, DebugModePhase, DebugModeStateEventData } from './types.ts';
/** State before the first activation or after explicit deactivation. */
export declare const INACTIVE_DEBUG_MODE_STATE: DebugModeStateEventData;
/**
 * Return the last durable Debug Mode state.
 * @param events - complete session events in append order.
 * @returns the last recorded state, or the inactive initial state.
 */
export declare function foldDebugModeState(events: readonly SessionEvent[]): DebugModeStateEventData;
/**
 * Append a Debug Mode state transition to its owning session.
 * @param session - session that owns the Debug Mode phase.
 * @param transition - phase plus its required handoff when entering the wait state.
 * @returns the committed durable state event.
 */
export declare function appendDebugModeState(session: Session, ...transition: [phase: Exclude<DebugModePhase, 'waiting-for-repro'>] | [phase: 'waiting-for-repro', handoff: DebugModeHandoff]): SessionEvent<'debug-mode/state'>;
