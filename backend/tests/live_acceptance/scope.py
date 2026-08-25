"""Changed-file ownership gate for the isolated live18 branch."""

from __future__ import annotations

from collections.abc import Iterable


OWNED_PREFIXES = (
    "backend/scripts/live_acceptance/",
    "backend/tests/live_acceptance/",
    "docs/testing/canonical-live18-acceptance.md",
    "frontend/e2e/live18/",
    "frontend/e2e/support/live18/",
)


def out_of_scope_paths(paths: Iterable[str]) -> tuple[str, ...]:
    return tuple(sorted(
        path for path in paths
        if not any(path == prefix or path.startswith(prefix) for prefix in OWNED_PREFIXES)
    ))
