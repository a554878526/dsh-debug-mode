#!/usr/bin/env python3
"""Summarize Codex Debug Mode JSONL logs."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize one or more debug JSONL files.")
    parser.add_argument("logs", nargs="+", help="JSONL log paths.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    parser.add_argument("--examples", type=int, default=8, help="Number of latest examples to print.")
    return parser.parse_args()


def load_events(paths: list[str]) -> tuple[list[dict[str, Any]], int]:
    events: list[dict[str, Any]] = []
    invalid = 0
    for raw_path in paths:
        path = Path(raw_path).expanduser()
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    invalid += 1
                    continue
                if isinstance(payload, dict):
                    payload.setdefault("_source", str(path))
                    events.append(payload)
                else:
                    invalid += 1
    return events, invalid


def count_by(events: list[dict[str, Any]], key: str) -> Counter[str]:
    return Counter(str(event.get(key, "<missing>")) for event in events)


def summarize(events: list[dict[str, Any]], invalid: int) -> dict[str, Any]:
    timestamps = [event.get("timestamp") for event in events if isinstance(event.get("timestamp"), int)]
    return {
        "totalEvents": len(events),
        "invalidLines": invalid,
        "timeRange": {
            "first": min(timestamps) if timestamps else None,
            "last": max(timestamps) if timestamps else None,
        },
        "bySession": dict(count_by(events, "sessionId").most_common()),
        "byRun": dict(count_by(events, "runId").most_common()),
        "byHypothesis": dict(count_by(events, "hypothesisId").most_common()),
        "byLocation": dict(count_by(events, "location").most_common(20)),
        "byMessage": dict(count_by(events, "message").most_common(20)),
    }


def compact_event(event: dict[str, Any]) -> dict[str, Any]:
    keys = ("timestamp", "sessionId", "runId", "hypothesisId", "location", "message", "data")
    return {key: event.get(key) for key in keys if key in event}


def print_counter(title: str, values: dict[str, int]) -> None:
    print(f"\n{title}")
    if not values:
        print("  <none>")
        return
    for key, value in values.items():
        print(f"  {value:>5}  {key}")


def print_text(summary: dict[str, Any], events: list[dict[str, Any]], examples: int) -> None:
    print(f"Total events: {summary['totalEvents']}")
    print(f"Invalid lines: {summary['invalidLines']}")
    first = summary["timeRange"]["first"]
    last = summary["timeRange"]["last"]
    print(f"Timestamp range: {first} -> {last}")
    print_counter("By session", summary["bySession"])
    print_counter("By run", summary["byRun"])
    print_counter("By hypothesis", summary["byHypothesis"])
    print_counter("Top locations", summary["byLocation"])
    print_counter("Top messages", summary["byMessage"])

    latest = sorted(
        events,
        key=lambda event: event.get("timestamp") if isinstance(event.get("timestamp"), int) else -1,
    )[-examples:]
    print("\nLatest events")
    if not latest:
        print("  <none>")
        return
    for event in latest:
        print(json.dumps(compact_event(event), ensure_ascii=False, separators=(",", ":")))


def main() -> None:
    args = parse_args()
    events, invalid = load_events(args.logs)
    summary = summarize(events, invalid)
    if args.json:
        print(json.dumps({"summary": summary, "events": events}, ensure_ascii=False, indent=2))
    else:
        print_text(summary, events, args.examples)


if __name__ == "__main__":
    main()
