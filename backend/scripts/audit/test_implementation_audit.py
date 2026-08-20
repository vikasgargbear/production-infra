#!/usr/bin/env python3
"""Fail when critical-path tests are missing or contain placeholder bodies."""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path
from typing import Iterable, List


ROOT = Path(__file__).resolve().parents[3]
CRITICAL_TEST_ROOTS = (
    ROOT / "backend/tests/api",
    ROOT / "backend/tests/live_erp",
)
PLACEHOLDER_PATTERN = re.compile(
    r"#\s*Implementation\b|simplified\s*-\s*actual\b|Actual\s+.+\s+would\b|"
    r"(?:TODO|FIXME):?\s*(?:implement|replace).*(?:test|assert)",
    re.IGNORECASE,
)


def _is_docstring(node: ast.stmt) -> bool:
    return (
        isinstance(node, ast.Expr)
        and isinstance(node.value, ast.Constant)
        and isinstance(node.value.value, str)
    )


def _has_placeholder_body(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    body = [statement for statement in node.body if not _is_docstring(statement)]
    return not body or all(isinstance(statement, ast.Pass) for statement in body)


def audit_paths(paths: Iterable[Path]) -> List[str]:
    issues: List[str] = []
    for root in paths:
        if not root.is_dir():
            issues.append(f"missing critical test directory: {root}")
            continue

        files = sorted(root.rglob("test_*.py"))
        if not files:
            issues.append(f"no critical tests found under: {root}")
            continue

        for path in files:
            source = path.read_text(encoding="utf-8")
            for match in PLACEHOLDER_PATTERN.finditer(source):
                line = source.count("\n", 0, match.start()) + 1
                issues.append(f"{path}:{line}: placeholder test marker")

            try:
                tree = ast.parse(source, filename=str(path))
            except SyntaxError as exc:
                issues.append(f"{path}:{exc.lineno or 1}: test file does not parse")
                continue

            for node in ast.walk(tree):
                if (
                    isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and node.name.startswith("test_")
                    and _has_placeholder_body(node)
                ):
                    issues.append(
                        f"{path}:{node.lineno}: {node.name} has only a placeholder body"
                    )
    return issues


def main() -> int:
    issues = audit_paths(CRITICAL_TEST_ROOTS)
    if issues:
        print("Critical-path test implementation audit: BLOCKED")
        for issue in issues:
            print(f"[blocker] {issue}")
        return 1
    print("Critical-path test implementation audit: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
