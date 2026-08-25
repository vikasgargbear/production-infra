"""Authoritative candidate projections for separately reviewed desktop operations.

These reads expose only canonical rows that satisfy the same immutable source
conditions as their command resolvers.  They never import evidence, synthesize
business facts, or fall back to compatibility schemas.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, WithJsonSchema
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker


router = APIRouter(
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Controlled Operation Reads"],
)


def _wire(scale: int):
    return lambda value: format(value, f".{scale}f")


def _schema(scale: int) -> dict[str, Any]:
    return {
        "type": "string",
        "pattern": rf"^(?:0|[1-9][0-9]*)\.[0-9]{{{scale}}}$",
        "description": "Exact nonnegative base-10 decimal string; never a JSON number.",
    }


ExactMoney = Annotated[
    Decimal,
    Field(ge=0, max_digits=20, decimal_places=2),
    PlainSerializer(_wire(2), return_type=str, when_used="json"),
    WithJsonSchema(_schema(2), mode="serialization"),
]
ExactQuantity = Annotated[
    Decimal,
    Field(gt=0, max_digits=20, decimal_places=6),
    PlainSerializer(_wire(6), return_type=str, when_used="json"),
    WithJsonSchema(_schema(6), mode="serialization"),
]
ExactRate = Annotated[
    Decimal,
    Field(gt=0, max_digits=20, decimal_places=4),
    PlainSerializer(_wire(4), return_type=str, when_used="json"),
    WithJsonSchema(_schema(4), mode="serialization"),
]


class StrictDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BankReconciliationCandidate(StrictDTO):
    branch_id: UUID
    branch_code: str
    branch_name: str
    bank_account_id: UUID
    bank_name: str
    bank_account_name: str
    bank_statement_id: UUID
    statement_reference: str
    bank_statement_line_id: UUID
    statement_line_number: int = Field(gt=0)
    transaction_date: date
    statement_direction: Literal["credit", "debit"]
    matched_amount: ExactMoney
    bank_reference: Optional[str]
    statement_description: str
    journal_entry_id: UUID
    journal_number: str
    journal_description: str
    match_methods: list[Literal["manual", "reference_exact"]]


class BankReconciliationContext(StrictDTO):
    organization_id: UUID
    business_date: date
    statement_import_available: Literal[False]
    statement_import_message: str
    candidates: list[BankReconciliationCandidate]


class DestructionCertificate(StrictDTO):
    certificate_attachment_id: UUID
    original_filename: str
    document_date: date
    verified_at: datetime
    retention_until: date


class DestructionStockCandidate(StrictDTO):
    branch_id: UUID
    branch_code: str
    branch_name: str
    location_id: UUID
    location_code: str
    location_name: str
    product_id: UUID
    product_code: str
    product_name: str
    uom_conversion_id: UUID
    selected_uom_code: str
    base_uom_code: str
    uom_multiplier: ExactQuantity
    batch_id: UUID
    batch_number: str
    batch_status: Literal["quarantined", "blocked", "expired"]
    expires_on: date
    available_selected_quantity: ExactQuantity
    available_base_quantity: ExactQuantity
    average_unit_cost: ExactRate
    inventory_value: ExactMoney
    input_credit_lot_count: int = Field(gt=0)
    eligible_itc_cgst_amount: ExactMoney
    eligible_itc_sgst_amount: ExactMoney
    eligible_itc_igst_amount: ExactMoney
    eligible_itc_cess_amount: ExactMoney


class InventoryDestructionContext(StrictDTO):
    organization_id: UUID
    organization_timezone: str
    business_date: date
    as_of: datetime
    ready: bool
    blocking_reasons: list[str]
    certificate_upload_available: Literal[False]
    certificate_upload_message: str
    method_code: Literal["licensed_incineration"]
    itc_treatment: Literal["section_17_5_h_reversal"]
    certificates: list[DestructionCertificate]
    itc_reversal_evidence: list[DestructionCertificate]
    candidates: list[DestructionStockCandidate]


def _activate(db: Session, user: dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', gen_random_uuid()::text, true)
            """
        ),
        {"auth_user_id": UUID(str(user["auth_user_id"])), "org_id": org_id},
    )
    return org_id


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in db.execute(text(sql), params).fetchall()]


@router.get(
    "/canonical/bank-reconciliation/context",
    response_model=BankReconciliationContext,
)
def bank_reconciliation_context(
    user: dict = Depends(PermissionChecker("finance", "view")),
    db: Session = Depends(get_db),
) -> BankReconciliationContext:
    """Return only exact, full statement-line-to-journal candidates."""

    org_id = _activate(db, user)
    clock = _rows(
        db,
        """
        SELECT (transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AS business_date
          FROM core.organizations organization
         WHERE organization.id=:org_id AND organization.status='active'
        """,
        {"org_id": org_id},
    )
    if len(clock) != 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The active organization has no authoritative business clock",
        )
    candidates = _rows(
        db,
        """
        SELECT bank_line.branch_id, branch.code AS branch_code,
               branch.name AS branch_name, bank.id AS bank_account_id,
               bank.bank_name,
               COALESCE(bank.account_holder_name, bank_ledger.name) AS bank_account_name,
               statement.id AS bank_statement_id, statement.statement_reference,
               statement_line.id AS bank_statement_line_id,
               statement_line.line_number AS statement_line_number,
               statement_line.transaction_date,
               statement_line.direction AS statement_direction,
               statement_line.amount AS matched_amount,
               statement_line.bank_reference,
               statement_line.description AS statement_description,
               journal.id AS journal_entry_id, journal.journal_number,
               journal.description AS journal_description,
               CASE
                 WHEN NULLIF(btrim(statement_line.bank_reference), '')=journal.journal_number
                   THEN ARRAY['reference_exact','manual']::text[]
                 ELSE ARRAY['manual']::text[]
               END AS match_methods
          FROM finance.bank_statements statement
          JOIN finance.bank_accounts bank
            ON bank.org_id=statement.org_id AND bank.id=statement.bank_account_id
           AND bank.status='active' AND bank.currency_code=statement.currency_code
          JOIN finance.accounts bank_ledger
            ON bank_ledger.org_id=bank.org_id AND bank_ledger.id=bank.account_id
           AND bank_ledger.status='active' AND bank_ledger.account_type='asset'
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
          JOIN finance.journal_lines bank_line
            ON bank_line.org_id=journal.org_id AND bank_line.journal_entry_id=journal.id
           AND bank_line.account_id=bank.account_id
           AND bank_line.transaction_debit=CASE statement_line.direction
                 WHEN 'credit' THEN statement_line.amount ELSE 0 END
           AND bank_line.transaction_credit=CASE statement_line.direction
                 WHEN 'debit' THEN statement_line.amount ELSE 0 END
           AND bank_line.functional_debit=bank_line.transaction_debit
           AND bank_line.functional_credit=bank_line.transaction_credit
          JOIN core.branches branch
            ON branch.org_id=bank_line.org_id AND branch.id=bank_line.branch_id
           AND branch.status='active' AND erp_security.can_access_branch(branch.id)
         WHERE statement.org_id=:org_id
           AND erp_security.has_permission('finance.bank_reconcile',branch.id)
           AND erp_security.has_permission('automation.command.execute',branch.id)
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
         ORDER BY statement_line.transaction_date, statement.statement_reference,
                  statement_line.line_number, journal.journal_number, journal.id
        """,
        {"org_id": org_id},
    )
    return BankReconciliationContext(
        organization_id=org_id,
        business_date=clock[0]["business_date"],
        statement_import_available=False,
        statement_import_message=(
            "Statement import is unavailable until a reviewed canonical attachment "
            "and parser command is published. Existing imported statements remain selectable."
        ),
        candidates=[BankReconciliationCandidate.model_validate(row) for row in candidates],
    )


@router.get(
    "/canonical/inventory-destruction/context",
    response_model=InventoryDestructionContext,
)
def inventory_destruction_context(
    user: dict = Depends(PermissionChecker("inventory", "view")),
    db: Session = Depends(get_db),
) -> InventoryDestructionContext:
    """Return certified evidence and exact full-balance destruction choices."""

    org_id = _activate(db, user)
    clock_rows = _rows(
        db,
        """
        SELECT organization.timezone AS organization_timezone,
               transaction_timestamp() AS as_of,
               (transaction_timestamp() AT TIME ZONE organization.timezone)::date
                 AS business_date,
               EXISTS (
                 SELECT 1 FROM tax.registrations registration
                  WHERE registration.org_id=organization.id
                    AND registration.status='active'
                    AND registration.effective_from<=
                        (transaction_timestamp() AT TIME ZONE organization.timezone)::date
                    AND (registration.effective_to IS NULL OR registration.effective_to>=
                        (transaction_timestamp() AT TIME ZONE organization.timezone)::date)
               ) AS has_active_gst_registration
          FROM core.organizations organization
         WHERE organization.id=:org_id AND organization.status='active'
           AND organization.country_code='IN' AND organization.base_currency='INR'
        """,
        {"org_id": org_id},
    )
    if len(clock_rows) != 1:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The active organization has no authoritative destruction clock",
        )
    clock = clock_rows[0]
    authorized = _rows(
        db,
        """
        SELECT EXISTS (
          SELECT 1 FROM core.branches branch
           WHERE branch.org_id=:org_id AND branch.status='active'
             AND erp_security.can_access_branch(branch.id)
             AND erp_security.has_permission(
                  'inventory.destruction.create',branch.id)
             AND erp_security.has_permission('inventory.document.post',branch.id)
             AND erp_security.has_permission('finance.journal.post',branch.id)
             AND erp_security.has_permission(
                  'compliance.destruction.manage',NULL::uuid)
             AND erp_security.has_permission('automation.command.execute',branch.id)
        ) AS allowed
        """,
        {"org_id": org_id},
    )[0]["allowed"]
    if not authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Certified destruction candidate access requires its exact cross-domain authority",
        )
    candidates = _rows(
            db,
            """
            SELECT branch.id AS branch_id, branch.code AS branch_code,
                   branch.name AS branch_name, location.id AS location_id,
                   location.code AS location_code, location.name AS location_name,
                   product.id AS product_id, product.sku AS product_code,
                   product.name AS product_name, conversion.id AS uom_conversion_id,
                   conversion.from_uom_code AS selected_uom_code,
                   product.base_uom_code, conversion.multiplier AS uom_multiplier,
                   batch.id AS batch_id, batch.batch_number,
                   batch.status AS batch_status, batch.expires_on,
                   round(balance.on_hand_quantity/conversion.multiplier, 6)
                     AS available_selected_quantity,
                   balance.on_hand_quantity AS available_base_quantity,
                   balance.average_unit_cost, balance.inventory_value,
                   (SELECT count(*) FROM tax.input_credit_lots lot
                     WHERE lot.org_id=balance.org_id AND lot.batch_id=balance.batch_id
                       AND lot.lineage_status='exact' AND lot.remaining_base_quantity>0)
                     AS input_credit_lot_count,
                   (SELECT COALESCE(sum(lot.remaining_cgst_amount),0) FROM tax.input_credit_lots lot
                     WHERE lot.org_id=balance.org_id AND lot.batch_id=balance.batch_id
                       AND lot.lineage_status='exact' AND lot.remaining_base_quantity>0)
                     AS eligible_itc_cgst_amount,
                   (SELECT COALESCE(sum(lot.remaining_sgst_amount),0) FROM tax.input_credit_lots lot
                     WHERE lot.org_id=balance.org_id AND lot.batch_id=balance.batch_id
                       AND lot.lineage_status='exact' AND lot.remaining_base_quantity>0)
                     AS eligible_itc_sgst_amount,
                   (SELECT COALESCE(sum(lot.remaining_igst_amount),0) FROM tax.input_credit_lots lot
                     WHERE lot.org_id=balance.org_id AND lot.batch_id=balance.batch_id
                       AND lot.lineage_status='exact' AND lot.remaining_base_quantity>0)
                     AS eligible_itc_igst_amount,
                   (SELECT COALESCE(sum(lot.remaining_cess_amount),0) FROM tax.input_credit_lots lot
                     WHERE lot.org_id=balance.org_id AND lot.batch_id=balance.batch_id
                       AND lot.lineage_status='exact' AND lot.remaining_base_quantity>0)
                     AS eligible_itc_cess_amount
              FROM inventory.stock_balances balance
              JOIN core.branches branch
                ON branch.org_id=balance.org_id AND branch.id=balance.branch_id
               AND branch.status='active' AND erp_security.can_access_branch(branch.id)
              JOIN inventory.locations location
                ON location.org_id=balance.org_id AND location.id=balance.location_id
               AND location.branch_id=branch.id AND location.status='active'
               AND location.location_type IN ('quarantine','damaged')
               AND NOT location.allows_sale AND NOT location.allows_negative_stock
               AND location.temperature_min_c IS NULL
               AND location.temperature_max_c IS NULL
              JOIN catalog.products product
                ON product.org_id=balance.org_id AND product.id=balance.product_id
               AND product.status='active' AND NOT product.cold_chain_required
               AND COALESCE(product.drug_schedule,'NONE') NOT IN ('H','H1','X')
               AND NOT COALESCE(product.ndps_regulated,false)
              JOIN inventory.batches batch
                ON batch.org_id=balance.org_id AND batch.id=balance.batch_id
               AND batch.product_id=product.id AND batch.lot_kind='manufacturer_batch'
               AND (batch.status IN ('quarantined','blocked','expired') OR (
                 batch.status='released' AND location.location_type='quarantine'
                 AND EXISTS (
                   SELECT 1 FROM inventory.stock_ledger_entries returned_ledger
                   JOIN inventory.inventory_documents returned_document
                     ON returned_document.org_id=returned_ledger.org_id
                    AND returned_document.id=returned_ledger.inventory_document_id
                  WHERE returned_ledger.org_id=balance.org_id
                    AND returned_ledger.branch_id=balance.branch_id
                    AND returned_ledger.location_id=balance.location_id
                    AND returned_ledger.product_id=balance.product_id
                    AND returned_ledger.batch_id=balance.batch_id
                    AND returned_ledger.quantity_delta>0
                    AND returned_document.document_type='sales_return_receipt'
                    AND returned_document.status='posted'))
               AND batch.expires_on IS NOT NULL AND batch.mrp>0
               AND batch.mrp_uom_conversion_id IS NOT NULL
              JOIN catalog.uom_conversions conversion
                ON conversion.org_id=product.org_id AND conversion.product_id=product.id
               AND conversion.status='active'
               AND conversion.to_uom_code=product.base_uom_code
               AND conversion.multiplier>0 AND conversion.valid_from<=:business_date
               AND (conversion.valid_until IS NULL OR conversion.valid_until>=:business_date)
             WHERE balance.org_id=:org_id AND balance.on_hand_quantity>0
               AND EXISTS (SELECT 1 FROM tax.registration_branches association
                 JOIN tax.registrations registration
                   ON registration.org_id=association.org_id AND registration.id=association.registration_id
                WHERE association.org_id=balance.org_id AND association.branch_id=balance.branch_id
                  AND registration.status='active' AND registration.registration_type='regular'
                  AND registration.effective_from<=:business_date
                  AND (registration.effective_to IS NULL OR registration.effective_to>=:business_date)
                  AND EXISTS (SELECT 1 FROM tax.return_periods period
                    JOIN tax.returns filing ON filing.org_id=period.org_id
                      AND filing.return_period_id=period.id AND filing.return_type='gstr3b'
                      AND filing.status='draft'
                   WHERE period.org_id=registration.org_id AND period.registration_id=registration.id
                     AND :business_date BETWEEN period.period_start AND period.period_end
                     AND period.status='open'))
               AND EXISTS (SELECT 1 FROM tax.itc_reversal_rule_versions rule
                 WHERE rule.status='active' AND rule.event_kind='goods_destroyed'
                   AND rule.legal_section='17(5)(h)' AND rule.effective_from<=:business_date
                   AND (rule.effective_to IS NULL OR rule.effective_to>=:business_date))
               AND (SELECT COALESCE(sum(lot.remaining_base_quantity),0)
                      FROM tax.input_credit_lots lot
                     WHERE lot.org_id=balance.org_id AND lot.batch_id=balance.batch_id
                       AND lot.lineage_status='exact')>=balance.on_hand_quantity
               AND NOT EXISTS (SELECT 1 FROM tax.input_credit_lots lot
                 WHERE lot.org_id=balance.org_id AND lot.batch_id=balance.batch_id
                   AND lot.lineage_status<>'exact')
               AND round(
                    round(balance.on_hand_quantity/conversion.multiplier,6)
                      * conversion.multiplier,
                    6
               )=balance.on_hand_quantity
               AND erp_security.has_permission(
                    'inventory.destruction.create',branch.id)
               AND erp_security.has_permission('inventory.document.post',branch.id)
               AND erp_security.has_permission('finance.journal.post',branch.id)
               AND erp_security.has_permission(
                    'compliance.destruction.manage',NULL::uuid)
               AND erp_security.has_permission('automation.command.execute',branch.id)
               AND balance.inventory_value>0 AND balance.average_unit_cost>0
               AND NOT EXISTS (
                 SELECT 1 FROM compliance.recall_batches recall_batch
                 JOIN compliance.recalls recall
                   ON recall.org_id=recall_batch.org_id
                  AND recall.id=recall_batch.recall_id
                WHERE recall_batch.org_id=balance.org_id
                  AND recall_batch.batch_id=balance.batch_id
                  AND recall.status IN ('initiated','in_progress'))
               AND NOT EXISTS (
                 SELECT 1 FROM inventory.inventory_document_lines pending_line
                 JOIN inventory.inventory_documents pending
                   ON pending.org_id=pending_line.org_id
                  AND pending.id=pending_line.inventory_document_id
                WHERE pending_line.org_id=balance.org_id
                  AND pending.status IN ('draft','submitted','approved')
                  AND pending_line.product_id=balance.product_id
                  AND pending_line.batch_id=balance.batch_id
                  AND balance.location_id IN (
                      pending_line.from_location_id,pending_line.to_location_id))
               AND (product.product_kind<>'medicine' OR (
                 SELECT count(DISTINCT license.license_type_code)
                   FROM compliance.licenses license
                   JOIN core.attachments evidence
                     ON evidence.org_id=license.org_id
                    AND evidence.id=license.evidence_attachment_id
                  WHERE license.org_id=balance.org_id AND license.branch_id=balance.branch_id
                    AND license.license_type_code IN (
                        'drug_wholesale_form_20b','drug_wholesale_form_21b')
                    AND license.status='active' AND license.valid_from<=:business_date
                    AND (license.valid_until IS NULL OR license.valid_until>=:business_date)
                    AND license.next_verification_due_on>=:business_date
                    AND evidence.status IN ('verified','retained')
                    AND evidence.verified_at IS NOT NULL)=2)
               AND EXISTS (
                 SELECT 1 FROM LATERAL (
                   SELECT role_setting.value_text
                     FROM core.settings role_setting
                    WHERE role_setting.org_id=balance.org_id
                      AND role_setting.status='active'
                      AND role_setting.value_type='text'
                      AND role_setting.namespace='finance.account_roles'
                      AND role_setting.key='inventory_asset'
                      AND (role_setting.branch_id=balance.branch_id
                           OR role_setting.branch_id IS NULL)
                    ORDER BY (role_setting.branch_id=balance.branch_id) DESC
                    LIMIT 1
                 ) setting
                 JOIN finance.accounts account
                   ON account.org_id=balance.org_id
                  AND account.id=CASE WHEN setting.value_text~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                                      THEN setting.value_text::uuid END
                  AND account.status='active' AND account.account_type='asset'
                  AND account.currency_code='INR' AND NOT account.allows_party_posting)
               AND EXISTS (
                 SELECT 1 FROM LATERAL (
                   SELECT role_setting.value_text
                     FROM core.settings role_setting
                    WHERE role_setting.org_id=balance.org_id
                      AND role_setting.status='active'
                      AND role_setting.value_type='text'
                      AND role_setting.namespace='finance.account_roles'
                      AND role_setting.key='inventory_destruction_loss'
                      AND (role_setting.branch_id=balance.branch_id
                           OR role_setting.branch_id IS NULL)
                    ORDER BY (role_setting.branch_id=balance.branch_id) DESC
                    LIMIT 1
                 ) setting
                 JOIN finance.accounts account
                   ON account.org_id=balance.org_id
                  AND account.id=CASE WHEN setting.value_text~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                                      THEN setting.value_text::uuid END
                  AND account.status='active' AND account.account_type='expense'
                  AND account.currency_code='INR' AND NOT account.allows_party_posting)
               AND 5=(
                 SELECT count(*)
                   FROM (VALUES
                     ('inventory_itc_reversal_expense','expense'),
                     ('input_cgst','asset'),('input_sgst','asset'),
                     ('input_igst','asset'),('input_cess','asset')
                   ) expected(role_key,account_type)
                  WHERE EXISTS (
                    SELECT 1
                      FROM LATERAL (
                        SELECT role_setting.value_text
                          FROM core.settings role_setting
                         WHERE role_setting.org_id=balance.org_id
                           AND role_setting.status='active'
                           AND role_setting.value_type='text'
                           AND role_setting.namespace='finance.account_roles'
                           AND role_setting.key=expected.role_key
                           AND (role_setting.branch_id=balance.branch_id
                                OR role_setting.branch_id IS NULL)
                         ORDER BY (role_setting.branch_id=balance.branch_id) DESC
                         LIMIT 1
                      ) setting
                      JOIN finance.accounts account
                        ON account.org_id=balance.org_id
                       AND account.id=CASE
                           WHEN setting.value_text~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                           THEN setting.value_text::uuid END
                       AND account.status='active'
                       AND account.account_type=expected.account_type
                       AND account.currency_code='INR'
                       AND NOT account.allows_party_posting))
             ORDER BY branch.code, location.code, product.name, batch.expires_on,
                      batch.batch_number, conversion.multiplier, conversion.id
            """,
            {"org_id": org_id, "business_date": clock["business_date"]},
        )
    certificates = _rows(
        db,
        """
            SELECT attachment.id AS certificate_attachment_id,
                   attachment.original_filename, attachment.document_date,
                   attachment.verified_at, attachment.retention_until
              FROM core.attachments attachment
             WHERE attachment.org_id=:org_id
               AND attachment.evidence_kind='inventory_destruction_certificate'
               AND attachment.status IN ('verified','retained')
               AND attachment.verified_at IS NOT NULL
               AND attachment.verified_at<=:as_of
               AND attachment.document_date=:business_date
               AND attachment.retention_until IS NOT NULL
               AND attachment.retention_until>=:business_date
               AND attachment.sha256 IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM automation.command_requests command
                  WHERE command.org_id=attachment.org_id
                    AND command.capability_code='inventory.destruction.prepare'
                    AND command.status NOT IN ('failed','expired','cancelled')
                    AND convert_from(command.request_bytes,'UTF8')::jsonb
                          ->>'certificate_attachment_id'=attachment.id::text)
             ORDER BY attachment.verified_at DESC, attachment.id
        """,
        {
            "org_id": org_id,
            "as_of": clock["as_of"],
            "business_date": clock["business_date"],
        },
    )
    reversal_evidence = _rows(
        db,
        """
            SELECT attachment.id AS certificate_attachment_id,
                   attachment.original_filename, attachment.document_date,
                   attachment.verified_at, attachment.retention_until
              FROM core.attachments attachment
             WHERE attachment.org_id=:org_id
               AND attachment.evidence_kind='inventory_destruction_itc_reversal'
               AND attachment.status IN ('verified','retained')
               AND attachment.verified_at IS NOT NULL AND attachment.verified_at<=:as_of
               AND attachment.document_date=:business_date
               AND attachment.retention_until>=:business_date AND attachment.sha256 IS NOT NULL
             ORDER BY attachment.verified_at DESC,attachment.id
        """,
        {"org_id": org_id, "as_of": clock["as_of"], "business_date": clock["business_date"]},
    )
    blockers: list[str] = []
    if not clock["has_active_gst_registration"]:
        blockers.append("Destruction requires an active regular GST registration and Section 17(5)(h) authority.")
    if not certificates:
        blockers.append(
            "No unconsumed, verified destruction certificate for the organization business date is available."
        )
    if not reversal_evidence:
        blockers.append("No verified same-day Section 17(5)(h) reversal evidence is available.")
    if not candidates:
        blockers.append(
            "No full-balance stock with exact residual input-credit lineage is available."
        )
    return InventoryDestructionContext(
        organization_id=org_id,
        organization_timezone=clock["organization_timezone"],
        business_date=clock["business_date"],
        as_of=clock["as_of"],
        ready=not blockers,
        blocking_reasons=blockers,
        certificate_upload_available=False,
        certificate_upload_message=(
            "Certificate upload is unavailable until a reviewed canonical attachment "
            "verification command is published. Existing verified evidence remains selectable."
        ),
        method_code="licensed_incineration",
        itc_treatment="section_17_5_h_reversal",
        certificates=[DestructionCertificate.model_validate(row) for row in certificates],
        itc_reversal_evidence=[DestructionCertificate.model_validate(row) for row in reversal_evidence],
        candidates=[DestructionStockCandidate.model_validate(row) for row in candidates],
    )
