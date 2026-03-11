#!/usr/bin/env python3
"""
export_events.py
Re-exports events from an existing processed score JSON,
optionally adjusting timing by a constant offset (seconds).

Usage:
  python export_events.py [offset_seconds]
  e.g.: python export_events.py 2.5   (delay all events by 2.5s)
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT = PROJECT_ROOT / "data" / "processed" / "suite1_prelude.json"
OUTPUT = PROJECT_ROOT / "app" / "public" / "data" / "processed" / "suite1_prelude.json"


def main():
    offset = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0

    if not INPUT.exists():
        print(f"ERROR: {INPUT} not found. Run parse_scores.py first.", file=sys.stderr)
        sys.exit(1)

    with open(INPUT, "r", encoding="utf-8") as f:
        data = json.load(f)

    if offset != 0.0:
        for ev in data["events"]:
            ev["onset_s"] = round(ev["onset_s"] + offset, 4)
        print(f"Applied offset: {offset:+.2f}s to {len(data['events'])} events")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Written: {OUTPUT}")


if __name__ == "__main__":
    main()
