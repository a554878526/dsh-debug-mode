/**
 * The `debug-mode` skill body, registered programmatically by the host half.
 * It is the model-facing behavior contract for the runtime-first debug loop:
 * probe first, stop for reproduction evidence, then analyze/fix/cleanup.
 *
 * Packaged scripts are the primary mechanics for session creation, ingest,
 * summarization, and cleanup scans. Inline probe templates remain a fallback
 * for environments where a packaged helper cannot run.
 * @module dsh-debug-mode/src/skill
 */

import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

/** Skill copy: registered once by the host half, disposed with its fiber. */
export const DEBUG_MODE_SKILL: SkillRegistration = {
  name: 'debug-mode',
  source: 'runtime',
  description:
    'Runtime-first debug loop for the Debug Mode feature. When Debug Mode is active, every turn centers on runtime '
    + 'logs, not static speculation: add temporary marked probes, stop for reproduction evidence, then analyze, '
    + 'make a targeted fix or refine probes, and clean up before finishing. Use when the user runs /debug, '
    + 'reports a bug, or clicks 继续分析/已修复.',
  content: `# Debug Mode

Debug Mode is a runtime-first debugging loop. When the user activates it (runs
/debug or says "开启 Debug Mode"), every turn must center on runtime
evidence — logs — not static speculation. Treat the two UI buttons
「继续分析」 and 「已修复」 as the only ways to advance the loop, alongside the user
typing those exact words.

## One iteration

probe → wait for evidence → analyze → fix or refine probes → verify → cleanup.

Only one state transition per user round unless you can run the reproduction
yourself and read non-empty logs in the same turn.

## Speed objective

Optimize for time to the first non-empty runtime log, not for a complete static
diagnosis. The first deliverable is a running log transport plus 1-3 surgical
probes. Do not narrate hypotheses at length before those probes exist.

## Packaged helpers — use these first

The \`<skill_resources>\` base directory is this installed plugin's \`scripts/\`
directory. Resolve these names against that base and pass the resulting
absolute path to \`python3\`:

- \`new_debug_session.py\` — create the session id, log path, ingest command,
  and copy-ready probes.
- \`debug_ingest_server.py\` — receive Browser/Electron events.
- \`summarize_debug_log.py\` — summarize collected JSONL evidence.
- \`find_instrumentation.py\` — find temporary probes before completion.

For a new bug, run \`new_debug_session.py --root .\` before placing probes. Run
the ingest command it prints as a background job when Browser/Electron code can
post to localhost, and confirm the server is ready before editing product code.
Use the packaged summarizer after reproduction and the packaged instrumentation
scan before reporting cleanup complete. Do not write a replacement session,
ingest, summarization, or scan script unless the packaged helper is missing or
fails. If that happens, state the exact failure first, then use the inline
fallback below.

## Fast startup contract (new bug report)

Perform this sequence immediately:

1. Check \`git status --short\`.
2. Run the packaged session helper. For Browser/Electron, start its printed
   ingest command in the background and keep the JSONL log path.
3. Use at most two targeted searches and two targeted file reads to find the
   named runtime boundary. If that cannot identify a safe boundary, ask one
   blocker question instead of exploring broadly.
4. Add 1-3 marked probes at the observed input, branch decision, or output.
5. End with exactly this machine-readable handoff and no other text:

<debug_reproduction_handoff>
{"probeLocations":["file:boundary"],"reproductionAction":"exact user action","logPath":".codex-debug/debug-<session>.jsonl"}
</debug_reproduction_handoff>

Setup exploration has no Debug Mode tool-count limit. Host validation instead
enforces the required result: before any \`edit\` or \`write\`, the packaged
session helper and its printed ingest command must have completed successfully.
The mutation must publish a \`__codexDebug\` / \`CODEX_DEBUG\` probe using that
exact session id and ingest URL (or the matching Node JSONL path). Console-only
probes and ordinary fixes are rejected before they modify files. The handoff is
accepted only after the validated mutation succeeds and its log path matches
the helper output.

Before the first non-empty runtime log, do not write or run a reproduction
test, typecheck, lint, build, inspect broad sibling implementations, propose a
fix, or continue static diagnosis. A synthetic fixture is not runtime evidence
for the user's failing data path.

## Evidence turn barrier

After probes are inserted, emit the exact handoff wrapper above with:

1. Where the probes are (files and boundary).
2. The exact reproduction action.
3. The JSONL log path under \`.codex-debug/debug-<session>.jsonl\`.
4. The exact reproduction instruction the Host should show before the user
   clicks 「继续分析」.

The Host buffers setup responses, removes ordinary assistant text, validates the
handoff wrapper and observed transport, records the waiting phase, and publishes
a reproduction instruction. Any other text-only conclusion is replaced by a
recoverable protocol-block message; setup tools remain available for the next
attempt. Do not optimize,
fix, test, typecheck, or clean up until evidence arrives.

## Continue (「继续分析」)

1. Read and summarize the collected logs (JSONL under \`.codex-debug/\`).
2. Judge whether the root cause is proven.
3. Proven → make the smallest targeted fix and verify (run the reproduction or a
   focused test). Publish a verification report and wait for the user to click
   「已修复」. Do not remove probes, stop ingest jobs, or delete logs yet.
4. Not proven, or another runtime verification is needed → run
   \`new_debug_session.py\` again, start its new ingest command, update the probes
   to that new session id/URL, and submit a new handoff. Every reproduction
   round MUST use a new logPath; retain every earlier round log until Fixed.

## Fixed (「已修复」)

1. Remove every temporary probe: \`CODEX_DEBUG\` / \`__codexDebug\` markers,
   helper imports, and temporary log writes.
2. Stop every ingest job created by the rounds and delete their temporary logs
   (the \`.codex-debug/\` directory).
3. Confirm cleanup is complete; report the confirmed root cause, decisive
   evidence, files changed, and verification results.

## Probe contract

Each log line is one JSON object:

\`\`\`json
{ "sessionId": "a1b2c3", "runId": "pre-fix", "hypothesisId": "H1",
  "location": "File.ts:functionName", "message": "short observation",
  "data": { "branchTaken": true, "itemCount": 3 }, "timestamp": 1775543428486 }
\`\`\`

- \`runId\`: \`pre-fix\` / \`post-fix\` / \`repro-1\` / \`repro-2\`.
- \`hypothesisId\`: one of 2-5 lightweight labels (e.g. \`H1 stale cache\`).
- Log only the minimal data needed to prove or falsify a hypothesis. Never dump
  secrets, tokens, credentials, PII, or huge arrays — sample, count, hash, or
  truncate. Gate high-volume probes behind counts, sampling, or branch checks.

Browser/Electron probe (required transport: fetch to the running ingest server):

Use the inline replacer below so BigInt values become decimal strings.

\`\`\`js
function __codexDebug(event) {
  const payload = { sessionId: "<session-id>", runId: "pre-fix", timestamp: Date.now(), ...event };
  void fetch("http://127.0.0.1:8765/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value),
  }).then((response) => {
    if (!response.ok) console.error("CODEX_DEBUG_INGEST_FAILED", response.status);
  }, (error) => { console.error("CODEX_DEBUG_INGEST_FAILED", String(error)); });
}
\`\`\`

Browser/Electron probes must use the URL printed by the packaged session
helper. Never insert a console-only probe when the ingest server can run.
\`console.error\` above reports transport failure only; console output is not
accepted as collected evidence. If the server cannot start, stop and report
that exact blocker instead of silently switching to console logging.

Node probe (append JSONL directly):

\`\`\`js
import fs from "node:fs";
import path from "node:path";
const CODEX_DEBUG_SESSION = "<session-id>";
const CODEX_DEBUG_LOG = path.resolve(".codex-debug", \`debug-\${CODEX_DEBUG_SESSION}.jsonl\`);
function __codexDebug(event) {
  fs.mkdirSync(path.dirname(CODEX_DEBUG_LOG), { recursive: true });
  fs.appendFileSync(CODEX_DEBUG_LOG, JSON.stringify({
    sessionId: CODEX_DEBUG_SESSION, runId: "pre-fix", timestamp: Date.now(), ...event,
  }, (_key, value) => typeof value === "bigint" ? value.toString() : value) + "\\n");
}
\`\`\`

## Fallback boundary

The inline templates in this skill are fallback mechanics, not permission to
  reimplement packaged helpers during an ordinary run.`,
}

/**
 * Bind the runtime skill to this installed plugin's scripts directory.
 * @param scriptsDirectory - absolute directory resolved by the Host entry.
 * @returns registration carrying the directory resource base.
 */
export function debugModeSkill(scriptsDirectory: string): SkillRegistration {
  return {
    ...DEBUG_MODE_SKILL,
    resourceBase: { kind: 'directory', path: scriptsDirectory },
  }
}
