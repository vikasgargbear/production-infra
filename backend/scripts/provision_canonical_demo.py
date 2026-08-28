#!/usr/bin/env python3
"""Provision and exercise the disposable canonical staging organization.

This script is intentionally staging-only. Regulatory source data is fetched
from reviewed official tax authorities, while every organization, party,
identifier, and transaction is synthetic and isolated under one deterministic
demo organization UUID.
"""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import os
import re
import sys
import time
from io import BytesIO
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, NamedTuple
from uuid import NAMESPACE_URL, UUID, uuid5
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import jwt
import pdfplumber
import psycopg2
import requests

try:
    from scripts.compile_live18_browser_fixture import (
        FixtureCompileError,
        supplier_invoice_chain_choices,
        validate_reviewed_scalar_pack,
    )
    from scripts.canonical_demo_ids import (
        canonical_demo_authority_ids,
        canonical_live18_cycle_count_authority,
        canonical_live18_destruction_authority,
    )
except ModuleNotFoundError:  # Direct execution places this script directory on sys.path.
    from compile_live18_browser_fixture import (  # type: ignore[no-redef]
        FixtureCompileError,
        supplier_invoice_chain_choices,
        validate_reviewed_scalar_pack,
    )
    from canonical_demo_ids import (  # type: ignore[no-redef]
        canonical_demo_authority_ids,
        canonical_live18_cycle_count_authority,
        canonical_live18_destruction_authority,
    )


PROJECT_REF = "rgihahbmkrmhitjdjvev"
SOURCE_URI = "https://gstcouncil.gov.in/sites/default/files/2024-09/02_2024_ctr_eng.pdf"
SOURCE_PUBLICATION_DATE = date(2024, 7, 12)
SOURCE_EFFECTIVE_FROM = date(2024, 7, 15)
ADJUSTMENT_SOURCE_URI = (
    "https://gstcouncil.gov.in/sites/default/files/2024-02/faq-minin.pdf"
)
ADJUSTMENT_SOURCE_PUBLICATION_DATE = date(2017, 7, 1)
GSTR1_REPORTING_SOURCE_URI = (
    "https://tutorial.gst.gov.in/downloads/invoiceuploadofflineutility.pdf"
)
GSTR1_REPORTING_SOURCE_SHA256 = (
    "b151edf26c1c159e24eb53083fe0e42addbf0c297a4d6defd02bd8a127163003"
)
GSTR1_REPORTING_SOURCE_PUBLICATION_DATE = date(2025, 12, 29)
GSTR1_REPORTING_EFFECTIVE_FROM = date(2017, 7, 1)
GSTR1_REPORTING_RULESET_VERSION = "gstn-returns-offline-tool-2025-12-29"
ITC_REVERSAL_SOURCE_URI = "https://cbic-gst.gov.in/pdf/CGST-Act-2017-amended-01012022.pdf"
ITC_REVERSAL_SOURCE_PUBLICATION_DATE = date(2022, 1, 1)
ITC_REVERSAL_EFFECTIVE_FROM = date(2017, 7, 1)
ITC_REVERSAL_RULESET_VERSION = "cgst-act-section-17-5-h-2022-01-01"
OFFICIAL_SOURCE_RETRYABLE_STATUS_CODES = frozenset(
    {408, 429, 500, 502, 503, 504}
)
OFFICIAL_SOURCE_MAX_ATTEMPTS = 4
CLIENT_ID = os.getenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "").strip()
SCRIPT_DIRECTORY = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIRECTORY.parent
REPOSITORY_ROOT = BACKEND_ROOT.parent
_PACKAGED_OPERATOR_CONTRACT_PATH = (
    BACKEND_ROOT / "docs" / "architecture" / "mcp-operator-actions.json"
)
OPERATOR_CONTRACT_PATH = (
    _PACKAGED_OPERATOR_CONTRACT_PATH
    if _PACKAGED_OPERATOR_CONTRACT_PATH.is_file()
    else REPOSITORY_ROOT / "docs/architecture/mcp-operator-actions.json"
)

IDS = {
    "org": "d3000000-0000-7000-8000-000000000001",
    "reviewer_auth_user": "d3000000-0000-7000-8000-000000000002",
    "reviewer_user": "d3000000-0000-7000-8000-000000000003",
    "reviewer_membership": "d3000000-0000-7000-8000-000000000004",
    "branch": "d3000000-0000-7000-8000-000000000005",
    "transfer_destination_branch": "d3000000-0000-7000-8000-000000000028",
    "role": "d3000000-0000-7000-8000-000000000006",
    "reviewer_access_grant": "d3000000-0000-7000-8000-000000000007",
    "safety_setting": "d3000000-0000-7000-8000-000000000008",
    "expense_receipt_retention_setting": "d3000000-0000-7000-8000-000000000029",
    "agent_grant": "d3000000-0000-7000-8000-000000000021",
    "legacy_approver_agent_grant": "d3000000-0000-7000-8000-000000000020",
    "operator_auth_user": "d3000000-0000-7000-8000-000000000022",
    "operator_user": "d3000000-0000-7000-8000-000000000023",
    "operator_membership": "d3000000-0000-7000-8000-000000000024",
    "operator_access_grant": "d3000000-0000-7000-8000-000000000025",
    "denial_org": "d3000000-0000-7000-8000-00000000002c",
    "denial_membership": "d3000000-0000-7000-8000-00000000002d",
    "customer_party": "d3000000-0000-7000-8000-000000000010",
    "customer_account": "d3000000-0000-7000-8000-000000000011",
    "customer_address": "d3000000-0000-7000-8000-000000000012",
    "customer_contact": "d3000000-0000-7000-8000-000000000027",
    "manufacturer_party": "d3000000-0000-7000-8000-000000000013",
    "receivable_account": "d3000000-0000-7000-8000-000000000014",
    "product": "d3000000-0000-7000-8000-000000000015",
    "uom_conversion": "d3000000-0000-7000-8000-000000000016",
    "count_uom_conversion": "d3000000-0000-7000-8000-000000000026",
    "sales_order_sequence": "d3000000-0000-7000-8000-000000000017",
    "customer_gstin": "d3000000-0000-7000-8000-000000000018",
    "request": "d3000000-0000-7000-8000-000000000019",
    "tax_release": "d3100000-0000-7000-8000-000000000001",
    "tax_version": "d3100000-0000-7000-8000-000000000002",
    "adjustment_rule_release": "d3100000-0000-7000-8000-000000000003",
    "sales_return_rule": "d3100000-0000-7000-8000-000000000004",
    "purchase_return_rule": "d3100000-0000-7000-8000-000000000005",
    "gstr1_reporting_release": "d3300000-0000-7000-8000-000000000001",
    "gstr1_reporting_legacy_rule": "d3300000-0000-7000-8000-000000000002",
    "gstr1_reporting_current_rule": "d3300000-0000-7000-8000-000000000003",
    "gstr1_reporting_activation_request": "d3300000-0000-7000-8000-000000000004",
    "supplier_party": "d3200000-0000-7000-8000-000000000001",
    "supplier_account": "d3200000-0000-7000-8000-000000000002",
    "supplier_address": "d3200000-0000-7000-8000-000000000003",
    "supplier_gstin": "d3200000-0000-7000-8000-000000000004",
    "org_gst_registration": "d3200000-0000-7000-8000-000000000005",
    "saleable_location": "d3200000-0000-7000-8000-000000000006",
    "quarantine_location": "d3200000-0000-7000-8000-000000000007",
    "transfer_destination_location": "d3200000-0000-7000-8000-00000000000f",
    "bank_account": "d3200000-0000-7000-8000-000000000008",
    "tax_profile_evidence": "d3200000-0000-7000-8000-000000000009",
    "fiscal_fact_evidence": "d3200000-0000-7000-8000-00000000000a",
    "fiscal_tax_fact": "d3200000-0000-7000-8000-00000000000b",
    "cycle_count_evidence": "d3200000-0000-7000-8000-00000000000c",
    "recipient_itc_evidence": "d3200000-0000-7000-8000-00000000000d",
    "supplier_contact": "d3200000-0000-7000-8000-00000000000e",
    "bank_ledger": "d3210000-0000-7000-8000-000000000001",
    "payable_account": "d3210000-0000-7000-8000-000000000002",
    "inventory_account": "d3210000-0000-7000-8000-000000000003",
    "cogs_account": "d3210000-0000-7000-8000-000000000004",
    "sales_revenue_account": "d3210000-0000-7000-8000-000000000005",
    "supplier_prepayment_account": "d3210000-0000-7000-8000-000000000006",
    "input_cgst_account": "d3210000-0000-7000-8000-000000000007",
    "input_sgst_account": "d3210000-0000-7000-8000-000000000008",
    "input_igst_account": "d3210000-0000-7000-8000-000000000009",
    "input_cess_account": "d3210000-0000-7000-8000-00000000000a",
    "output_cgst_account": "d3210000-0000-7000-8000-00000000000b",
    "output_sgst_account": "d3210000-0000-7000-8000-00000000000c",
    "output_igst_account": "d3210000-0000-7000-8000-00000000000d",
    "output_cess_account": "d3210000-0000-7000-8000-00000000000e",
    "grni_account": "d3210000-0000-7000-8000-00000000000f",
    "purchase_return_variance_account": "d3210000-0000-7000-8000-000000000010",
    "inventory_count_gain_account": "d3210000-0000-7000-8000-000000000011",
    "inventory_count_loss_account": "d3210000-0000-7000-8000-000000000016",
    "rounding_gain_account": "d3210000-0000-7000-8000-000000000012",
    "rounding_loss_account": "d3210000-0000-7000-8000-000000000013",
    "expense_claim_expense_account": "d3210000-0000-7000-8000-000000000014",
    "expense_claim_reimbursement_account": "d3210000-0000-7000-8000-000000000015",
    "purchase_price_variance_account": "d3210000-0000-7000-8000-000000000017",
    "cash_on_hand_account": "d3210000-0000-7000-8000-000000000018",
    "cheques_in_hand_account": "d3210000-0000-7000-8000-000000000019",
    "customer_advance_account": "d3210000-0000-7000-8000-000000000020",
}
DEMO_EXPENSE_RECEIPT_RETENTION_MONTHS = Decimal("84")
DEMO_RUN_ID = os.getenv("GITHUB_RUN_ID", "local")
DEMO_RUN_ATTEMPT = os.getenv("GITHUB_RUN_ATTEMPT", "1")
DEMO_UI_FIXTURE_ID = f"{DEMO_RUN_ID}-{DEMO_RUN_ATTEMPT}"
LIVE23_VARIANTS_REQUIRED = os.getenv("LIVE23_VARIANTS_REQUIRED") == "true"
IDS.update(
    canonical_demo_authority_ids(IDS["org"], DEMO_RUN_ID, DEMO_RUN_ATTEMPT)
)
LIVE18_CYCLE_COUNT_AUTHORITY = canonical_live18_cycle_count_authority(
    IDS["org"], DEMO_RUN_ID, DEMO_RUN_ATTEMPT
)
IDS["live18_cycle_count_evidence"] = (
    LIVE18_CYCLE_COUNT_AUTHORITY.attachment_id
)
IDS["cycle_count_evidence"] = str(
    uuid5(
        NAMESPACE_URL,
        (
            f"canonical-staging-cycle-count:{IDS['org']}:"
            f"{DEMO_RUN_ID}:{DEMO_RUN_ATTEMPT}"
        ),
    )
)
for resource_key in ("expense_receipt_evidence", "customer_receipt_evidence"):
    IDS[resource_key] = str(
        uuid5(
            NAMESPACE_URL,
            (
                f"canonical-staging:{resource_key}:{IDS['org']}:"
                f"{DEMO_RUN_ID}:{DEMO_RUN_ATTEMPT}"
            ),
        )
    )


def reviewed_expense_receipt() -> bytes:
    """Load one externally reviewed synthetic receipt without inventing evidence."""

    path = Path(required("CANONICAL_DEMO_EXPENSE_RECEIPT_PATH"))
    expected_sha256 = required("CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256").lower()
    if not path.is_absolute() or not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise RuntimeError(
            "CANONICAL_EXPENSE_RECEIPT_AUTHORITY_MISSING: an absolute reviewed "
            "receipt path and lowercase SHA-256 are required"
        )
    try:
        value = path.read_bytes()
    except OSError as exc:
        raise RuntimeError(
            "CANONICAL_EXPENSE_RECEIPT_AUTHORITY_MISSING: reviewed receipt bytes "
            "are unavailable"
        ) from exc
    if not value.startswith(b"%PDF-") or len(value) < 64 or len(value) > 10 * 1024 * 1024:
        raise RuntimeError(
            "CANONICAL_EXPENSE_RECEIPT_AUTHORITY_INVALID: receipt must be a "
            "non-empty PDF of at most 10 MB"
        )
    actual_sha256 = hashlib.sha256(value).hexdigest()
    if actual_sha256 != expected_sha256:
        raise RuntimeError(
            "CANONICAL_EXPENSE_RECEIPT_AUTHORITY_INVALID: reviewed receipt SHA-256 differs"
        )
    return value

REQUIRED_PERMISSIONS = (
    "sales.order.create",
    "sales.order.manage",
    "sales.dispatch.create",
    "sales.invoice.create",
    "sales.return.create",
    "procurement.order.manage",
    "procurement.receipt.post",
    "procurement.supplier_invoice.create",
    "procurement.purchase_return.create",
    "finance.customer_receipt.create",
    "finance.supplier_advance.create",
    "finance.supplier_payment.create",
    "finance.adjustment_note.manage",
    "finance.expense.manage",
    "finance.journal.post",
    "inventory.adjustment.create",
    "inventory.transfer.create",
    "inventory.destruction.create",
    "inventory.document.post",
    "inventory.batch.manage",
    "inventory.location.manage",
    "catalog.product.manage",
    "parties.customer.manage",
    "parties.supplier.manage",
    "finance.payment.manage",
    "tax.registration.manage",
    "compliance.destruction.manage",
    "automation.command.approve",
    "automation.command.execute",
    "automation.command.view",
    "internal.sequence.allocate",
)


def _reviewed_prepare_capabilities() -> tuple[tuple[str, str], ...]:
    contract = json.loads(OPERATOR_CONTRACT_PATH.read_text(encoding="utf-8"))
    actions = contract.get("prepare_actions")
    if not isinstance(actions, list) or len(actions) < 17:
        raise RuntimeError(
            "generated operator contract must contain the 17 core prepare actions"
        )
    capabilities = tuple(sorted(
        (
            str(action.get("operation_key", "")),
            str(action.get("approval_policy", "")),
        )
        for action in actions
        if isinstance(action, dict)
    ))
    if (
        len(capabilities) != len(actions)
        or len({operation for operation, _ in capabilities}) != len(actions)
        or any(
            not operation.endswith(".prepare")
            or approval_policy not in {
                "actor_confirmation",
                "separate_approver",
            }
            for operation, approval_policy in capabilities
        )
    ):
        raise RuntimeError("generated prepare authority is incomplete or malformed")
    return capabilities


PREPARE_CAPABILITIES = _reviewed_prepare_capabilities()

CALCULATION_TOTAL_FIELDS = (
    "subtotal",
    "discount_total",
    "charges_total",
    "net_value_total",
    "gst_taxable_total",
    "cgst_total",
    "sgst_total",
    "igst_total",
    "cess_total",
    "recipient_assessed_tax_total",
    "rounding_adjustment",
    "grand_total",
)
PURCHASE_ORDER_RECONCILABLE_STATUSES = frozenset(
    {"approved", "partially_received", "received"}
)
SALES_ORDER_RECONCILABLE_STATUSES = frozenset(
    {"approved", "partially_fulfilled", "fulfilled"}
)


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


@contextmanager
def database_connection(environment_variable: str):
    """Open one bounded direct DB session and always release it.

    A psycopg2 connection's own context manager only commits or rolls back; it
    deliberately does not close the connection. The staging demo alternates
    among migration-owner, importer, runtime, and calculator principals while
    a one-worker API is running, so retaining otherwise sequential connections
    would leak database capacity across the certification lifecycle.
    """

    connection = psycopg2.connect(required(environment_variable))
    try:
        with connection:
            yield connection
    finally:
        connection.close()


@contextmanager
def staging_owner_audit_connection():
    """Open the explicit staging control-plane boundary for global audits.

    Product/runtime decisions must use typed ``erp_automation_reads``
    projections.  This owner connection is reserved for the final
    cross-table certification audit and is available only while the workflow's
    temporary migration-owner delegation is active.
    """

    with database_connection("PSYCOPG_DATABASE_URL") as connection:
        with connection.cursor() as cursor:
            cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        yield connection


def calculation_totals(cursor, command_request_id: str) -> dict[str, Decimal]:
    """Load exact immutable calculator totals for one consumed command."""
    cursor.execute(
        """
        SELECT convert_from(artifact.output_bytes,'UTF8')::jsonb
          FROM calculation.artifacts artifact
         WHERE artifact.org_id=%s AND artifact.command_request_id=%s
           AND artifact.status='consumed'
        """,
        (IDS["org"], command_request_id),
    )
    rows = cursor.fetchall()
    if len(rows) != 1 or not isinstance(rows[0][0], dict):
        raise RuntimeError("demo command lacks one consumed calculation artifact")
    totals = rows[0][0].get("totals")
    if not isinstance(totals, dict):
        raise RuntimeError("demo calculation artifact lacks typed totals")
    return {
        field: Decimal(str(totals[field]))
        for field in CALCULATION_TOTAL_FIELDS
        if field in totals
    }


def live18_reviewed_scalars() -> dict[str, Any]:
    raw = required("LIVE18_REVIEWED_SCALARS_JSON").encode("utf-8")
    try:
        pack = json.loads(raw)
        values = validate_reviewed_scalar_pack(pack, byte_size=len(raw))
        supplier_invoice_chain_choices(values)
        return values
    except (json.JSONDecodeError, FixtureCompileError) as exc:
        raise RuntimeError("Live18 reviewed PO/GRN scalar authority is invalid") from exc


def _prepared_purchase_order_totals(
    prepared: Any, payload: dict[str, Any]
) -> dict[str, Decimal]:
    """Derive exact PO totals from the service result without table access.

    The isolated calculator role deliberately has no SELECT privilege on
    calculation.artifacts.  The purchase-order prepare result exposes the
    immutable grand total and GST components that were hashed into its preview;
    for this no-charge, no-rounding Live18 payload the taxable value is their
    exact residual.
    """

    if payload.get("rounding_policy") != "none" or payload.get("charge_lines"):
        raise RuntimeError(
            "purchase-order preflight residual requires no rounding or charge lines"
        )
    if len(prepared.financial_impact) != 1 or len(prepared.tax_impact) != 1:
        raise RuntimeError("purchase-order preflight impact cardinality changed")
    financial_impact = prepared.financial_impact[0]
    tax = prepared.tax_impact[0]
    if financial_impact.get("currency_code") != "INR":
        raise RuntimeError("purchase-order preflight currency changed")
    try:
        grand_total = Decimal(str(financial_impact["supplier_commitment"]))
        cgst_total = Decimal(str(tax["cgst_total"]))
        sgst_total = Decimal(str(tax["sgst_total"]))
        igst_total = Decimal(str(tax["igst_total"]))
        cess_total = Decimal(str(tax["cess_total"]))
    except (InvalidOperation, KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("purchase-order preflight impact is incomplete") from exc
    components = (cgst_total, sgst_total, igst_total, cess_total)
    if (
        not grand_total.is_finite()
        or grand_total <= 0
        or any(not value.is_finite() or value < 0 for value in components)
    ):
        raise RuntimeError("purchase-order preflight impact is invalid")
    gst_taxable_total = grand_total - sum(
        components, Decimal("0")
    )
    if gst_taxable_total <= 0:
        raise RuntimeError("purchase-order preflight taxable value is not positive")
    return {
        "gst_taxable_total": gst_taxable_total,
        "cgst_total": cgst_total,
        "sgst_total": sgst_total,
        "igst_total": igst_total,
        "cess_total": cess_total,
        "grand_total": grand_total,
    }


def assert_calculation_totals(
    cursor,
    command_request_id: str,
    actual: dict[str, Any],
) -> None:
    expected = calculation_totals(cursor, command_request_id)
    compared = 0
    for field, expected_value in expected.items():
        if field not in actual or actual[field] is None:
            continue
        compared += 1
        if Decimal(str(actual[field])) != expected_value:
            raise RuntimeError(
                f"demo {field} differs from immutable calculation artifact"
            )
    if compared < 4 or "grand_total" not in expected:
        raise RuntimeError("demo calculation reconciliation compared too few totals")


def demo_run_uuid(label: str) -> str:
    run_id = os.getenv("GITHUB_RUN_ID", "local")
    return str(uuid5(NAMESPACE_URL, f"aasopharma-canonical-demo:{run_id}:{label}"))


def demo_ui_fixture_uuid(label: str) -> str:
    return str(
        uuid5(
            NAMESPACE_URL,
            f"aasopharma-canonical-demo-ui:{DEMO_UI_FIXTURE_ID}:{label}",
        )
    )


def demo_ui_fixture_gstin(state_code: str, label: str) -> str:
    """Derive a checksum-valid synthetic GSTIN without checking in an identity."""

    if not re.fullmatch(r"[0-9]{2}", state_code):
        raise ValueError("demo GSTIN state code must contain two digits")
    digest = hashlib.sha256(
        f"aasopharma-canonical-demo-ui:{DEMO_UI_FIXTURE_ID}:{label}".encode()
    ).digest()
    letters = "".join(chr(ord("A") + digest[index] % 26) for index in range(6))
    digits = "".join(str(digest[index] % 10) for index in range(6, 10))
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    body = f"{state_code}{letters[:5]}{digits}{letters[5]}1Z"
    factor = 2
    total = 0
    for character in reversed(body):
        product = alphabet.index(character) * factor
        total += product // 36 + product % 36
        factor = 1 if factor == 2 else 2
    return f"{body}{alphabet[(36 - total % 36) % 36]}"


def require_business_date(value: date) -> date:
    """Require one database-resolved organization-local date for demo facts."""

    if not isinstance(value, date) or isinstance(value, datetime):
        raise ValueError(
            "canonical demo requires the authoritative organization business date"
        )
    return value


def fiscal_year_start(business_date: date) -> date:
    business_date = require_business_date(business_date)
    year = business_date.year if business_date.month >= 4 else business_date.year - 1
    return date(year, 4, 1)


def monthly_period(business_date: date) -> tuple[date, date, date]:
    business_date = require_business_date(business_date)
    period_start = business_date.replace(day=1)
    period_end = (
        (period_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        - timedelta(days=1)
    )
    return period_start, period_end, period_end + timedelta(days=20)


for resource_key in (
    "interstate_customer_party",
    "interstate_customer_account",
    "interstate_customer_address",
    "interstate_customer_gstin",
    "sez_customer_party",
    "sez_customer_account",
    "sez_customer_address",
    "sez_customer_gstin",
):
    IDS[resource_key] = demo_ui_fixture_uuid(resource_key)
LIVE18_DESTRUCTION_AUTHORITY = canonical_live18_destruction_authority(
    IDS["org"],
    DEMO_RUN_ID,
    DEMO_RUN_ATTEMPT,
    gst_registration_id=IDS["org_gst_registration"],
    itc_reversal_rule_version=ITC_REVERSAL_RULESET_VERSION,
)

INTERSTATE_CUSTOMER_GSTIN = demo_ui_fixture_gstin("29", "interstate-customer")
SEZ_CUSTOMER_GSTIN = demo_ui_fixture_gstin("29", "sez-customer")


for resource_key in (
    "destruction_loss_account",
    "destruction_certificate_evidence",
    "destruction_itc_reversal_evidence",
    "destruction_return_period",
    "destruction_gstr3b_return",
):
    IDS[resource_key] = demo_ui_fixture_uuid(resource_key)
for resource_key, authority_value in (
    (
        "destruction_certificate_evidence",
        LIVE18_DESTRUCTION_AUTHORITY.certificate_attachment_id,
    ),
    (
        "destruction_itc_reversal_evidence",
        LIVE18_DESTRUCTION_AUTHORITY.itc_reversal_attachment_id,
    ),
    ("destruction_return_period", LIVE18_DESTRUCTION_AUTHORITY.return_period_id),
    ("destruction_gstr3b_return", LIVE18_DESTRUCTION_AUTHORITY.gstr3b_return_id),
):
    if IDS[resource_key] != authority_value:
        raise RuntimeError(f"shared destruction authority drifted: {resource_key}")
IDS["destruction_itc_rule_release"] = str(
    uuid5(
        NAMESPACE_URL,
        (
            "aasopharma-regulatory-release:gst_itc_reversal_rules:"
            f"{ITC_REVERSAL_RULESET_VERSION}:{ITC_REVERSAL_SOURCE_URI}"
        ),
    )
)
IDS["destruction_itc_rule_version"] = str(
    uuid5(
        NAMESPACE_URL,
        (
            "aasopharma-regulatory-rule:CGST_SECTION_17_5_H_GOODS_DESTROYED:"
            f"{ITC_REVERSAL_RULESET_VERSION}"
        ),
    )
)
if (
    IDS["destruction_itc_rule_version"]
    != LIVE18_DESTRUCTION_AUTHORITY.itc_reversal_rule_id
):
    raise RuntimeError("shared destruction ITC rule authority drifted")


def assert_target() -> None:
    if required("CANONICAL_DEMO_WRITE_ACK") != "PROVISION_DISPOSABLE_DEMO":
        raise RuntimeError("canonical demo write acknowledgement is absent")
    project_ref = required("CANONICAL_STAGING_PROJECT_REF")
    if project_ref != PROJECT_REF:
        raise RuntimeError("refusing a project other than the reviewed free staging project")
    production_refs = {
        item.strip()
        for item in required("CANONICAL_PRODUCTION_PROJECT_REFS").split(",")
        if item.strip()
    }
    if project_ref in production_refs:
        raise RuntimeError("refusing to provision demo data in a production project")


def attest_pdf_fragments(
    source: bytes, required_fragments: tuple[str, ...]
) -> tuple[dict[str, Any], tuple[str, ...]]:
    """Scan one PDF page at a time without retaining its full parsed document.

    pdfplumber caches page layouts after extraction. Large regulatory PDFs can
    otherwise exceed the bounded staging worker memory even though the source
    bytes themselves are small. A short overlap preserves phrases split across
    page boundaries while each parsed page is released immediately.
    """

    missing = {fragment.casefold(): fragment for fragment in required_fragments}
    overlap = ""
    with pdfplumber.open(BytesIO(source)) as document:
        metadata = dict(document.metadata or {})
        for page in document.pages:
            try:
                page_text = re.sub(
                    r"\s+", " ", page.extract_text() or ""
                ).strip().casefold()
                searchable = f"{overlap} {page_text}".strip()
                missing = {
                    folded: original
                    for folded, original in missing.items()
                    if folded not in searchable
                }
                if not missing:
                    break
                overlap = searchable[-4096:]
            finally:
                close = getattr(page, "close", None)
                if callable(close):
                    close()
    return metadata, tuple(missing.values())


def fetch_official_document(uri: str) -> bytes:
    """Fetch one official artifact with bounded transient-failure retries."""

    for attempt in range(OFFICIAL_SOURCE_MAX_ATTEMPTS):
        try:
            response = requests.get(
                uri,
                timeout=(10, 60),
                headers={
                    "User-Agent": "AasoPharma canonical staging evidence/1.0"
                },
            )
            response.raise_for_status()
            return response.content
        except requests.RequestException as exc:
            status_code = getattr(exc.response, "status_code", None)
            retryable = (
                status_code is None
                or status_code in OFFICIAL_SOURCE_RETRYABLE_STATUS_CODES
            )
            if not retryable or attempt + 1 == OFFICIAL_SOURCE_MAX_ATTEMPTS:
                raise
            time.sleep(2**attempt)
    raise AssertionError("official-source retry boundary was exhausted")


def fetch_official_source(evidence_dir: Path) -> bytes:
    source = fetch_official_document(SOURCE_URI)
    if not 10_000 <= len(source) <= 100 * 1024 * 1024:
        raise RuntimeError("CBIC rate source has an unexpected size")
    if not source.startswith(b"%PDF"):
        raise RuntimeError("GST Council source is not a PDF")
    required_fragments = (
        "Notification No. 02/2024-Central Tax (Rate)",
        "4819 10",
        "4819 20",
        "Cartons, boxes and cases",
        "15th day of July, 2024",
    )
    _, missing = attest_pdf_fragments(source, required_fragments)
    if missing:
        raise RuntimeError("GST Council notification lacks the reviewed HSN 4819 rate evidence")
    path = evidence_dir / "gst-council-notification-02-2024.pdf"
    path.write_bytes(source)
    return source


def fetch_adjustment_source(evidence_dir: Path) -> bytes:
    """Fetch the official GST Council return-of-goods and ITC evidence FAQ."""

    source = fetch_official_document(ADJUSTMENT_SOURCE_URI)
    if not 10_000 <= len(source) <= 100 * 1024 * 1024 or not source.startswith(b"%PDF"):
        raise RuntimeError("GST Council return authority has an unexpected envelope")
    required_fragments = (
        "Section 34(1)",
        "return of goods on which GST was paid",
        "may issue a credit note for the full value",
        "has reversed his ITC",
    )
    _, missing = attest_pdf_fragments(source, required_fragments)
    if missing:
        raise RuntimeError("GST Council return authority lacks reviewed Section 34 fragments")
    (evidence_dir / "gst-council-return-of-goods-faq.pdf").write_bytes(source)
    return source


def fetch_itc_reversal_source(evidence_dir: Path) -> bytes:
    """Fetch and attest the official CGST Act Section 17(5)(h) source."""

    source = fetch_official_document(ITC_REVERSAL_SOURCE_URI)
    if not 10_000 <= len(source) <= 100 * 1024 * 1024 or not source.startswith(b"%PDF"):
        raise RuntimeError("CBIC Section 17(5)(h) source has an unexpected envelope")
    required_fragments = (
        "CHAPTER V INPUT TAX CREDIT",
        "goods lost, stolen, destroyed, written off",
        "disposed of by way of gift or free samples",
    )
    _, missing = attest_pdf_fragments(source, required_fragments)
    if missing:
        raise RuntimeError("CBIC Act source lacks reviewed Section 17(5)(h) fragments")
    (evidence_dir / "cbic-cgst-act-section-17-5-h.pdf").write_bytes(source)
    return source


def fetch_gstr1_reporting_source(evidence_dir: Path) -> bytes:
    """Fetch and attest the official GSTN Returns Offline Tool boundary evidence."""

    source = fetch_official_document(GSTR1_REPORTING_SOURCE_URI)
    if (
        not 10_000 <= len(source) <= 100 * 1024 * 1024
        or not source.startswith(b"%PDF")
        or not source.rstrip().endswith(b"%%EOF")
        or hashlib.sha256(source).hexdigest() != GSTR1_REPORTING_SOURCE_SHA256
    ):
        raise RuntimeError("GSTN Returns Offline Tool source has an unexpected envelope")
    required_fragments = (
        "As per amended rules from August 2024 tax return period onwards",
        "invoice value is more than Rs. 1 lakh",
        "up to July 2024 tax return period",
        "invoice value should be more than Rs. 2.5 lakhs",
    )
    metadata, missing = attest_pdf_fragments(source, required_fragments)
    creation_date = str(metadata.get("CreationDate", ""))
    if not creation_date.startswith("D:20251229") or missing:
        raise RuntimeError(
            "GSTN Returns Offline Tool lacks the reviewed GSTR-1 B2CL transition evidence"
        )
    (evidence_dir / "gstn-returns-offline-tool-gstr1.pdf").write_bytes(source)
    return source


def bootstrap_identity(
    connection, *, organization_pan: str = "ABCDE1234F"
) -> None:
    if re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", organization_pan) is None:
        raise ValueError("demo organization PAN must use the canonical PAN shape")
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO auth.users (id) VALUES (%s), (%s) ON CONFLICT (id) DO NOTHING",
            (IDS["reviewer_auth_user"], IDS["operator_auth_user"]),
        )
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        cursor.execute("SELECT set_config('app.org_id', %s, true)", (IDS["org"],))
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            INSERT INTO core.organizations (
                id, legal_name, trade_name, pan, registered_address_line1,
                registered_city, registered_state_code, registered_postal_code,
                status, created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, 'AasoPharma Disposable Demo Private Limited',
                'AasoPharma Demo', %s, '101 Demo Market Road',
                'Mumbai', '27', '400001', 'active', %s, %s
            ) ON CONFLICT (id) DO NOTHING
            """,
            (
                IDS["org"],
                organization_pan,
                IDS["reviewer_membership"],
                IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.users (id, auth_user_id, display_name, status)
            VALUES (%s, %s, 'Demo Independent Approver', 'active')
            ON CONFLICT (id) DO UPDATE
               SET auth_user_id=EXCLUDED.auth_user_id,
                   display_name=EXCLUDED.display_name,
                   status=EXCLUDED.status,
                   updated_at=transaction_timestamp(),
                   row_version=core.users.row_version+1
             WHERE core.users.auth_user_id IS DISTINCT FROM EXCLUDED.auth_user_id
                OR core.users.display_name IS DISTINCT FROM EXCLUDED.display_name
                OR core.users.status IS DISTINCT FROM EXCLUDED.status
            """,
            (IDS["reviewer_user"], IDS["reviewer_auth_user"]),
        )
        cursor.execute(
            """
            INSERT INTO core.users (id, auth_user_id, display_name, status)
            VALUES (%s, %s, 'Demo Business Operator', 'active')
            ON CONFLICT (id) DO UPDATE
               SET auth_user_id=EXCLUDED.auth_user_id,
                   display_name=EXCLUDED.display_name,
                   status=EXCLUDED.status,
                   updated_at=transaction_timestamp(),
                   row_version=core.users.row_version+1
             WHERE core.users.auth_user_id IS DISTINCT FROM EXCLUDED.auth_user_id
                OR core.users.display_name IS DISTINCT FROM EXCLUDED.display_name
                OR core.users.status IS DISTINCT FROM EXCLUDED.status
            """,
            (IDS["operator_user"], IDS["operator_auth_user"]),
        )
        cursor.execute(
            """
            INSERT INTO core.memberships (
                org_id, id, user_id, status, joined_at,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (%s, %s, %s, 'active', transaction_timestamp(), %s, %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["reviewer_membership"], IDS["reviewer_user"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.organizations (
                id, legal_name, trade_name, registered_address_line1,
                registered_city, registered_state_code, registered_postal_code,
                status, created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, 'AasoPharma Disposable RLS Denial Tenant',
                'AasoPharma RLS Denial', '1 Isolation Test Road',
                'Mumbai', '27', '400001', 'active', %s, %s
            ) ON CONFLICT (id) DO NOTHING
            """,
            (
                IDS["denial_org"],
                IDS["denial_membership"],
                IDS["denial_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.memberships (
                org_id, id, user_id, status, joined_at,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (%s, %s, %s, 'active', transaction_timestamp(), %s, %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["denial_org"], IDS["denial_membership"],
                IDS["operator_user"], IDS["denial_membership"],
                IDS["denial_membership"],
            ),
        )
        cursor.execute(
            "SELECT set_config('app.membership_id', %s, true)",
            (IDS["reviewer_membership"],),
        )
        cursor.execute(
            "SELECT set_config('app.user_id', %s, true)", (IDS["reviewer_user"],)
        )
        cursor.execute(
            "SELECT set_config('app.auth_user_id', %s, true)", (IDS["reviewer_auth_user"],)
        )
        cursor.execute(
            """
            SELECT code_kind,status
              FROM core.master_code_sequences
             WHERE org_id=%s
             ORDER BY code_kind
            """,
            (IDS["org"],),
        )
        actual_master_code_configuration = cursor.fetchall()
        expected_master_code_configuration = [
            ("customer", "active"),
            ("product", "active"),
            ("supplier", "active"),
        ]
        if actual_master_code_configuration != expected_master_code_configuration:
            raise RuntimeError(
                "canonical organization onboarding did not provision master codes"
            )
        cursor.execute(
            """
            INSERT INTO core.memberships (
                org_id, id, user_id, status, joined_at,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (%s, %s, %s, 'active', transaction_timestamp(), %s, %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["operator_membership"], IDS["operator_user"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.executemany(
            """
            INSERT INTO core.branches (
                org_id, id, code, name, address_line1, city, state_code,
                postal_code, status, created_by_membership_id, updated_by_membership_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', %s, %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            [
                (
                    IDS["org"], IDS["branch"], "MUM-DEMO", "Mumbai Demo Branch",
                    "101 Demo Market Road", "Mumbai", "27", "400001",
                    IDS["reviewer_membership"], IDS["reviewer_membership"],
                ),
                (
                    IDS["org"], IDS["transfer_destination_branch"], "PUN-DEMO",
                    "Pune Demo Branch", "202 Demo Distribution Road", "Pune", "27",
                    "411001", IDS["reviewer_membership"], IDS["reviewer_membership"],
                ),
            ],
        )
        cursor.execute(
            """
            INSERT INTO core.roles (
                org_id, id, code, name, description, is_system, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'demo_operator', 'Demo operator',
                'Staging-only role for disposable canonical business journeys',
                false, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (IDS["org"], IDS["role"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )
        cursor.execute(
            "SELECT code FROM core.permissions WHERE code = ANY(%s) AND status='active'",
            (list(REQUIRED_PERMISSIONS),),
        )
        found = {row[0] for row in cursor.fetchall()}
        if found != set(REQUIRED_PERMISSIONS):
            raise RuntimeError(f"canonical permissions are missing: {set(REQUIRED_PERMISSIONS) - found}")
        cursor.execute("SELECT code FROM core.permissions WHERE status='active' ORDER BY code")
        demo_permissions = [row[0] for row in cursor.fetchall()]
        cursor.executemany(
            """
            INSERT INTO core.role_permissions (
                org_id, role_id, permission_code, created_by_membership_id
            ) VALUES (%s, %s, %s, %s)
            ON CONFLICT (org_id, role_id, permission_code) DO NOTHING
            """,
            [
                (IDS["org"], IDS["role"], permission, IDS["reviewer_membership"])
                for permission in demo_permissions
            ],
        )
        cursor.execute(
            """
            UPDATE core.access_grants
               SET status='expired', row_version=row_version+1
             WHERE org_id=%s AND role_id=%s
               AND membership_id=ANY(CAST(%s AS uuid[]))
               AND status='active'
               AND expires_at IS NOT NULL
               AND expires_at<=transaction_timestamp()
            """,
            (
                IDS["org"],
                IDS["role"],
                [IDS["reviewer_membership"], IDS["operator_membership"]],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.access_grants (
                org_id, id, membership_id, role_id, scope_kind, branch_id,
                valid_from_at, expires_at, status, created_by_membership_id
            ) SELECT
                %s, %s, %s, %s, 'organization', NULL,
                transaction_timestamp(), transaction_timestamp() + interval '30 days',
                'active', %s
             WHERE NOT EXISTS (
                SELECT 1 FROM core.access_grants
                 WHERE org_id=%s AND membership_id=%s AND role_id=%s
                   AND status='active'
             )
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["reviewer_access_grant"], IDS["reviewer_membership"],
                IDS["role"], IDS["reviewer_membership"], IDS["org"],
                IDS["reviewer_membership"], IDS["role"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.access_grants (
                org_id, id, membership_id, role_id, scope_kind, branch_id,
                valid_from_at, expires_at, status, created_by_membership_id
            ) SELECT
                %s, %s, %s, %s, 'organization', NULL,
                transaction_timestamp(), transaction_timestamp() + interval '30 days',
                'active', %s
             WHERE NOT EXISTS (
                SELECT 1 FROM core.access_grants
                 WHERE org_id=%s AND membership_id=%s AND role_id=%s
                   AND status='active'
             )
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["operator_access_grant"],
                IDS["operator_membership"], IDS["role"], IDS["reviewer_membership"],
                IDS["org"], IDS["operator_membership"], IDS["role"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.settings (
                org_id, id, scope_kind, branch_id, namespace, key,
                value_type, value_boolean, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'organization', NULL, 'test_safety',
                'disposable_live_write_target', 'boolean', true, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (IDS["org"], IDS["safety_setting"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )
        cursor.execute(
            """
            INSERT INTO core.settings (
                org_id, id, scope_kind, branch_id, namespace, key,
                value_type, value_numeric, status,
                created_by_membership_id, updated_by_membership_id
            )
            SELECT
                %s, %s, 'organization', NULL, 'evidence_retention',
                'expense_receipt_months', 'numeric', %s, 'active', %s, %s
            WHERE NOT EXISTS (
                SELECT 1
                  FROM core.settings
                 WHERE org_id=%s AND branch_id IS NULL AND status='active'
                   AND namespace='evidence_retention'
                   AND key='expense_receipt_months'
            )
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"],
                IDS["expense_receipt_retention_setting"],
                DEMO_EXPENSE_RECEIPT_RETENTION_MONTHS,
                IDS["reviewer_membership"],
                IDS["reviewer_membership"],
                IDS["org"],
            ),
        )
        cursor.execute(
            """
            SELECT value_type, value_numeric
              FROM core.settings
             WHERE org_id=%s AND branch_id IS NULL AND status='active'
               AND namespace='evidence_retention'
               AND key='expense_receipt_months'
            """,
            (IDS["org"],),
        )
        retention_settings = cursor.fetchall()
        if len(retention_settings) != 1:
            raise RuntimeError(
                "expense receipt retention requires exactly one active organization setting"
            )
        retention_type, retention_months = retention_settings[0]
        if (
            retention_type != "numeric"
            or retention_months is None
            or retention_months != retention_months.to_integral_value()
            or not Decimal("1") <= retention_months <= Decimal("1200")
        ):
            raise RuntimeError(
                "expense receipt retention must be an integral month count from 1 to 1200"
            )
        cursor.execute(
            """
            UPDATE automation.agent_grants
               SET status='suspended', row_version=row_version+1
             WHERE org_id=%s AND client_id=%s
               AND subject_membership_id=ANY(CAST(%s AS uuid[]))
               AND status='active'
            """,
            (
                IDS["org"],
                CLIENT_ID,
                [IDS["operator_membership"], IDS["reviewer_membership"]],
            ),
        )
        cursor.execute(
            """
            INSERT INTO automation.agent_grants (
                org_id, id, subject_membership_id, client_id, client_display_name,
                branch_id, authorization_mode, consent_version, consent_text_hash,
                consented_by_membership_id, consented_at, granted_by_membership_id,
                granted_at, expires_at, status, created_by_membership_id,
                updated_by_membership_id
            ) VALUES (
                %s, %s, %s, %s, 'Canonical staging demo runner', NULL,
                'self_consent', 'demo-v2',
                extensions.digest('canonical staging demo consent; INR 1000000 maximum','sha256'),
                %s, transaction_timestamp(), %s, transaction_timestamp(),
                transaction_timestamp() + interval '30 days', 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO UPDATE SET
                status='active', row_version=agent_grants.row_version+1
            """,
            (
                IDS["org"], IDS["agent_grant"], IDS["operator_membership"], CLIENT_ID,
                IDS["operator_membership"], IDS["operator_membership"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO automation.agent_grants (
                org_id, id, subject_membership_id, client_id, client_display_name,
                branch_id, authorization_mode, consent_version, consent_text_hash,
                consented_by_membership_id, consented_at, granted_by_membership_id,
                granted_at, expires_at, status, created_by_membership_id,
                updated_by_membership_id
            ) VALUES (
                %s, %s, %s, %s, 'Canonical staging independent approver', NULL,
                'self_consent', 'demo-v2-approver',
                extensions.digest('canonical staging independent approval consent','sha256'),
                %s, transaction_timestamp(), %s, transaction_timestamp(),
                transaction_timestamp() + interval '30 days', 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO UPDATE SET
                status='active', row_version=agent_grants.row_version+1
            """,
            (
                IDS["org"], IDS["legacy_approver_agent_grant"],
                IDS["reviewer_membership"], CLIENT_ID,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        capabilities = tuple(
            (
                capability, "write", "consequential_write", approval,
                "1000000.00", "INR",
            )
            for capability, approval in PREPARE_CAPABILITIES
        ) + (
            (
                "automation.command.approve", "write", "consequential_write",
                "actor_confirmation", None, None,
            ),
            (
                "automation.command.execute", "write", "consequential_write",
                "actor_confirmation", None, None,
            ),
            (
                "automation.command.status.get", "read", "read_only", "none",
                None, None,
            ),
            (
                "inventory.destructions.get", "read", "read_only", "none",
                None, None,
            ),
        )
        cursor.executemany(
            """
            INSERT INTO automation.agent_grant_capabilities (
                org_id, agent_grant_id, capability_code, operation_mode,
                risk_class, approval_policy, maximum_amount, currency_code,
                allow_sensitive_read, status,
                created_by_membership_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, false, 'active', %s)
            ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
            """,
            [
                (IDS["org"], IDS["agent_grant"], *capability, IDS["reviewer_membership"])
                for capability in capabilities
            ],
        )
        cursor.execute(
            """
            INSERT INTO automation.agent_grant_capabilities (
                org_id, agent_grant_id, capability_code, operation_mode,
                risk_class, approval_policy, maximum_amount, currency_code,
                allow_sensitive_read, status, created_by_membership_id
            ) VALUES (
                %s,%s,'automation.command.approve','write','consequential_write',
                'actor_confirmation',NULL,NULL,false,'active',%s
            ) ON CONFLICT (org_id, agent_grant_id, capability_code) DO NOTHING
            """,
            (
                IDS["org"], IDS["legacy_approver_agent_grant"],
                IDS["reviewer_membership"],
            ),
        )


def reviewed_web_operator_ids(auth_user_id: str) -> dict[str, str]:
    """Derive stable staging-only database identities for one reviewed Auth user."""

    canonical_auth_user_id = str(UUID(auth_user_id))
    if canonical_auth_user_id in {
        IDS["reviewer_auth_user"],
        IDS["operator_auth_user"],
    }:
        raise RuntimeError("reviewed web Auth user must be distinct from demo fixtures")
    return {
        "auth_user_id": canonical_auth_user_id,
        "user_id": str(
            uuid5(
                NAMESPACE_URL,
                f"canonical-staging-web-user:{IDS['org']}:{canonical_auth_user_id}",
            )
        ),
        "membership_id": str(
            uuid5(
                NAMESPACE_URL,
                f"canonical-staging-web-membership:{IDS['org']}:{canonical_auth_user_id}",
            )
        ),
        "access_grant_id": str(
            uuid5(
                NAMESPACE_URL,
                f"canonical-staging-web-access:{IDS['org']}:{canonical_auth_user_id}",
            )
        ),
    }


def bind_reviewed_web_operator(connection, auth_user_id: str) -> dict[str, str]:
    """Restore the reviewed human staging operator after a disposable reset."""

    authority = reviewed_web_operator_ids(auth_user_id)
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM auth.users WHERE id=%s",
            (authority["auth_user_id"],),
        )
        if cursor.fetchone() != (1,):
            raise RuntimeError("reviewed web Auth user does not exist exactly once")
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for name, value in (
            ("app.org_id", IDS["org"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.request_id", demo_run_uuid("reviewed-web-operator-binding")),
        ):
            cursor.execute("SELECT set_config(%s,%s,true)", (name, value))

        cursor.execute(
            """
            SELECT id::text FROM core.users
             WHERE auth_user_id=%s
             ORDER BY id
             LIMIT 2
            """,
            (authority["auth_user_id"],),
        )
        users = cursor.fetchall()
        if len(users) > 1:
            raise RuntimeError("reviewed web Auth user has multiple canonical users")
        if users:
            authority["user_id"] = users[0][0]
            cursor.execute(
                """
                UPDATE core.users
                   SET status='active', updated_at=transaction_timestamp(),
                       row_version=row_version+1
                 WHERE id=%s AND status<>'active'
                """,
                (authority["user_id"],),
            )
        else:
            cursor.execute(
                """
                INSERT INTO core.users (id,auth_user_id,display_name,status)
                VALUES (%s,%s,'Reviewed staging web operator','active')
                """,
                (authority["user_id"], authority["auth_user_id"]),
            )

        cursor.execute(
            """
            SELECT id::text FROM core.memberships
             WHERE org_id=%s AND user_id=%s
             ORDER BY id
             LIMIT 2
            """,
            (IDS["org"], authority["user_id"]),
        )
        memberships = cursor.fetchall()
        if len(memberships) > 1:
            raise RuntimeError("reviewed web Auth user has multiple demo memberships")
        if memberships:
            authority["membership_id"] = memberships[0][0]
            cursor.execute(
                """
                UPDATE core.memberships
                   SET status='active', revoked_at=NULL, revocation_reason=NULL,
                       updated_by_membership_id=%s,
                       updated_at=transaction_timestamp(),
                       row_version=row_version+1
                 WHERE org_id=%s AND id=%s AND status<>'active'
                """,
                (
                    IDS["reviewer_membership"],
                    IDS["org"],
                    authority["membership_id"],
                ),
            )
        else:
            cursor.execute(
                """
                INSERT INTO core.memberships (
                    org_id,id,user_id,status,joined_at,
                    created_by_membership_id,updated_by_membership_id
                ) VALUES (%s,%s,%s,'active',transaction_timestamp(),%s,%s)
                """,
                (
                    IDS["org"],
                    authority["membership_id"],
                    authority["user_id"],
                    IDS["reviewer_membership"],
                    IDS["reviewer_membership"],
                ),
            )

        cursor.execute(
            """
            UPDATE core.access_grants
               SET status='expired', row_version=row_version+1
             WHERE org_id=%s AND membership_id=%s AND role_id=%s
               AND status='active' AND expires_at IS NOT NULL
               AND expires_at<=transaction_timestamp()
            """,
            (IDS["org"], authority["membership_id"], IDS["role"]),
        )
        cursor.execute(
            """
            INSERT INTO core.access_grants (
                org_id,id,membership_id,role_id,scope_kind,branch_id,
                valid_from_at,expires_at,status,created_by_membership_id
            ) SELECT
                %s,%s,%s,%s,'organization',NULL,transaction_timestamp(),
                transaction_timestamp()+interval '30 days','active',%s
             WHERE NOT EXISTS (
                SELECT 1 FROM core.access_grants
                 WHERE org_id=%s AND membership_id=%s AND role_id=%s
                   AND status='active'
             )
            ON CONFLICT (org_id,id) DO UPDATE SET
                valid_from_at=excluded.valid_from_at,
                expires_at=excluded.expires_at,
                status='active', row_version=access_grants.row_version+1
            """,
            (
                IDS["org"],
                authority["access_grant_id"],
                authority["membership_id"],
                IDS["role"],
                IDS["reviewer_membership"],
                IDS["org"],
                authority["membership_id"],
                IDS["role"],
            ),
        )
        cursor.execute(
            """
            SELECT user_row.id::text,membership.id::text,access_grant.id::text
              FROM core.users AS user_row
              JOIN core.memberships AS membership
                ON membership.user_id=user_row.id AND membership.org_id=%s
              JOIN core.access_grants AS access_grant
                ON access_grant.org_id=membership.org_id
               AND access_grant.membership_id=membership.id
               AND access_grant.role_id=%s
             WHERE user_row.auth_user_id=%s
               AND user_row.status='active'
               AND membership.status='active'
               AND access_grant.status='active'
               AND access_grant.valid_from_at<=transaction_timestamp()
               AND (access_grant.expires_at IS NULL
                    OR access_grant.expires_at>transaction_timestamp())
             ORDER BY access_grant.id
             LIMIT 2
            """,
            (IDS["org"], IDS["role"], authority["auth_user_id"]),
        )
        readback = cursor.fetchall()
        if len(readback) != 1:
            raise RuntimeError(
                "reviewed web Auth user did not resolve to one active ERP authority"
            )
        authority["user_id"], authority["membership_id"], authority["access_grant_id"] = (
            readback[0]
        )
    return authority


def canonical_dataset_bytes(connection) -> bytes:
    dataset = [
        {
            "id": IDS["tax_version"],
            "code": "481910",
            "code_kind": "hsn",
            "version_number": "1",
            "description": "Cartons, boxes and cases of corrugated paper or paper board (demo subset)",
            "effective_from": SOURCE_EFFECTIVE_FROM.isoformat(),
            "effective_to": "",
            "taxability": "taxable",
            "default_supply_type": "goods",
            "cgst_rate": "6",
            "sgst_rate": "6",
            "igst_rate": "12",
            "cess_rate": "0",
        }
    ]
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::jsonb::text", (json.dumps(dataset),))
        return cursor.fetchone()[0].encode("utf-8")


def demo_tax_release_exists(connection) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id FROM core.reference_data_releases WHERE id=%s",
            (IDS["tax_release"],),
        )
        if cursor.fetchone() is None:
            return False
        cursor.execute(
            """
            SELECT count(*) FROM tax.tax_code_versions
             WHERE id=%s AND release_id=%s AND code='481910'
               AND cgst_rate=6 AND sgst_rate=6 AND igst_rate=12 AND cess_rate=0
               AND status='active'
            """,
            (IDS["tax_version"], IDS["tax_release"]),
        )
        if cursor.fetchone() != (1,):
            raise RuntimeError("existing demo tax release differs from the reviewed fixture")
        return True


def import_tax_release(connection, source: bytes, dataset_bytes: bytes) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            SELECT erp_regulatory_commands.import_tax_release(
                %s, %s, 'gst_council', %s, 'github-actions-artifact', %s, 'application/pdf',
                %s, %s, 'github-actions-artifact', %s, %s, %s,
                %s, %s, NULL, %s, transaction_timestamp(), %s
            )
            """,
            (
                IDS["tax_release"],
                "demo-gst-council-notification-02-2024",
                SOURCE_URI,
                f"canonical-demo-{os.getenv('GITHUB_RUN_ID', 'local')}/gst-council-notification-02-2024.pdf",
                psycopg2.Binary(source),
                psycopg2.Binary(hashlib.sha256(source).digest()),
                f"canonical-demo-{os.getenv('GITHUB_RUN_ID', 'local')}/hsn-481910-demo.json",
                psycopg2.Binary(dataset_bytes),
                psycopg2.Binary(hashlib.sha256(dataset_bytes).digest()),
                SOURCE_PUBLICATION_DATE,
                SOURCE_EFFECTIVE_FROM,
                IDS["reviewer_user"],
                IDS["request"],
            ),
        )
        if cursor.fetchone() != (IDS["tax_release"],):
            raise RuntimeError("regulatory importer returned an unexpected release")


def adjustment_dataset_bytes(connection) -> bytes:
    dataset = [
        {
            "id": IDS["sales_return_rule"],
            "rule_code": "DEMO_SECTION_34_CUSTOMER_REJECTION",
            "rule_version": "2026-08-20-demo",
            "side": "sales",
            "direction": "credit",
            "document_effect": "decrease",
            "reason_code": "customer_rejection",
            "deadline_policy": "none",
            "deadline_days": "",
            "portal_evidence_required": False,
            "tax_effect": "statutory",
            "effective_from": ADJUSTMENT_SOURCE_PUBLICATION_DATE.isoformat(),
            "effective_to": "",
        },
        {
            "id": IDS["purchase_return_rule"],
            "rule_code": "DEMO_SECTION_34_WRONG_SUPPLY",
            "rule_version": "2026-08-20-demo",
            "side": "purchase",
            "direction": "debit",
            "document_effect": "decrease",
            "reason_code": "wrong_supply",
            "deadline_policy": "none",
            "deadline_days": "",
            "portal_evidence_required": True,
            "tax_effect": "statutory",
            "effective_from": ADJUSTMENT_SOURCE_PUBLICATION_DATE.isoformat(),
            "effective_to": "",
        },
    ]
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::jsonb::text", (json.dumps(dataset),))
        return cursor.fetchone()[0].encode("utf-8")


def demo_adjustment_release_exists(connection) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT count(*)
              FROM tax.gst_adjustment_rule_versions
             WHERE release_id=%s AND id IN (%s,%s) AND status='active'
            """,
            (
                IDS["adjustment_rule_release"],
                IDS["sales_return_rule"],
                IDS["purchase_return_rule"],
            ),
        )
        count = cursor.fetchone()[0]
        if count not in (0, 2):
            raise RuntimeError("demo GST adjustment release is only partially present")
        return count == 2


def import_adjustment_release(
    connection, source: bytes, dataset_bytes: bytes
) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            SELECT erp_regulatory_commands.import_gst_adjustment_rule_release(
                %s,%s,'gst_council',%s,'github-actions-artifact',%s,
                'application/pdf',%s,%s,'github-actions-artifact',%s,%s,%s,
                %s,%s,%s,%s,transaction_timestamp(),%s
            )
            """,
            (
                IDS["adjustment_rule_release"],
                "demo-gst-return-of-goods-section-34",
                ADJUSTMENT_SOURCE_URI,
                f"canonical-demo-{os.getenv('GITHUB_RUN_ID', 'local')}/gst-return-faq.pdf",
                psycopg2.Binary(source),
                psycopg2.Binary(hashlib.sha256(source).digest()),
                f"canonical-demo-{os.getenv('GITHUB_RUN_ID', 'local')}/gst-adjustment-rules.json",
                psycopg2.Binary(dataset_bytes),
                psycopg2.Binary(hashlib.sha256(dataset_bytes).digest()),
                ADJUSTMENT_SOURCE_PUBLICATION_DATE,
                ADJUSTMENT_SOURCE_PUBLICATION_DATE,
                None,
                IDS["reviewer_user"],
                IDS["request"],
            ),
        )
        if cursor.fetchone() != (IDS["adjustment_rule_release"],):
            raise RuntimeError("GST adjustment importer returned an unexpected release")


def itc_reversal_dataset_bytes(connection) -> bytes:
    dataset = [{
        "id": IDS["destruction_itc_rule_version"],
        "rule_code": "CGST_SECTION_17_5_H_GOODS_DESTROYED",
        "rule_version": ITC_REVERSAL_RULESET_VERSION,
        "legal_section": "17(5)(h)",
        "event_kind": "goods_destroyed",
        "gstr3b_table_code": "4",
        "gstr3b_row_code": "B(1)",
        "effective_from": ITC_REVERSAL_EFFECTIVE_FROM.isoformat(),
        "effective_to": "",
    }]
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::jsonb::text", (json.dumps(dataset),))
        return cursor.fetchone()[0].encode("utf-8")


class ExistingItcReversalAuthority(NamedTuple):
    release_id: str
    rule_version_id: str
    dataset_sha256: bytes


def resolve_existing_itc_reversal_authority(
    connection, source: bytes
) -> ExistingItcReversalAuthority | None:
    """Reuse one exact active legal authority across disposable UI runs.

    Transaction and evidence identities are deliberately run-scoped.  A
    regulatory release is not: its identity belongs to the reviewed source and
    ruleset.  Resolve the already imported exact authority before building the
    canonical dataset so a later workflow run cannot fabricate a replacement
    release with the same legal effective date.
    """

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT release.id::text,rule.id::text,release.dataset_sha256
              FROM tax.itc_reversal_rule_versions rule
              JOIN core.reference_data_releases release ON release.id=rule.release_id
             WHERE release.dataset_kind='gst_itc_reversal_rules'
               AND release.ruleset_version=%s
               AND release.source_authority='cbic' AND release.source_uri=%s
               AND release.source_media_type='application/pdf'
               AND release.source_document_sha256=%s
               AND release.dataset_media_type='application/json'
               AND release.record_count=1
               AND release.publication_date=%s AND release.effective_from=%s
               AND release.effective_to IS NULL AND release.status='active'
               AND rule.status='active' AND rule.legal_section='17(5)(h)'
               AND rule.event_kind='goods_destroyed'
               AND rule.gstr3b_table_code='4' AND rule.gstr3b_row_code='B(1)'
               AND rule.rule_code='CGST_SECTION_17_5_H_GOODS_DESTROYED'
               AND rule.rule_version=%s AND rule.effective_from=%s
               AND rule.effective_to IS NULL
            """,
            (
                ITC_REVERSAL_RULESET_VERSION,
                ITC_REVERSAL_SOURCE_URI,
                psycopg2.Binary(hashlib.sha256(source).digest()),
                ITC_REVERSAL_SOURCE_PUBLICATION_DATE,
                ITC_REVERSAL_EFFECTIVE_FROM,
                ITC_REVERSAL_RULESET_VERSION,
                ITC_REVERSAL_EFFECTIVE_FROM,
            ),
        )
        rows = cursor.fetchall()
    if len(rows) > 1:
        raise RuntimeError("demo ITC reversal release is ambiguous")
    if not rows:
        return None
    release_id, rule_version_id, dataset_sha256 = rows[0]
    authority = ExistingItcReversalAuthority(
        release_id=str(release_id),
        rule_version_id=str(rule_version_id),
        dataset_sha256=bytes(dataset_sha256),
    )
    IDS["destruction_itc_rule_release"] = authority.release_id
    IDS["destruction_itc_rule_version"] = authority.rule_version_id
    return authority


def import_itc_reversal_release(connection, source: bytes, dataset_bytes: bytes) -> None:
    source_hash = hashlib.sha256(source).digest()
    dataset_hash = hashlib.sha256(dataset_bytes).digest()
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            SELECT erp_regulatory_commands.import_itc_reversal_rule_release(
              %s,%s,'cbic',%s,'github-actions-artifact',%s,'application/pdf',%s,%s,
              'github-actions-artifact',%s,%s,%s,%s,%s,NULL,%s,
              transaction_timestamp(),%s)
            """,
            (
                IDS["destruction_itc_rule_release"], ITC_REVERSAL_RULESET_VERSION,
                ITC_REVERSAL_SOURCE_URI,
                f"canonical-demo-{DEMO_UI_FIXTURE_ID}/cbic-cgst-act-section-17-5-h.pdf",
                psycopg2.Binary(source), psycopg2.Binary(source_hash),
                f"canonical-demo-{DEMO_UI_FIXTURE_ID}/gst-itc-reversal-rules.json",
                psycopg2.Binary(dataset_bytes), psycopg2.Binary(dataset_hash),
                ITC_REVERSAL_SOURCE_PUBLICATION_DATE, ITC_REVERSAL_EFFECTIVE_FROM,
                IDS["reviewer_user"], IDS["request"],
            ),
        )
        if cursor.fetchone() != (IDS["destruction_itc_rule_release"],):
            raise RuntimeError("ITC reversal importer returned an unexpected release")


def gstr1_reporting_dataset_bytes(connection) -> bytes:
    """Canonical PostgreSQL JSONB bytes for the complete reviewed B2CL history."""

    dataset = [
        {
            "id": IDS["gstr1_reporting_legacy_rule"],
            "rule_code": "b2cl_invoice_value_threshold",
            "rule_version": "gstn-through-2024-07",
            "b2cl_threshold_amount": "250000.00",
            "effective_from": GSTR1_REPORTING_EFFECTIVE_FROM.isoformat(),
            "effective_to": "2024-07-31",
        },
        {
            "id": IDS["gstr1_reporting_current_rule"],
            "rule_code": "b2cl_invoice_value_threshold",
            "rule_version": "gstn-from-2024-08",
            "b2cl_threshold_amount": "100000.00",
            "effective_from": "2024-08-01",
            "effective_to": "",
        },
    ]
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::jsonb::text", (json.dumps(dataset),))
        row = cursor.fetchone()
    if not row or not isinstance(row[0], str):
        raise RuntimeError("database did not canonicalize the GSTR-1 reporting dataset")
    return row[0].encode("utf-8")


def demo_gstr1_reporting_release_exists(connection) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT EXISTS(SELECT 1 FROM core.reference_data_releases WHERE id=%s)",
            (IDS["gstr1_reporting_release"],),
        )
        row = cursor.fetchone()
    return bool(row and row[0])


def import_gstr1_reporting_release(
    connection, source: bytes, dataset_bytes: bytes
) -> None:
    """Activate and immediately replay the exact governed release."""

    source_hash = hashlib.sha256(source).digest()
    dataset_hash = hashlib.sha256(dataset_bytes).digest()
    with connection.cursor() as cursor:
        cursor.execute("SELECT transaction_timestamp()")
        row = cursor.fetchone()
    if not row or not isinstance(row[0], datetime) or row[0].tzinfo is None:
        raise RuntimeError("database did not return an aware GSTR-1 activation timestamp")
    activation_timestamp = row[0]
    parameters = (
        IDS["gstr1_reporting_release"],
        GSTR1_REPORTING_RULESET_VERSION,
        "gst_portal",
        GSTR1_REPORTING_SOURCE_URI,
        "github-actions-artifact",
        "canonical-demo/gstn-returns-offline-tool-gstr1.pdf",
        "application/pdf",
        psycopg2.Binary(source),
        psycopg2.Binary(source_hash),
        "github-actions-artifact",
        "canonical-demo/gstr1-reporting-rules.json",
        psycopg2.Binary(dataset_bytes),
        psycopg2.Binary(dataset_hash),
        GSTR1_REPORTING_SOURCE_PUBLICATION_DATE,
        GSTR1_REPORTING_EFFECTIVE_FROM,
        None,
        IDS["reviewer_user"],
        activation_timestamp,
        IDS["operator_user"],
        activation_timestamp,
        IDS["gstr1_reporting_activation_request"],
    )
    with connection.cursor() as cursor:
        for attempt in ("activation", "idempotent replay"):
            cursor.execute(
                """
                SELECT erp_regulatory_commands.import_gstr1_reporting_release(
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                )
                """,
                parameters,
            )
            if cursor.fetchone() != (IDS["gstr1_reporting_release"],):
                raise RuntimeError(
                    f"GSTR-1 reporting importer returned an unexpected {attempt} identity"
                )


def reconcile_gstr1_reporting_release(
    connection, source_sha256: str, dataset_bytes: bytes,
    *, initial_activation_replayed: bool,
) -> dict[str, Any]:
    """Read back the immutable release and both exact active rule intervals."""

    if re.fullmatch(r"[0-9a-f]{64}", source_sha256) is None:
        raise RuntimeError("GSTR-1 reporting source SHA-256 is invalid")

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT release.id,release.ruleset_version,release.status,
                   release.source_authority,release.source_uri,
                   encode(release.source_document_sha256,'hex'),
                   encode(release.dataset_sha256,'hex'),release.record_count,
                   release.reviewed_by_user_id,release.reviewed_at,
                   rule.id,rule.rule_version,rule.b2cl_threshold_amount,
                   rule.effective_from,rule.effective_to,rule.status,
                   rule.activated_by_user_id,rule.activated_at,
                   rule.activation_request_id
              FROM core.reference_data_releases release
              JOIN tax.gstr1_reporting_rule_versions rule
                ON rule.release_id=release.id
             WHERE release.id=%s
             ORDER BY rule.effective_from,rule.id
            """,
            (IDS["gstr1_reporting_release"],),
        )
        rows = cursor.fetchall()
    expected = (
        (
            IDS["gstr1_reporting_legacy_rule"], "gstn-through-2024-07",
            Decimal("250000.00"), date(2017, 7, 1), date(2024, 7, 31),
        ),
        (
            IDS["gstr1_reporting_current_rule"], "gstn-from-2024-08",
            Decimal("100000.00"), date(2024, 8, 1), None,
        ),
    )
    if len(rows) != 2:
        raise RuntimeError("GSTR-1 reporting release does not contain exactly two rules")
    for row, expected_rule in zip(rows, expected):
        if (
            str(row[0]) != IDS["gstr1_reporting_release"]
            or row[1] != GSTR1_REPORTING_RULESET_VERSION
            or row[2] != "active"
            or row[3] != "gst_portal"
            or row[4] != GSTR1_REPORTING_SOURCE_URI
            or row[5] != source_sha256
            or row[6] != hashlib.sha256(dataset_bytes).hexdigest()
            or row[7] != 2
            or str(row[8]) != IDS["reviewer_user"]
            or not isinstance(row[9], datetime)
            or row[9].tzinfo is None
            or (str(row[10]), row[11], row[12], row[13], row[14]) != expected_rule
            or row[15] != "active"
            or str(row[16]) != IDS["operator_user"]
            or not isinstance(row[17], datetime)
            or row[17].tzinfo is None
            or row[17] < row[9]
            or row[9] != rows[0][9]
            or row[17] != rows[0][17]
            or str(row[18]) != IDS["gstr1_reporting_activation_request"]
        ):
            raise RuntimeError("GSTR-1 reporting release readback differs from the reviewed exact set")
    return {
        "release_id": IDS["gstr1_reporting_release"],
        "ruleset_version": GSTR1_REPORTING_RULESET_VERSION,
        "record_count": 2,
        "source_sha256": source_sha256,
        "dataset_sha256": hashlib.sha256(dataset_bytes).hexdigest(),
        "reviewed_by_user_id": IDS["reviewer_user"],
        "activated_by_user_id": IDS["operator_user"],
        "reviewed_at": rows[0][9].isoformat(),
        "activated_at": rows[0][17].isoformat(),
        "activation_request_id": IDS["gstr1_reporting_activation_request"],
        "initial_activation_replayed": initial_activation_replayed,
        "existing_exact_release_reconciled": not initial_activation_replayed,
    }


def reconcile_demo_gstr1_reporting_authority(
    connection, dataset_bytes: bytes
) -> dict[str, Any]:
    """Reconcile an installed GSTR-1 authority without a live portal fetch.

    GSTR-1 filing/reporting authority is intentionally outside the core
    transaction certification boundary.  A disposable ERP fixture must not
    become unavailable because the GST tutorial portal is temporarily down.
    When the reviewed immutable release is already installed, verify its exact
    source and dataset hashes from PostgreSQL.  When it is absent, report an
    explicit deferred boundary; importing or refreshing the official artifact
    belongs to the separately reviewed regulatory-data workflow.
    """

    if not demo_gstr1_reporting_release_exists(connection):
        return {
            "status": "deferred",
            "reason": "official_gst_portal_onboarding_deferred",
            "ruleset_version": GSTR1_REPORTING_RULESET_VERSION,
            "source_uri": GSTR1_REPORTING_SOURCE_URI,
            "source_sha256": GSTR1_REPORTING_SOURCE_SHA256,
            "dataset_sha256": hashlib.sha256(dataset_bytes).hexdigest(),
            "record_count": 0,
            "initial_activation_replayed": False,
            "existing_exact_release_reconciled": False,
        }
    return reconcile_gstr1_reporting_release(
        connection,
        GSTR1_REPORTING_SOURCE_SHA256,
        dataset_bytes,
        initial_activation_replayed=False,
    )


def seed_business_master(connection, *, business_date: date) -> None:
    business_date = require_business_date(business_date)
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute(
            """
            INSERT INTO finance.accounts (
                org_id, id, code, name, account_type, currency_code,
                allows_party_posting, allows_bank_reconciliation, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, '1100-DEMO-AR', 'Demo trade receivables', 'asset', 'INR',
                true, false, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (IDS["org"], IDS["receivable_account"], IDS["reviewer_membership"], IDS["reviewer_membership"]),
        )
        variant_parties = (
            (
                IDS["interstate_customer_party"],
                f"Synthetic Interstate Customer {DEMO_UI_FIXTURE_ID}",
                INTERSTATE_CUSTOMER_GSTIN[2:12],
            ),
            (
                IDS["sez_customer_party"],
                f"Synthetic SEZ Customer {DEMO_UI_FIXTURE_ID}",
                SEZ_CUSTOMER_GSTIN[2:12],
            ),
        ) if LIVE23_VARIANTS_REQUIRED else ()
        variant_addresses = (
            (
                IDS["interstate_customer_address"],
                IDS["interstate_customer_party"],
                "18 Synthetic Interstate Trade Road",
            ),
            (
                IDS["sez_customer_address"],
                IDS["sez_customer_party"],
                "7 Synthetic SEZ Technology Park",
            ),
        ) if LIVE23_VARIANTS_REQUIRED else ()
        parties = (
            (IDS["customer_party"], "Demo Retail Customer Private Limited", "DEMOA1234B"),
            (IDS["manufacturer_party"], "Demo Paper Products Private Limited", "DEMOB1234C"),
        ) + variant_parties
        cursor.executemany(
            """
            INSERT INTO parties.parties (
                org_id, id, party_kind, legal_name, pan, tax_residency_status,
                tax_person_type, pan_verification_status, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'organization', %s, %s, 'resident', 'company',
                'unverified', 'draft', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            [
                (IDS["org"], party_id, name, pan, IDS["reviewer_membership"], IDS["reviewer_membership"])
                for party_id, name, pan in parties
            ],
        )
        cursor.executemany(
            """
            UPDATE parties.parties
               SET status='active', row_version=row_version+1,
                   updated_by_membership_id=%s
             WHERE org_id=%s AND id=%s AND status='draft'
            """,
            [
                (IDS["reviewer_membership"], IDS["org"], party_id)
                for party_id, _name, _pan in parties
            ],
        )
        cursor.execute(
            """
            INSERT INTO parties.addresses (
                org_id, id, party_id, address_kind, line1, city, state_code,
                postal_code, country_code, is_primary, valid_from, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'billing', '202 Synthetic Retail Lane', 'Mumbai',
                '27', '400002', 'IN', true, %s, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["customer_address"], IDS["customer_party"],
                business_date, IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.executemany(
            """
            INSERT INTO parties.addresses (
                org_id, id, party_id, address_kind, line1, city, state_code,
                postal_code, country_code, is_primary, valid_from, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'billing', %s, 'Bengaluru', '29', '560001',
                'IN', true, %s, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            [
                (
                    IDS["org"], address_id, party_id, line1,
                    business_date, IDS["reviewer_membership"],
                    IDS["reviewer_membership"],
                )
                for address_id, party_id, line1 in variant_addresses
            ],
        )
        cursor.execute(
            """
            INSERT INTO parties.tax_registrations (
                org_id, id, party_id, registration_type, registration_number,
                registered_legal_name, state_code, taxpayer_type, valid_from,
                verified_at, status, created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'GSTIN', '27ABCDE1234F1Z5',
                'Demo Retail Customer Private Limited', '27', 'regular', %s,
                transaction_timestamp(), 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["customer_gstin"], IDS["customer_party"],
                business_date, IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.executemany(
            """
            INSERT INTO parties.tax_registrations (
                org_id, id, party_id, registration_type, registration_number,
                registered_legal_name, state_code, taxpayer_type, valid_from,
                verified_at, status, created_by_membership_id,
                updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'GSTIN', %s, %s, '29', %s, %s,
                transaction_timestamp(), 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            [
                (
                    IDS["org"], IDS["interstate_customer_gstin"],
                    IDS["interstate_customer_party"], INTERSTATE_CUSTOMER_GSTIN,
                    f"Synthetic Interstate Customer {DEMO_UI_FIXTURE_ID}",
                    "regular", business_date,
                    IDS["reviewer_membership"], IDS["reviewer_membership"],
                ),
                (
                    IDS["org"], IDS["sez_customer_gstin"],
                    IDS["sez_customer_party"], SEZ_CUSTOMER_GSTIN,
                    f"Synthetic SEZ Customer {DEMO_UI_FIXTURE_ID}",
                    "sez_unit", business_date,
                    IDS["reviewer_membership"], IDS["reviewer_membership"],
                ),
            ] if LIVE23_VARIANTS_REQUIRED else [],
        )
        cursor.execute(
            """
            INSERT INTO parties.contacts (
                org_id,id,party_id,contact_kind,name,designation,email,phone,
                is_primary,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'business','Meera Nair','Procurement Manager',
                'meera.nair@example.invalid','9876500001',true,'active',%s,%s
            ) ON CONFLICT (org_id,id) DO UPDATE SET
                party_id=EXCLUDED.party_id,
                contact_kind=EXCLUDED.contact_kind,
                name=EXCLUDED.name,
                designation=EXCLUDED.designation,
                email=EXCLUDED.email,
                phone=EXCLUDED.phone,
                is_primary=EXCLUDED.is_primary,
                status=EXCLUDED.status,
                updated_by_membership_id=EXCLUDED.updated_by_membership_id,
                row_version=parties.contacts.row_version+1
            """,
            (
                IDS["org"], IDS["customer_contact"], IDS["customer_party"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.executemany(
            """
            INSERT INTO parties.customer_accounts (
                org_id, id, party_id, customer_code, credit_limit, credit_days,
                default_receivable_account_id, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, %s, 1000000, 30, %s, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            [
                (
                    IDS["org"], IDS["interstate_customer_account"],
                    IDS["interstate_customer_party"],
                    f"LIVE23-INTER-{DEMO_UI_FIXTURE_ID}", IDS["receivable_account"],
                    IDS["reviewer_membership"], IDS["reviewer_membership"],
                ),
                (
                    IDS["org"], IDS["sez_customer_account"],
                    IDS["sez_customer_party"],
                    f"LIVE23-SEZ-{DEMO_UI_FIXTURE_ID}", IDS["receivable_account"],
                    IDS["reviewer_membership"], IDS["reviewer_membership"],
                ),
            ] if LIVE23_VARIANTS_REQUIRED else [],
        )
        cursor.execute(
            """
            INSERT INTO parties.customer_accounts (
                org_id, id, party_id, customer_code, credit_limit, credit_days,
                default_receivable_account_id, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'CUST-DEMO-001', 1000000, 30, %s, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["customer_account"], IDS["customer_party"],
                IDS["receivable_account"], IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO catalog.units_of_measure (
                code,name,symbol,dimension,decimal_places,status
            ) VALUES ('PK','Pack','pk','count',3,'active')
            ON CONFLICT (code) DO NOTHING
            """
        )
        cursor.execute(
            "SELECT count(*) FROM catalog.units_of_measure "
            "WHERE code IN ('EA','PK') AND status='active'"
        )
        if cursor.fetchone() != (2,):
            raise RuntimeError("canonical EA and PK units of measure are unavailable")
        cursor.execute(
            """
            INSERT INTO catalog.products (
                org_id, id, sku, product_kind, name, generic_name,
                manufacturer_party_id, base_uom_code, hsn_code,
                cold_chain_required, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, 'DEMO-CARTON-481910', 'consumable',
                'Synthetic Corrugated Pharmacy Packing Carton', 'Paperboard carton',
                %s, 'EA', '481910', false, 'draft', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["product"], IDS["manufacturer_party"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO catalog.uom_conversions (
                org_id, id, product_id, from_uom_code, to_uom_code,
                multiplier, valid_from, status, created_by_membership_id
            ) VALUES (%s, %s, %s, 'EA', 'EA', 1, %s, 'active', %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["uom_conversion"], IDS["product"],
                business_date, IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO catalog.uom_conversions (
                org_id, id, product_id, from_uom_code, to_uom_code,
                multiplier, valid_from, status, created_by_membership_id
            ) VALUES (%s, %s, %s, 'PK', 'EA', 10, %s, 'active', %s)
            ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["count_uom_conversion"], IDS["product"],
                business_date, IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO core.document_sequences (
                org_id, id, branch_id, document_type, fiscal_year_start,
                prefix, suffix, padding, next_value, status,
                created_by_membership_id, updated_by_membership_id
            ) VALUES (
                %s, %s, %s, 'sales_order', %s,
                'DEMO-SO-', '', 6, 1, 'active', %s, %s
            ) ON CONFLICT (org_id, id) DO NOTHING
            """,
            (
                IDS["org"], IDS["sales_order_sequence"], IDS["branch"],
                fiscal_year_start(business_date), IDS["reviewer_membership"],
                IDS["reviewer_membership"],
            ),
        )


def reconcile_reviewed_expense_receipt_metadata(
    cursor, receipt_bytes: bytes, *, business_date: date
) -> str:
    """Create or reuse the one content-addressed receipt metadata row."""

    business_date = require_business_date(business_date)
    receipt_sha256 = hashlib.sha256(receipt_bytes).digest()
    requested_id = IDS["expense_receipt_evidence"]
    cursor.execute(
        """
        SELECT id,media_type,byte_size,sha256,evidence_kind,status
          FROM core.attachments
         WHERE org_id=%s
           AND (
             id=%s OR
             (sha256=%s AND byte_size=%s AND status IN ('verified','retained'))
           )
         ORDER BY CASE WHEN id=%s THEN 0 ELSE 1 END
         FOR UPDATE
        """,
        (
            IDS["org"],
            requested_id,
            psycopg2.Binary(receipt_sha256),
            len(receipt_bytes),
            requested_id,
        ),
    )
    existing = cursor.fetchall()
    if len(existing) > 1:
        raise RuntimeError(
            "reviewed expense receipt ID and content hash resolve different attachments"
        )
    if existing:
        (
            attachment_id,
            media_type,
            byte_size,
            stored_sha256,
            evidence_kind,
            status,
        ) = existing[0]
        if (
            media_type != "application/pdf"
            or byte_size != len(receipt_bytes)
            or bytes(stored_sha256) != receipt_sha256
            or evidence_kind != "expense_receipt"
            or status != "retained"
        ):
            raise RuntimeError(
                "reviewed expense receipt metadata contradicts the retained content identity"
            )
        resolved_id = str(attachment_id)
        IDS["expense_receipt_evidence"] = resolved_id
        return resolved_id

    cursor.execute(
        """
        INSERT INTO core.attachments (
            org_id,id,storage_bucket,storage_object_path,original_filename,
            media_type,byte_size,sha256,evidence_kind,document_date,
            retention_until,status,verified_at,created_by_membership_id
        ) VALUES (
            %s,%s,'canonical-demo-evidence',%s,%s,'application/pdf',%s,%s,
            'expense_receipt',%s,%s,'retained',transaction_timestamp(),%s
        )
        """,
        (
            IDS["org"],
            requested_id,
            f"live18/{DEMO_RUN_ID}/{DEMO_RUN_ATTEMPT}/expense-receipt.pdf",
            f"LIVE18-EXPENSE-{DEMO_RUN_ID}-{DEMO_RUN_ATTEMPT}.pdf",
            len(receipt_bytes),
            psycopg2.Binary(receipt_sha256),
            business_date,
            business_date + timedelta(days=3650),
            IDS["operator_membership"],
        ),
    )
    return requested_id


def seed_end_to_end_master(
    connection,
    *,
    business_date: date,
    expense_receipt_bytes: bytes | None = None,
) -> None:
    """Add the synthetic supplier, tax, inventory, banking, and ledger facts."""

    business_date = require_business_date(business_date)

    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))

        attachments = (
            (
                IDS["tax_profile_evidence"],
                "supplier_tax_profile",
                "supplier-pan-verification.json",
                business_date,
                "supplier_tax_profile",
            ),
            (
                IDS["fiscal_fact_evidence"],
                "organization_fiscal_tax_profile",
                f"fy-{fiscal_year_start(business_date).year}-tax-facts.json",
                business_date,
                "organization_fiscal_tax_profile",
            ),
            (
                IDS["cycle_count_evidence"],
                "inventory_cycle_count_sheet",
                f"cycle-count-sheet-{DEMO_RUN_ID}.json",
                business_date,
                f"inventory_cycle_count_sheet:{DEMO_RUN_ID}",
            ),
            (
                IDS["recipient_itc_evidence"],
                "recipient_itc_reversal",
                "recipient-itc-reversal.json",
                business_date,
                "recipient_itc_reversal",
            ),
            (
                IDS["customer_receipt_evidence"],
                "customer_receipt_evidence",
                f"customer-receipt-evidence-{DEMO_UI_FIXTURE_ID}.json",
                business_date,
                f"customer_receipt_evidence:{DEMO_RUN_ID}:{DEMO_RUN_ATTEMPT}",
            ),
        )
        cursor.executemany(
            """
            INSERT INTO core.attachments (
                org_id,id,storage_bucket,storage_object_path,original_filename,
                media_type,byte_size,sha256,evidence_kind,document_date,
                retention_until,status,verified_at,created_by_membership_id
            ) VALUES (
                %s,%s,'canonical-demo-evidence',%s,%s,'application/json',128,
                extensions.digest(%s,'sha256'),%s,%s,%s,'retained',
                transaction_timestamp(),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            [
                (
                    IDS["org"], attachment_id, f"demo/{filename}", filename,
                    f"canonical-demo:{digest_key}", evidence_kind,
                    document_date, business_date + timedelta(days=3650),
                    IDS["reviewer_membership"],
                )
                for attachment_id, evidence_kind, filename, document_date, digest_key in attachments
            ],
        )
        if expense_receipt_bytes is not None:
            reconcile_reviewed_expense_receipt_metadata(
                cursor, expense_receipt_bytes, business_date=business_date
            )

        cursor.execute(
            """
            INSERT INTO parties.parties (
                org_id,id,party_kind,legal_name,trade_name,pan,
                tax_residency_status,tax_person_type,pan_verification_status,
                tax_profile_evidence_attachment_id,tax_profile_verified_at,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,'organization','Synthetic Medicines Distributor Private Limited',
                'Synthetic Medicines Distributor','DEMOC5678D','resident','company',
                'verified',%s,transaction_timestamp(),'draft',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_party"], IDS["tax_profile_evidence"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            UPDATE parties.parties
               SET status='active',row_version=row_version+1,
                   updated_by_membership_id=%s
             WHERE org_id=%s AND id=%s AND status='draft'
            """,
            (IDS["reviewer_membership"], IDS["org"], IDS["supplier_party"]),
        )
        cursor.execute(
            """
            INSERT INTO parties.addresses (
                org_id,id,party_id,address_kind,line1,city,state_code,postal_code,
                country_code,is_primary,valid_from,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'registered','88 Synthetic Wholesale Avenue','Mumbai','27',
                '400003','IN',true,%s,'active',%s,%s
            ) ON CONFLICT (org_id,id) DO UPDATE SET
                address_kind=EXCLUDED.address_kind,
                line1=EXCLUDED.line1,
                city=EXCLUDED.city,
                state_code=EXCLUDED.state_code,
                postal_code=EXCLUDED.postal_code,
                country_code=EXCLUDED.country_code,
                is_primary=EXCLUDED.is_primary,
                valid_from=EXCLUDED.valid_from,
                status=EXCLUDED.status,
                updated_by_membership_id=EXCLUDED.updated_by_membership_id
            """,
            (
                IDS["org"], IDS["supplier_address"], IDS["supplier_party"],
                business_date, IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO parties.tax_registrations (
                org_id,id,party_id,registration_type,registration_number,
                registered_legal_name,state_code,taxpayer_type,valid_from,
                verified_at,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'GSTIN','27DEMOC5678D1Z5',
                'Synthetic Medicines Distributor Private Limited','27','regular',%s,
                transaction_timestamp(),'active',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_gstin"], IDS["supplier_party"],
                business_date, IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO parties.contacts (
                org_id,id,party_id,contact_kind,name,designation,email,phone,
                is_primary,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'billing','Arjun Mehta','Accounts Manager',
                'arjun.mehta@example.invalid','9876500002',true,'active',%s,%s
            ) ON CONFLICT (org_id,id) DO UPDATE SET
                party_id=EXCLUDED.party_id,
                contact_kind=EXCLUDED.contact_kind,
                name=EXCLUDED.name,
                designation=EXCLUDED.designation,
                email=EXCLUDED.email,
                phone=EXCLUDED.phone,
                is_primary=EXCLUDED.is_primary,
                status=EXCLUDED.status,
                updated_by_membership_id=EXCLUDED.updated_by_membership_id,
                row_version=parties.contacts.row_version+1
            """,
            (
                IDS["org"], IDS["supplier_contact"], IDS["supplier_party"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )

        account_rows = (
            (IDS["bank_ledger"], "1000-DEMO-BANK", "Demo current bank", "asset", False, True),
            (IDS["payable_account"], "2100-DEMO-AP", "Demo trade payables", "liability", True, False),
            (IDS["inventory_account"], "1200-DEMO-INV", "Demo inventory asset", "asset", False, False),
            (IDS["cogs_account"], "5100-DEMO-COGS", "Demo cost of goods sold", "expense", False, False),
            (IDS["sales_revenue_account"], "4100-DEMO-REV", "Demo sales revenue", "income", False, False),
            (IDS["supplier_prepayment_account"], "1300-DEMO-PREPAY", "Demo supplier prepayments", "asset", True, False),
            (IDS["input_cgst_account"], "1401-DEMO-ICGST", "Demo input CGST", "asset", False, False),
            (IDS["input_sgst_account"], "1402-DEMO-ISGST", "Demo input SGST", "asset", False, False),
            (IDS["input_igst_account"], "1403-DEMO-IIGST", "Demo input IGST", "asset", False, False),
            (IDS["input_cess_account"], "1404-DEMO-ICESS", "Demo input cess", "asset", False, False),
            (IDS["output_cgst_account"], "2201-DEMO-OCGST", "Demo output CGST", "liability", False, False),
            (IDS["output_sgst_account"], "2202-DEMO-OSGST", "Demo output SGST", "liability", False, False),
            (IDS["output_igst_account"], "2203-DEMO-OIGST", "Demo output IGST", "liability", False, False),
            (IDS["output_cess_account"], "2204-DEMO-OCESS", "Demo output cess", "liability", False, False),
            (IDS["grni_account"], "2300-DEMO-GRNI", "Demo goods received not invoiced", "liability", False, False),
            (IDS["purchase_return_variance_account"], "5200-DEMO-PRV", "Demo purchase return inventory variance", "expense", False, False),
            (IDS["inventory_count_gain_account"], "4200-DEMO-ICG", "Demo inventory count gain", "income", False, False),
            (IDS["inventory_count_loss_account"], "5201-DEMO-ICL", "Demo inventory count loss", "expense", False, False),
            (IDS["rounding_gain_account"], "4900-DEMO-RG", "Demo rounding gain", "income", False, False),
            (IDS["rounding_loss_account"], "5900-DEMO-RL", "Demo rounding loss", "expense", False, False),
            (IDS["purchase_price_variance_account"], "5300-DEMO-PPV", "Demo purchase price variance", "expense", False, False),
            (
                IDS["destruction_loss_account"],
                f"LIVE18-DSTR-{DEMO_RUN_ID}-{DEMO_RUN_ATTEMPT}",
                "Live18 certified destruction and ITC reversal expense",
                "expense",
                False,
                False,
            ),
            (
                IDS["expense_claim_expense_account"],
                f"LIVE18-EXP-{DEMO_RUN_ID}-{DEMO_RUN_ATTEMPT}",
                "Live18 reviewed member expense",
                "expense",
                False,
                False,
            ),
            (
                IDS["expense_claim_reimbursement_account"],
                f"LIVE18-REIMB-{DEMO_RUN_ID}-{DEMO_RUN_ATTEMPT}",
                "Live18 member reimbursement payable",
                "liability",
                False,
                False,
            ),
            (
                IDS["cash_on_hand_account"],
                "1010-DEMO-CASH",
                "Demo branch cash on hand",
                "asset",
                False,
                False,
            ),
            (
                IDS["cheques_in_hand_account"],
                "1020-DEMO-CHEQUES",
                "Demo uncleared cheques in hand",
                "asset",
                False,
                False,
            ),
            (
                IDS["customer_advance_account"],
                "2400-DEMO-CUSTADV",
                "Demo customer advances",
                "liability",
                True,
                False,
            ),
        )
        cursor.executemany(
            """
            INSERT INTO finance.accounts (
                org_id,id,code,name,account_type,currency_code,
                allows_party_posting,allows_bank_reconciliation,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,%s,%s,%s,'INR',%s,%s,'active',%s,%s)
            ON CONFLICT (org_id,id) DO NOTHING
            """,
            [
                (IDS["org"], *row, IDS["reviewer_membership"], IDS["reviewer_membership"])
                for row in account_rows
            ],
        )
        cursor.execute(
            """
            INSERT INTO parties.supplier_accounts (
                org_id,id,party_id,supplier_code,payment_days,
                default_payable_account_id,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,%s,'SUP-DEMO-001',30,%s,'active',%s,%s)
            ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["supplier_account"], IDS["supplier_party"],
                IDS["payable_account"], IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO finance.bank_accounts (
                org_id,id,account_id,bank_name,account_holder_name,
                account_number_ciphertext,account_number_hash,ifsc,currency_code,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,'Demo Bank','AasoPharma Disposable Demo Private Limited',
                convert_to('encrypted-demo-bank-account','UTF8'),
                extensions.digest('demo-bank-account','sha256'),'HDFC0000001','INR','active',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["bank_account"], IDS["bank_ledger"],
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )

        role_accounts = {
            "accounts_receivable": IDS["receivable_account"],
            "accounts_payable": IDS["payable_account"],
            "sales_revenue": IDS["sales_revenue_account"],
            "supplier_prepayment": IDS["supplier_prepayment_account"],
            "input_cgst": IDS["input_cgst_account"],
            "input_sgst": IDS["input_sgst_account"],
            "input_igst": IDS["input_igst_account"],
            "input_cess": IDS["input_cess_account"],
            "output_cgst": IDS["output_cgst_account"],
            "output_sgst": IDS["output_sgst_account"],
            "output_igst": IDS["output_igst_account"],
            "output_cess": IDS["output_cess_account"],
            "goods_received_not_invoiced": IDS["grni_account"],
            "purchase_return_inventory_variance": IDS["purchase_return_variance_account"],
            "inventory_asset": IDS["inventory_account"],
            "inventory_count_gain": IDS["inventory_count_gain_account"],
            "inventory_count_loss": IDS["inventory_count_loss_account"],
            "cost_of_goods_sold": IDS["cogs_account"],
            "rounding_gain": IDS["rounding_gain_account"],
            "rounding_loss": IDS["rounding_loss_account"],
            "purchase_price_variance": IDS["purchase_price_variance_account"],
            "inventory_destruction_loss": IDS["destruction_loss_account"],
            "inventory_itc_reversal_expense": IDS["destruction_loss_account"],
            "member_reimbursement_liability": IDS[
                "expense_claim_reimbursement_account"
            ],
            "cash_on_hand": IDS["cash_on_hand_account"],
            "cheques_in_hand": IDS["cheques_in_hand_account"],
            "customer_advance": IDS["customer_advance_account"],
        }
        cursor.executemany(
            """
            INSERT INTO core.settings (
                org_id,id,scope_kind,branch_id,namespace,key,value_type,value_text,
                status,created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,'organization',NULL,'finance.account_roles',%s,'text',%s,
                'active',%s,%s)
            ON CONFLICT DO NOTHING
            """,
            [
                (
                    IDS["org"],
                    str(uuid5(NAMESPACE_URL, f"aasopharma-demo-account-role:{role}")),
                    role, account_id, IDS["reviewer_membership"], IDS["reviewer_membership"],
                )
                for role, account_id in sorted(role_accounts.items())
            ],
        )
        cash_rule_values = {
            "max_single_amount": Decimal("100000.00"),
            "max_customer_rolling_amount": Decimal("200000.00"),
            "rolling_window_days": Decimal("30"),
        }
        cursor.executemany(
            """
            INSERT INTO core.settings (
                org_id,id,scope_kind,branch_id,namespace,key,value_type,value_numeric,
                status,created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,'branch',%s,'finance.cash_receipt_rules',%s,'numeric',%s,
                'active',%s,%s)
            ON CONFLICT DO NOTHING
            """,
            [
                (
                    IDS["org"],
                    str(
                        uuid5(
                            NAMESPACE_URL,
                            f"aasopharma-demo-cash-receipt-rule:{rule_key}",
                        )
                    ),
                    IDS["branch"],
                    rule_key,
                    rule_value,
                    IDS["reviewer_membership"],
                    IDS["reviewer_membership"],
                )
                for rule_key, rule_value in sorted(cash_rule_values.items())
            ],
        )
        cursor.execute(
            """
            SELECT id,row_version,value_text
              FROM core.settings
             WHERE org_id=%s AND status='active' AND branch_id IS NULL
               AND namespace='finance.account_roles'
               AND key='member_reimbursement_liability'
             FOR UPDATE
            """,
            (IDS["org"],),
        )
        reimbursement_setting = cursor.fetchone()
        if reimbursement_setting is None:
            raise RuntimeError("member reimbursement account setting is unavailable")
        if reimbursement_setting[2] != IDS["expense_claim_reimbursement_account"]:
            replacement_id = str(
                uuid5(
                    NAMESPACE_URL,
                    (
                        "aasopharma-demo-account-role:"
                        "member_reimbursement_liability:canonical-v1"
                    ),
                )
            )
            replacement_request = json.dumps(
                {
                    "operation": "core.setting.replace",
                    "organization_id": IDS["org"],
                    "setting_id": str(reimbursement_setting[0]),
                    "replacement_id": replacement_id,
                    "expected_row_version": reimbursement_setting[1],
                    "value_type": "text",
                    "value_text": IDS["expense_claim_reimbursement_account"],
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
            cursor.execute(
                """
                SELECT erp_core_commands.replace_setting(
                    %s,%s,%s,%s,'text',%s,NULL,NULL,NULL,NULL,
                    extensions.digest(%s,'sha256'),
                    transaction_timestamp()+interval '24 hours'
                )
                """,
                (
                    IDS["org"],
                    reimbursement_setting[0],
                    replacement_id,
                    reimbursement_setting[1],
                    IDS["expense_claim_reimbursement_account"],
                    psycopg2.Binary(replacement_request),
                ),
            )
            if str(cursor.fetchone()[0]) != replacement_id:
                raise RuntimeError("member reimbursement setting replacement drifted")

        cursor.execute(
            """
            INSERT INTO tax.registrations (
                org_id,id,gstin,legal_name,trade_name,state_code,registration_type,
                effective_from,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,'27ABCDE1234F1Z5','AasoPharma Disposable Demo Private Limited',
                'AasoPharma Demo','27','regular',%s,'active',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], IDS["org_gst_registration"], business_date,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.registration_branches (
                org_id,registration_id,branch_id,place_of_business_kind,
                effective_from,status,created_by_membership_id
            ) VALUES (%s,%s,%s,'principal',%s,'active',%s)
            ON CONFLICT (org_id,registration_id,branch_id,effective_from) DO NOTHING
            """,
            (
                IDS["org"], IDS["org_gst_registration"], IDS["branch"],
                business_date, IDS["reviewer_membership"],
            ),
        )
        cursor.executemany(
            """
            INSERT INTO inventory.locations (
                org_id,id,branch_id,code,name,location_type,status,allows_sale,
                allows_negative_stock,created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,%s,%s,%s,%s,'active',%s,false,%s,%s)
            ON CONFLICT (org_id,id) DO NOTHING
            """,
            [
                (IDS["org"], IDS["saleable_location"], IDS["branch"], "SALE-DEMO", "Demo saleable stock", "saleable", True, IDS["reviewer_membership"], IDS["reviewer_membership"]),
                (IDS["org"], IDS["quarantine_location"], IDS["branch"], "QUAR-DEMO", "Demo returned quarantine", "quarantine", False, IDS["reviewer_membership"], IDS["reviewer_membership"]),
                (IDS["org"], IDS["transfer_destination_location"], IDS["transfer_destination_branch"], "SALE-PUN-DEMO", "Demo transfer destination", "saleable", True, IDS["reviewer_membership"], IDS["reviewer_membership"]),
            ],
        )
        sequence_types = {
            "sales_dispatch": "DEMO-SD-",
            "sales_invoice": "DEMO-SI-",
            "sales_return": "DEMO-SR-",
            "purchase_order": "DEMO-PO-",
            "goods_receipt": "DEMO-GRN-",
            "purchase_return": "DEMO-PR-",
            "supplier_payment": "DEMO-SP-",
            "supplier_advance": "DEMO-SA-",
            "customer_receipt": "DEMO-CR-",
            "journal_entry": "DEMO-JE-",
            "stock_count": "DEMO-SC-",
            "stock_transfer": "DEMO-ST-",
            "destruction": "DEMO-DST-",
        }
        cursor.executemany(
            """
            INSERT INTO core.document_sequences (
                org_id,id,branch_id,document_type,fiscal_year_start,prefix,suffix,
                padding,next_value,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (%s,%s,%s,%s,%s,%s,'',6,1,'active',%s,%s)
            ON CONFLICT DO NOTHING
            """,
            [
                (
                    IDS["org"],
                    str(uuid5(NAMESPACE_URL, f"aasopharma-demo-sequence:{document_type}")),
                    IDS["branch"], document_type, fiscal_year_start(business_date),
                    prefix,
                    IDS["reviewer_membership"], IDS["reviewer_membership"],
                )
                for document_type, prefix in sorted(sequence_types.items())
            ],
        )


def verify_fiscal_tax_fact(connection, *, business_date: date) -> None:
    """Create the fiscal fact through its maker-checker command boundary."""

    fiscal_start_year = fiscal_year_start(business_date).year
    key_bytes = b"canonical-demo-fiscal-tax-fact-v1"
    request_bytes = json.dumps(
        {
            "fact_id": IDS["fiscal_tax_fact"],
            "fiscal_year_start_year": fiscal_start_year,
            "organization_person_type": "company",
            "prior_fiscal_year_turnover": "50000000.00",
            "gst_tds_notified_deductor": False,
            "evidence_attachment_id": IDS["fiscal_fact_evidence"],
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["operator_auth_user"], IDS["org"]),
        )
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            SELECT erp_compliance_commands.verify_organization_fiscal_tax_fact(
                %s::uuid,%s::uuid,%s::uuid,%s::smallint,'company'::varchar,
                50000000::numeric,false,NULL::varchar,%s::uuid,%s::bytea,%s::bytea,
                transaction_timestamp() + interval '30 minutes'
            )
            """,
            (
                IDS["org"], IDS["fiscal_tax_fact"], IDS["operator_membership"],
                fiscal_start_year,
                IDS["fiscal_fact_evidence"],
                psycopg2.Binary(hashlib.sha256(key_bytes).digest()),
                psycopg2.Binary(hashlib.sha256(request_bytes).digest()),
            ),
        )
        if cursor.fetchone() != (IDS["fiscal_tax_fact"],):
            raise RuntimeError("fiscal tax fact verification returned an unexpected resource")


def activate_demo_product(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            "SELECT status, row_version FROM catalog.products "
            "WHERE org_id=%s AND id=%s",
            (IDS["org"], IDS["product"]),
        )
        status, row_version = cursor.fetchone()
        if status == "active":
            return
        if status != "draft":
            raise RuntimeError("demo product is not in an activatable state")
        cursor.execute(
            "SELECT erp_regulatory_commands.activate_product(%s, %s, %s, NULL, %s, transaction_timestamp() + interval '15 minutes')",
            (
                IDS["org"],
                IDS["product"],
                row_version,
                psycopg2.Binary(hashlib.sha256(b"demo-product-activation-v1").digest()),
            ),
        )
        if cursor.fetchone() != (IDS["product"],):
            raise RuntimeError("demo product activation returned an unexpected product")


def token(
    operation: str,
    permission: str,
    *,
    command_id: str | None = None,
    approver: bool = False,
) -> str:
    now = datetime.now(timezone.utc)
    auth_user_id = IDS["reviewer_auth_user"] if approver else IDS["operator_auth_user"]
    user_id = IDS["reviewer_user"] if approver else IDS["operator_user"]
    membership_id = IDS["reviewer_membership"] if approver else IDS["operator_membership"]
    agent_grant_id = IDS["legacy_approver_agent_grant"] if approver else IDS["agent_grant"]
    provisioning_provider = os.getenv("CANONICAL_PROVISIONING_PROVIDER", "").strip().lower()
    token_profile = "canonical_operator_delegation_v1"
    provisioning_claims: dict[str, str] = {}
    if provisioning_provider:
        sha_environment = {
            "railway": "RAILWAY_GIT_COMMIT_SHA",
            "render": "RENDER_GIT_COMMIT",
        }.get(provisioning_provider)
        if sha_environment is None:
            raise RuntimeError("canonical demo provisioning provider is not reviewed")
        deployment_sha = required(sha_environment).lower()
        if re.fullmatch(r"[0-9a-f]{40}", deployment_sha) is None:
            raise RuntimeError("canonical demo provisioning SHA is not exact")
        run_id = required("GITHUB_RUN_ID")
        run_attempt = required("GITHUB_RUN_ATTEMPT")
        if (
            not run_id.isdigit()
            or str(int(run_id)) != run_id
            or not run_attempt.isdigit()
            or str(int(run_attempt)) != run_attempt
        ):
            raise RuntimeError("canonical demo provisioning run identity is invalid")
        token_profile = "canonical_provisioning_operator_v1"
        provisioning_claims = {
            "provisioning_provider": provisioning_provider,
            "provisioning_deployment_sha": deployment_sha,
            "provisioning_run_id": run_id,
            "provisioning_run_attempt": run_attempt,
        }
    claims: dict[str, Any] = {
        "operator_delegated": True,
        "token_profile": token_profile,
        "operator_operation": operation,
        "operator_permission": permission,
        "operator_organization_scope": True,
        "mcp_client_id": CLIENT_ID,
        "branch_ids": [IDS["branch"]],
        "auth_user_id": auth_user_id,
        "user_id": user_id,
        "org_id": IDS["org"],
        "membership_id": membership_id,
        "agent_grant_id": agent_grant_id,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "sub": auth_user_id,
        "iss": "aasopharma-api",
        "aud": "aasopharma-api",
        "token_use": "access",
        **provisioning_claims,
    }
    if command_id:
        claims["operator_command_request_id"] = command_id
    return jwt.encode(claims, required("JWT_SECRET_KEY"), algorithm="HS256")


def api_call(
    method: str,
    path: str,
    operation: str,
    permission: str,
    payload=None,
    command_id=None,
    *,
    approver: bool = False,
):
    response = requests.request(
        method,
        required("CANONICAL_DEMO_API_URL").rstrip("/") + path,
        timeout=90,
        headers={
            "Authorization": f"Bearer {required('MCP_INTERNAL_SERVICE_TOKEN')}",
            "X-MCP-Delegated-Authorization": f"Bearer {token(operation, permission, command_id=command_id, approver=approver)}",
            "Content-Type": "application/json",
        },
        json=payload,
    )
    if not response.ok:
        raise RuntimeError(f"canonical demo API failed ({response.status_code}): {response.text[:1200]}")
    body = response.json()
    if not isinstance(body, dict):
        raise RuntimeError("canonical demo API returned a non-object")
    return body


def action_context(operation: str, permission: str):
    from app.domain.operator_actions.models import ActionContext

    return ActionContext(
        auth_user_id=UUID(IDS["operator_auth_user"]),
        user_id=UUID(IDS["operator_user"]),
        organization_id=UUID(IDS["org"]),
        membership_id=UUID(IDS["operator_membership"]),
        agent_grant_id=UUID(IDS["agent_grant"]),
        client_id=CLIENT_ID,
        operation_key=operation,
        permission=permission,
        branch_ids=(UUID(IDS["branch"]),),
        organization_scope=True,
    )


def existing_demo_command(
    operation: str,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    """Load a prior run-scoped command before attempting a mutable preflight."""

    idempotency_key = payload.get("idempotency_key")
    if not isinstance(idempotency_key, str) or not idempotency_key:
        raise RuntimeError(f"{operation} preflight lacks its exact idempotency key")
    key_hash = hashlib.sha256(idempotency_key.encode("utf-8")).digest()
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        with runtime.cursor() as cursor:
            cursor.execute(
                "SELECT erp_security.activate_context(%s, %s)",
                (IDS["operator_auth_user"], IDS["org"]),
            )
            cursor.execute(
                """
                SELECT command.id::text,command.status,
                       pg_catalog.encode(command.preview_hash,'hex'),
                       command.result_resource_id::text
                  FROM erp_automation_reads.requester_command_by_idempotency(
                       %s,%s,%s,%s
                  ) AS command
                """,
                (
                    IDS["org"], operation, CLIENT_ID, psycopg2.Binary(key_hash),
                ),
            )
            rows = cursor.fetchall()
    if len(rows) > 1:
        raise RuntimeError(f"{operation} idempotency authority is ambiguous")
    if not rows:
        return None
    command_id, status, preview_hash, resource_id = rows[0]
    if status not in {"prepared", "approved", "succeeded"}:
        raise RuntimeError(f"{operation} cannot resume command in {status} state")
    if status == "succeeded" and resource_id is None:
        raise RuntimeError(f"{operation} succeeded without a canonical resource")
    return {
        "command_request_id": str(command_id),
        "status": str(status),
        "preview_hash": f"sha256:{preview_hash}",
        "resource_id": str(resource_id) if resource_id is not None else None,
    }


def resumed_command_evidence(
    payload: dict[str, Any],
    prepared: dict[str, Any],
    status: dict[str, Any],
) -> dict[str, Any]:
    """Represent a completed replay without inventing approval or execute calls."""

    return {
        "payload": payload,
        "prepared": prepared,
        "prepared_replay": prepared,
        "resumed_status": status,
        "approved": None,
        "approved_replay": None,
        "executed": status,
        "executed_replay": status,
    }


def preflight_action(operation: str, payload: dict[str, Any]) -> dict[str, Decimal]:
    """Exercise the exact service transaction and roll back every write."""

    existing = existing_demo_command(operation, payload)
    if existing is not None:
        print(
            f"canonical demo {operation} rollback preflight reused "
            f"{existing['status']} command {existing['command_request_id']}"
        )
        with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
            with runtime.cursor() as cursor:
                cursor.execute(
                    "SELECT erp_security.activate_context(%s, %s)",
                    (IDS["operator_auth_user"], IDS["org"]),
                )
                return calculation_totals(cursor, existing["command_request_id"])

    backend_root = str(Path(__file__).resolve().parents[1])
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from sqlalchemy.pool import NullPool

    from app.domain.operator_actions.contract import (
        ACTION_POLICIES,
        PREPARE_PAYLOAD_MODELS,
        validate_prepare_payload_semantics,
    )
    from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService

    runtime_engine = create_engine(
        required("ERP_RUNTIME_DATABASE_URL"), poolclass=NullPool, pool_pre_ping=True
    )
    calculator_engine = create_engine(
        required("ERP_CALCULATOR_DATABASE_URL"), poolclass=NullPool, pool_pre_ping=True
    )
    runtime_connection = runtime_engine.connect()
    calculator_connection = calculator_engine.connect()
    runtime_transaction = runtime_connection.begin()
    calculator_transaction = calculator_connection.begin()
    try:
        service = SqlAlchemyOperatorActionService(
            session_factory=lambda: Session(
                bind=runtime_connection, join_transaction_mode="create_savepoint"
            ),
            calculator_factory=lambda: Session(
                bind=calculator_connection, join_transaction_mode="create_savepoint"
            ),
            runtime_principal_configured=True,
        )
        policy = ACTION_POLICIES[operation]
        validated_payload = PREPARE_PAYLOAD_MODELS[operation].model_validate(payload)
        validate_prepare_payload_semantics(operation, validated_payload)
        service_payload = validated_payload.model_dump(mode="python", exclude_none=True)
        prepared = service.prepare(
            policy=policy,
            payload={
                key: value
                for key, value in service_payload.items()
                if key != "idempotency_key"
            },
            idempotency_key=service_payload["idempotency_key"],
            context=action_context(operation, policy.permission),
        )
        if prepared.command_request_id is None or not prepared.preview_hash.startswith("sha256:"):
            raise RuntimeError(f"{operation} rollback preflight returned invalid evidence")
        totals = (
            _prepared_purchase_order_totals(prepared, service_payload)
            if operation == "procurement.purchase_order.prepare"
            else {}
        )
    finally:
        calculator_transaction.rollback()
        runtime_transaction.rollback()
        calculator_connection.close()
        runtime_connection.close()
        calculator_engine.dispose()
        runtime_engine.dispose()
    print(f"canonical demo {operation} rollback preflight passed")
    return totals


def exercise_action(
    evidence_dir: Path,
    operation: str,
    permission: str,
    payload: dict[str, Any],
    *,
    separate_approver: bool = False,
    evidence_label: str = "",
) -> dict[str, Any]:
    existing = existing_demo_command(operation, payload)
    if existing is None:
        prepared = api_call(
            "POST", f"/api/internal/mcp/actions/{operation}/prepare",
            operation, permission, payload,
        )
        prepared_replay = api_call(
            "POST", f"/api/internal/mcp/actions/{operation}/prepare",
            operation, permission, payload,
        )
    else:
        prepared = existing
        prepared_replay = existing
    command_id = str(prepared["command_request_id"])
    preview_hash = str(prepared["preview_hash"])
    if (
        str(prepared_replay.get("command_request_id")) != command_id
        or str(prepared_replay.get("preview_hash")) != preview_hash
    ):
        raise RuntimeError(f"{operation} prepare replay changed immutable evidence")
    resumed_status = api_call(
        "GET", f"/api/internal/mcp/commands/{command_id}",
        "automation.command.status.get", "automation.command.view",
        command_id=command_id,
    )
    if resumed_status.get("status") == "succeeded":
        if (
            str(resumed_status.get("command_request_id")) != command_id
            or str(resumed_status.get("preview_hash")) != preview_hash
            or not resumed_status.get("resource_id")
        ):
            raise RuntimeError(f"{operation} resumed status changed immutable evidence")
        evidence = resumed_command_evidence(payload, prepared, resumed_status)
        evidence_suffix = f"-{evidence_label}" if evidence_label else ""
        evidence_name = operation.replace(".", "-") + evidence_suffix
        (evidence_dir / f"canonical-demo-{evidence_name}.json").write_text(
            json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return evidence
    if resumed_status.get("status") not in {"prepared", "approved"}:
        raise RuntimeError(
            f"{operation} cannot resume command in {resumed_status.get('status')} state"
        )
    evidence_suffix = f"-{evidence_label}" if evidence_label else ""
    approval_key = (
        f"demo-approve-{operation}-{os.getenv('GITHUB_RUN_ID', 'local')}"
        f"{evidence_suffix}"
    )
    if resumed_status.get("status") == "approved":
        approved = resumed_status
        approved_replay = resumed_status
    else:
        approved = api_call(
            "POST", f"/api/internal/mcp/commands/{command_id}/approve",
            "automation.command.approve", "automation.command.approve",
            {
                "preview_hash": preview_hash,
                "approval_intent": "approve",
                "idempotency_key": approval_key,
            },
            command_id,
            approver=separate_approver,
        )
        approved_replay = api_call(
            "POST", f"/api/internal/mcp/commands/{command_id}/approve",
            "automation.command.approve", "automation.command.approve",
            {
                "preview_hash": preview_hash,
                "approval_intent": "approve",
                "idempotency_key": approval_key,
            },
            command_id,
            approver=separate_approver,
        )
        if (
            str(approved_replay.get("command_request_id")) != command_id
            or approved_replay.get("idempotency_replayed") is not True
        ):
            raise RuntimeError(f"{operation} approval replay was not idempotent")
    execution_key = (
        f"demo-execute-{operation}-{os.getenv('GITHUB_RUN_ID', 'local')}"
        f"{evidence_suffix}"
    )
    executed = api_call(
        "POST", f"/api/internal/mcp/commands/{command_id}/execute",
        "automation.command.execute", "automation.command.execute",
        {
            "preview_hash": preview_hash,
            "idempotency_key": execution_key,
        }, command_id,
    )
    executed_replay = api_call(
        "POST", f"/api/internal/mcp/commands/{command_id}/execute",
        "automation.command.execute", "automation.command.execute",
        {
            "preview_hash": preview_hash,
            "idempotency_key": execution_key,
        }, command_id,
    )
    if (
        str(executed_replay.get("command_request_id")) != command_id
        or str(executed_replay.get("resource_id")) != str(executed.get("resource_id"))
        or executed_replay.get("idempotency_replayed") is not True
    ):
        raise RuntimeError(f"{operation} execution replay was not idempotent")
    evidence = {
        "payload": payload,
        "prepared": prepared,
        "prepared_replay": prepared_replay,
        "resumed_status": resumed_status,
        "approved": approved,
        "approved_replay": approved_replay,
        "executed": executed,
        "executed_replay": executed_replay,
    }
    evidence_name = operation.replace(".", "-") + evidence_suffix
    (evidence_dir / f"canonical-demo-{evidence_name}.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return evidence


def selected_customer_delivery_address_row_version(
    connection, *, business_date: date
) -> int:
    """Resolve the exact active delivery-address version used by sales writes."""

    business_date = require_business_date(business_date)

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT address.row_version
              FROM parties.addresses AS address
             WHERE address.org_id=%s AND address.id=%s AND address.party_id=%s
               AND address.address_kind IN ('registered','billing','shipping')
               AND address.status='active'
               AND address.valid_from<=%s
               AND (address.valid_until IS NULL OR address.valid_until>=%s)
            """,
            (
                IDS["org"],
                IDS["customer_address"],
                IDS["customer_party"],
                business_date,
                business_date,
            ),
        )
        rows = cursor.fetchall()
    if len(rows) != 1 or not isinstance(rows[0][0], int) or rows[0][0] < 1:
        raise RuntimeError(
            "demo customer lacks one exact active delivery-address version"
        )
    return rows[0][0]


def sales_order_payload(
    delivery_address_row_version: int,
    *,
    business_date: date,
    delivery_offset_days: str,
) -> dict[str, Any]:
    if (
        isinstance(delivery_address_row_version, bool)
        or delivery_address_row_version < 1
    ):
        raise ValueError("delivery address row version must be a positive integer")
    if not isinstance(business_date, date) or isinstance(business_date, datetime):
        raise ValueError(
            "sales order requires the authoritative organization business date"
        )
    if not isinstance(delivery_offset_days, str) or not re.fullmatch(
        r"[1-9]|[12][0-9]|30", delivery_offset_days
    ):
        raise ValueError(
            "sales order delivery offset must be a reviewed integer from 1 through 30"
        )
    requested_delivery_date = business_date + timedelta(
        days=int(delivery_offset_days)
    )
    return {
        "idempotency_key": f"demo-sales-order-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "order_date": business_date.isoformat(),
        "requested_delivery_date": requested_delivery_date.isoformat(),
        "document_discount": {
            "document_discount_kind": "amount",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "25.00",
        },
        "rounding_policy": "nearest_rupee",
        "zero_rated_payment_mode": "not_applicable",
        "customer_account_id": IDS["customer_account"],
        "delivery_address_id": IDS["customer_address"],
        "delivery_address_row_version": str(delivery_address_row_version),
        "lines": [
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["uom_conversion"],
                "billed_quantity": "12",
                "free_quantity": "2",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "125.50",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "percent",
                    "line_discount_basis": "taxable_value",
                    "line_discount_value": "7.5",
                },
                "document_discount_eligible": True,
            }
        ],
    }


def purchase_order_payload(*, business_date: date) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    no_discount = {
        "line_discount_kind": "none",
        "line_discount_basis": "taxable_value",
        "line_discount_value": "0",
    }
    return {
        "idempotency_key": f"demo-purchase-order-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "order_date": business_date.isoformat(),
        "expected_on": (business_date + timedelta(days=5)).isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "tax_charge_mechanism": "normal",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["uom_conversion"],
                "billed_quantity": "10",
                "free_quantity": "0",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": no_discount,
                "document_discount_eligible": True,
            },
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["uom_conversion"],
                "billed_quantity": "100",
                "free_quantity": "5",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": no_discount,
                "document_discount_eligible": True,
            },
        ],
    }


def live18_supplier_invoice_purchase_order_payload(
    scalars: dict[str, Any], business_date: date,
) -> dict[str, Any]:
    chain = supplier_invoice_chain_choices(scalars)
    line_discount = chain["purchase_order_line_discount_percent"]
    document_discount = chain["purchase_order_document_discount"]
    return {
        "idempotency_key": f"demo-live18-po-economics-{DEMO_UI_FIXTURE_ID}",
        "branch_id": IDS["branch"],
        "order_date": business_date.isoformat(),
        "expected_on": (
            business_date
            + timedelta(days=int(chain["purchase_order_delivery_offset_days"]))
        ).isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "tax_charge_mechanism": "normal",
        "document_discount": {
            "document_discount_kind": (
                "amount" if Decimal(document_discount) > 0 else "none"
            ),
            "document_discount_basis": "price_value",
            "document_discount_value": document_discount,
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [{
            "product_id": IDS["product"],
            "uom_conversion_id": IDS["uom_conversion"],
            "billed_quantity": chain["purchase_order_quantity"],
            "free_quantity": chain["purchase_order_free_quantity"],
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "quoted_unit_rate": chain["purchase_order_rate"],
            "price_basis": "tax_exclusive",
            "line_discount": {
                "line_discount_kind": (
                    "percent" if Decimal(line_discount) > 0 else "none"
                ),
                "line_discount_basis": "price_value",
                "line_discount_value": line_discount,
            },
            "document_discount_eligible": True,
        }],
    }


def organization_business_date(connection) -> date:
    """Resolve the canonical organization-local business date once per run."""

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            "SELECT erp_core_commands.current_organization_business_date()",
        )
        rows = cursor.fetchall()
    if len(rows) != 1 or not isinstance(rows[0][0], date):
        raise RuntimeError("canonical organization-local business date is unavailable")
    return rows[0][0]


def organization_business_clock(connection) -> tuple[date, datetime]:
    """Resolve one database instant in the canonical organization timezone."""

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT erp_core_commands.current_organization_business_date(),
                   transaction_timestamp(), organization.timezone
              FROM core.organizations organization
             WHERE organization.id=%s AND organization.status='active'
            """,
            (IDS["org"],),
        )
        rows = cursor.fetchall()
    if len(rows) != 1:
        raise RuntimeError("canonical organization business clock is unavailable")
    business_date, current_instant, timezone_name = rows[0]
    if (
        not isinstance(business_date, date)
        or not isinstance(current_instant, datetime)
        or current_instant.utcoffset() is None
        or not isinstance(timezone_name, str)
        or not timezone_name
    ):
        raise RuntimeError("canonical organization business clock is invalid")
    try:
        local_instant = current_instant.astimezone(ZoneInfo(timezone_name))
    except ZoneInfoNotFoundError as error:
        raise RuntimeError("canonical organization timezone is invalid") from error
    if local_instant.date() != business_date:
        raise RuntimeError("canonical organization business clock is inconsistent")
    return business_date, local_instant.replace(microsecond=0)


def reconcile_purchase_order(
    connection, resource_id: str, command_request_id: str, *, expected_line_count: int = 2
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT purchase_order.id,purchase_order.purchase_order_number,purchase_order.status,
                   purchase_order.subtotal,purchase_order.gst_taxable_total,
                   purchase_order.cgst_total,purchase_order.sgst_total,
                   purchase_order.igst_total,purchase_order.grand_total,
                   count(line.id) AS line_count,
                   jsonb_agg(line.id::text ORDER BY line.line_number) AS line_ids
              FROM procurement.purchase_orders AS purchase_order
              JOIN procurement.purchase_order_lines AS line
                ON line.org_id=purchase_order.org_id
               AND line.purchase_order_id=purchase_order.id
             WHERE purchase_order.org_id=%s AND purchase_order.id=%s
             GROUP BY purchase_order.org_id,purchase_order.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] not in PURCHASE_ORDER_RECONCILABLE_STATUSES
            or row[9] != expected_line_count
        ):
            raise RuntimeError("executed demo purchase order did not reconcile")
        columns = [item.name for item in cursor.description]
        result = dict(zip(columns, row))
        assert_calculation_totals(cursor, command_request_id, result)
        result["line_ids"] = [str(item) for item in result["line_ids"]]
        for key, value in tuple(result.items()):
            if key != "line_ids" and value is not None:
                result[key] = str(value)
        return result


def supplier_advance_payload(
    purchase_order_id: str,
    purchase_order_line_id: str,
    *,
    business_date: date,
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    return {
        "idempotency_key": f"demo-supplier-advance-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "payment_date": business_date.isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "purchase_order_id": purchase_order_id,
        "bank_account_id": IDS["bank_account"],
        "payment_method": "upi",
        "gross_amount": "500.00",
        "allocations": [
            {"purchase_order_line_id": purchase_order_line_id, "gross_amount": "500.00"}
        ],
        "external_reference": f"DEMO-UPI-ADV-{os.getenv('GITHUB_RUN_ID', 'local')}",
    }


def goods_receipt_payload(
    purchase_order_id: str,
    purchase_order_line_id: str,
    *,
    business_date: date,
    received_at: datetime,
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    if received_at.utcoffset() is None or received_at.date() != business_date:
        raise ValueError(
            "goods receipt time must be timezone-aware and match the business date"
        )
    return {
        "idempotency_key": f"demo-goods-receipt-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "received_at": received_at.isoformat(),
        "purchase_order_id": purchase_order_id,
        "supplier_account_id": IDS["supplier_account"],
        "supplier_challan_number": f"DEMO-CH-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "supplier_challan_date": business_date.isoformat(),
        "lines": [
            {
                "purchase_order_line_id": purchase_order_line_id,
                "batches": [
                    {
                        "manufacturer_batch_number": f"DEMO-BATCH-{os.getenv('GITHUB_RUN_ID', 'local')}",
                        "manufactured_on": "2026-07-01",
                        "expires_on": "2028-09-01",
                        "mrp": "150.00",
                        "mrp_uom_conversion_id": IDS["uom_conversion"],
                        "received_quantity": "50",
                        "accepted_quantity": "50",
                        "rejected_quantity": "0",
                        "free_quantity": "2.5",
                        "qc_status": "accepted",
                        "to_location_id": IDS["saleable_location"],
                    }
                ],
            }
        ],
    }


def seed_supplier_invoice_portal_evidence(
    connection, *, business_date: date
) -> dict[str, str]:
    business_date = require_business_date(business_date)
    period_start, period_end, due_date = monthly_period(business_date)
    supplier_invoice_number = f"DEMO-SUP-{os.getenv('GITHUB_RUN_ID', 'local')}"
    supplier_credit_note_number = f"DEMO-SUP-CN-{os.getenv('GITHUB_RUN_ID', 'local')}"
    source_attachment_id = demo_run_uuid("gstr2b-source-attachment")
    return_period_id = demo_run_uuid("gstr2b-return-period")
    portal_document_id = demo_run_uuid("gstr2b-portal-document")
    portal_line_id = demo_run_uuid("gstr2b-invoice-line")
    portal_credit_note_line_id = demo_run_uuid("gstr2b-credit-note-line")
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute(
            """
            INSERT INTO core.attachments (
                org_id,id,storage_bucket,storage_object_path,original_filename,
                media_type,byte_size,sha256,evidence_kind,document_date,
                retention_until,status,verified_at,created_by_membership_id
            ) VALUES (
                %s,%s,'canonical-demo-evidence',%s,'synthetic-gstr2b.json',
                'application/json',256,extensions.digest(%s,'sha256'),'gstr2b_import',
                %s,%s,'retained',transaction_timestamp(),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], source_attachment_id,
                f"demo/{os.getenv('GITHUB_RUN_ID', 'local')}/synthetic-gstr2b.json",
                f"synthetic-gstr2b:{supplier_invoice_number}",
                business_date, business_date + timedelta(days=3650),
                IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.return_periods (
                org_id,id,registration_id,period_start,period_end,due_date,
                period_kind,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,%s,%s,%s,
                'monthly','open',%s,%s
            ) ON CONFLICT (org_id,registration_id,period_start,period_end) DO NOTHING
            RETURNING id
            """,
            (
                IDS["org"], return_period_id, IDS["org_gst_registration"],
                period_start, period_end, due_date,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        inserted_period = cursor.fetchone()
        if inserted_period is None:
            cursor.execute(
                """
                SELECT id
                  FROM tax.return_periods
                 WHERE org_id=%s AND registration_id=%s
                   AND period_start=%s
                   AND period_end=%s
                """,
                (
                    IDS["org"], IDS["org_gst_registration"],
                    period_start, period_end,
                ),
            )
            inserted_period = cursor.fetchone()
        if inserted_period is None:
            raise RuntimeError("demo GSTR-2B return period was not created or resolved")
        return_period_id = str(inserted_period[0])
        cursor.execute(
            """
            INSERT INTO tax.portal_documents (
                org_id,id,registration_id,return_period_id,portal_document_type,
                portal_generation_date,source_attachment_id,source_sha256,status,
                created_by_membership_id
            ) VALUES (
                %s,%s,%s,%s,'gstr2b',%s,%s,
                extensions.digest(%s,'sha256'),'imported',%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], portal_document_id, IDS["org_gst_registration"],
                return_period_id, business_date, source_attachment_id,
                f"synthetic-gstr2b:{supplier_invoice_number}", IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            SELECT erp_finance_commands.parse_portal_document(%s,%s,%s::jsonb)
            """,
            (
                IDS["org"],
                portal_document_id,
                json.dumps(
                    [
                        {
                            "id": portal_line_id,
                            "line_number": 1,
                            "supplier_gstin": "27DEMOC5678D1Z5",
                            "counterparty_name": "Synthetic Medicines Distributor Private Limited",
                            "invoice_number": supplier_invoice_number,
                            "invoice_date": business_date.isoformat(),
                            "document_type": "invoice",
                            "place_of_supply_state_code": "27",
                            "taxable_amount": "5000.00",
                            "cgst_amount": "300.00",
                            "sgst_amount": "300.00",
                            "igst_amount": "0.00",
                            "cess_amount": "0.00",
                            "total_amount": "5600.00",
                            "portal_reference": f"GSTR2B-DEMO-{os.getenv('GITHUB_RUN_ID', 'local')}",
                            "source_row_hash": hashlib.sha256(
                                f"synthetic-gstr2b-row:{supplier_invoice_number}".encode()
                            ).hexdigest(),
                        },
                        {
                            "id": portal_credit_note_line_id,
                            "line_number": 2,
                            "supplier_gstin": "27DEMOC5678D1Z5",
                            "counterparty_name": "Synthetic Medicines Distributor Private Limited",
                            "invoice_number": supplier_credit_note_number,
                            "invoice_date": business_date.isoformat(),
                            "document_type": "credit_note",
                            "place_of_supply_state_code": "27",
                            "taxable_amount": "1000.00",
                            "cgst_amount": "60.00",
                            "sgst_amount": "60.00",
                            "igst_amount": "0.00",
                            "cess_amount": "0.00",
                            "total_amount": "1120.00",
                            "portal_reference": f"GSTR2B-DEMO-CN-{os.getenv('GITHUB_RUN_ID', 'local')}",
                            "source_row_hash": hashlib.sha256(
                                f"synthetic-gstr2b-credit-note:{supplier_credit_note_number}".encode()
                            ).hexdigest(),
                        },
                    ],
                    separators=(",", ":"),
                    sort_keys=True,
                ),
            ),
        )
    return {
        "supplier_invoice_number": supplier_invoice_number,
        "portal_document_line_id": portal_line_id,
    }


def supplier_invoice_portal_economics(
    calculation: dict[str, Decimal],
    scalars: dict[str, Any],
) -> dict[str, str]:
    supplier_invoice_chain_choices(scalars)
    required_totals = (
        "gst_taxable_total", "cgst_total", "sgst_total", "igst_total",
        "cess_total", "grand_total",
    )
    if any(key not in calculation for key in required_totals):
        raise RuntimeError("purchase-order preflight omitted supplier-invoice economics")
    if calculation["gst_taxable_total"] <= 0 or any(
        calculation[key] < 0 for key in required_totals
    ):
        raise RuntimeError("canonical purchase-order economics must be non-negative")
    component_total = sum(
        (calculation[key] for key in required_totals[:-1]), Decimal("0")
    )
    if calculation["grand_total"] != component_total:
        raise RuntimeError(
            "canonical purchase-order grand total includes an unreconciled rounding or charge"
        )
    return {key: format(calculation[key], ".2f") for key in required_totals}


def seed_supplier_invoice_ui_portal_evidence(
    connection,
    economics: dict[str, str],
    scalars: dict[str, Any],
    business_date: date,
) -> dict[str, str]:
    """Create one run-scoped GSTR-2B row bound to reviewed browser PO/GRN economics."""

    supplier_invoice_number = f"DEMO-UI-SUP-{DEMO_UI_FIXTURE_ID}"
    source_attachment_id = demo_ui_fixture_uuid("gstr2b-source-attachment")
    return_period_id = demo_ui_fixture_uuid("gstr2b-return-period")
    portal_document_id = demo_ui_fixture_uuid("gstr2b-portal-document")
    portal_line_id = demo_ui_fixture_uuid("gstr2b-invoice-line")
    period_start = business_date.replace(day=1)
    next_month = (period_start + timedelta(days=32)).replace(day=1)
    period_end = next_month - timedelta(days=1)
    due_date = period_end + timedelta(days=20)
    row_hash = hashlib.sha256(json.dumps(
        {
            "invoice_number": supplier_invoice_number,
            "reviewed_chain": supplier_invoice_chain_choices(scalars),
            "economics": economics,
        },
        separators=(",", ":"), sort_keys=True,
    ).encode()).hexdigest()
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute(
            """
            INSERT INTO core.attachments (
                org_id,id,storage_bucket,storage_object_path,original_filename,
                media_type,byte_size,sha256,evidence_kind,document_date,
                retention_until,status,verified_at,created_by_membership_id
            ) VALUES (
                %s,%s,'canonical-demo-evidence',%s,'synthetic-ui-gstr2b.json',
                'application/json',256,extensions.digest(%s,'sha256'),'gstr2b_import',
                %s,%s,'retained',transaction_timestamp(),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], source_attachment_id,
                f"demo/{DEMO_UI_FIXTURE_ID}/synthetic-ui-gstr2b.json",
                f"synthetic-ui-gstr2b:{supplier_invoice_number}",
                business_date, business_date + timedelta(days=8 * 365),
                IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.return_periods (
                org_id,id,registration_id,period_start,period_end,due_date,
                period_kind,status,created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,%s,%s,%s,
                'monthly','open',%s,%s
            ) ON CONFLICT (org_id,registration_id,period_start,period_end) DO NOTHING
            RETURNING id
            """,
            (
                IDS["org"], return_period_id, IDS["org_gst_registration"],
                period_start, period_end, due_date,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        inserted_period = cursor.fetchone()
        if inserted_period is None:
            cursor.execute(
                """
                SELECT id FROM tax.return_periods
                 WHERE org_id=%s AND registration_id=%s
                   AND period_start=%s
                   AND period_end=%s
                """,
                (IDS["org"], IDS["org_gst_registration"], period_start, period_end),
            )
            inserted_period = cursor.fetchone()
        if inserted_period is None:
            raise RuntimeError("demo UI GSTR-2B return period was not resolved")
        return_period_id = str(inserted_period[0])
        cursor.execute(
            """
            INSERT INTO tax.portal_documents (
                org_id,id,registration_id,return_period_id,portal_document_type,
                portal_generation_date,source_attachment_id,source_sha256,status,
                created_by_membership_id
            ) VALUES (
                %s,%s,%s,%s,'gstr2b',%s,%s,
                extensions.digest(%s,'sha256'),'imported',%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], portal_document_id, IDS["org_gst_registration"],
                return_period_id, business_date, source_attachment_id,
                f"synthetic-ui-gstr2b:{supplier_invoice_number}",
                IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            "SELECT status FROM tax.portal_documents WHERE org_id=%s AND id=%s",
            (IDS["org"], portal_document_id),
        )
        document = cursor.fetchone()
        if document is None:
            raise RuntimeError("demo supplier-invoice UI portal document is missing")
        if document[0] == "imported":
            cursor.execute(
                "SELECT erp_finance_commands.parse_portal_document(%s,%s,%s::jsonb)",
                (
                    IDS["org"], portal_document_id,
                    json.dumps([{
                        "id": portal_line_id,
                        "line_number": 1,
                        "supplier_gstin": "27DEMOC5678D1Z5",
                        "counterparty_name": "Synthetic Medicines Distributor Private Limited",
                        "invoice_number": supplier_invoice_number,
                        "invoice_date": business_date.isoformat(),
                        "document_type": "invoice",
                        "place_of_supply_state_code": "27",
                        "taxable_amount": economics["gst_taxable_total"],
                        "cgst_amount": economics["cgst_total"],
                        "sgst_amount": economics["sgst_total"],
                        "igst_amount": economics["igst_total"],
                        "cess_amount": economics["cess_total"],
                        "total_amount": economics["grand_total"],
                        "portal_reference": f"GSTR2B-DEMO-UI-{DEMO_UI_FIXTURE_ID}",
                        "source_row_hash": row_hash,
                    }], separators=(",", ":"), sort_keys=True),
                ),
            )
        elif document[0] != "parsed":
            raise RuntimeError("demo supplier-invoice UI portal document is not parsed")
        cursor.execute(
            """
            SELECT count(*)
              FROM tax.portal_document_lines
             WHERE org_id=%s AND portal_document_id=%s AND id=%s
               AND document_type='invoice' AND invoice_number=%s
               AND invoice_date=%s AND source_row_hash=decode(%s,'hex')
               AND taxable_amount=%s AND cgst_amount=%s AND sgst_amount=%s
               AND igst_amount=%s AND cess_amount=%s AND total_amount=%s
            """,
            (
                IDS["org"], portal_document_id, portal_line_id,
                supplier_invoice_number, business_date, row_hash,
                economics["gst_taxable_total"], economics["cgst_total"],
                economics["sgst_total"], economics["igst_total"],
                economics["cess_total"], economics["grand_total"],
            ),
        )
        if cursor.fetchone()[0] != 1:
            raise RuntimeError("demo supplier-invoice UI parsed portal row drifted")
    return {
        "supplier_invoice_number": supplier_invoice_number,
        "portal_document_line_id": portal_line_id,
        "invoice_date": business_date.isoformat(),
        **economics,
    }


def reconcile_supplier_invoice_ui_fixture(
    connection,
    portal_evidence: dict[str, str],
    economics: dict[str, str],
) -> dict[str, str]:
    """Prove one unconsumed, run-scoped GSTR-2B row is ready for Live18."""

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT line.id::text AS portal_document_line_id,
                   line.invoice_number,
                   line.invoice_date,
                   line.taxable_amount,
                   line.cgst_amount,
                   line.sgst_amount,
                   line.igst_amount,
                   line.cess_amount,
                   line.total_amount,
                   CASE WHEN erp_automation_reads.active_command_evidence_in_use(
                     line.org_id,
                     'procurement.supplier_invoice.prepare',
                     'portal_document_line_id',
                     line.id
                   ) THEN 1 ELSE 0 END AS consumed_count
              FROM tax.portal_document_lines line
              JOIN tax.portal_documents document
                ON document.org_id=line.org_id
               AND document.id=line.portal_document_id
               AND document.portal_document_type='gstr2b'
               AND document.status='parsed'
               AND document.parsed_at IS NOT NULL
              JOIN core.attachments source
                ON source.org_id=document.org_id
               AND source.id=document.source_attachment_id
               AND source.storage_object_path=%s
               AND source.evidence_kind='gstr2b_import'
               AND source.status='retained'
               AND source.verified_at IS NOT NULL
               AND source.sha256=document.source_sha256
              JOIN parties.supplier_accounts supplier
                ON supplier.org_id=line.org_id
               AND supplier.id=%s
               AND supplier.status='active'
              JOIN parties.tax_registrations registration
                ON registration.org_id=supplier.org_id
               AND registration.party_id=supplier.party_id
               AND registration.registration_type='GSTIN'
               AND registration.status='active'
               AND registration.id=%s
             WHERE line.org_id=%s
               AND line.id=%s
               AND line.document_type='invoice'
               AND line.supplier_gstin=registration.registration_number
               AND line.invoice_number=%s
               AND line.invoice_date=%s
               AND line.place_of_supply_state_code='27'
               AND line.taxable_amount=%s
               AND line.cgst_amount=%s
               AND line.sgst_amount=%s
               AND line.igst_amount=%s
               AND line.cess_amount=%s
               AND line.total_amount=%s
            """,
            (
                f"demo/{DEMO_UI_FIXTURE_ID}/synthetic-ui-gstr2b.json",
                IDS["supplier_account"], IDS["supplier_gstin"], IDS["org"],
                portal_evidence["portal_document_line_id"],
                portal_evidence["supplier_invoice_number"],
                portal_evidence["invoice_date"],
                economics["gst_taxable_total"], economics["cgst_total"],
                economics["sgst_total"], economics["igst_total"],
                economics["cess_total"], economics["grand_total"],
            ),
        )
        rows = cursor.fetchall()
        if len(rows) != 1:
            raise RuntimeError(
                "demo supplier-invoice UI fixture is not one exact run-scoped portal row"
            )
        columns = [item.name for item in cursor.description]
        result = dict(zip(columns, rows[0]))
        if result["consumed_count"] != 0:
            raise RuntimeError("demo supplier-invoice UI fixture portal row was already consumed")
        return {
            key: value.isoformat() if isinstance(value, date) else str(value)
            for key, value in result.items()
        }


def seed_purchase_return_portal_evidence(connection) -> dict[str, str]:
    """Verify and return the credit note parsed with the demo GSTR-2B import."""

    portal_document_id = demo_run_uuid("gstr2b-portal-document")
    portal_line_id = demo_run_uuid("gstr2b-credit-note-line")
    credit_note_number = f"DEMO-SUP-CN-{os.getenv('GITHUB_RUN_ID', 'local')}"
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            """
            SELECT 1
              FROM tax.portal_document_lines
             WHERE org_id=%s AND id=%s AND portal_document_id=%s
               AND document_type='credit_note' AND invoice_number=%s
            """,
            (
                IDS["org"], portal_line_id, portal_document_id, credit_note_number,
            ),
        )
        if cursor.fetchone() is None:
            raise RuntimeError("parsed demo GSTR-2B credit note is missing")
    return {
        "supplier_credit_note_number": credit_note_number,
        "supplier_credit_note_portal_line_id": portal_line_id,
    }


def supplier_invoice_payload(
    goods_receipt_id: str,
    goods_receipt_line_id: str,
    portal_evidence: dict[str, str],
    *,
    business_date: date,
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    return {
        "idempotency_key": f"demo-supplier-invoice-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "invoice_date": business_date.isoformat(),
        "received_date": business_date.isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "supplier_tax_registration_id": IDS["supplier_gstin"],
        "supplier_invoice_number": portal_evidence["supplier_invoice_number"],
        "tax_charge_mechanism": "normal",
        "portal_document_line_id": portal_evidence["portal_document_line_id"],
        "goods_receipt_ids": [goods_receipt_id],
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [
            {
                "billed_quantity": "50",
                "free_quantity": "2.5",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "none",
                    "line_discount_basis": "taxable_value",
                    "line_discount_value": "0",
                },
                "document_discount_eligible": True,
                "goods_receipt_line_id": goods_receipt_line_id,
                "allocated_base_billed_quantity": "50",
                "allocated_base_free_quantity": "2.5",
                "product_inventory_cost_treatment": "capitalize",
                "landed_cost_allocation_method": "direct",
                "itc_eligibility": "eligible",
                "itc_eligibility_basis": "taxable_resale_not_blocked_under_section_17",
            }
        ],
    }


def reconcile_supplier_advance(
    connection, resource_id: str, expected_amount: str
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT payment.id,payment.payment_number,payment.status,payment.amount,
                   count(DISTINCT advance.id) AS advance_count,
                   count(DISTINCT item.id) AS prepayment_item_count,
                   count(DISTINCT event.id) AS accounting_event_count
              FROM finance.payments AS payment
              LEFT JOIN procurement.purchase_order_advance_allocations AS advance
                ON advance.org_id=payment.org_id AND advance.payment_id=payment.id
              LEFT JOIN finance.open_items AS item
                ON item.org_id=payment.org_id
               AND item.id=advance.prepayment_open_item_id
              LEFT JOIN finance.accounting_events AS event
                ON event.org_id=payment.org_id AND event.payment_id=payment.id
             WHERE payment.org_id=%s AND payment.id=%s
             GROUP BY payment.org_id,payment.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != "posted"
            or row[3] != Decimal(expected_amount)
            or row[4:] != (1, 1, 1)
        ):
            raise RuntimeError("executed demo supplier advance did not reconcile")
        return {
            "id": str(row[0]),
            "payment_number": row[1],
            "status": row[2],
            "amount": str(row[3]),
            "advance_count": row[4],
            "prepayment_item_count": row[5],
            "accounting_event_count": row[6],
        }


def reconcile_goods_receipt(
    connection,
    resource_id: str,
    *,
    expected_accepted_quantity: str,
    expected_free_quantity: str,
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT receipt.id,receipt.goods_receipt_number,receipt.status,
                   line.id AS goods_receipt_line_id,line.batch_id,
                   line.base_accepted_quantity,line.base_free_quantity,
                   line.extended_cost,document.id AS inventory_document_id,
                   inventory_line.base_quantity AS posted_base_quantity,
                   ledger.quantity_delta AS posted_quantity_delta,
                   ledger.value_delta AS posted_value_delta,
                   balance.average_unit_cost AS moving_weighted_average
              FROM procurement.goods_receipts AS receipt
              JOIN procurement.goods_receipt_lines AS line
                ON line.org_id=receipt.org_id AND line.goods_receipt_id=receipt.id
              JOIN inventory.inventory_documents AS document
                ON document.org_id=receipt.org_id AND document.goods_receipt_id=receipt.id
              JOIN inventory.inventory_document_lines AS inventory_line
                ON inventory_line.org_id=document.org_id
               AND inventory_line.inventory_document_id=document.id
               AND inventory_line.goods_receipt_line_id=line.id
              JOIN inventory.stock_ledger_entries AS ledger
                ON ledger.org_id=inventory_line.org_id
               AND ledger.inventory_document_line_id=inventory_line.id
               AND ledger.entry_kind='receipt'
              JOIN inventory.stock_balances AS balance
                ON balance.org_id=receipt.org_id
               AND balance.location_id=line.location_id
               AND balance.product_id=line.product_id
               AND balance.batch_id=line.batch_id
             WHERE receipt.org_id=%s AND receipt.id=%s
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != "posted"
            or row[5] != Decimal(expected_accepted_quantity)
            or row[6] != Decimal(expected_free_quantity)
            or row[9] != row[5] + row[6]
            or row[10] != row[9]
            or row[11] != row[7]
        ):
            raise RuntimeError("executed demo goods receipt did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def release_received_batch(connection, goods_receipt_id: str, batch_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute("SELECT set_config('app.request_id', %s, true)", (IDS["request"],))
        cursor.execute(
            """
            SELECT batch.id,batch.status,batch.row_version,batch.released_at,
                   batch.released_by_membership_id,balance.on_hand_quantity
              FROM inventory.batches AS batch
              JOIN procurement.goods_receipt_lines AS line
                ON line.org_id=batch.org_id AND line.batch_id=batch.id
              JOIN procurement.goods_receipts AS receipt
                ON receipt.org_id=line.org_id AND receipt.id=line.goods_receipt_id
              JOIN inventory.stock_balances AS balance
                ON balance.org_id=line.org_id AND balance.location_id=line.location_id
               AND balance.product_id=line.product_id AND balance.batch_id=line.batch_id
             WHERE batch.org_id=%s AND batch.id=%s
               AND receipt.id=%s AND receipt.status='posted'
               AND line.qc_status='accepted' AND line.rejected_quantity=0
               AND line.location_id=%s AND balance.on_hand_quantity>0
             FOR UPDATE OF batch
            """,
            (IDS["org"], batch_id, goods_receipt_id, IDS["saleable_location"]),
        )
        row = cursor.fetchone()
        if row is None:
            raise RuntimeError("demo batch lacks posted QC-accepted receipt evidence")
        if row[1] == "quarantined":
            cursor.execute(
                """
                UPDATE inventory.batches
                   SET status='released',released_at=transaction_timestamp(),
                       released_by_membership_id=%s,updated_at=transaction_timestamp(),
                       updated_by_membership_id=%s,row_version=row_version+1
                 WHERE org_id=%s AND id=%s AND status='quarantined' AND row_version=%s
                RETURNING id,status,row_version,released_at,released_by_membership_id
                """,
                (
                    IDS["reviewer_membership"], IDS["reviewer_membership"],
                    IDS["org"], batch_id, row[2],
                ),
            )
            released = cursor.fetchone()
            if released is None:
                raise RuntimeError("demo batch release lost its locked lifecycle version")
        elif row[1] == "released" and row[3] is not None and row[4] is not None:
            released = row[:5]
        else:
            raise RuntimeError("demo batch is not in a releasable lifecycle state")
        return {
            "id": str(released[0]),
            "status": released[1],
            "row_version": str(released[2]),
            "released_at": released[3].isoformat(),
            "released_by_membership_id": str(released[4]),
            "on_hand_quantity": str(row[5]),
            "quality_evidence": "posted_qc_accepted_goods_receipt",
        }


def seed_inventory_destruction_ui_fixture(
    connection, batch_id: str, *, business_date: date
) -> dict[str, Any]:
    """Seed only governed authority around an exact returned-stock lineage."""

    business_date = require_business_date(business_date)
    period_start, period_end, due_date = monthly_period(business_date)
    certificate_digest = (
        f"destruction-certificate:{DEMO_UI_FIXTURE_ID}:{batch_id}:{business_date}"
    )
    reversal_digest = (
        f"section-17-5-h-reversal:{DEMO_UI_FIXTURE_ID}:{batch_id}:{business_date}"
    )
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s,%s,true)", (setting, value))
        cursor.execute(
            """
            WITH credit_lot_authority AS (
              SELECT count(*) AS lot_count,
                     COALESCE(sum(lot.remaining_base_quantity),0) AS remaining_base_quantity,
                     COALESCE(sum(lot.remaining_cgst_amount),0) AS remaining_cgst_amount,
                     COALESCE(sum(lot.remaining_sgst_amount),0) AS remaining_sgst_amount,
                     COALESCE(sum(lot.remaining_igst_amount),0) AS remaining_igst_amount,
                     COALESCE(sum(lot.remaining_cess_amount),0) AS remaining_cess_amount
                FROM tax.input_credit_lots lot
               WHERE lot.org_id=%s AND lot.batch_id=%s
                 AND lot.lineage_status='exact' AND lot.remaining_base_quantity>0
            ), returned_stock_lineage AS (
              SELECT count(*) FILTER (
                       WHERE application.application_kind='sales_return_restoration'
                     ) AS restoration_count,
                     COALESCE(sum(application.applied_base_quantity) FILTER (
                       WHERE application.application_kind='sales_return_restoration'
                     ),0) AS restored_base_quantity,
                     COALESCE(sum(application.applied_base_quantity) FILTER (
                       WHERE application.application_kind='destruction_reversal'
                     ),0) AS destroyed_base_quantity
                FROM tax.input_credit_applications application
                JOIN tax.input_credit_lots lot ON lot.org_id=application.org_id
                  AND lot.id=application.input_credit_lot_id
               WHERE application.org_id=%s AND lot.batch_id=%s
                 AND application.status='posted'
                 AND ((application.application_kind='sales_return_restoration'
                       AND application.application_direction='restore')
                   OR (application.application_kind='destruction_reversal'
                       AND application.application_direction='consume'))
            )
            SELECT balance.on_hand_quantity,balance.inventory_value,balance.average_unit_cost,
                   batch.batch_number,batch.status,location.id,location.name,
                   credit_lot_authority.lot_count,
                   credit_lot_authority.remaining_base_quantity,
                   credit_lot_authority.remaining_cgst_amount,
                   credit_lot_authority.remaining_sgst_amount,
                   credit_lot_authority.remaining_igst_amount,
                   credit_lot_authority.remaining_cess_amount,
                   returned_stock_lineage.restoration_count,
                   returned_stock_lineage.restored_base_quantity,
                   returned_stock_lineage.destroyed_base_quantity
              FROM inventory.stock_balances balance
              JOIN inventory.batches batch ON batch.org_id=balance.org_id AND batch.id=balance.batch_id
              JOIN inventory.locations location ON location.org_id=balance.org_id
                AND location.id=balance.location_id AND location.location_type='quarantine'
                AND NOT location.allows_sale
              CROSS JOIN credit_lot_authority
              CROSS JOIN returned_stock_lineage
             WHERE balance.org_id=%s AND balance.branch_id=%s AND balance.location_id=%s
               AND balance.product_id=%s AND balance.batch_id=%s
               AND balance.on_hand_quantity>0 AND balance.inventory_value>0
               AND EXISTS (SELECT 1 FROM inventory.stock_ledger_entries returned_ledger
                 JOIN inventory.inventory_documents returned_document
                   ON returned_document.org_id=returned_ledger.org_id
                  AND returned_document.id=returned_ledger.inventory_document_id
                WHERE returned_ledger.org_id=balance.org_id
                  AND returned_ledger.location_id=balance.location_id
                  AND returned_ledger.batch_id=balance.batch_id
                  AND returned_ledger.quantity_delta>0
                  AND returned_document.document_type='sales_return_receipt'
                  AND returned_document.status='posted')
            """,
            (
                IDS["org"], batch_id, IDS["org"], batch_id,
                IDS["org"], IDS["branch"], IDS["quarantine_location"],
                IDS["product"], batch_id,
            ),
        )
        stock = cursor.fetchone()
        if (
            stock is None
            or stock[0] > stock[8]
            or stock[0] != stock[14] - stock[15]
            or stock[0] <= 0
            or stock[1] <= 0
            or stock[2] <= 0
            or stock[7] < 1
            or stock[13] < 1
            or sum(Decimal(value or 0) for value in stock[9:13]) <= 0
        ):
            raise RuntimeError(
                "destruction fixture lacks exact returned stock and restored ITC lineage: "
                f"on_hand={None if stock is None else stock[0]},"
                f"restored={None if stock is None else stock[14]},"
                f"destroyed={None if stock is None else stock[15]},"
                f"remaining_credit={None if stock is None else stock[8]}"
            )
        for attachment_id, filename, evidence_kind, digest_text in (
            (
                IDS["destruction_certificate_evidence"],
                f"licensed-incineration-certificate-{DEMO_UI_FIXTURE_ID}.pdf",
                "inventory_destruction_certificate",
                certificate_digest,
            ),
            (
                IDS["destruction_itc_reversal_evidence"],
                f"section-17-5-h-working-{DEMO_UI_FIXTURE_ID}.json",
                "inventory_destruction_itc_reversal",
                reversal_digest,
            ),
        ):
            cursor.execute(
                """
                INSERT INTO core.attachments(
                  org_id,id,storage_bucket,storage_object_path,original_filename,
                  media_type,byte_size,sha256,evidence_kind,document_date,
                  retention_until,status,verified_at,created_by_membership_id)
                VALUES(%s,%s,'canonical-demo-evidence',%s,%s,%s,256,
                  extensions.digest(%s,'sha256'),%s,%s,%s,'retained',
                  transaction_timestamp(),%s)
                ON CONFLICT (org_id,id) DO NOTHING
                """,
                (
                    IDS["org"], attachment_id,
                    f"demo/{DEMO_UI_FIXTURE_ID}/{filename}", filename,
                    "application/pdf" if filename.endswith(".pdf") else "application/json",
                    digest_text, evidence_kind, business_date,
                    business_date + timedelta(days=3650),
                    IDS["reviewer_membership"],
                ),
            )
        cursor.execute(
            """
            INSERT INTO tax.return_periods(
              org_id,id,registration_id,period_start,period_end,due_date,period_kind,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES(%s,%s,%s,%s,%s,%s,'monthly','open',%s,%s)
            ON CONFLICT (org_id,registration_id,period_start,period_end) DO NOTHING
            RETURNING id
            """,
            (
                IDS["org"], IDS["destruction_return_period"],
                IDS["org_gst_registration"], period_start, period_end, due_date,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        period = cursor.fetchone()
        if period is None:
            cursor.execute(
                """SELECT id FROM tax.return_periods
                     WHERE org_id=%s AND registration_id=%s
                       AND period_start=%s AND period_end=%s AND status='open'""",
                (IDS["org"], IDS["org_gst_registration"], period_start, period_end),
            )
            period = cursor.fetchone()
        if period is None:
            raise RuntimeError("destruction fixture lacks an open GST return period")
        return_period_id = str(period[0])
        cursor.execute(
            """
            INSERT INTO tax.returns(
              org_id,id,return_period_id,return_type,revision,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES(%s,%s,%s,'gstr3b',1,'draft',%s,%s)
            ON CONFLICT (org_id,return_period_id,return_type,revision) DO NOTHING
            RETURNING id
            """,
            (
                IDS["org"], IDS["destruction_gstr3b_return"], return_period_id,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        filing = cursor.fetchone()
        if filing is None:
            cursor.execute(
                """SELECT id FROM tax.returns
                     WHERE org_id=%s AND return_period_id=%s
                       AND return_type='gstr3b' AND status='draft'
                     ORDER BY revision DESC LIMIT 1""",
                (IDS["org"], return_period_id),
            )
            filing = cursor.fetchone()
        if filing is None:
            raise RuntimeError("destruction fixture lacks a draft GSTR-3B revision")
        return {
            "batch_id": batch_id,
            "batch_number": stock[3],
            "batch_status": stock[4],
            "location_id": str(stock[5]),
            "location_name": stock[6],
            "available_base_quantity": str(stock[0]),
            "inventory_value": str(stock[1]),
            "average_unit_cost": str(stock[2]),
            "input_credit_lot_count": stock[7],
            "remaining_cgst_amount": str(stock[9]),
            "remaining_sgst_amount": str(stock[10]),
            "remaining_igst_amount": str(stock[11]),
            "remaining_cess_amount": str(stock[12]),
            "sales_return_restoration_count": stock[13],
            "certificate_attachment_id": IDS["destruction_certificate_evidence"],
            "itc_reversal_evidence_attachment_id": IDS[
                "destruction_itc_reversal_evidence"
            ],
            "gst_registration_id": IDS["org_gst_registration"],
            "return_period_id": return_period_id,
            "gstr3b_return_id": str(filing[0]),
            "itc_reversal_rule_version_id": IDS["destruction_itc_rule_version"],
            "business_date": business_date.isoformat(),
        }


def reconcile_supplier_invoice(
    connection, resource_id: str, command_request_id: str
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT invoice.id,invoice.supplier_invoice_number,invoice.status,
                   invoice.net_value_total,invoice.cgst_total,invoice.sgst_total,
                   invoice.grand_total,line.id AS supplier_invoice_line_id,
                   allocation.id AS receipt_allocation_id,
                   item.id AS open_item_id,item.principal_amount AS original_amount,
                   item.principal_amount-coalesce((
                     SELECT sum(posted_allocation.amount)
                       FROM finance.allocations posted_allocation
                      WHERE posted_allocation.org_id=item.org_id
                        AND posted_allocation.open_item_id=item.id
                        AND posted_allocation.status='posted'
                   ),0) AS outstanding_amount,
                   count(DISTINCT tax_document.id) AS tax_document_count,
                   count(DISTINCT event.id) AS accounting_event_count
              FROM procurement.supplier_invoices AS invoice
              JOIN procurement.supplier_invoice_lines AS line
                ON line.org_id=invoice.org_id AND line.supplier_invoice_id=invoice.id
              JOIN procurement.supplier_invoice_receipt_allocations AS allocation
                ON allocation.org_id=invoice.org_id
               AND allocation.supplier_invoice_line_id=line.id
              JOIN finance.accounting_events AS event
                ON event.org_id=invoice.org_id AND event.supplier_invoice_id=invoice.id
              JOIN finance.open_items AS item
                ON item.org_id=invoice.org_id AND item.accounting_event_id=event.id
              LEFT JOIN tax.documents AS tax_document
                ON tax_document.org_id=invoice.org_id
               AND tax_document.supplier_invoice_id=invoice.id
             WHERE invoice.org_id=%s AND invoice.id=%s
             GROUP BY invoice.org_id,invoice.id,line.org_id,line.id,
                      allocation.org_id,allocation.id,item.org_id,item.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "posted" or row[12:] != (1, 1):
            raise RuntimeError("executed demo supplier invoice did not reconcile")
        columns = [item.name for item in cursor.description]
        result = {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }
        assert_calculation_totals(cursor, command_request_id, result)
        return result


def supplier_payment_payload(
    open_item_id: str, *, business_date: date
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    return {
        "idempotency_key": f"demo-supplier-payment-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "payment_date": business_date.isoformat(),
        "supplier_account_id": IDS["supplier_account"],
        "bank_account_id": IDS["bank_account"],
        "payment_method": "bank_transfer",
        "expected_gross_amount": "2000.00",
        "allocations": [{"open_item_id": open_item_id, "cash_amount": "2000.00"}],
        "external_reference": f"DEMO-NEFT-PAY-{os.getenv('GITHUB_RUN_ID', 'local')}",
    }


def reconcile_payment(
    connection,
    resource_id: str,
    expected_direction: str,
    expected_amount: str,
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT payment.id,payment.payment_number,payment.direction,payment.status,
                   payment.amount,count(DISTINCT allocation.id) AS allocation_count,
                   coalesce(sum(allocation.amount),0) AS allocated_total,
                   count(DISTINCT event.id) AS accounting_event_count
              FROM finance.payments AS payment
              JOIN finance.allocations AS allocation
                ON allocation.org_id=payment.org_id AND allocation.payment_id=payment.id
              JOIN finance.accounting_events AS event
                ON event.org_id=payment.org_id AND event.payment_id=payment.id
             WHERE payment.org_id=%s AND payment.id=%s
             GROUP BY payment.org_id,payment.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != expected_direction
            or row[3] != "posted"
            or row[4] != Decimal(expected_amount)
            or row[5] != 1
            or row[4] != row[6]
            or row[7] != 1
        ):
            raise RuntimeError("executed demo payment did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def seed_bank_reconciliation_ui_fixture(
    connection,
    payment_id: str,
) -> dict[str, str]:
    """Import one run-scoped statement line for an exact posted bank journal.

    The fixture is derived from the already-posted customer receipt. It uses
    the canonical bank parser command for the immutable statement line rather
    than inserting a reconciliation candidate directly. The live browser must
    still prepare, independently approve, and execute the reconciliation.
    """

    attachment_id = demo_ui_fixture_uuid("bank-statement-source")
    statement_id = demo_ui_fixture_uuid("bank-statement")
    statement_line_id = demo_ui_fixture_uuid("bank-statement-line")
    statement_reference = f"DEMO-UI-BANK-{DEMO_UI_FIXTURE_ID}"
    source_digest_text = f"canonical-demo-bank-statement:{DEMO_UI_FIXTURE_ID}"
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute(
            """
            SELECT journal.id,journal.journal_number,journal.posting_date,
                   bank_line.transaction_debit,bank_line.transaction_credit
              FROM finance.accounting_events event
              JOIN finance.journal_entries journal
                ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
               AND journal.status='posted'
              JOIN finance.journal_lines bank_line
                ON bank_line.org_id=journal.org_id
               AND bank_line.journal_entry_id=journal.id
               AND bank_line.account_id=%s
             WHERE event.org_id=%s AND event.payment_id=%s
               AND journal.transaction_currency='INR'
               AND journal.functional_currency='INR' AND journal.fx_rate=1
               AND journal.transaction_debit_total=journal.transaction_credit_total
               AND journal.functional_debit_total=journal.functional_credit_total
               AND ((bank_line.transaction_debit>0 AND bank_line.transaction_credit=0)
                 OR (bank_line.transaction_credit>0 AND bank_line.transaction_debit=0))
            """,
            (IDS["bank_ledger"], IDS["org"], payment_id),
        )
        journal_rows = cursor.fetchall()
        if len(journal_rows) != 1:
            raise RuntimeError(
                "demo receipt resolved an ambiguous posted bank-ledger journal"
            )
        journal_id, journal_number, posting_date, debit, credit = journal_rows[0]
        amount = Decimal(debit) if Decimal(debit) > 0 else Decimal(credit)
        direction = "credit" if Decimal(debit) > 0 else "debit"
        closing_balance = amount if direction == "credit" else -amount
        cursor.execute(
            """
            INSERT INTO core.attachments (
                org_id,id,storage_bucket,storage_object_path,original_filename,
                media_type,byte_size,sha256,evidence_kind,document_date,
                retention_until,status,verified_at,created_by_membership_id
            ) VALUES (
                %s,%s,'canonical-demo-evidence',%s,%s,'application/json',256,
                extensions.digest(%s,'sha256'),'bank_statement_import',%s,%s,
                'retained',transaction_timestamp(),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], attachment_id,
                f"demo/{DEMO_UI_FIXTURE_ID}/bank-statement.json",
                f"bank-statement-{DEMO_UI_FIXTURE_ID}.json",
                source_digest_text, posting_date,
                posting_date + timedelta(days=3650),
                IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO finance.bank_statements (
                org_id,id,bank_account_id,statement_reference,period_start,
                period_end,currency_code,opening_balance,closing_balance,
                source_attachment_id,source_sha256,status,
                created_by_membership_id,updated_by_membership_id
            ) VALUES (
                %s,%s,%s,%s,%s,%s,'INR',0,%s,%s,
                extensions.digest(%s,'sha256'),'imported',%s,%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], statement_id, IDS["bank_account"],
                statement_reference, posting_date, posting_date,
                closing_balance, attachment_id, source_digest_text,
                IDS["reviewer_membership"], IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            "SELECT erp_finance_commands.import_bank_statement_lines(%s,%s,%s::jsonb)",
            (
                IDS["org"], statement_id,
                json.dumps(
                    [{
                        "id": statement_line_id,
                        "line_number": 1,
                        "transaction_date": posting_date.isoformat(),
                        "value_date": posting_date.isoformat(),
                        "direction": direction,
                        "amount": format(amount, ".2f"),
                        "running_balance": format(closing_balance, ".2f"),
                        "bank_reference": journal_number,
                        "description": (
                            "Run-scoped canonical receipt bank statement evidence"
                        ),
                        "counterparty_name": "Canonical live18 customer",
                        "counterparty_account_hash": None,
                    }],
                    separators=(",", ":"),
                    sort_keys=True,
                ),
            ),
        )
        cursor.execute(
            """
            SELECT statement.id,line.id,journal.id,line.amount,line.direction
              FROM finance.bank_statements statement
              JOIN core.attachments source
                ON source.org_id=statement.org_id
               AND source.id=statement.source_attachment_id
               AND source.storage_object_path=%s
               AND source.evidence_kind='bank_statement_import'
               AND source.status IN ('verified','retained')
               AND source.sha256=statement.source_sha256
              JOIN finance.bank_statement_lines line
                ON line.org_id=statement.org_id
               AND line.bank_statement_id=statement.id
              JOIN finance.journal_entries journal
                ON journal.org_id=statement.org_id AND journal.id=%s
             WHERE statement.org_id=%s AND statement.id=%s
               AND statement.statement_reference=%s
               AND statement.status='imported'
               AND line.bank_reference=journal.journal_number
               AND line.transaction_date=journal.posting_date
               AND line.amount=%s AND line.direction=%s
            """,
            (
                f"demo/{DEMO_UI_FIXTURE_ID}/bank-statement.json",
                journal_id, IDS["org"], statement_id, statement_reference,
                amount, direction,
            ),
        )
        rows = cursor.fetchall()
        if len(rows) != 1:
            raise RuntimeError(
                "run-scoped bank statement did not reconcile to its exact journal"
            )
    return {
        "bank_statement_id": str(statement_id),
        "bank_statement_line_id": str(statement_line_id),
        "journal_entry_id": str(journal_id),
        "statement_reference": statement_reference,
        "journal_number": str(journal_number),
        "matched_amount": format(amount, ".2f"),
        "match_method": "reference_exact",
    }


def preflight_sales_order(payload: dict[str, Any], evidence_dir: Path) -> None:
    """Resolve and calculate without persisting, so live failures remain diagnosable."""
    backend_root = str(Path(__file__).resolve().parents[1])
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    from app.domain.operator_actions.contract import (
        PREPARE_PAYLOAD_MODELS,
        validate_prepare_payload_semantics,
    )

    validated_payload = PREPARE_PAYLOAD_MODELS["sales.order.prepare"].model_validate(
        payload
    )
    validate_prepare_payload_semantics("sales.order.prepare", validated_payload)
    payload = validated_payload.model_dump(mode="json", exclude_none=True)
    existing = existing_demo_command("sales.order.prepare", payload)
    if existing is not None:
        print(
            "canonical demo sales.order.prepare rollback preflight reused "
            f"{existing['status']} command {existing['command_request_id']}"
        )
        return
    identity = (
        f"aasopharma:{IDS['org']}:{IDS['operator_membership']}:sales.order.prepare:"
        f"{payload['idempotency_key']}"
    )
    order_id = uuid5(NAMESPACE_URL, identity + ":order")
    request_document = {
        key: value for key, value in payload.items() if key != "idempotency_key"
    }
    request_document["lines"] = [
        {
            **line,
            "line_id": str(uuid5(NAMESPACE_URL, identity + f":line:{index}")),
        }
        for index, line in enumerate(payload["lines"], start=1)
    ]
    request_document["charge_lines"] = [
        {
            **line,
            "line_id": str(
                uuid5(NAMESPACE_URL, identity + f":charge-line:{index}")
            ),
        }
        for index, line in enumerate(payload.get("charge_lines", ()), start=1)
    ]

    with database_connection("ERP_CALCULATOR_DATABASE_URL") as calculator:
        with calculator.cursor() as cursor:
            cursor.execute(
                """
                SELECT erp_automation_commands.resolve_sales_order_prepare(
                    %s, %s, %s, %s, %s, %s, %s::jsonb
                )
                """,
                (
                    IDS["org"],
                    IDS["operator_membership"],
                    IDS["operator_auth_user"],
                    IDS["operator_user"],
                    IDS["agent_grant"],
                    CLIENT_ID,
                    json.dumps(request_document, separators=(",", ":"), sort_keys=True),
                ),
            )
            resolution = cursor.fetchone()[0]
        calculator.rollback()

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from sqlalchemy.pool import NullPool

    from app.domain.operator_actions.contract import ACTION_POLICIES
    from app.domain.operator_actions.models import ActionContext
    from app.infrastructure.operator_actions.sales_order import calculation_documents
    from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService

    _calculation_input, calculation_output = calculation_documents(
        request_document, resolution, order_id=order_id
    )
    evidence = {
        "order_id": str(order_id),
        "supply_type": resolution["supply_type"],
        "ruleset_version": resolution["ruleset_version"],
        "resolved_line_count": len(resolution["lines"]),
        "totals": calculation_output["totals"],
    }
    (evidence_dir / "canonical-demo-sales-order-preflight.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    engine = create_engine(
        required("ERP_CALCULATOR_DATABASE_URL"),
        poolclass=NullPool,
        pool_pre_ping=True,
    )
    try:
        with engine.connect() as connection:
            outer_transaction = connection.begin()
            try:
                service = SqlAlchemyOperatorActionService(
                    calculator_factory=lambda: Session(
                        bind=connection, join_transaction_mode="create_savepoint"
                    ),
                    runtime_principal_configured=True,
                )
                try:
                    prepared = service.prepare(
                        policy=ACTION_POLICIES["sales.order.prepare"],
                        payload={
                            key: value
                            for key, value in payload.items()
                            if key != "idempotency_key"
                        },
                        idempotency_key=payload["idempotency_key"],
                        context=ActionContext(
                            auth_user_id=UUID(IDS["operator_auth_user"]),
                            user_id=UUID(IDS["operator_user"]),
                            organization_id=UUID(IDS["org"]),
                            membership_id=UUID(IDS["operator_membership"]),
                            agent_grant_id=UUID(IDS["agent_grant"]),
                            client_id=CLIENT_ID,
                            operation_key="sales.order.prepare",
                            permission="sales.order.create",
                            branch_ids=(UUID(IDS["branch"]),),
                            organization_scope=True,
                        ),
                    )
                except Exception as exc:
                    database_error = getattr(exc, "orig", exc)
                    raise RuntimeError(
                        "sales-order rollback persistence preflight failed: "
                        f"{type(database_error).__name__}: {database_error}"
                    ) from None
                if prepared.command_request_id is None or not prepared.preview_hash.startswith(
                    "sha256:"
                ):
                    raise RuntimeError("sales-order persistence preflight returned invalid evidence")
            finally:
                outer_transaction.rollback()
    finally:
        engine.dispose()
    print("canonical demo sales-order resolver, Decimal, and rollback persistence preflight passed")


def exercise_sales_order(
    evidence_dir: Path, payload: dict[str, Any]
) -> dict[str, Any]:
    existing = existing_demo_command("sales.order.prepare", payload)
    if existing is None:
        prepared = api_call(
            "POST", "/api/internal/mcp/actions/sales.order.prepare/prepare",
            "sales.order.prepare", "sales.order.create", payload,
        )
        prepared_replay = api_call(
            "POST", "/api/internal/mcp/actions/sales.order.prepare/prepare",
            "sales.order.prepare", "sales.order.create", payload,
        )
    else:
        prepared = existing
        prepared_replay = existing
    command_id = str(prepared["command_request_id"])
    preview_hash = str(prepared["preview_hash"])
    if (
        str(prepared_replay.get("command_request_id")) != command_id
        or str(prepared_replay.get("preview_hash")) != preview_hash
    ):
        raise RuntimeError("sales order prepare replay changed immutable evidence")
    resumed_status = api_call(
        "GET", f"/api/internal/mcp/commands/{command_id}",
        "automation.command.status.get", "automation.command.view",
        command_id=command_id,
    )
    if resumed_status.get("status") == "succeeded":
        if (
            str(resumed_status.get("command_request_id")) != command_id
            or str(resumed_status.get("preview_hash")) != preview_hash
            or not resumed_status.get("resource_id")
        ):
            raise RuntimeError("sales order resumed status changed immutable evidence")
        evidence = resumed_command_evidence(payload, prepared, resumed_status)
        (evidence_dir / "canonical-demo-sales-order.json").write_text(
            json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return evidence
    if resumed_status.get("status") not in {"prepared", "approved"}:
        raise RuntimeError(
            "sales order cannot resume command in "
            f"{resumed_status.get('status')} state"
        )
    approval_key = f"demo-approve-{os.getenv('GITHUB_RUN_ID', 'local')}"
    if resumed_status.get("status") == "approved":
        approved = resumed_status
        approved_replay = resumed_status
    else:
        approved = api_call(
            "POST", f"/api/internal/mcp/commands/{command_id}/approve",
            "automation.command.approve", "automation.command.approve",
            {
                "preview_hash": preview_hash,
                "approval_intent": "approve",
                "idempotency_key": approval_key,
            }, command_id,
        )
        approved_replay = api_call(
            "POST", f"/api/internal/mcp/commands/{command_id}/approve",
            "automation.command.approve", "automation.command.approve",
            {
                "preview_hash": preview_hash,
                "approval_intent": "approve",
                "idempotency_key": approval_key,
            }, command_id,
        )
        if (
            str(approved_replay.get("command_request_id")) != command_id
            or approved_replay.get("idempotency_replayed") is not True
        ):
            raise RuntimeError("sales order approval replay was not idempotent")
    execution_key = f"demo-execute-{os.getenv('GITHUB_RUN_ID', 'local')}"
    executed = api_call(
        "POST", f"/api/internal/mcp/commands/{command_id}/execute",
        "automation.command.execute", "automation.command.execute",
        {
            "preview_hash": preview_hash,
            "idempotency_key": execution_key,
        }, command_id,
    )
    executed_replay = api_call(
        "POST", f"/api/internal/mcp/commands/{command_id}/execute",
        "automation.command.execute", "automation.command.execute",
        {"preview_hash": preview_hash, "idempotency_key": execution_key},
        command_id,
    )
    if (
        str(executed_replay.get("command_request_id")) != command_id
        or str(executed_replay.get("resource_id")) != str(executed.get("resource_id"))
        or executed_replay.get("idempotency_replayed") is not True
    ):
        raise RuntimeError("sales order execution replay was not idempotent")
    evidence = {
        "payload": payload,
        "prepared": prepared,
        "prepared_replay": prepared_replay,
        "resumed_status": resumed_status,
        "approved": approved,
        "approved_replay": approved_replay,
        "executed": executed,
        "executed_replay": executed_replay,
    }
    (evidence_dir / "canonical-demo-sales-order.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return evidence


def reconcile(
    connection, execution: dict[str, Any], command_request_id: str
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT order_row.id, order_row.order_number, order_row.status,
                   order_row.subtotal, order_row.discount_total,
                   order_row.gst_taxable_total, order_row.cgst_total,
                   order_row.sgst_total, order_row.igst_total,
                   order_row.cess_total, order_row.rounding_adjustment,
                   order_row.grand_total,
                   (SELECT count(*)
                      FROM sales.order_lines AS line
                     WHERE line.org_id=order_row.org_id
                       AND line.order_id=order_row.id) AS line_count
              FROM sales.orders AS order_row
             WHERE order_row.org_id=%s AND order_row.id=%s
            """,
            (IDS["org"], execution["resource_id"]),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] not in SALES_ORDER_RECONCILABLE_STATUSES
            or row[-1] != 1
        ):
            raise RuntimeError("executed demo sales order did not reconcile")
        columns = [item.name for item in cursor.description]
        result = {column: str(value) if value is not None else None for column, value in zip(columns, row)}
        assert_calculation_totals(cursor, command_request_id, result)
        cursor.execute(
            """
            SELECT count(*) FROM calculation.artifacts
             WHERE org_id=%s AND sales_order_id=%s AND status='consumed'
            """,
            (IDS["org"], execution["resource_id"]),
        )
        result["consumed_calculation_artifacts"] = cursor.fetchone()[0]
        if result["consumed_calculation_artifacts"] != 1:
            raise RuntimeError("demo sales order lacks its consumed calculation authority")
        cursor.execute(
            """
            SELECT id FROM sales.order_lines
             WHERE org_id=%s AND order_id=%s ORDER BY line_number
            """,
            (IDS["org"], execution["resource_id"]),
        )
        result["line_ids"] = [str(row[0]) for row in cursor.fetchall()]
        return result


def resolve_fefo_dispatch_allocations(
    connection, *, business_date: date
) -> list[dict[str, str]]:
    business_date = require_business_date(business_date)
    billed_remaining = Decimal("12")
    free_remaining = Decimal("2")
    allocations: list[dict[str, str]] = []
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT batch.id,balance.on_hand_quantity,conversion.multiplier
              FROM inventory.stock_balances AS balance
              JOIN inventory.batches AS batch
                ON batch.org_id=balance.org_id AND batch.id=balance.batch_id
              JOIN catalog.uom_conversions AS conversion
                ON conversion.org_id=balance.org_id AND conversion.id=%s
             WHERE balance.org_id=%s AND balance.branch_id=%s
               AND balance.location_id=%s AND balance.product_id=%s
               AND balance.on_hand_quantity>0
               AND batch.lot_kind='manufacturer_batch'
               AND batch.status='released' AND batch.released_at IS NOT NULL
               AND batch.expires_on>%s
             ORDER BY batch.expires_on,batch.id
            """,
            (
                IDS["uom_conversion"], IDS["org"], IDS["branch"],
                IDS["saleable_location"], IDS["product"], business_date,
            ),
        )
        candidates = cursor.fetchall()

    for batch_id, on_hand_quantity, conversion_factor in candidates:
        available = Decimal(on_hand_quantity) / Decimal(conversion_factor)
        billed = min(billed_remaining, available)
        billed_remaining -= billed
        available -= billed
        free = min(free_remaining, available)
        free_remaining -= free
        if billed > 0 or free > 0:
            allocations.append(
                {
                    "batch_id": str(batch_id),
                    "billed_quantity": str(billed),
                    "free_quantity": str(free),
                }
            )
        if billed_remaining == 0 and free_remaining == 0:
            break
    if billed_remaining != 0 or free_remaining != 0:
        raise RuntimeError("demo FEFO stock cannot fulfill the sales dispatch")
    return allocations


def sales_dispatch_payload(
    sales_order_id: str,
    sales_order_line_id: str,
    batch_allocations: list[dict[str, str]],
    *,
    business_date: date,
    requested_delivery_date: str,
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    if not isinstance(requested_delivery_date, str):
        raise ValueError(
            "sales dispatch requires the approved order requested delivery date"
        )
    try:
        planned_delivery_date = date.fromisoformat(requested_delivery_date)
    except ValueError as error:
        raise ValueError(
            "sales dispatch requires the approved order requested delivery date"
        ) from error
    if planned_delivery_date.isoformat() != requested_delivery_date:
        raise ValueError(
            "sales dispatch requires the canonical requested delivery date"
        )
    if planned_delivery_date < business_date:
        raise ValueError(
            "sales dispatch requested delivery date precedes the business date"
        )
    return {
        "idempotency_key": f"demo-sales-dispatch-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "dispatch_date": business_date.isoformat(),
        "sales_order_id": sales_order_id,
        "from_location_id": IDS["saleable_location"],
        "lines": [
            {
                "sales_order_line_id": sales_order_line_id,
                "billed_quantity": "12",
                "free_quantity": "2",
                "batch_allocations": batch_allocations,
            }
        ],
        "logistics": {
            "transport_mode": "road",
            "distance_km": "18.50",
            "transporter_party_id": IDS["supplier_party"],
            "vehicle_number": "MH01DE2026",
            "vehicle_type": "regular",
            "transport_document_number": f"DEMO-DC-{os.getenv('GITHUB_RUN_ID', 'local')}",
            "transport_document_date": business_date.isoformat(),
        },
    }


def reconcile_sales_dispatch(
    connection,
    resource_id: str,
    *,
    expected_billed_quantity: str,
    expected_free_quantity: str,
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT dispatch.id,dispatch.dispatch_number,dispatch.status,
                   document.id AS inventory_document_id,
                   count(DISTINCT ledger.id) AS ledger_count,
                   coalesce(sum(ledger.value_delta),0) AS inventory_value_delta,
                   count(DISTINCT event.id) AS valuation_event_count
              FROM sales.dispatches AS dispatch
              JOIN inventory.inventory_documents AS document
                ON document.org_id=dispatch.org_id AND document.sales_dispatch_id=dispatch.id
              JOIN inventory.stock_ledger_entries AS ledger
                ON ledger.org_id=document.org_id AND ledger.inventory_document_id=document.id
              JOIN finance.accounting_events AS event
                ON event.org_id=document.org_id
               AND event.inventory_document_id=document.id
               AND event.event_type='inventory_valuation'
             WHERE dispatch.org_id=%s AND dispatch.id=%s
             GROUP BY dispatch.org_id,dispatch.id,document.org_id,document.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "posted" or row[4] < 1 or row[5] >= 0 or row[6] != 1:
            raise RuntimeError("executed demo sales dispatch did not reconcile")
        columns = [item.name for item in cursor.description]
        result = {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }
        cursor.execute(
            """
            SELECT line.id AS dispatch_line_id,line.line_number,line.batch_id,
                   line.billed_quantity,line.free_quantity,line.base_billed_quantity,
                   line.base_free_quantity,inventory_line.id AS inventory_line_id,
                   inventory_line.base_quantity,inventory_line.unit_cost,
                   inventory_line.extended_cost,ledger.quantity_delta,ledger.value_delta
              FROM sales.dispatch_lines AS line
              JOIN inventory.inventory_document_lines AS inventory_line
                ON inventory_line.org_id=line.org_id
               AND inventory_line.inventory_document_id=%s
               AND inventory_line.sales_dispatch_line_id=line.id
              JOIN inventory.stock_ledger_entries AS ledger
                ON ledger.org_id=inventory_line.org_id
               AND ledger.inventory_document_line_id=inventory_line.id
               AND ledger.entry_kind='issue'
             WHERE inventory_line.org_id=%s
               AND line.dispatch_id=%s
             ORDER BY line.line_number,line.id
            """,
            (result["inventory_document_id"], IDS["org"], resource_id),
        )
        columns = [item.name for item in cursor.description]
        dispatched_lines = [dict(zip(columns, item)) for item in cursor.fetchall()]
        if not dispatched_lines or len(dispatched_lines) != int(result["ledger_count"]):
            raise RuntimeError("executed demo sales dispatch lacks batch lineage")
        if sum(
            (Decimal(str(line["billed_quantity"])) for line in dispatched_lines),
            Decimal("0"),
        ) != Decimal(expected_billed_quantity) or sum(
            (Decimal(str(line["free_quantity"])) for line in dispatched_lines),
            Decimal("0"),
        ) != Decimal(expected_free_quantity):
            raise RuntimeError("executed demo sales dispatch quantities changed")
        for line in dispatched_lines:
            if (
                line["base_quantity"] != line["base_billed_quantity"] + line["base_free_quantity"]
                or line["quantity_delta"] != -line["base_quantity"]
                or line["value_delta"] != -line["extended_cost"]
            ):
                raise RuntimeError("executed demo sales dispatch batch quantities or values differ")
        result["dispatch_lines"] = [
            {key: str(value) if value is not None else None for key, value in line.items()}
            for line in dispatched_lines
        ]
        return result


def sales_invoice_payload(
    dispatch_lines: list[dict[str, str]],
    delivery_address_row_version: int,
    *,
    business_date: date,
) -> dict[str, Any]:
    if (
        isinstance(delivery_address_row_version, bool)
        or delivery_address_row_version < 1
    ):
        raise ValueError("delivery address row version must be a positive integer")
    business_date = require_business_date(business_date)
    return {
        "idempotency_key": f"demo-sales-invoice-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "invoice_date": business_date.isoformat(),
        "customer_account_id": IDS["customer_account"],
        "delivery_address_id": IDS["customer_address"],
        "delivery_address_row_version": str(delivery_address_row_version),
        "tax_charge_mechanism": "normal",
        "document_discount": {
            "document_discount_kind": "amount",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "25.00",
        },
        "rounding_policy": "nearest_rupee",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["uom_conversion"],
                "billed_quantity": "12",
                "free_quantity": "2",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "125.5000",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "percent",
                    "line_discount_basis": "taxable_value",
                    "line_discount_value": "7.5",
                },
                "document_discount_eligible": True,
                "fulfillment_source": "dispatch_allocated",
                "dispatch_allocations": [
                    {
                        "dispatch_line_id": line["dispatch_line_id"],
                        "allocated_base_billed_quantity": line["base_billed_quantity"],
                        "allocated_base_free_quantity": line["base_free_quantity"],
                    }
                    for line in dispatch_lines
                ],
            }
        ],
    }


def reconcile_sales_invoice(
    connection, resource_id: str, command_request_id: str
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT erp_security.activate_context(%s, %s)", (IDS["reviewer_auth_user"], IDS["org"]))
        cursor.execute(
            """
            SELECT invoice.id,invoice.invoice_number,invoice.status,
                   invoice.net_value_total,invoice.cgst_total,invoice.sgst_total,
                   invoice.rounding_adjustment,invoice.grand_total,
                   line.id AS invoice_line_id,line.uom_conversion_factor,
                   item.id AS open_item_id,
                   item.principal_amount-coalesce((
                     SELECT sum(posted_allocation.amount)
                       FROM finance.allocations posted_allocation
                      WHERE posted_allocation.org_id=item.org_id
                        AND posted_allocation.open_item_id=item.id
                        AND posted_allocation.status='posted'
                   ),0) AS outstanding_amount,
                   count(DISTINCT tax_document.id) AS tax_document_count,
                   count(DISTINCT event.id) AS accounting_event_count
              FROM sales.invoices AS invoice
              JOIN sales.invoice_lines AS line
                ON line.org_id=invoice.org_id AND line.invoice_id=invoice.id
              JOIN finance.accounting_events AS event
                ON event.org_id=invoice.org_id AND event.sales_invoice_id=invoice.id
              JOIN finance.open_items AS item
                ON item.org_id=invoice.org_id AND item.accounting_event_id=event.id
              LEFT JOIN tax.documents AS tax_document
                ON tax_document.org_id=invoice.org_id AND tax_document.sales_invoice_id=invoice.id
             WHERE invoice.org_id=%s AND invoice.id=%s
             GROUP BY invoice.org_id,invoice.id,line.org_id,line.id,
                      item.org_id,item.id
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if row is None or row[2] != "posted" or row[12:] != (1, 1):
            raise RuntimeError("executed demo sales invoice did not reconcile")
        columns = [item.name for item in cursor.description]
        result = {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }
        assert_calculation_totals(cursor, command_request_id, result)
        cursor.execute(
            """
            SELECT allocation.id AS invoice_dispatch_allocation_id,
                   allocation.dispatch_line_id,allocation.allocated_base_billed_quantity,
                   allocation.allocated_base_free_quantity,dispatch_line.batch_id
              FROM sales.invoice_dispatch_allocations AS allocation
              JOIN sales.dispatch_lines AS dispatch_line
                ON dispatch_line.org_id=allocation.org_id AND dispatch_line.id=allocation.dispatch_line_id
             WHERE allocation.org_id=%s AND allocation.invoice_line_id=%s
             ORDER BY dispatch_line.line_number,allocation.id
            """,
            (IDS["org"], result["invoice_line_id"]),
        )
        allocation_columns = [item.name for item in cursor.description]
        allocations = [dict(zip(allocation_columns, item)) for item in cursor.fetchall()]
        if not allocations:
            raise RuntimeError("executed demo sales invoice lacks dispatch allocations")
        result["dispatch_allocations"] = [
            {
                **{key: str(value) if value is not None else None for key, value in allocation.items()},
                "uom_conversion_factor": result["uom_conversion_factor"],
            }
            for allocation in allocations
        ]
        return result


def customer_receipt_payload(
    open_item_id: str, *, business_date: date
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    return {
        "idempotency_key": f"demo-customer-receipt-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "payment_date": business_date.isoformat(),
        "customer_account_id": IDS["customer_account"],
        "bank_account_id": IDS["bank_account"],
        "payment_method": "upi",
        "receipt_purpose": "invoice_settlement",
        "amount": "500.00",
        "allocations": [{"open_item_id": open_item_id, "amount": "500.00"}],
        "external_reference": f"DEMO-UPI-RECEIPT-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "evidence_attachment_id": IDS["customer_receipt_evidence"],
    }


def sales_return_payload(
    invoice_id: str,
    invoice_line_id: str,
    dispatch_allocations: list[dict[str, str]],
    *,
    business_date: date,
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    allocation = max(
        dispatch_allocations,
        key=lambda item: Decimal(item["allocated_base_billed_quantity"]),
    )
    conversion_factor = Decimal(allocation["uom_conversion_factor"])
    billed_quantity = min(
        Decimal("4"),
        Decimal(allocation["allocated_base_billed_quantity"]) / conversion_factor,
    )
    if billed_quantity <= 0:
        raise RuntimeError("demo invoice has no billed dispatch quantity available to return")
    return {
        "idempotency_key": f"demo-sales-return-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "return_date": business_date.isoformat(),
        "original_invoice_id": invoice_id,
        "reason_code": "customer_rejection",
        "gst_tax_treatment": "statutory",
        "recipient_itc_reversal_evidence_attachment_id": IDS["recipient_itc_evidence"],
        "recipient_itc_reversal_confirmed_at": datetime.now(timezone.utc).isoformat(),
        "lines": [
            {
                "original_invoice_line_id": invoice_line_id,
                "invoice_dispatch_allocation_id": allocation["invoice_dispatch_allocation_id"],
                "billed_quantity": str(billed_quantity),
                "free_quantity": "0",
                "batch_allocation": {
                    "batch_id": allocation["batch_id"],
                    "billed_quantity": str(billed_quantity),
                    "free_quantity": "0",
                },
                "to_location_id": IDS["quarantine_location"],
                "return_condition": "opened",
            }
        ],
    }


def reconcile_sales_return(
    connection, resource_id: str, command_request_id: str
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT returned.id,returned.return_number,returned.status,
                   returned.gst_tax_treatment,returned.grand_total,
                   line.id AS return_line_id,line.base_billed_quantity,
                   line.base_free_quantity,document.id AS inventory_document_id,
                   note.id AS adjustment_note_id,
                   (SELECT count(*) FROM tax.documents tax_document
                     WHERE tax_document.org_id=returned.org_id
                       AND tax_document.adjustment_note_id=note.id) AS tax_document_count,
                   (SELECT count(*) FROM finance.accounting_events event
                     WHERE event.org_id=returned.org_id
                       AND event.adjustment_note_id=note.id) AS accounting_event_count,
                   (SELECT count(*) FROM finance.allocations allocation
                     WHERE allocation.org_id=returned.org_id
                       AND allocation.adjustment_note_id=note.id) AS allocation_count,
                   (SELECT coalesce(sum(ledger.quantity_delta),0)
                      FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=returned.org_id
                       AND ledger.inventory_document_id=document.id) AS stock_quantity_delta,
                   returned.net_value_total,returned.gst_taxable_total,
                   returned.cgst_total,returned.sgst_total,returned.igst_total,
                   returned.cess_total,returned.recipient_assessed_tax_total,
                   returned.rounding_adjustment
              FROM sales.returns returned
              JOIN sales.return_lines line
                ON line.org_id=returned.org_id AND line.return_id=returned.id
              JOIN inventory.inventory_documents document
                ON document.org_id=returned.org_id AND document.sales_return_id=returned.id
              JOIN finance.adjustment_notes note
                ON note.org_id=returned.org_id AND note.sales_return_id=returned.id
             WHERE returned.org_id=%s AND returned.id=%s
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != "posted"
            or row[3] != "statutory"
            or row[10:13] != (1, 1, 1)
            or row[13] != row[6] + row[7]
        ):
            raise RuntimeError("executed demo sales return did not reconcile")
        columns = [item.name for item in cursor.description]
        result = {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }
        assert_calculation_totals(cursor, command_request_id, result)
        return result


def purchase_return_payload(
    supplier_invoice_id: str,
    goods_receipt_line_id: str,
    receipt_allocation_id: str,
    batch_id: str,
    portal_evidence: dict[str, str],
    *,
    business_date: date,
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    return {
        "idempotency_key": f"demo-purchase-return-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "return_date": business_date.isoformat(),
        "return_source_kind": "invoiced",
        "original_supplier_invoice_id": supplier_invoice_id,
        "supplier_credit_note_portal_line_id": portal_evidence[
            "supplier_credit_note_portal_line_id"
        ],
        "reason_code": "wrong_supply",
        "gst_tax_treatment": "statutory",
        "supplier_destination_address_id": IDS["supplier_address"],
        "logistics": {
            "transport_mode": "road",
            "distance_km": "18.50",
            "transporter_party_id": IDS["supplier_party"],
            "vehicle_number": "MH01PR2026",
            "vehicle_type": "regular",
            "transport_document_number": f"DEMO-PR-DC-{os.getenv('GITHUB_RUN_ID', 'local')}",
            "transport_document_date": business_date.isoformat(),
        },
        "lines": [
            {
                "goods_receipt_line_id": goods_receipt_line_id,
                "supplier_invoice_receipt_allocation_id": receipt_allocation_id,
                "billed_quantity": "10",
                "free_quantity": "0",
                "batch_allocation": {
                    "batch_id": batch_id,
                    "billed_quantity": "10",
                    "free_quantity": "0",
                },
                "from_location_id": IDS["saleable_location"],
            }
        ],
    }


def reconcile_purchase_return(
    connection, resource_id: str, command_request_id: str
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT returned.id,returned.purchase_return_number,returned.status,
                   returned.gst_tax_treatment,returned.grand_total,
                   line.id AS return_line_id,line.base_billed_quantity,
                   line.base_free_quantity,document.id AS inventory_document_id,
                   note.id AS adjustment_note_id,
                   (SELECT count(*) FROM tax.documents tax_document
                     WHERE tax_document.org_id=returned.org_id
                       AND tax_document.adjustment_note_id=note.id) AS tax_document_count,
                   (SELECT count(*) FROM finance.accounting_events event
                     WHERE event.org_id=returned.org_id
                       AND event.adjustment_note_id=note.id) AS accounting_event_count,
                   (SELECT count(*) FROM finance.allocations allocation
                     WHERE allocation.org_id=returned.org_id
                       AND allocation.adjustment_note_id=note.id) AS allocation_count,
                   (SELECT coalesce(sum(ledger.quantity_delta),0)
                      FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=returned.org_id
                       AND ledger.inventory_document_id=document.id) AS stock_quantity_delta,
                   returned.net_value_total,returned.gst_taxable_total,
                   returned.cgst_total,returned.sgst_total,returned.igst_total,
                   returned.cess_total,returned.recipient_assessed_tax_total,
                   returned.rounding_adjustment
              FROM procurement.purchase_returns returned
              JOIN procurement.purchase_return_lines line
                ON line.org_id=returned.org_id AND line.purchase_return_id=returned.id
              JOIN inventory.inventory_documents document
                ON document.org_id=returned.org_id
               AND document.purchase_return_id=returned.id
              JOIN finance.adjustment_notes note
                ON note.org_id=returned.org_id AND note.purchase_return_id=returned.id
             WHERE returned.org_id=%s AND returned.id=%s
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != "posted"
            or row[3] != "statutory"
            or row[10:13] != (1, 1, 1)
            or row[13] != -(row[6] + row[7])
        ):
            raise RuntimeError("executed demo purchase return did not reconcile")
        columns = [item.name for item in cursor.description]
        result = {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }
        assert_calculation_totals(cursor, command_request_id, result)
        return result


def inventory_adjustment_payload(
    batch_id: str,
    counted_base_quantity: str,
    stock_balance_row_version: int,
    *,
    business_date: date,
) -> dict[str, Any]:
    business_date = require_business_date(business_date)
    counted_instant = datetime.now(timezone.utc)
    counted_at = counted_instant.isoformat()
    counted_packs = str(
        (Decimal(counted_base_quantity) + Decimal("1")) / Decimal("10")
    )
    return {
        "idempotency_key": f"demo-inventory-adjustment-{os.getenv('GITHUB_RUN_ID', 'local')}",
        "branch_id": IDS["branch"],
        "adjustment_date": business_date.isoformat(),
        "counted_at": counted_at,
        "counted_by_membership_id": IDS["operator_membership"],
        "location_id": IDS["saleable_location"],
        "reason_code": "cycle_count",
        "evidence_attachment_id": IDS["cycle_count_evidence"],
        "lines": [
            {
                "product_id": IDS["product"],
                "uom_conversion_id": IDS["count_uom_conversion"],
                "batch_counts": [
                    {
                        "batch_id": batch_id,
                        "counted_quantity": counted_packs,
                        "stock_balance_row_version": stock_balance_row_version,
                    }
                ],
            }
        ],
    }


def reconcile_inventory_adjustment(connection, resource_id: str) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT document.id,document.document_number,document.status,
                   document.total_abs_base_quantity,document.total_value,
                   line.variance_quantity,line.extended_cost,
                   (SELECT count(*) FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=document.org_id
                       AND ledger.inventory_document_id=document.id
                       AND ledger.entry_kind='count_gain') AS count_gain_entries,
                   (SELECT count(*) FROM finance.accounting_events event
                     WHERE event.org_id=document.org_id
                       AND event.inventory_document_id=document.id
                       AND event.event_type='inventory_valuation') AS valuation_events
              FROM inventory.inventory_documents document
              JOIN inventory.inventory_document_lines line
                ON line.org_id=document.org_id AND line.inventory_document_id=document.id
             WHERE document.org_id=%s AND document.id=%s
            """,
            (IDS["org"], resource_id),
        )
        row = cursor.fetchone()
        if (
            row is None
            or row[2] != "posted"
            or row[5] != Decimal("1")
            or row[4] != row[6]
            or row[7:] != (1, 1)
        ):
            raise RuntimeError("executed demo inventory adjustment did not reconcile")
        columns = [item.name for item in cursor.description]
        return {
            key: str(value) if value is not None else None
            for key, value in zip(columns, row)
        }


def current_saleable_balance(connection, batch_id: str) -> tuple[str, int]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT on_hand_quantity,row_version
              FROM inventory.stock_balances
             WHERE org_id=%s AND branch_id=%s AND location_id=%s
               AND product_id=%s AND batch_id=%s
            """,
            (
                IDS["org"], IDS["branch"], IDS["saleable_location"],
                IDS["product"], batch_id,
            ),
        )
        row = cursor.fetchone()
        if row is None or row[0] <= 0:
            raise RuntimeError("demo saleable batch balance is unavailable")
        return str(row[0]), int(row[1])


def seed_live18_cycle_count_evidence(
    connection, *, business_date: date
) -> dict[str, str]:
    """Create the unused, run-bound cycle-count sheet for browser acceptance."""

    business_date = require_business_date(business_date)
    attachment_id = LIVE18_CYCLE_COUNT_AUTHORITY.attachment_id
    storage_object_path = LIVE18_CYCLE_COUNT_AUTHORITY.storage_object_path
    original_filename = LIVE18_CYCLE_COUNT_AUTHORITY.original_filename
    digest_input = LIVE18_CYCLE_COUNT_AUTHORITY.digest_input
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        for setting, value in (
            ("app.org_id", IDS["org"]),
            ("app.membership_id", IDS["reviewer_membership"]),
            ("app.user_id", IDS["reviewer_user"]),
            ("app.auth_user_id", IDS["reviewer_auth_user"]),
            ("app.request_id", IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute(
            """
            INSERT INTO core.attachments (
                org_id,id,storage_bucket,storage_object_path,original_filename,
                media_type,byte_size,sha256,evidence_kind,document_date,
                retention_until,status,verified_at,created_by_membership_id
            ) VALUES (
                %s,%s,'canonical-demo-evidence',%s,%s,'application/json',128,
                extensions.digest(%s,'sha256'),'inventory_cycle_count_sheet',
                %s,%s,'retained',transaction_timestamp(),%s
            ) ON CONFLICT (org_id,id) DO NOTHING
            """,
            (
                IDS["org"], attachment_id, storage_object_path,
                original_filename, digest_input, business_date,
                business_date + timedelta(days=3650),
                IDS["reviewer_membership"],
            ),
        )
        cursor.execute(
            """
            SELECT id::text
              FROM core.attachments
             WHERE org_id=%s AND id=%s AND storage_bucket='canonical-demo-evidence'
               AND storage_object_path=%s AND original_filename=%s
               AND evidence_kind='inventory_cycle_count_sheet'
               AND document_date=%s AND status='retained'
               AND verified_at IS NOT NULL
               AND sha256=extensions.digest(%s,'sha256')
               AND retention_until>=%s
               AND NOT erp_automation_reads.active_command_evidence_in_use(
                   org_id,'inventory.adjustment.prepare',
                   'evidence_attachment_id',id
               )
            """,
            (
                IDS["org"], attachment_id, storage_object_path,
                original_filename, business_date, digest_input,
                business_date,
            ),
        )
        row = cursor.fetchone()
        if row != (attachment_id,):
            raise RuntimeError(
                "run-bound Live18 cycle-count evidence did not remain unused"
            )
    return {
        "attachment_id": attachment_id,
        "storage_object_path": storage_object_path,
    }


def reconcile_party_master(connection) -> dict[str, Any]:
    """Prove customer and supplier contact facts through the runtime RLS path."""
    expected = {
        IDS["customer_contact"]: (IDS["customer_party"], "business", True, False),
        IDS["supplier_contact"]: (IDS["supplier_party"], "billing", False, True),
    }
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT contact.id,contact.party_id,contact.contact_kind,contact.name,
                   contact.designation,contact.email,contact.phone,
                   contact.is_primary,contact.status,
                   EXISTS (
                       SELECT 1 FROM parties.customer_accounts customer
                        WHERE customer.org_id=contact.org_id
                          AND customer.party_id=contact.party_id
                          AND customer.status='active'
                   ) AS has_customer_account,
                   EXISTS (
                       SELECT 1 FROM parties.supplier_accounts supplier
                        WHERE supplier.org_id=contact.org_id
                          AND supplier.party_id=contact.party_id
                          AND supplier.status='active'
                   ) AS has_supplier_account,
                   (SELECT count(*) FROM parties.addresses address
                     WHERE address.org_id=contact.org_id
                       AND address.party_id=contact.party_id
                       AND address.status='active') AS active_address_count,
                   (SELECT count(*) FROM parties.tax_registrations registration
                     WHERE registration.org_id=contact.org_id
                       AND registration.party_id=contact.party_id
                       AND registration.status='active') AS active_tax_registration_count
              FROM parties.contacts contact
             WHERE contact.org_id=%s AND contact.id=ANY(CAST(%s AS uuid[]))
             ORDER BY contact.id
            """,
            (IDS["org"], list(expected)),
        )
        columns = [item.name for item in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    if len(rows) != len(expected):
        raise RuntimeError("demo customer and supplier contacts are not both RLS-visible")
    for row in rows:
        expected_party, expected_kind, customer_role, supplier_role = expected[
            str(row["id"])
        ]
        if (
            str(row["party_id"]) != expected_party
            or row["contact_kind"] != expected_kind
            or not row["name"]
            or not row["designation"]
            or not str(row["email"]).endswith("@example.invalid")
            or re.fullmatch(r"[6-9][0-9]{9}", str(row["phone"])) is None
            or row["is_primary"] is not True
            or row["status"] != "active"
            or row["has_customer_account"] is not customer_role
            or row["has_supplier_account"] is not supplier_role
            or row["active_address_count"] < 1
            or row["active_tax_registration_count"] < 1
        ):
            raise RuntimeError(f"demo party contact master did not reconcile: {row}")
    return {
        "contact_count": len(rows),
        "contacts": [
            {
                key: str(value) if value is not None else None
                for key, value in row.items()
                if key not in {"email", "phone"}
            }
            for row in rows
        ],
    }


def reconcile_cross_table_invariants(
    connection,
    *,
    command_ids: list[str],
) -> dict[str, Any]:
    """Reconcile the exact demo run across durable ledgers and projections."""
    expected_command_count = len(command_ids)
    if expected_command_count < 1 or len(set(command_ids)) != expected_command_count:
        raise RuntimeError("demo cross-table audit requires unique command requests")
    result: dict[str, Any] = {"command_count": expected_command_count}
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s, %s)",
            (IDS["reviewer_auth_user"], IDS["org"]),
        )
        cursor.execute(
            """
            SELECT count(*) AS command_count,
                   count(*) FILTER (WHERE command.status='succeeded') AS succeeded_count,
                   count(*) FILTER (WHERE command.result_resource_id IS NULL) AS missing_result_count,
                   count(*) FILTER (WHERE NOT EXISTS (
                       SELECT 1 FROM automation.command_approvals approval
                        WHERE approval.org_id=command.org_id
                          AND approval.command_request_id=command.id
                          AND approval.decision='approved'
                          AND approval.preview_hash=command.preview_hash
                          AND approval.aggregate_version_hash=command.aggregate_version_hash
                   )) AS missing_approval_count,
                   count(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM core.audit_events audit
                        WHERE audit.org_id=command.org_id
                          AND audit.command_request_id=command.id
                   )) AS audited_command_count,
                   count(*) FILTER (
                       WHERE command.calculation_hash IS NOT NULL
                   ) AS calculation_command_count,
                   min(command.created_at) AS first_command_at
              FROM automation.command_requests command
             WHERE command.org_id=%s AND command.id=ANY(CAST(%s AS uuid[]))
            """,
            (IDS["org"], command_ids),
        )
        command_row = cursor.fetchone()
        if (
            command_row[:5]
            != (
                expected_command_count,
                expected_command_count,
                0,
                0,
                expected_command_count,
            )
            or command_row[5] < 1
            or command_row[6] is None
        ):
            raise RuntimeError(
                f"demo command, approval, and audit evidence did not reconcile: {command_row}"
            )
        result.update(
            {
                "succeeded_command_count": command_row[1],
                "audited_command_count": command_row[4],
            }
        )
        started_at = command_row[6]

        cursor.execute(
            """
            SELECT count(*) AS artifact_count,
                   count(*) FILTER (WHERE status<>'consumed') AS nonconsumed_count,
                   count(*) FILTER (
                       WHERE octet_length(authority_hash)<>32
                          OR octet_length(request_sha256)<>32
                   ) AS invalid_hash_count
              FROM calculation.artifacts
             WHERE org_id=%s AND command_request_id=ANY(CAST(%s AS uuid[]))
            """,
            (IDS["org"], command_ids),
        )
        artifact_row = cursor.fetchone()
        if artifact_row != (command_row[5], 0, 0):
            raise RuntimeError(
                f"demo calculation authority did not reconcile: {artifact_row}"
            )
        result["consumed_calculation_artifact_count"] = artifact_row[0]

        cursor.execute(
            """
            WITH journal_totals AS (
                SELECT journal.id,journal.status,
                       journal.transaction_debit_total,
                       journal.transaction_credit_total,
                       journal.functional_debit_total,
                       journal.functional_credit_total,
                       count(line.id) AS line_count,
                       coalesce(sum(line.transaction_debit),0) AS line_transaction_debit,
                       coalesce(sum(line.transaction_credit),0) AS line_transaction_credit,
                       coalesce(sum(line.functional_debit),0) AS line_functional_debit,
                       coalesce(sum(line.functional_credit),0) AS line_functional_credit
                  FROM finance.accounting_events event
                  JOIN finance.journal_entries journal
                    ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
                  JOIN finance.journal_lines line
                    ON line.org_id=journal.org_id AND line.journal_entry_id=journal.id
                 WHERE event.org_id=%s AND event.occurred_at>=%s
                 GROUP BY journal.org_id,journal.id
            )
            SELECT count(*) AS journal_count,
                   count(*) FILTER (
                       WHERE status<>'posted' OR line_count<2
                          OR transaction_debit_total<>transaction_credit_total
                          OR functional_debit_total<>functional_credit_total
                          OR transaction_debit_total<>line_transaction_debit
                          OR transaction_credit_total<>line_transaction_credit
                          OR functional_debit_total<>line_functional_debit
                          OR functional_credit_total<>line_functional_credit
                   ) AS invalid_journal_count
              FROM journal_totals
            """,
            (IDS["org"], started_at),
        )
        journal_row = cursor.fetchone()
        if journal_row[0] < 9 or journal_row[1] != 0:
            raise RuntimeError(f"demo journals did not reconcile: {journal_row}")
        result["balanced_posted_journal_count"] = journal_row[0]

        cursor.execute(
            """
            WITH settlement AS (
                SELECT item.id,item.principal_amount,item.status,
                       coalesce(sum(allocation.amount) FILTER (
                           WHERE allocation.status='posted'
                       ),0) AS allocated_amount
                  FROM finance.open_items item
                  LEFT JOIN finance.allocations allocation
                    ON allocation.org_id=item.org_id AND allocation.open_item_id=item.id
                 WHERE item.org_id=%s AND item.created_at>=%s
                 GROUP BY item.org_id,item.id
            )
            SELECT count(*) AS open_item_count,
                   count(*) FILTER (
                       WHERE allocated_amount>principal_amount
                          OR (allocated_amount=principal_amount AND status<>'settled')
                          OR (allocated_amount<principal_amount AND status<>'open')
                   ) AS invalid_open_item_count
              FROM settlement
            """,
            (IDS["org"], started_at),
        )
        open_item_row = cursor.fetchone()
        if open_item_row[0] < 3 or open_item_row[1] != 0:
            raise RuntimeError(f"demo open items did not reconcile: {open_item_row}")
        result["reconciled_open_item_count"] = open_item_row[0]

        cursor.execute(
            """
            SELECT count(*) AS allocation_count,
                   count(*) FILTER (
                       WHERE amount<=0 OR functional_amount<=0 OR currency_code<>'INR'
                          OR num_nonnulls(payment_id,withholding_id,adjustment_note_id,
                                          purchase_order_advance_allocation_id)<>1
                   ) AS invalid_allocation_count
              FROM finance.allocations
             WHERE org_id=%s AND created_at>=%s
            """,
            (IDS["org"], started_at),
        )
        allocation_row = cursor.fetchone()
        if allocation_row[0] < 4 or allocation_row[1] != 0:
            raise RuntimeError(f"demo allocations did not reconcile: {allocation_row}")
        result["reconciled_allocation_count"] = allocation_row[0]

        cursor.execute(
            """
            WITH ledger AS (
                SELECT org_id,branch_id,location_id,product_id,batch_id,
                       sum(quantity_delta) AS on_hand_quantity,
                       sum(value_delta) AS inventory_value
                  FROM inventory.stock_ledger_entries
                 WHERE org_id=%s
                 GROUP BY org_id,branch_id,location_id,product_id,batch_id
            ), compared AS (
                SELECT coalesce(ledger.location_id,balance.location_id) AS location_id,
                       coalesce(ledger.product_id,balance.product_id) AS product_id,
                       coalesce(ledger.batch_id,balance.batch_id) AS batch_id,
                       ledger.on_hand_quantity AS ledger_quantity,
                       balance.on_hand_quantity AS balance_quantity,
                       ledger.inventory_value AS ledger_value,
                       balance.inventory_value AS balance_value
                  FROM ledger
                  FULL JOIN inventory.stock_balances balance
                    ON balance.org_id=ledger.org_id
                   AND balance.branch_id=ledger.branch_id
                   AND balance.location_id=ledger.location_id
                   AND balance.product_id=ledger.product_id
                   AND balance.batch_id=ledger.batch_id
                 WHERE coalesce(balance.org_id,ledger.org_id)=%s
            )
            SELECT count(*) AS stock_position_count,
                   count(*) FILTER (
                       WHERE ledger_quantity IS DISTINCT FROM balance_quantity
                          OR ledger_value IS DISTINCT FROM balance_value
                   ) AS invalid_stock_position_count
              FROM compared
            """,
            (IDS["org"], IDS["org"]),
        )
        stock_row = cursor.fetchone()
        if stock_row[0] < 2 or stock_row[1] != 0:
            raise RuntimeError(f"demo stock projection did not reconcile: {stock_row}")
        result["reconciled_stock_position_count"] = stock_row[0]

        cursor.execute(
            """
            SELECT count(*) AS tax_document_count,
                   count(*) FILTER (
                       WHERE currency_code<>'INR' OR octet_length(source_hash)<>32
                          OR (supply_type='intra_state'
                              AND (igst_amount<>0 OR cgst_amount<>sgst_amount))
                          OR (supply_type='inter_state'
                              AND (cgst_amount<>0 OR sgst_amount<>0))
                   ) AS invalid_tax_document_count
              FROM tax.documents
             WHERE org_id=%s AND posted_at>=%s
            """,
            (IDS["org"], started_at),
        )
        tax_row = cursor.fetchone()
        if tax_row[0] < 4 or tax_row[1] != 0:
            raise RuntimeError(f"demo tax documents did not reconcile: {tax_row}")
        result["reconciled_tax_document_count"] = tax_row[0]
    return result


def main() -> int:
    assert_target()
    if not CLIENT_ID or CLIENT_ID == "disabled-unissued-canonical-staging":
        raise RuntimeError("A reviewed staging OAuth client ID is required")
    evidence_dir = Path(required("CANONICAL_DEMO_EVIDENCE_DIR"))
    evidence_dir.mkdir(parents=True, exist_ok=True)
    source = fetch_official_source(evidence_dir)
    adjustment_source = fetch_adjustment_source(evidence_dir)
    itc_reversal_source = fetch_itc_reversal_source(evidence_dir)
    expense_receipt_bytes = reviewed_expense_receipt()
    reviewed_live18_scalars = live18_reviewed_scalars()

    reviewed_web_auth_user_id = os.getenv(
        "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID", ""
    ).strip()
    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        bootstrap_identity(bootstrap)
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        demo_business_date, demo_business_instant = organization_business_clock(
            runtime
        )

    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        release_exists = demo_tax_release_exists(bootstrap)
        adjustment_release_exists = demo_adjustment_release_exists(bootstrap)
        existing_itc_reversal_authority = resolve_existing_itc_reversal_authority(
            bootstrap, itc_reversal_source
        )
    with database_connection("ERP_REGULATORY_IMPORTER_DATABASE_URL") as importer:
        dataset_bytes = canonical_dataset_bytes(importer)
        adjustment_bytes = adjustment_dataset_bytes(importer)
        gstr1_reporting_bytes = gstr1_reporting_dataset_bytes(importer)
        itc_reversal_bytes = itc_reversal_dataset_bytes(importer)
        if (
            existing_itc_reversal_authority is not None
            and hashlib.sha256(itc_reversal_bytes).digest()
            != existing_itc_reversal_authority.dataset_sha256
        ):
            raise RuntimeError(
                "active demo ITC reversal release differs from the reviewed exact dataset"
            )
        (evidence_dir / "hsn-481910-demo.json").write_bytes(dataset_bytes)
        (evidence_dir / "gst-adjustment-rules-demo.json").write_bytes(adjustment_bytes)
        (evidence_dir / "gstr1-reporting-rules.json").write_bytes(
            gstr1_reporting_bytes
        )
        (evidence_dir / "gst-itc-reversal-rules.json").write_bytes(
            itc_reversal_bytes
        )
        if not release_exists:
            import_tax_release(importer, source, dataset_bytes)
        if not adjustment_release_exists:
            import_adjustment_release(importer, adjustment_source, adjustment_bytes)
        if existing_itc_reversal_authority is None:
            import_itc_reversal_release(
                importer, itc_reversal_source, itc_reversal_bytes
            )
    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        gstr1_reporting_reconciliation = reconcile_demo_gstr1_reporting_authority(
            bootstrap, gstr1_reporting_bytes
        )
        seed_business_master(bootstrap, business_date=demo_business_date)
        seed_end_to_end_master(
            bootstrap,
            business_date=demo_business_date,
            expense_receipt_bytes=expense_receipt_bytes,
        )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        party_master_reconciliation = reconcile_party_master(runtime)
        verify_fiscal_tax_fact(runtime, business_date=demo_business_date)
        activate_demo_product(runtime)

    purchase_payload = purchase_order_payload(business_date=demo_business_date)
    preflight_action("procurement.purchase_order.prepare", purchase_payload)
    purchase_journey = exercise_action(
        evidence_dir,
        "procurement.purchase_order.prepare",
        "procurement.order.manage",
        purchase_payload,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        purchase_reconciliation = reconcile_purchase_order(
            runtime,
            purchase_journey["executed"]["resource_id"],
            purchase_journey["prepared"]["command_request_id"],
        )

    purchase_order_id = purchase_reconciliation["id"]
    advance_payload = supplier_advance_payload(
        purchase_order_id,
        purchase_reconciliation["line_ids"][0],
        business_date=demo_business_date,
    )
    preflight_action("finance.supplier_advance.prepare", advance_payload)
    advance_journey = exercise_action(
        evidence_dir,
        "finance.supplier_advance.prepare",
        "finance.supplier_advance.create",
        advance_payload,
        separate_approver=True,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        advance_reconciliation = reconcile_supplier_advance(
            runtime,
            advance_journey["executed"]["resource_id"],
            advance_payload["gross_amount"],
        )

    receipt_payload = goods_receipt_payload(
        purchase_order_id,
        purchase_reconciliation["line_ids"][1],
        business_date=demo_business_date,
        received_at=demo_business_instant,
    )
    preflight_action("procurement.goods_receipt.prepare", receipt_payload)
    receipt_journey = exercise_action(
        evidence_dir,
        "procurement.goods_receipt.prepare",
        "procurement.receipt.post",
        receipt_payload,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        receipt_reconciliation = reconcile_goods_receipt(
            runtime,
            receipt_journey["executed"]["resource_id"],
            expected_accepted_quantity=receipt_payload["lines"][0]["batches"][0][
                "accepted_quantity"
            ],
            expected_free_quantity=receipt_payload["lines"][0]["batches"][0][
                "free_quantity"
            ],
        )
        batch_release_reconciliation = release_received_batch(
            runtime, receipt_reconciliation["id"], receipt_reconciliation["batch_id"]
        )
    (evidence_dir / "canonical-demo-batch-release.json").write_text(
        json.dumps(batch_release_reconciliation, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        portal_evidence = seed_supplier_invoice_portal_evidence(
            bootstrap, business_date=demo_business_date
        )
    supplier_invoice_request = supplier_invoice_payload(
        receipt_reconciliation["id"],
        receipt_reconciliation["goods_receipt_line_id"],
        portal_evidence,
        business_date=demo_business_date,
    )
    preflight_action("procurement.supplier_invoice.prepare", supplier_invoice_request)
    supplier_invoice_journey = exercise_action(
        evidence_dir,
        "procurement.supplier_invoice.prepare",
        "procurement.supplier_invoice.create",
        supplier_invoice_request,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        supplier_invoice_reconciliation = reconcile_supplier_invoice(
            runtime,
            supplier_invoice_journey["executed"]["resource_id"],
            supplier_invoice_journey["prepared"]["command_request_id"],
        )

    live18_purchase_payload = live18_supplier_invoice_purchase_order_payload(
        reviewed_live18_scalars, demo_business_date
    )
    live18_purchase_totals = preflight_action(
        "procurement.purchase_order.prepare", live18_purchase_payload
    )
    live18_portal_economics = supplier_invoice_portal_economics(
        live18_purchase_totals, reviewed_live18_scalars
    )
    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        ui_portal_evidence = seed_supplier_invoice_ui_portal_evidence(
            bootstrap, live18_portal_economics, reviewed_live18_scalars,
            demo_business_date,
        )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        supplier_invoice_ui_fixture = reconcile_supplier_invoice_ui_fixture(
            runtime, ui_portal_evidence, live18_portal_economics
        )

    supplier_payment_request = supplier_payment_payload(
        supplier_invoice_reconciliation["open_item_id"],
        business_date=demo_business_date,
    )
    preflight_action("finance.supplier_payment.prepare", supplier_payment_request)
    supplier_payment_journey = exercise_action(
        evidence_dir,
        "finance.supplier_payment.prepare",
        "finance.supplier_payment.create",
        supplier_payment_request,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        supplier_payment_reconciliation = reconcile_payment(
            runtime,
            supplier_payment_journey["executed"]["resource_id"],
            "disbursement",
            supplier_payment_request["expected_gross_amount"],
        )

    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        delivery_address_row_version = selected_customer_delivery_address_row_version(
            runtime, business_date=demo_business_date
        )
    payload = sales_order_payload(
        delivery_address_row_version,
        business_date=demo_business_date,
        delivery_offset_days=reviewed_live18_scalars[
            "sales_order_delivery_offset_days"
        ],
    )
    preflight_sales_order(payload, evidence_dir)
    journey = exercise_sales_order(evidence_dir, payload)
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        reconciliation = reconcile(
            runtime,
            journey["executed"],
            journey["prepared"]["command_request_id"],
        )

    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        dispatch_allocations = resolve_fefo_dispatch_allocations(
            runtime, business_date=demo_business_date
        )
    dispatch_request = sales_dispatch_payload(
        reconciliation["id"],
        reconciliation["line_ids"][0],
        dispatch_allocations,
        business_date=demo_business_date,
        requested_delivery_date=payload["requested_delivery_date"],
    )
    preflight_action("sales.dispatch.prepare", dispatch_request)
    dispatch_journey = exercise_action(
        evidence_dir,
        "sales.dispatch.prepare",
        "sales.dispatch.create",
        dispatch_request,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        dispatch_reconciliation = reconcile_sales_dispatch(
            runtime,
            dispatch_journey["executed"]["resource_id"],
            expected_billed_quantity=dispatch_request["lines"][0]["billed_quantity"],
            expected_free_quantity=dispatch_request["lines"][0]["free_quantity"],
        )

    invoice_request = sales_invoice_payload(
        dispatch_reconciliation["dispatch_lines"],
        delivery_address_row_version,
        business_date=demo_business_date,
    )
    preflight_action("sales.invoice.prepare", invoice_request)
    invoice_journey = exercise_action(
        evidence_dir,
        "sales.invoice.prepare",
        "sales.invoice.create",
        invoice_request,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        invoice_reconciliation = reconcile_sales_invoice(
            runtime,
            invoice_journey["executed"]["resource_id"],
            invoice_journey["prepared"]["command_request_id"],
        )

    customer_receipt_request = customer_receipt_payload(
        invoice_reconciliation["open_item_id"], business_date=demo_business_date
    )
    preflight_action("finance.customer_receipt.prepare", customer_receipt_request)
    customer_receipt_journey = exercise_action(
        evidence_dir,
        "finance.customer_receipt.prepare",
        "finance.customer_receipt.create",
        customer_receipt_request,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        customer_receipt_reconciliation = reconcile_payment(
            runtime,
            customer_receipt_journey["executed"]["resource_id"],
            "receipt",
            customer_receipt_request["amount"],
        )
    with database_connection("PSYCOPG_DATABASE_URL") as owner:
        bank_reconciliation_ui_fixture = seed_bank_reconciliation_ui_fixture(
            owner,
            customer_receipt_reconciliation["id"],
        )

    sales_return_request = sales_return_payload(
        invoice_reconciliation["id"],
        invoice_reconciliation["invoice_line_id"],
        invoice_reconciliation["dispatch_allocations"],
        business_date=demo_business_date,
    )
    preflight_action("sales.return.prepare", sales_return_request)
    sales_return_journey = exercise_action(
        evidence_dir,
        "sales.return.prepare",
        "sales.return.create",
        sales_return_request,
        separate_approver=True,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        sales_return_reconciliation = reconcile_sales_return(
            runtime,
            sales_return_journey["executed"]["resource_id"],
            sales_return_journey["prepared"]["command_request_id"],
        )
    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        inventory_destruction_ui_fixture = seed_inventory_destruction_ui_fixture(
            bootstrap,
            sales_return_request["lines"][0]["batch_allocation"]["batch_id"],
            business_date=demo_business_date,
        )

    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        purchase_return_portal = seed_purchase_return_portal_evidence(bootstrap)
    purchase_return_request = purchase_return_payload(
        supplier_invoice_reconciliation["id"],
        receipt_reconciliation["goods_receipt_line_id"],
        supplier_invoice_reconciliation["receipt_allocation_id"],
        receipt_reconciliation["batch_id"],
        purchase_return_portal,
        business_date=demo_business_date,
    )
    preflight_action("procurement.purchase_return.prepare", purchase_return_request)
    purchase_return_journey = exercise_action(
        evidence_dir,
        "procurement.purchase_return.prepare",
        "procurement.purchase_return.create",
        purchase_return_request,
        separate_approver=True,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        purchase_return_reconciliation = reconcile_purchase_return(
            runtime,
            purchase_return_journey["executed"]["resource_id"],
            purchase_return_journey["prepared"]["command_request_id"],
        )
        saleable_quantity, stock_balance_row_version = current_saleable_balance(
            runtime, receipt_reconciliation["batch_id"]
        )

    adjustment_request = inventory_adjustment_payload(
        receipt_reconciliation["batch_id"],
        saleable_quantity,
        stock_balance_row_version,
        business_date=demo_business_date,
    )
    preflight_action("inventory.adjustment.prepare", adjustment_request)
    adjustment_journey = exercise_action(
        evidence_dir,
        "inventory.adjustment.prepare",
        "inventory.adjustment.create",
        adjustment_request,
        separate_approver=True,
    )
    with database_connection("ERP_RUNTIME_DATABASE_URL") as runtime:
        adjustment_reconciliation = reconcile_inventory_adjustment(
            runtime, adjustment_journey["executed"]["resource_id"]
        )
    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        live18_cycle_count_fixture = seed_live18_cycle_count_evidence(
            bootstrap, business_date=demo_business_date
        )
    with staging_owner_audit_connection() as owner:
        cross_table_reconciliation = reconcile_cross_table_invariants(
            owner,
            command_ids=[
                str(journey["prepared"]["command_request_id"])
                for journey in (
                    purchase_journey,
                    advance_journey,
                    receipt_journey,
                    supplier_invoice_journey,
                    supplier_payment_journey,
                    journey,
                    dispatch_journey,
                    invoice_journey,
                    customer_receipt_journey,
                    sales_return_journey,
                    purchase_return_journey,
                    adjustment_journey,
                )
            ],
        )
    # Bind the reviewed human only after every synthetic import, command, and
    # database reconciliation succeeds. This prevents a partially provisioned
    # staging database from becoming reachable through a real cloud identity.
    with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:
        reviewed_web_operator = (
            bind_reviewed_web_operator(bootstrap, reviewed_web_auth_user_id)
            if reviewed_web_auth_user_id
            else None
        )

    summary = {
        "project_ref": PROJECT_REF,
        "business_date": demo_business_date.isoformat(),
        "organization_id": IDS["org"],
        "rls_denial_organization_id": IDS["denial_org"],
        "organization_classification": "disposable_synthetic_demo",
        "reviewed_web_operator": reviewed_web_operator,
        "official_source_uri": SOURCE_URI,
        "official_source_sha256": hashlib.sha256(source).hexdigest(),
        "dataset_sha256": hashlib.sha256(
            (evidence_dir / "hsn-481910-demo.json").read_bytes()
        ).hexdigest(),
        "reference_scope": "demo subset; not a complete production tax dataset",
        "gstr1_reporting_reconciliation": gstr1_reporting_reconciliation,
        "transaction_scope": "canonical day-to-day purchase, sales, inventory, return, and settlement actions",
        "expense_claim_fixture": {
            "receipt_attachment_id": IDS["expense_receipt_evidence"],
            "receipt_sha256": hashlib.sha256(expense_receipt_bytes).hexdigest(),
            "expense_account_id": IDS["expense_claim_expense_account"],
            "reimbursement_account_id": IDS[
                "expense_claim_reimbursement_account"
            ],
        },
        "party_master_reconciliation": party_master_reconciliation,
        "purchase_order_reconciliation": purchase_reconciliation,
        "supplier_advance_reconciliation": advance_reconciliation,
        "goods_receipt_reconciliation": receipt_reconciliation,
        "batch_release_reconciliation": batch_release_reconciliation,
        "supplier_invoice_reconciliation": supplier_invoice_reconciliation,
        "supplier_invoice_ui_fixture": supplier_invoice_ui_fixture,
        "supplier_payment_reconciliation": supplier_payment_reconciliation,
        "sales_order_reconciliation": reconciliation,
        "sales_dispatch_reconciliation": dispatch_reconciliation,
        "sales_invoice_reconciliation": invoice_reconciliation,
        "customer_receipt_reconciliation": customer_receipt_reconciliation,
        "bank_reconciliation_ui_fixture": bank_reconciliation_ui_fixture,
        "sales_return_reconciliation": sales_return_reconciliation,
        "inventory_destruction_ui_fixture": inventory_destruction_ui_fixture,
        "purchase_return_reconciliation": purchase_return_reconciliation,
        "inventory_adjustment_reconciliation": adjustment_reconciliation,
        "live18_cycle_count_fixture": live18_cycle_count_fixture,
        "cross_table_reconciliation": cross_table_reconciliation,
        "available_prepare_operation_count": len(PREPARE_CAPABILITIES),
        "challan_evidence": {
            "supplier_challan_number": receipt_payload["supplier_challan_number"],
            "supplier_challan_date": receipt_payload["supplier_challan_date"],
            "dispatch_delivery_challan_number": dispatch_request["logistics"][
                "transport_document_number"
            ],
            "purchase_return_delivery_challan_number": purchase_return_request[
                "logistics"
            ]["transport_document_number"],
        },
    }
    (evidence_dir / "canonical-demo-summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, sort_keys=True))
    return 0


_SAFE_FAILURE_ERROR_CODES = frozenset({
    "AUTH_REQUIRED", "SCOPE_DENIED", "BRANCH_DENIED", "AMBIGUOUS_REFERENCE",
    "VALIDATION_FAILED", "STALE_VERSION", "PREVIEW_EXPIRED", "PREVIEW_CHANGED",
    "APPROVAL_REQUIRED", "IDEMPOTENCY_CONFLICT", "PERIOD_CLOSED",
    "INSUFFICIENT_STOCK", "BATCH_BLOCKED", "POLICY_BLOCKED",
})
_SEPARATELY_FIXTURED_PREPARE_OPERATIONS = frozenset({
    "finance.customer_cheque_bounce.prepare",
    "finance.customer_cheque_clearance.prepare",
    "finance.adjustment_note.reversal.prepare",
    "procurement.purchase_return.reversal.prepare",
    "sales.return.reversal.prepare",
})
_SAFE_FAILURE_OPERATIONS = frozenset(
    operation
    for operation, _approval_policy in PREPARE_CAPABILITIES
    if operation not in _SEPARATELY_FIXTURED_PREPARE_OPERATIONS
) | frozenset({
    "automation.command.approve",
    "automation.command.execute",
    "automation.command.review",
})
_SAFE_FAILURE_REASONS = frozenset({
    "CALCULATOR_DATABASE_UNAVAILABLE",
    "CANONICAL_BASELINE_UNVERIFIED",
    "CANONICAL_DATABASE_POLICY_REJECTED",
    "COMMAND_ADAPTER_UNAVAILABLE",
    "FEFO_ALLOCATION_REQUIRED",
    "INSUFFICIENT_LOCKED_STOCK",
    "INVALID_CANONICAL_PREVIEW_HASH",
    "RUNTIME_DATABASE_PRINCIPAL_INVALID",
    "RUNTIME_DATABASE_UNAVAILABLE",
})
_SAFE_FAILURE_SQLSTATES = frozenset({
    "0A000", "21000", "22023", "22P02", "23502", "23503", "23505",
    "23514", "40001", "42501", "55000", "P0002",
})


def safe_failure_summary(exc: BaseException) -> dict[str, str]:
    """Return bounded diagnostic facts without echoing exception payloads.

    Hosted errors can contain authorization headers, connection URLs, or full
    business request bodies.  CI needs a stable fingerprint and allowlisted
    failure codes, not the original exception text.
    """

    raw = str(exc)[:65536]
    summary = {
        "exception_type": type(exc).__name__[:64],
        "fingerprint_sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
    }
    decoder = json.JSONDecoder()
    candidates: list[object] = []
    for attempt, match in enumerate(re.finditer(r"\{", raw)):
        if attempt >= 64:
            break
        try:
            value, _ = decoder.raw_decode(raw[match.start():])
        except (json.JSONDecodeError, RecursionError, ValueError):
            continue
        candidates.append(value)

    def collect(value: object) -> None:
        stack: list[tuple[object, int]] = [(value, 0)]
        visited = 0
        while stack and visited < 256:
            current, depth = stack.pop()
            visited += 1
            if depth > 12:
                continue
            if isinstance(current, dict):
                for index, (key, child) in enumerate(current.items()):
                    if index >= 64:
                        break
                    rendered = str(child).strip() if isinstance(child, (str, int)) else ""
                    if key == "error_code" and rendered in _SAFE_FAILURE_ERROR_CODES:
                        summary.setdefault(key, rendered)
                    elif key == "operation" and rendered in _SAFE_FAILURE_OPERATIONS:
                        summary.setdefault(key, rendered)
                    elif key == "reason" and rendered in _SAFE_FAILURE_REASONS:
                        summary.setdefault(key, rendered)
                    elif key == "sqlstate" and rendered in _SAFE_FAILURE_SQLSTATES:
                        summary.setdefault(key, rendered)
                    elif key == "status_code" and rendered in {
                        "400", "401", "403", "404", "409", "422", "429", "500", "503",
                    }:
                        summary.setdefault(key, rendered)
                    if isinstance(child, (dict, list)):
                        stack.append((child, depth + 1))
            elif isinstance(current, list):
                for child in reversed(current[:32]):
                    if isinstance(child, (dict, list)):
                        stack.append((child, depth + 1))

    for candidate in candidates[-8:]:
        collect(candidate)
    return summary


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            "canonical demo provisioning failed: "
            + json.dumps(safe_failure_summary(exc), sort_keys=True),
            file=sys.stderr,
        )
        raise SystemExit(1) from None
