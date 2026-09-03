# dsh-debug-mode

English | [中文](README.zh.md)

Runtime evidence for AI debugging in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Instead of asking an agent to guess from source code or asking you to copy browser and server logs into chat, Debug Mode installs surgical probes and captures their events as structured JSONL. The agent can then prove the failing branch, make a focused fix, verify it, and remove every temporary probe.

**One command. One evidence loop. No log hunting.**

![Select Debug Mode from the command menu](docs/images/debug-command.png)

![Debug Mode keeps reproduction, analysis, and cleanup controls beside the composer](docs/images/debug-mode-dock.png)

## Why use it?

| Ordinary debugging | Debug Mode |
| --- | --- |
| Browser console and server logs live in separate places | Browser, Electron, and Node evidence lands in one JSONL stream |
| Large unstructured logs bury the relevant branch | 1–3 probes record only hypothesis-relevant fields |
| The agent reasons from a pasted snapshot | The agent reads fresh runtime evidence after each reproduction |
| Temporary logging is easy to forget | The **Fixed** action triggers probe, process, and log cleanup |

Debug Mode is especially useful for UI state, worker boundaries, async races, serialization failures, and bugs that cannot be proven by static code inspection alone.

## Install

Requires Node.js `^22.19.0 || >=24.0.0`, pnpm on `PATH`, and DSH `0.1.0-rc.7` or later.

```sh
dsh plugin --profile web add "github:a554878526/dsh-debug-mode#main"
```

Restart `dsh web`, open a new task, then:

1. Run `/debug` and describe the bug.
2. Follow the reproduction instruction and click **Continue**.
3. Review the verified fix, then click **Fixed** to clean up diagnostics.

Remove the plugin with:

```sh
dsh plugin --profile web remove dsh-debug-mode
```

## Structured JSONL evidence

Each line is an independent event, so logs remain streamable, grep-friendly, and easy for an agent to summarize:

```json
{"sessionId":"a1b2c3","runId":"pre-fix","hypothesisId":"H1","location":"SessionStore.ts:restore","message":"cache lookup","data":{"hit":true,"entryCount":3,"timestampNs":"1775543428486123456"},"timestamp":1775543428486}
```

Use stable fields:

- `sessionId` ties events to one debug round.
- `runId` distinguishes `pre-fix`, `post-fix`, or repeated reproductions.
- `hypothesisId` connects an event to the assumption it proves or rejects.
- `location` names the runtime boundary, not just the file.
- `data` contains the smallest safe payload needed for the decision.
- `timestamp` is epoch milliseconds; large integer IDs belong in strings.

Never log secrets, credentials, PII, or full high-volume payloads. Count, sample, hash, or truncate instead.

### Generate a session and probe

The bundled helper prints a session ID, log path, ingest command, and copy-ready Browser/Electron and Node probes:

```sh
python3 scripts/new_debug_session.py --root .
```

Start the printed ingest command before using a browser probe. A minimal event is:

```js
__codexDebug({
  hypothesisId: "H1",
  location: "SessionStore.ts:restore",
  message: "cache lookup",
  data: { hit: cache.has(key), entryCount: cache.size },
});
```

The generated probe sends Browser/Electron events to the local ingest server with `fetch`; Node probes append JSONL directly. Its `JSON.stringify` replacer converts `bigint` values to decimal strings, avoiding serialization errors and precision loss.

After reproduction, summarize the evidence with:

```sh
python3 scripts/summarize_debug_log.py .codex-debug/debug-<session>.jsonl
```

In normal use the agent runs these helpers for you. They are documented here for custom instrumentation and CI workflows.

## How the loop works

`/debug` activates a Host-enforced runtime phase and opens the composer dock. The agent must create a fresh session, start a working log transport, and add marked probes before asking for reproduction. **Continue** is disabled until that handoff succeeds.

After evidence arrives, the agent either applies the smallest supported fix or starts a new evidence round with a new log path. It cannot silently replace evidence collection with a console-only probe, broad static analysis, or an early fix. **Fixed** ends enforcement and asks the agent to remove all `CODEX_DEBUG` / `__codexDebug` instrumentation, ingest jobs, and `.codex-debug/` logs.

Four helpers ship with the plugin:

- `new_debug_session.py` creates a session and ready-to-use probes.
- `debug_ingest_server.py` collects Browser/Electron JSON events.
- `summarize_debug_log.py` condenses JSONL evidence.
- `find_instrumentation.py` verifies cleanup.

## Develop

```sh
pnpm install
pnpm run check
dsh plugin --profile web add .
```

Restart the profile and open a new task after reinstalling so DSH loads the updated Host and client bundles.

## Compatibility note

Versions `0.1.1` and earlier wrote a `debug-mode/state` event that official DSH builds cannot reopen. Stop `dsh web`, inspect affected logs, then apply the repair with automatic backups:

```sh
python3 scripts/repair_debug_mode_sessions.py
python3 scripts/repair_debug_mode_sessions.py --apply
```

Current Debug Mode state is process-local: restarting the Host, refreshing the page, or reopening a task ends the active loop. Run `/debug` again to start a new session.
