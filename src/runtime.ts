/** Host enforcement for the Debug Mode reproduction barrier. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import {
  isAgentLoopRequest,
  type GenerateOptions,
  type StreamChunk,
  type UserMessage,
} from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import {
  DEBUG_MODE_CONTINUE_MESSAGE,
  DEBUG_MODE_EXIT_MESSAGE,
  DEBUG_MODE_FIXED_MESSAGE,
  DEBUG_MODE_HANDOFF_CLOSE,
  DEBUG_MODE_HANDOFF_OPEN,
  DEBUG_MODE_WAITING_PREFIX,
} from './messages.ts'
import { appendDebugModeState, foldDebugModeState } from './state.ts'
import type { DebugModeHandoff } from './types.ts'

const PROTOCOL_RESULT = 'Debug Mode blocked a premature conclusion because no reproduction handoff was committed. '
  + 'No diagnosis was published. Continue setup: create the debug session, start its ingest server, install a transport-backed probe, then submit the handoff.'

const WAITING_TOOL_DENIAL = 'Debug Mode is waiting for the user to reproduce the issue; no tools may run before new human input'

/** Markers every generated probe template carries, so an inserted probe is observable in tool arguments. */
const PROBE_MARKERS = ['CODEX_DEBUG', '__codexDebug']

const PROBE_REQUIRED_RESULT = 'Debug Mode rejected the reproduction handoff because no probe was actually inserted. '
  + 'Insert a marked probe (a `__codexDebug` / `CODEX_DEBUG` template) with the edit or write tool, '
  + 'then submit the <debug_reproduction_handoff> marker again.'

const LOG_PATH_MISMATCH_RESULT = 'Debug Mode rejected the reproduction handoff because its logPath does not identify '
  + 'the log created by new_debug_session.py. Copy the helper logPath or use its equivalent '
  + '`.codex-debug/debug-<session>.jsonl` path, then submit the handoff again.'

interface DebugTransportFacts {
  sessionId: string
  logPath: string
  ingestUrl: string
}

/** Runtime facts observed from successful setup tools for one activation. */
interface SetupToolState {
  stateSeq: number
  transport?: DebugTransportFacts
  ingestStarted: boolean
  insertedProbe: boolean
}

const SETUP_WRITE_DENIAL = 'Debug Mode setup permits only transport-backed probe writes. '
  + 'Run the packaged new_debug_session.py helper, start its printed ingest command, then write a probe using that exact sessionId and ingestUrl.'
const ACTIVE_CLEANUP_DENIAL = 'Debug Mode retains probes, ingest jobs, and every round log until the user clicks Fixed. '
  + 'Submit a fresh reproduction handoff or a verification report; cleanup is allowed only in the Fixed turn.'

/** The last durable `debug-mode/state` event, or `undefined` when Debug Mode never ran. */
function lastDebugModeStateEvent(session: Session): SessionEvent<'debug-mode/state'> | undefined {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index]
    if (event?.type === 'debug-mode/state') return event
  }
  return undefined
}

function setupToolState(agent: Agent, stateSeq: number, states: Map<SessionId, SetupToolState>): SetupToolState {
  const current = states.get(agent.id)
  if (current === undefined || current.stateSeq !== stateSeq) {
    const created = { stateSeq, ingestStarted: false, insertedProbe: false }
    states.set(agent.id, created)
    return created
  }
  return current
}

function onlyText(message: UserMessage): string | undefined {
  const [block] = message.content
  return message.content.length === 1 && block?.type === 'text' ? block.text : undefined
}

function directHuman(messages: readonly UserMessage[]): UserMessage | undefined {
  return messages.find(message => message.source.kind === 'user')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Return only content that a successful file mutation publishes into product code. */
function insertedContent(exec: ToolExecution): string | undefined {
  if (!isRecord(exec.arguments)) return undefined
  if (exec.name === 'write') {
    const content = exec.arguments['content']
    return typeof content === 'string' ? content : undefined
  }
  if (exec.name === 'edit') {
    const newString = exec.arguments['new_string']
    return typeof newString === 'string' ? newString : undefined
  }
  return undefined
}

function bashCommand(exec: ToolExecution): string | undefined {
  if (exec.name !== 'bash' || !isRecord(exec.arguments)) return undefined
  const command = exec.arguments['command']
  return typeof command === 'string' ? command : undefined
}

function toolResultText(result: Readonly<ToolExecutionResult>): string {
  return result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

function parseTransportFacts(text: string): DebugTransportFacts | undefined {
  const sessionId = /^sessionId=(.+)$/m.exec(text)?.[1]?.trim()
  const logPath = /^logPath=(.+)$/m.exec(text)?.[1]?.trim()
  const ingestUrl = /^ingestUrl=(.+)$/m.exec(text)?.[1]?.trim()
  if (sessionId === undefined || sessionId.length === 0
    || logPath === undefined || logPath.length === 0
    || ingestUrl === undefined || !/^http:\/\/127\.0\.0\.1:\d+\/log$/.test(ingestUrl)) return
  return { sessionId, logPath, ingestUrl }
}

/** Compare helper and handoff paths by their repository-local Debug Mode log identity. */
function debugLogIdentity(logPath: string): string {
  const slashed = logPath.replaceAll('\\', '/')
  const absoluteMarker = '/.codex-debug/'
  const markerIndex = slashed.lastIndexOf(absoluteMarker)
  if (markerIndex >= 0) return slashed.slice(markerIndex + 1)
  return slashed.replace(/^(?:\.\/)+/, '')
}

function sameDebugLogPath(left: string, right: string): boolean {
  return debugLogIdentity(left) === debugLogIdentity(right)
}

function isTransportBackedProbe(content: string, facts: DebugTransportFacts): boolean {
  const marker = PROBE_MARKERS.some(value => content.includes(value))
  const browser = content.includes('fetch(')
    && content.includes('JSON.stringify')
    && content.includes(facts.ingestUrl)
    && content.includes(facts.sessionId)
  const node = (content.includes('appendFileSync') || content.includes('appendFile('))
    && content.includes(facts.logPath)
    && content.includes(facts.sessionId)
  return marker && (browser || node)
}

function setupWriteDenial(exec: ToolExecution, state: SetupToolState): string | undefined {
  if (exec.name !== 'edit' && exec.name !== 'write') return
  const content = insertedContent(exec)
  if (content === undefined || state.transport === undefined || !state.ingestStarted
    || !isTransportBackedProbe(content, state.transport)) return SETUP_WRITE_DENIAL
  return undefined
}

function analyzingWriteDenial(exec: ToolExecution, state: SetupToolState): string | undefined {
  const content = insertedContent(exec)
  if (content === undefined || !PROBE_MARKERS.some(marker => content.includes(marker))) return
  if (state.transport === undefined || !state.ingestStarted || !isTransportBackedProbe(content, state.transport)) {
    return SETUP_WRITE_DENIAL
  }
  return undefined
}

function analyzingCleanupDenial(exec: ToolExecution): string | undefined {
  if (exec.name === 'job_kill') return ACTIVE_CLEANUP_DENIAL
  const command = bashCommand(exec)
  if (command !== undefined && /\b(?:rm|rmdir|unlink)\b[^\n]*\.codex-debug|\.codex-debug[^\n]*\b(?:rm|rmdir|unlink)\b/.test(command)) {
    return ACTIVE_CLEANUP_DENIAL
  }
  if (exec.name === 'edit' && isRecord(exec.arguments)) {
    const oldString = exec.arguments['old_string']
    const newString = exec.arguments['new_string']
    if (typeof oldString === 'string' && PROBE_MARKERS.some(marker => oldString.includes(marker))
      && (typeof newString !== 'string' || !PROBE_MARKERS.some(marker => newString.includes(marker)))) {
      return ACTIVE_CLEANUP_DENIAL
    }
  }
  return undefined
}

/** Record a probe only after the canonical edit/write result confirms publication. */
function observeSuccessfulProbeWrite(
  exec: ToolExecution,
  result: Readonly<ToolExecutionResult>,
  states: Map<SessionId, SetupToolState>,
): void {
  const agent = exec.agent
  if (agent === undefined || result.isError) return
  const stateEvent = lastDebugModeStateEvent(agent.session)
  if (stateEvent?.data.phase !== 'setup' && stateEvent?.data.phase !== 'analyzing') return
  const state = setupToolState(agent, stateEvent.seq, states)
  const command = bashCommand(exec)
  if (command !== undefined) {
    if (command.includes('new_debug_session.py')) {
      const transport = parseTransportFacts(toolResultText(result))
      if (transport !== undefined) states.set(agent.id, { ...state, transport, ingestStarted: false })
      return
    }
    if (command.includes('debug_ingest_server.py') && state.transport !== undefined
      && command.includes(state.transport.sessionId)) {
      states.set(agent.id, { ...state, ingestStarted: true })
      return
    }
  }
  const content = insertedContent(exec)
  if (content === undefined || state.transport === undefined || !state.ingestStarted
    || !isTransportBackedProbe(content, state.transport)) return
  states.set(agent.id, { ...state, insertedProbe: true })
}

function parseHandoff(chunks: readonly StreamChunk[]): DebugModeHandoff | undefined {
  const text = chunks.flatMap(chunk =>
    chunk.type === 'block-end' && chunk.block.type === 'text' ? [chunk.block.text] : []).join('').trim()
  if (!text.startsWith(DEBUG_MODE_HANDOFF_OPEN) || !text.endsWith(DEBUG_MODE_HANDOFF_CLOSE)) return
  const json = text.slice(DEBUG_MODE_HANDOFF_OPEN.length, -DEBUG_MODE_HANDOFF_CLOSE.length).trim()
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return
  }
  if (!isRecord(value)) return
  const probeLocations = value['probeLocations']
  const reproductionAction = value['reproductionAction']
  const logPath = value['logPath']
  if (!Array.isArray(probeLocations) || probeLocations.length === 0
    || !probeLocations.every((location): location is string =>
      typeof location === 'string' && location.trim().length > 0)
    || typeof reproductionAction !== 'string' || reproductionAction.trim().length === 0
    || typeof logPath !== 'string' || logPath.trim().length === 0) return
  return {
    probeLocations: probeLocations.map(location => location.trim()),
    reproductionAction: reproductionAction.trim(),
    logPath: logPath.trim(),
  }
}

function isTerminalFailure(chunks: readonly StreamChunk[]): boolean {
  const finish = chunks.findLast(chunk => chunk.type === 'finish')
  return finish?.type === 'finish'
    && (finish.reason.kind === 'error' || finish.reason.kind === 'aborted')
}

function isToolChunk(chunk: StreamChunk): boolean {
  if (chunk.type === 'reasoning-delta') return true
  if (chunk.type === 'tool-call-delta') return true
  if (chunk.type === 'block-start') return chunk.blockType === 'tool-call' || chunk.blockType === 'reasoning'
  return chunk.type === 'block-end' && (chunk.block.type === 'tool-call' || chunk.block.type === 'reasoning')
}

function isReasoningChunk(chunk: StreamChunk): boolean {
  if (chunk.type === 'reasoning-delta') return true
  if (chunk.type === 'block-start') return chunk.blockType === 'reasoning'
  return chunk.type === 'block-end' && chunk.block.type === 'reasoning'
}

function textChunks(text: string, usage: readonly StreamChunk[], index = 0): StreamChunk[] {
  return [
    { type: 'block-start', index, blockType: 'text' },
    { type: 'text-delta', index, text },
    { type: 'block-end', index, block: { type: 'text', text } },
    ...usage,
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function replacementChunks(text: string, chunks: readonly StreamChunk[]): StreamChunk[] {
  const reasoning = chunks.filter(isReasoningChunk)
  const indices = chunks.flatMap(chunk => 'index' in chunk ? [chunk.index] : [])
  const textIndex = (indices.length === 0 ? -1 : Math.max(...indices)) + 1
  return [...reasoning, ...textChunks(text, chunks.filter(chunk => chunk.type === 'usage'), textIndex)]
}

function renderHandoff(handoff: DebugModeHandoff): string {
  return `${DEBUG_MODE_WAITING_PREFIX}\nProbes: ${handoff.probeLocations.join(', ')}\nReproduce: ${handoff.reproductionAction}\nLog: ${handoff.logPath}\nAfter reproducing, click Continue.`
}

/** Buffer one setup response so ordinary assistant text cannot cross the reproduction barrier. */
async function* enforceSetupResponse(
  options: GenerateOptions,
  next: () => AsyncIterable<StreamChunk>,
  sessions: { get(id: NonNullable<GenerateOptions['sessionId']>): Session | undefined; flush(session: Session): Promise<unknown> },
  setupStates: Map<SessionId, SetupToolState>,
): AsyncIterable<StreamChunk> {
  if (!isAgentLoopRequest(options) || options.sessionId === undefined) {
    yield* next()
    return
  }
  const session = sessions.get(options.sessionId)
  const phase = session === undefined ? 'inactive' : foldDebugModeState(session.events).phase
  if (session === undefined || (phase !== 'setup' && phase !== 'analyzing')) {
    yield* next()
    return
  }

  const chunks: StreamChunk[] = []
  for await (const chunk of next()) chunks.push(chunk)
  if (isTerminalFailure(chunks)) {
    yield* chunks
    return
  }

  if (chunks.some(chunk => chunk.type === 'block-end' && chunk.block.type === 'tool-call')) {
    if (phase === 'analyzing') {
      yield* chunks
      return
    }
    for (const chunk of chunks) {
      if (isToolChunk(chunk) || chunk.type === 'usage' || chunk.type === 'finish') yield chunk
    }
    return
  }

  const handoff = parseHandoff(chunks)
  if (handoff === undefined) {
    if (phase === 'analyzing') {
      yield* chunks
      return
    }
    yield* replacementChunks(PROTOCOL_RESULT, chunks)
    return
  }

  const setupState = setupStates.get(session.id)
  if (setupState?.insertedProbe !== true) {
    yield* replacementChunks(PROBE_REQUIRED_RESULT, chunks)
    return
  }
  if (setupState.transport === undefined || !sameDebugLogPath(setupState.transport.logPath, handoff.logPath)) {
    yield* replacementChunks(LOG_PATH_MISMATCH_RESULT, chunks)
    return
  }
  const reusedLog = session.events.some(event => event.type === 'debug-mode/state'
    && event.data.phase === 'waiting-for-repro'
    && sameDebugLogPath(event.data.handoff.logPath, handoff.logPath))
  if (reusedLog) {
    yield* replacementChunks('Debug Mode rejected the handoff because this logPath was already used by an earlier reproduction round. Run new_debug_session.py again and install the next probe with its new sessionId, ingestUrl, and logPath.', chunks)
    return
  }

  const rendered = renderHandoff(handoff)
  const renderedChunks = replacementChunks(rendered, chunks)
  yield* renderedChunks.slice(0, -1)
  appendDebugModeState(session, 'waiting-for-repro', handoff)
  await sessions.flush(session)
  yield renderedChunks.at(-1) as StreamChunk
}

/**
 * Register durable phase transitions, waiting policy, and setup-response enforcement.
 * @param ctx - Host context carrying sessions, tools, and the Agent lifecycle events.
 */
export function installDebugModeRuntime(ctx: Context): void {
  const setupToolStates = new Map<SessionId, SetupToolState>()

  ctx.on('agent/pre-step', async ({ agent, messages }, next): Promise<PreStepDecision> => {
    const state = foldDebugModeState(agent.session.events)
    if (state.phase === 'inactive') return next()
    const human = directHuman(messages)
    if (human !== undefined && onlyText(human) === DEBUG_MODE_EXIT_MESSAGE) {
      appendDebugModeState(agent.session, 'inactive')
      await ctx.sessions.flush(agent.session)
      return { kind: 'reject' }
    }
    if (human !== undefined && onlyText(human) === DEBUG_MODE_FIXED_MESSAGE) {
      appendDebugModeState(agent.session, 'inactive')
      await ctx.sessions.flush(agent.session)
      return next()
    }
    if (state.phase === 'setup' && human !== undefined && onlyText(human) === DEBUG_MODE_CONTINUE_MESSAGE) {
      return { kind: 'reject' }
    }
    if (state.phase !== 'waiting-for-repro') return next()
    if (human === undefined) return { kind: 'reject' }
    const decision = await next()
    if (decision.kind === 'reject') return decision
    appendDebugModeState(agent.session, 'analyzing')
    await ctx.sessions.flush(agent.session)
    return decision
  })

  ctx.tools.guard((exec: ToolExecution) => {
    const agent = exec.agent
    if (agent === undefined) return undefined
    const stateEvent = lastDebugModeStateEvent(agent.session)
    if (stateEvent?.data.phase === 'waiting-for-repro') return WAITING_TOOL_DENIAL
    if (stateEvent?.data.phase !== 'setup') {
      if (stateEvent?.data.phase !== 'analyzing') {
        setupToolStates.delete(agent.id)
        return undefined
      }
      const cleanupDenial = analyzingCleanupDenial(exec)
      if (cleanupDenial !== undefined) return cleanupDenial
      return analyzingWriteDenial(exec, setupToolState(agent, stateEvent.seq, setupToolStates))
    }
    return setupWriteDenial(exec, setupToolState(agent, stateEvent.seq, setupToolStates))
  })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    observeSuccessfulProbeWrite(exec, result, setupToolStates)
    return next()
  })

  ctx.on('llm/stream', (options: GenerateOptions, next) =>
    enforceSetupResponse(options, next, ctx.sessions, setupToolStates), { global: true })
}
