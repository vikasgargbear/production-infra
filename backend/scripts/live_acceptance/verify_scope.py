#!/usr/bin/env python3
"""Fail when the live18 branch changes files owned by another workstream."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from tests.live_acceptance.scope import out_of_scope_paths  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="Exact base commit used for the worktree")
    args = parser.parse_args()
    changed = subprocess.run(
        ["git", "diff", "--name-only", f"{args.base}...HEAD"],
        cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.splitlines()
    changed.extend(subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.splitlines())
    changed = sorted(set(changed))
    violations = out_of_scope_paths(changed)
    if violations:
        print("live18 branch changed files outside its ownership boundary:", file=sys.stderr)
        print("\n".join(violations), file=sys.stderr)
        return 1
    print(f"live18 ownership gate passed for {len(changed)} changed files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
