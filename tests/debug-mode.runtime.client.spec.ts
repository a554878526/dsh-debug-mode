/** Host runtime: transport-backed probe publication and handoff enforcement. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, markAgentLoopRequest, type GenerateOptions, type StreamChunk, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { PostToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { installDebugModeRuntime } from '../src/runtime.ts'
import type {} from '../src/types.ts'

/** Branded id for the stable fake agent the harness drives through phases. */
const AGENT_ID = 'debug-mode-runtime' as SessionId
const SESSION_ID = 'debug-session'
const LOG_PATH = '.codex-debug/debug.jsonl'
const ABSOLUTE_LOG_PATH = `/workspace/${LOG_PATH}`
const INGEST_URL = 'http://127.0.0.1:8765/log'
const SECOND_SESSION_ID = 'debug-session-2'
const SECOND_LOG_PATH = '.codex-debug/debug-2.jsonl'
const SECOND_INGEST_URL = 'http://127.0.0.1:8766/log'
const HANDOFF = '<debug_reproduction_handoff>\n'
  + `{"probeLocations":["src/value.ts:selectFilter"],"reproductionAction":"Copy once.","logPath":"${LOG_PATH}"}\n`
  + '</debug_reproduction_handoff>'
function browserProbe(sessionId: string, ingestUrl: string): string {
  return `function __codexDebug(event) { void fetch("${ingestUrl}", { body: JSON.stringify({ sessionId: "${sessionId}", ...event }) }); }`
}
const VALID_PROBE = browserProbe(SESSION_ID, INGEST_URL)

async function* handoffStream(): AsyncIterable<StreamChunk> {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text: HANDOFF }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: HANDOFF } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

async function* chunksStream(chunks: readonly StreamChunk[]): AsyncIterable<StreamChunk> {
  yield* chunks
}

/** Run one setup mutation and return the Host-rendered handoff text. */
async function probeHandoff(options: {
  name: string
  argumentsValue: unknown
  isError: boolean
}): Promise<string> {
  const world = await runtimeWorld()
  await prepareTransport(world)
  const exec = {
    agent: world.agent,
    name: options.name,
    arguments: options.argumentsValue,
  } as unknown as ToolExecution
  if (world.guard(exec) === undefined) await settle(world, exec, options.isError)
  const request: GenerateOptions = markAgentLoopRequest({
    provider: 'mock',
    model: 'mock',
    messages: [],
    sessionId: world.session.id,
  })
  const stream = world.ctx.waterfall(world.ctx as never, 'llm/stream', request, handoffStream)
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks.flatMap(chunk => chunk.type === 'block-end' && chunk.block.type === 'text'
    ? [chunk.block.text]
    : []).join('')
}

interface RuntimeWorld {
  ctx: Context
  session: Session
  agent: Agent
  guard: (exec: ToolExecution) => string | undefined
  flushes: { count: number }
}

async function runtimeWorld(phase: 'setup' | 'waiting-for-repro' | 'analyzing' | 'inactive' = 'setup'): Promise<RuntimeWorld> {
  const ctx = new Context()
  const session = Session.create(AGENT_ID)
  if (phase === 'waiting-for-repro') {
    session.append('debug-mode/state', { version: 1, phase, handoff: {
      probeLocations: ['src/value.ts:selectFilter'],
      reproductionAction: 'Copy once.',
      logPath: '.codex-debug/debug.jsonl',
    } })
  } else {
    session.append('debug-mode/state', { version: 1, phase })
  }
  const agent = { id: AGENT_ID, session } as Agent
  let guard: ((exec: ToolExecution) => string | undefined) | undefined
  const flushes = { count: 0 }
  ctx.provide('tools', { guard: (fn: (exec: ToolExecution) => string | undefined) => { guard = fn } })
  ctx.provide('sessions', {
    get: (id: SessionId) => id === session.id ? session : undefined,
    flush: () => { flushes.count += 1; return Promise.resolve() },
  })
  installDebugModeRuntime(ctx)
  if (guard === undefined) throw new Error('debug-mode runtime registered no tool guard')
  return { ctx, session, agent, guard, flushes }
}

async function settle(world: RuntimeWorld, exec: ToolExecution, isError: boolean, text = ''): Promise<void> {
  await world.ctx.waterfall(
    world.ctx as never,
    'tools/post-execute',
    exec,
    { isError, content: text.length === 0 ? [] : [{ type: 'text', text }] } as ToolExecutionResult,
    () => Promise.resolve({ kind: 'accept' } as PostToolDecision),
  )
}

async function prepareTransport(world: RuntimeWorld, facts = {
  sessionId: SESSION_ID, logPath: LOG_PATH, ingestUrl: INGEST_URL,
}): Promise<void> {
  const helper = {
    agent: world.agent,
    name: 'bash',
    arguments: { command: 'python3 new_debug_session.py --root .' },
  } as unknown as ToolExecution
  await settle(world, helper, false, `sessionId=${facts.sessionId}\nlogPath=${facts.logPath}\ningestUrl=${facts.ingestUrl}`)
  const server = {
    agent: world.agent,
    name: 'bash',
    arguments: { command: `python3 debug_ingest_server.py --session ${facts.sessionId} --port ${new URL(facts.ingestUrl).port}` },
  } as unknown as ToolExecution
  await settle(world, server, false, 'background job started')
}

async function consumeResponse(
  world: RuntimeWorld,
  chunks: readonly StreamChunk[],
  options: { marked?: boolean; request?: GenerateOptions } = {},
): Promise<StreamChunk[]> {
  if (options.marked === true) {
    await prepareTransport(world)
    const exec = { agent: world.agent, name: 'write', arguments: { content: VALID_PROBE } } as unknown as ToolExecution
    expect(world.guard(exec)).toBeUndefined()
    await settle(world, exec, false)
  }
  const request = options.request ?? markAgentLoopRequest({
    provider: 'mock', model: 'mock', messages: [], sessionId: world.session.id,
  })
  const stream = world.ctx.waterfall(
    world.ctx as never,
    'llm/stream',
    request,
    () => chunksStream(chunks),
  )
  const consumed: StreamChunk[] = []
  for await (const chunk of stream) consumed.push(chunk)
  return consumed
}

function textChunks(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function user(text: string, extra = false): UserMessage {
  const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
  return extra ? { ...message, content: [...message.content, { type: 'text', text: 'extra' }] } : message
}

/** Complete agent/pre-step payload from the public lifecycle event contract. */
function preStepPayload(agent: Agent, messages: UserMessage[]) {
  return { agent, messages, turn: 1, step: 1, signal: new AbortController().signal }
}

describe('debug-mode setup runtime', () => {
  it('denies every tool while waiting for reproduction and is silent otherwise', async () => {
    const waiting = await runtimeWorld('waiting-for-repro')
    expect(waiting.guard({ agent: waiting.agent, name: 'read' } as ToolExecution)).toMatch(/waiting for the user to reproduce/)
    const analyzing = await runtimeWorld('analyzing')
    expect(analyzing.guard({ agent: analyzing.agent, name: 'read' } as ToolExecution)).toBeUndefined()
    const inactive = await runtimeWorld('inactive')
    expect(inactive.guard({ agent: inactive.agent, name: 'read' } as ToolExecution)).toBeUndefined()
  })

  it('allows unbounded exploration but rejects unstable setup mutations', async () => {
    const world = await runtimeWorld()
    for (let index = 0; index < 100; index += 1) {
      expect(world.guard({ agent: world.agent, name: 'read', arguments: { index } } as unknown as ToolExecution)).toBeUndefined()
    }
    const consoleProbe = { agent: world.agent, name: 'edit', arguments: { new_string: 'console.log("__codexDebug")' } } as unknown as ToolExecution
    expect(world.guard(consoleProbe)).toMatch(/transport-backed probe writes/)
    await prepareTransport(world)
    expect(world.guard(consoleProbe)).toMatch(/transport-backed probe writes/)
    const valid = { agent: world.agent, name: 'edit', arguments: { new_string: VALID_PROBE } } as unknown as ToolExecution
    expect(world.guard(valid)).toBeUndefined()
  })

  it('ignores malformed helper and server observations until their facts match', async () => {
    const world = await runtimeWorld()
    const helperWithNonTextResult = {
      agent: world.agent, name: 'bash', arguments: { command: 'python3 new_debug_session.py' },
    } as unknown as ToolExecution
    await world.ctx.waterfall(
      world.ctx as never,
      'tools/post-execute',
      helperWithNonTextResult,
      { isError: false, content: [{ type: 'image', data: '', mimeType: 'image/png' }] } as unknown as ToolExecutionResult,
      () => Promise.resolve({ kind: 'accept' } as PostToolDecision),
    )
    await settle(world, {
      agent: world.agent, name: 'bash', arguments: { command: 1 },
    } as unknown as ToolExecution, false)
    await settle(world, {
      agent: world.agent, name: 'bash', arguments: { command: `python3 debug_ingest_server.py --session ${SESSION_ID}` },
    } as unknown as ToolExecution, false)
    await settle(world, {
      agent: world.agent, name: 'bash', arguments: { command: 'python3 new_debug_session.py' },
    } as unknown as ToolExecution, false, `sessionId=${SESSION_ID}\nlogPath=${LOG_PATH}\ningestUrl=http://localhost:8765/log`)
    await settle(world, {
      agent: world.agent, name: 'bash', arguments: { command: 'python3 new_debug_session.py' },
    } as unknown as ToolExecution, false, `sessionId=${SESSION_ID}\nlogPath=${LOG_PATH}\ningestUrl=${INGEST_URL}`)
    await settle(world, {
      agent: world.agent, name: 'bash', arguments: { command: 'python3 debug_ingest_server.py --session wrong' },
    } as unknown as ToolExecution, false)
    const partialNode = { agent: world.agent, name: 'write', arguments: { content: 'function __codexDebug() { appendFileSync("x") }' } } as unknown as ToolExecution
    expect(world.guard(partialNode)).toMatch(/transport-backed probe writes/)
    const logOnlyNode = { agent: world.agent, name: 'write', arguments: { content: `function __codexDebug() { appendFileSync("${LOG_PATH}") }` } } as unknown as ToolExecution
    expect(world.guard(logOnlyNode)).toMatch(/transport-backed probe writes/)
  })

  it.each([
    ['missing arguments', 'write', undefined, false, false],
    ['non-string write content', 'write', { content: 1 }, false, false],
    ['non-string edit content', 'edit', { new_string: 1 }, false, false],
    ['successful non-mutation', 'marker_echo', { text: '__codexDebug' }, false, false],
    ['failed write', 'write', { content: '__codexDebug' }, true, false],
    ['marker removed by edit', 'edit', { old_string: '__codexDebug', new_string: '' }, false, false],
    ['successful write', 'write', { content: VALID_PROBE }, false, true],
    ['successful edit', 'edit', { new_string: VALID_PROBE }, false, true],
    ['successful node probe', 'write', { content: `function __codexDebug() { appendFileSync("${LOG_PATH}", "${SESSION_ID}") }` }, false, true],
  ] as const)('probe verification: %s', async (_label, name, argumentsValue, isError, accepted) => {
    const text = await probeHandoff({ name, argumentsValue, isError })
    expect(text.startsWith('Debug Mode is waiting for reproduction.')).toBe(accepted)
    expect(text.includes('rejected the reproduction handoff')).toBe(!accepted)
  })

  it('passes through requests outside an active setup session', async () => {
    const chunks = textChunks('plain')
    const world = await runtimeWorld('inactive')
    await expect(consumeResponse(world, chunks, { request: { provider: 'mock', model: 'mock', messages: [] } })).resolves.toEqual(chunks)
    await expect(consumeResponse(world, chunks, { request: markAgentLoopRequest({ provider: 'mock', model: 'mock', messages: [] }) })).resolves.toEqual(chunks)
    await expect(consumeResponse(world, chunks)).resolves.toEqual(chunks)
    const missing = await runtimeWorld('setup')
    const request = markAgentLoopRequest({ provider: 'mock', model: 'mock', messages: [], sessionId: SessionId('missing') })
    await expect(consumeResponse(missing, chunks, { request })).resolves.toEqual(chunks)
  })

  it.each(['error', 'aborted'] as const)('passes through provider %s terminals', async (kind) => {
    const world = await runtimeWorld()
    const chunks: StreamChunk[] = [{
      type: 'finish',
      reason: { kind, failure: { message: 'failed', code: 'TEST' } },
    }]
    await expect(consumeResponse(world, chunks)).resolves.toEqual(chunks)
  })

  it('publishes only tool protocol chunks while setup continues', async () => {
    const world = await runtimeWorld()
    const chunks: StreamChunk[] = [
      { type: 'block-start', index: 2, blockType: 'text' },
      { type: 'text-delta', index: 2, text: 'hidden ordinary text' },
      { type: 'block-end', index: 2, block: { type: 'text', text: 'hidden ordinary text' } },
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'hidden' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'hidden' } },
      { type: 'block-start', index: 1, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 1, id: 'call' as never, name: 'read', argumentsDelta: '{}' },
      { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call' as never, name: 'read', arguments: '{}' } },
      { type: 'usage', usage: { inputTokens: 1, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]
    const output = await consumeResponse(world, chunks)
    expect(output.map(chunk => chunk.type)).toEqual([
      'block-start', 'reasoning-delta', 'block-end', 'block-start', 'tool-call-delta', 'block-end', 'usage', 'finish',
    ])
  })

  it.each([
    ['plain text', 'diagnosis'],
    ['invalid JSON', '<debug_reproduction_handoff>{</debug_reproduction_handoff>'],
    ['non-object JSON', '<debug_reproduction_handoff>[]</debug_reproduction_handoff>'],
    ['missing probes', '<debug_reproduction_handoff>{"probeLocations":[],"reproductionAction":"x","logPath":"x"}</debug_reproduction_handoff>'],
    ['invalid probe', '<debug_reproduction_handoff>{"probeLocations":[1],"reproductionAction":"x","logPath":"x"}</debug_reproduction_handoff>'],
    ['blank probe', '<debug_reproduction_handoff>{"probeLocations":[" "],"reproductionAction":"x","logPath":"x"}</debug_reproduction_handoff>'],
    ['invalid action', '<debug_reproduction_handoff>{"probeLocations":["x"],"reproductionAction":1,"logPath":"x"}</debug_reproduction_handoff>'],
    ['blank action', '<debug_reproduction_handoff>{"probeLocations":["x"],"reproductionAction":" ","logPath":"x"}</debug_reproduction_handoff>'],
    ['invalid log', '<debug_reproduction_handoff>{"probeLocations":["x"],"reproductionAction":"x","logPath":1}</debug_reproduction_handoff>'],
    ['blank log', '<debug_reproduction_handoff>{"probeLocations":["x"],"reproductionAction":"x","logPath":" "}</debug_reproduction_handoff>'],
  ])('blocks %s instead of publishing it', async (_label, text) => {
    const world = await runtimeWorld()
    const output = await consumeResponse(world, [
      ...textChunks(text).slice(0, -1),
      { type: 'usage', usage: { inputTokens: 1, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    expect(output.some(chunk => chunk.type === 'block-end' && chunk.block.type === 'text'
      && chunk.block.text.includes('blocked a premature conclusion'))).toBe(true)
    expect(output.some(chunk => chunk.type === 'usage')).toBe(true)
  })

  it('trims a valid handoff, commits waiting state, and flushes once', async () => {
    const world = await runtimeWorld()
    const handoff = `<debug_reproduction_handoff>{"probeLocations":[" src/a.ts:f "],"reproductionAction":" copy ","logPath":" ${LOG_PATH} "}</debug_reproduction_handoff>`
    const output = await consumeResponse(world, textChunks(handoff), { marked: true })
    expect(output.some(chunk => chunk.type === 'block-end' && chunk.block.type === 'text'
      && chunk.block.text.includes(`Probes: src/a.ts:f\nReproduce: copy\nLog: ${LOG_PATH}`))).toBe(true)
    expect(world.session.events.at(-1)).toMatchObject({ type: 'debug-mode/state', data: { phase: 'waiting-for-repro' } })
    expect(world.flushes.count).toBe(1)
  })

  it.each([
    ['/workspace/.codex-debug/debug.jsonl', LOG_PATH],
    ['C:\\workspace\\.codex-debug\\debug.jsonl', LOG_PATH],
  ])('accepts helper path %s for relative handoff %s', async (helperLogPath, handoffLogPath) => {
    const world = await runtimeWorld()
    await prepareTransport(world, { sessionId: SESSION_ID, logPath: helperLogPath, ingestUrl: INGEST_URL })
    const probe = {
      agent: world.agent, name: 'edit', arguments: { new_string: VALID_PROBE },
    } as unknown as ToolExecution
    expect(world.guard(probe)).toBeUndefined()
    await settle(world, probe, false)
    const handoff = `<debug_reproduction_handoff>{"probeLocations":["src/value.ts:path"],"reproductionAction":"Copy once.","logPath":"${handoffLogPath}"}</debug_reproduction_handoff>`
    const output = await consumeResponse(world, textChunks(handoff))
    expect(output.some(chunk => chunk.type === 'block-end' && chunk.block.type === 'text'
      && chunk.block.text.includes(`Log: ${handoffLogPath}`))).toBe(true)
    expect(world.session.events.at(-1)).toMatchObject({
      type: 'debug-mode/state', data: { phase: 'waiting-for-repro', handoff: { logPath: handoffLogPath } },
    })
  })

  it('reports a log-path mismatch separately from a missing probe', async () => {
    const world = await runtimeWorld()
    await prepareTransport(world, {
      sessionId: SESSION_ID,
      logPath: '/workspace/.codex-debug/debug-other.jsonl',
      ingestUrl: INGEST_URL,
    })
    const probe = {
      agent: world.agent, name: 'edit', arguments: { new_string: VALID_PROBE },
    } as unknown as ToolExecution
    expect(world.guard(probe)).toBeUndefined()
    await settle(world, probe, false)
    const output = await consumeResponse(world, textChunks(HANDOFF))
    const text = output.flatMap(chunk => chunk.type === 'block-end' && chunk.block.type === 'text'
      ? [chunk.block.text]
      : []).join('')
    expect(text).toContain('logPath does not identify')
    expect(text).not.toContain('no probe was actually inserted')
  })

  it('accepts a fresh log for the next analyzing round and rejects log reuse', async () => {
    const world = await runtimeWorld()
    await consumeResponse(world, textChunks(HANDOFF), { marked: true })
    world.session.append('debug-mode/state', { version: 1, phase: 'analyzing' })
    expect(world.guard({ agent: world.agent, name: 'job_kill', arguments: { job_id: 'bash-1' } } as unknown as ToolExecution))
      .toMatch(/until the user clicks Fixed/)
    expect(world.guard({
      agent: world.agent, name: 'bash', arguments: { command: 'rm -rf .codex-debug' },
    } as unknown as ToolExecution)).toMatch(/until the user clicks Fixed/)
    expect(world.guard({
      agent: world.agent,
      name: 'edit',
      arguments: { old_string: 'function __codexDebug() {}', new_string: 'function ordinary() {}' },
    } as unknown as ToolExecution)).toMatch(/until the user clicks Fixed/)
    const unboundProbe = {
      agent: world.agent, name: 'edit', arguments: { new_string: VALID_PROBE },
    } as unknown as ToolExecution
    expect(world.guard(unboundProbe)).toMatch(/transport-backed probe writes/)
    const secondFacts = {
      sessionId: SECOND_SESSION_ID, logPath: SECOND_LOG_PATH, ingestUrl: SECOND_INGEST_URL,
    }
    await prepareTransport(world, secondFacts)
    const secondProbe = {
      agent: world.agent,
      name: 'edit',
      arguments: { new_string: browserProbe(SECOND_SESSION_ID, SECOND_INGEST_URL) },
    } as unknown as ToolExecution
    expect(world.guard(secondProbe)).toBeUndefined()
    await settle(world, secondProbe, false)
    const secondHandoff = `<debug_reproduction_handoff>{"probeLocations":["src/value.ts:round2"],"reproductionAction":"Copy again.","logPath":"${SECOND_LOG_PATH}"}</debug_reproduction_handoff>`
    const secondOutput = await consumeResponse(world, textChunks(secondHandoff))
    expect(secondOutput.some(chunk => chunk.type === 'block-end' && chunk.block.type === 'text'
      && chunk.block.text.includes(`Log: ${SECOND_LOG_PATH}`))).toBe(true)
    expect(world.session.events.at(-1)).toMatchObject({
      type: 'debug-mode/state', data: { phase: 'waiting-for-repro', handoff: { logPath: SECOND_LOG_PATH } },
    })

    world.session.append('debug-mode/state', { version: 1, phase: 'analyzing' })
    await prepareTransport(world, { sessionId: SESSION_ID, logPath: ABSOLUTE_LOG_PATH, ingestUrl: INGEST_URL })
    const reusedProbe = {
      agent: world.agent, name: 'edit', arguments: { new_string: VALID_PROBE },
    } as unknown as ToolExecution
    expect(world.guard(reusedProbe)).toBeUndefined()
    await settle(world, reusedProbe, false)
    const reusedOutput = await consumeResponse(world, textChunks(HANDOFF))
    expect(reusedOutput.some(chunk => chunk.type === 'block-end' && chunk.block.type === 'text'
      && chunk.block.text.includes('logPath was already used'))).toBe(true)
  })

  it('rejects a valid handoff when no successful mutation was observed', async () => {
    const world = await runtimeWorld()
    const output = await consumeResponse(world, textChunks(HANDOFF))
    expect(output.some(chunk => chunk.type === 'block-end' && chunk.block.type === 'text'
      && chunk.block.text.includes('rejected the reproduction handoff'))).toBe(true)
  })

  it('passes ordinary analyzing output and tool calls while setup replacements preserve reasoning', async () => {
    const analyzing = await runtimeWorld('analyzing')
    const ordinary = textChunks('verification report')
    await expect(consumeResponse(analyzing, ordinary)).resolves.toEqual(ordinary)
    const toolStep: StreamChunk[] = [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 'analyzing' as never, name: 'read', argumentsDelta: '{}' },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'analyzing' as never, name: 'read', arguments: '{}' } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]
    await expect(consumeResponse(analyzing, toolStep)).resolves.toEqual(toolStep)

    const setup = await runtimeWorld('setup')
    const replaced = await consumeResponse(setup, [
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'kept' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'kept' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    expect(replaced.some(chunk => chunk.type === 'reasoning-delta')).toBe(true)
    const noIndexedInput = await consumeResponse(await runtimeWorld('setup'), [
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    expect(noIndexedInput.some(chunk => chunk.type === 'block-start' && chunk.index === 0)).toBe(true)
  })

  it('applies every pre-step phase transition and control message', async () => {
    const inactive = await runtimeWorld('inactive')
    const accepted: PreStepDecision = { kind: 'enter', messages: [user('accepted')] }
    await expect(inactive.ctx.waterfall(inactive.ctx as never, 'agent/pre-step',
      preStepPayload(inactive.agent, [user('hello')]),
      () => Promise.resolve(accepted))).resolves.toBe(accepted)

    const exit = await runtimeWorld('setup')
    await expect(exit.ctx.waterfall(exit.ctx as never, 'agent/pre-step',
      preStepPayload(exit.agent, [user('退出 Debug Mode')]),
      () => Promise.resolve(accepted))).resolves.toEqual({ kind: 'reject' })
    expect(exit.session.events.at(-1)).toMatchObject({ data: { phase: 'inactive' } })

    const fixed = await runtimeWorld('setup')
    await expect(fixed.ctx.waterfall(fixed.ctx as never, 'agent/pre-step',
      preStepPayload(fixed.agent, [user('已修复，请清理调试日志和插桩代码')]),
      () => Promise.resolve(accepted))).resolves.toBe(accepted)
    expect(fixed.session.events.at(-1)).toMatchObject({ data: { phase: 'inactive' } })

    const setup = await runtimeWorld('setup')
    await expect(setup.ctx.waterfall(setup.ctx as never, 'agent/pre-step',
      preStepPayload(setup.agent, [user('继续分析')]),
      () => Promise.resolve(accepted))).resolves.toEqual({ kind: 'reject' })

    const setupOther = await runtimeWorld('setup')
    await expect(setupOther.ctx.waterfall(setupOther.ctx as never, 'agent/pre-step',
      preStepPayload(setupOther.agent, [user('retry setup')]),
      () => Promise.resolve(accepted))).resolves.toBe(accepted)

    const waitingNoHuman = await runtimeWorld('waiting-for-repro')
    await expect(waitingNoHuman.ctx.waterfall(waitingNoHuman.ctx as never, 'agent/pre-step',
      preStepPayload(waitingNoHuman.agent, [createUserMessage({
        content: [{ type: 'text', text: 'plugin' }], source: { kind: 'plugin', plugin: 'test' },
      })]),
      () => Promise.resolve(accepted))).resolves.toEqual({ kind: 'reject' })

    const waitingRejected = await runtimeWorld('waiting-for-repro')
    const rejected: PreStepDecision = { kind: 'reject' }
    await expect(waitingRejected.ctx.waterfall(waitingRejected.ctx as never, 'agent/pre-step',
      preStepPayload(waitingRejected.agent, [user('continue', true)]),
      () => Promise.resolve(rejected))).resolves.toBe(rejected)

    const waiting = await runtimeWorld('waiting-for-repro')
    await expect(waiting.ctx.waterfall(waiting.ctx as never, 'agent/pre-step',
      preStepPayload(waiting.agent, [user('continue')]),
      () => Promise.resolve(accepted))).resolves.toBe(accepted)
    expect(waiting.session.events.at(-1)).toMatchObject({ data: { phase: 'analyzing' } })
    expect(waiting.flushes.count).toBe(1)
  })

  it('ignores unowned tool executions and clears setup counters outside setup', async () => {
    const world = await runtimeWorld()
    expect(world.guard({} as ToolExecution)).toBeUndefined()
    expect(world.guard({ agent: world.agent } as ToolExecution)).toBeUndefined()
    world.session.append('debug-mode/state', { version: 1, phase: 'analyzing' })
    expect(world.guard({ agent: world.agent } as ToolExecution)).toBeUndefined()
    await world.ctx.waterfall(
      world.ctx as never,
      'tools/post-execute',
      { name: 'write', arguments: { content: '__codexDebug' } } as ToolExecution,
      { isError: false } as ToolExecutionResult,
      () => Promise.resolve({ kind: 'accept' } as PostToolDecision),
    )

    const noStateSession = Session.create(SessionId('no-debug-state'))
    noStateSession.append('user/message', user('No debug state'), { surfaceOp: 'append' })
    const noStateAgent = { id: noStateSession.id, session: noStateSession } as Agent
    expect(world.guard({ agent: noStateAgent } as ToolExecution)).toBeUndefined()
    await world.ctx.waterfall(
      world.ctx as never,
      'tools/post-execute',
      { agent: noStateAgent, name: 'write', arguments: { content: '__codexDebug' } } as ToolExecution,
      { isError: false } as ToolExecutionResult,
      () => Promise.resolve({ kind: 'accept' } as PostToolDecision),
    )

    const withoutGuard = await runtimeWorld()
    await withoutGuard.ctx.waterfall(
      withoutGuard.ctx as never,
      'tools/post-execute',
      { agent: withoutGuard.agent, name: 'write', arguments: { content: '__codexDebug' } } as ToolExecution,
      { isError: false } as ToolExecutionResult,
      () => Promise.resolve({ kind: 'accept' } as PostToolDecision),
    )

    const stale = await runtimeWorld()
    const staleExec = { agent: stale.agent, name: 'write', arguments: { content: '__codexDebug' } } as ToolExecution
    stale.guard(staleExec)
    stale.session.append('debug-mode/state', { version: 1, phase: 'setup' })
    await stale.ctx.waterfall(
      stale.ctx as never,
      'tools/post-execute',
      staleExec,
      { isError: false } as ToolExecutionResult,
      () => Promise.resolve({ kind: 'accept' } as PostToolDecision),
    )
  })
})
