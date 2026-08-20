/**
 * Debug Mode client contract: the composed dock props plus the pinned
 * model-visible loop messages. The target `conversation.input.dock` slot is
 * declared and typed by ui-conversation, so no SlotMap merge lives here.
 */
import type { InjectFace, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { createDebugModeStore } from './store.ts';
export { DEBUG_MODE_CONTINUE_MESSAGE, DEBUG_MODE_EXIT_MESSAGE, DEBUG_MODE_FIXED_MESSAGE, DEBUG_MODE_WAITING_PREFIX, } from '../messages.ts';
/** The dock's per-session store handle. */
export type DebugModeStoreHandle = ReturnType<typeof createDebugModeStore>;
/** Per-session activation channel from the local `/debug` command acknowledgment. */
export interface DebugModeDockInjected {
    /** Subscribe while the dock component is mounted. */
    readonly subscribeActivation: (listener: (sourceEventSeq: number) => void) => () => void;
}
/** Input-dock strip props: runtime share, activation channel, and store. */
export type DebugModeDockProps = PropsRuntime<'conversation.input.dock'> & InjectFace<DebugModeDockInjected> & PropsStore<DebugModeStoreHandle>;
