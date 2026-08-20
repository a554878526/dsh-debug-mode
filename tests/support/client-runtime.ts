/** Minimal store runtime for exercising a dynamic DSH client bundle outside the Web shell. */
export function defineStore<State, Actions extends Record<string, (draft: State, ...args: never[]) => void>>(spec: {
  init(): State
  actions: Actions
}) {
  return {
    create() {
      let state = spec.init()
      const listeners = new Set<() => void>()
      const actions = Object.fromEntries(Object.entries(spec.actions).map(([name, mutate]) => [
        name,
        (...args: never[]) => {
          mutate(state, ...args)
          state = { ...state }
          for (const listener of listeners) listener()
        },
      ]))
      return {
        actions,
        getSnapshot: () => state,
        subscribe(listener: () => void) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    },
  }
}
