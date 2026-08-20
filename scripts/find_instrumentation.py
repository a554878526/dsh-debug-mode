#!/usr/bin/env python3
"""Find likely temporary Codex Debug Mode instrumentation."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


DEFAULT_PATTERNS = (
    "CODEX_DEBUG",
    "__codexDebug",
    "codexDebug",
    ".codex-debug",
    "hypothesisId",
)

SKIP_DIRS = {
    ".codex-debug",
    ".git",
    ".hg",
    ".svn",
    ".yarn",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
}

BINARY_SUFFIXES = {
    ".a",
    ".bin",
    ".dylib",
    ".gif",
    ".ico",
    ".jpg",
    ".jpeg",
    ".pdf",
    ".png",
    ".so",
    ".wasm",
    ".webp",
    ".zip",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan for temporary debug instrumentation.")
    parser.add_argument("root", nargs="?", default=".", help="Repository root.")
    parser.add_argument("--json", action="store_true", help="Emit JSON.")
    parser.add_argument("--pattern", action="append", default=[], help="Additional marker pattern.")
    return parser.parse_args()


def should_skip(path: Path) -> bool:
    return path.suffix.lower() in BINARY_SUFFIXES


def scan(root: Path, patterns: tuple[str, ...]) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIRS and not name.startswith(".cache")]
        current = Path(dirpath)
        for filename in filenames:
            path = current / filename
            if should_skip(path):
                continue
            try:
                with path.open(encoding="utf-8") as handle:
                    for line_number, line in enumerate(handle, start=1):
                        if any(pattern in line for pattern in patterns):
                            results.append(
                                {
                                    "path": str(path.relative_to(root)),
                                    "line": line_number,
                                    "text": line.strip(),
                                }
                            )
            except (OSError, UnicodeDecodeError):
                continue
    return results


def main() -> None:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    patterns = tuple(dict.fromkeys((*DEFAULT_PATTERNS, *args.pattern)))
    results = scan(root, patterns)
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return
    if not results:
        print("No likely Codex Debug Mode instrumentation found.")
        return
    for result in results:
        print(f"{result['path']}:{result['line']}: {result['text']}")


if __name__ == "__main__":
    main()
