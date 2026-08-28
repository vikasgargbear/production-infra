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
    DECIMAL_PATTERN,
    IDEMPOTENCY_KEY_PATTERN,
    MONEY_PATTERN,
    PREPARE_ACTIONS,
    PUBLISHED_PREPARE_TOOL_NAMES,
    SHARED_ACTION_SCHEMAS,
)

SIGNED_DECIMAL_PATTERN = r"^-?(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$"


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
    records_field: str | None = None


OPERATIONS = {
    "erp_party_aging_get": Operation(
        "finance.party_aging.get", "erp_party_aging_get",
        "/api/internal/mcp/reads/party-aging", "finance.payment.manage", 500,
        records_field="parties",
    ),
    "erp_party_statement_get": Operation(
        "finance.party_statement.get", "erp_party_statement_get",
        "/api/internal/mcp/reads/party-statement", "finance.account.manage", 200,
        records_field="items",
    ),
    "erp_trial_balance_get": Operation(
        "finance.trial_balance.get", "erp_trial_balance_get",
        "/api/internal/mcp/reads/trial-balance", "finance.account.manage", 1000,
        records_field="rows",
    ),
    "erp_profit_loss_get": Operation(
        "finance.profit_loss.get", "erp_profit_loss_get",
        "/api/internal/mcp/reads/profit-loss", "finance.account.manage", 1000,
        records_field="rows",
    ),
    "erp_customer_activity_get": Operation(
        "finance.customer_activity.get", "erp_customer_activity_get",
        "/api/internal/mcp/reads/customer-activity", "finance.account.manage", 1000,
        records_field="customers",
    ),
    "erp_product_search": Operation(
        "master.products.search", "erp_product_search", "/api/internal/mcp/reads/products",
        "catalog.product.manage", 100,
    ),
    "erp_product_setup_options_get": Operation(
        "master.product_setup_options.get", "erp_product_setup_options_get",
        "/api/internal/mcp/reads/product-setup-options", "catalog.product.manage", 250,
    ),
    "erp_product_ingredient_search": Operation(
        "master.product_ingredients.search", "erp_product_ingredient_search",
        "/api/internal/mcp/reads/product-ingredients", "catalog.product.manage", 50,
        records_field="ingredients",
    ),
    "erp_product_hsn_search": Operation(
        "master.product_hsn.search", "erp_product_hsn_search",
        "/api/internal/mcp/reads/product-hsn", "catalog.product.manage", 50,
        records_field="hsn_codes",
    ),
    "erp_product_setup_get": Operation(
        "master.product_setup.get", "erp_product_setup_get",
        "/api/internal/mcp/reads/product-setup", "catalog.product.manage", 1,
    ),
    "erp_supplier_search": Operation(
        "master.suppliers.search", "erp_supplier_search", "/api/internal/mcp/reads/suppliers",
        "parties.supplier.manage", 200, records_field="suppliers",
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
    "erp_adjustment_note_readback_get": Operation(
        "finance.adjustment_notes.get", "erp_adjustment_note_readback_get",
        "/api/internal/mcp/resolution/adjustment-notes", "finance.adjustment_note.manage", 1,
        "branch_id",
    ),
    "erp_inventory_destruction_readback_get": Operation(
        "inventory.destructions.get", "erp_inventory_destruction_readback_get",
        "/api/internal/mcp/resolution/inventory-destructions",
        "inventory.destruction.create", 1, "branch_id",
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
        "erp_operation_review_get": OperatorOperation(
            "erp_operation_review_get", "automation.command.approve",
            SHARED_ACTION_SCHEMAS["erp_operation_review_get"], "review",
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


def _master_create_schema(
    properties: Mapping[str, Any], required: tuple[str, ...]
) -> Mapping[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            **properties,
            "idempotency_key": {
                "type": "string",
                "pattern": IDEMPOTENCY_KEY_PATTERN,
                "description": "Stable caller key for exact replay of this create request.",
            },
        },
        "required": [*required, "idempotency_key"],
    }


MASTER_CREATE_SCHEMAS: Mapping[str, Mapping[str, Any]] = {
    "erp_product_create": _master_create_schema(
        {
            "product_name": {"type": "string", "minLength": 1, "maxLength": 255},
            "generic_name": {"type": "string", "maxLength": 255},
            "product_kind": {
                "type": "string",
                "enum": ["medicine", "medical_device", "consumable"],
            },
        },
        ("product_name", "product_kind"),
    ),
    "erp_customer_create": _master_create_schema(
        {
            "customer_name": {"type": "string", "minLength": 1, "maxLength": 200},
            "customer_type": {"type": "string", "enum": ["individual", "organization"]},
            "primary_phone": {"type": "string", "pattern": r"^[0-9]{10}$"},
            "primary_email": {"type": "string", "format": "email", "maxLength": 320},
            "contact_person_name": {"type": "string", "maxLength": 100},
            "address_line1": {"type": "string", "maxLength": 255},
            "address_line2": {"type": "string", "maxLength": 255},
            "city": {"type": "string", "maxLength": 100},
            "state_code": {"type": "string", "pattern": r"^[0-9]{2}$"},
            "pincode": {"type": "string", "pattern": r"^[0-9]{6}$"},
            "gst_number": {"type": "string", "pattern": r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"},
            "pan_number": {"type": "string", "pattern": r"^[A-Z]{5}[0-9]{4}[A-Z]$"},
            "credit_limit": {"type": "string", "pattern": MONEY_PATTERN},
            "credit_days": {"type": "integer", "minimum": 0, "maximum": 365},
        },
        ("customer_name", "customer_type", "primary_phone", "credit_limit", "credit_days"),
    ),
    "erp_supplier_create": _master_create_schema(
        {
            "supplier_name": {"type": "string", "minLength": 1, "maxLength": 200},
            "primary_phone": {"type": "string", "pattern": r"^[0-9]{10}$"},
            "primary_email": {"type": "string", "format": "email", "maxLength": 320},
            "contact_person": {"type": "string", "maxLength": 100},
            "address_line1": {"type": "string", "maxLength": 255},
            "address_line2": {"type": "string", "maxLength": 255},
            "city": {"type": "string", "maxLength": 100},
            "state_code": {"type": "string", "pattern": r"^[0-9]{2}$"},
            "pincode": {"type": "string", "pattern": r"^[0-9]{6}$"},
            "gst_number": {"type": "string", "pattern": r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"},
            "pan_number": {"type": "string", "pattern": r"^[A-Z]{5}[0-9]{4}[A-Z]$"},
            "payment_days": {"type": "integer", "minimum": 0, "maximum": 180},
        },
        ("supplier_name", "payment_days"),
    ),
}


PRODUCT_SETUP_SCHEMA: Mapping[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "product_id": {"type": "string", "format": "uuid"},
        "idempotency_key": {
            "type": "string", "pattern": IDEMPOTENCY_KEY_PATTERN,
            "description": "Stable caller key for exact replay of this setup request.",
        },
        "row_version": {"type": "integer", "minimum": 1},
        "category_id": {"type": "string", "format": "uuid"},
        "manufacturer_party_id": {"type": "string", "format": "uuid"},
        "base_uom_code": {"type": "string", "minLength": 1, "maxLength": 16},
        "dosage_form": {"type": "string", "maxLength": 64},
        "strength_display": {"type": "string", "maxLength": 128},
        "hsn_code": {"type": "string", "pattern": r"^[0-9]{4,8}$"},
        "cold_chain_required": {"type": "boolean"},
        "minimum_storage_celsius": {"type": "string", "pattern": SIGNED_DECIMAL_PATTERN},
        "maximum_storage_celsius": {"type": "string", "pattern": SIGNED_DECIMAL_PATTERN},
        "shelf_life_days": {"type": "integer", "minimum": 1, "maximum": 36500},
        "gtin": {"type": "string", "pattern": r"^[0-9]{8,14}$"},
        "pack_conversions": {
            "type": "array", "maxItems": 12,
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "uom_code": {"type": "string", "minLength": 1, "maxLength": 16},
                    "multiplier": {"type": "string", "pattern": DECIMAL_PATTERN},
                },
                "required": ["uom_code", "multiplier"],
            },
        },
        "ingredients": {
            "type": "array", "maxItems": 32,
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "ingredient_id": {"type": "string", "format": "uuid"},
                    "ingredient_role": {"type": "string", "enum": ["active", "excipient"]},
                    "strength_value": {"type": "string", "pattern": DECIMAL_PATTERN},
                    "strength_uom_code": {"type": "string", "maxLength": 16},
                    "basis_quantity": {"type": "string", "pattern": DECIMAL_PATTERN},
                    "basis_uom_code": {"type": "string", "maxLength": 16},
                },
                "required": ["ingredient_id", "ingredient_role"],
            },
        },
    },
    "required": [
        "product_id", "idempotency_key", "row_version", "manufacturer_party_id",
        "base_uom_code", "hsn_code",
    ],
}

OPERATOR_OPERATIONS.update(
    {
        "erp_product_create": OperatorOperation(
            "erp_product_create", "catalog.product_draft.create",
            MASTER_CREATE_SCHEMAS["erp_product_create"], "master_write",
        ),
        "erp_product_setup": OperatorOperation(
            "erp_product_setup", "catalog.product_draft.configure",
            PRODUCT_SETUP_SCHEMA, "master_write",
        ),
        "erp_customer_create": OperatorOperation(
            "erp_customer_create", "parties.customer.create",
            MASTER_CREATE_SCHEMAS["erp_customer_create"], "master_write",
        ),
        "erp_supplier_create": OperatorOperation(
            "erp_supplier_create", "parties.supplier.create",
            MASTER_CREATE_SCHEMAS["erp_supplier_create"], "master_write",
        ),
    }
)

OPERATOR_READBACK_TOOLS: Mapping[str, tuple[str, str]] = {
    "erp_bank_reconciliation_get": (
        "bank_reconciliation_readback", "bank-reconciliation-readback"
    ),
    "erp_sales_dispatch_readback": (
        "sales_dispatch_readback", "sales-dispatch-readback"
    ),
    "erp_sales_return_readback": ("sales_return_readback", "sales-return-readback"),
    "erp_purchase_return_readback": (
        "purchase_return_readback", "purchase-return-readback"
    ),
    "erp_customer_receipt_readback": (
        "customer_receipt_readback", "customer-receipt-readback"
    ),
    "erp_customer_cheque_clearance_readback": (
        "customer_cheque_clearance_readback",
        "customer-cheque-clearance-readback",
    ),
    "erp_customer_cheque_bounce_readback": (
        "customer_cheque_bounce_readback", "customer-cheque-bounce-readback"
    ),
    "erp_supplier_payment_readback": (
        "supplier_payment_readback", "supplier-payment-readback"
    ),
    "erp_supplier_advance_readback": (
        "supplier_advance_readback", "supplier-advance-readback"
    ),
    "erp_inventory_transfer_readback": (
        "inventory_transfer_readback", "inventory-transfer-readback"
    ),
    "erp_inventory_adjustment_readback": (
        "inventory_adjustment_readback", "inventory-adjustment-readback"
    ),
    "erp_expense_claim_readback": (
        "expense_claim_readback", "expense-claim-readback"
    ),
    "erp_sales_return_reversal_readback": (
        "sales_return_reversal_readback", "sales-return-reversal-readback"
    ),
    "erp_purchase_return_reversal_readback": (
        "purchase_return_reversal_readback", "purchase-return-reversal-readback"
    ),
    "erp_adjustment_note_reversal_readback": (
        "adjustment_note_reversal_readback", "adjustment-note-reversal-readback"
    ),
}
OPERATOR_OPERATIONS.update(
    {
        tool_name: OperatorOperation(
            tool_name,
            "automation.command.status.get",
            SHARED_ACTION_SCHEMAS[tool_name],
            kind,
        )
        for tool_name, (kind, _suffix) in OPERATOR_READBACK_TOOLS.items()
    }
)
OPERATOR_READBACK_SUFFIXES: Mapping[str, str] = {
    kind: suffix for kind, suffix in OPERATOR_READBACK_TOOLS.values()
}
READ_ONLY_OPERATOR_KINDS = frozenset(("status", *OPERATOR_READBACK_SUFFIXES))


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
        request_params = {
            key: value for key, value in request_params.items() if value is not None
        }
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
        if operation.records_field is not None:
            if not isinstance(payload, dict):
                raise UpstreamContractError("ERP read response must be an object")
            records = payload.get(operation.records_field)
            if not isinstance(records, list):
                raise UpstreamContractError(
                    f"ERP read response lacks {operation.records_field} records"
                )
        else:
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
        operation_mode = (
            "read"
            if operation.kind in READ_ONLY_OPERATOR_KINDS
            else "write"
        )
        payload = {
            "issuer": claims.get("iss"),
            "subject": access.subject,
            "client_id": access.client_id,
            "organization_id": organization_id,
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
        elif operation.kind == "master_write":
            method = "POST"
            path = {
                "catalog.product_draft.create": "/api/internal/mcp/master/products",
                "catalog.product_draft.configure": "/api/internal/mcp/master/products/setup",
                "parties.customer.create": "/api/internal/mcp/master/customers",
                "parties.supplier.create": "/api/internal/mcp/master/suppliers",
            }[operation.operation_key]
            payload = arguments
        elif operation.kind in {"approve", "execute"}:
            method = "POST"
            path = f"/api/internal/mcp/commands/{command_request_id}/{operation.kind}"
            payload = {
                key: value for key, value in arguments.items()
                if key != "command_request_id"
            }
        elif operation.kind == "review":
            method = "GET"
            path = f"/api/internal/mcp/commands/{command_request_id}/review"
            payload = None
        elif operation.kind in OPERATOR_READBACK_SUFFIXES:
            method = "GET"
            suffix = OPERATOR_READBACK_SUFFIXES[operation.kind]
            path = f"/api/internal/mcp/commands/{command_request_id}/{suffix}"
            payload = None
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
