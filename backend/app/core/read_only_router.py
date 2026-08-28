"""Fail-closed mounting helpers for retired legacy API routers.

Canonical business mutations are exposed through the reviewed operator-command
boundary.  During the read migration, some legacy GET endpoints still have
consumers.  These helpers make that temporary exception explicit without
mounting the legacy router's POST/PUT/PATCH/DELETE handlers.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from typing import Any

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


def include_explicit_non_persistent_post_utilities(
    parent: APIRouter,
    source: APIRouter,
    *,
    routes: Mapping[str, Callable[..., Any]],
    prefix: str = "",
    tags: Iterable[str] | None = None,
) -> None:
    """Mount exact, owner-pinned POST previews/parsers with no durable effects.

    POST is appropriate for bounded calculation payloads and uploads even when
    they do not mutate business state.  The exception is deliberately exact in
    method, path *and endpoint identity*.  A renamed route or a different
    handler at an allowlisted path therefore fails startup instead of silently
    inheriting the exception.

    "Non-persistent" means no database mutation, external communication, queue,
    cache, or retained local state.  A parser may use a bounded temporary file
    only when its handler owns unconditional cleanup; that implementation is
    covered separately by boundary tests.
    """

    expected = frozenset(routes)
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
            "Non-persistent POST utility allowlist does not match router paths: "
            f"missing={sorted(expected - mounted)}, unexpected={sorted(mounted - expected)}"
        )
    owner_mismatches = []
    for route in selected.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.endpoint is not routes[route.path]:
            owner_mismatches.append(
                (
                    route.path,
                    f"{route.endpoint.__module__}.{route.endpoint.__name__}",
                    f"{routes[route.path].__module__}.{routes[route.path].__name__}",
                )
            )
    if owner_mismatches:
        raise RuntimeError(
            "Non-persistent POST utility endpoint owner mismatch: "
            f"{owner_mismatches}"
        )
    parent.include_router(selected, prefix=prefix, tags=list(tags or ()))
