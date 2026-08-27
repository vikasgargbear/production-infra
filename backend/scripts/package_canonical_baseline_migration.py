#!/usr/bin/env python3
"""Generate or verify the hash-bound canonical Alembic baseline package."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Sequence


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from migration_support import canonical_baseline as package  # noqa: E402


GENERATOR_PATH = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
ENFORCEMENT_ROOT = REPO_ROOT / "database" / "canonical"


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_source() -> str:
    """Return the immutable bootstrap package, never mutable current catalogs."""

    source = package.BASELINE_SQL_PATH.read_text(encoding="utf-8")
    package.unwrap_generator_transaction(source)
    return source


def render_manifest(source: str) -> str:
    body = package.unwrap_generator_transaction(source)
    value = {
        "format_version": 1,
        "revision": package.REVISION,
        "generator_command": package.GENERATOR_COMMAND,
        "source_sql_sha256": _digest(source),
        "alembic_body_sha256": _digest(body),
        "transaction_wrapper": "generator_outer_pair_removed_by_alembic_runner_v1",
    }
    return json.dumps(value, indent=2, sort_keys=True) + "\n"


def verify_package_only() -> str:
    _, manifest = package.load_packaged_baseline()
    return manifest["source_sql_sha256"]


def check_or_write(*, write: bool) -> str:
    source = generate_source()
    manifest = render_manifest(source)
    expected = (
        (package.BASELINE_SQL_PATH, source),
        (package.BASELINE_MANIFEST_PATH, manifest),
    )
    drift = []
    for path, content in expected:
        current = path.read_text(encoding="utf-8") if path.is_file() else None
        if current == content:
            continue
        if write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        else:
            drift.append(path.relative_to(REPO_ROOT).as_posix())
    if drift:
        raise package.CanonicalBaselineError(
            "canonical Alembic package is stale: " + ", ".join(drift)
        )
    return _digest(source)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--write", action="store_true")
    modes.add_argument(
        "--verify-package",
        action="store_true",
        help="verify checked package hashes without requiring the repository catalog",
    )
    modes.add_argument("--print-sha256", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.verify_package:
            digest = verify_package_only()
        else:
            digest = check_or_write(write=args.write)
        if args.print_sha256:
            print(digest)
        else:
            state = "regenerated" if args.write else "verified"
            print(f"canonical Alembic baseline: {state} ({digest})")
        return 0
    except package.CanonicalBaselineError as exc:
        print(f"canonical Alembic baseline refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
