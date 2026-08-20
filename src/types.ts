/** Process-local Debug Mode phase owned by one active session. */
export type DebugModePhase = 'setup' | 'waiting-for-repro' | 'analyzing' | 'inactive'

/** Reproduction handoff committed before Debug Mode waits for the user. */
export interface DebugModeHandoff {
  readonly probeLocations: readonly string[]
  readonly reproductionAction: string
  readonly logPath: string
}
