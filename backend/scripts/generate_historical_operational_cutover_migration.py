#!/usr/bin/env python3
"""Package the reviewed historical operational cutover for Alembic."""

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = (
    ROOT
    / "backend/alembic/source_snapshots/20260830_0067_historical_operational_cutover.sql"
)
TARGET = ROOT / "backend/alembic/sql/20260830_0067_historical_operational_cutover.sql"


def render() -> str:
    source = SOURCE.read_text(encoding="utf-8").rstrip()
    return f"SET LOCAL ROLE erp_migration_owner;\n\n{source}\n\nRESET ROLE;\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    rendered = render()
    if args.write:
        TARGET.write_text(rendered, encoding="utf-8")
        return 0
    if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != rendered:
        raise SystemExit("historical operational cutover migration drifted; run with --write")
    print("historical operational cutover migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
