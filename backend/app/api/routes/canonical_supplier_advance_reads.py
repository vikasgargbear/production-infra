"""Authoritative source projection and posted readback for supplier advances.

The projection mirrors the bounded ``finance.supplier_advance.prepare``
resolver: one approved INR goods purchase-order line, one verified resident
supplier, an eligible fiscal fact, and one bank-owned settlement ledger.  It
does not reuse supplier-invoice payables or derive business facts in the UI.
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
    prefix="/canonical/supplier-advances",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Supplier Advance Reads"],
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


class SupplierAdvanceBranch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    branch_id: UUID
    branch_code: str
    branch_name: str


class SupplierAdvanceBank(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bank_account_id: UUID
    settlement_account_id: UUID
    bank_name: str
    account_holder_name: str
    ifsc: str
    currency_code: Literal["INR"]


class SupplierAdvancePurchaseOrderLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    purchase_order_id: UUID
    branch_id: UUID
    purchase_order_number: str
    order_date: date
    purchase_order_line_id: UUID
    line_number: int = Field(gt=0)
    product_id: UUID
    product_code: str
    product_name: str
    uom_code: str
    ordered_quantity: Decimal
    net_value_amount: Decimal
    prior_active_gross: Decimal
    remaining_advance_amount: Decimal
    withholding_nature_code: Literal["purchase_of_goods"]

    @model_validator(mode="after")
    def validate_remaining(self):
        if self.net_value_amount <= 0 or self.prior_active_gross < 0:
            raise ValueError("supplier-advance purchase-order value is invalid")
        if self.net_value_amount - self.prior_active_gross != self.remaining_advance_amount:
            raise ValueError("supplier-advance remaining amount does not reconcile")
        if self.remaining_advance_amount <= 0:
            raise ValueError("supplier-advance purchase-order line is fully advanced")
        return self


class SupplierAdvanceParty(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier_account_id: UUID
    party_id: UUID
    supplier_code: str
    supplier_name: str
    lines: list[SupplierAdvancePurchaseOrderLine]


class SupplierAdvanceContextResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ready: bool
    blocking_reasons: list[str]
    payment_date: date
    withholding_treatment: Literal["not_applicable_verified"]
    branches: list[SupplierAdvanceBranch]
    bank_accounts: list[SupplierAdvanceBank]
    suppliers: list[SupplierAdvanceParty]

    @model_validator(mode="after")
    def validate_readiness(self):
        has_lines = any(supplier.lines for supplier in self.suppliers)
        expected = bool(self.branches and self.bank_accounts and has_lines)
        if self.ready != (expected and not self.blocking_reasons):
            raise ValueError("supplier-advance context readiness is inconsistent")
        line_ids = [line.purchase_order_line_id for supplier in self.suppliers for line in supplier.lines]
        if len(line_ids) != len(set(line_ids)):
            raise ValueError("supplier-advance context repeats a purchase-order line")
        return self


class PostedSupplierAdvanceAllocation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allocation_id: UUID
    purchase_order_id: UUID
    purchase_order_number: str
    purchase_order_line_id: UUID
    line_number: int = Field(gt=0)
    product_id: UUID
    product_code: str
    product_name: str
    prepayment_open_item_id: UUID
    cash_disbursed_amount: Decimal
    withheld_amount: Decimal
    gross_advance_amount: Decimal
    prepayment_principal_amount: Decimal
    withholding_id: Optional[UUID]
    allocation_date: date
    status: Literal["posted"]

    @model_validator(mode="after")
    def validate_amounts(self):
        if self.cash_disbursed_amount <= 0 or self.withheld_amount < 0:
            raise ValueError("supplier-advance allocation amounts are invalid")
        if self.cash_disbursed_amount + self.withheld_amount != self.gross_advance_amount:
            raise ValueError("supplier-advance gross amount does not reconcile")
        if self.prepayment_principal_amount != self.gross_advance_amount:
            raise ValueError("supplier-advance prepayment open item does not reconcile")
        if (self.withheld_amount == 0) != (self.withholding_id is None):
            raise ValueError("supplier-advance withholding identity is inconsistent")
        return self


class SupplierAdvanceJournalLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journal_line_id: UUID
    line_number: int = Field(gt=0)
    account_id: UUID
    party_id: Optional[UUID]
    debit: Decimal
    credit: Decimal


class PostedSupplierAdvanceResponse(BaseModel):
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
    supplier_prepayment_account_id: UUID
    payment_method: Literal["bank_transfer", "upi"]
    external_reference: str
    cash_disbursed_amount: Decimal
    gross_advance_amount: Decimal
    withheld_amount: Decimal
    status: Literal["posted"]
    accounting_event_id: UUID
    journal_entry_id: UUID
    journal_number: str
    journal_debit_total: Decimal
    journal_credit_total: Decimal
    allocations: list[PostedSupplierAdvanceAllocation]
    journal_lines: list[SupplierAdvanceJournalLine]
    allocation_reconciled: Literal[True]
    journal_balanced: Literal[True]
    prepayment_reconciled: Literal[True]
    withholding_reconciled: Literal[True]

    @model_validator(mode="after")
    def validate_posting(self):
        if len(self.allocations) != 1 or len(self.journal_lines) != 2:
            raise ValueError("posted supplier advance lacks the exact allocation or journal")
        allocation = self.allocations[0]
        debit = sum((line.debit for line in self.journal_lines), Decimal("0"))
        credit = sum((line.credit for line in self.journal_lines), Decimal("0"))
        if (
            allocation.cash_disbursed_amount != self.cash_disbursed_amount
            or allocation.gross_advance_amount != self.gross_advance_amount
            or allocation.withheld_amount != self.withheld_amount
        ):
            raise ValueError("posted supplier-advance allocation differs from payment totals")
        if not (
            debit == credit == self.cash_disbursed_amount
            and self.journal_debit_total == self.cash_disbursed_amount
            and self.journal_credit_total == self.cash_disbursed_amount
        ):
            raise ValueError("posted supplier-advance journal is not balanced")
        prepayment = [line for line in self.journal_lines if (
            line.account_id == self.supplier_prepayment_account_id
            and line.party_id == self.party_id
            and line.debit == self.gross_advance_amount
            and line.credit == 0
        )]
        settlement = [line for line in self.journal_lines if (
            line.account_id == self.settlement_account_id
            and line.party_id is None
            and line.debit == 0
            and line.credit == self.cash_disbursed_amount
        )]
        if len(prepayment) != 1 or len(settlement) != 1:
            raise ValueError("supplier-advance prepayment or settlement journal identity is invalid")
        return self


@router.get("/context", response_model=SupplierAdvanceContextResponse)
def supplier_advance_context(
    payment_date: Optional[date] = Query(default=None),
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return only PO lines accepted by the bounded advance command."""
    org_id = _activate(db, user)
    business_date = _organization_business_date(db, org_id)
    effective_date = payment_date or business_date
    if effective_date > business_date:
        raise HTTPException(status_code=422, detail="Supplier advance date cannot be in the future")
    organization_scope, branch_ids = _scope(user)
    params = {
        "org_id": org_id,
        "payment_date": effective_date,
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
               bank.bank_name, bank.account_holder_name, bank.ifsc, bank.currency_code
          FROM finance.bank_accounts bank
          JOIN finance.accounts account
            ON account.org_id=bank.org_id AND account.id=bank.account_id
           AND account.status='active' AND account.account_type='asset'
           AND account.currency_code='INR' AND account.allows_bank_reconciliation
         WHERE bank.org_id=:org_id AND bank.status='active' AND bank.currency_code='INR'
         ORDER BY bank.bank_name, bank.id
    """, params)
    lines = _rows(db, """
        WITH prior_advance AS (
            SELECT prior.org_id, prior.purchase_order_line_id,
                   SUM(prior.gross_advance_amount) AS prior_active_gross
              FROM procurement.purchase_order_advance_allocations prior
             WHERE prior.org_id=:org_id AND prior.status='posted'
               AND prior.reversal_of_allocation_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
                    WHERE reversal.org_id=prior.org_id
                      AND reversal.reversal_of_allocation_id=prior.id
                      AND reversal.status='reversed')
             GROUP BY prior.org_id, prior.purchase_order_line_id
        )
        SELECT supplier.id AS supplier_account_id, supplier.party_id,
               supplier.supplier_code, party.legal_name AS supplier_name,
               purchase.id AS purchase_order_id, purchase.purchase_order_number,
               purchase.branch_id, purchase.order_date, line.id AS purchase_order_line_id,
               line.line_number, line.product_id, product.sku AS product_code,
               product.name AS product_name, line.uom_code,
               line.billed_quantity AS ordered_quantity, line.net_value_amount,
               COALESCE(prior.prior_active_gross,0) AS prior_active_gross,
               line.net_value_amount-COALESCE(prior.prior_active_gross,0)
                 AS remaining_advance_amount,
               line.withholding_nature_code
          FROM procurement.purchase_orders purchase
          JOIN procurement.purchase_order_lines line
            ON line.org_id=purchase.org_id AND line.purchase_order_id=purchase.id
           AND line.line_kind='product'
           AND line.withholding_nature_code='purchase_of_goods'
           AND line.net_value_amount>0
          JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=purchase.org_id
           AND supplier.id=purchase.supplier_account_id AND supplier.status='active'
          JOIN parties.parties party
            ON party.org_id=supplier.org_id AND party.id=supplier.party_id
           AND party.status='active' AND party.tax_residency_status='resident'
           AND party.pan IS NOT NULL AND party.pan_verification_status='verified'
           AND party.tax_profile_verified_at IS NOT NULL
           AND party.tax_profile_verified_at<=transaction_timestamp()
           AND party.tax_profile_evidence_attachment_id IS NOT NULL
          JOIN core.attachments party_evidence
            ON party_evidence.org_id=party.org_id
           AND party_evidence.id=party.tax_profile_evidence_attachment_id
           AND party_evidence.status IN ('verified','retained')
           AND party_evidence.verified_at IS NOT NULL
           AND party_evidence.verified_at<=transaction_timestamp()
          JOIN tax.organization_fiscal_tax_facts fiscal_fact
            ON fiscal_fact.org_id=purchase.org_id AND fiscal_fact.status='active'
           AND fiscal_fact.fiscal_year_start_year=CASE
               WHEN EXTRACT(MONTH FROM CAST(:payment_date AS date))>=4
               THEN EXTRACT(YEAR FROM CAST(:payment_date AS date))::smallint
               ELSE (EXTRACT(YEAR FROM CAST(:payment_date AS date))-1)::smallint END
           AND CAST(:payment_date AS date) BETWEEN fiscal_fact.effective_from AND fiscal_fact.effective_to
           AND fiscal_fact.prior_fiscal_year_turnover<=100000000
           AND fiscal_fact.gst_tds_notified_deductor=false
          JOIN core.attachments fiscal_evidence
            ON fiscal_evidence.org_id=fiscal_fact.org_id
           AND fiscal_evidence.id=fiscal_fact.evidence_attachment_id
           AND fiscal_evidence.status IN ('verified','retained')
           AND fiscal_evidence.verified_at IS NOT NULL
           AND fiscal_evidence.verified_at<=transaction_timestamp()
          LEFT JOIN prior_advance prior
            ON prior.org_id=line.org_id AND prior.purchase_order_line_id=line.id
         WHERE purchase.org_id=:org_id AND purchase.status='approved'
           AND purchase.currency_code='INR'
           AND purchase.supply_type IN ('intra_state','inter_state')
           AND purchase.zero_rated_payment_mode='not_applicable'
           AND purchase.tax_charge_mechanism='normal'
           AND purchase.order_date<=:payment_date
           AND (:organization_scope OR purchase.branch_id=ANY(CAST(:branch_ids AS uuid[])))
           AND line.net_value_amount-COALESCE(prior.prior_active_gross,0)>0
         ORDER BY party.legal_name, purchase.order_date, purchase.purchase_order_number,
                  line.line_number, line.id
    """, params)
    suppliers: dict[UUID, dict[str, Any]] = {}
    for row in lines:
        supplier_id = row["supplier_account_id"]
        supplier = suppliers.setdefault(supplier_id, {
            "supplier_account_id": supplier_id,
            "party_id": row["party_id"],
            "supplier_code": row["supplier_code"],
            "supplier_name": row["supplier_name"],
            "lines": [],
        })
        supplier["lines"].append({key: row[key] for key in (
            "purchase_order_id", "branch_id", "purchase_order_number", "order_date",
            "purchase_order_line_id", "line_number", "product_id", "product_code",
            "product_name", "uom_code", "ordered_quantity", "net_value_amount",
            "prior_active_gross", "remaining_advance_amount", "withholding_nature_code",
        )})
    reasons: list[str] = []
    if not branches:
        reasons.append("No active branch is visible to this finance user.")
    if not banks:
        reasons.append("No active INR bank account owns a reconcilable asset settlement ledger.")
    if not lines:
        reasons.append(
            "No eligible approved INR product PO line has verified supplier, fiscal-tax, "
            "purchase-of-goods, and remaining advance evidence for this date."
        )
    return {
        "ready": not reasons,
        "blocking_reasons": reasons,
        "payment_date": effective_date,
        "withholding_treatment": "not_applicable_verified",
        "branches": branches,
        "bank_accounts": banks,
        "suppliers": list(suppliers.values()),
    }


@router.get("/{payment_id}", response_model=PostedSupplierAdvanceResponse)
def posted_supplier_advance(
    payment_id: UUID,
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Prove the posted prepayment, PO-line allocation, withholding, and journal."""
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
               prepayment.id AS supplier_prepayment_account_id,
               payment.payment_method, payment.external_reference,
               payment.amount AS cash_disbursed_amount,
               allocation.gross_advance_amount, allocation.withheld_amount,
               payment.status, event.id AS accounting_event_id,
               journal.id AS journal_entry_id, journal.journal_number,
               journal.transaction_debit_total AS journal_debit_total,
               journal.transaction_credit_total AS journal_credit_total
          FROM finance.payments payment
          JOIN procurement.purchase_order_advance_allocations allocation
            ON allocation.org_id=payment.org_id AND allocation.payment_id=payment.id
           AND allocation.status='posted' AND allocation.reversal_of_allocation_id IS NULL
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=allocation.org_id AND supplier.id=allocation.supplier_account_id
          JOIN parties.parties party
            ON party.org_id=supplier.org_id AND party.id=supplier.party_id
           AND party.id=payment.party_id
          JOIN finance.accounting_events event
            ON event.org_id=payment.org_id AND event.payment_id=payment.id
           AND event.event_type='payment'
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status='posted'
          JOIN finance.journal_lines prepayment_line
            ON prepayment_line.org_id=journal.org_id
           AND prepayment_line.journal_entry_id=journal.id
           AND prepayment_line.party_id=party.id
           AND prepayment_line.transaction_debit=allocation.gross_advance_amount
           AND prepayment_line.transaction_credit=0
          JOIN finance.accounts prepayment
            ON prepayment.org_id=prepayment_line.org_id
           AND prepayment.id=prepayment_line.account_id
           AND prepayment.account_type='asset' AND prepayment.allows_party_posting
         WHERE payment.org_id=:org_id AND payment.id=:payment_id
           AND payment.direction='disbursement'
           AND payment.payment_purpose='supplier_advance'
           AND payment.status='posted'
           AND (:organization_scope OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
    """, params)
    if len(headers) != 1:
        raise HTTPException(status_code=404, detail="Canonical posted supplier advance not found")
    allocations = _rows(db, """
        SELECT allocation.id AS allocation_id, purchase.id AS purchase_order_id,
               purchase.purchase_order_number,
               line.id AS purchase_order_line_id, line.line_number,
               line.product_id, product.sku AS product_code,
               product.name AS product_name,
               allocation.prepayment_open_item_id,
               allocation.cash_disbursed_amount, allocation.withheld_amount,
               allocation.gross_advance_amount,
               item.principal_amount AS prepayment_principal_amount,
               allocation.withholding_id, allocation.allocation_date,
               allocation.status
          FROM procurement.purchase_order_advance_allocations allocation
          JOIN procurement.purchase_order_lines line
            ON line.org_id=allocation.org_id AND line.id=allocation.purchase_order_line_id
          JOIN procurement.purchase_orders purchase
            ON purchase.org_id=line.org_id AND purchase.id=line.purchase_order_id
          JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id
          JOIN finance.open_items item
            ON item.org_id=allocation.org_id
           AND item.id=allocation.prepayment_open_item_id
           AND item.item_side='receivable' AND item.status='open'
         WHERE allocation.org_id=:org_id AND allocation.payment_id=:payment_id
           AND allocation.status='posted' AND allocation.reversal_of_allocation_id IS NULL
         ORDER BY allocation.id
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
    allocation_total = sum(
        (Decimal(str(row["gross_advance_amount"])) for row in allocations), Decimal("0")
    )
    debit = sum((Decimal(str(row["debit"])) for row in journal_lines), Decimal("0"))
    credit = sum((Decimal(str(row["credit"])) for row in journal_lines), Decimal("0"))
    return {
        **header,
        "allocations": allocations,
        "journal_lines": journal_lines,
        "allocation_reconciled": len(allocations) == 1
        and allocation_total == Decimal(str(header["gross_advance_amount"])),
        "journal_balanced": debit == credit == Decimal(str(header["cash_disbursed_amount"])),
        "prepayment_reconciled": len(allocations) == 1
        and Decimal(str(allocations[0]["prepayment_principal_amount"]))
        == Decimal(str(header["gross_advance_amount"])),
        "withholding_reconciled": len(allocations) == 1
        and Decimal(str(allocations[0]["withheld_amount"]))
        == Decimal(str(header["withheld_amount"])),
    }


__all__ = ["router"]
