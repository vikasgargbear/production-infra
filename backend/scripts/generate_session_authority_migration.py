#!/usr/bin/env python3
"""Package canonical session authority into immutable migration 0032."""

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "database/canonical/session_authority/session_authority.sql"
TARGET = ROOT / "backend/alembic/sql/20260827_0032_session_authority.sql"


def render() -> str:
    return SOURCE.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-new",
        action="store_true",
        help="create migration 0032 once; refuses to overwrite existing history",
    )
    args = parser.parse_args()
    expected = render()
    if args.write_new:
        if TARGET.exists():
            raise SystemExit(f"refusing to overwrite immutable migration: {TARGET}")
        TARGET.write_text(expected, encoding="utf-8")
        print(f"created {TARGET.relative_to(ROOT)}")
        return 0
    if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != expected:
        raise SystemExit("session-authority migration is missing or drifted")
    print("session-authority migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
