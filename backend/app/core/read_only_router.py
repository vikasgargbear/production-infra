"""Fail-closed mounting helpers for retired legacy API routers.

Canonical business mutations are exposed through the reviewed operator-command
boundary.  During the read migration, some legacy GET endpoints still have
consumers.  These helpers make that temporary exception explicit without
mounting the legacy router's POST/PUT/PATCH/DELETE handlers.
"""

from __future__ import annotations

from collections.abc import Iterable

from fastapi import APIRouter
from fastapi.routing import APIRoute


READ_ONLY_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _selected_router(
    source: APIRouter,
    *,
    allowed_methods: frozenset[str],
    allowed_paths: frozenset[str] | None = None,
) -> APIRouter:
    selected = APIRouter()
    for route in source.routes:
        if not isinstance(route, APIRoute):
            continue
        methods = frozenset(route.methods or ())
        if not methods or not methods <= allowed_methods:
            continue
        if allowed_paths is not None and route.path not in allowed_paths:
            continue
        selected.routes.append(route)
    return selected


def include_legacy_read_only_router(
    parent: APIRouter,
    source: APIRouter,
    *,
    prefix: str = "",
    tags: Iterable[str] | None = None,
) -> None:
    """Mount only pure HTTP read routes from a legacy router."""

    parent.include_router(
        _selected_router(source, allowed_methods=READ_ONLY_METHODS),
        prefix=prefix,
        tags=list(tags or ()),
    )


def include_explicit_safe_post_utilities(
    parent: APIRouter,
    source: APIRouter,
    *,
    paths: Iterable[str],
    prefix: str = "",
    tags: Iterable[str] | None = None,
) -> None:
    """Mount an exact allowlist of side-effect-free POST utility routes.

    This is deliberately path-exact and POST-only.  Missing paths fail startup
    so a renamed parser/calculator cannot silently broaden the exception.
    """

    expected = frozenset(paths)
    selected = _selected_router(
        source,
        allowed_methods=frozenset({"POST"}),
        allowed_paths=expected,
    )
    mounted = frozenset(
        route.path for route in selected.routes if isinstance(route, APIRoute)
    )
    if mounted != expected:
        raise RuntimeError(
            "Safe POST utility allowlist does not match router paths: "
            f"missing={sorted(expected - mounted)}, unexpected={sorted(mounted - expected)}"
        )
    parent.include_router(selected, prefix=prefix, tags=list(tags or ()))
