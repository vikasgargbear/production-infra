"""Reviewed read-only ERP operation adapter and app-owned grant check."""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any, Callable

import httpx
from mcp.server.auth.provider import AccessToken

from .config import Settings


class AuthorizationDenied(RuntimeError):
    pass


class UpstreamContractError(RuntimeError):
    pass


@dataclass(frozen=True)
class Operation:
    key: str
    tool_name: str
    path: str
    permission: str
    max_records: int


OPERATIONS = {
    "erp_product_search": Operation(
        "master.products.search", "erp_product_search", "/api/internal/mcp/reads/products",
        "catalog.product.manage", 100,
    ),
    "erp_supplier_search": Operation(
        "master.suppliers.search", "erp_supplier_search", "/api/internal/mcp/reads/suppliers",
        "parties.supplier.manage", 200,
    ),
    "erp_gst_settings_get": Operation(
        "gst.settings.get", "erp_gst_settings_get", "/api/internal/mcp/reads/gst-settings",
        "tax.registration.manage", 1,
    ),
}


class OperationGateway:
    def __init__(
        self,
        settings: Settings,
        client_factory: Callable[[], Any] | None = None,
    ) -> None:
        self.settings = settings
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=settings.request_timeout_seconds)
        )

    async def _grant(self, operation: Operation, access: AccessToken) -> str:
        if access.subject is None:
            raise AuthorizationDenied("OAuth identity has no subject")
        claims = access.claims or {}
        payload = {
            "issuer": claims.get("iss"),
            "subject": access.subject,
            "organization_id": claims.get("organization_id"),
            "client_id": access.client_id,
            "operation_key": operation.key,
            "capability_code": operation.key,
            "operation_mode": "read",
        }
        async with self._client_factory() as client:
            response = await client.post(
                self.settings.grant_authorize_url,
                json=payload,
                headers={"Authorization": f"Bearer {self.settings.internal_service_token}"},
            )
        if response.status_code != 200:
            raise AuthorizationDenied("ERP agent-grant authority rejected the request")
        body = response.json()
        expected = {
            "allowed", "issuer", "subject", "client_id", "operation_key",
            "capability_code", "organization_id", "membership_id", "branch_ids",
            "agent_grant_id", "delegated_access_token", "expires_at",
        }
        if not isinstance(body, dict) or set(body) != expected:
            raise UpstreamContractError("ERP agent-grant response schema drift")
        if body["allowed"] is not True:
            raise AuthorizationDenied("ERP agent grant is inactive or insufficient")
        for key, expected_value in (
            ("issuer", claims.get("iss")), ("subject", access.subject),
            ("organization_id", claims.get("organization_id")),
            ("client_id", access.client_id), ("operation_key", operation.key),
            ("capability_code", operation.key),
        ):
            if body[key] != expected_value:
                raise UpstreamContractError(f"ERP agent-grant response changed {key}")
        delegated = body["delegated_access_token"]
        if not isinstance(delegated, str) or len(delegated) < 32:
            raise UpstreamContractError("ERP delegated access token is invalid")
        if not isinstance(body["expires_at"], int) or body["expires_at"] <= int(time.time()):
            raise AuthorizationDenied("ERP delegated access token is expired")
        return delegated

    async def execute(
        self, operation: Operation, access: AccessToken, params: dict[str, Any]
    ) -> Any:
        delegated = await self._grant(operation, access)
        async with self._client_factory() as client:
            response = await client.get(
                f"{self.settings.erp_api_base_url}{operation.path}",
                params=params,
                headers={
                    "Authorization": f"Bearer {self.settings.internal_service_token}",
                    "X-MCP-Delegated-Authorization": f"Bearer {delegated}",
                },
            )
        if response.status_code != 200:
            raise UpstreamContractError(
                f"reviewed ERP read failed with status {response.status_code}"
            )
        if len(response.content) > 1_048_576:
            raise UpstreamContractError("ERP read exceeded the one-megabyte MCP limit")
        payload = response.json()
        if isinstance(payload, list) and len(payload) > operation.max_records:
            raise UpstreamContractError("ERP read exceeded its reviewed record limit")
        return payload

    async def readiness(self) -> None:
        async with self._client_factory() as client:
            response = await client.get(
                self.settings.grant_readiness_url,
                headers={"Authorization": f"Bearer {self.settings.internal_service_token}"},
            )
        if response.status_code != 200 or response.json() != {
            "status": "ready",
            "grant_authority": "automation.agent_grants",
        }:
            raise RuntimeError("ERP agent-grant authority is not ready")
