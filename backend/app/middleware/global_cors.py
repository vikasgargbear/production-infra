"""CORS coverage for the complete FastAPI error-response boundary."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp


class GlobalCORSEnabledFastAPI(FastAPI):
    """Keep FastAPI's public API while placing CORS outside error handling.

    Starlette's ``ServerErrorMiddleware`` normally wraps middleware installed
    with ``add_middleware``. An unhandled exception is therefore converted to a
    500 response *after* an ordinary CORS middleware has already unwound, so
    the browser cannot read even the sanitized error response. Starlette
    recommends wrapping the complete application for this case. Overriding
    stack construction provides that topology without replacing the exported
    FastAPI instance with an opaque ASGI wrapper.
    """

    def __init__(self, *, global_cors_options: dict[str, Any], **kwargs: Any) -> None:
        self._global_cors_options = dict(global_cors_options)
        super().__init__(**kwargs)

    def build_middleware_stack(self) -> ASGIApp:
        return CORSMiddleware(
            app=super().build_middleware_stack(),
            **self._global_cors_options,
        )
