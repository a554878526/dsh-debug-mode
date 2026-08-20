import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { DebugModeDockProps } from './slots.ts';
/**
 * The dock strip.
 * @param props - runtime share (input kit), store share, and locale seat.
 */
export declare function DebugModeDock({ useStore, useSession, actions, inputActions, subscribeActivation, t, }: DebugModeDockProps & PropsLocale<'debug-mode'>): import("react").JSX.Element | null;
