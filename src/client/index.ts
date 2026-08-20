/**
 * Debug Mode browser half: a command-activated input-dock control strip over
 * transient per-session state. The local `/debug` acknowledgment opens it;
 * continue/fixed submit model-visible loop messages, while exit submits the
 * Host-owned deactivation signal and closes the browser UI.
 * @module dsh-debug-mode/client
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the local command/executed event declaration.
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
// Type-only: pulls ui-conversation's SlotMap merge (the input-slot keys).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DebugModeDock } from './DebugModeDock.tsx'
import { en, zh, type DebugModeKey } from './locales.ts'
import { createDebugModeStore } from './store.ts'
import type { DebugModeDockInjected } from './slots.ts'
import { DEBUG_MODE_COMMAND } from '../messages.ts'

export type { DebugModeDockInjected, DebugModeDockProps } from './slots.ts'
export type { DebugModeKey } from './locales.ts'
export type { DebugModeState } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Debug Mode controls' copy. */
    'debug-mode': DebugModeKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'debug-mode'

/** Required services: slots, command execution acknowledgments, and copy. */
export const inject = ['slots', 'commandUi', 'locale']

/**
 * Client plugin body: register the dictionaries and command-activated dock.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-debug-mode: dictionaries')

  const store = createDebugModeStore()
  const activationListeners = new Map<SessionId, Set<(sourceEventSeq: number) => void>>()
  ctx.on('command/executed', (sessionId, command, result) => {
    if (command !== DEBUG_MODE_COMMAND || result.kind !== 'success' || result.sourceEventSeq === undefined) return
    for (const listener of activationListeners.get(sessionId) ?? []) listener(result.sourceEventSeq)
  })

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'debug-mode',
    order: 20,
    locale: NS,
    store,
    inject: (sessionId: SessionId): DebugModeDockInjected => ({
      subscribeActivation: (listener) => {
        const listeners = activationListeners.get(sessionId) ?? new Set<(sourceEventSeq: number) => void>()
        listeners.add(listener)
        activationListeners.set(sessionId, listeners)
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) activationListeners.delete(sessionId)
        }
      },
    }),
  }, DebugModeDock))
}
