#!/usr/bin/env python3
"""Tiny local JSONL ingest server for Codex Debug Mode."""

from __future__ import annotations

import argparse
import json
import re
import secrets
import signal
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


DEFAULT_AUTO_PORT_START = 7242
DEFAULT_AUTO_PORT_END = 7942
SESSION_ID_RE = re.compile(r"^[A-Za-z0-9-]+$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Write debug events from HTTP POSTs to JSONL.")
    parser.add_argument("--root", default=".", help="Repository root for .codex-debug output.")
    parser.add_argument("--session", default=None, help="Session id. Defaults to a random hex id.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host.")
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help=(
            "Bind port. Set to 0 with --cursor-compatible to auto-allocate in "
            f"{DEFAULT_AUTO_PORT_START}-{DEFAULT_AUTO_PORT_END}."
        ),
    )
    parser.add_argument("--log-path", default=None, help="Explicit JSONL output path.")
    parser.add_argument(
        "--cursor-compatible",
        action="store_true",
        help=(
            "Also expose Cursor-style NDJSON ingest at /ingest/<id>, requiring "
            "X-Debug-Session-Id and writing to <root>/.cursor/debug-<session>.log."
        ),
    )
    parser.add_argument(
        "--ingest-path-id",
        default=None,
        help="Cursor-compatible ingest path id. Defaults to a random UUID hex string.",
    )
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=1_000_000,
        help="Maximum POST body size in bytes.",
    )
    parser.add_argument(
        "--idle-timeout",
        type=float,
        default=0,
        help="Stop after this many seconds without requests. 0 disables idle shutdown.",
    )
    return parser.parse_args()


def is_port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def choose_auto_port(host: str) -> int:
    span = DEFAULT_AUTO_PORT_END - DEFAULT_AUTO_PORT_START + 1
    offset = secrets.randbelow(span)
    for index in range(span):
        port = DEFAULT_AUTO_PORT_START + ((offset + index) % span)
        if is_port_available(host, port):
            return port
    raise RuntimeError(
        f"No available ports in {DEFAULT_AUTO_PORT_START}-{DEFAULT_AUTO_PORT_END} for {host}"
    )


def normalize_event(raw: Any, session_id: str) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {"message": "non-object debug event", "data": raw}
    event = dict(raw)
    event.setdefault("sessionId", session_id)
    event.setdefault("timestamp", int(time.time() * 1000))
    return event


def write_event(log_path: Path, event: dict[str, Any]) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")))
        handle.write("\n")


def cursor_log_path(root: Path, session_id: str) -> Path:
    return root / ".cursor" / f"debug-{session_id}.log"


def append_raw_ndjson(log_path: Path, body: bytes) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("ab") as handle:
        handle.write(body)
        if body and body[-1:] != b"\n":
            handle.write(b"\n")


def build_handler(
    root: Path,
    log_path: Path,
    session_id: str,
    max_bytes: int,
    *,
    cursor_compatible: bool,
    ingest_path_id: str,
    touch: "Any",
) -> type[BaseHTTPRequestHandler]:
    class DebugIngestHandler(BaseHTTPRequestHandler):
        server_version = "CodexDebugIngest/0.1"

        def log_message(self, fmt: str, *args: Any) -> None:
            sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

        def end_headers(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            super().end_headers()

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.end_headers()

        def do_GET(self) -> None:
            if self.path not in ("/", "/health"):
                self.send_error(404)
                return
            touch()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = {
                "ok": True,
                "sessionId": session_id,
                "logPath": str(log_path),
                "cursorCompatible": cursor_compatible,
                "cursorIngestUrl": (
                    f"http://{self.server.server_address[0]}:{self.server.server_address[1]}"
                    f"/ingest/{ingest_path_id}"
                    if cursor_compatible
                    else None
                ),
                "cursorLogPath": str(cursor_log_path(root, session_id)) if cursor_compatible else None,
            }
            self.wfile.write(json.dumps(payload).encode("utf-8"))

        def do_POST(self) -> None:
            touch()
            if cursor_compatible and self.path == f"/ingest/{ingest_path_id}":
                self.do_cursor_ingest()
                return

            if self.path not in ("/log", "/debug/log"):
                self.send_error(404)
                return

            length = int(self.headers.get("Content-Length", "0") or "0")
            if length > max_bytes:
                self.send_error(413, f"debug event payload exceeds {max_bytes} bytes")
                return

            body = self.rfile.read(length)

            try:
                payload = json.loads(body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self.send_error(400, "body must be JSON")
                return

            events = payload if isinstance(payload, list) else [payload]
            for raw_event in events:
                write_event(log_path, normalize_event(raw_event, session_id))

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {"ok": True, "count": len(events), "logPath": str(log_path)}
            self.wfile.write(json.dumps(response).encode("utf-8"))

        def do_cursor_ingest(self) -> None:
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length > max_bytes:
                self.send_error(413, f"debug event payload exceeds {max_bytes} bytes")
                return

            raw_session = self.headers.get("X-Debug-Session-Id")
            if raw_session is None:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"missing-session-id")
                return
            if not SESSION_ID_RE.fullmatch(raw_session):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"invalid-session-id")
                return

            body = self.rfile.read(length)
            append_raw_ndjson(cursor_log_path(root, raw_session), body)
            self.send_response(204)
            self.end_headers()

    return DebugIngestHandler


def main() -> None:
    args = parse_args()
    session_id = args.session or secrets.token_hex(3)
    ingest_path_id = args.ingest_path_id or secrets.token_hex(16)
    root = Path(args.root).expanduser().resolve()
    log_path = (
        Path(args.log_path).expanduser().resolve()
        if args.log_path
        else root / ".codex-debug" / f"debug-{session_id}.jsonl"
    )
    port = choose_auto_port(args.host) if args.cursor_compatible and args.port == 0 else args.port

    last_request_at = time.monotonic()

    def touch() -> None:
        nonlocal last_request_at
        last_request_at = time.monotonic()

    handler = build_handler(
        root,
        log_path,
        session_id,
        args.max_bytes,
        cursor_compatible=args.cursor_compatible,
        ingest_path_id=ingest_path_id,
        touch=touch,
    )
    server = ThreadingHTTPServer((args.host, port), handler)

    def shutdown(_signum: int, _frame: Any) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    def idle_watchdog() -> None:
        while True:
            time.sleep(min(args.idle_timeout, 5))
            if args.idle_timeout <= 0:
                return
            if time.monotonic() - last_request_at >= args.idle_timeout:
                print("\nStopping debug ingest server after idle timeout", file=sys.stderr)
                server.shutdown()
                return

    if args.idle_timeout > 0:
        threading.Thread(target=idle_watchdog, daemon=True).start()

    print(f"Codex Debug Mode ingest server listening on http://{args.host}:{port}", flush=True)
    print(f"sessionId={session_id}", flush=True)
    print(f"logPath={log_path}", flush=True)
    if args.cursor_compatible:
        print(
            f"cursorIngestUrl=http://{args.host}:{port}/ingest/{ingest_path_id}",
            flush=True,
        )
        print(f"cursorLogPath={cursor_log_path(root, session_id)}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping debug ingest server", file=sys.stderr)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
