/**
 * Package-owned invariant companion for `dsh-debug-mode`.
 * @module dsh-debug-mode/invariant
 */
const PACKAGE_NAME = 'dsh-debug-mode';
const WAITING_PREFIX = 'Debug Mode is waiting for reproduction.';
/** Cordis companion plugin name. */
export const name = 'debug-mode-invariant';
/** Services required before the companion can validate durable state. */
export const inject = ['invariants'];
const PHASES = new Set(['setup', 'waiting-for-repro', 'analyzing', 'inactive']);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function validatePayload(data, fail) {
    if (!isRecord(data))
        return fail('debug-mode/state data must be an object');
    if (data['version'] !== 1)
        fail(`debug-mode/state uses unsupported version ${String(data['version'])}`);
    const phase = data['phase'];
    if (typeof phase !== 'string' || !PHASES.has(phase)) {
        return fail(`debug-mode/state uses unknown phase ${String(phase)}`);
    }
    const handoff = data['handoff'];
    if (phase !== 'waiting-for-repro') {
        if (handoff !== undefined)
            fail(`debug-mode/state phase ${phase} must not carry a handoff`);
        return;
    }
    const probeLocations = isRecord(handoff) ? handoff['probeLocations'] : undefined;
    const reproductionAction = isRecord(handoff) ? handoff['reproductionAction'] : undefined;
    const logPath = isRecord(handoff) ? handoff['logPath'] : undefined;
    if (!Array.isArray(probeLocations) || probeLocations.length === 0
        || probeLocations.some(value => typeof value !== 'string' || value.trim().length === 0)
        || typeof reproductionAction !== 'string' || reproductionAction.trim().length === 0
        || typeof logPath !== 'string' || logPath.trim().length === 0) {
        fail('debug-mode/state waiting-for-repro requires non-empty probes, reproduction action, and log path');
    }
}
function validateStateEvent(events, event, fail) {
    validatePayload(event.data, fail);
    let phase = 'inactive';
    let phaseIndex = -1;
    for (let index = 0; index < events.length; index += 1) {
        const previous = events[index];
        if (previous?.type === 'debug-mode/state') {
            phase = previous.data.phase;
            phaseIndex = index;
        }
    }
    if (event.data.phase === 'setup')
        return;
    if (event.data.phase === 'waiting-for-repro') {
        if (phase !== 'setup' && phase !== 'analyzing') {
            fail(`debug-mode/state cannot enter waiting-for-repro from ${phase}`);
        }
        const handoff = events.slice(phaseIndex + 1).findLast(candidate => candidate.type === 'assistant/chunk'
            && candidate.data.chunk.type === 'block-end'
            && candidate.data.chunk.block.type === 'text'
            && candidate.data.chunk.block.text.startsWith(WAITING_PREFIX));
        if (handoff === undefined)
            fail('debug-mode/state waiting-for-repro requires a preceding validated handoff chunk');
    }
    else if (event.data.phase === 'analyzing' && phase !== 'waiting-for-repro') {
        fail(`debug-mode/state cannot enter analyzing from ${phase}`);
    }
    else if (event.data.phase === 'inactive' && phase === 'inactive') {
        fail('debug-mode/state cannot deactivate an inactive session');
    }
}
function validateSession(session, fail) {
    for (let index = 0; index < session.events.length; index += 1) {
        const event = session.events[index];
        if (event?.type === 'debug-mode/state') {
            validateStateEvent(session.events.slice(0, index), event, fail);
        }
    }
}
/** Validate loaded and newly appended Debug Mode state sequences. */
const install = Object.assign((ctx, fail) => {
    for (const session of ctx.sessions.list())
        validateSession(session, fail);
    ctx.on('session/created', (session) => { validateSession(session, fail); }, { global: true });
    ctx.on('internal/dispatch', (_mode, eventName, args) => {
        if (eventName !== 'session/event')
            return;
        const [session, event] = args;
        if (event.type === 'debug-mode/state')
            validateStateEvent(session.events, event, fail);
    }, { global: true });
}, { inject: ['sessions'] });
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
