from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.domain.operator_actions import (
    ACTION_POLICIES,
    ActionContext,
    ActionErrorCode,
    OperatorActionError,
)
from app.infrastructure.operator_actions import (
    ACTION_ADAPTER_BINDINGS,
    SqlAlchemyOperatorActionService,
)
from app.infrastructure.operator_actions.calculator_database import (
    CALCULATOR_DATABASE_URL_ENV,
    calculator_database_configured,
    calculator_session_factory,
)
from app.infrastructure.operator_actions.runtime_database import (
    RUNTIME_DATABASE_URL_ENV,
    assert_runtime_principal,
    runtime_database_configured,
)
from app.infrastructure.operator_actions.sales_order import commercial_calculation_documents
from app.infrastructure.operator_actions.sales_invoice import (
    RESOLVE_SALES_INVOICE_PRODUCT_IDENTITIES_SQL,
    RESOLVE_SALES_INVOICE_SQL,
    authoritative_product_references,
)
from mcp_runtime.aasopharma_mcp.operator_actions import PREPARE_ACTIONS


PROJECTION_SQL = (
    Path(__file__).parents[3]
    / "backend/alembic/sql/20260826_0025_typed_command_read_projections.sql"
).read_text(encoding="utf-8")


class FakeResult:
    def __init__(self, rows=()):
        self._rows = list(rows)

    def mappings(self):
        return self

    def all(self):
        return list(self._rows)


class FakeTransaction:
    def __init__(self, session):
        self.session = session

    def __enter__(self):
        self.session.transaction_entries += 1
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.session.transaction_exits += 1
        if exc_type is not None:
            self.session.transaction_failures = getattr(
                self.session, "transaction_failures", 0
            ) + 1


class FakeSession:
    def __init__(self, *, authority_branch, command_row, audit_rows=(), approval_row=None):
        self.authority_branch = authority_branch
        self.command_row = command_row
        self.audit_rows = list(audit_rows)
        self.approval_row = approval_row
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        self.executions.append((sql, dict(parameters or {})))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
            },))
        if "erp_security.activate_context" in sql:
            return FakeResult()
        if "set_config('app.request_id'" in sql:
            return FakeResult()
        if "set_config('app.command_request_id'" in sql:
            return FakeResult()
        if "FROM automation.agent_grants AS grant_row" in sql:
            rows = [] if self.authority_branch is False else [
                {"branch_id": self.authority_branch}
            ]
            return FakeResult(rows)
        if "JOIN automation.command_approvals AS approval" in sql:
            return FakeResult(() if self.approval_row is None else (self.approval_row,))
        if "erp_automation_reads.approval_result" in sql:
            return FakeResult(() if self.approval_row is None else (self.approval_row,))
        if any(
            projection in sql
            for projection in (
                "erp_automation_reads.requester_command_status",
                "erp_automation_reads.reviewable_command",
                "erp_automation_reads.lock_requester_command",
            )
        ):
            return FakeResult(() if self.command_row is None else (self.command_row,))
        if "FROM automation.command_requests AS request" in sql:
            return FakeResult(() if self.command_row is None else (self.command_row,))
        if "FROM core.audit_events" in sql:
            return FakeResult(self.audit_rows)
        if "erp_automation_commands.approve_operator_command" in sql:
            return FakeResult(({"command_request_id": parameters["command_request_id"]},))
        if "erp_automation_commands.execute_approved_command" in sql:
            self.command_row.update(
                {
                    "status": "succeeded",
                    "result_resource_type": "sales_order",
                    "result_resource_id": uuid4(),
                    "completed_at": datetime.now(timezone.utc),
                }
            )
            return FakeResult(({"response_bytes": b"{}"},))
        if "erp_automation_commands.execute_inventory_destruction_command" in sql:
            self.command_row.update(
                {
                    "status": "succeeded",
                    "result_resource_type": "destruction",
                    "result_resource_id": uuid4(),
                    "completed_at": datetime.now(timezone.utc),
                }
            )
            return FakeResult(({"response_bytes": b"{}"},))
        raise AssertionError(f"Unexpected SQL: {sql}")


class FakeCalculatorSession:
    def __init__(self):
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "resolve_sales_order_prepare" in sql:
            request = json.loads(params["request_json"])
            line = request["lines"][0]
            tax_release_id = str(uuid4())
            resolved_lines = [{
                "line_number": 1,
                "line_kind": "product",
                "line_id": line["line_id"],
                "product_id": line["product_id"],
                "product_row_version": 6,
                "hsn_code": "3004",
                "uom_conversion_id": line["uom_conversion_id"],
                "uom_code": "BOX",
                "to_uom_code": "TABLET",
                "multiplier": "10.000000",
                "uom_valid_from": "2026-04-01",
                "uom_valid_until": None,
                "tax_code_version_id": str(uuid4()),
                "tax_version_number": 8,
                "tax_effective_from": "2026-04-01",
                "tax_effective_to": None,
                "tax_release_id": tax_release_id,
                "tax_release_ruleset_version": "gst-rules-1",
                "taxability": "taxable",
                "gst_rate": "18.000000",
                "cess_rate": "0.000000",
                "ruleset_version": "gst-rules-1",
                "input": line,
            }]
            if request["charge_lines"]:
                charge = request["charge_lines"][0]
                resolved_lines.append({
                    "line_number": 2,
                    "line_kind": "charge",
                    "line_id": charge["line_id"],
                    "charge_code": charge["charge_code"],
                    "charge_tax_profile_id": str(uuid4()),
                    "charge_tax_profile_row_version": 2,
                    "charge_tax_profile_effective_from": "2026-04-01",
                    "charge_tax_profile_effective_to": None,
                    "sac_code": "9965",
                    "tax_code_version_id": str(uuid4()),
                    "tax_version_number": 3,
                    "tax_effective_from": "2026-04-01",
                    "tax_effective_to": None,
                    "tax_release_id": tax_release_id,
                    "tax_release_ruleset_version": "gst-rules-1",
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "0.000000",
                    "ruleset_version": "gst-rules-1",
                    "input": charge,
                })
            return FakeResult(
                ({
                    "resolution": {
                        "branch_id": request["branch_id"],
                        "branch_row_version": 4,
                        "branch_state_code": "27",
                        "supply_type": "inter_state",
                        "zero_rated_payment_mode": request["zero_rated_payment_mode"],
                        "customer_party_id": str(uuid4()),
                        "customer_account_id": request["customer_account_id"],
                        "customer_account_row_version": 3,
                        "customer_tax_registration_id": str(uuid4()),
                        "customer_tax_registration_row_version": 7,
                        "customer_taxpayer_type": "regular",
                        "billing_address_id": str(uuid4()),
                        "billing_address_row_version": 2,
                        "shipping_address_id": str(uuid4()),
                        "shipping_address_row_version": 5,
                        "shipping_state_code": "29",
                        "order_date": request["order_date"],
                        "ruleset_version": "gst-rules-1",
                        "lines": resolved_lines,
                    }
                },)
            )
        if "persist_sales_order_prepare" in sql:
            return FakeResult(
                ({"command_request_id": {
                    "command_request_id": str(params["command_request_id"]),
                    "expires_at": params["expires_at"].isoformat(),
                    "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                    "replayed": False,
                }},)
            )
        raise AssertionError(f"Unexpected calculator SQL: {sql}")


class FakeSalesInvoiceSession:
    def __init__(self, *, fail_persist=False, resolve_error=None):
        self.fail_persist = fail_persist
        self.resolve_error = resolve_error
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0
        self.auto_batch_id = str(uuid4())

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "resolve_sales_invoice_prepare" in sql:
            if self.resolve_error is not None:
                raise self.resolve_error
            request = json.loads(params["request_json"])
            resolved_lines = []
            direct_count = 0
            for index, source in enumerate(request["lines"], start=1):
                product_line = {
                    "line_number": index,
                    "line_kind": "product",
                    "line_id": source["line_id"],
                    "order_line_id": str(uuid4()),
                    "product_id": source["product_id"],
                    "product_row_version": 4,
                    "uom_conversion_id": source["uom_conversion_id"],
                    "uom_code": "BOX",
                    "multiplier": "10.000000",
                    "hsn_code": "3004",
                    "tax_code_version_id": str(uuid4()),
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "0.000000",
                    "input": source,
                    "fulfillment_source": source["fulfillment_source"],
                }
                if source["fulfillment_source"] == "direct_issue":
                    direct_count += 1
                    allocation = (source.get("batch_allocations") or [{
                        "batch_id": self.auto_batch_id,
                        "billed_quantity": source["billed_quantity"],
                        "free_quantity": source["free_quantity"],
                    }])[0]
                    product_line["batch_allocation_mode"] = source[
                        "batch_allocation_mode"
                    ]
                    product_line["batch_allocations"] = [{
                        **allocation,
                        "line_number": direct_count,
                        "base_billed_quantity": "20.000000",
                        "base_free_quantity": "10.000000",
                        "unit_cost": "12.5000",
                        "extended_cost": "375.00",
                    }]
                    product_line["dispatch_allocations"] = []
                else:
                    product_line["batch_allocations"] = []
                    product_line["dispatch_allocations"] = source[
                        "dispatch_allocations"
                    ]
                resolved_lines.append(product_line)
            for index, charge in enumerate(
                request.get("charge_lines", ()), start=len(resolved_lines) + 1
            ):
                resolved_lines.append({
                    "line_number": index,
                    "line_kind": "charge",
                    "line_id": charge["line_id"],
                    "charge_code": charge["charge_code"],
                    "sac_code": "9965",
                    "tax_code_version_id": str(uuid4()),
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "0.000000",
                    "input": {
                        **charge,
                        "charge_code": charge["charge_code"],
                    },
                })
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "supply_type": "inter_state",
                "zero_rated_payment_mode": request["zero_rated_payment_mode"],
                "ruleset_version": "gst-rules-1",
                "lines": resolved_lines,
                "total_abs_base_quantity": (
                    f"{direct_count * 30:.6f}"
                ),
                "total_inventory_value": (
                    f"{direct_count * 375:.2f}"
                ),
                "legal_scope": {
                    "tax_charge_mechanism": "normal",
                    "export_supported": False,
                    "sez_without_payment_supported": False,
                },
                "source_versions": [
                    {"resource_type": "branch", "id": request["branch_id"], "row_version": 3},
                    {"resource_type": "account_role", "role": "sales_revenue", "id": str(uuid4()), "row_version": 2},
                    *(
                        {
                            "resource_type": "product",
                            "id": line["product_id"],
                            "row_version": 4,
                        }
                        for line in resolved_lines
                        if line["line_kind"] == "product"
                    ),
                ],
            }},))
        if "resolve_sales_invoice_product_identities" in sql:
            resolution = json.loads(params["resolution_json"])
            return FakeResult(({"product_references": [
                {
                    "resource_type": "product",
                    "id": line["product_id"],
                    "row_version": line["product_row_version"],
                    "product_code": f"PROD-{index:06d}",
                    "product_name": f"Canonical Product {index}",
                }
                for index, line in enumerate(resolution["lines"], start=1)
                if line["line_kind"] == "product"
            ]},))
        if "persist_sales_invoice_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected invoice calculator SQL: {sql}")


class FakeSalesReturnSession:
    def __init__(self, *, fail_persist=False):
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "resolve_sales_return_prepare" in sql:
            request = json.loads(params["request_json"])
            returned = request["lines"][0]
            source_line_id = returned["original_invoice_line_id"]
            original_request = {
                "zero_rated_payment_mode": "not_applicable",
                "rounding_policy": "none",
                "document_discount": {
                    "document_discount_kind": "none",
                    "document_discount_basis": "price_value",
                    "document_discount_value": "0",
                },
                "lines": [],
                "charge_lines": [],
            }
            original_resolution = {
                "supply_type": "intra_state",
                "ruleset_version": "gst-rules-1",
                "lines": [{
                    "line_kind": "product",
                    "line_id": source_line_id,
                    "input": {
                        "billed_quantity": "10",
                        "free_quantity": "2",
                        "quoted_unit_rate": "100",
                        "price_basis": "tax_exclusive",
                        "line_discount": {
                            "line_discount_kind": "none",
                            "line_discount_basis": "price_value",
                            "line_discount_value": "0",
                        },
                        "free_supply_tax_treatment": "excluded_from_taxable_value",
                        "document_discount_eligible": True,
                    },
                    "multiplier": "1.000000",
                    "gst_rate": "12.000000",
                    "cess_rate": "0.000000",
                    "taxability": "taxable",
                }],
            }
            original_input, original_output = commercial_calculation_documents(
                original_request,
                original_resolution,
                resource_id=uuid4(),
                operation="sales.invoice.post",
                resource_type="sales_invoice",
            )
            allocation = returned["batch_allocation"]
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "customer_account_id": str(uuid4()),
                "invoice_id": request["original_invoice_id"],
                "return_date": request["return_date"],
                "reason_code": request["reason_code"],
                "gst_adjustment_rule_version_id": str(uuid4()),
                "gst_tax_treatment": request["gst_tax_treatment"],
                "zero_rated_payment_mode": "not_applicable",
                "tax_charge_mechanism": "normal",
                "rounding_policy": "none",
                "ruleset_version": "gst-rules-1",
                "original_calculation_input": original_input,
                "original_calculation_output": original_output,
                "prior_state": {"products": [], "charges": [], "rounding_adjustment": "0.00"},
                "legal_scope": {
                    "country_code": "IN",
                    "fulfillment_source": "dispatch_allocated",
                    "disposition": "return_to_stock",
                    "destination_location_type": "quarantine",
                    "gst_tax_treatment": request["gst_tax_treatment"],
                },
                "source_versions": [
                    {"resource_type": "sales_invoice", "id": request["original_invoice_id"], "row_version": 2},
                    {"resource_type": "gst_adjustment_rule", "id": str(uuid4()), "rule_version": "1"},
                ],
                "lines": [{
                    "line_number": 1,
                    "line_id": returned["line_id"],
                    "original_invoice_line_id": source_line_id,
                    "invoice_dispatch_allocation_id": returned["invoice_dispatch_allocation_id"],
                    "product_id": str(uuid4()),
                    "batch_id": allocation["batch_id"],
                    "to_location_id": returned["to_location_id"],
                    "uom_code": "BOX",
                    "uom_conversion_factor": "1.000000",
                    "billed_quantity": returned["billed_quantity"],
                    "free_quantity": returned["free_quantity"],
                    "base_billed_quantity": returned["billed_quantity"],
                    "base_free_quantity": returned["free_quantity"],
                    "final_residual": False,
                    "unit_cost": "25.0000",
                    "extended_cost": "75.00",
                }],
            }},))
        if "persist_sales_return_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("sales return persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected sales return calculator SQL: {sql}")


class FakePurchaseReturnSession:
    def __init__(self, *, fail_persist=False):
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "resolve_purchase_return_prepare" in sql:
            request = json.loads(params["request_json"])
            returned = request["lines"][0]
            source_line_id = str(uuid4())
            original_request = {
                "zero_rated_payment_mode": "not_applicable",
                "rounding_policy": "none",
                "document_discount": {
                    "document_discount_kind": "none",
                    "document_discount_basis": "price_value",
                    "document_discount_value": "0",
                },
                "lines": [],
                "charge_lines": [],
            }
            original_resolution = {
                "supply_type": "intra_state",
                "ruleset_version": "gst-rules-1",
                "lines": [{
                    "line_kind": "product",
                    "line_id": source_line_id,
                    "input": {
                        "billed_quantity": "10",
                        "free_quantity": "2",
                        "quoted_unit_rate": "100",
                        "price_basis": "tax_exclusive",
                        "line_discount": {
                            "line_discount_kind": "none",
                            "line_discount_basis": "price_value",
                            "line_discount_value": "0",
                        },
                        "free_supply_tax_treatment": "excluded_from_taxable_value",
                        "document_discount_eligible": True,
                    },
                    "multiplier": "1.000000",
                    "gst_rate": "12.000000",
                    "cess_rate": "0.000000",
                    "taxability": "taxable",
                }],
            }
            original_input, original_output = commercial_calculation_documents(
                original_request,
                original_resolution,
                resource_id=uuid4(),
                operation="procurement.supplier_invoice.post",
                resource_type="supplier_invoice",
            )
            allocation = returned["batch_allocation"]
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "supplier_account_id": str(uuid4()),
                "supplier_invoice_id": request["original_supplier_invoice_id"],
                "return_date": request["return_date"],
                "reason_code": request["reason_code"],
                "return_source_kind": "invoiced",
                "gst_adjustment_rule_version_id": str(uuid4()),
                "gst_tax_treatment": request["gst_tax_treatment"],
                "zero_rated_payment_mode": "not_applicable",
                "tax_charge_mechanism": "normal",
                "rounding_policy": "none",
                "ruleset_version": "gst-rules-1",
                "original_calculation_input": original_input,
                "original_calculation_output": original_output,
                "prior_state": {
                    "products": [],
                    "charges": [],
                    "rounding_adjustment": "0.00",
                },
                "legal_scope": {
                    "country_code": "IN",
                    "return_source_kind": "invoiced",
                    "physical_stock": "released_unexpired_original_grn_location",
                    "gst_tax_treatment": request["gst_tax_treatment"],
                },
                "source_versions": [
                    {
                        "resource_type": "supplier_invoice",
                        "id": request["original_supplier_invoice_id"],
                        "row_version": 2,
                    },
                    {
                        "resource_type": "supplier_invoice_receipt_allocation",
                        "id": returned["supplier_invoice_receipt_allocation_id"],
                        "prior_returned_base_billed_quantity": "0.000000",
                        "prior_returned_base_free_quantity": "0.000000",
                    },
                ],
                "lines": [{
                    "line_number": 1,
                    "line_id": returned["line_id"],
                    "supplier_invoice_line_id": source_line_id,
                    "goods_receipt_line_id": returned["goods_receipt_line_id"],
                    "supplier_invoice_receipt_allocation_id": returned[
                        "supplier_invoice_receipt_allocation_id"
                    ],
                    "product_id": str(uuid4()),
                    "batch_id": allocation["batch_id"],
                    "from_location_id": returned["from_location_id"],
                    "uom_code": "BOX",
                    "uom_conversion_factor": "1.000000",
                    "billed_quantity": returned["billed_quantity"],
                    "free_quantity": returned["free_quantity"],
                    "base_billed_quantity": returned["billed_quantity"],
                    "base_free_quantity": returned["free_quantity"],
                    "final_residual": False,
                    "unit_cost": "25.0000",
                    "extended_cost": "75.00",
                }],
            }},))
        if "persist_purchase_return_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("purchase return persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected purchase return calculator SQL: {sql}")


class FakePurchaseOrderSession:
    def __init__(
        self,
        *,
        fail_persist=False,
        supply_type="inter_state",
        taxability="taxable",
    ):
        self.fail_persist = fail_persist
        self.supply_type = supply_type
        self.taxability = taxability
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "resolve_purchase_order_prepare" in sql:
            request = json.loads(params["request_json"])
            product = request["lines"][0]
            charge = request["charge_lines"][0]
            source_versions = [
                {"resource_type": "branch", "id": request["branch_id"], "row_version": 3},
                {"resource_type": "supplier_account", "id": request["supplier_account_id"], "row_version": 4},
                {"resource_type": "supplier_tax_registration", "id": str(uuid4()), "row_version": 2, "taxpayer_type": "regular"},
                {"resource_type": "product", "id": product["product_id"], "row_version": 6},
                {"resource_type": "commercial_charge_tax_profile", "id": str(uuid4()), "row_version": 2, "charge_code": charge["charge_code"]},
            ]
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "order_date": request["order_date"],
                "expected_on": request["expected_on"],
                "supply_type": self.supply_type,
                "zero_rated_payment_mode": "not_applicable",
                "tax_charge_mechanism": "normal",
                "supplier_account_id": request["supplier_account_id"],
                "ruleset_version": "gst-rules-1",
                "legal_scope": {
                    "country": "IN",
                    "normal_charge": True,
                    "import_supported": False,
                    "sez_supported": False,
                    "reverse_charge_supported": False,
                },
                "source_versions": source_versions,
                "lines": [{
                    "line_number": 1,
                    "line_kind": "product",
                    "line_id": product["line_id"],
                    "product_id": product["product_id"],
                    "product_row_version": 6,
                    "hsn_code": "3004",
                    "uom_conversion_id": product["uom_conversion_id"],
                    "uom_code": "BOX",
                    "to_uom_code": "TABLET",
                    "multiplier": "10.000000",
                    "tax_code_version_id": str(uuid4()),
                    "taxability": self.taxability,
                    "gst_rate": "18.000000" if self.taxability == "taxable" else "0.000000",
                    "cess_rate": "0.000000",
                    "input": product,
                }, {
                    "line_number": 2,
                    "line_kind": "charge",
                    "line_id": charge["line_id"],
                    "charge_code": charge["charge_code"],
                    "sac_code": "9965",
                    "tax_code_version_id": str(uuid4()),
                    "taxability": self.taxability,
                    "gst_rate": "18.000000" if self.taxability == "taxable" else "0.000000",
                    "cess_rate": "0.000000",
                    "input": charge,
                }],
            }},))
        if "persist_purchase_order_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("purchase persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected purchase calculator SQL: {sql}")


class FakeSupplierInvoiceSession:
    def __init__(self, *, fail_persist=False):
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "resolve_supplier_invoice_prepare" in sql:
            request = json.loads(params["request_json"])
            product = request["lines"][0]
            charge = request["expense_charge_lines"][0]
            purchase_order_id = str(uuid4())
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "supplier_account_id": request["supplier_account_id"],
                "purchase_order_id": purchase_order_id,
                "goods_receipt_ids": request["goods_receipt_ids"],
                "supplier_tax_registration_id": request[
                    "supplier_tax_registration_id"
                ],
                "portal_document_line_id": request["portal_document_line_id"],
                "invoice_date": request["invoice_date"],
                "received_date": request["received_date"],
                "due_date": "2026-09-19",
                "supply_type": "inter_state",
                "zero_rated_payment_mode": "not_applicable",
                "tax_charge_mechanism": "normal",
                "ruleset_version": "gst-rules-1",
                "legal_scope": {
                    "country": "IN",
                    "currency": "INR",
                    "normal_charge": True,
                    "posted_grn_match_required": True,
                    "gstr2b_required": True,
                    "itc_business_use_attestation_required": True,
                    "landed_cost_supported": False,
                    "import_supported": False,
                    "sez_supported": False,
                    "reverse_charge_supported": False,
                },
                "source_versions": [
                    {
                        "resource_type": "purchase_order",
                        "id": purchase_order_id,
                        "row_version": 4,
                    },
                    {
                        "resource_type": "goods_receipt",
                        "id": request["goods_receipt_ids"][0],
                        "row_version": 2,
                    },
                    {
                        "resource_type": "gstr2b_portal_line",
                        "id": request["portal_document_line_id"],
                        "source_row_hash": "ab" * 32,
                    },
                ],
                "lines": [{
                    "line_number": 1,
                    "line_kind": "product",
                    "line_id": product["line_id"],
                    "purchase_order_line_id": str(uuid4()),
                    "product_id": str(uuid4()),
                    "hsn_code": "3004",
                    "uom_code": "BOX",
                    "multiplier": "10.000000",
                    "tax_code_version_id": str(uuid4()),
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "0.000000",
                    "receipt_cost": "300.00",
                    "receipt_allocations": [{
                        "allocation_id": product["allocation_id"],
                        "goods_receipt_line_id": product["goods_receipt_line_id"],
                        "allocated_base_billed_quantity": product[
                            "allocated_base_billed_quantity"
                        ],
                        "allocated_base_free_quantity": product[
                            "allocated_base_free_quantity"
                        ],
                        "receipt_unit_cost": "10.0000",
                        "location_id": str(uuid4()),
                        "product_id": str(uuid4()),
                        "batch_id": str(uuid4()),
                        "stock_on_hand_quantity": "30.000000",
                        "stock_inventory_value": "300.00",
                        "stock_average_unit_cost": "10.0000",
                        "stock_row_version": 3,
                        "exact_receipt_source_provenance": True,
                        "landed_cost_lineage": {
                            "contract_version": "supplier_invoice_landed_cost_lineage_v1",
                            "source_identity_count": 1,
                            "target_identity_count": 1,
                            "source_quantity_basis": "30.000000",
                            "source_value_basis": "300.00",
                            "remaining_quantity_basis": "30.000000",
                            "remaining_value_basis": "300.00",
                            "targets": [{
                                "location_id": str(uuid4()),
                                "branch_id": request["branch_id"],
                                "product_id": str(uuid4()),
                                "batch_id": str(uuid4()),
                                "uom_code": "BOX",
                                "on_hand_quantity": "30.000000",
                                "inventory_value": "300.00",
                                "average_unit_cost": "10.0000",
                                "stock_row_version": 3,
                                "last_ledger_entry_id": str(uuid4()),
                                "origin_location_id": str(uuid4()),
                                "origin_product_id": str(uuid4()),
                                "origin_batch_id": str(uuid4()),
                                "origin_allocated_quantity": "30.000000",
                                "origin_allocated_value": "300.00",
                            }],
                        },
                    }],
                    "inventory_cost_treatment": "capitalize",
                    "landed_cost_allocation_method": "direct",
                    "net_value_account_id": str(uuid4()),
                    "input": product,
                }, {
                    "line_number": 2,
                    "line_kind": "charge",
                    "line_id": charge["line_id"],
                    "charge_code": charge["expense_charge_code"],
                    "sac_code": "9965",
                    "tax_code_version_id": str(uuid4()),
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "0.000000",
                    "inventory_cost_treatment": "expense",
                    "net_value_account_id": charge["net_value_account_id"],
                    "input": {
                        **charge,
                        "charge_code": charge["expense_charge_code"],
                        "price_basis": charge["expense_price_basis"],
                        "document_discount_eligible": charge[
                            "expense_document_discount_eligible"
                        ],
                    },
                }],
            }},))
        if "persist_supplier_invoice_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("supplier invoice persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected supplier invoice calculator SQL: {sql}")


class FakeDispatchSession:
    def __init__(self):
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
            },))
        if "resolve_sales_dispatch_prepare" in sql:
            request = json.loads(params["request_json"])
            source_line = request["lines"][0]
            source_allocation = source_line["batch_allocations"][0]
            product_id = str(uuid4())
            batch_id = source_allocation["batch_id"]
            source_versions = [
                {"resource_type": "sales_order", "id": request["sales_order_id"], "row_version": 2},
                {"resource_type": "manufacturer_batch", "id": batch_id, "row_version": 4},
                {
                    "resource_type": "stock_balance",
                    "batch_id": batch_id,
                    "row_version": 7,
                    "on_hand_quantity": "100.000000",
                    "average_unit_cost": "12.5000",
                },
            ]
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "branch_row_version": 3,
                "sales_order_id": request["sales_order_id"],
                "sales_order_row_version": 2,
                "customer_account_id": str(uuid4()),
                "shipping_address_id": str(uuid4()),
                "cost_of_goods_sold_account_id": str(uuid4()),
                "inventory_asset_account_id": str(uuid4()),
                "from_location_id": request["from_location_id"],
                "dispatch_date": request["dispatch_date"],
                "origin": {"line1": "Origin", "line2": None, "city": "Mumbai", "state_code": "27", "pincode": "400001"},
                "destination": {"line1": "Destination", "line2": None, "city": "Pune", "state_code": "27", "pincode": "411001"},
                "transport_mode": "road",
                "distance_km": "150.00",
                "transporter_party_id": request["logistics"]["transporter_party_id"],
                "transporter_name": "Reviewed Carrier",
                "transporter_gstin": "27ABCDE1234F1Z5",
                "vehicle_number": request["logistics"]["vehicle_number"],
                "vehicle_type": request["logistics"]["vehicle_type"],
                "transport_document_number": None,
                "transport_document_date": None,
                "total_abs_base_quantity": "30.000000",
                "total_value": "375.00",
                "source_versions": source_versions,
                "lines": [{
                    "sales_order_line_id": source_line["sales_order_line_id"],
                    "order_line_number": 1,
                    "product_id": product_id,
                    "uom_code": "BOX",
                    "uom_conversion_factor": "10.000000",
                    "billed_quantity": source_line["billed_quantity"],
                    "free_quantity": source_line["free_quantity"],
                    "quoted_unit_rate": "100.0000",
                    "price_basis": "tax_exclusive",
                    "free_supply_tax_treatment": "excluded_from_taxable_value",
                    "tax_code_version_id": str(uuid4()),
                    "taxability_snapshot": "taxable",
                    "cgst_rate": "9.000000",
                    "sgst_rate": "9.000000",
                    "igst_rate": "0.000000",
                    "cess_rate": "0.000000",
                    "batch_allocations": [{
                        "line_number": 1,
                        "dispatch_line_id": source_allocation["dispatch_line_id"],
                        "inventory_line_id": source_allocation["inventory_line_id"],
                        "batch_id": batch_id,
                        "batch_number": "BATCH-1",
                        "batch_row_version": 4,
                        "expires_on": "2027-08-01",
                        "billed_quantity": source_allocation["billed_quantity"],
                        "free_quantity": source_allocation["free_quantity"],
                        "base_billed_quantity": "20.000000",
                        "base_free_quantity": "10.000000",
                        "stock_balance_row_version": 7,
                        "on_hand_quantity": "100.000000",
                        "inventory_value": "1250.00",
                        "unit_cost": "12.5000",
                        "extended_cost": "375.00",
                    }],
                }],
            }},))
        if "persist_sales_dispatch_prepare" in sql:
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected dispatch SQL: {sql}")


class FailingDispatchSession(FakeDispatchSession):
    def execute(self, statement, parameters=None):
        if "persist_sales_dispatch_prepare" in str(statement):
            raise RuntimeError("simulated persistence failure")
        return super().execute(statement, parameters)


class FakeCustomerReceiptSession:
    def __init__(self, *, authority_branch=None, fail_persist=False):
        self.authority_branch = authority_branch
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
            },))
        if "erp_security.activate_context" in sql:
            return FakeResult()
        if "FROM automation.agent_grants AS grant_row" in sql:
            return FakeResult(({"branch_id": self.authority_branch},))
        if "resolve_customer_receipt_prepare" in sql:
            request = json.loads(params["request_json"])
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "payment_id": request["payment_id"],
                "payment_date": request["payment_date"],
                "customer_account_id": request["customer_account_id"],
                "customer_party_id": str(uuid4()),
                "bank_account_id": request["bank_account_id"],
                "settlement_account_id": request["settlement_account_id"],
                "accounts_receivable_account_id": str(uuid4()),
                "payment_method": request["payment_method"],
                "external_reference": request["external_reference"].upper(),
                "amount": request["amount"],
                "currency_code": "INR",
                "allocations": [
                    {
                        "allocation_id": item["allocation_id"],
                        "open_item_id": item["open_item_id"],
                        "invoice_id": str(uuid4()),
                        "document_number": f"INV-{index}",
                        "principal_amount": "200.00",
                        "prior_allocated_amount": "25.00",
                        "amount": item["amount"],
                        "residual_after": str(
                            175 - float(item["amount"])
                        ),
                    }
                    for index, item in enumerate(request["allocations"], start=1)
                ],
                "legal_scope": {
                    "country_code": "IN",
                    "currency_code": "INR",
                    "settlement": "fully_allocated_non_cash",
                },
                "source_versions": [
                    {"resource_type": "customer_account", "id": request["customer_account_id"], "row_version": 3},
                    {"resource_type": "bank_account", "id": request["bank_account_id"], "row_version": 2},
                    {"resource_type": "receivable_allocation_state", "id": request["allocations"][0]["open_item_id"], "allocation_count": 1, "active_allocated_amount": "25.00"},
                ],
            }},))
        if "persist_customer_receipt_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("customer receipt persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected customer receipt SQL: {sql}")


class FakeSupplierPaymentSession:
    def __init__(self, *, authority_branch=None, fail_persist=False):
        self.authority_branch = authority_branch
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
            },))
        if "erp_security.activate_context" in sql:
            return FakeResult()
        if "FROM automation.agent_grants AS grant_row" in sql:
            return FakeResult(({"branch_id": self.authority_branch},))
        if "resolve_supplier_payment_prepare" in sql:
            request = json.loads(params["request_json"])
            supplier_party_id = str(uuid4())
            payable_account_id = str(uuid4())
            allocations = []
            sources = [
                {
                    "resource_type": "supplier_account",
                    "id": request["supplier_account_id"],
                    "row_version": 4,
                },
                {
                    "resource_type": "payment_date_fiscal_tax_fact",
                    "id": str(uuid4()),
                    "fiscal_year_start_year": 2026,
                    "prior_fiscal_year_turnover": "95000000.00",
                    "gst_tds_notified_deductor": False,
                },
                {
                    "resource_type": "bank_account",
                    "id": request["bank_account_id"],
                    "row_version": 2,
                },
            ]
            for index, item in enumerate(request["allocations"], start=1):
                invoice_id = str(uuid4())
                allocations.append({
                    "allocation_id": item["allocation_id"],
                    "cash_allocation_id": item["allocation_id"],
                    "open_item_id": item["open_item_id"],
                    "supplier_invoice_id": invoice_id,
                    "document_number": f"SUP-INV-{index}",
                    "principal_amount": "1000.00",
                    "prior_allocated_amount": "100.00",
                    "cash_amount": item["cash_amount"],
                    "residual_after": str(900 - float(item["cash_amount"])),
                })
                sources.extend((
                    {
                        "resource_type": "payable_allocation_state",
                        "id": item["open_item_id"],
                        "supplier_invoice_id": invoice_id,
                        "allocation_count": 1,
                        "active_cash_allocated_amount": "100.00",
                        "allocation_state_hash": "11" * 32,
                        "applicable_advance_state_hash": "22" * 32,
                    },
                    {
                        "resource_type": "invoice_credit_fiscal_tax_fact",
                        "id": str(uuid4()),
                        "supplier_invoice_id": invoice_id,
                        "credit_date": "2025-03-31" if index == 1 else "2026-04-01",
                        "prior_fiscal_year_turnover": "95000000.00",
                        "gst_tds_notified_deductor": False,
                    },
                ))
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "payment_id": request["payment_id"],
                "payment_date": request["payment_date"],
                "supplier_account_id": request["supplier_account_id"],
                "supplier_party_id": supplier_party_id,
                "bank_account_id": request["bank_account_id"],
                "settlement_account_id": str(uuid4()),
                "accounts_payable_account_id": payable_account_id,
                "payment_method": request["payment_method"],
                "external_reference": request["external_reference"].upper(),
                "gross_amount": request["expected_gross_amount"],
                "cash_amount": request["expected_gross_amount"],
                "withheld_amount": "0.00",
                "currency_code": "INR",
                "allocations": allocations,
                "settlement_components": allocations,
                "legal_scope": {
                    "country_code": "IN",
                    "currency_code": "INR",
                    "settlement": "posted_supplier_invoice_payables_only",
                    "income_tax_withholding": "not_applicable_verified",
                    "gst_tds": "not_applicable_verified",
                },
                "source_versions": sources,
            }},))
        if "persist_supplier_payment_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("supplier payment persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected supplier payment SQL: {sql}")


class FakeInventoryTransferSession:
    def __init__(self, *, fail_persist=False):
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({"role_name": "erp_runtime", "rolsuper": False, "rolbypassrls": False},))
        if "resolve_inventory_transfer_prepare" in sql:
            request = json.loads(params["request_json"])
            resolved_lines = []
            sources = [
                {"resource_type": "branch", "role": "source", "id": request["source_branch_id"], "row_version": 2},
                {"resource_type": "branch", "role": "destination", "id": request["destination_branch_id"], "row_version": 4},
            ]
            for product_line in request["lines"]:
                for allocation in product_line["batch_allocations"]:
                    resolved_lines.append({
                        "inventory_document_line_id": allocation["inventory_document_line_id"],
                        "product_id": product_line["product_id"],
                        "batch_id": allocation["batch_id"],
                        "base_quantity": allocation["entered_quantity"],
                        "unit_cost": "2.5000",
                        "extended_cost": "0.25",
                    })
                    sources.append({
                        "resource_type": "stock_balance",
                        "id": str(uuid4()),
                        "batch_id": allocation["batch_id"],
                        "row_version": 8,
                    })
            return FakeResult(({"resolution": {
                "source_branch_id": request["source_branch_id"],
                "destination_branch_id": request["destination_branch_id"],
                "source_location_id": request["source_location_id"],
                "destination_location_id": request["destination_location_id"],
                "lines": resolved_lines,
                "source_versions": sources,
                "legal_scope": {"allocation_policy": "strict_fefo_earliest_expiry_tier"},
            }},))
        if "persist_inventory_transfer_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("inventory transfer persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected inventory transfer SQL: {sql}")


class FakeInventoryAdjustmentSession:
    def __init__(self, *, fail_persist=False):
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
            },))
        if "resolve_inventory_adjustment_prepare" in sql:
            request = json.loads(params["request_json"])
            resolved_lines = []
            sources = [{
                "resource_type": "physical_count_attachment",
                "id": request["evidence_attachment_id"],
                "status": "retained",
            }]
            for line in request["lines"]:
                for count in line["batch_counts"]:
                    resolved_lines.append({
                        "line_number": len(resolved_lines) + 1,
                        "inventory_document_line_id": count["inventory_document_line_id"],
                        "product_id": line["product_id"],
                        "batch_id": count["batch_id"],
                        "uom_conversion_id": line["uom_conversion_id"],
                        "uom_code": "TABLET",
                        "selected_uom_code": "STRIP",
                        "uom_multiplier": "10.000000",
                        "counted_quantity": count["counted_quantity"],
                        "system_base_quantity": "100.000000",
                        "counted_base_quantity": "120.000000",
                        "variance_base_quantity": "20.000000",
                        "unit_cost": "2.5000",
                        "extended_cost": "50.00",
                    })
                    sources.append({
                        "resource_type": "stock_balance",
                        "id": str(uuid4()),
                        "product_id": line["product_id"],
                        "batch_id": count["batch_id"],
                        "row_version": count["stock_balance_row_version"],
                    })
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "adjustment_date": request["adjustment_date"],
                "counted_at": request["counted_at"],
                "counted_by_membership_id": request["counted_by_membership_id"],
                "location_id": request["location_id"],
                "evidence_attachment_id": request["evidence_attachment_id"],
                "inventory_asset_account_id": str(uuid4()),
                "inventory_variance_account_id": str(uuid4()),
                "variance_effect": "gain",
                "lines": resolved_lines,
                "total_base_quantity": "20.000000",
                "total_value": "50.00",
                "source_versions": sources,
                "legal_scope": {
                    "country": "IN",
                    "currency": "INR",
                    "supported_effect": "homogeneous_gain_or_loss",
                    "tax_effect": "no_supply_no_gst_no_itc_claim_or_reversal",
                },
            }},))
        if "persist_inventory_adjustment_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("cycle-count persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected inventory adjustment SQL: {sql}")


class FakeInventoryDestructionSession:
    def __init__(self, *, fail_persist=False):
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
            },))
        if "resolve_inventory_destruction_prepare" in sql:
            request = json.loads(params["request_json"])
            destruction_loss = str(uuid4())
            inventory_asset = str(uuid4())
            reversal_expense = str(uuid4())
            input_accounts = [str(uuid4()) for _ in range(4)]
            lines = []
            sources = [{
                "resource_type": "destruction_certificate",
                "id": request["certificate_attachment_id"],
                "status": "verified",
            }]
            for product_line in request["lines"]:
                for allocation in product_line["batch_allocations"]:
                    lines.append({
                        "line_number": len(lines) + 1,
                        "inventory_document_line_id": allocation[
                            "inventory_document_line_id"
                        ],
                        "product_id": product_line["product_id"],
                        "batch_id": allocation["batch_id"],
                        "base_quantity": allocation["entered_quantity"],
                        "unit_cost": "10.0000",
                        "extended_cost": "30.00",
                    })
                    sources.append({
                        "resource_type": "stock_balance",
                        "id": str(uuid4()),
                        "batch_id": allocation["batch_id"],
                        "row_version": 4,
                    })
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "location_id": request["location_id"],
                "reason_code": request["reason_code"],
                "reason": request["reason"],
                "inventory_asset_account_id": inventory_asset,
                "inventory_destruction_loss_account_id": destruction_loss,
                "inventory_itc_reversal_expense_account_id": reversal_expense,
                "input_cgst_account_id": input_accounts[0],
                "input_sgst_account_id": input_accounts[1],
                "input_igst_account_id": input_accounts[2],
                "input_cess_account_id": input_accounts[3],
                "gst_registration_id": str(uuid4()),
                "gst_return_period_id": str(uuid4()),
                "gstr3b_return_id": str(uuid4()),
                "itc_reversal_rule_version_id": str(uuid4()),
                "itc_reversal_cgst_amount": "1.80",
                "itc_reversal_sgst_amount": "1.80",
                "itc_reversal_igst_amount": "0.00",
                "itc_reversal_cess_amount": "0.00",
                "itc_reversal_total": "3.60",
                "lines": lines,
                "total_base_quantity": "3.000000",
                "total_value": "30.00",
                "source_versions": sources,
                "legal_scope": {
                    "approval_policy": "separate_approver",
                    "gst_scope": "active_registered_taxpayer",
                    "supported_quantity": "full_batch_location_balance_only",
                },
            }},))
        if "persist_inventory_destruction_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("inventory destruction persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected inventory destruction SQL: {sql}")


class FakeSupplierAdvanceSession:
    def __init__(self, *, authority_branch=None, fail_persist=False):
        self.authority_branch = authority_branch
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
            },))
        if "erp_security.activate_context" in sql:
            return FakeResult()
        if "FROM automation.agent_grants AS grant_row" in sql:
            return FakeResult(({"branch_id": self.authority_branch},))
        if "resolve_supplier_advance_prepare" in sql:
            request = json.loads(params["request_json"])
            allocation = request["allocations"][0]
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "payment_id": request["payment_id"],
                "payment_date": request["payment_date"],
                "supplier_account_id": request["supplier_account_id"],
                "supplier_party_id": str(uuid4()),
                "purchase_order_id": request["purchase_order_id"],
                "bank_account_id": request["bank_account_id"],
                "settlement_account_id": request["settlement_account_id"],
                "supplier_prepayment_account_id": str(uuid4()),
                "payment_method": request["payment_method"],
                "external_reference": request["external_reference"].upper(),
                "gross_amount": request["gross_amount"],
                "cash_amount": request["gross_amount"],
                "withheld_amount": "0.00",
                "currency_code": "INR",
                "allocations": [{
                    "id": allocation["advance_allocation_id"],
                    "purchase_order_line_id": allocation[
                        "purchase_order_line_id"
                    ],
                    "prepayment_open_item_id": allocation[
                        "prepayment_open_item_id"
                    ],
                    "cash_disbursed_amount": allocation["gross_amount"],
                    "withheld_amount": "0.00",
                    "gross_advance_amount": allocation["gross_amount"],
                    "withholding_id": None,
                }],
                "legal_scope": {
                    "country_code": "IN",
                    "currency_code": "INR",
                    "gst_on_goods_advance": "not_payable_notification_66_2017",
                    "income_tax_withholding": "not_applicable_verified_prior_fy_turnover_at_or_below_inr_10_crore",
                },
                "source_versions": [
                    {"resource_type": "supplier_account", "id": request["supplier_account_id"], "row_version": 2},
                    {"resource_type": "purchase_order", "id": request["purchase_order_id"], "row_version": 3},
                    {"resource_type": "purchase_order_line_advance_state", "id": allocation["purchase_order_line_id"], "prior_active_gross": "0.00"},
                    {"resource_type": "organization_fiscal_tax_fact", "id": str(uuid4()), "prior_fiscal_year_turnover": "95000000.00", "gst_tds_notified_deductor": False},
                    {"resource_type": "bank_account", "id": request["bank_account_id"], "row_version": 1},
                ],
            }},))
        if "persist_supplier_advance_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("supplier advance persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected supplier advance SQL: {sql}")


class FakeGoodsReceiptSession:
    def __init__(self, *, fail_persist=False):
        self.fail_persist = fail_persist
        self.executions = []
        self.transaction_entries = 0
        self.transaction_exits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return None

    def begin(self):
        return FakeTransaction(self)

    def execute(self, statement, parameters=None):
        sql = str(statement)
        params = dict(parameters or {})
        if "pg_advisory_xact_lock" in sql:
            return FakeResult()
        self.executions.append((sql, params))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
            },))
        if "resolve_goods_receipt_prepare" in sql:
            request = json.loads(params["request_json"])
            source = request["lines"][0]["batches"][0]
            product_id = str(uuid4())
            return FakeResult(({"resolution": {
                "branch_id": request["branch_id"],
                "purchase_order_id": request["purchase_order_id"],
                "supplier_account_id": request["supplier_account_id"],
                "received_at": request["received_at"],
                "legal_scope": {
                    "country": "IN",
                    "currency": "INR",
                    "supply_type": "intra_state",
                    "tax_charge_mechanism": "normal",
                    "controlled_products_supported": False,
                    "full_rejection_supported": False,
                },
                "source_versions": [
                    {"resource_type": "purchase_order", "id": request["purchase_order_id"], "row_version": 3},
                    {"resource_type": "purchase_order_line", "id": request["lines"][0]["purchase_order_line_id"], "version_hash": "ab" * 32},
                    {"resource_type": "purchase_order_calculation_artifact", "id": str(uuid4()), "aggregate_version": 3},
                    {"resource_type": "mrp_uom_conversion", "id": source["mrp_uom_conversion_id"], "version_hash": "cd" * 32},
                    {"resource_type": "receiving_branch_wholesale_license", "id": str(uuid4()), "row_version": 1},
                    {"resource_type": "supplier_wholesale_license", "id": str(uuid4()), "row_version": 1},
                ],
                "lines": [{
                    "product_id": product_id,
                    "batch_id": source["batch_id"],
                    "location_id": source["to_location_id"],
                    "base_accepted_quantity": "80.000000",
                    "base_free_quantity": "10.000000",
                    "unit_cost": "8.1818",
                    "extended_cost": "736.36",
                }],
            }},))
        if "persist_goods_receipt_prepare" in sql:
            if self.fail_persist:
                raise RuntimeError("goods receipt persistence failed")
            return FakeResult(({"command_request_id": {
                "command_request_id": str(params["command_request_id"]),
                "expires_at": params["expires_at"].isoformat(),
                "preview_hash": hashlib.sha256(params["preview_bytes"]).hexdigest(),
                "replayed": False,
            }},))
        raise AssertionError(f"Unexpected goods receipt SQL: {sql}")


def _context(*, organization_scope=False, branch_ids=()):
    return ActionContext(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="reviewed-client",
        operation_key="automation.command.status.get",
        permission="automation.command.view",
        branch_ids=tuple(branch_ids),
        organization_scope=organization_scope,
    )


def _sales_invoice_service_payload(*, fulfillment_source="direct_issue"):
    line = {
        "product_id": uuid4(),
        "uom_conversion_id": uuid4(),
        "billed_quantity": "2.000000",
        "free_quantity": "1.000000",
        "free_supply_tax_treatment": "included_at_unit_rate",
        "quoted_unit_rate": "100.0000",
        "price_basis": "tax_exclusive",
        "line_discount": {
            "line_discount_kind": "none",
            "line_discount_basis": "price_value",
            "line_discount_value": "0",
        },
        "document_discount_eligible": True,
        "fulfillment_source": fulfillment_source,
    }
    payload = {
        "branch_id": uuid4(),
        "invoice_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "customer_account_id": uuid4(),
        "delivery_address_id": uuid4(),
        "delivery_address_row_version": "3",
        "tax_charge_mechanism": "normal",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "price_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [line],
        "charge_lines": [{
            "charge_code": "freight",
            "quoted_amount": "10.00",
            "price_basis": "tax_exclusive",
            "document_discount_eligible": True,
        }],
    }
    if fulfillment_source == "direct_issue":
        payload["from_location_id"] = uuid4()
        payload["logistics"] = {
            "transport_mode": "road",
            "distance_km": "150.00",
            "transporter_party_id": uuid4(),
            "vehicle_number": "MH12AB1234",
            "vehicle_type": "regular",
        }
        line["batch_allocations"] = [{
            "batch_id": uuid4(),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
        }]
    else:
        line["dispatch_allocations"] = [{
            "dispatch_line_id": uuid4(),
            "allocated_base_billed_quantity": "20.000000",
            "allocated_base_free_quantity": "10.000000",
        }]
    return payload


def _sales_return_service_payload(*, treatment="statutory"):
    payload = {
        "branch_id": uuid4(),
        "return_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "original_invoice_id": uuid4(),
        "reason_code": "customer_rejection",
        "gst_tax_treatment": treatment,
        "lines": [{
            "original_invoice_line_id": uuid4(),
            "invoice_dispatch_allocation_id": uuid4(),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "batch_allocation": {
                "batch_id": uuid4(),
                "billed_quantity": "2.000000",
                "free_quantity": "1.000000",
            },
            "to_location_id": uuid4(),
            "return_condition": "opened",
        }],
    }
    if treatment == "statutory":
        payload["recipient_itc_reversal_evidence_attachment_id"] = uuid4()
        payload["recipient_itc_reversal_confirmed_at"] = datetime(
            2026, 8, 20, 9, 0, tzinfo=timezone.utc
        )
    return payload


def _purchase_return_service_payload(*, treatment="statutory"):
    payload = {
        "branch_id": uuid4(),
        "return_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "return_source_kind": "invoiced",
        "original_supplier_invoice_id": uuid4(),
        "reason_code": "wrong_supply",
        "gst_tax_treatment": treatment,
        "supplier_destination_address_id": uuid4(),
        "logistics": {
            "transport_mode": "road",
            "distance_km": "125.00",
            "transporter_party_id": uuid4(),
            "vehicle_number": "MH12AB1234",
            "vehicle_type": "regular",
        },
        "lines": [{
            "goods_receipt_line_id": uuid4(),
            "supplier_invoice_receipt_allocation_id": uuid4(),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "batch_allocation": {
                "batch_id": uuid4(),
                "billed_quantity": "2.000000",
                "free_quantity": "1.000000",
            },
            "from_location_id": uuid4(),
        }],
    }
    if treatment == "statutory":
        payload["supplier_credit_note_portal_line_id"] = uuid4()
    return payload


def _purchase_order_service_payload():
    return {
        "branch_id": uuid4(),
        "order_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "expected_on": datetime(2026, 8, 25, tzinfo=timezone.utc).date(),
        "supplier_account_id": uuid4(),
        "tax_charge_mechanism": "normal",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "price_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [{
            "product_id": uuid4(),
            "uom_conversion_id": uuid4(),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "free_supply_tax_treatment": "included_at_unit_rate",
            "quoted_unit_rate": "100.0000",
            "price_basis": "tax_exclusive",
            "line_discount": {
                "line_discount_kind": "none",
                "line_discount_basis": "price_value",
                "line_discount_value": "0",
            },
            "document_discount_eligible": True,
        }],
        "charge_lines": [{
            "charge_code": "freight",
            "quoted_amount": "10.00",
            "price_basis": "tax_exclusive",
            "document_discount_eligible": True,
        }],
    }


def _supplier_invoice_service_payload():
    goods_receipt_id = uuid4()
    return {
        "branch_id": uuid4(),
        "invoice_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "received_date": datetime(2026, 8, 21, tzinfo=timezone.utc).date(),
        "supplier_account_id": uuid4(),
        "supplier_tax_registration_id": uuid4(),
        "supplier_invoice_number": "SUP-2026-0042",
        "tax_charge_mechanism": "normal",
        "portal_document_line_id": uuid4(),
        "goods_receipt_ids": [goods_receipt_id],
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "price_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [{
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "free_supply_tax_treatment": "included_at_unit_rate",
            "quoted_unit_rate": "100.0000",
            "price_basis": "tax_exclusive",
            "line_discount": {
                "line_discount_kind": "none",
                "line_discount_basis": "price_value",
                "line_discount_value": "0",
            },
            "document_discount_eligible": True,
            "goods_receipt_line_id": uuid4(),
            "allocated_base_billed_quantity": "20.000000",
            "allocated_base_free_quantity": "10.000000",
            "product_inventory_cost_treatment": "capitalize",
            "landed_cost_allocation_method": "direct",
            "itc_eligibility": "eligible",
            "itc_eligibility_basis": (
                "taxable_resale_not_blocked_under_section_17"
            ),
        }],
        "expense_charge_lines": [{
            "expense_charge_code": "freight",
            "quoted_amount": "10.00",
            "expense_price_basis": "tax_exclusive",
            "expense_document_discount_eligible": True,
            "charge_inventory_cost_treatment": "expense",
            "net_value_account_id": uuid4(),
            "itc_eligibility": "eligible",
            "itc_eligibility_basis": (
                "taxable_resale_not_blocked_under_section_17"
            ),
        }],
    }


def _goods_receipt_service_payload():
    return {
        "branch_id": uuid4(),
        "received_at": datetime(2026, 8, 20, 10, 30, tzinfo=timezone.utc),
        "purchase_order_id": uuid4(),
        "supplier_account_id": uuid4(),
        "supplier_challan_number": "CH-2026-0001",
        "supplier_challan_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "lines": [{
            "purchase_order_line_id": uuid4(),
            "batches": [{
                "manufacturer_batch_number": "MFG-BATCH-001",
                "manufactured_on": datetime(2026, 7, 1, tzinfo=timezone.utc).date(),
                "expires_on": datetime(2027, 7, 1, tzinfo=timezone.utc).date(),
                "mrp": "125.00",
                "mrp_uom_conversion_id": uuid4(),
                "received_quantity": "10.000000",
                "accepted_quantity": "8.000000",
                "rejected_quantity": "2.000000",
                "free_quantity": "1.000000",
                "qc_status": "partial",
                "qc_notes": "Two packs damaged in transit",
                "to_location_id": uuid4(),
            }],
        }],
    }


def _command_row(command_request_id):
    now = datetime.now(timezone.utc)
    return {
        "id": command_request_id,
        "operation": "sales.invoice.prepare",
        "capability_code": "sales.invoice.prepare",
        "status": "prepared",
        "preview_hash": bytes.fromhex("ab" * 32),
        "expires_at": now + timedelta(minutes=10),
        "completed_at": None,
        "result_resource_type": None,
        "result_resource_id": None,
        "failure_code": None,
        "failure_message": None,
        "approved_at": None,
    }


def test_registry_covers_every_contract_action_and_stays_fail_closed():
    prepare_keys = {action.operation_key for action in PREPARE_ACTIONS.values()}
    assert len(prepare_keys) == 22
    assert set(ACTION_ADAPTER_BINDINGS) == set(ACTION_POLICIES)
    assert ACTION_ADAPTER_BINDINGS["sales.order.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["sales.dispatch.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["sales.invoice.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["procurement.purchase_order.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["procurement.goods_receipt.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["procurement.supplier_invoice.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["sales.return.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["procurement.purchase_return.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.customer_receipt.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.customer_cheque_clearance.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.customer_cheque_bounce.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.supplier_advance.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.supplier_payment.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.adjustment_note.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.expense_claim.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["inventory.adjustment.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["inventory.transfer.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["inventory.destruction.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.bank_reconciliation.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["sales.return.reversal.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["procurement.purchase_return.reversal.prepare"].available is True
    assert ACTION_ADAPTER_BINDINGS["finance.adjustment_note.reversal.prepare"].available is True
    assert all(
        not ACTION_ADAPTER_BINDINGS[key].available
        for key in prepare_keys
        - {
            "sales.order.prepare",
            "sales.dispatch.prepare",
            "sales.invoice.prepare",
            "procurement.purchase_order.prepare",
            "procurement.goods_receipt.prepare",
            "procurement.supplier_invoice.prepare",
            "sales.return.prepare",
            "procurement.purchase_return.prepare",
                "finance.customer_receipt.prepare",
                "finance.customer_cheque_clearance.prepare",
                "finance.customer_cheque_bounce.prepare",
            "finance.supplier_advance.prepare",
            "finance.supplier_payment.prepare",
            "finance.adjustment_note.prepare",
            "finance.expense_claim.prepare",
            "inventory.adjustment.prepare",
            "inventory.transfer.prepare",
            "inventory.destruction.prepare",
            "finance.bank_reconciliation.prepare",
            "sales.return.reversal.prepare",
            "procurement.purchase_return.reversal.prepare",
            "finance.adjustment_note.reversal.prepare",
        }
    )
    assert all(
        ACTION_ADAPTER_BINDINGS[key].prepare_function
        == "erp_automation_commands.prepare_operator_command"
        for key in prepare_keys
        - {
            "sales.order.prepare",
            "sales.dispatch.prepare",
            "sales.invoice.prepare",
            "procurement.purchase_order.prepare",
            "procurement.goods_receipt.prepare",
            "procurement.supplier_invoice.prepare",
            "sales.return.prepare",
            "procurement.purchase_return.prepare",
            "finance.customer_receipt.prepare",
            "finance.customer_cheque_clearance.prepare",
            "finance.customer_cheque_bounce.prepare",
            "finance.supplier_advance.prepare",
            "finance.supplier_payment.prepare",
            "finance.adjustment_note.prepare",
            "finance.expense_claim.prepare",
            "inventory.adjustment.prepare",
            "inventory.transfer.prepare",
            "inventory.destruction.prepare",
            "finance.bank_reconciliation.prepare",
            "sales.return.reversal.prepare",
            "procurement.purchase_return.reversal.prepare",
            "finance.adjustment_note.reversal.prepare",
        }
    )
    assert ACTION_ADAPTER_BINDINGS["sales.order.prepare"].prepare_function == (
        "erp_automation_commands.persist_sales_order_prepare"
    )
    assert ACTION_ADAPTER_BINDINGS["sales.dispatch.prepare"].prepare_function == (
        "erp_automation_commands.persist_sales_dispatch_prepare"
    )
    assert ACTION_ADAPTER_BINDINGS["sales.invoice.prepare"].prepare_function == (
        "erp_automation_commands.persist_sales_invoice_prepare"
    )
    assert ACTION_ADAPTER_BINDINGS[
        "procurement.purchase_order.prepare"
    ].prepare_function == "erp_automation_commands.persist_purchase_order_prepare"
    assert ACTION_ADAPTER_BINDINGS[
        "procurement.goods_receipt.prepare"
    ].prepare_function == "erp_automation_commands.persist_goods_receipt_prepare"
    assert ACTION_ADAPTER_BINDINGS[
        "procurement.supplier_invoice.prepare"
    ].prepare_function == "erp_automation_commands.persist_supplier_invoice_prepare"
    assert ACTION_ADAPTER_BINDINGS[
        "sales.return.prepare"
    ].prepare_function == "erp_automation_commands.persist_sales_return_prepare"
    assert ACTION_ADAPTER_BINDINGS[
        "inventory.adjustment.prepare"
    ].prepare_function == "erp_automation_commands.persist_inventory_adjustment_prepare"
    assert ACTION_ADAPTER_BINDINGS[
        "inventory.destruction.prepare"
    ].prepare_function == "erp_automation_commands.persist_inventory_destruction_prepare"
    assert ACTION_ADAPTER_BINDINGS[
        "finance.adjustment_note.prepare"
    ].prepare_function == "erp_automation_commands.persist_adjustment_note_prepare"
    assert ACTION_ADAPTER_BINDINGS[
        "finance.customer_cheque_clearance.prepare"
    ].prepare_function == "erp_automation_commands.persist_customer_cheque_clearance_prepare"
    assert ACTION_ADAPTER_BINDINGS[
        "finance.customer_cheque_bounce.prepare"
    ].prepare_function == "erp_automation_commands.persist_customer_cheque_bounce_prepare"
    assert ACTION_ADAPTER_BINDINGS["automation.command.approve"].available is True
    assert ACTION_ADAPTER_BINDINGS["automation.command.execute"].available is True
    assert ACTION_ADAPTER_BINDINGS["automation.command.status.get"].available is True


def test_dispatch_readiness_does_not_depend_on_calculator_database(monkeypatch):
    calculator_session_factory.cache_clear()
    monkeypatch.delenv(CALCULATOR_DATABASE_URL_ENV, raising=False)
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("database opened")),
        runtime_principal_configured=True,
    )

    readiness = service.adapter_readiness()

    assert readiness["sales.dispatch.prepare"] is True
    assert readiness["sales.order.prepare"] is False


def test_calculator_backed_readiness_also_requires_runtime_principal():
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("database opened")),
        calculator_factory=lambda: (_ for _ in ()).throw(
            AssertionError("calculator opened")
        ),
        runtime_principal_configured=False,
    )

    readiness = service.adapter_readiness()

    for operation_key in (
        "sales.order.prepare",
        "sales.invoice.prepare",
        "sales.return.prepare",
        "procurement.purchase_order.prepare",
        "procurement.supplier_invoice.prepare",
        "procurement.purchase_return.prepare",
    ):
        assert readiness[operation_key] is False


def test_runtime_database_readiness_requires_exact_nonowner_runtime_url(monkeypatch):
    monkeypatch.delenv("DATABASE_TRANSPORT_REQUIREMENT", raising=False)
    monkeypatch.delenv(RUNTIME_DATABASE_URL_ENV, raising=False)
    assert runtime_database_configured() is False
    monkeypatch.setenv(
        RUNTIME_DATABASE_URL_ENV,
        "postgresql://postgres:secret@db.example.test:5432/erp",
    )
    assert runtime_database_configured() is False
    monkeypatch.setenv(
        RUNTIME_DATABASE_URL_ENV,
        "postgresql://erp_runtime:secret@db.example.test:5432/erp",
    )
    assert runtime_database_configured() is True
    monkeypatch.setenv(
        RUNTIME_DATABASE_URL_ENV,
        "postgresql://erp_runtime.abcdefghijklmnopqrst:secret@"
        "aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
    )
    assert runtime_database_configured() is True
    monkeypatch.setenv(
        RUNTIME_DATABASE_URL_ENV,
        "postgresql://erp_runtime.wrong:secret@"
        "aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
    )
    assert runtime_database_configured() is False


def test_runtime_database_readiness_rejects_pooler_when_direct_is_required(
    monkeypatch,
):
    monkeypatch.setenv("DATABASE_TRANSPORT_REQUIREMENT", "supabase_direct_ipv4")
    monkeypatch.setenv(
        RUNTIME_DATABASE_URL_ENV,
        "postgresql://erp_runtime.abcdefghijklmnopqrst:secret@"
        "aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require",
    )
    assert runtime_database_configured() is False

    monkeypatch.setenv(
        RUNTIME_DATABASE_URL_ENV,
        "postgresql://erp_runtime:secret@"
        "db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require",
    )
    assert runtime_database_configured() is True

    monkeypatch.setenv(
        RUNTIME_DATABASE_URL_ENV,
        "postgresql://erp_runtime:secret@"
        "db.abcdefghijklmnopqrst.supabase.co:5432/postgres"
        "?sslmode=require&hostaddr=192.0.2.1",
    )
    assert runtime_database_configured() is False


def test_runtime_session_proof_rejects_superuser_or_bypassrls():
    class UnsafeSession:
        def execute(self, statement):
            assert "CURRENT_USER" in str(statement)
            return FakeResult(({
                "role_name": "erp_runtime",
                "rolsuper": True,
                "rolbypassrls": False,
            },))

    with pytest.raises(OperatorActionError) as error:
        assert_runtime_principal(UnsafeSession())

    assert error.value.code is ActionErrorCode.POLICY_BLOCKED
    assert error.value.metadata["reason"] == "RUNTIME_DATABASE_PRINCIPAL_INVALID"


def test_inventory_transfer_adapter_is_reviewed_and_available():
    binding = ACTION_ADAPTER_BINDINGS["inventory.transfer.prepare"]
    assert binding.available is True
    assert binding.prepare_function == "erp_automation_commands.persist_inventory_transfer_prepare"
    assert binding.execute_function == "erp_automation_commands.execute_approved_command:inventory_transfer"


@pytest.mark.parametrize(
    ("charge_lines", "expected_total"),
    (([{
        "charge_code": "freight",
        "quoted_amount": "10.00",
        "price_basis": "tax_exclusive",
        "document_discount_eligible": True,
    }], "365.80"), (None, "354.00")),
)
def test_sales_order_prepare_uses_one_isolated_calculator_transaction(
    charge_lines, expected_total
):
    session = FakeCalculatorSession()
    context = _context(branch_ids=())
    branch_id = uuid4()
    context = ActionContext(
        **{
            **context.__dict__,
            "operation_key": "sales.order.prepare",
            "permission": "sales.order.create",
            "branch_ids": (branch_id,),
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )
    payload = {
        "branch_id": branch_id,
        "order_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "customer_account_id": uuid4(),
        "delivery_address_id": uuid4(),
        "delivery_address_row_version": "3",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "price_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [{
            "product_id": uuid4(),
            "uom_conversion_id": uuid4(),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "free_supply_tax_treatment": "included_at_unit_rate",
            "quoted_unit_rate": "100.0000",
            "price_basis": "tax_exclusive",
            "line_discount": {
                "line_discount_kind": "none",
                "line_discount_basis": "price_value",
                "line_discount_value": "0",
            },
            "document_discount_eligible": True,
        }],
        "charge_lines": charge_lines,
    }

    prepared = service.prepare(
        policy=ACTION_POLICIES["sales.order.prepare"],
        payload=payload,
        idempotency_key="prepare:sales-order:0001",
        context=context,
    )

    assert prepared.command_type == "sales.order.approve"
    assert prepared.preview_hash.startswith("sha256:")
    assert prepared.financial_impact[0]["grand_total"] == expected_total
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 2
    sql = "\n".join(statement for statement, _ in session.executions)
    assert "resolve_sales_order_prepare" in sql
    assert "persist_sales_order_prepare" in sql
    request = json.loads(session.executions[0][1]["request_json"])
    assert "uom_conversion_id" in request["lines"][0]
    assert "billed_quantity" in request["lines"][0]
    assert "free_quantity" in request["lines"][0]
    assert "quoted_unit_rate" in request["lines"][0]
    assert request["lines"][0]["free_supply_tax_treatment"] == "included_at_unit_rate"
    assert "unit_id" not in request["lines"][0]
    assert "quantity" not in request["lines"][0]
    assert "unit_price" not in request["lines"][0]
    if charge_lines:
        assert request["charge_lines"][0]["charge_code"] == "freight"
        assert request["charge_lines"][0]["quoted_amount"] == "10.00"
        assert prepared.source_versions[-1]["resource_type"] == "charge"
        assert prepared.source_versions[-1]["charge_code"] == "freight"
    else:
        assert request["charge_lines"] == []
        assert prepared.source_versions[-1]["resource_type"] == "product"
    calculation_input = json.loads(
        session.executions[1][1]["calculation_input_bytes"]
    )
    assert calculation_input["document"]["products"][0][
        "free_supply_tax_treatment"
    ] == "included_at_unit_rate"
def test_purchase_order_prepare_uses_one_isolated_calculator_transaction():
    session = FakePurchaseOrderSession()
    payload = _purchase_order_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.purchase_order.prepare",
            "permission": "procurement.order.manage",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["procurement.purchase_order.prepare"],
        payload=payload,
        idempotency_key="prepare:purchase-order:0001",
        context=context,
    )

    assert prepared.command_type == "procurement.purchase_order.approve"
    assert prepared.financial_impact[0]["supplier_commitment"] == "365.80"
    assert prepared.tax_impact[0]["igst_total"] == "55.80"
    assert prepared.inventory_impact == ()
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 2
    request = json.loads(session.executions[0][1]["request_json"])
    resolver_sql, resolver_params = session.executions[0]
    assert ":client_id, :purchase_order_id, CAST(:request_json AS jsonb)" in resolver_sql
    assert str(resolver_params["purchase_order_id"]) == request["purchase_order_id"]
    assert request["tax_charge_mechanism"] == "normal"
    assert request["zero_rated_payment_mode"] == "not_applicable"
    assert request["lines"][0]["free_quantity"] == "1.000000"
    assert "line_id" in request["lines"][0]
    assert "line_id" in request["charge_lines"][0]
    persisted = session.executions[1][1]
    calculation_input = json.loads(persisted["calculation_input_bytes"])
    assert calculation_input["operation"] == "procurement.purchase_order.approve"
    assert calculation_input["resource_type"] == "purchase_order"
    assert calculation_input["document"]["charges"][0]["charge_code"] == "freight"
    assert calculation_input["document"]["products"][0][
        "free_supply_tax_treatment"
    ] == "included_at_unit_rate"
    assert any(
        source["resource_type"] == "supplier_tax_registration"
        for source in prepared.source_versions
    )


@pytest.mark.parametrize(
    ("supply_type", "taxability", "grand_total", "cgst", "sgst", "igst"),
    (
        ("intra_state", "taxable", "365.80", "27.90", "27.90", "0.00"),
        ("inter_state", "exempt", "310.00", "0.00", "0.00", "0.00"),
    ),
)
def test_purchase_order_prepare_calculates_india_supply_and_taxability_exactly(
    supply_type,
    taxability,
    grand_total,
    cgst,
    sgst,
    igst,
):
    session = FakePurchaseOrderSession(
        supply_type=supply_type,
        taxability=taxability,
    )
    payload = _purchase_order_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.purchase_order.prepare",
            "permission": "procurement.order.manage",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["procurement.purchase_order.prepare"],
        payload=payload,
        idempotency_key=f"prepare:purchase-order:{supply_type}:{taxability}",
        context=context,
    )

    assert prepared.financial_impact[0]["supplier_commitment"] == grand_total
    assert prepared.tax_impact == ({
        "cgst_total": cgst,
        "sgst_total": sgst,
        "igst_total": igst,
        "cess_total": "0.00",
        "zero_rated_payment_mode": "not_applicable",
    },)
    calculation_input = json.loads(
        session.executions[1][1]["calculation_input_bytes"]
    )
    assert calculation_input["document"]["gst_type"] == supply_type
    assert calculation_input["document"]["tax_charge_mechanism"] == "normal"
    assert {
        line["taxability_snapshot"]
        for line in (
            calculation_input["document"]["products"]
            + calculation_input["document"]["charges"]
        )
    } == {taxability}
    calculation_output = json.loads(
        session.executions[1][1]["calculation_output_bytes"]
    )
    assert calculation_output["totals"]["grand_total"] == grand_total
    assert calculation_output["totals"]["gst_taxable_total"] == (
        "310.00" if taxability == "taxable" else "0.00"
    )
    assert calculation_output["totals"]["cgst_total"] == cgst
    assert calculation_output["totals"]["sgst_total"] == sgst
    assert calculation_output["totals"]["igst_total"] == igst


def test_purchase_order_prepare_failure_rolls_back_the_only_transaction():
    session = FakePurchaseOrderSession(fail_persist=True)
    payload = _purchase_order_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.purchase_order.prepare",
            "permission": "procurement.order.manage",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="purchase persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["procurement.purchase_order.prepare"],
            payload=payload,
            idempotency_key="prepare:purchase-order:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def test_goods_receipt_prepare_uses_one_runtime_transaction_and_exact_facts():
    session = FakeGoodsReceiptSession()
    payload = _goods_receipt_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.goods_receipt.prepare",
            "permission": "procurement.receipt.post",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        calculator_factory=lambda: (_ for _ in ()).throw(
            AssertionError("calculator DB opened")
        ),
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["procurement.goods_receipt.prepare"],
        payload=payload,
        idempotency_key="prepare:goods-receipt:0001",
        context=context,
    )

    assert prepared.command_type == "procurement.receipt.post"
    assert prepared.inventory_impact == ({
        "product_id": prepared.inventory_impact[0]["product_id"],
        "batch_id": prepared.inventory_impact[0]["batch_id"],
        "location_id": str(payload["lines"][0]["batches"][0]["to_location_id"]),
        "base_accepted_quantity": "80.000000",
        "base_free_quantity": "10.000000",
        "unit_cost": "8.1818",
        "extended_cost": "736.36",
        "costing_method": "moving_weighted_average",
    },)
    assert prepared.financial_impact == ()
    assert prepared.tax_impact == ()
    assert prepared.calculation_ruleset == ()
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 3
    sql = "\n".join(statement for statement, _ in session.executions)
    assert "FROM pg_catalog.pg_roles AS role" in session.executions[0][0]
    assert "resolve_goods_receipt_prepare" in sql
    assert "persist_goods_receipt_prepare" in sql
    request = json.loads(session.executions[1][1]["request_json"])
    batch = request["lines"][0]["batches"][0]
    assert batch["mrp"] == "125.00"
    assert batch["mrp_uom_conversion_id"] == str(
        payload["lines"][0]["batches"][0]["mrp_uom_conversion_id"]
    )
    assert batch["accepted_quantity"] == "8.000000"
    assert batch["rejected_quantity"] == "2.000000"
    assert batch["free_quantity"] == "1.000000"
    assert batch["goods_receipt_line_id"]
    assert batch["inventory_document_line_id"]
    assert prepared.source_versions[2]["resource_type"] == (
        "purchase_order_calculation_artifact"
    )


def test_goods_receipt_prepare_failure_rolls_back_the_only_transaction():
    session = FakeGoodsReceiptSession(fail_persist=True)
    payload = _goods_receipt_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.goods_receipt.prepare",
            "permission": "procurement.receipt.post",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="goods receipt persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["procurement.goods_receipt.prepare"],
            payload=payload,
            idempotency_key="prepare:goods-receipt:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def test_supplier_invoice_prepare_is_atomic_and_pins_attested_grn_portal_facts():
    session = FakeSupplierInvoiceSession()
    payload = _supplier_invoice_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.supplier_invoice.prepare",
            "permission": "procurement.supplier_invoice.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["procurement.supplier_invoice.prepare"],
        payload=payload,
        idempotency_key="prepare:supplier-invoice:normal-grn",
        context=context,
    )

    assert prepared.command_type == "procurement.supplier_invoice.post"
    assert prepared.inventory_impact[0]["allocation_method"] == "direct"
    assert prepared.inventory_impact[0]["landed_cost_inventory_value_delta"] == "0.00"
    assert prepared.inventory_impact[0]["consumed_variance_amount"] == "0.00"
    assert prepared.financial_impact[0]["supplier_payable"] == "365.80"
    assert prepared.tax_impact[0]["igst_total"] == "55.80"
    assert prepared.tax_impact[0]["itc_eligibility"] == "eligible"
    assert prepared.policy_warnings[0]["code"] == "HUMAN_ITC_ATTESTATION_REQUIRED"
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 2
    request = json.loads(session.executions[0][1]["request_json"])
    persist = session.executions[1][1]
    preview = json.loads(persist["preview_bytes"])
    calculation_input = json.loads(persist["calculation_input_bytes"])
    assert request["goods_receipt_ids"] == [str(payload["goods_receipt_ids"][0])]
    assert request["lines"][0]["itc_eligibility_basis"] == (
        "taxable_resale_not_blocked_under_section_17"
    )
    assert request["expense_charge_lines"][0][
        "charge_inventory_cost_treatment"
    ] == "expense"
    assert preview["itc_eligibility_basis"] == (
        "taxable_resale_not_blocked_under_section_17"
    )
    assert preview["inventory_impact"][0]["landed_cost_inventory_value_delta"] == "0.00"
    assert calculation_input["operation"] == "procurement.supplier_invoice.post"
    assert calculation_input["document"]["products"][0][
        "free_supply_tax_treatment"
    ] == "included_at_unit_rate"


def test_supplier_invoice_prepare_failure_rolls_back_the_only_transaction():
    session = FakeSupplierInvoiceSession(fail_persist=True)
    payload = _supplier_invoice_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.supplier_invoice.prepare",
            "permission": "procurement.supplier_invoice.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="supplier invoice persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["procurement.supplier_invoice.prepare"],
            payload=payload,
            idempotency_key="prepare:supplier-invoice:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


@pytest.mark.parametrize(
    ("fulfillment_source", "expected_effect", "expected_inventory_id"),
    [
        ("direct_issue", "direct_sales_issue", True),
        ("dispatch_allocated", "consume_posted_dispatch_lineage", False),
    ],
)
def test_sales_invoice_prepare_is_atomic_for_both_fulfillment_modes(
    fulfillment_source, expected_effect, expected_inventory_id
):
    session = FakeSalesInvoiceSession()
    payload = _sales_invoice_service_payload(
        fulfillment_source=fulfillment_source
    )
    branch_id = payload["branch_id"]
    context = ActionContext(
        **{
            **_context(branch_ids=(branch_id,)).__dict__,
            "operation_key": "sales.invoice.prepare",
            "permission": "sales.invoice.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["sales.invoice.prepare"],
        payload=payload,
        idempotency_key=f"prepare:sales-invoice:{fulfillment_source}",
        context=context,
    )

    assert prepared.command_type == "sales.invoice.post"
    assert prepared.inventory_impact[0]["effect"] == expected_effect
    assert prepared.financial_impact[0]["receivable"] == "365.80"
    assert prepared.tax_impact[0]["igst_total"] == "55.80"
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 3
    resolution_request = json.loads(session.executions[0][1]["request_json"])
    identity_resolution = json.loads(session.executions[1][1]["resolution_json"])
    persist_params = session.executions[2][1]
    assert identity_resolution["lines"][0]["product_id"] == str(
        payload["lines"][0]["product_id"]
    )
    assert bool(persist_params["inventory_document_id"]) is expected_inventory_id
    assert resolution_request["tax_charge_mechanism"] == "normal"
    assert resolution_request["lines"][0]["fulfillment_source"] == fulfillment_source
    assert "line_id" in resolution_request["lines"][0]
    if fulfillment_source == "direct_issue":
        assert resolution_request["lines"][0]["batch_allocation_mode"] == (
            "explicit_fefo"
        )
        assert "inventory_line_id" in resolution_request["lines"][0][
            "batch_allocations"
        ][0]
    else:
        assert "invoice_dispatch_allocation_id" in resolution_request["lines"][0][
            "dispatch_allocations"
        ][0]
    calculation_input = json.loads(persist_params["calculation_input_bytes"])
    assert calculation_input["operation"] == "sales.invoice.post"
    assert calculation_input["document"]["charges"][0]["charge_code"] == "freight"
    assert calculation_input["document"]["products"][0][
        "free_supply_tax_treatment"
    ] == "included_at_unit_rate"
    persisted_preview = json.loads(persist_params["preview_bytes"])
    product_reference = next(
        reference
        for reference in persisted_preview["resolved_references"]
        if reference["resource_type"] == "product"
    )
    assert product_reference["product_name"] == "Canonical Product 1"
    assert product_reference["product_code"] == "PROD-000001"
    assert product_reference in prepared.resolved_references


def test_sales_invoice_product_labels_are_bound_to_locked_catalog_versions():
    product_id = uuid4()
    resolution = [{
            "resource_type": "product",
            "id": str(product_id),
            "row_version": 7,
            "product_code": " PROD-000007 ",
            "product_name": " Canonical Carton ",
        }]

    references = authoritative_product_references(resolution)

    assert references == ({
        "resource_type": "product",
        "id": str(product_id),
        "row_version": 7,
        "product_code": "PROD-000007",
        "product_name": "Canonical Carton",
    },)
    assert "resolve_sales_invoice_prepare" in str(RESOLVE_SALES_INVOICE_SQL)
    assert "resolve_sales_invoice_product_identities" in str(
        RESOLVE_SALES_INVOICE_PRODUCT_IDENTITIES_SQL
    )


def test_sales_invoice_product_labels_fail_closed_when_identity_is_missing():
    product_id = uuid4()
    resolution = [{
        "resource_type": "product",
        "id": str(product_id),
        "row_version": 1,
    }]

    with pytest.raises(ValueError, match="resolved product label is missing"):
        authoritative_product_references(resolution)


def test_sales_invoice_prepare_defaults_missing_direct_batches_to_auto_fefo():
    session = FakeSalesInvoiceSession()
    payload = _sales_invoice_service_payload()
    payload["lines"][0].pop("batch_allocations")
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "sales.invoice.prepare",
            "permission": "sales.invoice.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    service.prepare(
        policy=ACTION_POLICIES["sales.invoice.prepare"],
        payload=payload,
        idempotency_key="prepare:sales-invoice:auto-fefo",
        context=context,
    )

    assert len(session.executions) == 4
    initial = json.loads(session.executions[0][1]["request_json"])
    resolved = json.loads(session.executions[1][1]["request_json"])
    persisted = json.loads(session.executions[3][1]["request_bytes"])
    assert initial["lines"][0]["batch_allocation_mode"] == "auto_fefo"
    assert "batch_allocations" not in initial["lines"][0]
    assert resolved["lines"][0]["batch_allocation_mode"] == "auto_fefo"
    assert resolved["lines"][0]["batch_allocations"] == persisted["lines"][0][
        "batch_allocations"
    ]
    assert resolved["lines"][0]["batch_allocations"][0]["batch_id"] == (
        session.auto_batch_id
    )
    assert "inventory_line_id" in resolved["lines"][0]["batch_allocations"][0]


def test_mixed_sales_invoice_preview_reports_direct_and_dispatch_impacts():
    session = FakeSalesInvoiceSession()
    payload = _sales_invoice_service_payload()
    allocated = _sales_invoice_service_payload(
        fulfillment_source="dispatch_allocated"
    )["lines"][0]
    payload["lines"].append(allocated)
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "sales.invoice.prepare",
            "permission": "sales.invoice.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["sales.invoice.prepare"],
        payload=payload,
        idempotency_key="prepare:sales-invoice:mixed",
        context=context,
    )

    assert [impact["effect"] for impact in prepared.inventory_impact] == [
        "direct_sales_issue",
        "consume_posted_dispatch_lineage",
    ]
    assert prepared.financial_impact[0]["direct_issue_cogs"] == "375.00"


def test_sales_invoice_prepare_failure_rolls_back_the_only_transaction():
    session = FakeSalesInvoiceSession(fail_persist=True)
    payload = _sales_invoice_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "sales.invoice.prepare",
            "permission": "sales.invoice.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["sales.invoice.prepare"],
            payload=payload,
            idempotency_key="prepare:sales-invoice:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


class _PostgresPolicyFailure(Exception):
    def __init__(self, sqlstate, message):
        super().__init__(message)
        self.pgcode = sqlstate
        self.diag = type("Diagnostic", (), {"message_primary": message})()


def test_sales_invoice_fefo_rejection_is_structured_and_rolls_back():
    database_error = IntegrityError(
        "SELECT resolve_sales_invoice_prepare(...) ",
        {},
        _PostgresPolicyFailure(
            "23514", "direct invoice batches do not follow FEFO"
        ),
    )
    session = FakeSalesInvoiceSession(resolve_error=database_error)
    payload = _sales_invoice_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "sales.invoice.prepare",
            "permission": "sales.invoice.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(OperatorActionError) as error:
        service.prepare(
            policy=ACTION_POLICIES["sales.invoice.prepare"],
            payload=payload,
            idempotency_key="prepare:sales-invoice:fefo-rejected",
            context=context,
        )

    assert error.value.code == ActionErrorCode.BATCH_BLOCKED
    assert error.value.retryable is False
    assert error.value.metadata == {
        "operation_key": "sales.invoice.prepare",
        "reason": "FEFO_ALLOCATION_REQUIRED",
        "sqlstate": "23514",
    }
    assert "earliest eligible batch" in error.value.message
    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def test_unrecognized_database_failure_remains_unhandled():
    database_error = IntegrityError(
        "SELECT resolve_sales_invoice_prepare(...) ",
        {},
        _PostgresPolicyFailure("XX000", "unexpected internal database failure"),
    )
    session = FakeSalesInvoiceSession(resolve_error=database_error)
    payload = _sales_invoice_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "sales.invoice.prepare",
            "permission": "sales.invoice.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(IntegrityError) as error:
        service.prepare(
            policy=ACTION_POLICIES["sales.invoice.prepare"],
            payload=payload,
            idempotency_key="prepare:sales-invoice:internal-failure",
            context=context,
        )

    assert error.value is database_error
    assert session.transaction_failures == 1


@pytest.mark.parametrize(
    ("treatment", "grand_total", "cgst", "sgst"),
    (("statutory", "224.00", "12.00", "12.00"),
     ("commercial_only", "224.00", "0.00", "0.00")),
)
def test_sales_return_prepare_is_one_calculator_transaction_with_exact_reversal(
    treatment, grand_total, cgst, sgst
):
    session = FakeSalesReturnSession()
    payload = _sales_return_service_payload(treatment=treatment)
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "sales.return.prepare",
            "permission": "sales.return.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["sales.return.prepare"],
        payload=payload,
        idempotency_key=f"prepare:sales-return:{treatment}",
        context=context,
    )

    assert prepared.command_type == "sales.return.post"
    assert prepared.financial_impact[0]["receivable_credit"] == grand_total
    assert prepared.tax_impact[0]["gst_tax_treatment"] == treatment
    assert prepared.tax_impact[0]["cgst_total"] == cgst
    assert prepared.tax_impact[0]["sgst_total"] == sgst
    assert prepared.inventory_impact[0]["disposition"] == "return_to_stock_quarantine"
    assert prepared.inventory_impact[0]["base_quantity"] == "3.000000"
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 2
    request = json.loads(session.executions[0][1]["request_json"])
    if treatment == "statutory":
        assert request["tax_document_id"] is not None
    else:
        assert request["tax_document_id"] is None
    assert request["lines"][0]["batch_allocation"]["batch_id"] == str(
        payload["lines"][0]["batch_allocation"]["batch_id"]
    )
    artifact_input = json.loads(session.executions[1][1]["calculation_input_bytes"])
    assert artifact_input["calculation_kind"] == "reversal"
    assert artifact_input["reversal"]["products"][0]["final_residual"] is False
    assert artifact_input["reversal"]["products"][0]["reversed_base_free_quantity"] == "1.000000"


def test_sales_return_prepare_failure_rolls_back_the_only_transaction():
    session = FakeSalesReturnSession(fail_persist=True)
    payload = _sales_return_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "sales.return.prepare",
            "permission": "sales.return.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="sales return persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["sales.return.prepare"],
            payload=payload,
            idempotency_key="prepare:sales-return:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


@pytest.mark.parametrize(
    ("treatment", "grand_total", "cgst", "sgst"),
    (("statutory", "224.00", "12.00", "12.00"),
     ("commercial_only", "224.00", "0.00", "0.00")),
)
def test_purchase_return_prepare_is_one_calculator_transaction_with_exact_reversal(
    treatment, grand_total, cgst, sgst
):
    session = FakePurchaseReturnSession()
    payload = _purchase_return_service_payload(treatment=treatment)
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.purchase_return.prepare",
            "permission": "procurement.purchase_return.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["procurement.purchase_return.prepare"],
        payload=payload,
        idempotency_key=f"prepare:purchase-return:{treatment}",
        context=context,
    )

    assert prepared.command_type == "procurement.purchase_return.post"
    assert prepared.financial_impact[0]["payable_debit"] == grand_total
    assert prepared.tax_impact[0]["gst_tax_treatment"] == treatment
    assert prepared.tax_impact[0]["cgst_total"] == cgst
    assert prepared.tax_impact[0]["sgst_total"] == sgst
    assert prepared.inventory_impact[0]["movement_kind"] == "issue"
    assert prepared.inventory_impact[0]["base_quantity"] == "3.000000"
    assert prepared.inventory_impact[0]["unit_cost"] == "25.0000"
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 2
    request = json.loads(session.executions[0][1]["request_json"])
    if treatment == "statutory":
        assert request["tax_document_id"] is not None
    else:
        assert request["tax_document_id"] is None
    assert request["lines"][0]["batch_allocation"]["batch_id"] == str(
        payload["lines"][0]["batch_allocation"]["batch_id"]
    )
    artifact_input = json.loads(session.executions[1][1]["calculation_input_bytes"])
    assert artifact_input["operation"] == "procurement.purchase_return.post"
    assert artifact_input["reversal"]["products"][0]["final_residual"] is False
    assert artifact_input["reversal"]["products"][0]["reversed_base_free_quantity"] == "1.000000"


def test_purchase_return_prepare_failure_rolls_back_the_only_transaction():
    session = FakePurchaseReturnSession(fail_persist=True)
    payload = _purchase_return_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "procurement.purchase_return.prepare",
            "permission": "procurement.purchase_return.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("ordinary DB opened")),
        calculator_factory=lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="purchase return persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["procurement.purchase_return.prepare"],
            payload=payload,
            idempotency_key="prepare:purchase-return:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def _customer_receipt_service_payload():
    return {
        "branch_id": uuid4(),
        "payment_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "customer_account_id": uuid4(),
        "settlement_account_id": uuid4(),
        "bank_account_id": uuid4(),
        "payment_method": "upi",
        "amount": "118.00",
        "allocations": [{"open_item_id": uuid4(), "amount": "118.00"}],
        "external_reference": "upi-customer-0001",
    }


def test_customer_receipt_prepare_is_one_runtime_transaction_with_exact_allocation():
    payload = _customer_receipt_service_payload()
    session = FakeCustomerReceiptSession(authority_branch=payload["branch_id"])
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "finance.customer_receipt.prepare",
            "permission": "finance.customer_receipt.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["finance.customer_receipt.prepare"],
        payload=payload,
        idempotency_key="prepare:customer-receipt:0001",
        context=context,
    )

    assert prepared.command_type == "finance.payment.post"
    assert prepared.calculation_ruleset == ()
    assert prepared.inventory_impact == ()
    assert prepared.tax_impact == ()
    assert prepared.financial_impact[0]["receipt_amount"] == "118.00"
    assert prepared.financial_impact[0]["allocations"][0]["allocated_amount"] == "118.00"
    assert session.transaction_entries == session.transaction_exits == 1
    assert "erp_security.activate_context" in session.executions[1][0]
    resolve_execution = next(
        execution for execution in session.executions
        if "resolve_customer_receipt_prepare" in execution[0]
    )
    persist_execution = next(
        execution for execution in session.executions
        if "persist_customer_receipt_prepare" in execution[0]
    )
    request = json.loads(resolve_execution[1]["request_json"])
    assert request["payment_method"] == "upi"
    assert request["allocations"][0]["allocation_id"]
    preview = json.loads(persist_execution[1]["preview_bytes"])
    assert preview["operation"] == "finance.payment.post"
    assert preview["legal_scope"]["settlement"] == "fully_allocated_non_cash"


def test_customer_receipt_prepare_failure_rolls_back_the_only_transaction():
    payload = _customer_receipt_service_payload()
    session = FakeCustomerReceiptSession(
        authority_branch=payload["branch_id"], fail_persist=True
    )
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "finance.customer_receipt.prepare",
            "permission": "finance.customer_receipt.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="customer receipt persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["finance.customer_receipt.prepare"],
            payload=payload,
            idempotency_key="prepare:customer-receipt:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def _supplier_payment_service_payload():
    return {
        "branch_id": uuid4(),
        "payment_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "supplier_account_id": uuid4(),
        "bank_account_id": uuid4(),
        "payment_method": "upi",
        "expected_gross_amount": "900.00",
        "allocations": [
            {"open_item_id": uuid4(), "cash_amount": "400.00"},
            {"open_item_id": uuid4(), "cash_amount": "500.00"},
        ],
        "external_reference": "upi-supplier-0001",
    }


def test_supplier_payment_prepare_is_one_runtime_transaction_with_exact_multi_invoice_cash():
    payload = _supplier_payment_service_payload()
    session = FakeSupplierPaymentSession(authority_branch=payload["branch_id"])
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "finance.supplier_payment.prepare",
            "permission": "finance.supplier_payment.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["finance.supplier_payment.prepare"],
        payload=payload,
        idempotency_key="prepare:supplier-payment:0001",
        context=context,
    )

    assert prepared.command_type == "finance.payment.post"
    assert prepared.calculation_ruleset == ()
    assert prepared.inventory_impact == ()
    assert prepared.tax_impact == ()
    assert prepared.financial_impact[0]["gross_liability_settlement"] == "900.00"
    assert prepared.financial_impact[0]["cash_disbursed_amount"] == "900.00"
    assert prepared.financial_impact[0]["withheld_amount"] == "0.00"
    assert [
        item["cash_allocated_amount"]
        for item in prepared.financial_impact[0]["allocations"]
    ] == ["400.00", "500.00"]
    assert session.transaction_entries == session.transaction_exits == 1
    assert "erp_security.activate_context" in session.executions[1][0]
    resolve_execution = next(
        execution for execution in session.executions
        if "resolve_supplier_payment_prepare" in execution[0]
    )
    persist_execution = next(
        execution for execution in session.executions
        if "persist_supplier_payment_prepare" in execution[0]
    )
    request = json.loads(resolve_execution[1]["request_json"])
    assert request["payment_method"] == "upi"
    assert all(item["allocation_id"] for item in request["allocations"])
    preview = json.loads(persist_execution[1]["preview_bytes"])
    assert preview["operation"] == "finance.payment.post"
    assert {
        source["resource_type"] for source in preview["source_versions"]
    } >= {
        "payment_date_fiscal_tax_fact",
        "invoice_credit_fiscal_tax_fact",
        "payable_allocation_state",
    }


def test_supplier_payment_prepare_failure_rolls_back_the_only_transaction():
    payload = _supplier_payment_service_payload()
    session = FakeSupplierPaymentSession(
        authority_branch=payload["branch_id"], fail_persist=True
    )
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "finance.supplier_payment.prepare",
            "permission": "finance.supplier_payment.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="supplier payment persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["finance.supplier_payment.prepare"],
            payload=payload,
            idempotency_key="prepare:supplier-payment:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def _inventory_transfer_service_payload():
    source_branch, destination_branch = uuid4(), uuid4()
    return {
        "source_branch_id": source_branch,
        "destination_branch_id": destination_branch,
        "source_location_id": uuid4(),
        "destination_location_id": uuid4(),
        "transfer_date": datetime.now(timezone(timedelta(hours=5, minutes=30))).date(),
        "lines": [{
            "product_id": uuid4(),
            "uom_conversion_id": uuid4(),
            "batch_allocations": [
                {"batch_id": uuid4(), "entered_quantity": "0.100000"},
                {"batch_id": uuid4(), "entered_quantity": "0.200000"},
            ],
        }],
        "logistics": {"transport_mode": "in_person", "distance_km": "0.00"},
    }


def test_inventory_transfer_prepare_is_one_runtime_transaction_and_preserves_tied_allocations():
    session = FakeInventoryTransferSession()
    payload = _inventory_transfer_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["source_branch_id"], payload["destination_branch_id"])).__dict__,
            "operation_key": "inventory.transfer.prepare",
            "permission": "inventory.transfer.create",
        }
    )
    service = SqlAlchemyOperatorActionService(lambda: session, runtime_principal_configured=True)

    prepared = service.prepare(
        policy=ACTION_POLICIES["inventory.transfer.prepare"],
        payload=payload,
        idempotency_key="prepare:inventory-transfer:0001",
        context=context,
    )

    assert prepared.command_type == "inventory.document.post"
    assert prepared.required_approvals == ({"policy": "actor_confirmation", "count": 1},)
    assert len(prepared.inventory_impact) == 2
    assert [item["base_quantity"] for item in prepared.inventory_impact] == ["0.100000", "0.200000"]
    assert all(item["source_branch_id"] == str(payload["source_branch_id"]) for item in prepared.inventory_impact)
    assert all(item["destination_branch_id"] == str(payload["destination_branch_id"]) for item in prepared.inventory_impact)
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 3
    request = json.loads(session.executions[1][1]["request_json"])
    assert len(request["lines"][0]["batch_allocations"]) == 2
    assert all(allocation["inventory_document_line_id"] for allocation in request["lines"][0]["batch_allocations"])
    preview = json.loads(session.executions[2][1]["preview_bytes"])
    assert preview["legal_scope"]["allocation_policy"] == "strict_fefo_earliest_expiry_tier"


def test_inventory_transfer_prepare_failure_rolls_back_the_only_transaction():
    session = FakeInventoryTransferSession(fail_persist=True)
    payload = _inventory_transfer_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["source_branch_id"], payload["destination_branch_id"])).__dict__,
            "operation_key": "inventory.transfer.prepare",
            "permission": "inventory.transfer.create",
        }
    )
    service = SqlAlchemyOperatorActionService(lambda: session, runtime_principal_configured=True)
    with pytest.raises(RuntimeError, match="inventory transfer persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["inventory.transfer.prepare"],
            payload=payload,
            idempotency_key="prepare:inventory-transfer:rollback",
            context=context,
        )
    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def _inventory_adjustment_service_payload():
    counted_at = datetime.now(timezone.utc)
    return {
        "branch_id": uuid4(),
        "adjustment_date": counted_at.astimezone(timezone(timedelta(hours=5, minutes=30))).date(),
        "counted_at": counted_at,
        "counted_by_membership_id": uuid4(),
        "location_id": uuid4(),
        "reason_code": "cycle_count",
        "evidence_attachment_id": uuid4(),
        "lines": [{
            "product_id": uuid4(),
            "uom_conversion_id": uuid4(),
            "batch_counts": [{"batch_id": uuid4(), "counted_quantity": "12.000000", "stock_balance_row_version": 7}],
        }],
    }


def test_inventory_adjustment_prepare_is_one_runtime_transaction_with_exact_signed_preview():
    session = FakeInventoryAdjustmentSession()
    payload = _inventory_adjustment_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "inventory.adjustment.prepare",
            "permission": "inventory.adjustment.create",
        }
    )
    service = SqlAlchemyOperatorActionService(lambda: session, runtime_principal_configured=True)

    prepared = service.prepare(
        policy=ACTION_POLICIES["inventory.adjustment.prepare"],
        payload=payload,
        idempotency_key="prepare:inventory-count:0001",
        context=context,
    )

    assert prepared.command_type == "inventory.document.post"
    assert prepared.calculation_ruleset == ()
    assert prepared.inventory_impact[0]["system_base_quantity"] == "100.000000"
    assert prepared.inventory_impact[0]["variance_base_quantity"] == "20.000000"
    assert prepared.inventory_impact[0]["variance_value"] == "50.00"
    assert prepared.financial_impact[0]["amount"] == "50.00"
    assert prepared.tax_impact[0]["supply_created"] is False
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 3
    request = json.loads(session.executions[1][1]["request_json"])
    assert request["reason_code"] == "cycle_count"
    assert "direction" not in request
    assert request["lines"][0]["batch_counts"][0]["inventory_document_line_id"]
    preview = json.loads(session.executions[2][1]["preview_bytes"])
    assert preview["operation"] == "inventory.document.post"
    assert preview["legal_scope"]["supported_effect"] == "homogeneous_gain_or_loss"


def test_inventory_adjustment_prepare_failure_rolls_back_the_only_transaction():
    session = FakeInventoryAdjustmentSession(fail_persist=True)
    payload = _inventory_adjustment_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "inventory.adjustment.prepare",
            "permission": "inventory.adjustment.create",
        }
    )
    service = SqlAlchemyOperatorActionService(lambda: session, runtime_principal_configured=True)

    with pytest.raises(RuntimeError, match="cycle-count persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["inventory.adjustment.prepare"],
            payload=payload,
            idempotency_key="prepare:inventory-count:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def _inventory_destruction_service_payload():
    confirmed_at = datetime.now(timezone.utc)
    return {
        "branch_id": uuid4(),
        "destruction_date": confirmed_at.date(),
        "physical_destruction_confirmed_at": confirmed_at,
        "location_id": uuid4(),
        "method_code": "licensed_incineration",
        "reason_code": "damaged",
        "reason": "Irreparably damaged quarantined stock.",
        "authority_reference": "PCB-AUTH-2026-001",
        "witness_name": "Licensed Disposal Witness",
        "witness_credential": "PCB-WITNESS-001",
        "certificate_attachment_id": uuid4(),
        "itc_reversal_evidence_attachment_id": uuid4(),
        "itc_treatment": "section_17_5_h_reversal",
        "lines": [{
            "product_id": uuid4(),
            "uom_conversion_id": uuid4(),
            "batch_allocations": [
                {
                    "inventory_document_line_id": uuid4(),
                    "batch_id": uuid4(),
                    "entered_quantity": "3.000000",
                }
            ],
        }],
    }


def test_inventory_destruction_prepare_is_one_runtime_transaction_with_exact_loss_preview():
    session = FakeInventoryDestructionSession()
    payload = _inventory_destruction_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "inventory.destruction.prepare",
            "permission": "inventory.destruction.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session, runtime_principal_configured=True
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["inventory.destruction.prepare"],
        payload=payload,
        idempotency_key="prepare:inventory-destruction:0001",
        context=context,
    )

    assert prepared.command_type == "compliance.destruction.post"
    assert prepared.inventory_impact[0]["destroyed_base_quantity"] == "3.000000"
    assert prepared.inventory_impact[0]["inventory_value_removed"] == "30.00"
    assert prepared.financial_impact[0]["amount"] == "30.00"
    assert prepared.required_approvals == ({"policy": "separate_approver", "count": 1},)
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 3
    request = json.loads(session.executions[1][1]["request_json"])
    assert request["lines"][0]["batch_allocations"][0][
        "inventory_document_line_id"
    ]
    preview = json.loads(session.executions[2][1]["preview_bytes"])
    assert preview["operation"] == "compliance.destruction.post"
    assert preview["destruction_reason"] == {
        "code": payload["reason_code"],
        "detail": payload["reason"],
    }
    assert preview["legal_scope"]["supported_quantity"] == (
        "full_batch_location_balance_only"
    )


def test_inventory_destruction_prepare_failure_rolls_back_the_only_transaction():
    session = FakeInventoryDestructionSession(fail_persist=True)
    payload = _inventory_destruction_service_payload()
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "inventory.destruction.prepare",
            "permission": "inventory.destruction.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session, runtime_principal_configured=True
    )
    with pytest.raises(RuntimeError, match="inventory destruction persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["inventory.destruction.prepare"],
            payload=payload,
            idempotency_key="prepare:inventory-destruction:rollback",
            context=context,
        )
    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def _supplier_advance_service_payload():
    return {
        "branch_id": uuid4(),
        "payment_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "supplier_account_id": uuid4(),
        "purchase_order_id": uuid4(),
        "settlement_account_id": uuid4(),
        "bank_account_id": uuid4(),
        "payment_method": "bank_transfer",
        "gross_amount": "50000.00",
        "allocations": [
            {"purchase_order_line_id": uuid4(), "gross_amount": "50000.00"}
        ],
        "external_reference": "bank-advance-0001",
    }


def test_supplier_advance_prepare_is_one_runtime_transaction_and_exact_gross_cash():
    payload = _supplier_advance_service_payload()
    session = FakeSupplierAdvanceSession(authority_branch=payload["branch_id"])
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "finance.supplier_advance.prepare",
            "permission": "finance.supplier_advance.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["finance.supplier_advance.prepare"],
        payload=payload,
        idempotency_key="prepare:supplier-advance:0001",
        context=context,
    )

    assert prepared.command_type == "finance.supplier_advance.post"
    assert prepared.calculation_ruleset == ()
    assert prepared.inventory_impact == ()
    assert prepared.tax_impact == ()
    assert prepared.financial_impact[0]["gross_advance_amount"] == "50000.00"
    assert prepared.financial_impact[0]["cash_disbursed_amount"] == "50000.00"
    assert prepared.financial_impact[0]["withheld_amount"] == "0.00"
    assert session.transaction_entries == session.transaction_exits == 1
    assert "erp_security.activate_context" in session.executions[1][0]
    resolve_execution = next(
        execution for execution in session.executions
        if "resolve_supplier_advance_prepare" in execution[0]
    )
    persist_execution = next(
        execution for execution in session.executions
        if "persist_supplier_advance_prepare" in execution[0]
    )
    request = json.loads(resolve_execution[1]["request_json"])
    assert request["allocations"][0]["advance_allocation_id"]
    assert request["allocations"][0]["prepayment_open_item_id"]
    preview = json.loads(persist_execution[1]["preview_bytes"])
    assert preview["operation"] == "finance.supplier_advance.post"
    assert preview["tax_impact"] == []


def test_supplier_advance_prepare_failure_rolls_back_the_only_transaction():
    payload = _supplier_advance_service_payload()
    session = FakeSupplierAdvanceSession(
        authority_branch=payload["branch_id"], fail_persist=True
    )
    context = ActionContext(
        **{
            **_context(branch_ids=(payload["branch_id"],)).__dict__,
            "operation_key": "finance.supplier_advance.prepare",
            "permission": "finance.supplier_advance.create",
        }
    )
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        runtime_principal_configured=True,
    )

    with pytest.raises(RuntimeError, match="supplier advance persistence failed"):
        service.prepare(
            policy=ACTION_POLICIES["finance.supplier_advance.prepare"],
            payload=payload,
            idempotency_key="prepare:supplier-advance:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def test_sales_dispatch_prepare_uses_one_runtime_transaction_and_exact_batches():
    session = FakeDispatchSession()
    branch_id = uuid4()
    context = _context(branch_ids=(branch_id,))
    context = ActionContext(
        **{
            **context.__dict__,
            "operation_key": "sales.dispatch.prepare",
            "permission": "sales.dispatch.create",
        }
    )
    payload = {
        "branch_id": branch_id,
        "dispatch_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "sales_order_id": uuid4(),
        "from_location_id": uuid4(),
        "lines": [{
            "sales_order_line_id": uuid4(),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "batch_allocations": [{
                "batch_id": uuid4(),
                "billed_quantity": "2.000000",
                "free_quantity": "1.000000",
            }],
        }],
        "logistics": {
            "transport_mode": "road",
            "distance_km": "150.00",
            "transporter_party_id": uuid4(),
            "vehicle_number": "MH12AB1234",
            "vehicle_type": "regular",
        },
    }
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        calculator_factory=lambda: (_ for _ in ()).throw(
            AssertionError("calculator DB opened")
        ),
        runtime_principal_configured=True,
    )

    prepared = service.prepare(
        policy=ACTION_POLICIES["sales.dispatch.prepare"],
        payload=payload,
        idempotency_key="prepare:sales-dispatch:0001",
        context=context,
    )

    assert prepared.command_type == "sales.dispatch.post"
    assert prepared.inventory_impact[0]["base_billed_quantity"] == "20.000000"
    assert prepared.inventory_impact[0]["base_free_quantity"] == "10.000000"
    assert prepared.financial_impact == ({
        "currency_code": "INR",
        "inventory_valuation": "375.00",
        "cost_of_goods_sold": "375.00",
    },)
    assert prepared.calculation_ruleset == ()
    assert prepared.tax_impact == ()
    assert session.transaction_entries == session.transaction_exits == 1
    assert len(session.executions) == 3
    sql = "\n".join(statement for statement, _ in session.executions)
    assert "FROM pg_catalog.pg_roles AS role" in session.executions[0][0]
    assert "resolve_sales_dispatch_prepare" in sql
    assert "persist_sales_dispatch_prepare" in sql
    request = json.loads(session.executions[1][1]["request_json"])
    assert request["lines"][0]["sales_order_line_id"] == str(
        payload["lines"][0]["sales_order_line_id"]
    )
    assert request["lines"][0]["batch_allocations"][0]["batch_id"] == str(
        payload["lines"][0]["batch_allocations"][0]["batch_id"]
    )
    assert "product_id" not in request["lines"][0]
    assert "uom_conversion_id" not in request["lines"][0]
    assert "quoted_unit_rate" not in request["lines"][0]
    assert "tax_code_version_id" not in request["lines"][0]
    assert request["valuation_journal_id"]
    assert request["valuation_event_id"]


def test_sales_dispatch_prepare_failure_exits_the_single_transaction_for_rollback():
    session = FailingDispatchSession()
    branch_id = uuid4()
    context = _context(branch_ids=(branch_id,))
    context = ActionContext(
        **{
            **context.__dict__,
            "operation_key": "sales.dispatch.prepare",
            "permission": "sales.dispatch.create",
        }
    )
    payload = {
        "branch_id": branch_id,
        "dispatch_date": datetime(2026, 8, 20, tzinfo=timezone.utc).date(),
        "sales_order_id": uuid4(),
        "from_location_id": uuid4(),
        "lines": [{
            "sales_order_line_id": uuid4(),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "batch_allocations": [{
                "batch_id": uuid4(),
                "billed_quantity": "2.000000",
                "free_quantity": "1.000000",
            }],
        }],
        "logistics": {
            "transport_mode": "road",
            "distance_km": "150.00",
            "transporter_party_id": uuid4(),
            "vehicle_number": "MH12AB1234",
            "vehicle_type": "regular",
        },
    }
    service = SqlAlchemyOperatorActionService(
        lambda: session, runtime_principal_configured=True
    )

    with pytest.raises(RuntimeError, match="simulated persistence failure"):
        service.prepare(
            policy=ACTION_POLICIES["sales.dispatch.prepare"],
            payload=payload,
            idempotency_key="prepare:sales-dispatch:rollback",
            context=context,
        )

    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def test_status_reauthorizes_and_reads_canonical_evidence_in_one_transaction():
    branch_id = uuid4()
    command_request_id = uuid4()
    audit_id = uuid4()
    command_row = _command_row(command_request_id)
    session = FakeSession(
        authority_branch=branch_id,
        command_row=command_row,
        audit_rows=(
            {
                "id": audit_id,
                "chain_sequence": 17,
                "occurred_at": datetime.now(timezone.utc),
                "event_type": "command_prepared",
                "resource_type": "automation.command_requests",
                "resource_id": command_request_id,
                "mutation_kind": "insert",
                "evidence_hash": bytes.fromhex("cd" * 32),
            },
        ),
    )
    context = _context(branch_ids=(branch_id,))
    service = SqlAlchemyOperatorActionService(lambda: session)

    state = service.get_status(
        command_request_id=command_request_id,
        context=context,
    )

    assert state.command_request_id == command_request_id
    assert state.preview_hash == "sha256:" + "ab" * 32
    assert state.audit_references[0]["id"] == str(audit_id)
    assert state.audit_references[0]["evidence_hash"] == "cd" * 32
    assert session.transaction_entries == 1
    assert session.transaction_exits == 1
    assert len(session.executions) == 5

    sql = "\n".join(statement for statement, _ in session.executions)
    assert "FROM pg_catalog.pg_roles AS role" in session.executions[0][0]
    assert "erp_security.activate_context" in sql
    assert "automation.agent_grants" in sql
    assert "automation.agent_grant_capabilities" in sql
    assert "core.access_grants" in sql
    assert "access_grant.valid_from_at" in sql
    assert "erp_automation_reads.requester_command_status" in sql
    assert "request.approved_at" in session.executions[3][0]
    assert "approval.approved_at" not in session.executions[3][0]
    assert "FROM automation.command_requests AS request" in PROJECTION_SQL
    assert "core.audit_events" in sql
    assert "legacy" not in sql.lower()

    status_parameters = session.executions[3][1]
    assert status_parameters["org_id"] == context.organization_id
    assert status_parameters["agent_grant_id"] == context.agent_grant_id
    assert status_parameters["membership_id"] == context.membership_id
    activation_parameters = session.executions[1][1]
    assert activation_parameters == {
        "org_id": context.organization_id,
        "auth_user_id": context.auth_user_id,
    }
    assert "activate_context(:auth_user_id, :org_id)" in session.executions[1][0]
    assert ":membership_id" not in session.executions[1][0]


def test_readback_resource_preserves_exact_capability_and_result_identity():
    branch_id = uuid4()
    command_request_id = uuid4()
    resource_id = uuid4()
    command_row = {
        **_command_row(command_request_id),
        "operation": "finance.payment.post",
        "capability_code": "finance.customer_receipt.prepare",
        "status": "succeeded",
        "result_resource_type": "payment",
        "result_resource_id": resource_id,
    }
    session = FakeSession(authority_branch=branch_id, command_row=command_row)
    context = _context(branch_ids=(branch_id,))

    result = SqlAlchemyOperatorActionService(lambda: session).get_succeeded_resource(
        command_request_id=command_request_id,
        context=context,
    )

    assert result == {
        "command_request_id": command_request_id,
        "capability_code": "finance.customer_receipt.prepare",
        "command_type": "finance.payment.post",
        "status": "succeeded",
        "resource_type": "payment",
        "resource_id": resource_id,
    }
    assert session.transaction_entries == session.transaction_exits == 1
    assert "request.capability_code" in session.executions[-1][0]


def test_approval_calls_only_reviewed_command_in_one_transaction():
    command_request_id = uuid4()
    approval_id = uuid4()
    now = datetime.now(timezone.utc)
    session = FakeSession(
        authority_branch=None,
        command_row=None,
        approval_row={
            "operation": "sales.invoice.prepare",
            "status": "prepared",
            "preview_hash": bytes.fromhex("ab" * 32),
            "result_resource_type": None,
            "result_resource_id": None,
            "approval_id": approval_id,
            "decided_at": now,
        },
    )
    context = _context(organization_scope=True)
    service = SqlAlchemyOperatorActionService(lambda: session)

    result = service.approve(
        command_request_id=command_request_id,
        preview_hash="sha256:" + "ab" * 32,
        idempotency_key="approval:test:0001",
        context=context,
    )

    assert result.command_request_id == command_request_id
    assert result.status == "approved"
    assert result.approved_at == now
    assert session.transaction_entries == session.transaction_exits == 1
    sql = "\n".join(statement for statement, _ in session.executions)
    assert "erp_automation_commands.approve_operator_command" in sql
    assert "INSERT INTO automation.command_approvals" not in sql
    assert "erp_automation_reads.approval_deadline" in sql
    assert "FOR SHARE OF request" in PROJECTION_SQL
    assert "FOR SHARE OF request, approval" not in sql
    approve_parameters = session.executions[4][1]
    assert approve_parameters["org_id"] == context.organization_id
    assert approve_parameters["command_request_id"] == command_request_id
    assert len(approve_parameters["idempotency_key_hash"]) == 32


def test_expense_claim_self_approval_is_translated_and_rolls_back():
    command_request_id = uuid4()
    now = datetime.now(timezone.utc)

    class SelfApprovalSession(FakeSession):
        def execute(self, statement, parameters=None):
            if "approve_expense_claim_command" in str(statement):
                raise IntegrityError(
                    str(statement),
                    dict(parameters or {}),
                    _PostgresPolicyFailure(
                        "42501",
                        "expense claim requires an unexpired exact-preview independent approval",
                    ),
                )
            return super().execute(statement, parameters)

    session = SelfApprovalSession(
        authority_branch=None,
        command_row=None,
        approval_row={
            "operation": "finance.expense_claim.post",
            "status": "prepared",
            "preview_hash": bytes.fromhex("ab" * 32),
            "result_resource_type": "expense_claim",
            "result_resource_id": command_request_id,
            "approval_id": uuid4(),
            "decided_at": now,
        },
    )
    service = SqlAlchemyOperatorActionService(lambda: session)

    with pytest.raises(OperatorActionError) as error:
        service.approve(
            command_request_id=command_request_id,
            preview_hash="sha256:" + "ab" * 32,
            idempotency_key="approval:self-expense:0001",
            context=_context(organization_scope=True),
        )

    assert error.value.code is ActionErrorCode.SCOPE_DENIED
    assert error.value.metadata == {
        "operation_key": "automation.command.approve",
        "reason": "CANONICAL_DATABASE_POLICY_REJECTED",
        "sqlstate": "42501",
    }
    assert session.transaction_entries == session.transaction_exits == 1
    assert session.transaction_failures == 1


def test_finance_business_date_rejection_is_a_typed_validation_error():
    from app.infrastructure.operator_actions.service import _database_action_error

    database_error = IntegrityError(
        "SELECT canonical finance resolver",
        {},
        _PostgresPolicyFailure(
            "22007",
            "finance command date exceeds the organization business date",
        ),
    )

    translated = _database_action_error(
        database_error,
        "finance.supplier_advance.prepare",
    )

    assert translated is not None
    assert translated.code is ActionErrorCode.VALIDATION_FAILED
    assert str(translated) == "Canonical command date is invalid"
    assert translated.metadata == {
        "operation_key": "finance.supplier_advance.prepare",
        "reason": "CANONICAL_DATABASE_POLICY_REJECTED",
        "sqlstate": "22007",
    }


def test_command_context_casts_uuid_to_postgres_text_setting():
    from app.infrastructure.operator_actions.service import _SET_COMMAND_CONTEXT_SQL

    sql = str(_SET_COMMAND_CONTEXT_SQL)
    assert "CAST(:command_request_id AS text)" in sql
    assert "set_config('app.command_request_id'" in sql


def test_status_rejects_changed_branch_scope_before_reading_command():
    command_request_id = uuid4()
    granted_branch = uuid4()
    claimed_branch = uuid4()
    session = FakeSession(
        authority_branch=granted_branch,
        command_row=_command_row(command_request_id),
    )
    service = SqlAlchemyOperatorActionService(lambda: session)

    with pytest.raises(OperatorActionError) as error:
        service.get_status(
            command_request_id=command_request_id,
            context=_context(branch_ids=(claimed_branch,)),
        )

    assert error.value.code is ActionErrorCode.BRANCH_DENIED
    assert len(session.executions) == 3
    assert session.transaction_entries == 1
    assert session.transaction_exits == 1


def test_execute_locks_exact_preview_and_calls_only_closed_dispatcher():
    command_request_id = uuid4()
    command_row = _command_row(command_request_id)
    session = FakeSession(
        authority_branch=None,
        command_row=command_row,
    )
    context = _context(organization_scope=True)
    service = SqlAlchemyOperatorActionService(lambda: session)

    result = service.execute(
        command_request_id=command_request_id,
        preview_hash="sha256:" + "ab" * 32,
        idempotency_key="execute:test:0001",
        context=context,
    )

    assert result.status == "succeeded"
    assert result.resource_type == "sales_order"
    assert result.idempotency_replayed is False
    assert session.transaction_entries == session.transaction_exits == 1
    sql = "\n".join(statement for statement, _ in session.executions)
    assert "erp_automation_reads.lock_requester_command" in sql
    assert "FOR UPDATE OF request" in PROJECTION_SQL
    assert "erp_automation_commands.execute_approved_command" in sql
    assert "INSERT INTO" not in sql
    assert "UPDATE automation.command_requests" not in sql


def test_execute_routes_destruction_only_to_the_reviewed_custom_dispatcher():
    command_request_id = uuid4()
    command_row = _command_row(command_request_id)
    command_row["operation"] = "compliance.destruction.post"
    session = FakeSession(authority_branch=None, command_row=command_row)
    service = SqlAlchemyOperatorActionService(lambda: session)

    result = service.execute(
        command_request_id=command_request_id,
        preview_hash="sha256:" + "ab" * 32,
        idempotency_key="execute:destruction:0001",
        context=_context(organization_scope=True),
    )

    assert result.status == "succeeded"
    assert result.resource_type == "destruction"
    sql = "\n".join(statement for statement, _ in session.executions)
    assert "erp_automation_commands.execute_inventory_destruction_command" in sql
    assert "erp_automation_commands.execute_approved_command" not in sql


def test_execute_rejects_preview_mismatch_before_dispatch():
    command_request_id = uuid4()
    session = FakeSession(
        authority_branch=None,
        command_row=_command_row(command_request_id),
    )
    service = SqlAlchemyOperatorActionService(lambda: session)

    with pytest.raises(OperatorActionError) as error:
        service.execute(
            command_request_id=command_request_id,
            preview_hash="sha256:" + "cd" * 32,
            idempotency_key="execute:test:0002",
            context=_context(organization_scope=True),
        )

    assert error.value.code is ActionErrorCode.PREVIEW_CHANGED
    assert all(
        "execute_approved_command" not in sql for sql, _ in session.executions
    )


def test_status_rejects_inactive_authority_without_command_enumeration():
    session = FakeSession(authority_branch=False, command_row=None)
    service = SqlAlchemyOperatorActionService(lambda: session)

    with pytest.raises(OperatorActionError) as error:
        service.get_status(command_request_id=uuid4(), context=_context())

    assert error.value.code is ActionErrorCode.SCOPE_DENIED
    assert len(session.executions) == 3


def test_reviewer_reads_exact_preview_without_requester_grant_ownership():
    command_id, requester_id, branch_id, target_id = (uuid4() for _ in range(4))
    preview = {
        "resolved_references": [{"resource_id": str(target_id)}],
        "source_versions": [{"resource_id": str(target_id), "row_version": 7}],
        "calculation_ruleset": [],
        "inventory_impact": [],
        "financial_impact": [{"amount": "168.00"}],
        "tax_impact": [],
        "policy_warnings": [],
    }
    preview_bytes = json.dumps(
        preview, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    row = {
        "id": command_id,
        "operation": "finance.adjustment_note.post",
        "capability_code": "finance.adjustment_note.prepare",
        "status": "pending_approval",
        "requested_by_membership_id": requester_id,
        "branch_id": branch_id,
        "destination_branch_id": None,
        "target_resource_type": "adjustment_note",
        "target_resource_id": target_id,
        "target_row_version": 1,
        "serializer_version": "canonical-json-v1",
        "preview_media_type": "application/json",
        "request_bytes": b"request",
        "preview_bytes": preview_bytes,
        "preview_hash": hashlib.sha256(preview_bytes).digest(),
        "request_hash": hashlib.sha256(b"request").digest(),
        "aggregate_version_hash": hashlib.sha256(b"aggregate").digest(),
        "approval_policy": "separate_approver",
        "required_approval_count": 1,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
    }
    context = ActionContext(
        **{
            **_context(branch_ids=(branch_id,)).__dict__,
            "operation_key": "automation.command.approve",
            "permission": "automation.command.approve",
        }
    )
    session = FakeSession(authority_branch=branch_id, command_row=row)

    review = SqlAlchemyOperatorActionService(lambda: session).review(
        command_request_id=command_id,
        context=context,
    )

    assert review.preview_canonical_json.encode("utf-8") == preview_bytes
    assert review.preview_hash == "sha256:" + hashlib.sha256(preview_bytes).hexdigest()
    assert review.requested_by_membership_id == requester_id
    review_sql, params = next(
        (sql, params) for sql, params in session.executions
        if "request.preview_bytes" in sql
    )
    assert "request.agent_grant_id" not in review_sql
    assert "erp_automation_reads.reviewable_command" in review_sql
    assert "request.requested_by_membership_id <> actor_id" in PROJECTION_SQL
    assert params["org_id"] == context.organization_id
    assert params["branch_ids"] == [branch_id]
    authority_params = next(
        params for sql, params in session.executions
        if "FROM automation.agent_grants AS grant_row" in sql
    )
    assert authority_params["operation_key"] == "automation.command.approve"
    assert authority_params["approval_policy"] == "actor_confirmation"
    assert context.membership_id != requester_id


def test_reviewer_inactive_authority_fails_before_command_enumeration():
    session = FakeSession(
        authority_branch=False,
        command_row=_command_row(uuid4()),
    )
    context = ActionContext(
        **{
            **_context(organization_scope=True).__dict__,
            "operation_key": "automation.command.approve",
            "permission": "automation.command.approve",
        }
    )

    with pytest.raises(OperatorActionError) as error:
        SqlAlchemyOperatorActionService(lambda: session).review(
            command_request_id=uuid4(), context=context
        )

    assert error.value.code is ActionErrorCode.SCOPE_DENIED
    assert error.value.message == "Canonical operator authority is inactive"
    assert not any(
        "erp_automation_reads.reviewable_command" in sql
        for sql, _params in session.executions
    )
    assert session.transaction_entries == session.transaction_exits == 1


def test_reviewer_cross_tenant_or_unauthorized_command_is_not_enumerated():
    session = FakeSession(authority_branch=None, command_row=None)
    context = ActionContext(
        **{
            **_context(organization_scope=True).__dict__,
            "operation_key": "automation.command.approve",
            "permission": "automation.command.approve",
        }
    )
    with pytest.raises(OperatorActionError) as error:
        SqlAlchemyOperatorActionService(lambda: session).review(
            command_request_id=uuid4(), context=context
        )
    assert error.value.code is ActionErrorCode.SCOPE_DENIED
    assert "unavailable to this reviewer" in error.value.message


def test_infrastructure_adapter_has_no_legacy_service_or_table_dependency():
    source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (
            Path(__file__).resolve().parents[2]
            / "app/infrastructure/operator_actions"
        ).glob("*.py")
    )
    assert "api.services" not in source
    assert " public." not in source
    assert "execute(text(" not in source
    assert "erp_automation_commands.execute_approved_command" in source
    assert "pg_advisory_xact_lock" in source
    assert source.count("_lock_prepare_idempotency(") == 20


def test_calculator_database_requires_the_isolated_principal(monkeypatch):
    calculator_session_factory.cache_clear()
    monkeypatch.delenv(CALCULATOR_DATABASE_URL_ENV, raising=False)
    assert calculator_database_configured() is False
    with pytest.raises(RuntimeError, match="erp_calculator"):
        calculator_session_factory()

    calculator_session_factory.cache_clear()
    monkeypatch.setenv(
        CALCULATOR_DATABASE_URL_ENV,
        "postgresql://erp_calculator.abcdefghijklmnopqrst:secret@"
        "aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
    )
    assert calculator_database_configured() is True

    calculator_session_factory.cache_clear()
    monkeypatch.setenv(
        CALCULATOR_DATABASE_URL_ENV,
        "postgresql://erp_runtime:secret@db.example.test:5432/erp",
    )
    assert calculator_database_configured() is False
    with pytest.raises(RuntimeError, match="erp_calculator"):
        calculator_session_factory()


def test_calculator_database_transport_dependency_is_one_way_and_bounded():
    ordinary_database = (
        Path(__file__).resolve().parents[2] / "app/core/database.py"
    ).read_text(encoding="utf-8")
    calculator_database = (
        Path(__file__).resolve().parents[2]
        / "app/infrastructure/operator_actions/calculator_database.py"
    ).read_text(encoding="utf-8")
    assert "operator_actions.calculator_database" not in ordinary_database
    assert "validate_direct_database_peer" in ordinary_database
    assert "validate_direct_database_peer" in calculator_database
    assert '== "erp_calculator"' in calculator_database
    assert "pool_size=2" in calculator_database
    assert "max_overflow=0" in calculator_database
