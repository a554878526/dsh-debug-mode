/**
 * Package-owned invariant companion for `dsh-debug-mode`.
 * @module dsh-debug-mode/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "debug-mode-invariant";
/** Services required before the companion can validate durable state. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
