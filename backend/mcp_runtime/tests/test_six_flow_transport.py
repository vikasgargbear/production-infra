"""Official-SDK transport proof for the six user-facing ERP flow families.

The deterministic gateway below replaces only the internal ERP API/SQL seam: these
tests prove HTTP bearer handling, MCP initialization, tools/list metadata, SDK input
validation, tool dispatch, output/error envelopes, and cross-call state preservation.
They do not claim PostgreSQL prepare/approve/execute/posting lifecycle coverage. That
authority remains in the operation-specific backend tests, including
``backend/tests/postgres/check_purchase_bill_mapping_lifecycle_pg15.py`` and the
canonical sales/return runtime-role suites.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from copy import deepcopy
import json
import time
from typing import Any
from uuid import UUID, uuid4, uuid5

import httpx2
from jsonschema import Draft202012Validator, FormatChecker
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.server.auth.provider import AccessToken
import pytest

from aasopharma_mcp.operations import (
    OPERATIONS,
    OPERATOR_OPERATIONS,
    READ_ONLY_OPERATOR_KINDS,
)
from aasopharma_mcp.server import create_app, registered_tool_names
from conftest import settings


IDS = {
    name: str(uuid5(UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), name))
    for name in (
        "organization",
        "subject",
        "product",
        "manufacturer",
        "uom",
        "customer",
        "supplier",
        "branch",
        "address",
        "location",
        "batch-one",
        "batch-two",
        "invoice",
        "invoice-line",
        "dispatch-allocation",
        "supplier-invoice",
        "goods-receipt-line",
        "supplier-invoice-allocation",
    )
}


class TransportVerifier:
    async def verify_token(self, token: str) -> AccessToken | None:
        if token != "transport-valid-token":
            return None
        return AccessToken(
            token=token,
            client_id="chatgpt-installation",
            scopes=["openid", "offline_access"],
            expires_at=int(time.time()) + 300,
            subject=IDS["subject"],
            claims={
                "iss": settings().supabase_issuer,
                "organization_id": IDS["organization"],
            },
        )

    async def readiness(self) -> None:
        return None


class ScenarioGateway:
    """Deterministic internal-API seam; SDK/auth/schema/transport remain real."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.replays: dict[tuple[str, str], tuple[str, dict[str, Any]]] = {}
        self.product_row_version = 1
        self.commands: dict[str, dict[str, Any]] = {}

    async def readiness(self) -> None:
        return None

    async def execute(self, operation, _access, arguments: dict[str, Any]) -> Any:
        self.calls.append(("read", operation.tool_name, deepcopy(arguments)))
        if operation.tool_name == "erp_product_setup_get":
            return {
                "product_id": IDS["product"],
                "product_code": "PROD-000001",
                "row_version": self.product_row_version,
                "lifecycle_status": (
                    "active" if self.product_row_version >= 3 else "draft"
                ),
                "pack_conversions": [{"uom_code": "STRIP", "multiplier": "10"}],
            }
        if operation.tool_name == "erp_customer_get":
            return {
                "customer_account_id": IDS["customer"],
                "customer_code": "CUS-000001",
                "customer_name": "Exact Medical Store",
            }
        if operation.tool_name == "erp_supplier_get":
            return {
                "supplier_account_id": IDS["supplier"],
                "supplier_code": "SUP-000001",
                "supplier_name": "Exact Pharma Supply",
            }
        if operation.tool_name == "erp_sales_invoice_get":
            return {
                "match_state": "matched",
                "sales_invoice_id": IDS["invoice"],
                "returnable_lines": [],
            }
        raise AssertionError(f"unexpected read tool {operation.tool_name}")

    async def execute_operator(
        self, operation, _access, arguments: dict[str, Any]
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

        self.calls.append((operation.kind, operation.tool_name, deepcopy(arguments)))
        if operation.kind in READ_ONLY_OPERATOR_KINDS | {"review"}:
            command_id = arguments["command_request_id"]
            command = self.commands.get(command_id)
            if command is None:
                raise RuntimeError("command not found")
            return {
                **deepcopy(command),
                "readback_tool": operation.tool_name,
            }

        key = arguments.get("idempotency_key")
        if isinstance(key, str):
            replay_key = (operation.tool_name, key)
            fingerprint = json.dumps(arguments, sort_keys=True, separators=(",", ":"))
            previous = self.replays.get(replay_key)
            if previous is not None:
                previous_fingerprint, previous_result = previous
                if previous_fingerprint != fingerprint:
                    raise RuntimeError("idempotency key reused with different input")
                return {**deepcopy(previous_result), "idempotency_replayed": True}

        if operation.tool_name == "erp_product_create":
            result = {
                "product_id": IDS["product"],
                "product_code": "PROD-000001",
                "row_version": 1,
                "lifecycle_status": "draft",
                "idempotency_replayed": False,
            }
        elif operation.tool_name == "erp_product_setup":
            if arguments["row_version"] != self.product_row_version:
                raise RuntimeError("stale product row_version")
            self.product_row_version += 1
            result = {
                "product_id": IDS["product"],
                "product_code": "PROD-000001",
                "row_version": self.product_row_version,
                "lifecycle_status": "draft",
                "idempotency_replayed": False,
            }
        elif operation.tool_name == "erp_product_activate":
            if arguments["row_version"] != self.product_row_version:
                raise RuntimeError("stale product row_version")
            self.product_row_version += 1
            result = {
                "product_id": IDS["product"],
                "product_code": "PROD-000001",
                "row_version": self.product_row_version,
                "lifecycle_status": "active",
                "idempotency_replayed": False,
            }
        elif operation.tool_name == "erp_customer_create":
            result = {
                "customer_account_id": IDS["customer"],
                "customer_code": "CUS-000001",
                "idempotency_replayed": False,
            }
        elif operation.tool_name == "erp_supplier_create":
            result = {
                "supplier_account_id": IDS["supplier"],
                "supplier_code": "SUP-000001",
                "idempotency_replayed": False,
            }
        elif operation.kind == "prepare":
            command_id = str(
                uuid5(
                    UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
                    f"{operation.tool_name}:{arguments['idempotency_key']}",
                )
            )
            result = {
                "command_request_id": command_id,
                "status": "prepared",
                "preview_hash": "sha256:" + "a" * 64,
                "approval_policy": (
                    "separate_approver"
                    if "return" in operation.tool_name
                    else "actor_confirmation"
                ),
                "required_approvals": 1,
                "idempotency_replayed": False,
            }
            self.commands[command_id] = {
                **deepcopy(result),
                "source_tool": operation.tool_name,
                "input": deepcopy(arguments),
            }
        else:
            raise AssertionError(f"unexpected write tool {operation.tool_name}")

        if isinstance(key, str):
            self.replays[(operation.tool_name, key)] = (
                json.dumps(arguments, sort_keys=True, separators=(",", ":")),
                deepcopy(result),
            )
        return result


@asynccontextmanager
async def _session(gateway: ScenarioGateway):
    app = create_app(settings(), TransportVerifier(), gateway)
    transport = httpx2.ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        async with httpx2.AsyncClient(
            transport=transport,
            base_url="https://mcp.example.test",
            headers={"Authorization": "Bearer transport-valid-token"},
        ) as http_client:
            async with streamable_http_client(
                "https://mcp.example.test/mcp", http_client=http_client
            ) as streams:
                async with ClientSession(*streams) as session:
                    await session.initialize()
                    yield session


def _body(result) -> dict[str, Any]:
    assert result.is_error is False, result
    assert len(result.content) == 1
    return json.loads(result.content[0].text)


def _error(result) -> str:
    assert result.is_error is True, result
    return "\n".join(block.text for block in result.content if hasattr(block, "text"))


def _discount() -> dict[str, str]:
    return {
        "line_discount_kind": "none",
        "line_discount_basis": "taxable_value",
        "line_discount_value": "0",
    }


def _document_discount() -> dict[str, str]:
    return {
        "document_discount_kind": "none",
        "document_discount_basis": "taxable_value",
        "document_discount_value": "0",
    }


def _commercial_line() -> dict[str, Any]:
    return {
        "product_id": IDS["product"],
        "uom_conversion_id": IDS["uom"],
        "billed_quantity": "10",
        "free_quantity": "1",
        "free_supply_tax_treatment": "excluded_from_taxable_value",
        "quoted_unit_rate": "80.00",
        "price_basis": "tax_exclusive",
        "line_discount": _discount(),
        "document_discount_eligible": True,
    }


def _bill_mapping() -> dict[str, Any]:
    return {
        "review_id": "transport-bill-review-0001",
        "revision": 1,
        "parent_mapping_hash": None,
        "evidence": {
            "source_kind": "image",
            "source_reference": "user attachment 1",
            "supplier_name": "Exact Pharma Supply",
            "supplier_gstin": "07ABCDE1234F1Z5",
            "invoice_number": "INV/44",
            "invoice_date": "2026-08-28",
            "additional_document_fields": [
                {"label": "Invoice total", "value": "896.00", "uncertain": False}
            ],
        },
        "supplier_resolution": {
            "status": "matched",
            "supplier_id": IDS["supplier"],
            "canonical_name": "Exact Pharma Supply",
            "proposed_supplier_name": None,
            "candidate_supplier_ids": [],
            "skip_reason": None,
        },
        "lines": [
            {
                "line_id": "line-1",
                "source_fields": {
                    "description": "MEDICINE 500 1*10",
                    "pack": "1*10",
                    "batch": "B-100",
                    "expiry": "08/28",
                    "mrp": "125.00",
                    "quantity": "10",
                    "free_quantity": "1",
                    "rate": "80.00",
                    "discount": "5%",
                    "hsn": "30049099",
                    "tax": "12%",
                },
                "uncertain_fields": [],
                "product_resolution": {
                    "status": "matched",
                    "product_id": IDS["product"],
                    "canonical_name": "Medicine 500",
                    "candidate_product_ids": [],
                    "proposed_product": None,
                    "skip_reason": None,
                },
            }
        ],
        "unresolved_fields": [],
        "skipped_fields": [],
        "explicit_skip_permission": False,
    }


@pytest.mark.asyncio
async def test_oauth_challenge_inventory_annotations_and_valid_sdk_session() -> None:
    gateway = ScenarioGateway()
    app = create_app(settings(), TransportVerifier(), gateway)
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "transport-test", "version": "1"},
        },
    }
    async with app.router.lifespan_context(app):
        async with httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app),
            base_url="https://mcp.example.test",
        ) as anonymous:
            response = await anonymous.post(
                "/mcp",
                json=initialize,
                headers={"Accept": "application/json, text/event-stream"},
            )
            assert response.status_code == 401
            assert "resource_metadata=" in response.headers["www-authenticate"]

    async with _session(gateway) as session:
        advertised = (await session.list_tools()).tools

    assert tuple(sorted(tool.name for tool in advertised)) == registered_tool_names()
    assert len(advertised) == 79
    by_name = {tool.name: tool for tool in advertised}
    for name in OPERATIONS:
        annotation = by_name[name].annotations
        assert annotation is not None
        assert annotation.read_only_hint is True
        assert annotation.destructive_hint is False
        assert annotation.idempotent_hint is True
        assert annotation.open_world_hint is True
    local = by_name["erp_purchase_bill_mapping_review"].annotations
    assert local is not None
    assert local.read_only_hint is True
    assert local.open_world_hint is False
    for name, operation in OPERATOR_OPERATIONS.items():
        annotation = by_name[name].annotations
        assert annotation is not None
        expected_read_only = operation.kind in READ_ONLY_OPERATOR_KINDS | {"review"}
        assert annotation.read_only_hint is expected_read_only
        assert annotation.destructive_hint is (not expected_read_only)
        assert annotation.idempotent_hint is True


@pytest.mark.asyncio
async def test_product_customer_and_supplier_creation_setup_readback_and_replay() -> None:
    gateway = ScenarioGateway()
    product = {
        "product_name": "Medicine 500",
        "generic_name": "Paracetamol",
        "product_kind": "medicine",
        "idempotency_key": "transport-product-create-0001",
    }
    async with _session(gateway) as session:
        created = _body(await session.call_tool("erp_product_create", product))
        replayed = _body(await session.call_tool("erp_product_create", product))
        assert created["product_id"] == IDS["product"]
        assert replayed["idempotency_replayed"] is True

        conflict = _error(
            await session.call_tool(
                "erp_product_create", {**product, "product_name": "Different Product"}
            )
        )
        assert "idempotency key reused with different input" in conflict

        setup = {
            "product_id": IDS["product"],
            "idempotency_key": "transport-product-setup-0001",
            "row_version": 1,
            "manufacturer_party_id": IDS["manufacturer"],
            "base_uom_code": "EA",
            "hsn_code": "3004",
            "dosage_form": "Tablet",
            "strength_display": "500 mg",
            "pack_conversions": [{"uom_code": "STRIP", "multiplier": "10"}],
            "ingredients": [],
        }
        configured = _body(await session.call_tool("erp_product_setup", setup))
        assert configured["row_version"] == 2
        readback = _body(
            await session.call_tool(
                "erp_product_setup_get", {"product_id": IDS["product"]}
            )
        )
        assert readback["pack_conversions"] == [
            {"uom_code": "STRIP", "multiplier": "10"}
        ]
        stale = _error(
            await session.call_tool(
                "erp_product_setup",
                {**setup, "idempotency_key": "transport-product-setup-0002"},
            )
        )
        assert "stale product row_version" in stale

        activation = {
            "product_id": IDS["product"],
            "row_version": 2,
            "manufacturer_traceability_code": "MFG-REVIEW-42",
            "idempotency_key": "transport-product-activate-0001",
        }
        activated = _body(await session.call_tool("erp_product_activate", activation))
        activation_replay = _body(
            await session.call_tool("erp_product_activate", activation)
        )
        assert activated["lifecycle_status"] == "active"
        assert activation_replay["idempotency_replayed"] is True
        activated_readback = _body(
            await session.call_tool(
                "erp_product_setup_get", {"product_id": IDS["product"]}
            )
        )
        assert activated_readback["lifecycle_status"] == "active"
        assert activated_readback["row_version"] == activated["row_version"]

        customer = _body(
            await session.call_tool(
                "erp_customer_create",
                {
                    "customer_name": "Exact Medical Store",
                    "customer_type": "organization",
                    "primary_phone": "9810000001",
                    "primary_email": None,
                    "contact_person_name": None,
                    "address_line1": None,
                    "address_line2": None,
                    "city": None,
                    "state_code": None,
                    "pincode": None,
                    "gst_number": None,
                    "pan_number": None,
                    "credit_limit": "0",
                    "credit_days": 0,
                    "idempotency_key": "transport-customer-create-0001",
                },
            )
        )
        assert customer["customer_code"] == "CUS-000001"
        customer_readback = _body(
            await session.call_tool(
                "erp_customer_get", {"customer_account_id": IDS["customer"]}
            )
        )
        assert customer_readback["customer_name"] == "Exact Medical Store"

        supplier = _body(
            await session.call_tool(
                "erp_supplier_create",
                {
                    "supplier_name": "Exact Pharma Supply",
                    "primary_phone": None,
                    "primary_email": None,
                    "contact_person": None,
                    "address_line1": None,
                    "address_line2": None,
                    "city": None,
                    "state_code": None,
                    "pincode": None,
                    "gst_number": None,
                    "pan_number": None,
                    "payment_days": 30,
                    "idempotency_key": "transport-supplier-create-0001",
                },
            )
        )
        assert supplier["supplier_code"] == "SUP-000001"
        supplier_readback = _body(
            await session.call_tool(
                "erp_supplier_get", {"supplier_account_id": IDS["supplier"]}
            )
        )
        assert supplier_readback["supplier_name"] == "Exact Pharma Supply"


@pytest.mark.asyncio
async def test_bill_review_asks_for_context_handles_ambiguity_and_skip_then_enters_purchase_chain() -> None:
    gateway = ScenarioGateway()
    async with _session(gateway) as session:
        missing = _bill_mapping()
        missing["unresolved_fields"] = [
            {
                "path": "lines.line-1.source_fields.batch",
                "reason": "The batch text is illegible.",
                "required_for": ["goods_receipt", "supplier_invoice"],
            }
        ]
        missing["lines"][0]["uncertain_fields"] = ["batch"]
        needs_context = _body(
            await session.call_tool(
                "erp_purchase_bill_mapping_review", {"mapping": missing}
            )
        )
        assert needs_context["status"] == "needs_context"
        assert "unresolved_fields:lines.line-1.source_fields.batch" in (
            needs_context["next_steps"][1]["blockers"]
        )

        ambiguous = _bill_mapping()
        ambiguous["supplier_resolution"] = {
            "status": "unresolved",
            "supplier_id": None,
            "canonical_name": None,
            "proposed_supplier_name": None,
            "candidate_supplier_ids": [IDS["supplier"], str(uuid4())],
            "skip_reason": None,
        }
        ambiguous_result = _body(
            await session.call_tool(
                "erp_purchase_bill_mapping_review", {"mapping": ambiguous}
            )
        )
        assert ambiguous_result["status"] == "needs_context"
        assert len(
            ambiguous_result["mapping"]["supplier_resolution"][
                "candidate_supplier_ids"
            ]
        ) == 2
        assert "supplier_unresolved" in ambiguous_result["next_steps"][0]["blockers"]

        skipped = _bill_mapping()
        skipped["lines"][0]["product_resolution"] = {
            "status": "skipped",
            "product_id": None,
            "canonical_name": None,
            "candidate_product_ids": [],
            "proposed_product": None,
            "skip_reason": "User chose to exclude the illegible line.",
        }
        denied_skip = _error(
            await session.call_tool(
                "erp_purchase_bill_mapping_review", {"mapping": skipped}
            )
        )
        assert "explicit skip permission" in denied_skip
        skipped["explicit_skip_permission"] = True
        allowed_skip = _body(
            await session.call_tool(
                "erp_purchase_bill_mapping_review", {"mapping": skipped}
            )
        )
        assert "line_skipped:line-1" in allowed_skip["next_steps"][0]["blockers"]

        reviewed = _body(
            await session.call_tool(
                "erp_purchase_bill_mapping_review", {"mapping": _bill_mapping()}
            )
        )
        assert reviewed["status"] == "ready_for_canonical_prepare_validation"
        purchase = {
            "idempotency_key": "transport-purchase-order-0001",
            "branch_id": IDS["branch"],
            "order_date": "2026-08-29",
            "document_discount": _document_discount(),
            "rounding_policy": "nearest_rupee",
            "zero_rated_payment_mode": "not_applicable",
            "supplier_account_id": reviewed["mapping"]["supplier_resolution"][
                "supplier_id"
            ],
            "tax_charge_mechanism": "normal",
            "expected_on": "2026-08-31",
            "lines": [_commercial_line()],
        }
        prepared = _body(await session.call_tool("erp_purchase_order_prepare", purchase))
        assert prepared["status"] == "prepared"
        assert prepared["approval_policy"] == "actor_confirmation"
        assert not any(
            name in {"erp_operation_approve", "erp_operation_execute"}
            for _, name, _ in gateway.calls
        )


@pytest.mark.asyncio
async def test_sales_invoice_prepare_and_review_preserve_same_product_multi_batch_allocations() -> None:
    gateway = ScenarioGateway()
    line = {
        **_commercial_line(),
        "fulfillment_source": "direct_issue",
        "batch_allocation_mode": "explicit_fefo",
        "batch_allocations": [
            {
                "batch_id": IDS["batch-one"],
                "billed_quantity": "6",
                "free_quantity": "1",
            },
            {
                "batch_id": IDS["batch-two"],
                "billed_quantity": "4",
                "free_quantity": "0",
            },
        ],
    }
    invoice = {
        "idempotency_key": "transport-sales-invoice-0001",
        "branch_id": IDS["branch"],
        "invoice_date": "2026-08-29",
        "document_discount": _document_discount(),
        "rounding_policy": "nearest_rupee",
        "zero_rated_payment_mode": "not_applicable",
        "customer_account_id": IDS["customer"],
        "delivery_address_id": IDS["address"],
        "delivery_address_row_version": "1",
        "tax_charge_mechanism": "normal",
        "lines": [line],
    }
    async with _session(gateway) as session:
        prepared = _body(await session.call_tool("erp_sales_invoice_prepare", invoice))
        replayed = _body(await session.call_tool("erp_sales_invoice_prepare", invoice))
        assert replayed["command_request_id"] == prepared["command_request_id"]
        assert replayed["idempotency_replayed"] is True
        reviewed = _body(
            await session.call_tool(
                "erp_operation_review_get",
                {"command_request_id": prepared["command_request_id"]},
            )
        )
        allocations = reviewed["input"]["lines"][0]["batch_allocations"]
        assert [row["batch_id"] for row in allocations] == [
            IDS["batch-one"],
            IDS["batch-two"],
        ]
        assert sum(int(row["billed_quantity"]) for row in allocations) == 10

        posted = _body(
            await session.call_tool(
                "erp_sales_invoice_get",
                {
                    "branch_id": IDS["branch"],
                    "sales_invoice_id": IDS["invoice"],
                    "invoice_number": None,
                    "fiscal_year": None,
                },
            )
        )
        assert posted["match_state"] == "matched"

        missing_customer = dict(invoice)
        missing_customer.pop("customer_account_id")
        assert "customer_account_id" in _error(
            await session.call_tool("erp_sales_invoice_prepare", missing_customer)
        )


@pytest.mark.asyncio
async def test_sales_and_purchase_return_prepare_and_command_bound_readback() -> None:
    gateway = ScenarioGateway()
    sales_return = {
        "idempotency_key": "transport-sales-return-0001",
        "branch_id": IDS["branch"],
        "return_date": "2026-08-29",
        "original_invoice_id": IDS["invoice"],
        "reason_code": "quality",
        "gst_tax_treatment": "commercial_only",
        "lines": [
            {
                "original_invoice_line_id": IDS["invoice-line"],
                "fulfillment_source": "dispatch_allocated",
                "invoice_dispatch_allocation_id": IDS["dispatch-allocation"],
                "billed_quantity": "2",
                "free_quantity": "0",
                "batch_allocation": {
                    "batch_id": IDS["batch-one"],
                    "billed_quantity": "2",
                    "free_quantity": "0",
                },
                "to_location_id": IDS["location"],
                "return_condition": "sealed_resaleable",
            }
        ],
    }
    purchase_return = {
        "idempotency_key": "transport-purchase-return-0001",
        "branch_id": IDS["branch"],
        "return_date": "2026-08-29",
        "return_source_kind": "invoiced",
        "original_supplier_invoice_id": IDS["supplier-invoice"],
        "reason_code": "wrong_supply",
        "gst_tax_treatment": "commercial_only",
        "supplier_destination_address_id": IDS["address"],
        "logistics": {"transport_mode": "road", "distance_km": "12.50"},
        "lines": [
            {
                "goods_receipt_line_id": IDS["goods-receipt-line"],
                "supplier_invoice_receipt_allocation_id": IDS[
                    "supplier-invoice-allocation"
                ],
                "billed_quantity": "3",
                "free_quantity": "0",
                "batch_allocation": {
                    "batch_id": IDS["batch-two"],
                    "billed_quantity": "3",
                    "free_quantity": "0",
                },
                "from_location_id": IDS["location"],
            }
        ],
    }
    async with _session(gateway) as session:
        sales = _body(
            await session.call_tool("erp_sales_return_prepare", sales_return)
        )
        purchase = _body(
            await session.call_tool("erp_purchase_return_prepare", purchase_return)
        )
        assert sales["approval_policy"] == "separate_approver"
        assert purchase["approval_policy"] == "separate_approver"

        sales_readback = _body(
            await session.call_tool(
                "erp_sales_return_readback",
                {"command_request_id": sales["command_request_id"]},
            )
        )
        purchase_readback = _body(
            await session.call_tool(
                "erp_purchase_return_readback",
                {"command_request_id": purchase["command_request_id"]},
            )
        )
        assert sales_readback["input"]["lines"][0]["batch_allocation"][
            "batch_id"
        ] == IDS["batch-one"]
        assert purchase_readback["input"]["lines"][0]["batch_allocation"][
            "batch_id"
        ] == IDS["batch-two"]

        not_found = _error(
            await session.call_tool(
                "erp_sales_return_readback", {"command_request_id": str(uuid4())}
            )
        )
        assert "command not found" in not_found
