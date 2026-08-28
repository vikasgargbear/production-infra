#!/usr/bin/env python3
"""Compile reviewed live18 UI templates from canonical staging facts.

Templates are repository-owned interaction intent.  Canonical identities and
labels are resolved after disposable staging provisioning.  Only genuinely
non-derivable operator choices may arrive in the compact reviewed scalar pack.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import psycopg2

try:
    from scripts.canonical_demo_ids import canonical_live18_cycle_count_authority
except ModuleNotFoundError:  # Direct execution places this script directory on sys.path.
    from canonical_demo_ids import (  # type: ignore[no-redef]
        canonical_live18_cycle_count_authority,
    )


FIXTURE_SCHEMA = "aasopharma.live18.fixture.v1"
SCALAR_SCHEMA = "aasopharma.live18.reviewed-scalars.v1"
TEMPLATE_SCHEMA = "aasopharma.live18.ui-template.v1"
AUTHORITATIVE_FACTS_SCHEMA = "aasopharma.live18.authoritative-facts.v1"
MAX_SCALAR_BYTES = 32 * 1024
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)
TOKEN_RE = re.compile(r"\{\{(fact|scalar)\.([a-z][a-z0-9_.]*)\}\}")
RUNTIME_TOKEN_RE = re.compile(
    r"\{\{(?:command_request_id|preview_hash|run_token|resource_[a-z][a-z0-9_]*)\}\}"
)
RESOURCE_TOKEN_RE = re.compile(r"\{\{resource_([a-z][a-z0-9_]*)\}\}")
FORBIDDEN_SCALAR_KEYS = re.compile(r"(?:^|_)(?:id|uuid|row_version|hash|date|time|timestamp)$")
PHASES = (
    "missing_required_steps", "prepare_steps", "approval_steps", "execute_steps",
)
LIFECYCLE_MODES = {"split", "combined_actor_confirmation"}
ACTORS = {"requester", "reviewer"}
ACTIONS = {
    "goto", "click", "fill", "select", "setInputFiles", "press", "expectText",
    "expectDisabled",
}
LOCATOR_KINDS = {"role", "label", "placeholder", "text", "testId"}
COMMUNICATION_ACTION = re.compile(r"whats?app|e-?mail|sms|text message|phone|call|tel:", re.I)
AUTHORITATIVE_SELECTOR_KEYS = (
    "branch_code", "branch_name", "customer_code", "customer_name",
    "supplier_code", "supplier_name", "product_code", "product_name",
    "uom_code", "count_uom_code", "source_location_code", "source_location_name",
    "quarantine_location_code", "quarantine_location_name",
    "destination_branch_code", "destination_branch_name",
    "destination_location_code", "destination_location_name",
    "bank_name", "bank_account_holder", "bank_ledger_code", "bank_ledger_name",
    "cash_on_hand_account_id", "cash_on_hand_account_code",
    "cash_on_hand_account_name", "cheques_in_hand_account_id",
    "cheques_in_hand_account_code", "cheques_in_hand_account_name",
    "customer_advance_account_id", "customer_advance_account_code",
    "customer_advance_account_name",
    "delivery_address_id", "delivery_address_row_version",
    "direct_issue_batch_id", "direct_issue_batch_number",
    "direct_issue_available_base_quantity", "sales_uom_multiplier",
    "supplier_destination_address_id",
)


class FixtureCompileError(RuntimeError):
    pass


def _authoritative_selector_row(row: tuple[Any, ...]) -> dict[str, Any]:
    if len(row) != len(AUTHORITATIVE_SELECTOR_KEYS) + 2:
        raise FixtureCompileError("authoritative selector fact columns drifted")
    return dict(zip(AUTHORITATIVE_SELECTOR_KEYS, row[:-2]))


def _object(path: Path, label: str) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise FixtureCompileError(f"{label} must be a JSON object")
    return value


def _leaf(mapping: dict[str, Any], dotted: str, authority: str) -> str:
    value: Any = mapping
    for part in dotted.split("."):
        if not isinstance(value, dict) or part not in value:
            raise FixtureCompileError(f"missing {authority} value: {dotted}")
        value = value[part]
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        raise FixtureCompileError(f"{authority} value must be scalar: {dotted}")
    rendered = str(value)
    if not rendered:
        raise FixtureCompileError(f"{authority} value must be non-empty: {dotted}")
    return rendered


def validate_reviewed_scalar_pack(pack: Any, *, byte_size: int) -> dict[str, Any]:
    if byte_size > MAX_SCALAR_BYTES:
        raise FixtureCompileError(
            f"reviewed scalar pack exceeds {MAX_SCALAR_BYTES} bytes"
        )
    if not isinstance(pack, dict) or pack.get("schema") != SCALAR_SCHEMA:
        raise FixtureCompileError(f"reviewed scalar pack must use {SCALAR_SCHEMA}")
    values = pack.get("values")
    if not isinstance(values, dict):
        raise FixtureCompileError("reviewed scalar pack values must be an object")
    for key, value in values.items():
        if not isinstance(key, str) or FORBIDDEN_SCALAR_KEYS.search(key):
            raise FixtureCompileError(
                f"canonical identity/time authority is forbidden in reviewed scalar: {key}"
            )
        if not isinstance(value, (str, int, float)) or isinstance(value, bool):
            raise FixtureCompileError(f"reviewed scalar must be primitive: {key}")
        if UUID_RE.fullmatch(str(value)):
            raise FixtureCompileError(f"reviewed scalar must not carry a UUID: {key}")
    return values


def load_reviewed_scalars(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    if len(raw) > MAX_SCALAR_BYTES:
        raise FixtureCompileError(
            f"reviewed scalar pack exceeds {MAX_SCALAR_BYTES} bytes"
        )
    return validate_reviewed_scalar_pack(json.loads(raw), byte_size=len(raw))


def supplier_invoice_chain_choices(scalars: dict[str, Any]) -> dict[str, str]:
    """Validate the reviewed PO -> GRN economics that the GSTR-2B row must mirror."""

    decimal_rules = {
        "purchase_order_quantity": (6, True),
        "purchase_order_rate": (4, True),
        "purchase_order_line_discount_percent": (6, False),
        "purchase_order_free_quantity": (6, False),
        "purchase_order_document_discount": (2, False),
        "purchase_order_freight_charge": (2, False),
        "goods_receipt_received_quantity": (6, True),
        "goods_receipt_accepted_quantity": (6, True),
        "goods_receipt_rejected_quantity": (6, False),
        "goods_receipt_free_quantity": (6, False),
        "goods_receipt_mrp": (2, True),
    }
    rendered: dict[str, str] = {}
    numeric: dict[str, Decimal] = {}
    for key, (scale, positive) in decimal_rules.items():
        value = _leaf(scalars, key, "reviewed scalar")
        if not re.fullmatch(
            rf"(?:0|[1-9][0-9]{{0,17}})(?:\.[0-9]{{1,{scale}}})?", value
        ):
            raise FixtureCompileError(
                f"{key} must be a plain decimal with at most {scale} fractional digits"
            )
        number = Decimal(value)
        if number < 0 or (positive and number <= 0):
            qualifier = "positive" if positive else "non-negative"
            raise FixtureCompileError(f"{key} must be {qualifier}")
        rendered[key] = value
        numeric[key] = number

    delivery_offset = _leaf(
        scalars, "purchase_order_delivery_offset_days", "reviewed scalar"
    )
    if not re.fullmatch(r"[1-9]|[12][0-9]|30", delivery_offset):
        raise FixtureCompileError(
            "purchase_order_delivery_offset_days must be an integer from 1 through 30"
        )
    rendered["purchase_order_delivery_offset_days"] = delivery_offset

    discount_percent = numeric["purchase_order_line_discount_percent"]
    if discount_percent >= 100:
        raise FixtureCompileError(
            "purchase_order_line_discount_percent must be less than 100"
        )
    if numeric["purchase_order_freight_charge"] != 0:
        raise FixtureCompileError(
            "purchase_order_freight_charge must be zero until a canonical charge-line identity is reviewed"
        )
    if (
        numeric["goods_receipt_received_quantity"]
        != numeric["goods_receipt_accepted_quantity"]
        + numeric["goods_receipt_rejected_quantity"]
    ):
        raise FixtureCompileError(
            "goods_receipt_received_quantity must equal accepted plus rejected quantity"
        )
    if numeric["goods_receipt_accepted_quantity"] != numeric["purchase_order_quantity"]:
        raise FixtureCompileError(
            "goods_receipt_accepted_quantity must exactly consume the reviewed purchase-order billed quantity"
        )
    if numeric["purchase_order_free_quantity"] != 0:
        raise FixtureCompileError(
            "current Live18 supplier-invoice lineage requires zero free quantity because "
            "the browser template does not select a free-supply tax treatment"
        )
    if numeric["goods_receipt_free_quantity"] != numeric["purchase_order_free_quantity"]:
        raise FixtureCompileError(
            "goods_receipt_free_quantity must exactly consume the reviewed purchase-order free quantity"
        )
    qc_status = _leaf(scalars, "goods_receipt_qc_status", "reviewed scalar")
    if qc_status != "accepted" or numeric["goods_receipt_rejected_quantity"] != 0:
        raise FixtureCompileError(
            "Live18 supplier-invoice lineage requires accepted QC with zero rejected quantity"
        )

    gross_price = numeric["purchase_order_quantity"] * numeric["purchase_order_rate"]
    if numeric["purchase_order_document_discount"] >= gross_price:
        raise FixtureCompileError(
            "reviewed purchase-order discounts leave no positive supplier-invoice taxable value"
        )
    return {
        **rendered,
        "goods_receipt_qc_status": qc_status,
    }


def load_identity_evidence(path: Path) -> tuple[str, dict[str, str]]:
    evidence = _object(path, "identity evidence")
    org_id = evidence.get("organization_id")
    identities = evidence.get("fixture_identities")
    if not isinstance(org_id, str) or not UUID_RE.fullmatch(org_id):
        raise FixtureCompileError("identity evidence omitted canonical organization_id")
    if not isinstance(identities, dict) or not identities:
        raise FixtureCompileError("identity evidence omitted fixture_identities")
    for key, value in identities.items():
        if not isinstance(key, str) or not isinstance(value, str) or not UUID_RE.fullmatch(value):
            raise FixtureCompileError(f"invalid canonical fixture identity: {key}")
    return org_id, identities


def load_authoritative_facts(
    path: Path,
    *,
    expected_sha: str,
    project_ref: str,
    run_token: str,
    auth_user_id: str,
    org_id: str,
    identities: dict[str, str],
) -> dict[str, Any]:
    evidence = _object(path, "authoritative fact evidence")
    expected_boundary = {
        "schema": AUTHORITATIVE_FACTS_SCHEMA,
        "expected_sha": expected_sha,
        "project_ref": project_ref,
        "run_token": run_token,
        "auth_user_id": auth_user_id,
        "organization_id": org_id,
        "fixture_identities": identities,
    }
    for key, expected in expected_boundary.items():
        if evidence.get(key) != expected:
            raise FixtureCompileError(
                f"authoritative fact evidence {key} differs from the reviewed boundary"
            )
    facts = evidence.get("facts")
    if not isinstance(facts, dict) or set(facts) != {
        "identity",
        "display",
        "clock",
        "choice",
    }:
        raise FixtureCompileError("authoritative fact evidence is incomplete")
    if any(not isinstance(facts[key], dict) for key in facts):
        raise FixtureCompileError("authoritative fact evidence domains are malformed")
    return facts


def resolve_authoritative_facts(
    database_url: str,
    auth_user_id: str,
    org_id: str,
    identities: dict[str, str],
    run_token: str,
) -> dict[str, Any]:
    required = {
        "branch_id", "customer_account_id", "supplier_account_id", "product_id",
        "uom_conversion_id", "count_uom_conversion_id", "saleable_location_id",
        "quarantine_location_id", "transfer_destination_branch_id",
        "transfer_destination_location_id", "bank_account_id", "bank_ledger_id",
        "cycle_count_evidence_attachment_id",
    }
    live23_identities = {
        "interstate_customer_account_id", "interstate_delivery_address_id",
        "interstate_customer_gstin_id", "sez_customer_account_id",
        "sez_delivery_address_id", "sez_customer_gstin_id",
    }
    if frozenset(identities) not in {
        frozenset(required),
        frozenset(required | live23_identities),
    }:
        raise FixtureCompileError(
            f"canonical fixture identity set drifted: missing={sorted(required-set(identities))} "
            f"extra={sorted(set(identities)-required)}"
        )
    sql = """
      SELECT branch.code,branch.name,customer.customer_code,customer_party.legal_name,
             supplier.supplier_code,supplier_party.legal_name,
             product.sku,product.name,uom.from_uom_code,count_uom.from_uom_code,
             source.code,source.name,quarantine.code,quarantine.name,
             destination_branch.code,destination_branch.name,
             destination.code,destination.name,bank.bank_name,bank.account_holder_name,
             ledger.code,ledger.name,
             cash_account.id::text,cash_account.code,cash_account.name,
             cheque_account.id::text,cheque_account.code,cheque_account.name,
             customer_advance_account.id::text,customer_advance_account.code,
             customer_advance_account.name,
             delivery_address.id::text,delivery_address.row_version,
             direct_issue_batch.id::text,direct_issue_batch.batch_number,
             direct_issue_batch.available_base_quantity,uom.multiplier,
             supplier_destination.id::text,
             to_char((transaction_timestamp() AT TIME ZONE organization.timezone)::date,'YYYY-MM-DD'),
             to_char(transaction_timestamp() AT TIME ZONE organization.timezone,'YYYY-MM-DD"T"HH24:MI')
        FROM core.branches branch
        JOIN core.organizations organization ON organization.id=branch.org_id AND organization.status='active'
        JOIN parties.customer_accounts customer ON customer.org_id=branch.org_id AND customer.id=%s
        JOIN parties.parties customer_party ON customer_party.org_id=customer.org_id AND customer_party.id=customer.party_id
        JOIN LATERAL (
            SELECT address.id,address.row_version
              FROM parties.addresses address
             WHERE address.org_id=customer.org_id
               AND address.party_id=customer.party_id
               AND address.status='active' AND address.is_primary
             ORDER BY (address.address_kind='shipping') DESC,address.id
             LIMIT 2
        ) delivery_address ON true
        JOIN parties.supplier_accounts supplier ON supplier.org_id=branch.org_id AND supplier.id=%s
        JOIN parties.parties supplier_party ON supplier_party.org_id=supplier.org_id AND supplier_party.id=supplier.party_id
        JOIN LATERAL (
            SELECT address.id
              FROM parties.addresses address
             WHERE address.org_id=supplier.org_id
               AND address.party_id=supplier.party_id
               AND address.address_kind IN ('registered','shipping','warehouse')
               AND address.status='active'
               AND address.valid_from<=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
               AND (address.valid_until IS NULL OR address.valid_until>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date)
             ORDER BY address.is_primary DESC,address.address_kind,address.id
             LIMIT 2
        ) supplier_destination ON true
        JOIN catalog.products product ON product.org_id=branch.org_id AND product.id=%s
        JOIN catalog.uom_conversions uom ON uom.org_id=product.org_id AND uom.id=%s AND uom.product_id=product.id
        JOIN catalog.uom_conversions count_uom ON count_uom.org_id=product.org_id AND count_uom.id=%s AND count_uom.product_id=product.id
        JOIN inventory.locations source ON source.org_id=branch.org_id AND source.id=%s AND source.branch_id=branch.id
        JOIN LATERAL (
            SELECT batch.id,batch.batch_number,
                   balance.on_hand_quantity AS available_base_quantity
              FROM inventory.batches batch
              JOIN inventory.stock_balances balance
                ON balance.org_id=batch.org_id AND balance.batch_id=batch.id
               AND balance.product_id=batch.product_id
               AND balance.branch_id=source.branch_id
               AND balance.location_id=source.id
               AND balance.on_hand_quantity>0
             WHERE batch.org_id=product.org_id AND batch.product_id=product.id
               AND batch.status='released' AND batch.released_at IS NOT NULL
               AND batch.expires_on>(transaction_timestamp() AT TIME ZONE organization.timezone)::date
             ORDER BY batch.expires_on,batch.id
             LIMIT 1
        ) direct_issue_batch ON true
        JOIN inventory.locations quarantine ON quarantine.org_id=branch.org_id AND quarantine.id=%s AND quarantine.branch_id=branch.id
        JOIN core.branches destination_branch ON destination_branch.org_id=branch.org_id AND destination_branch.id=%s
        JOIN inventory.locations destination ON destination.org_id=destination_branch.org_id AND destination.id=%s AND destination.branch_id=destination_branch.id
        JOIN finance.bank_accounts bank ON bank.org_id=branch.org_id AND bank.id=%s
        JOIN finance.accounts ledger ON ledger.org_id=branch.org_id AND ledger.id=%s
        JOIN core.settings cash_role
          ON cash_role.org_id=branch.org_id AND cash_role.status='active'
         AND cash_role.namespace='finance.account_roles' AND cash_role.key='cash_on_hand'
         AND cash_role.value_type='text'
         AND (cash_role.branch_id IS NULL OR cash_role.branch_id=branch.id)
        JOIN finance.accounts cash_account
          ON cash_account.org_id=cash_role.org_id
         AND cash_account.id=cash_role.value_text::uuid
         AND cash_account.status='active' AND cash_account.account_type='asset'
         AND cash_account.currency_code='INR' AND NOT cash_account.allows_party_posting
        JOIN core.settings cheque_role
          ON cheque_role.org_id=branch.org_id AND cheque_role.status='active'
         AND cheque_role.namespace='finance.account_roles' AND cheque_role.key='cheques_in_hand'
         AND cheque_role.value_type='text'
         AND (cheque_role.branch_id IS NULL OR cheque_role.branch_id=branch.id)
        JOIN finance.accounts cheque_account
          ON cheque_account.org_id=cheque_role.org_id
         AND cheque_account.id=cheque_role.value_text::uuid
         AND cheque_account.status='active' AND cheque_account.account_type='asset'
         AND cheque_account.currency_code='INR' AND NOT cheque_account.allows_party_posting
        JOIN core.settings customer_advance_role
          ON customer_advance_role.org_id=branch.org_id
         AND customer_advance_role.status='active'
         AND customer_advance_role.namespace='finance.account_roles'
         AND customer_advance_role.key='customer_advance'
         AND customer_advance_role.value_type='text'
         AND (customer_advance_role.branch_id IS NULL
              OR customer_advance_role.branch_id=branch.id)
        JOIN finance.accounts customer_advance_account
          ON customer_advance_account.org_id=customer_advance_role.org_id
         AND customer_advance_account.id=customer_advance_role.value_text::uuid
         AND customer_advance_account.status='active'
         AND customer_advance_account.account_type='liability'
         AND customer_advance_account.currency_code='INR'
         AND customer_advance_account.allows_party_posting
       WHERE branch.org_id=%s AND branch.id=%s
         AND branch.status='active' AND customer.status='active' AND supplier.status='active'
         AND product.status='active' AND source.status='active' AND quarantine.status='active'
         AND destination_branch.status='active' AND destination.status='active'
         AND bank.status='active' AND ledger.status='active'
    """
    customer_receipt_evidence_sql = """
      SELECT attachment.id::text
        FROM core.attachments attachment
       WHERE attachment.org_id=%s
         AND attachment.storage_bucket='canonical-demo-evidence'
         AND attachment.storage_object_path=%s
         AND attachment.evidence_kind='customer_receipt_evidence'
         AND attachment.status IN ('verified','retained')
         AND attachment.verified_at IS NOT NULL
    """
    params = (
        identities["customer_account_id"], identities["supplier_account_id"],
        identities["product_id"], identities["uom_conversion_id"],
        identities["count_uom_conversion_id"], identities["saleable_location_id"],
        identities["quarantine_location_id"], identities["transfer_destination_branch_id"],
        identities["transfer_destination_location_id"], identities["bank_account_id"],
        identities["bank_ledger_id"], org_id, identities["branch_id"],
    )
    if not re.fullmatch(r"[1-9][0-9]*-[1-9][0-9]*", run_token):
        raise FixtureCompileError("live18 run token must be GitHub run-id and attempt")
    run_id, run_attempt = run_token.split("-", 1)
    cycle_count_authority = canonical_live18_cycle_count_authority(
        org_id, run_id, run_attempt
    )
    supplier_invoice_number = f"DEMO-UI-SUP-{run_token}"
    bank_statement_reference = f"DEMO-UI-BANK-{run_token}"
    supplier_invoice_sql = """
      SELECT portal_line.id::text, portal_line.invoice_number, portal_line.invoice_date,
             portal_line.taxable_amount::text, portal_line.cgst_amount::text,
             portal_line.sgst_amount::text, portal_line.igst_amount::text,
             portal_line.cess_amount::text, portal_line.total_amount::text,
             pg_catalog.encode(portal_line.source_row_hash,'hex'),
             variance_account.id::text
        FROM tax.portal_document_lines AS portal_line
        JOIN tax.portal_documents AS portal_document
          ON portal_document.org_id=portal_line.org_id
         AND portal_document.id=portal_line.portal_document_id
         AND portal_document.portal_document_type='gstr2b'
         AND portal_document.status='parsed'
         AND portal_document.parsed_at IS NOT NULL
        JOIN core.attachments AS source
          ON source.org_id=portal_document.org_id
         AND source.id=portal_document.source_attachment_id
         AND source.storage_object_path=%s
         AND source.evidence_kind='gstr2b_import'
         AND source.status='retained'
         AND source.verified_at IS NOT NULL
         AND source.sha256=portal_document.source_sha256
        JOIN parties.supplier_accounts AS supplier
          ON supplier.org_id=portal_line.org_id
         AND supplier.id=%s
         AND supplier.status='active'
        JOIN parties.tax_registrations AS supplier_registration
          ON supplier_registration.org_id=supplier.org_id
         AND supplier_registration.party_id=supplier.party_id
         AND supplier_registration.registration_type='GSTIN'
         AND supplier_registration.status='active'
        JOIN core.settings AS variance_role
          ON variance_role.org_id=portal_line.org_id
         AND variance_role.scope_kind='organization'
         AND variance_role.branch_id IS NULL
         AND variance_role.namespace='finance.account_roles'
         AND variance_role.key='purchase_price_variance'
         AND variance_role.value_type='text'
         AND variance_role.status='active'
        JOIN finance.accounts AS variance_account
          ON variance_account.org_id=variance_role.org_id
         AND variance_account.id=variance_role.value_text::uuid
         AND variance_account.account_type='expense'
         AND variance_account.currency_code='INR'
         AND variance_account.status='active'
         AND NOT variance_account.allows_party_posting
       WHERE portal_line.org_id=%s
         AND portal_line.document_type='invoice'
         AND portal_line.supplier_gstin=supplier_registration.registration_number
         AND portal_line.invoice_number=%s
         AND NOT erp_automation_reads.active_command_evidence_in_use(
           portal_line.org_id,
           'procurement.supplier_invoice.prepare',
           'portal_document_line_id',
           portal_line.id
         )
       ORDER BY portal_line.id
    """
    bank_reconciliation_sql = """
      SELECT statement.id::text,statement_line.id::text,journal.id::text,
             statement.statement_reference,statement_line.line_number,
             to_char(statement_line.transaction_date,'YYYY-MM-DD'),
             bank.bank_name,journal.journal_number,
             statement_line.amount::text,statement_line.direction
        FROM finance.bank_statements statement
        JOIN core.attachments source
          ON source.org_id=statement.org_id
         AND source.id=statement.source_attachment_id
         AND source.storage_object_path=%s
         AND source.evidence_kind='bank_statement_import'
         AND source.status IN ('verified','retained')
         AND source.verified_at IS NOT NULL
         AND source.sha256=statement.source_sha256
        JOIN finance.bank_accounts bank
          ON bank.org_id=statement.org_id AND bank.id=statement.bank_account_id
         AND bank.id=%s AND bank.status='active'
         AND bank.currency_code=statement.currency_code
        JOIN finance.accounts bank_ledger
          ON bank_ledger.org_id=bank.org_id AND bank_ledger.id=bank.account_id
         AND bank_ledger.id=%s AND bank_ledger.status='active'
         AND bank_ledger.account_type='asset'
         AND bank_ledger.allows_bank_reconciliation
        JOIN finance.bank_statement_lines statement_line
          ON statement_line.org_id=statement.org_id
         AND statement_line.bank_statement_id=statement.id
        JOIN finance.journal_entries journal
          ON journal.org_id=statement.org_id AND journal.status='posted'
         AND journal.posting_date=statement_line.transaction_date
         AND journal.transaction_currency=statement.currency_code
         AND journal.functional_currency='INR' AND journal.fx_rate=1
         AND journal.transaction_debit_total=journal.transaction_credit_total
         AND journal.functional_debit_total=journal.functional_credit_total
         AND journal.journal_number=statement_line.bank_reference
        JOIN finance.journal_lines bank_line
          ON bank_line.org_id=journal.org_id
         AND bank_line.journal_entry_id=journal.id
         AND bank_line.account_id=bank.account_id
         AND bank_line.transaction_debit=CASE statement_line.direction
               WHEN 'credit' THEN statement_line.amount ELSE 0 END
         AND bank_line.transaction_credit=CASE statement_line.direction
               WHEN 'debit' THEN statement_line.amount ELSE 0 END
         AND bank_line.functional_debit=bank_line.transaction_debit
         AND bank_line.functional_credit=bank_line.transaction_credit
        JOIN core.branches branch
          ON branch.org_id=bank_line.org_id AND branch.id=bank_line.branch_id
         AND branch.id=%s AND branch.status='active'
       WHERE statement.org_id=%s AND statement.statement_reference=%s
         AND statement.status IN ('imported','reconciling')
         AND statement.currency_code='INR'
         AND (SELECT count(*) FROM finance.journal_lines candidate_line
               WHERE candidate_line.org_id=journal.org_id
                 AND candidate_line.journal_entry_id=journal.id
                 AND candidate_line.account_id=bank.account_id)=1
         AND NOT EXISTS (
               SELECT 1 FROM finance.reconciliation_matches matched
                WHERE matched.org_id=statement_line.org_id
                  AND matched.bank_statement_line_id=statement_line.id
                  AND matched.status='matched'
                  AND NOT EXISTS (
                    SELECT 1 FROM finance.reconciliation_matches reversal
                     WHERE reversal.org_id=matched.org_id
                       AND reversal.reversal_of_match_id=matched.id))
         AND NOT EXISTS (
               SELECT 1 FROM finance.reconciliation_matches matched
                WHERE matched.org_id=journal.org_id
                  AND matched.journal_entry_id=journal.id
                  AND matched.status='matched'
                  AND NOT EXISTS (
                    SELECT 1 FROM finance.reconciliation_matches reversal
                     WHERE reversal.org_id=matched.org_id
                       AND reversal.reversal_of_match_id=matched.id))
       ORDER BY statement_line.id,journal.id
    """
    adjustment_evidence_sql = """
      SELECT sales_rule.id::text,sales_rule.reason_code,
             purchase_rule.id::text,purchase_rule.reason_code,
             recipient_evidence.id::text,
             to_char(recipient_evidence.verified_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             portal_line.id::text,portal_line.invoice_number
        FROM tax.gst_adjustment_rule_versions sales_rule
        JOIN core.organizations organization
          ON organization.id=%s AND organization.status='active'
        JOIN tax.gst_adjustment_rule_versions purchase_rule
          ON purchase_rule.status='active'
         AND purchase_rule.side='purchase'
         AND purchase_rule.direction='debit'
         AND purchase_rule.document_effect='decrease'
         AND purchase_rule.tax_effect='statutory'
         AND purchase_rule.effective_from<=
             (transaction_timestamp() AT TIME ZONE organization.timezone)::date
         AND (purchase_rule.effective_to IS NULL OR purchase_rule.effective_to>=
             (transaction_timestamp() AT TIME ZONE organization.timezone)::date)
        JOIN core.attachments recipient_evidence
          ON recipient_evidence.org_id=organization.id
         AND recipient_evidence.evidence_kind='recipient_itc_reversal'
         AND recipient_evidence.status IN ('verified','retained')
         AND recipient_evidence.verified_at IS NOT NULL
         AND recipient_evidence.verified_at<=transaction_timestamp()
         AND recipient_evidence.retention_until>=
             (transaction_timestamp() AT TIME ZONE organization.timezone)::date
         AND recipient_evidence.sha256 IS NOT NULL
        JOIN parties.supplier_accounts supplier
          ON supplier.org_id=organization.id AND supplier.id=%s
         AND supplier.status='active'
        JOIN parties.tax_registrations supplier_registration
          ON supplier_registration.org_id=supplier.org_id
         AND supplier_registration.party_id=supplier.party_id
         AND supplier_registration.status='active'
        JOIN tax.portal_document_lines portal_line
          ON portal_line.org_id=organization.id
         AND portal_line.document_type='credit_note'
         AND portal_line.supplier_gstin=supplier_registration.registration_number
         AND portal_line.invoice_number=%s
        JOIN tax.portal_documents portal_document
          ON portal_document.org_id=portal_line.org_id
         AND portal_document.id=portal_line.portal_document_id
         AND portal_document.portal_document_type IN ('gstr2a','gstr2b')
         AND portal_document.status='parsed'
         AND portal_document.parsed_at IS NOT NULL
       WHERE sales_rule.status='active'
         AND sales_rule.side='sales'
         AND sales_rule.direction='credit'
         AND sales_rule.document_effect='decrease'
         AND sales_rule.tax_effect='statutory'
         AND sales_rule.effective_from<=
             (transaction_timestamp() AT TIME ZONE organization.timezone)::date
         AND (sales_rule.effective_to IS NULL OR sales_rule.effective_to>=
             (transaction_timestamp() AT TIME ZONE organization.timezone)::date)
    """
    cycle_count_sql = """
      SELECT membership.id::text, attachment.id::text,
             to_char(attachment.verified_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             balance.on_hand_quantity, conversion.multiplier,
             conversion.from_uom_code,attachment.status,
             to_char(attachment.document_date,'YYYY-MM-DD')
        FROM core.memberships membership
        JOIN core.users user_row
          ON user_row.id=membership.user_id
         AND user_row.auth_user_id=%s AND user_row.status='active'
        JOIN core.organizations organization
          ON organization.id=membership.org_id AND organization.status='active'
        JOIN inventory.stock_balances balance
          ON balance.org_id=membership.org_id AND balance.branch_id=%s
         AND balance.location_id=%s AND balance.batch_id=%s
         AND balance.product_id=%s AND balance.on_hand_quantity>0
         AND balance.inventory_value>0 AND balance.average_unit_cost>0
        JOIN inventory.locations location
          ON location.org_id=balance.org_id AND location.id=balance.location_id
         AND location.branch_id=balance.branch_id AND location.status='active'
         AND location.location_type='saleable' AND location.allows_sale
         AND NOT location.allows_negative_stock
         AND location.temperature_min_c IS NULL AND location.temperature_max_c IS NULL
        JOIN inventory.batches batch
          ON batch.org_id=balance.org_id AND batch.id=balance.batch_id
         AND batch.product_id=balance.product_id AND batch.status='released'
         AND batch.released_at IS NOT NULL AND batch.released_at<=transaction_timestamp()
         AND batch.expires_on>(transaction_timestamp() AT TIME ZONE organization.timezone)::date
         AND batch.mrp>0 AND batch.mrp_uom_conversion_id IS NOT NULL
        JOIN catalog.products product
          ON product.org_id=balance.org_id AND product.id=balance.product_id
         AND product.status='active' AND NOT product.cold_chain_required
         AND COALESCE(product.drug_schedule,'NONE') NOT IN ('H','H1','X')
         AND NOT COALESCE(product.ndps_regulated,false)
        JOIN catalog.uom_conversions conversion
          ON conversion.org_id=product.org_id AND conversion.product_id=product.id
         AND conversion.id=%s AND conversion.status='active'
         AND conversion.from_uom_code<>conversion.to_uom_code
         AND conversion.to_uom_code=product.base_uom_code AND conversion.multiplier>0
         AND conversion.valid_from<=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
         AND (conversion.valid_until IS NULL
              OR conversion.valid_until>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date)
        JOIN LATERAL (
            SELECT candidate.id,candidate.verified_at,candidate.status,
                   candidate.document_date
             FROM core.attachments candidate
             WHERE candidate.org_id=membership.org_id
               AND candidate.id=%s
               AND candidate.storage_bucket='canonical-demo-evidence'
               AND candidate.storage_object_path=%s
               AND candidate.sha256=%s
               AND candidate.evidence_kind='inventory_cycle_count_sheet'
               AND candidate.status IN ('verified','retained')
               AND candidate.verified_at IS NOT NULL
               AND candidate.verified_at<=transaction_timestamp()
               AND candidate.document_date=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
               AND candidate.retention_until IS NOT NULL
               AND candidate.retention_until>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
               AND candidate.sha256 IS NOT NULL
               AND NOT erp_automation_reads.active_command_evidence_in_use(
                   candidate.org_id,
                   'inventory.adjustment.prepare',
                   'evidence_attachment_id',
                   candidate.id
               )
             ORDER BY candidate.verified_at DESC,candidate.id
             LIMIT 2
        ) attachment ON true
       WHERE membership.org_id=%s AND membership.status='active'
       ORDER BY attachment.verified_at DESC,attachment.id
       LIMIT 2
    """
    expense_claim_sql = """
      SELECT membership.id::text,membership.row_version,
             COALESCE(employee.display_name,user_row.display_name),
             expense.id::text,expense.code,expense.name,
             reimbursement.id::text,reimbursement.code,reimbursement.name,
             receipt.id::text,receipt.original_filename,
             to_char(receipt.document_date,'YYYY-MM-DD'),receipt.status,
             to_char(receipt.verified_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             to_char(receipt.retention_until,'YYYY-MM-DD'),
             pg_catalog.encode(receipt.sha256,'hex')
        FROM core.memberships membership
        JOIN core.users user_row
          ON user_row.id=membership.user_id
         AND user_row.auth_user_id=%s AND user_row.status='active'
        LEFT JOIN hr.employees employee
          ON employee.org_id=membership.org_id
         AND employee.membership_id=membership.id
         AND employee.status='active'
         AND employee.branch_id=%s
        JOIN finance.accounts expense
          ON expense.org_id=membership.org_id AND expense.status='active'
         AND expense.account_type='expense' AND expense.currency_code='INR'
         AND NOT expense.allows_party_posting AND expense.code=%s
        JOIN core.settings reimbursement_role
          ON reimbursement_role.org_id=membership.org_id
         AND reimbursement_role.status='active'
         AND reimbursement_role.branch_id IS NULL
         AND reimbursement_role.namespace='finance.account_roles'
         AND reimbursement_role.key='member_reimbursement_liability'
         AND reimbursement_role.value_type='text'
        JOIN finance.accounts reimbursement
          ON reimbursement.org_id=reimbursement_role.org_id
         AND reimbursement.id=reimbursement_role.value_text::uuid
         AND reimbursement.status='active'
         AND reimbursement.account_type='liability'
         AND reimbursement.currency_code='INR'
         AND NOT reimbursement.allows_party_posting
         AND reimbursement.code=%s
        JOIN core.attachments receipt
          ON receipt.org_id=membership.org_id
         AND receipt.evidence_kind='expense_receipt'
         AND receipt.original_filename=%s
         AND receipt.status IN ('verified','retained')
         AND receipt.verified_at IS NOT NULL
         AND receipt.verified_at<=transaction_timestamp()
         AND receipt.document_date IS NOT NULL
         AND receipt.retention_until>=receipt.document_date
         AND receipt.byte_size>0
         AND pg_catalog.octet_length(receipt.sha256)=32
         AND NOT EXISTS (
             SELECT 1
               FROM finance.expense_claim_lines prior_line
               JOIN finance.expense_claims prior_claim
                 ON prior_claim.org_id=prior_line.org_id
                AND prior_claim.id=prior_line.expense_claim_id
              WHERE prior_line.org_id=receipt.org_id
                AND prior_line.receipt_attachment_id=receipt.id
                AND prior_claim.status NOT IN ('rejected','cancelled')
         )
       WHERE membership.org_id=%s AND membership.status='active'
    """
    destruction_sql = """
      SELECT balance.batch_id::text,batch.batch_number,batch.status,
             balance.on_hand_quantity::text,balance.inventory_value::text,
             location.id::text,location.name,conversion.id::text,
             conversion.from_uom_code,conversion.multiplier::text,
             certificate.id::text,certificate.original_filename,
             reversal.id::text,reversal.original_filename,
             registration.id::text,period.id::text,filing.id::text,rule.id::text,
             count(DISTINCT lot.id),
             (CASE WHEN sum(lot.remaining_base_quantity)=balance.on_hand_quantity
               THEN sum(lot.remaining_cgst_amount)
               ELSE round(sum(lot.remaining_cgst_amount)*balance.on_hand_quantity/
                          sum(lot.remaining_base_quantity),2) END)::text,
             (CASE WHEN sum(lot.remaining_base_quantity)=balance.on_hand_quantity
               THEN sum(lot.remaining_sgst_amount)
               ELSE round(sum(lot.remaining_sgst_amount)*balance.on_hand_quantity/
                          sum(lot.remaining_base_quantity),2) END)::text,
             (CASE WHEN sum(lot.remaining_base_quantity)=balance.on_hand_quantity
               THEN sum(lot.remaining_igst_amount)
               ELSE round(sum(lot.remaining_igst_amount)*balance.on_hand_quantity/
                          sum(lot.remaining_base_quantity),2) END)::text,
             (CASE WHEN sum(lot.remaining_base_quantity)=balance.on_hand_quantity
               THEN sum(lot.remaining_cess_amount)
               ELSE round(sum(lot.remaining_cess_amount)*balance.on_hand_quantity/
                          sum(lot.remaining_base_quantity),2) END)::text,
             to_char(certificate.verified_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             witness.display_name,witness_membership.id::text,
             returned_source.reason_code,pg_catalog.encode(certificate.sha256,'hex')
        FROM inventory.stock_balances balance
        JOIN inventory.batches batch ON batch.org_id=balance.org_id
          AND batch.id=balance.batch_id AND batch.product_id=balance.product_id
          AND batch.lot_kind='manufacturer_batch' AND batch.status='released'
        JOIN inventory.locations location ON location.org_id=balance.org_id
          AND location.id=balance.location_id AND location.id=%s
          AND location.location_type='quarantine' AND NOT location.allows_sale
        JOIN catalog.uom_conversions conversion ON conversion.org_id=balance.org_id
          AND conversion.product_id=balance.product_id AND conversion.id=%s
          AND conversion.status='active' AND conversion.multiplier>0
        JOIN tax.input_credit_lots lot ON lot.org_id=balance.org_id
          AND lot.batch_id=balance.batch_id AND lot.lineage_status='exact'
          AND lot.remaining_base_quantity>0
        JOIN tax.registrations registration ON registration.org_id=balance.org_id
          AND registration.status='active' AND registration.registration_type='regular'
        JOIN tax.registration_branches association ON association.org_id=registration.org_id
          AND association.registration_id=registration.id
          AND association.branch_id=balance.branch_id AND association.status='active'
        JOIN core.organizations organization ON organization.id=balance.org_id
          AND organization.status='active'
        JOIN tax.return_periods period ON period.org_id=registration.org_id
          AND period.registration_id=registration.id AND period.status='open'
          AND (transaction_timestamp() AT TIME ZONE organization.timezone)::date
              BETWEEN period.period_start AND period.period_end
        JOIN tax.returns filing ON filing.org_id=period.org_id
          AND filing.return_period_id=period.id AND filing.return_type='gstr3b'
          AND filing.status='draft'
        JOIN tax.itc_reversal_rule_versions rule ON rule.status='active'
          AND rule.event_kind='goods_destroyed' AND rule.legal_section='17(5)(h)'
          AND rule.gstr3b_table_code='4' AND rule.gstr3b_row_code='B(1)'
          AND rule.effective_from<=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
          AND (rule.effective_to IS NULL OR rule.effective_to>=
               (transaction_timestamp() AT TIME ZONE organization.timezone)::date)
        JOIN core.attachments certificate ON certificate.org_id=balance.org_id
          AND certificate.storage_object_path=%s
          AND certificate.evidence_kind='inventory_destruction_certificate'
          AND certificate.status IN ('verified','retained')
          AND certificate.verified_at IS NOT NULL
          AND certificate.document_date=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
          AND certificate.retention_until>=certificate.document_date
        JOIN core.attachments reversal ON reversal.org_id=balance.org_id
          AND reversal.storage_object_path=%s
          AND reversal.evidence_kind='inventory_destruction_itc_reversal'
          AND reversal.status IN ('verified','retained')
          AND reversal.verified_at IS NOT NULL
          AND reversal.document_date=certificate.document_date
          AND reversal.retention_until>=reversal.document_date
        JOIN core.memberships witness_membership
          ON witness_membership.org_id=certificate.org_id
         AND witness_membership.id=certificate.created_by_membership_id
         AND witness_membership.status='active'
        JOIN core.users witness ON witness.id=witness_membership.user_id
         AND witness.status='active'
        JOIN LATERAL (
          SELECT returned.reason_code
            FROM inventory.stock_ledger_entries returned_ledger
            JOIN inventory.inventory_documents returned_document
              ON returned_document.org_id=returned_ledger.org_id
             AND returned_document.id=returned_ledger.inventory_document_id
            JOIN sales.returns returned ON returned.org_id=returned_document.org_id
             AND returned.id=returned_document.sales_return_id
           WHERE returned_ledger.org_id=balance.org_id
             AND returned_ledger.location_id=balance.location_id
             AND returned_ledger.batch_id=balance.batch_id
             AND returned_ledger.quantity_delta>0
             AND returned_document.document_type='sales_return_receipt'
             AND returned_document.status='posted' AND returned.status='posted'
           ORDER BY returned.posted_at DESC,returned.id
           LIMIT 1
        ) returned_source ON true
       WHERE balance.org_id=%s AND balance.branch_id=%s
         AND balance.product_id=%s AND balance.on_hand_quantity>0
         AND balance.inventory_value>0 AND balance.average_unit_cost>0
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
         AND EXISTS (
           SELECT 1
             FROM tax.input_credit_applications restoration
             JOIN tax.input_credit_lots source_lot
               ON source_lot.org_id=restoration.org_id
              AND source_lot.id=restoration.input_credit_lot_id
             JOIN inventory.stock_ledger_entries restoration_ledger
               ON restoration_ledger.org_id=restoration.org_id
              AND restoration_ledger.id=restoration.stock_ledger_entry_id
            WHERE restoration.org_id=balance.org_id
              AND source_lot.batch_id=balance.batch_id
              AND restoration_ledger.location_id=balance.location_id
              AND restoration.application_kind='sales_return_restoration'
              AND restoration.application_direction='restore'
              AND restoration.status='posted'
            GROUP BY source_lot.batch_id,restoration_ledger.location_id
           HAVING sum(restoration.applied_base_quantity)>=balance.on_hand_quantity
         )
         AND NOT erp_automation_reads.active_command_evidence_in_use(
           certificate.org_id,
           'inventory.destruction.prepare',
           'certificate_attachment_id',
           certificate.id
         )
       GROUP BY balance.batch_id,batch.batch_number,batch.status,
                balance.on_hand_quantity,balance.inventory_value,location.id,location.name,
                conversion.id,conversion.from_uom_code,conversion.multiplier,
                certificate.id,certificate.original_filename,certificate.sha256,
                reversal.id,reversal.original_filename,
                registration.id,period.id,filing.id,rule.id,certificate.verified_at,
                witness.display_name,witness_membership.id,returned_source.reason_code
      HAVING count(DISTINCT lot.id)=1
         AND sum(lot.remaining_base_quantity)>=balance.on_hand_quantity
         AND sum(lot.remaining_cgst_amount+lot.remaining_sgst_amount+
                 lot.remaining_igst_amount+lot.remaining_cess_amount)>0
       ORDER BY balance.batch_id
    """
    variant_customer_sql = """
      SELECT requested.kind,account.customer_code,party.legal_name,
             address.id::text,address.row_version,registration.id::text,
             registration.taxpayer_type,address.state_code
        FROM (VALUES
              ('interstate',%s::uuid,%s::uuid,%s::uuid,'regular'),
              ('sez',%s::uuid,%s::uuid,%s::uuid,'sez_unit'))
             AS requested(kind,account_id,address_id,registration_id,taxpayer_type)
        JOIN parties.customer_accounts account
          ON account.org_id=%s AND account.id=requested.account_id
         AND account.status='active'
        JOIN parties.parties party
          ON party.org_id=account.org_id AND party.id=account.party_id
         AND party.status='active'
        JOIN parties.addresses address
          ON address.org_id=account.org_id AND address.party_id=account.party_id
         AND address.id=requested.address_id AND address.is_primary
         AND address.status='active'
        JOIN parties.tax_registrations registration
          ON registration.org_id=account.org_id
         AND registration.party_id=account.party_id
         AND registration.id=requested.registration_id
         AND registration.registration_type='GSTIN'
         AND registration.taxpayer_type=requested.taxpayer_type
         AND registration.state_code=address.state_code
         AND registration.status='active' AND registration.verified_at IS NOT NULL
        JOIN core.branches branch
          ON branch.org_id=account.org_id AND branch.id=%s AND branch.status='active'
       WHERE address.state_code<>branch.state_code
       ORDER BY requested.kind
    """
    with psycopg2.connect(database_url) as connection:
        connection.set_session(readonly=True, autocommit=False)
        with connection.cursor() as cursor:
            cursor.execute("SELECT erp_security.activate_context(%s::uuid,%s::uuid)", (auth_user_id, org_id))
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            selector_row: dict[str, Any] = {}
            variant_customer_rows: list[tuple[Any, ...]] = []
            if live23_identities <= set(identities):
                cursor.execute(
                    variant_customer_sql,
                    (
                        identities["interstate_customer_account_id"],
                        identities["interstate_delivery_address_id"],
                        identities["interstate_customer_gstin_id"],
                        identities["sez_customer_account_id"],
                        identities["sez_delivery_address_id"],
                        identities["sez_customer_gstin_id"],
                        org_id,
                        identities["branch_id"],
                    ),
                )
                variant_customer_rows = cursor.fetchall()
            cycle_count_rows: list[tuple[Any, ...]] = []
            if len(rows) == 1:
                selector_row = _authoritative_selector_row(rows[0])
                cursor.execute(
                    cycle_count_sql,
                    (
                        auth_user_id,
                        identities["branch_id"], identities["saleable_location_id"],
                        selector_row["direct_issue_batch_id"],
                        identities["product_id"],
                        identities["count_uom_conversion_id"],
                        identities["cycle_count_evidence_attachment_id"],
                        cycle_count_authority.storage_object_path,
                        psycopg2.Binary(cycle_count_authority.sha256),
                        org_id,
                    ),
                )
                cycle_count_rows = cursor.fetchall()
            cursor.execute(
                supplier_invoice_sql,
                (
                    f"demo/{run_token}/synthetic-ui-gstr2b.json",
                    identities["supplier_account_id"], org_id, supplier_invoice_number,
                ),
            )
            supplier_invoice_rows = cursor.fetchall()
            cursor.execute(
                bank_reconciliation_sql,
                (
                    f"demo/{run_token}/bank-statement.json",
                    identities["bank_account_id"], identities["bank_ledger_id"],
                    identities["branch_id"], org_id, bank_statement_reference,
                ),
            )
            bank_reconciliation_rows = cursor.fetchall()
            run_id = run_token.split("-", 1)[0]
            cursor.execute(
                adjustment_evidence_sql,
                (org_id, identities["supplier_account_id"], f"DEMO-SUP-CN-{run_id}"),
            )
            adjustment_evidence_rows = cursor.fetchall()
            run_attempt = run_token.split("-", 1)[1]
            cursor.execute(
                expense_claim_sql,
                (
                    auth_user_id,
                    identities["branch_id"],
                    f"LIVE18-EXP-{run_id}-{run_attempt}",
                    f"LIVE18-REIMB-{run_id}-{run_attempt}",
                    f"LIVE18-EXPENSE-{run_id}-{run_attempt}.pdf",
                    org_id,
                ),
            )
            expense_claim_rows = cursor.fetchall()
            cursor.execute(
                destruction_sql,
                (
                    identities["quarantine_location_id"],
                    identities["uom_conversion_id"],
                    f"demo/{run_token}/licensed-incineration-certificate-{run_token}.pdf",
                    f"demo/{run_token}/section-17-5-h-working-{run_token}.json",
                    org_id, identities["branch_id"], identities["product_id"],
                ),
            )
            destruction_rows = cursor.fetchall()
            cursor.execute(
                customer_receipt_evidence_sql,
                (
                    org_id,
                    f"demo/customer-receipt-evidence-{run_token}.json",
                ),
            )
            customer_receipt_evidence_rows = cursor.fetchall()
        connection.rollback()
    if len(rows) != 1:
        raise FixtureCompileError(f"authoritative selector facts resolved {len(rows)} rows, expected one")
    if len(cycle_count_rows) != 1:
        raise FixtureCompileError(
            "authoritative cycle-count membership, batch, UOM and evidence resolved "
            f"{len(cycle_count_rows)} rows, expected one"
        )
    if live23_identities <= set(identities) and (
        len(variant_customer_rows) != 2
        or {row[0] for row in variant_customer_rows} != {"interstate", "sez"}
    ):
        raise FixtureCompileError(
            "run-scoped inter-state and SEZ customer authority must resolve exactly once"
        )
    if len(supplier_invoice_rows) != 1:
        raise FixtureCompileError(
            "run-scoped supplier-invoice GSTR-2B authority resolved "
            f"{len(supplier_invoice_rows)} rows, expected one"
        )
    if len(adjustment_evidence_rows) != 1:
        raise FixtureCompileError(
            "canonical statutory adjustment rules, retained recipient evidence, "
            "and run-scoped supplier credit-note evidence resolved "
            f"{len(adjustment_evidence_rows)} rows, expected one"
        )
    if len(expense_claim_rows) != 1:
        raise FixtureCompileError(
            "canonical expense claimant, run-scoped accounts, and exact unused "
            f"reviewed receipt resolved {len(expense_claim_rows)} rows, expected one"
        )
    if len(destruction_rows) != 1:
        raise FixtureCompileError(
            "run-scoped GST destruction stock, ITC lineage, rule, return, and evidence "
            f"resolved {len(destruction_rows)} rows, expected one"
        )
    if len(customer_receipt_evidence_rows) != 1:
        raise FixtureCompileError(
            "run-scoped retained customer-receipt evidence must resolve exactly once"
        )
    (
        supplier_invoice_portal_line_id,
        resolved_invoice_number,
        invoice_date,
        supplier_invoice_portal_taxable_amount,
        supplier_invoice_portal_cgst_amount,
        supplier_invoice_portal_sgst_amount,
        supplier_invoice_portal_igst_amount,
        supplier_invoice_portal_cess_amount,
        supplier_invoice_portal_total_amount,
        supplier_invoice_portal_source_row_hash,
        supplier_invoice_variance_account_id,
    ) = supplier_invoice_rows[0]
    if resolved_invoice_number != supplier_invoice_number:
        raise FixtureCompileError("run-scoped supplier-invoice authority drifted")
    if len(bank_reconciliation_rows) != 1:
        raise FixtureCompileError(
            "run-scoped exact bank-statement/journal authority resolved "
            f"{len(bank_reconciliation_rows)} rows, expected one"
        )
    (
        bank_statement_id,
        bank_statement_line_id,
        bank_journal_entry_id,
        resolved_statement_reference,
        bank_statement_line_number,
        bank_transaction_date,
        bank_name,
        bank_journal_number,
        bank_matched_amount,
        bank_statement_direction,
    ) = bank_reconciliation_rows[0]
    if resolved_statement_reference != bank_statement_reference:
        raise FixtureCompileError("run-scoped bank statement authority drifted")
    resolved = dict(selector_row)
    (
        sales_adjustment_rule_id,
        sales_adjustment_reason_code,
        purchase_adjustment_rule_id,
        purchase_adjustment_reason_code,
        recipient_itc_evidence_id,
        recipient_itc_confirmed_at,
        supplier_credit_note_portal_line_id,
        supplier_credit_note_number,
    ) = adjustment_evidence_rows[0]
    (
        expense_claimant_membership_id,
        expense_claimant_membership_row_version,
        expense_claimant_name,
        expense_account_id,
        expense_account_code,
        expense_account_name,
        reimbursement_account_id,
        reimbursement_account_code,
        reimbursement_account_name,
        expense_receipt_attachment_id,
        expense_receipt_filename,
        expense_receipt_document_date,
        expense_receipt_status,
        expense_receipt_verified_at,
        expense_receipt_retention_until,
        expense_receipt_sha256,
    ) = expense_claim_rows[0]
    (
        destruction_batch_id, destruction_batch_number, destruction_batch_status,
        destruction_base_quantity, destruction_inventory_value,
        destruction_location_id, destruction_location_name,
        destruction_uom_conversion_id, destruction_uom_code, destruction_uom_multiplier,
        destruction_certificate_id, destruction_certificate_filename,
        destruction_reversal_evidence_id, destruction_reversal_evidence_filename,
        destruction_registration_id, destruction_period_id, destruction_gstr3b_return_id,
        destruction_rule_id, destruction_lot_count, destruction_cgst_amount,
        destruction_sgst_amount, destruction_igst_amount, destruction_cess_amount,
        destruction_confirmed_at, destruction_witness_name,
        destruction_witness_membership_id, destruction_return_reason_code,
        destruction_certificate_sha256,
    ) = destruction_rows[0]
    (
        cycle_count_membership_id,
        cycle_count_evidence_id,
        cycle_count_completed_at,
        cycle_count_system_base_quantity,
        cycle_count_uom_multiplier,
        cycle_count_uom_code,
        cycle_count_evidence_status,
        cycle_count_evidence_document_date,
    ) = cycle_count_rows[0]
    variant_customers = {row[0]: row for row in variant_customer_rows}
    return {
        "identity": {
            **identities,
            "supplier_invoice_portal_document_line_id": supplier_invoice_portal_line_id,
            "delivery_address_id": resolved.pop("delivery_address_id"),
            "delivery_address_row_version": resolved.pop("delivery_address_row_version"),
            "direct_issue_batch_id": resolved.pop("direct_issue_batch_id"),
            "supplier_destination_address_id": resolved.pop(
                "supplier_destination_address_id"
            ),
            **({
                "interstate_delivery_address_row_version": (
                    variant_customers["interstate"][4]
                ),
                "sez_delivery_address_row_version": variant_customers["sez"][4],
            } if variant_customers else {}),
            "cycle_count_evidence_attachment_id": cycle_count_evidence_id,
            "customer_receipt_evidence_attachment_id": (
                customer_receipt_evidence_rows[0][0]
            ),
            "cycle_count_counted_by_membership_id": cycle_count_membership_id,
            "bank_reconciliation_statement_id": bank_statement_id,
            "bank_reconciliation_statement_line_id": bank_statement_line_id,
            "bank_reconciliation_journal_entry_id": bank_journal_entry_id,
            "sales_adjustment_rule_id": sales_adjustment_rule_id,
            "purchase_adjustment_rule_id": purchase_adjustment_rule_id,
            "recipient_itc_evidence_attachment_id": recipient_itc_evidence_id,
            "supplier_credit_note_portal_line_id": supplier_credit_note_portal_line_id,
            "expense_claimant_membership_id": expense_claimant_membership_id,
            "expense_claimant_membership_row_version": (
                expense_claimant_membership_row_version
            ),
            "expense_account_id": expense_account_id,
            "expense_reimbursement_account_id": reimbursement_account_id,
            "expense_receipt_attachment_id": expense_receipt_attachment_id,
            "destruction_batch_id": destruction_batch_id,
            "destruction_location_id": destruction_location_id,
            "destruction_uom_conversion_id": destruction_uom_conversion_id,
            "destruction_certificate_attachment_id": destruction_certificate_id,
            "destruction_itc_reversal_evidence_attachment_id": (
                destruction_reversal_evidence_id
            ),
            "destruction_gst_registration_id": destruction_registration_id,
            "destruction_return_period_id": destruction_period_id,
            "destruction_gstr3b_return_id": destruction_gstr3b_return_id,
            "destruction_itc_reversal_rule_id": destruction_rule_id,
            "destruction_witness_membership_id": destruction_witness_membership_id,
        },
        "display": {
            **resolved,
            **({
                "interstate_customer_code": variant_customers["interstate"][1],
                "interstate_customer_name": variant_customers["interstate"][2],
                "sez_customer_code": variant_customers["sez"][1],
                "sez_customer_name": variant_customers["sez"][2],
            } if variant_customers else {}),
            "cycle_count_system_base_quantity": cycle_count_system_base_quantity,
            "cycle_count_uom_multiplier": cycle_count_uom_multiplier,
            "cycle_count_uom_code": cycle_count_uom_code,
            "cycle_count_evidence_label": (
                f"{cycle_count_evidence_status} · "
                f"{cycle_count_evidence_document_date} · "
                f"{str(cycle_count_evidence_id)[:8]}"
            ),
            "bank_reconciliation_candidate_label": (
                f"{bank_transaction_date} · {bank_name} · "
                f"{resolved_statement_reference} line {bank_statement_line_number} · "
                f"{bank_journal_number} · ₹{Decimal(bank_matched_amount):,.2f}"
            ),
            "sales_adjustment_rule_label": (
                f"{sales_adjustment_reason_code} — statutory"
            ),
            "purchase_adjustment_rule_label": (
                f"{purchase_adjustment_reason_code} — statutory"
            ),
            "supplier_credit_note_number": supplier_credit_note_number,
            "expense_claimant_name": expense_claimant_name,
            "expense_account_label": (
                f"{expense_account_code} — {expense_account_name}"
            ),
            "expense_reimbursement_account_label": (
                f"{reimbursement_account_code} — {reimbursement_account_name}"
            ),
            "expense_receipt_label": (
                f"{expense_receipt_filename} — {expense_receipt_document_date} — "
                f"{expense_receipt_status}"
            ),
            "expense_receipt_sha256": expense_receipt_sha256,
            "destruction_candidate_label": (
                f"{destruction_location_name} · {destruction_batch_number} · "
                f"{destruction_base_quantity} {destruction_uom_code}"
            ),
            "destruction_batch_status": destruction_batch_status,
            "destruction_batch_number": destruction_batch_number,
            "destruction_uom_code": destruction_uom_code,
            "destruction_certificate_label": destruction_certificate_filename,
            "destruction_itc_reversal_evidence_label": (
                destruction_reversal_evidence_filename
            ),
            "destruction_reason": (
                f"Certified destruction of quarantined goods returned for "
                f"{destruction_return_reason_code.replace('_', ' ')}"
            ),
            "destruction_authority_reference": (
                f"{destruction_certificate_filename} · sha256:{destruction_certificate_sha256}"
            ),
            "destruction_witness_name": destruction_witness_name,
            "destruction_witness_credential": (
                f"canonical-membership:{destruction_witness_membership_id}"
            ),
        },
        "clock": {
            "business_date": rows[0][-2],
            "business_datetime_local": rows[0][-1],
            "cycle_count_completed_at_utc": cycle_count_completed_at,
            "recipient_itc_confirmed_at_utc": recipient_itc_confirmed_at,
            "expense_receipt_document_date": expense_receipt_document_date,
            "expense_receipt_verified_at_utc": expense_receipt_verified_at,
            "expense_receipt_retention_until": expense_receipt_retention_until,
            "destruction_confirmed_at_utc": destruction_confirmed_at,
        },
        "choice": {
            "supplier_invoice_number": resolved_invoice_number,
            "supplier_invoice_date": invoice_date.isoformat(),
            "supplier_invoice_received_date": invoice_date.isoformat(),
            "bank_reconciliation_match_method": "reference_exact",
            "bank_reconciliation_matched_amount": format(
                Decimal(bank_matched_amount), ".2f"
            ),
            "bank_reconciliation_statement_direction": bank_statement_direction,
            "destruction_base_quantity": destruction_base_quantity,
            "destruction_inventory_value": destruction_inventory_value,
            "destruction_uom_multiplier": destruction_uom_multiplier,
            "destruction_input_credit_lot_count": str(destruction_lot_count),
            "destruction_cgst_amount": destruction_cgst_amount,
            "destruction_sgst_amount": destruction_sgst_amount,
            "destruction_igst_amount": destruction_igst_amount,
            "destruction_cess_amount": destruction_cess_amount,
            "destruction_reason_code": "quality_rejected",
            "supplier_invoice_portal_taxable_amount": supplier_invoice_portal_taxable_amount,
            "supplier_invoice_portal_cgst_amount": supplier_invoice_portal_cgst_amount,
            "supplier_invoice_portal_sgst_amount": supplier_invoice_portal_sgst_amount,
            "supplier_invoice_portal_igst_amount": supplier_invoice_portal_igst_amount,
            "supplier_invoice_portal_cess_amount": supplier_invoice_portal_cess_amount,
            "supplier_invoice_portal_total_amount": supplier_invoice_portal_total_amount,
            "supplier_invoice_portal_source_row_hash": supplier_invoice_portal_source_row_hash,
            "supplier_invoice_variance_account_id": supplier_invoice_variance_account_id,
        },
    }


def _operation_facts(
    operation_id: str,
    facts: dict[str, Any],
    scalars: dict[str, Any],
    used: set[str],
) -> dict[str, Any]:
    delivery_choices = {
        "sales_order": (
            "sales_order_delivery_offset_days",
            "sales_order_requested_delivery_date",
        ),
        "purchase_order": (
            "purchase_order_delivery_offset_days",
            "purchase_order_expected_delivery_date",
        ),
    }
    adjustment_limits = {
        "customer_credit_note": (
            "sales_invoice_quantity",
            "sales_invoice_free_quantity",
            "sales_return_billed_quantity",
            "sales_return_free_quantity",
            "customer_credit_note_billed_quantity",
            "customer_credit_note_free_quantity",
        ),
        "supplier_debit_note": (
            "goods_receipt_accepted_quantity",
            "goods_receipt_free_quantity",
            "purchase_return_billed_quantity",
            "purchase_return_free_quantity",
            None,
            None,
        ),
    }
    if operation_id == "delivery_challan":
        initial_base = Decimal(_leaf(
            facts, "display.direct_issue_available_base_quantity", "canonical fact"
        ))
        cycle_count_base = Decimal(_leaf(
            facts, "display.cycle_count_system_base_quantity", "canonical fact"
        ))
        sales_multiplier = Decimal(_leaf(
            facts, "display.sales_uom_multiplier", "canonical fact"
        ))
        count_multiplier = Decimal(_leaf(
            facts, "display.cycle_count_uom_multiplier", "canonical fact"
        ))
        if initial_base != cycle_count_base:
            raise FixtureCompileError(
                "delivery_challan prerequisite stock does not share the exact "
                "cycle-count and direct-issue batch balance"
            )
        if min(initial_base, sales_multiplier, count_multiplier) <= 0:
            raise FixtureCompileError(
                "delivery_challan prerequisite stock and UOM multipliers must be positive"
            )
        adjusted_base = (
            initial_base
            - Decimal(_leaf(
                scalars, "stock_adjustment_loss_quantity", "reviewed scalar"
            )) * count_multiplier
        )
        invoice_quantity = Decimal(_leaf(
            scalars, "sales_invoice_quantity", "reviewed scalar"
        ))
        order_quantity = Decimal(_leaf(
            scalars, "sales_order_quantity", "reviewed scalar"
        ))
        free_quantity = Decimal(_leaf(
            scalars, "sales_invoice_free_quantity", "reviewed scalar"
        ))
        if order_quantity != invoice_quantity:
            raise FixtureCompileError(
                "delivery_challan reviewed sales-order billed quantity must equal "
                "the downstream dispatch-allocated invoice quantity"
            )
        dispatch_base = (order_quantity + free_quantity) * sales_multiplier
        if adjusted_base < dispatch_base:
            raise FixtureCompileError(
                "delivery_challan reviewed sales order exceeds the exact selected "
                "batch stock remaining after its prior adjustment"
            )
        return facts
    if operation_id == "supplier_invoice":
        chain = supplier_invoice_chain_choices(scalars)
        portal_components = {
            key: Decimal(_leaf(facts, f"choice.{key}", "canonical fact"))
            for key in (
                "supplier_invoice_portal_taxable_amount",
                "supplier_invoice_portal_cgst_amount",
                "supplier_invoice_portal_sgst_amount",
                "supplier_invoice_portal_igst_amount",
                "supplier_invoice_portal_cess_amount",
                "supplier_invoice_portal_total_amount",
            )
        }
        if portal_components["supplier_invoice_portal_taxable_amount"] <= 0 or any(
            value < 0 for value in portal_components.values()
        ):
            raise FixtureCompileError("run-scoped GSTR-2B amounts must be non-negative")
        reconciled_total = sum(
            (
                portal_components[key]
                for key in (
                    "supplier_invoice_portal_taxable_amount",
                    "supplier_invoice_portal_cgst_amount",
                    "supplier_invoice_portal_sgst_amount",
                    "supplier_invoice_portal_igst_amount",
                    "supplier_invoice_portal_cess_amount",
                )
            ),
            Decimal("0"),
        )
        if portal_components["supplier_invoice_portal_total_amount"] != reconciled_total:
            raise FixtureCompileError(
                "run-scoped GSTR-2B total does not reconcile to taxable and GST components"
            )
        expected_source_hash = hashlib.sha256(json.dumps(
            {
                "invoice_number": _leaf(
                    facts, "choice.supplier_invoice_number", "canonical fact"
                ),
                "reviewed_chain": chain,
                "economics": {
                    "gst_taxable_total": format(
                        portal_components["supplier_invoice_portal_taxable_amount"], ".2f"
                    ),
                    "cgst_total": format(
                        portal_components["supplier_invoice_portal_cgst_amount"], ".2f"
                    ),
                    "sgst_total": format(
                        portal_components["supplier_invoice_portal_sgst_amount"], ".2f"
                    ),
                    "igst_total": format(
                        portal_components["supplier_invoice_portal_igst_amount"], ".2f"
                    ),
                    "cess_total": format(
                        portal_components["supplier_invoice_portal_cess_amount"], ".2f"
                    ),
                    "grand_total": format(
                        portal_components["supplier_invoice_portal_total_amount"], ".2f"
                    ),
                },
            },
            separators=(",", ":"), sort_keys=True,
        ).encode()).hexdigest()
        if _leaf(
            facts, "choice.supplier_invoice_portal_source_row_hash", "canonical fact"
        ) != expected_source_hash:
            raise FixtureCompileError(
                "run-scoped GSTR-2B row is not bound to the reviewed PO/GRN scalar pack"
            )
        return facts
    if operation_id == "expense_claim":
        amount = _leaf(scalars, "expense_claim_amount", "reviewed scalar")
        if not re.fullmatch(r"(?:0|[1-9][0-9]{0,17})\.[0-9]{2}", amount):
            raise FixtureCompileError(
                "expense_claim_amount must be an exact positive INR amount with two decimal places"
            )
        if Decimal(amount) <= 0:
            raise FixtureCompileError(
                "expense_claim_amount must be greater than zero"
            )
        for key, maximum in (
            ("expense_claim_purpose", 1024),
            ("expense_claim_merchant", 256),
            ("expense_claim_description", 1024),
        ):
            value = _leaf(scalars, key, "reviewed scalar").strip()
            if not value or len(value) > maximum:
                raise FixtureCompileError(
                    f"{key} must be specific non-empty text of at most {maximum} characters"
                )
        receipt_path = Path(
            _leaf(scalars, "expense_receipt_pdf_path", "reviewed scalar")
        )
        if not receipt_path.is_absolute() or not receipt_path.is_file():
            raise FixtureCompileError(
                "expense_receipt_pdf_path must be an existing absolute file path"
            )
        receipt_bytes = receipt_path.read_bytes()
        if (
            receipt_path.suffix.lower() != ".pdf"
            or not receipt_bytes.startswith(b"%PDF-")
            or b"%%EOF" not in receipt_bytes[-2048:]
            or not 0 < len(receipt_bytes) <= 10 * 1024 * 1024
        ):
            raise FixtureCompileError(
                "expense_receipt_pdf_path must identify one valid PDF no larger than 10 MiB"
            )
        return facts
    if operation_id in adjustment_limits:
        (
            original_billed_key,
            original_free_key,
            prior_billed_key,
            prior_free_key,
            note_billed_key,
            note_free_key,
        ) = adjustment_limits[operation_id]
        values: dict[str, Decimal] = {}
        note_billed_value = (
            _leaf(scalars, note_billed_key, "reviewed scalar")
            if note_billed_key else _leaf(scalars, prior_billed_key, "reviewed scalar")
        )
        note_free_value = (
            _leaf(scalars, note_free_key, "reviewed scalar")
            if note_free_key else _leaf(scalars, prior_free_key, "reviewed scalar")
        )
        for key, rendered in (
            (original_billed_key, _leaf(scalars, original_billed_key, "reviewed scalar")),
            (original_free_key, _leaf(scalars, original_free_key, "reviewed scalar")),
            (prior_billed_key, _leaf(scalars, prior_billed_key, "reviewed scalar")),
            (prior_free_key, _leaf(scalars, prior_free_key, "reviewed scalar")),
            (note_billed_key or "derived_note_billed_quantity", note_billed_value),
            (note_free_key or "derived_note_free_quantity", note_free_value),
        ):
            if not re.fullmatch(r"(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?", rendered):
                raise FixtureCompileError(
                    f"{key} must be a non-negative plain decimal with at most 6 fractional digits"
                )
            values[key] = Decimal(rendered)
        remaining_billed = values[original_billed_key] - values[prior_billed_key]
        remaining_free = values[original_free_key] - values[prior_free_key]
        if remaining_billed < 0 or remaining_free < 0:
            raise FixtureCompileError(
                f"{operation_id} prior return quantities exceed the reviewed source quantities"
            )
        if (
            Decimal(note_billed_value) + Decimal(note_free_value) <= 0
            or Decimal(note_billed_value) > remaining_billed
            or Decimal(note_free_value) > remaining_free
        ):
            raise FixtureCompileError(
                f"{operation_id} billed/free quantities exceed the exact post-return source ceiling"
            )
        reason_key = f"{operation_id}_reason"
        reason = _leaf(scalars, reason_key, "reviewed scalar").strip()
        if not reason or len(reason) > 1024:
            raise FixtureCompileError(
                f"{reason_key} must be a specific non-empty reason of at most 1024 characters"
            )
        if operation_id == "supplier_debit_note":
            return {
                **facts,
                "choice": {
                    **(facts.get("choice") or {}),
                    "supplier_debit_note_billed_quantity": note_billed_value,
                    "supplier_debit_note_free_quantity": note_free_value,
                },
            }
        return facts
    if operation_id == "sales_invoice":
        decimal_rules = {
            "sales_invoice_quantity": (6, Decimal("0"), None, False),
            "sales_invoice_rate": (4, Decimal("0"), None, False),
            "sales_invoice_discount_percent": (6, Decimal("0"), Decimal("100"), True),
            "sales_invoice_free_quantity": (6, Decimal("0"), None, False),
            "sales_invoice_distance_km": (2, Decimal("0"), None, False),
        }
        for key, (scale, minimum, maximum, minimum_inclusive) in decimal_rules.items():
            rendered = _leaf(scalars, key, "reviewed scalar")
            if not re.fullmatch(rf"(?:0|[1-9][0-9]{{0,13}})(?:\.[0-9]{{1,{scale}}})?", rendered):
                raise FixtureCompileError(
                    f"{key} must be a non-negative plain decimal with at most {scale} fractional digits"
                )
            try:
                numeric = Decimal(rendered)
            except InvalidOperation as exc:
                raise FixtureCompileError(f"{key} is not a valid reviewed decimal") from exc
            if (numeric < minimum if minimum_inclusive else numeric <= minimum) or (
                maximum is not None and numeric > maximum
            ):
                comparator = "at least" if minimum_inclusive else "greater than"
                ceiling = f" and no greater than {maximum}" if maximum is not None else ""
                raise FixtureCompileError(
                    f"{key} must be {comparator} {minimum}{ceiling}"
                )
        treatment = _leaf(
            scalars, "sales_invoice_free_supply_tax_treatment", "reviewed scalar"
        )
        if treatment not in {
            "excluded_from_taxable_value", "included_at_unit_rate",
        }:
            raise FixtureCompileError(
                "sales_invoice_free_supply_tax_treatment must be an explicit canonical treatment"
            )
        if Decimal(_leaf(
            scalars, "sales_invoice_quantity", "reviewed scalar"
        )) != Decimal(_leaf(
            scalars, "sales_order_quantity", "reviewed scalar"
        )):
            raise FixtureCompileError(
                "sales_invoice_quantity must equal the exact billed quantity dispatched "
                "from the prior sales order"
            )
        if Decimal(_leaf(
            scalars, "sales_invoice_rate", "reviewed scalar"
        )) != Decimal(_leaf(
            scalars, "sales_order_rate", "reviewed scalar"
        )):
            raise FixtureCompileError(
                "sales_invoice_rate must equal the exact rate inherited from the prior sales order"
            )
        # The base Live18 invoice consumes the exact posted dispatch. This reviewed
        # distance remains active authority for the direct-issue Live23 invoice
        # variants compiled from the same scalar pack.
        used.add("sales_invoice_distance_km")
        available_base = Decimal(_leaf(
            facts, "display.direct_issue_available_base_quantity", "canonical fact"
        ))
        uom_multiplier = Decimal(_leaf(
            facts, "display.sales_uom_multiplier", "canonical fact"
        ))
        requested_base = (
            Decimal(_leaf(scalars, "sales_invoice_quantity", "reviewed scalar"))
            + Decimal(_leaf(scalars, "sales_invoice_free_quantity", "reviewed scalar"))
        ) * uom_multiplier
        if uom_multiplier <= 0 or requested_base > available_base:
            raise FixtureCompileError(
                "sales_invoice reviewed billed/free quantities exceed the exact selected batch stock"
            )
        return facts
    if operation_id == "stock_adjustment":
        loss_text = _leaf(
            scalars, "stock_adjustment_loss_quantity", "reviewed scalar"
        )
        if not re.fullmatch(r"(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?", loss_text):
            raise FixtureCompileError(
                "stock_adjustment_loss_quantity must be a positive plain decimal with at most 6 fractional digits"
            )
        loss_quantity = Decimal(loss_text)
        if loss_quantity <= 0:
            raise FixtureCompileError(
                "stock_adjustment_loss_quantity must be greater than zero"
            )
        initial_base = Decimal(_leaf(
            facts, "display.cycle_count_system_base_quantity", "canonical fact"
        ))
        count_multiplier = Decimal(_leaf(
            facts, "display.cycle_count_uom_multiplier", "canonical fact"
        ))
        expected_system_base = initial_base
        if expected_system_base <= 0 or count_multiplier <= 0:
            raise FixtureCompileError(
                "authoritative cycle-count stock and selected UOM multiplier must be positive"
            )
        counted_quantity = expected_system_base / count_multiplier - loss_quantity
        if counted_quantity < 0:
            raise FixtureCompileError(
                "stock_adjustment_loss_quantity exceeds exact authoritative stock"
            )
        exact_counted_quantity = counted_quantity.quantize(Decimal("0.000001"))
        if counted_quantity != exact_counted_quantity:
            raise FixtureCompileError(
                "derived cycle-count quantity is not exactly representable at canonical scale 6"
            )
        used.add("stock_adjustment_loss_quantity")
        return {
            **facts,
            "choice": {
                **(facts.get("choice") or {}),
                "stock_adjustment_counted_quantity": format(
                    exact_counted_quantity, ".6f"
                ),
                "stock_adjustment_expected_system_base_quantity": format(
                    expected_system_base, ".6f"
                ),
            },
        }
    if operation_id == "goods_receipt":
        offset_text = _leaf(
            scalars, "goods_receipt_expiry_offset_days", "reviewed scalar"
        )
        expiry_offset = (
            r"(?:[3-9][0-9]|[1-9][0-9]{2}|[1-2][0-9]{3}|"
            r"3[0-5][0-9]{2}|36[0-4][0-9]|3650)"
        )
        if not re.fullmatch(expiry_offset, offset_text):
            raise FixtureCompileError(
                "goods_receipt_expiry_offset_days must be an integer from 30 through 3650"
            )
        try:
            business_date = date.fromisoformat(
                _leaf(facts, "clock.business_date", "canonical fact")
            )
        except ValueError as exc:
            raise FixtureCompileError("canonical business date is invalid") from exc
        used.add("goods_receipt_expiry_offset_days")
        return {
            **facts,
            "choice": {
                **(facts.get("choice") or {}),
                "goods_receipt_expiry_date": (
                    business_date + timedelta(days=int(offset_text))
                ).isoformat(),
            },
        }
    if operation_id not in delivery_choices:
        return facts
    offset_key, choice_key = delivery_choices[operation_id]
    offset_text = _leaf(scalars, offset_key, "reviewed scalar")
    if not re.fullmatch(r"[1-9]|[12][0-9]|30", offset_text):
        raise FixtureCompileError(
            f"{offset_key} must be an integer from 1 through 30"
        )
    try:
        business_date = date.fromisoformat(_leaf(facts, "clock.business_date", "canonical fact"))
    except ValueError as exc:
        raise FixtureCompileError("canonical business date is invalid") from exc
    used.add(offset_key)
    return {
        **facts,
        "choice": {
            **(facts.get("choice") or {}),
            choice_key: (
                business_date + timedelta(days=int(offset_text))
            ).isoformat(),
        },
    }


def _compile_value(value: Any, facts: dict[str, Any], scalars: dict[str, Any], used: set[str]) -> Any:
    if isinstance(value, list):
        return [_compile_value(item, facts, scalars, used) for item in value]
    if isinstance(value, dict):
        return {key: _compile_value(item, facts, scalars, used) for key, item in value.items()}
    if not isinstance(value, str):
        return value

    def replace(match: re.Match[str]) -> str:
        authority, dotted = match.groups()
        if authority == "scalar":
            used.add(dotted)
            return _leaf(scalars, dotted, "reviewed scalar")
        return _leaf(facts, dotted, "canonical fact")

    rendered = TOKEN_RE.sub(replace, value)
    residue = re.sub(RUNTIME_TOKEN_RE, "", rendered)
    if "{{" in residue or "}}" in residue:
        raise FixtureCompileError(f"template contains unsupported token: {value}")
    return rendered


def _validate_compiled_steps(
    operation_id: str, operation: Any, approval_policy: str
) -> None:
    expected_keys = {*PHASES, "lifecycle_mode"}
    if not isinstance(operation, dict) or set(operation) != expected_keys:
        raise FixtureCompileError(
            f"{operation_id} template must define exactly {sorted(expected_keys)}"
        )
    lifecycle_mode = operation["lifecycle_mode"]
    if lifecycle_mode not in LIFECYCLE_MODES:
        raise FixtureCompileError(f"{operation_id} has unsupported lifecycle_mode")
    if lifecycle_mode == "combined_actor_confirmation" and approval_policy != "actor_confirmation":
        raise FixtureCompileError(
            f"{operation_id} combined lifecycle requires actor_confirmation policy"
        )
    steps = operation
    for phase in PHASES:
        rows = steps[phase]
        if not isinstance(rows, list) or not rows:
            raise FixtureCompileError(f"{operation_id}.{phase} must be non-empty")
        for index, step in enumerate(rows):
            if not isinstance(step, dict) or step.get("actor") not in ACTORS or step.get("action") not in ACTIONS:
                raise FixtureCompileError(f"{operation_id}.{phase}[{index}] has invalid actor/action")
            action = step["action"]
            locator = step.get("locator")
            if action == "goto":
                if locator is not None or not str(step.get("value", "")).startswith("/"):
                    raise FixtureCompileError(f"{operation_id}.{phase}[{index}] has invalid goto")
            else:
                if not isinstance(locator, dict) or locator.get("kind") not in LOCATOR_KINDS or not isinstance(locator.get("name"), str):
                    raise FixtureCompileError(f"{operation_id}.{phase}[{index}] requires a valid locator")
                if locator["kind"] == "role" and not isinstance(locator.get("role"), str):
                    raise FixtureCompileError(f"{operation_id}.{phase}[{index}] role locator omitted role")
                if locator["kind"] != "testId" and locator.get("exact") is not True:
                    raise FixtureCompileError(
                        f"{operation_id}.{phase}[{index}] must use an exact accessible locator or canonical test ID"
                    )
            encoded = json.dumps(step, sort_keys=True)
            if action == "click" and COMMUNICATION_ACTION.search(encoded):
                raise FixtureCompileError(f"{operation_id}.{phase}[{index}] targets communication")
    if steps["prepare_steps"][0]["action"] != "goto":
        raise FixtureCompileError(f"{operation_id}.prepare_steps must restart from a route")
    if not any(row["action"] == "expectText" for row in steps["missing_required_steps"]):
        raise FixtureCompileError(f"{operation_id}.missing_required_steps omitted visible assertion")
    missing_boundary = any(
        row["action"] in {"click", "expectDisabled"}
        and row.get("locator", {}).get("kind") == "role"
        and row.get("locator", {}).get("role") == "button"
        for row in steps["missing_required_steps"]
    ) or any(
        row["action"] == "press" and row.get("value") == "Control+s"
        for row in steps["missing_required_steps"]
    )
    if not missing_boundary:
        raise FixtureCompileError(
            f"{operation_id}.missing_required_steps must activate or prove disabled a write-boundary CTA"
        )
    preview_assertions = [
        row for row in steps["approval_steps"]
        if row["action"] == "expectText"
        and row.get("locator", {}).get("kind") == "testId"
        and row.get("locator", {}).get("name") == "canonical-immutable-preview"
        and row.get("value") not in {"", "{{command_request_id}}", "{{preview_hash}}"}
    ]
    if len(preview_assertions) != 1:
        raise FixtureCompileError(
            f"{operation_id}.approval_steps must assert one operation-specific immutable preview fact"
        )
    for phase in ("approval_steps", "execute_steps"):
        if "{{command_request_id}}" not in json.dumps(steps[phase], sort_keys=True):
            raise FixtureCompileError(f"{operation_id}.{phase} does not target captured command")


def compile_fixture(
    matrix_path: Path,
    template_directory: Path,
    facts: dict[str, Any],
    scalars: dict[str, Any],
    readiness_path: Path | None = None,
) -> dict[str, Any]:
    matrix = _object(matrix_path, "operation matrix")
    catalog = matrix.get("operations", [])
    expected_catalog = [row["id"] for row in catalog]
    operation_count = matrix.get("operation_count")
    required_count = matrix.get("required_operation_count")
    deferred_rows = matrix.get("deferred_operations")
    if (
        operation_count != 18
        or len(expected_catalog) != operation_count
        or len(set(expected_catalog)) != operation_count
        or not isinstance(deferred_rows, list)
        or required_count != operation_count - len(deferred_rows)
    ):
        raise FixtureCompileError(
            "operation matrix must declare 18 unique operations and an exact ready scope"
        )
    deferred: dict[str, dict[str, Any]] = {}
    for row in deferred_rows:
        if (
            not isinstance(row, dict)
            or row.get("status") != "deferred"
            or row.get("id") not in expected_catalog
            or not isinstance(row.get("blocker"), str)
            or not row["blocker"].strip()
            or not isinstance(row.get("blocker_code"), str)
            or re.fullmatch(r"[A-Z][A-Z0-9_]+", row["blocker_code"]) is None
            or row["id"] in deferred
        ):
            raise FixtureCompileError("operation matrix contains an invalid deferral")
        deferred[row["id"]] = row
    expected = [value for value in expected_catalog if value not in deferred]
    if len(expected) != required_count:
        raise FixtureCompileError("operation matrix ready scope is incomplete")
    deferred_scalar_keys: set[str] = set()
    for operation_id, deferral in deferred.items():
        path = template_directory / f"{operation_id}.json"
        template = _object(path, f"{operation_id} deferred template")
        if (
            template.get("template_schema") != TEMPLATE_SCHEMA
            or template.get("operation_id") != operation_id
            or template.get("release_status") != "deferred"
            or template.get("release_blocker_code") != deferral["blocker_code"]
            or not isinstance(template.get("steps"), dict)
        ):
            raise FixtureCompileError(
                f"invalid deferred UI template authority: {operation_id}"
            )
        deferred_scalar_keys.update(
            dotted
            for authority, dotted in TOKEN_RE.findall(json.dumps(template, sort_keys=True))
            if authority == "scalar"
        )
    if readiness_path is not None:
        readiness = _object(readiness_path, "UI template readiness")
        readiness_rows = readiness.get("operations")
        if not isinstance(readiness_rows, list):
            raise FixtureCompileError("UI template readiness operations must be a list")
        readiness_ids = [
            row.get("id") for row in readiness_rows if isinstance(row, dict)
        ]
        if (
            len(readiness_ids) != len(expected_catalog)
            or len(set(readiness_ids)) != len(readiness_ids)
            or set(readiness_ids) != set(expected_catalog)
        ):
            raise FixtureCompileError(
                "UI template readiness must cover the exact operation matrix"
            )
        invalid_status = [
            row.get("id") for row in readiness_rows
            if row.get("status") not in {"ready", "blocked", "deferred"}
        ]
        if invalid_status:
            raise FixtureCompileError(
                f"UI template readiness has invalid status: {invalid_status}"
            )
        ready_ids = {
            row["id"] for row in readiness_rows if row["status"] == "ready"
        }
        if readiness.get("ready_count") != len(ready_ids):
            raise FixtureCompileError(
                "UI template readiness count does not match its ready operations"
            )
        if readiness.get("ready_count") != required_count:
            raise FixtureCompileError(
                "UI template readiness does not match the matrix required scope"
            )
        deferred_readiness = {
            row["id"]: row for row in readiness_rows if row["status"] == "deferred"
        }
        if readiness.get("deferred_count") != len(deferred_readiness):
            raise FixtureCompileError(
                "UI template readiness deferred count does not match its operations"
            )
        if set(deferred_readiness) != set(deferred):
            raise FixtureCompileError(
                "UI template readiness deferrals differ from the operation matrix"
            )
        for operation_id, row in deferred_readiness.items():
            if (
                row.get("blocker_code") != deferred[operation_id]["blocker_code"]
                or row.get("blocker") != deferred[operation_id]["blocker"]
            ):
                raise FixtureCompileError(
                    f"{operation_id} deferred blocker differs from the operation matrix"
                )
        expected = [operation_id for operation_id in expected if operation_id in ready_ids]
    missing_templates = [
        operation_id
        for operation_id in expected
        if not (template_directory / f"{operation_id}.json").is_file()
    ]
    if missing_templates:
        raise FixtureCompileError(
            f"missing evidence-backed UI templates: {missing_templates}"
        )
    operations: dict[str, Any] = {}
    used: set[str] = set()
    for operation_id in expected:
        path = template_directory / f"{operation_id}.json"
        template = _object(path, f"{operation_id} template")
        if template.get("template_schema") != TEMPLATE_SCHEMA or template.get("operation_id") != operation_id:
            raise FixtureCompileError(f"invalid UI template authority: {operation_id}")
        dependencies = set(RESOURCE_TOKEN_RE.findall(json.dumps(template, sort_keys=True)))
        unavailable = sorted(dependencies - set(operations))
        if unavailable:
            raise FixtureCompileError(
                f"{operation_id} references unavailable prior operation resources: {unavailable}"
            )
        operation_facts = _operation_facts(operation_id, facts, scalars, used)
        compiled_operation = _compile_value(
            {
                "lifecycle_mode": template.get("lifecycle_mode"),
                **(template.get("steps") or {}),
            },
            operation_facts,
            scalars,
            used,
        )
        matrix_row = next(row for row in matrix["operations"] if row["id"] == operation_id)
        _validate_compiled_steps(
            operation_id, compiled_operation, matrix_row.get("approval_policy")
        )
        operations[operation_id] = compiled_operation
    unused = sorted(set(scalars) - used - deferred_scalar_keys)
    if unused:
        raise FixtureCompileError(f"unreviewed/unused scalar values are forbidden: {unused}")
    return {"fixture_schema": FIXTURE_SCHEMA, "operations": operations}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--identity-evidence", type=Path, required=True)
    parser.add_argument("--reviewed-scalars", type=Path, required=True)
    parser.add_argument("--matrix", type=Path, required=True)
    parser.add_argument("--readiness", type=Path, required=True)
    parser.add_argument("--templates", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    fact_source = parser.add_mutually_exclusive_group(required=True)
    fact_source.add_argument("--authoritative-facts", type=Path)
    fact_source.add_argument("--resolve-from-database", action="store_true")
    args = parser.parse_args()
    org_id, identities = load_identity_evidence(args.identity_evidence)
    if args.authoritative_facts is not None:
        facts = load_authoritative_facts(
            args.authoritative_facts,
            expected_sha=os.environ["REVIEWED_DEPLOY_SHA"],
            project_ref=os.environ["CANONICAL_STAGING_PROJECT_REF"],
            run_token=os.environ["LIVE18_RUN_TOKEN"],
            auth_user_id=os.environ["PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID"],
            org_id=org_id,
            identities=identities,
        )
    else:
        facts = resolve_authoritative_facts(
            os.environ["PHARMA_CANONICAL_LIVE_DATABASE_URL"],
            os.environ["PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID"],
            org_id,
            identities,
            os.environ["LIVE18_RUN_TOKEN"],
        )
    fixture = compile_fixture(
        args.matrix,
        args.templates,
        facts,
        load_reviewed_scalars(args.reviewed_scalars),
        args.readiness,
    )
    if os.getenv("LIVE23_BUSINESS_VARIANTS_REQUIRED") == "true":
        from scripts.live_acceptance.live23_variants import (
            compile_supported_business_variants,
        )
        fixture["business_variants"] = compile_supported_business_variants(
            facts,
            load_reviewed_scalars(args.reviewed_scalars),
        )
    args.output.write_text(json.dumps(fixture, separators=(",", ":")) + "\n", encoding="utf-8")
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
