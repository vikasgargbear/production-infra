#!/usr/bin/env python3
"""Emit fixed GitHub annotation metadata for a potentially sensitive CI log."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import BinaryIO


_ANNOTATION_TITLES = {
    "fixture": "Live canonical fixture failed",
    "readiness": "Canonical CI API failed readiness",
    "render": "Render reconciliation blocked",
    "reset": "Disposable canonical reset failed",
    "runtime": "Canonical CI API runtime diagnostic",
}
_CHUNK_SIZE = 1024 * 1024


def fingerprint_stream(stream: BinaryIO) -> dict[str, int | str]:
    digest = hashlib.sha256()
    byte_count = 0
    while True:
        chunk = stream.read(_CHUNK_SIZE)
        if not chunk:
            break
        digest.update(chunk)
        byte_count += len(chunk)
    return {"byte_count": byte_count, "sha256": digest.hexdigest()}


def safe_log_annotation(path: Path, *, label: str) -> str:
    title = _ANNOTATION_TITLES[label]
    with path.open("rb") as stream:
        summary = fingerprint_stream(stream)
    return (
        f"::error title={title}::"
        + json.dumps(summary, sort_keys=True, separators=(",", ":"))
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True, choices=sorted(_ANNOTATION_TITLES))
    parser.add_argument("log_path", type=Path)
    args = parser.parse_args()
    print(safe_log_annotation(args.log_path, label=args.label))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
