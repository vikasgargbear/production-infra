"""Official MCP SDK Streamable HTTP application."""

from __future__ import annotations

from typing import Any

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from pydantic import AnyHttpUrl
from starlette.requests import Request
from starlette.responses import JSONResponse

from .auth import SupabaseTokenVerifier
from .config import Settings
from .operations import OPERATIONS, OperationGateway


def registered_tool_names() -> tuple[str, ...]:
    return tuple(sorted(OPERATIONS))


def _access_token():
    access = get_access_token()
    if access is None:
        raise PermissionError("authenticated HTTP bearer context is required")
    return access


def create_app(
    settings: Settings | None = None,
    verifier: SupabaseTokenVerifier | None = None,
    gateway: OperationGateway | None = None,
):
    config = settings or Settings.from_env()
    token_verifier = verifier or SupabaseTokenVerifier(config)
    operation_gateway = gateway or OperationGateway(config)
    server = MCPServer(
        "AASOPharma ERP",
        token_verifier=token_verifier,
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(config.supabase_issuer),
            resource_server_url=AnyHttpUrl(config.resource_server_url),
            required_scopes=list(config.required_scopes),
        ),
    )

    @server.tool()
    async def erp_product_search(q: str = "", limit: int = 20, offset: int = 0) -> Any:
        """Search the current organization's products by name, generic name, SKU, or HSN."""
        if not 1 <= limit <= 100 or offset < 0:
            raise ValueError("limit must be 1..100 and offset must be nonnegative")
        return await operation_gateway.execute(
            OPERATIONS["erp_product_search"], _access_token(),
            {"q": q, "limit": limit, "offset": offset},
        )

    @server.tool()
    async def erp_supplier_search(
        search_term: str | None = None, limit: int = 50, offset: int = 0
    ) -> Any:
        """Search the current organization's suppliers by name, code, GSTIN, or phone."""
        if not 1 <= limit <= 200 or offset < 0:
            raise ValueError("limit must be 1..200 and offset must be nonnegative")
        return await operation_gateway.execute(
            OPERATIONS["erp_supplier_search"], _access_token(),
            {"search_term": search_term, "limit": limit, "offset": offset},
        )

    @server.tool()
    async def erp_gst_settings_get() -> Any:
        """Return the current organization's GST settings."""
        return await operation_gateway.execute(
            OPERATIONS["erp_gst_settings_get"], _access_token(), {},
        )

    @server.custom_route("/health", methods=["GET"])
    async def health(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "service": "aasopharma-mcp"})

    @server.custom_route("/ready", methods=["GET"])
    async def ready(_: Request) -> JSONResponse:
        try:
            await token_verifier.readiness()
            await operation_gateway.readiness()
        except Exception:
            return JSONResponse({"status": "not_ready"}, status_code=503)
        return JSONResponse(
            {"status": "ready", "tools": list(registered_tool_names())}
        )

    return server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        streamable_http_path="/mcp",
        host=config.bind_host,
    )
