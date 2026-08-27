#!/usr/bin/env python3
"""Verify the immutable, hash-bound canonical Alembic baseline package."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from migration_support import canonical_baseline as package  # noqa: E402


def verify_package_only() -> str:
    _, manifest = package.load_packaged_baseline()
    return manifest["source_sql_sha256"]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--write",
        action="store_true",
        help="refused: deployed Alembic history is immutable",
    )
    modes.add_argument(
        "--verify-package",
        action="store_true",
        help="verify checked package hashes without requiring the repository catalog",
    )
    modes.add_argument("--print-sha256", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.write:
            raise package.CanonicalBaselineError(
                "revision 20260820_0001 is immutable; add a new hash-bound revision"
            )
        digest = verify_package_only()
        if args.print_sha256:
            print(digest)
        else:
            print(f"canonical Alembic baseline: verified ({digest})")
        return 0
    except package.CanonicalBaselineError as exc:
        print(f"canonical Alembic baseline refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
