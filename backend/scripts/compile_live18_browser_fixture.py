#!/usr/bin/env python3
"""Compile reviewed live18 UI templates from canonical staging facts.

Templates are repository-owned interaction intent.  Canonical identities and
labels are resolved after disposable staging provisioning.  Only genuinely
non-derivable operator choices may arrive in the compact reviewed scalar pack.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import psycopg2


FIXTURE_SCHEMA = "aasopharma.live18.fixture.v1"
SCALAR_SCHEMA = "aasopharma.live18.reviewed-scalars.v1"
TEMPLATE_SCHEMA = "aasopharma.live18.ui-template.v1"
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
ACTIONS = {"goto", "click", "fill", "select", "press", "expectText"}
LOCATOR_KINDS = {"role", "label", "placeholder", "text", "testId"}
COMMUNICATION_ACTION = re.compile(r"whats?app|e-?mail|sms|text message|phone|call|tel:", re.I)


class FixtureCompileError(RuntimeError):
    pass


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


def load_reviewed_scalars(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    if len(raw) > MAX_SCALAR_BYTES:
        raise FixtureCompileError(
            f"reviewed scalar pack exceeds {MAX_SCALAR_BYTES} bytes"
        )
    pack = json.loads(raw)
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
    }
    if set(identities) != required:
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
             delivery_address.id::text,delivery_address.row_version,
             direct_issue_batch.id::text,direct_issue_batch.batch_number,
             direct_issue_batch.available_base_quantity,uom.multiplier,
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
       WHERE branch.org_id=%s AND branch.id=%s
         AND branch.status='active' AND customer.status='active' AND supplier.status='active'
         AND product.status='active' AND source.status='active' AND quarantine.status='active'
         AND destination_branch.status='active' AND destination.status='active'
         AND bank.status='active' AND ledger.status='active'
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
    supplier_challan_number = f"DEMO-UI-CH-{run_token}"
    supplier_invoice_number = f"DEMO-UI-SUP-{run_token}"
    bank_statement_reference = f"DEMO-UI-BANK-{run_token}"
    supplier_invoice_sql = """
      SELECT receipt.id::text, receipt.supplier_challan_date,
             portal_line.invoice_number, portal_line.invoice_date
        FROM procurement.goods_receipts AS receipt
        JOIN procurement.goods_receipt_lines AS receipt_line
          ON receipt_line.org_id=receipt.org_id
         AND receipt_line.goods_receipt_id=receipt.id
        JOIN parties.supplier_accounts AS supplier
          ON supplier.org_id=receipt.org_id
         AND supplier.id=receipt.supplier_account_id
         AND supplier.status='active'
        JOIN parties.tax_registrations AS supplier_registration
          ON supplier_registration.org_id=supplier.org_id
         AND supplier_registration.party_id=supplier.party_id
         AND supplier_registration.status='active'
        JOIN tax.portal_document_lines AS portal_line
          ON portal_line.org_id=receipt.org_id
         AND portal_line.document_type='invoice'
         AND portal_line.supplier_gstin=supplier_registration.registration_number
         AND portal_line.invoice_number=%s
         AND portal_line.invoice_date=receipt.supplier_challan_date
        JOIN tax.portal_documents AS portal_document
          ON portal_document.org_id=portal_line.org_id
         AND portal_document.id=portal_line.portal_document_id
         AND portal_document.portal_document_type='gstr2b'
         AND portal_document.status='parsed'
         AND portal_document.parsed_at IS NOT NULL
       WHERE receipt.org_id=%s
         AND receipt.supplier_challan_number=%s
         AND receipt.status='posted'
         AND NOT EXISTS (
           SELECT 1
             FROM procurement.supplier_invoice_receipt_allocations AS allocation
            WHERE allocation.org_id=receipt_line.org_id
              AND allocation.goods_receipt_line_id=receipt_line.id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM automation.command_requests AS command
            WHERE command.org_id=portal_line.org_id
              AND command.capability_code='procurement.supplier_invoice.prepare'
              AND command.operation='procurement.supplier_invoice.post'
              AND command.status NOT IN ('failed','expired','cancelled')
              AND NULLIF(convert_from(command.request_bytes,'UTF8')::jsonb
                    ->>'portal_document_line_id','')::uuid=portal_line.id
         )
       GROUP BY receipt.id, receipt.supplier_challan_date,
                portal_line.id, portal_line.invoice_number, portal_line.invoice_date
      HAVING count(receipt_line.id)=1
    """
    bank_reconciliation_sql = """
      SELECT statement.id::text,statement_line.id::text,journal.id::text,
             statement.statement_reference,statement_line.line_number,
             to_char(statement_line.transaction_date,'YYYY-MM-DD'),
             bank.bank_name,journal.journal_number,
             statement_line.amount::text,statement_line.direction
        FROM finance.bank_statements statement
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
               AND candidate.evidence_kind='inventory_cycle_count_sheet'
               AND candidate.status IN ('verified','retained')
               AND candidate.verified_at IS NOT NULL
               AND candidate.verified_at<=transaction_timestamp()
               AND candidate.document_date=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
               AND candidate.retention_until IS NOT NULL
               AND candidate.retention_until>=(transaction_timestamp() AT TIME ZONE organization.timezone)::date
               AND candidate.sha256 IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM automation.command_requests prior
                    WHERE prior.org_id=candidate.org_id
                      AND prior.capability_code='inventory.adjustment.prepare'
                      AND prior.status NOT IN ('failed','expired','cancelled')
                      AND convert_from(prior.request_bytes,'UTF8')::jsonb
                          ->>'evidence_attachment_id'=candidate.id::text
               )
             ORDER BY candidate.verified_at DESC,candidate.id
             LIMIT 2
        ) attachment ON true
       WHERE membership.org_id=%s AND membership.status='active'
       ORDER BY attachment.verified_at DESC,attachment.id
       LIMIT 2
    """
    with psycopg2.connect(database_url) as connection:
        connection.set_session(readonly=True, autocommit=False)
        with connection.cursor() as cursor:
            cursor.execute("SELECT erp_security.activate_context(%s::uuid,%s::uuid)", (auth_user_id, org_id))
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            cycle_count_rows: list[tuple[Any, ...]] = []
            if len(rows) == 1:
                cursor.execute(
                    cycle_count_sql,
                    (
                        auth_user_id,
                        identities["branch_id"], identities["saleable_location_id"],
                        rows[0][24], identities["product_id"],
                        identities["count_uom_conversion_id"], org_id,
                    ),
                )
                cycle_count_rows = cursor.fetchall()
            cursor.execute(
                supplier_invoice_sql,
                (supplier_invoice_number, org_id, supplier_challan_number),
            )
            supplier_invoice_rows = cursor.fetchall()
            cursor.execute(
                bank_reconciliation_sql,
                (
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
        connection.rollback()
    if len(rows) != 1:
        raise FixtureCompileError(f"authoritative selector facts resolved {len(rows)} rows, expected one")
    if len(cycle_count_rows) != 1:
        raise FixtureCompileError(
            "authoritative cycle-count membership, batch, UOM and evidence resolved "
            f"{len(cycle_count_rows)} rows, expected one"
        )
    keys = (
        "branch_code", "branch_name", "customer_code", "customer_name",
        "supplier_code", "supplier_name", "product_code", "product_name",
        "uom_code", "count_uom_code", "source_location_code", "source_location_name",
        "quarantine_location_code", "quarantine_location_name",
        "destination_branch_code", "destination_branch_name",
        "destination_location_code", "destination_location_name",
        "bank_name", "bank_account_holder", "bank_ledger_code", "bank_ledger_name",
        "delivery_address_id", "delivery_address_row_version",
        "direct_issue_batch_id", "direct_issue_batch_number",
        "direct_issue_available_base_quantity", "sales_uom_multiplier",
    )
    if len(supplier_invoice_rows) != 1:
        raise FixtureCompileError(
            "run-scoped supplier-invoice GRN/GSTR-2B authority resolved "
            f"{len(supplier_invoice_rows)} rows, expected one"
        )
    if len(adjustment_evidence_rows) != 1:
        raise FixtureCompileError(
            "canonical statutory adjustment rules, retained recipient evidence, "
            "and run-scoped supplier credit-note evidence resolved "
            f"{len(adjustment_evidence_rows)} rows, expected one"
        )
    goods_receipt_id, challan_date, resolved_invoice_number, invoice_date = supplier_invoice_rows[0]
    if resolved_invoice_number != supplier_invoice_number or challan_date != invoice_date:
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
    resolved = dict(zip(keys, rows[0][:-2]))
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
        cycle_count_membership_id,
        cycle_count_evidence_id,
        cycle_count_completed_at,
        cycle_count_system_base_quantity,
        cycle_count_uom_multiplier,
        cycle_count_uom_code,
        cycle_count_evidence_status,
        cycle_count_evidence_document_date,
    ) = cycle_count_rows[0]
    return {
        "identity": {
            **identities,
            "supplier_invoice_goods_receipt_id": goods_receipt_id,
            "delivery_address_id": resolved.pop("delivery_address_id"),
            "delivery_address_row_version": resolved.pop("delivery_address_row_version"),
            "direct_issue_batch_id": resolved.pop("direct_issue_batch_id"),
            "cycle_count_evidence_attachment_id": cycle_count_evidence_id,
            "cycle_count_counted_by_membership_id": cycle_count_membership_id,
            "bank_reconciliation_statement_id": bank_statement_id,
            "bank_reconciliation_statement_line_id": bank_statement_line_id,
            "bank_reconciliation_journal_entry_id": bank_journal_entry_id,
            "sales_adjustment_rule_id": sales_adjustment_rule_id,
            "purchase_adjustment_rule_id": purchase_adjustment_rule_id,
            "recipient_itc_evidence_attachment_id": recipient_itc_evidence_id,
            "supplier_credit_note_portal_line_id": supplier_credit_note_portal_line_id,
        },
        "display": {
            **resolved,
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
        },
        "clock": {
            "business_date": rows[0][-2],
            "business_datetime_local": rows[0][-1],
            "cycle_count_completed_at_utc": cycle_count_completed_at,
            "recipient_itc_confirmed_at_utc": recipient_itc_confirmed_at,
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
        gain_text = _leaf(
            scalars, "stock_adjustment_gain_quantity", "reviewed scalar"
        )
        if not re.fullmatch(r"(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?", gain_text):
            raise FixtureCompileError(
                "stock_adjustment_gain_quantity must be a positive plain decimal with at most 6 fractional digits"
            )
        gain_quantity = Decimal(gain_text)
        if gain_quantity <= 0:
            raise FixtureCompileError(
                "stock_adjustment_gain_quantity must be greater than zero"
            )
        initial_base = Decimal(_leaf(
            facts, "display.cycle_count_system_base_quantity", "canonical fact"
        ))
        sales_multiplier = Decimal(_leaf(
            facts, "display.sales_uom_multiplier", "canonical fact"
        ))
        count_multiplier = Decimal(_leaf(
            facts, "display.cycle_count_uom_multiplier", "canonical fact"
        ))
        issued_sales_units = sum((
            Decimal(_leaf(scalars, key, "reviewed scalar"))
            for key in (
                "sales_invoice_quantity",
                "sales_invoice_free_quantity",
                "sales_order_quantity",
            )
        ), Decimal("0"))
        expected_system_base = initial_base - issued_sales_units * sales_multiplier
        if expected_system_base <= 0 or count_multiplier <= 0:
            raise FixtureCompileError(
                "prior reviewed sales issues leave no eligible cycle-count stock"
            )
        counted_quantity = expected_system_base / count_multiplier + gain_quantity
        exact_counted_quantity = counted_quantity.quantize(Decimal("0.000001"))
        if counted_quantity != exact_counted_quantity:
            raise FixtureCompileError(
                "derived cycle-count quantity is not exactly representable at canonical scale 6"
            )
        used.add("stock_adjustment_gain_quantity")
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
            encoded = json.dumps(step, sort_keys=True)
            if action == "click" and COMMUNICATION_ACTION.search(encoded):
                raise FixtureCompileError(f"{operation_id}.{phase}[{index}] targets communication")
    if steps["prepare_steps"][0]["action"] != "goto":
        raise FixtureCompileError(f"{operation_id}.prepare_steps must restart from a route")
    if not any(row["action"] == "expectText" for row in steps["missing_required_steps"]):
        raise FixtureCompileError(f"{operation_id}.missing_required_steps omitted visible assertion")
    for phase in ("approval_steps", "execute_steps"):
        if "{{command_request_id}}" not in json.dumps(steps[phase], sort_keys=True):
            raise FixtureCompileError(f"{operation_id}.{phase} does not target captured command")


def compile_fixture(
    matrix_path: Path,
    template_directory: Path,
    facts: dict[str, Any],
    scalars: dict[str, Any],
) -> dict[str, Any]:
    matrix = _object(matrix_path, "operation matrix")
    expected = [row["id"] for row in matrix.get("operations", [])]
    if matrix.get("required_operation_count") != 18 or len(expected) != 18 or len(set(expected)) != 18:
        raise FixtureCompileError("operation matrix must declare exactly 18 unique operations")
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
    unused = sorted(set(scalars) - used)
    if unused:
        raise FixtureCompileError(f"unreviewed/unused scalar values are forbidden: {unused}")
    return {"fixture_schema": FIXTURE_SCHEMA, "operations": operations}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--identity-evidence", type=Path, required=True)
    parser.add_argument("--reviewed-scalars", type=Path, required=True)
    parser.add_argument("--matrix", type=Path, required=True)
    parser.add_argument("--templates", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    org_id, identities = load_identity_evidence(args.identity_evidence)
    facts = resolve_authoritative_facts(
        os.environ["PHARMA_CANONICAL_LIVE_DATABASE_URL"],
        os.environ["PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID"],
        org_id,
        identities,
        os.environ["LIVE18_RUN_TOKEN"],
    )
    fixture = compile_fixture(
        args.matrix, args.templates, facts, load_reviewed_scalars(args.reviewed_scalars)
    )
    args.output.write_text(json.dumps(fixture, separators=(",", ":")) + "\n", encoding="utf-8")
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
