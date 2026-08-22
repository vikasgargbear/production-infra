"""Reviewed ERP read and operator-action gateways."""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any, Callable, Mapping

import httpx
from jsonschema import Draft202012Validator, FormatChecker
from mcp.server.auth.provider import AccessToken

from .config import Settings
from .operator_actions import (
    PREPARE_ACTIONS,
    PUBLISHED_PREPARE_TOOL_NAMES,
    SHARED_ACTION_SCHEMAS,
)


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
    branch_parameter: str | None = None


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
    "erp_customer_search": Operation(
        "parties.customers.search", "erp_customer_search",
        "/api/internal/mcp/resolution/customers", "parties.customer.manage", 50,
    ),
    "erp_inventory_location_search": Operation(
        "inventory.locations.search", "erp_inventory_location_search",
        "/api/internal/mcp/resolution/locations", "inventory.location.manage", 50,
        "branch_id",
    ),
    "erp_stock_batch_search": Operation(
        "inventory.stock_batches.search", "erp_stock_batch_search",
        "/api/internal/mcp/resolution/stock-batches", "inventory.batch.manage", 100,
        "branch_id",
    ),
    "erp_sales_order_get": Operation(
        "sales.orders.get", "erp_sales_order_get",
        "/api/internal/mcp/resolution/sales-orders", "sales.order.manage", 1, "branch_id",
    ),
    "erp_sales_invoice_get": Operation(
        "sales.invoices.get", "erp_sales_invoice_get",
        "/api/internal/mcp/resolution/sales-invoices", "sales.invoice.create", 1, "branch_id",
    ),
    "erp_purchase_order_get": Operation(
        "procurement.purchase_orders.get", "erp_purchase_order_get",
        "/api/internal/mcp/resolution/purchase-orders", "procurement.order.manage", 1, "branch_id",
    ),
    "erp_goods_receipt_get": Operation(
        "procurement.goods_receipts.get", "erp_goods_receipt_get",
        "/api/internal/mcp/resolution/goods-receipts", "procurement.receipt.post", 1, "branch_id",
    ),
    "erp_supplier_invoice_get": Operation(
        "procurement.supplier_invoices.get", "erp_supplier_invoice_get",
        "/api/internal/mcp/resolution/supplier-invoices",
        "procurement.supplier_invoice.create", 1, "branch_id",
    ),
    "erp_open_item_search": Operation(
        "finance.open_items.search", "erp_open_item_search",
        "/api/internal/mcp/resolution/open-items", "finance.payment.manage", 100, "branch_id",
    ),
    "erp_settlement_choice_search": Operation(
        "finance.settlement_choices.search", "erp_settlement_choice_search",
        "/api/internal/mcp/resolution/settlement-choices", "finance.payment.manage", 100,
        "branch_id",
    ),
}


@dataclass(frozen=True)
class OperatorOperation:
    tool_name: str
    operation_key: str
    input_schema: Mapping[str, Any]
    kind: str
    branch_fields: tuple[str, ...] = ()


OPERATOR_OPERATIONS: dict[str, OperatorOperation] = {
    tool_name: OperatorOperation(
        tool_name, action.operation_key, action.input_schema, "prepare", ("branch_id",)
    )
    for tool_name, action in PREPARE_ACTIONS.items()
    if tool_name in PUBLISHED_PREPARE_TOOL_NAMES
}
OPERATOR_OPERATIONS.update(
    {
        "erp_operation_approve": OperatorOperation(
            "erp_operation_approve", "automation.command.approve",
            SHARED_ACTION_SCHEMAS["erp_operation_approve"], "approve",
        ),
        "erp_operation_execute": OperatorOperation(
            "erp_operation_execute", "automation.command.execute",
            SHARED_ACTION_SCHEMAS["erp_operation_execute"], "execute",
        ),
        "erp_operation_status_get": OperatorOperation(
            "erp_operation_status_get", "automation.command.status.get",
            SHARED_ACTION_SCHEMAS["erp_operation_status_get"], "status",
        ),
    }
)


def published_operator_action_tool_names() -> tuple[str, ...]:
    return tuple(sorted(OPERATOR_OPERATIONS))


def _oauth_identity(access: AccessToken) -> tuple[dict[str, Any], str]:
    if access.subject is None:
        raise AuthorizationDenied("OAuth identity has no subject")
    claims = access.claims or {}
    organization_id = claims.get("organization_id")
    if not isinstance(organization_id, str) or not organization_id:
        raise AuthorizationDenied("OAuth identity has no organization")
    return claims, organization_id


def _delegated_token(body: Any, expected: Mapping[str, Any]) -> str:
    if not isinstance(body, dict) or set(body) != set(expected):
        raise UpstreamContractError("ERP delegation response schema drift")
    if body["allowed"] is not True:
        raise AuthorizationDenied("ERP agent grant is inactive or insufficient")
    for key, expected_value in expected.items():
        if expected_value is not Ellipsis and body[key] != expected_value:
            raise UpstreamContractError(f"ERP delegation response changed {key}")
    delegated = body["delegated_access_token"]
    if not isinstance(delegated, str) or len(delegated) < 32:
        raise UpstreamContractError("ERP delegated access token is invalid")
    if not isinstance(body["expires_at"], int) or body["expires_at"] <= int(time.time()):
        raise AuthorizationDenied("ERP delegated access token is expired")
    return delegated


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

    async def _grant(
        self, operation: Operation, access: AccessToken, branch_id: str | None
    ) -> str:
        claims, organization_id = _oauth_identity(access)
        payload = {
            "issuer": claims.get("iss"),
            "subject": access.subject,
            "organization_id": organization_id,
            "client_id": access.client_id,
            "operation_key": operation.key,
            "capability_code": operation.key,
            "operation_mode": "read",
            "branch_id": branch_id,
        }
        async with self._client_factory() as client:
            response = await client.post(
                self.settings.grant_authorize_url,
                json=payload,
                headers={"Authorization": f"Bearer {self.settings.internal_service_token}"},
            )
        if response.status_code != 200:
            raise AuthorizationDenied("ERP agent-grant authority rejected the request")
        return _delegated_token(
            response.json(),
            {
                "allowed": True,
                "issuer": claims.get("iss"),
                "subject": access.subject,
                "client_id": access.client_id,
                "operation_key": operation.key,
                "capability_code": operation.key,
                "organization_id": organization_id,
                "membership_id": Ellipsis,
                "branch_ids": [branch_id] if branch_id else [],
                "agent_grant_id": Ellipsis,
                "delegated_access_token": Ellipsis,
                "expires_at": Ellipsis,
            },
        )

    async def execute(
        self, operation: Operation, access: AccessToken, params: dict[str, Any]
    ) -> Any:
        request_params = dict(params)
        branch_id = None
        if operation.branch_parameter:
            raw_branch = request_params.pop(operation.branch_parameter, None)
            if not isinstance(raw_branch, str) or not raw_branch:
                raise ValueError(f"{operation.branch_parameter} is required")
            branch_id = raw_branch
        delegated = await self._grant(operation, access, branch_id)
        async with self._client_factory() as client:
            response = await client.get(
                f"{self.settings.erp_api_base_url}{operation.path}",
                params=request_params,
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
        records = payload if isinstance(payload, list) else payload.get("results", [])
        if isinstance(records, list) and len(records) > operation.max_records:
            raise UpstreamContractError("ERP read exceeded its reviewed record limit")
        return payload

    async def _operator_grant(
        self,
        operation: OperatorOperation,
        access: AccessToken,
        *,
        branch_ids: list[str],
        command_request_id: str | None,
    ) -> str:
        claims, organization_id = _oauth_identity(access)
        operation_mode = "read" if operation.kind == "status" else "write"
        payload = {
            "issuer": claims.get("iss"),
            "subject": access.subject,
            "client_id": access.client_id,
            "operation_key": operation.operation_key,
            "capability_code": operation.operation_key,
            "operation_mode": operation_mode,
            "branch_ids": branch_ids,
            "command_request_id": command_request_id,
        }
        authorize_url = (
            f"{self.settings.erp_api_base_url}"
            "/api/internal/mcp/agent-grants/authorize-action"
        )
        async with self._client_factory() as client:
            response = await client.post(
                authorize_url,
                json=payload,
                headers={"Authorization": f"Bearer {self.settings.internal_service_token}"},
            )
        if response.status_code != 200:
            message = (
                "ERP operator grant authority rejected the request "
                f"(HTTP {response.status_code})"
            )
            if response.status_code in {400, 401, 403, 409, 422, 503}:
                try:
                    detail = response.json().get("detail")
                except (AttributeError, TypeError, ValueError):
                    detail = None
                if isinstance(detail, str) and detail:
                    message = f"{message}: {detail[:256]}"
            raise AuthorizationDenied(message)
        return _delegated_token(
            response.json(),
            {
                "allowed": True,
                "issuer": claims.get("iss"),
                "subject": access.subject,
                "client_id": access.client_id,
                "operation_key": operation.operation_key,
                "capability_code": operation.operation_key,
                "operation_mode": operation_mode,
                "permission_code": Ellipsis,
                "organization_id": organization_id,
                "membership_id": Ellipsis,
                "agent_grant_id": Ellipsis,
                "branch_ids": Ellipsis,
                "organization_scope": Ellipsis,
                "command_request_id": command_request_id,
                "delegated_access_token": Ellipsis,
                "expires_at": Ellipsis,
            },
        )

    async def execute_operator(
        self,
        operation: OperatorOperation,
        access: AccessToken,
        arguments: dict[str, Any],
    ) -> Any:
        errors = sorted(
            Draft202012Validator(
                operation.input_schema, format_checker=FormatChecker()
            ).iter_errors(arguments),
            key=lambda error: list(error.absolute_path),
        )
        if errors:
            error = errors[0]
            location = ".".join(str(part) for part in error.absolute_path) or "arguments"
            raise ValueError(f"{location}: {error.message}")

        command_request_id = arguments.get("command_request_id")
        branch_ids = [str(arguments[field]) for field in operation.branch_fields]
        delegated = await self._operator_grant(
            operation,
            access,
            branch_ids=branch_ids,
            command_request_id=str(command_request_id) if command_request_id else None,
        )
        headers = {
            "Authorization": f"Bearer {self.settings.internal_service_token}",
            "X-MCP-Delegated-Authorization": f"Bearer {delegated}",
        }
        if operation.kind == "prepare":
            method = "POST"
            path = f"/api/internal/mcp/actions/{operation.operation_key}/prepare"
            payload = arguments
        elif operation.kind in {"approve", "execute"}:
            method = "POST"
            path = f"/api/internal/mcp/commands/{command_request_id}/{operation.kind}"
            payload = {
                key: value for key, value in arguments.items()
                if key != "command_request_id"
            }
        else:
            method = "GET"
            path = f"/api/internal/mcp/commands/{command_request_id}"
            payload = None

        async with self._client_factory() as client:
            if method == "POST":
                response = await client.post(
                    f"{self.settings.erp_api_base_url}{path}", json=payload, headers=headers
                )
            else:
                response = await client.get(
                    f"{self.settings.erp_api_base_url}{path}", headers=headers
                )
        if response.status_code != 200:
            detail = response.json() if response.content else {}
            raise UpstreamContractError(
                f"canonical operator action failed with status {response.status_code}: {detail}"
            )
        if len(response.content) > 1_048_576:
            raise UpstreamContractError("ERP action response exceeded the one-megabyte MCP limit")
        body = response.json()
        if not isinstance(body, dict):
            raise UpstreamContractError("ERP action response must be an object")
        return body

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
