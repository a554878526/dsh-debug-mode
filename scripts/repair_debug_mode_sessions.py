#!/usr/bin/env python3
"""Mark legacy Debug Mode session events ignorable after backing up each log."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


EVENT_TYPE = "debug-mode/state"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Repair legacy DSH sessions containing required debug-mode/state events."
    )
    parser.add_argument(
        "--dsh-home",
        type=Path,
        default=Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser(),
        help="DSH home containing sessions/. Defaults to DSH_HOME or ~/.dsh.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write repaired logs. Without this flag the command is read-only.",
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=None,
        help="Backup root. Defaults to <dsh-home>/backups/debug-mode-state-<UTC timestamp>.",
    )
    return parser.parse_args()


def decompress(path: Path) -> bytes:
    result = subprocess.run(
        ["zstd", "-q", "-d", "-c", str(path)],
        check=True,
        capture_output=True,
    )
    return result.stdout


def repair_content(raw: bytes, source: Path) -> tuple[bytes, int]:
    repaired: list[bytes] = []
    changed = 0
    for line_number, line in enumerate(raw.splitlines(keepends=True), start=1):
        body = line.rstrip(b"\r\n")
        newline = line[len(body) :]
        if not body:
            repaired.append(line)
            continue
        try:
            event = json.loads(body)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"{source}:{line_number}: invalid JSON: {error}") from error
        if not isinstance(event, dict) or event.get("type") != EVENT_TYPE:
            repaired.append(line)
            continue
        marker = event.get("ignorable")
        if marker is True:
            repaired.append(line)
            continue
        if marker is not None:
            raise RuntimeError(
                f"{source}:{line_number}: ignorable must be true or absent, received {marker!r}"
            )
        event["ignorable"] = True
        repaired.append(
            json.dumps(event, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            + (newline or b"\n")
        )
        changed += 1
    return b"".join(repaired), changed


def replace_with_backup(path: Path, content: bytes, sessions_root: Path, backup_root: Path) -> None:
    backup = backup_root / path.relative_to(sessions_root.parent)
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, backup)

    first_newline = content.find(b"\n")
    if first_newline < 0:
        raise RuntimeError(f"{path}: session log has no complete header line")
    header = content[: first_newline + 1]
    body = content[first_newline + 1 :]
    if header.count(b"\n") != 1:
        raise RuntimeError(f"{path}: session header must be exactly one line")

    header_fd, header_name = tempfile.mkstemp(prefix=".debug-mode-header-", suffix=".jsonl", dir=path.parent)
    body_fd, body_name = tempfile.mkstemp(prefix=".debug-mode-body-", suffix=".jsonl", dir=path.parent)
    compressed_fd, compressed_name = tempfile.mkstemp(prefix=".debug-mode-repair-", suffix=".zstd", dir=path.parent)
    os.close(header_fd)
    os.close(body_fd)
    os.close(compressed_fd)
    compressed = Path(compressed_name)
    try:
        Path(header_name).write_bytes(header)
        Path(body_name).write_bytes(body)
        with compressed.open("wb") as output:
            subprocess.run(["zstd", "-q", "-T0", "-c", header_name], check=True, stdout=output)
            if body:
                subprocess.run(["zstd", "-q", "-T0", "-c", body_name], check=True, stdout=output)
            output.flush()
            os.fsync(output.fileno())
        shutil.copymode(path, compressed)
        os.replace(compressed, path)
    finally:
        Path(header_name).unlink(missing_ok=True)
        Path(body_name).unlink(missing_ok=True)
        compressed.unlink(missing_ok=True)


def main() -> None:
    args = parse_args()
    if shutil.which("zstd") is None:
        raise SystemExit("repair requires the zstd executable on PATH")
    dsh_home = args.dsh_home.expanduser().resolve()
    sessions_root = dsh_home / "sessions"
    if not sessions_root.is_dir():
        raise SystemExit(f"sessions directory does not exist: {sessions_root}")

    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_root = (
        args.backup_dir.expanduser().resolve()
        if args.backup_dir is not None
        else dsh_home / "backups" / f"debug-mode-state-{timestamp}"
    )
    affected: list[tuple[Path, bytes, int]] = []
    for path in sorted(sessions_root.rglob("session.jsonl.zstd")):
        content, changed = repair_content(decompress(path), path)
        if changed > 0:
            affected.append((path, content, changed))

    print(f"affectedSessions={len(affected)}")
    print(f"affectedEvents={sum(item[2] for item in affected)}")
    if not args.apply:
        print("mode=dry-run")
        return

    backup_root.mkdir(parents=True, exist_ok=False)
    for path, content, _changed in affected:
        replace_with_backup(path, content, sessions_root, backup_root)
    print("mode=applied")
    print(f"backupDir={backup_root}")


if __name__ == "__main__":
    main()
