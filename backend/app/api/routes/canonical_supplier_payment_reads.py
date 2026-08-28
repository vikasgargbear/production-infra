"""Canonical supplier-payment source projection and posted readback.

These endpoints expose only posted supplier-invoice payables that the reviewed
``finance.supplier_payment.prepare`` command can settle.  They never create a
payment, infer a balance in the browser, or fall back to legacy finance rows.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker


router = APIRouter(
    prefix="/canonical/supplier-payments",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Supplier Payment Reads"],
)
FINANCE_USER = Depends(PermissionChecker("finance", "view"))


def _activate(db: Session, user: dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
            """
        ),
        {
            "auth_user_id": UUID(str(user["auth_user_id"])),
            "org_id": org_id,
            "request_id": str(uuid4()),
        },
    )
    return org_id


def _scope(user: dict[str, Any]) -> tuple[bool, list[UUID]]:
    organization_scope = (
        user.get("is_admin") is True
        or str(user.get("data_access_level") or "").lower() == "organization"
        or str(user.get("branch_scope") or "").lower() in {"all", "organization"}
    )
    return organization_scope, [UUID(str(value)) for value in (user.get("branch_ids") or [])]


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in db.execute(text(sql), params).fetchall()]


def _organization_business_date(db: Session, org_id: UUID) -> date:
    rows = _rows(db, """
        SELECT "erp_core_commands"."current_organization_business_date"()
                 AS business_date
    """, {})
    if len(rows) != 1 or not isinstance(rows[0].get("business_date"), date):
        raise HTTPException(
            status_code=503,
            detail="The active organization has no authoritative business clock",
        )
    return rows[0]["business_date"]


class SupplierPaymentBranch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    branch_id: UUID
    branch_code: str
    branch_name: str


class SupplierPaymentBankAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bank_account_id: UUID
    settlement_account_id: UUID
    bank_name: str
    account_holder_name: str
    ifsc: str
    currency_code: Literal["INR"]


class SupplierPayableOpenItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    open_item_id: UUID
    supplier_invoice_id: UUID
    branch_id: UUID
    document_number: str
    document_date: date
    due_date: date
    principal_amount: Decimal
    allocated_amount: Decimal
    outstanding_amount: Decimal

    @model_validator(mode="after")
    def reconcile_balance(self):
        if self.principal_amount <= 0 or self.allocated_amount < 0:
            raise ValueError("supplier payable balance is invalid")
        if self.principal_amount - self.allocated_amount != self.outstanding_amount:
            raise ValueError("supplier payable balance does not reconcile")
        if self.outstanding_amount <= 0:
            raise ValueError("supplier payable is already settled")
        return self


class SupplierPaymentParty(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier_account_id: UUID
    party_id: UUID
    supplier_code: str
    supplier_name: str
    open_items: list[SupplierPayableOpenItem]


class SupplierPaymentContextResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ready: bool
    blocking_reasons: list[str]
    payment_date: date
    branches: list[SupplierPaymentBranch]
    bank_accounts: list[SupplierPaymentBankAccount]
    suppliers: list[SupplierPaymentParty]

    @model_validator(mode="after")
    def validate_readiness(self):
        has_items = any(supplier.open_items for supplier in self.suppliers)
        expected = bool(self.branches and self.bank_accounts and has_items)
        if self.ready != (expected and not self.blocking_reasons):
            raise ValueError("supplier-payment context readiness is inconsistent")
        supplier_ids = [supplier.supplier_account_id for supplier in self.suppliers]
        open_item_ids = [
            item.open_item_id for supplier in self.suppliers for item in supplier.open_items
        ]
        if len(supplier_ids) != len(set(supplier_ids)):
            raise ValueError("supplier-payment context repeats a supplier")
        if len(open_item_ids) != len(set(open_item_ids)):
            raise ValueError("supplier-payment context repeats a payable")
        return self


class PostedSupplierPaymentAllocation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allocation_id: UUID
    open_item_id: UUID
    supplier_invoice_id: UUID
    supplier_invoice_number: str
    amount: Decimal
    principal_amount: Decimal
    effective_allocated_amount: Decimal
    residual_amount: Decimal
    allocation_date: date

    @model_validator(mode="after")
    def validate_residual(self):
        if self.amount <= 0 or self.effective_allocated_amount < self.amount:
            raise ValueError("supplier-payment allocation evidence is invalid")
        if self.principal_amount - self.effective_allocated_amount != self.residual_amount:
            raise ValueError("supplier-payment payable residual does not reconcile")
        if self.residual_amount < 0:
            raise ValueError("supplier-payment payable is over-allocated")
        return self


class SupplierPaymentJournalLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journal_line_id: UUID
    line_number: int = Field(gt=0)
    account_id: UUID
    party_id: Optional[UUID]
    debit: Decimal
    credit: Decimal


class PostedSupplierPaymentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payment_id: UUID
    payment_number: str
    payment_date: date
    branch_id: UUID
    supplier_account_id: UUID
    supplier_name: str
    party_id: UUID
    bank_account_id: UUID
    settlement_account_id: UUID
    accounts_payable_account_id: UUID
    payment_method: Literal["bank_transfer", "upi"]
    external_reference: str
    amount: Decimal
    status: Literal["posted"]
    journal_entry_id: UUID
    journal_number: str
    journal_debit_total: Decimal
    journal_credit_total: Decimal
    allocations: list[PostedSupplierPaymentAllocation]
    journal_lines: list[SupplierPaymentJournalLine]
    allocation_reconciled: Literal[True]
    journal_balanced: Literal[True]
    payable_residuals_reconciled: Literal[True]

    @model_validator(mode="after")
    def validate_posting(self):
        if not self.allocations or not self.journal_lines:
            raise ValueError("posted supplier payment lacks accounting evidence")
        if len({row.open_item_id for row in self.allocations}) != len(self.allocations):
            raise ValueError("posted supplier payment repeats a payable")
        allocation_total = sum((row.amount for row in self.allocations), Decimal("0"))
        debit = sum((row.debit for row in self.journal_lines), Decimal("0"))
        credit = sum((row.credit for row in self.journal_lines), Decimal("0"))
        if allocation_total != self.amount:
            raise ValueError("posted supplier-payment allocations do not equal payment")
        if not (
            debit == credit == self.amount
            and self.journal_debit_total == self.amount
            and self.journal_credit_total == self.amount
        ):
            raise ValueError("posted supplier-payment journal is not balanced")
        payable = [
            row for row in self.journal_lines
            if row.account_id == self.accounts_payable_account_id
            and row.party_id == self.party_id
            and row.debit == self.amount and row.credit == 0
        ]
        settlement = [
            row for row in self.journal_lines
            if row.account_id == self.settlement_account_id
            and row.party_id is None
            and row.debit == 0 and row.credit == self.amount
        ]
        if len(payable) != 1 or len(settlement) != 1:
            raise ValueError("supplier-payment payable or bank journal identity is invalid")
        return self


@router.get("/context", response_model=SupplierPaymentContextResponse)
def supplier_payment_context(
    payment_date: Optional[date] = Query(default=None),
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return only command-eligible supplier payables for the chosen local date."""
    org_id = _activate(db, user)
    business_date = _organization_business_date(db, org_id)
    effective_payment_date = payment_date or business_date
    if effective_payment_date > business_date:
        raise HTTPException(status_code=422, detail="Supplier payment date cannot be in the future")
    organization_scope, branch_ids = _scope(user)
    params = {
        "org_id": org_id,
        "payment_date": effective_payment_date,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
    }
    branches = _rows(db, """
        SELECT branch.id AS branch_id, branch.code AS branch_code,
               branch.name AS branch_name
          FROM core.branches branch
         WHERE branch.org_id=:org_id AND branch.status='active'
           AND (:organization_scope OR branch.id=ANY(CAST(:branch_ids AS uuid[])))
         ORDER BY branch.code, branch.id
    """, params)
    banks = _rows(db, """
        SELECT bank.id AS bank_account_id, account.id AS settlement_account_id,
               bank.bank_name, bank.account_holder_name, bank.ifsc,
               bank.currency_code
          FROM finance.bank_accounts bank
          JOIN finance.accounts account
            ON account.org_id=bank.org_id AND account.id=bank.account_id
           AND account.status='active' AND account.account_type='asset'
           AND account.currency_code='INR' AND account.allows_bank_reconciliation
         WHERE bank.org_id=:org_id AND bank.status='active'
           AND bank.currency_code='INR'
         ORDER BY bank.bank_name, bank.id
    """, params)
    payables = _rows(db, """
        WITH effective_cash AS (
            SELECT allocation.org_id, allocation.open_item_id,
                   SUM(allocation.amount) AS allocated_amount
              FROM finance.allocations allocation
             WHERE allocation.org_id=:org_id AND allocation.status='posted'
               AND allocation.payment_id IS NOT NULL
               AND allocation.reversal_of_allocation_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM finance.allocations reversal
                    WHERE reversal.org_id=allocation.org_id
                      AND reversal.reversal_of_allocation_id=allocation.id
                      AND reversal.status='reversed')
             GROUP BY allocation.org_id, allocation.open_item_id
        )
        SELECT supplier.id AS supplier_account_id, supplier.party_id,
               supplier.supplier_code, party.legal_name AS supplier_name,
               item.id AS open_item_id, invoice.id AS supplier_invoice_id,
               invoice.branch_id, item.document_number, item.document_date,
               item.due_date, item.principal_amount,
               COALESCE(cash.allocated_amount,0) AS allocated_amount,
               item.principal_amount-COALESCE(cash.allocated_amount,0) AS outstanding_amount
          FROM finance.open_items item
          JOIN finance.accounting_events event
            ON event.org_id=item.org_id AND event.id=item.accounting_event_id
           AND event.event_type='supplier_invoice' AND event.supplier_invoice_id IS NOT NULL
          JOIN procurement.supplier_invoices invoice
            ON invoice.org_id=event.org_id AND invoice.id=event.supplier_invoice_id
           AND invoice.status='posted' AND invoice.currency_code='INR'
           AND invoice.supply_type IN ('intra_state','inter_state')
           AND invoice.zero_rated_payment_mode='not_applicable'
           AND invoice.tax_charge_mechanism='normal'
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=invoice.org_id AND supplier.id=invoice.supplier_account_id
           AND supplier.status='active'
          JOIN finance.accounts supplier_payable
            ON supplier_payable.org_id=supplier.org_id
           AND supplier_payable.id=supplier.default_payable_account_id
           AND supplier_payable.status='active'
           AND supplier_payable.account_type='liability'
           AND supplier_payable.currency_code='INR'
           AND supplier_payable.allows_party_posting
          JOIN parties.parties party
            ON party.org_id=supplier.org_id AND party.id=supplier.party_id
           AND party.status='active' AND party.tax_residency_status='resident'
           AND party.pan IS NOT NULL AND party.pan_verification_status='verified'
           AND party.tax_profile_verified_at IS NOT NULL
           AND party.tax_profile_verified_at<=pg_catalog.transaction_timestamp()
           AND party.tax_profile_evidence_attachment_id IS NOT NULL
          JOIN core.attachments party_evidence
            ON party_evidence.org_id=party.org_id
           AND party_evidence.id=party.tax_profile_evidence_attachment_id
           AND party_evidence.status IN ('verified','retained')
           AND party_evidence.verified_at IS NOT NULL
           AND party_evidence.verified_at<=pg_catalog.transaction_timestamp()
          JOIN tax.organization_fiscal_tax_facts fiscal_fact
            ON fiscal_fact.org_id=invoice.org_id AND fiscal_fact.status='active'
           AND fiscal_fact.fiscal_year_start_year=CASE WHEN EXTRACT(MONTH FROM item.document_date)>=4
                THEN EXTRACT(YEAR FROM item.document_date)::smallint
                ELSE (EXTRACT(YEAR FROM item.document_date)-1)::smallint END
           AND item.document_date BETWEEN fiscal_fact.effective_from AND fiscal_fact.effective_to
           AND fiscal_fact.prior_fiscal_year_turnover<=100000000
           AND fiscal_fact.gst_tds_notified_deductor=false
          JOIN core.attachments fiscal_evidence
            ON fiscal_evidence.org_id=fiscal_fact.org_id
           AND fiscal_evidence.id=fiscal_fact.evidence_attachment_id
           AND fiscal_evidence.status IN ('verified','retained')
           AND fiscal_evidence.verified_at IS NOT NULL
           AND fiscal_evidence.verified_at<=pg_catalog.transaction_timestamp()
          LEFT JOIN effective_cash cash
            ON cash.org_id=item.org_id AND cash.open_item_id=item.id
         WHERE item.org_id=:org_id AND item.item_side='payable'
           AND item.status='open' AND item.currency_code='INR'
           AND item.document_date<=:payment_date
           AND (:organization_scope OR invoice.branch_id=ANY(CAST(:branch_ids AS uuid[])))
           AND item.principal_amount-COALESCE(cash.allocated_amount,0)>0
           AND (SELECT count(*)
                  FROM tax.organization_fiscal_tax_facts payment_fact
                  JOIN core.attachments payment_evidence
                    ON payment_evidence.org_id=payment_fact.org_id
                   AND payment_evidence.id=payment_fact.evidence_attachment_id
                   AND payment_evidence.status IN ('verified','retained')
                   AND payment_evidence.verified_at IS NOT NULL
                   AND payment_evidence.verified_at<=pg_catalog.transaction_timestamp()
                 WHERE payment_fact.org_id=item.org_id
                   AND payment_fact.status='active'
                   AND payment_fact.fiscal_year_start_year=CASE
                       WHEN EXTRACT(MONTH FROM CAST(:payment_date AS date))>=4
                       THEN EXTRACT(YEAR FROM CAST(:payment_date AS date))::smallint
                       ELSE (EXTRACT(YEAR FROM CAST(:payment_date AS date))-1)::smallint END
                   AND CAST(:payment_date AS date) BETWEEN payment_fact.effective_from AND payment_fact.effective_to
                   AND payment_fact.prior_fiscal_year_turnover<=100000000
                   AND payment_fact.gst_tds_notified_deductor=false)=1
           AND NOT EXISTS (
               SELECT 1 FROM finance.allocations noncash
                WHERE noncash.org_id=item.org_id AND noncash.open_item_id=item.id
                  AND noncash.status='posted' AND noncash.payment_id IS NULL
                  AND noncash.reversal_of_allocation_id IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM finance.allocations reversal
                       WHERE reversal.org_id=noncash.org_id
                         AND reversal.reversal_of_allocation_id=noncash.id
                         AND reversal.status='reversed'))
           AND NOT EXISTS (
               SELECT 1 FROM procurement.supplier_invoice_lines line
                WHERE line.org_id=invoice.org_id AND line.supplier_invoice_id=invoice.id
                  AND (line.line_kind<>'product'
                       OR line.withholding_nature_code IS DISTINCT FROM 'purchase_of_goods'))
           AND EXISTS (
               SELECT 1 FROM procurement.supplier_invoice_lines line
                WHERE line.org_id=invoice.org_id AND line.supplier_invoice_id=invoice.id
                  AND line.line_kind='product' AND line.withholding_nature_code='purchase_of_goods')
           AND NOT EXISTS (
               SELECT 1
                 FROM procurement.purchase_order_advance_allocations advance
                WHERE advance.org_id=invoice.org_id AND advance.status='posted'
                  AND advance.reversal_of_allocation_id IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
                       WHERE reversal.org_id=advance.org_id
                         AND reversal.reversal_of_allocation_id=advance.id
                         AND reversal.status='reversed')
                  AND NOT EXISTS (
                      SELECT 1 FROM finance.accounting_events application
                       WHERE application.org_id=advance.org_id
                         AND application.purchase_order_advance_allocation_id=advance.id)
                  AND EXISTS (
                      SELECT 1 FROM procurement.supplier_invoice_lines invoice_line
                      JOIN procurement.supplier_invoice_receipt_allocations receipt_allocation
                        ON receipt_allocation.org_id=invoice_line.org_id
                       AND receipt_allocation.supplier_invoice_line_id=invoice_line.id
                      JOIN procurement.goods_receipt_lines receipt_line
                        ON receipt_line.org_id=receipt_allocation.org_id
                       AND receipt_line.id=receipt_allocation.goods_receipt_line_id
                       AND receipt_line.purchase_order_line_id=advance.purchase_order_line_id
                     WHERE invoice_line.org_id=invoice.org_id
                       AND invoice_line.supplier_invoice_id=invoice.id))
         ORDER BY party.legal_name, item.due_date, item.id
    """, params)
    suppliers: dict[UUID, dict[str, Any]] = {}
    for row in payables:
        supplier_id = row["supplier_account_id"]
        supplier = suppliers.setdefault(supplier_id, {
            "supplier_account_id": supplier_id,
            "party_id": row["party_id"],
            "supplier_code": row["supplier_code"],
            "supplier_name": row["supplier_name"],
            "open_items": [],
        })
        supplier["open_items"].append({
            key: row[key] for key in (
                "open_item_id", "supplier_invoice_id", "branch_id",
                "document_number", "document_date", "due_date",
                "principal_amount", "allocated_amount", "outstanding_amount",
            )
        })
    reasons: list[str] = []
    if not branches:
        reasons.append("No active branch is visible to this finance user.")
    if not banks:
        reasons.append("No active INR bank account owns a reconcilable asset settlement ledger.")
    if not payables:
        reasons.append(
            "No eligible posted supplier-invoice payable has complete PAN, fiscal-tax, "
            "purchase-of-goods, and unapplied-balance evidence for this date."
        )
    return {
        "ready": not reasons,
        "blocking_reasons": reasons,
        "payment_date": effective_payment_date,
        "branches": branches,
        "bank_accounts": banks,
        "suppliers": list(suppliers.values()),
    }


@router.get("/{payment_id}", response_model=PostedSupplierPaymentResponse)
def posted_supplier_payment(
    payment_id: UUID,
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Prove one posted supplier disbursement, its residuals, and journal."""
    org_id = _activate(db, user)
    organization_scope, branch_ids = _scope(user)
    params = {
        "org_id": org_id,
        "payment_id": payment_id,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
    }
    headers = _rows(db, """
        SELECT payment.id AS payment_id, payment.payment_number,
               payment.payment_date, payment.branch_id,
               supplier.id AS supplier_account_id,
               party.legal_name AS supplier_name, party.id AS party_id,
               payment.bank_account_id, payment.settlement_account_id,
               supplier.default_payable_account_id AS accounts_payable_account_id,
               payment.payment_method, payment.external_reference,
               payment.amount, payment.status,
               journal.id AS journal_entry_id, journal.journal_number,
               journal.transaction_debit_total AS journal_debit_total,
               journal.transaction_credit_total AS journal_credit_total
          FROM finance.payments payment
          JOIN parties.parties party
            ON party.org_id=payment.org_id AND party.id=payment.party_id
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=party.org_id AND supplier.party_id=party.id
           AND EXISTS (
               SELECT 1 FROM finance.allocations ownership_allocation
               JOIN finance.open_items ownership_item
                 ON ownership_item.org_id=ownership_allocation.org_id
                AND ownership_item.id=ownership_allocation.open_item_id
               JOIN finance.accounting_events ownership_event
                 ON ownership_event.org_id=ownership_item.org_id
                AND ownership_event.id=ownership_item.accounting_event_id
               JOIN procurement.supplier_invoices ownership_invoice
                 ON ownership_invoice.org_id=ownership_event.org_id
                AND ownership_invoice.id=ownership_event.supplier_invoice_id
                AND ownership_invoice.supplier_account_id=supplier.id
              WHERE ownership_allocation.org_id=payment.org_id
                AND ownership_allocation.payment_id=payment.id)
          JOIN finance.accounting_events event
            ON event.org_id=payment.org_id AND event.payment_id=payment.id
           AND event.event_type='payment'
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status='posted'
         WHERE payment.org_id=:org_id AND payment.id=:payment_id
           AND payment.direction='disbursement'
           AND payment.payment_purpose='commercial_settlement'
           AND payment.status='posted'
           AND (:organization_scope OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
    """, params)
    if len(headers) != 1:
        raise HTTPException(status_code=404, detail="Canonical posted supplier payment not found")
    allocations = _rows(db, """
        WITH effective AS (
            SELECT candidate.org_id, candidate.open_item_id,
                   SUM(candidate.amount) AS effective_allocated_amount
              FROM finance.allocations candidate
             WHERE candidate.org_id=:org_id AND candidate.status='posted'
               AND candidate.reversal_of_allocation_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM finance.allocations reversal
                    WHERE reversal.org_id=candidate.org_id
                      AND reversal.reversal_of_allocation_id=candidate.id
                      AND reversal.status='reversed')
             GROUP BY candidate.org_id, candidate.open_item_id
        )
        SELECT allocation.id AS allocation_id, allocation.open_item_id,
               invoice.id AS supplier_invoice_id,
               invoice.supplier_invoice_number, allocation.amount,
               item.principal_amount, effective.effective_allocated_amount,
               item.principal_amount-effective.effective_allocated_amount AS residual_amount,
               allocation.allocation_date
          FROM finance.allocations allocation
          JOIN finance.open_items item
            ON item.org_id=allocation.org_id AND item.id=allocation.open_item_id
           AND item.item_side='payable'
          JOIN finance.accounting_events invoice_event
            ON invoice_event.org_id=item.org_id
           AND invoice_event.id=item.accounting_event_id
           AND invoice_event.event_type='supplier_invoice'
          JOIN procurement.supplier_invoices invoice
            ON invoice.org_id=invoice_event.org_id
           AND invoice.id=invoice_event.supplier_invoice_id
           AND invoice.status='posted'
          JOIN effective ON effective.org_id=item.org_id
           AND effective.open_item_id=item.id
         WHERE allocation.org_id=:org_id AND allocation.payment_id=:payment_id
           AND allocation.status='posted'
           AND allocation.reversal_of_allocation_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM finance.allocations reversal
                WHERE reversal.org_id=allocation.org_id
                  AND reversal.reversal_of_allocation_id=allocation.id
                  AND reversal.status='reversed')
         ORDER BY allocation.allocation_date, allocation.id
    """, params)
    journal_lines = _rows(db, """
        SELECT line.id AS journal_line_id, line.line_number, line.account_id,
               line.party_id, line.transaction_debit AS debit,
               line.transaction_credit AS credit
          FROM finance.accounting_events event
          JOIN finance.journal_lines line
            ON line.org_id=event.org_id AND line.journal_entry_id=event.journal_entry_id
         WHERE event.org_id=:org_id AND event.payment_id=:payment_id
         ORDER BY line.line_number, line.id
    """, params)
    header = headers[0]
    amount = Decimal(str(header["amount"]))
    allocation_total = sum((Decimal(str(row["amount"])) for row in allocations), Decimal("0"))
    debit = sum((Decimal(str(row["debit"])) for row in journal_lines), Decimal("0"))
    credit = sum((Decimal(str(row["credit"])) for row in journal_lines), Decimal("0"))
    residuals_ok = all(Decimal(str(row["residual_amount"])) >= 0 for row in allocations)
    return {
        **header,
        "allocations": allocations,
        "journal_lines": journal_lines,
        "allocation_reconciled": allocation_total == amount,
        "journal_balanced": debit == credit == amount,
        "payable_residuals_reconciled": residuals_ok,
    }


__all__ = ["router"]
