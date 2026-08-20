#!/usr/bin/env python3
"""Create a Codex Debug Mode session id and copy-ready snippets."""

from __future__ import annotations

import argparse
import secrets
import shlex
import uuid
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Print commands and snippets for a debug session.")
    parser.add_argument("--session", default=None, help="Session id. Defaults to a random hex id.")
    parser.add_argument("--root", default=".", help="Repository root for log output.")
    parser.add_argument("--host", default="127.0.0.1", help="Debug ingest host.")
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="Debug ingest port. Use 0 with --cursor-compatible for Cursor-style auto allocation.",
    )
    parser.add_argument(
        "--cursor-compatible",
        action="store_true",
        help="Print Cursor-style NDJSON ingest commands and snippets.",
    )
    parser.add_argument(
        "--ingest-path-id",
        default=None,
        help="Cursor-style ingest path id. Defaults to a random UUID hex string.",
    )
    parser.add_argument(
        "--plugin-root",
        default=str(Path(__file__).resolve().parents[1]),
        help="Plugin root containing scripts/.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    session_id = args.session or secrets.token_hex(3)
    ingest_path_id = args.ingest_path_id or uuid.uuid4().hex
    plugin_root = Path(args.plugin_root).expanduser().resolve()
    root = Path(args.root).expanduser()
    log_path = root / ".codex-debug" / f"debug-{session_id}.jsonl"
    cursor_log_path = root / ".cursor" / f"debug-{session_id}.log"
    display_port = "<auto-port>" if args.cursor_compatible and args.port == 0 else str(args.port)
    ingest_url = f"http://{args.host}:{display_port}/log"
    cursor_ingest_url = f"http://{args.host}:{display_port}/ingest/{ingest_path_id}"

    print(f"sessionId={session_id}")
    print(f"logPath={log_path}")
    print(f"ingestUrl={ingest_url}")
    if args.cursor_compatible:
        print(f"cursorLogPath={cursor_log_path}")
        print(f"cursorIngestPathId={ingest_path_id}")
    print("turnBarrier=stop-after-probes-until-reproduced-logs")
    print()
    print("Evidence turn barrier:")
    print("- Start the ingest server as a background job before adding Browser/Electron probes.")
    print("- Browser/Electron probes must fetch to this server; console-only probes are invalid.")
    print("- After probes are installed, emit the exact <debug_reproduction_handoff> wrapper.")
    print("- Put probeLocations, reproductionAction, and logPath in its JSON; write no other text.")
    print("- Do not optimize, test, typecheck, clean up, or claim root cause until logs are collected.")
    print()
    print("Start ingest server with the shell tool's background option, then confirm it is ready:")
    command = [
        "python3",
        str(plugin_root / "scripts" / "debug_ingest_server.py"),
        "--root",
        str(root),
        "--session",
        session_id,
        "--host",
        args.host,
        "--port",
        str(args.port),
    ]
    if args.cursor_compatible:
        command.extend(["--cursor-compatible", "--ingest-path-id", ingest_path_id])
    print(" ".join(shlex.quote(part) for part in command))
    print()
    if args.cursor_compatible:
        print("Cursor-compatible Browser/Electron probe:")
        print(
            f"""function __codexDebug(event) {{
  const line = JSON.stringify({{
    sessionId: "{session_id}",
    runId: "pre-fix",
    timestamp: Date.now(),
    ...event,
  }}, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  void fetch("{cursor_ingest_url}", {{
    method: "POST",
    headers: {{
      "Content-Type": "application/x-ndjson",
      "X-Debug-Session-Id": "{session_id}",
    }},
    body: line + "\\n",
  }}).then((response) => {{
    if (!response.ok) console.error("CODEX_DEBUG_INGEST_FAILED", response.status);
  }}, (error) => {{
    console.error("CODEX_DEBUG_INGEST_FAILED", String(error));
  }});
}}"""
        )
        print()
        print("Cursor-compatible curl:")
        print(
            "curl -sS -X POST "
            "-H 'Content-Type: application/x-ndjson' "
            f"-H 'X-Debug-Session-Id: {session_id}' "
            f"--data-binary '{{\"hello\":\"world\"}}' {shlex.quote(cursor_ingest_url)}"
        )
        print()
    else:
        print("Browser/Electron probe:")
        print(
            f"""function __codexDebug(event) {{
  const payload = {{
    sessionId: "{session_id}",
    runId: "pre-fix",
    timestamp: Date.now(),
    ...event,
  }};
  void fetch("{ingest_url}", {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value),
  }}).then((response) => {{
    if (!response.ok) console.error("CODEX_DEBUG_INGEST_FAILED", response.status);
  }}, (error) => {{
    console.error("CODEX_DEBUG_INGEST_FAILED", String(error));
  }});
}}"""
        )
        print()
    print()
    print("Node probe:")
    print(
        f"""import fs from "node:fs";
import path from "node:path";

const CODEX_DEBUG_SESSION = "{session_id}";
const CODEX_DEBUG_LOG = path.resolve(".codex-debug", `debug-${{CODEX_DEBUG_SESSION}}.jsonl`);

function __codexDebug(event) {{
  fs.mkdirSync(path.dirname(CODEX_DEBUG_LOG), {{ recursive: true }});
  fs.appendFileSync(
    CODEX_DEBUG_LOG,
    JSON.stringify({{
      sessionId: CODEX_DEBUG_SESSION,
      runId: "pre-fix",
      timestamp: Date.now(),
      ...event,
    }}, (_key, value) => typeof value === "bigint" ? value.toString() : value) + "\\n",
  );
}}"""
    )
    print()
    print("Summarize:")
    summary_log_path = cursor_log_path if args.cursor_compatible else log_path
    print(
        "python3 "
        f"{shlex.quote(str(plugin_root / 'scripts' / 'summarize_debug_log.py'))} "
        f"{shlex.quote(str(summary_log_path))}"
    )


if __name__ == "__main__":
    main()
