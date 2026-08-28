#!/usr/bin/env python3
"""Validate backend SQL column references against canonical domain catalogs."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parent.parent
VALIDATOR_PATH = BACKEND_ROOT / "app/core/utils/schema_validator.py"
SPEC = importlib.util.spec_from_file_location("schema_validator", VALIDATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load schema validator at {VALIDATOR_PATH}")
schema_validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(schema_validator)


def scan_directory(directory: Path) -> list[dict[str, Any]]:
    results = []
    for path in directory.rglob("*.py"):
        if any(part in {"migrations", "__pycache__", "venv", ".venv"} for part in path.parts):
            continue
        if path.name.startswith("test_"):
            continue
        result = schema_validator.validate_module(path)
        if result.get("errors"):
            results.append(result)
    return results


def main() -> int:
    try:
        catalog = schema_validator.parse_schema_catalog(required=True)
    except (FileNotFoundError, ValueError, OSError) as exc:
        print(f"canonical schema audit: BLOCKED: {exc}", file=sys.stderr)
        return 2

    results = scan_directory(BACKEND_ROOT / "app")
    for result in results:
        print(result["file"])
        for error in result["errors"]:
            print(f"  line {error['line']} sha256:{error['query_sha256'][:12]}")
            for issue in error["issues"]:
                print(f"    {issue}")
    error_count = sum(len(result["errors"]) for result in results)
    if error_count:
        print(
            f"canonical schema audit: FAILED "
            f"({error_count} errors across {len(results)} files)",
            file=sys.stderr,
        )
        return 1
    print(f"canonical schema audit: OK ({len(catalog)} tables)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
