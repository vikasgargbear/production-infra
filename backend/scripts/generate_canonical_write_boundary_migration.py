#!/usr/bin/env python3
"""Package the reviewed canonical write functions into migration 0031."""

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCES = (
    ROOT / "database/canonical/operations/master/product_draft_commands.sql",
    ROOT / "database/canonical/operations/master/customer_address_commands.sql",
    ROOT / "database/canonical/operations/evidence/attachment_commands.sql",
)
TARGET = (
    ROOT
    / "backend/alembic/sql/20260827_0031_canonical_write_function_boundary.sql"
)


def render() -> str:
    sections = [
        "-- Generated from the reviewed database/canonical/operations sources.\n"
        "-- Existing Alembic migrations are immutable.\n\n"
        "SET LOCAL ROLE erp_migration_owner;"
    ]
    sections.extend(path.read_text(encoding="utf-8").strip() for path in SOURCES)
    sections.append(
        "REVOKE UPDATE ON TABLE catalog.products FROM erp_app,erp_runtime;\n"
        "REVOKE INSERT,UPDATE ON TABLE parties.addresses FROM erp_app,erp_runtime;\n"
        "REVOKE INSERT,UPDATE ON TABLE core.attachments FROM erp_app,erp_runtime;\n\n"
        "RESET ROLE;"
    )
    return "\n\n".join(sections) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-new",
        action="store_true",
        help="create migration 0031 once; refuses to overwrite existing history",
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
        raise SystemExit("canonical write-function migration is missing or drifted")
    print("canonical write-function migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
