"""Authoritative history and detail reads for posted commercial settlements.

The projection is deliberately narrower than the general payments table: only
customer receipts and supplier payments produced by their reviewed canonical
commands are visible.  Every returned row carries allocation, open-item, and
balanced-journal evidence; reversed payments, allocations, and journals are
excluded.
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
from ...core.money import money_json
from ...core.security.permissions import PermissionChecker
from ..schemas.money import MoneyJSON


router = APIRouter(
    prefix="/canonical/payment-history",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Payment History Reads"],
)
FINANCE_USER = Depends(PermissionChecker("finance", "view"))
PaymentDirection = Literal["received", "made"]
PaymentDirectionFilter = Literal["all", "received", "made"]


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


class CanonicalPaymentHistoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_id: UUID
    command_request_id: UUID
    payment_number: str
    payment_date: date
    branch_id: UUID
    party_id: UUID
    party_name: str
    direction: PaymentDirection
    payment_method: Literal["bank_transfer", "card", "upi"]
    external_reference: Optional[str]
    amount: MoneyJSON
    allocated_amount: MoneyJSON
    allocation_count: int = Field(gt=0)
    journal_entry_id: UUID
    journal_number: str
    journal_debit_total: MoneyJSON
    journal_credit_total: MoneyJSON
    allocation_reconciled: Literal[True]
    journal_balanced: Literal[True]
    open_item_residuals_reconciled: Literal[True]
    status: Literal["posted"]

    @model_validator(mode="after")
    def validate_evidence(self):
        amount = Decimal(self.amount)
        if Decimal(self.allocated_amount) != amount:
            raise ValueError("payment history allocations do not reconcile")
        if not (
            Decimal(self.journal_debit_total)
            == Decimal(self.journal_credit_total)
            == amount
        ):
            raise ValueError("payment history journal does not balance")
        return self


class CanonicalPaymentHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[CanonicalPaymentHistoryItem]
    page: int = Field(gt=0)
    page_size: int = Field(gt=0, le=100)
    total: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_page(self):
        if len(self.items) > self.page_size:
            raise ValueError("payment history page exceeds its declared size")
        if self.total < len(self.items):
            raise ValueError("payment history total is incomplete")
        return self


class CanonicalPaymentAllocationDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allocation_id: UUID
    open_item_id: UUID
    source_document_id: UUID
    source_document_number: str
    source_document_type: Literal["sales_invoice", "supplier_invoice"]
    allocation_date: date
    amount: MoneyJSON
    principal_amount: MoneyJSON
    effective_allocated_amount: MoneyJSON
    residual_amount: MoneyJSON

    @model_validator(mode="after")
    def validate_residual(self):
        if Decimal(self.amount) <= 0:
            raise ValueError("payment allocation must be positive")
        if Decimal(self.principal_amount) - Decimal(self.effective_allocated_amount) != Decimal(
            self.residual_amount
        ):
            raise ValueError("payment allocation residual does not reconcile")
        if Decimal(self.residual_amount) < 0:
            raise ValueError("payment allocation over-settles its open item")
        return self


class CanonicalPaymentJournalLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    journal_line_id: UUID
    line_number: int = Field(gt=0)
    account_id: UUID
    party_id: Optional[UUID]
    debit: MoneyJSON
    credit: MoneyJSON


class CanonicalPaymentDetail(CanonicalPaymentHistoryItem):
    allocations: list[CanonicalPaymentAllocationDetail]
    journal_lines: list[CanonicalPaymentJournalLine]

    @model_validator(mode="after")
    def validate_detail(self):
        if len(self.allocations) != self.allocation_count:
            raise ValueError("payment allocation detail cardinality is incomplete")
        if sum((Decimal(row.amount) for row in self.allocations), Decimal("0")) != Decimal(
            self.amount
        ):
            raise ValueError("payment allocation detail does not equal payment")
        debit = sum((Decimal(row.debit) for row in self.journal_lines), Decimal("0"))
        credit = sum((Decimal(row.credit) for row in self.journal_lines), Decimal("0"))
        if debit != credit or debit != Decimal(self.amount):
            raise ValueError("payment journal line detail does not balance")
        return self


_EVIDENCE_CTES = """
    WITH canonical_commands AS (
        SELECT CAST(:org_id AS uuid) AS org_id, command.payment_id,
               command.command_request_id, command.capability_code,
               command.branch_id
          FROM erp_automation_reads.payment_post_provenance(:org_id) command
    ), effective_allocations AS (
        SELECT allocation.org_id, allocation.id, allocation.payment_id,
               allocation.open_item_id, allocation.allocation_date,
               allocation.amount
          FROM finance.allocations allocation
         WHERE allocation.org_id=:org_id
           AND allocation.payment_id IS NOT NULL
           AND allocation.status='posted'
           AND allocation.reversal_of_allocation_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM finance.allocations reversal
                WHERE reversal.org_id=allocation.org_id
                  AND reversal.reversal_of_allocation_id=allocation.id
                  AND reversal.status='reversed'
           )
    ), item_totals AS (
        SELECT allocation.org_id, allocation.open_item_id,
               SUM(allocation.amount) AS effective_allocated_amount
          FROM finance.allocations allocation
         WHERE allocation.org_id=:org_id
           AND allocation.status='posted'
           AND allocation.reversal_of_allocation_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM finance.allocations reversal
                WHERE reversal.org_id=allocation.org_id
                  AND reversal.reversal_of_allocation_id=allocation.id
                  AND reversal.status='reversed'
           )
         GROUP BY allocation.org_id, allocation.open_item_id
    ), payment_allocations AS (
        SELECT allocation.org_id, allocation.payment_id,
               COUNT(*) AS allocation_count,
               SUM(allocation.amount) AS allocated_amount,
               BOOL_AND(item.principal_amount-total.effective_allocated_amount>=0)
                   AS residuals_reconciled
          FROM effective_allocations allocation
          JOIN finance.payments allocation_payment
            ON allocation_payment.org_id=allocation.org_id
           AND allocation_payment.id=allocation.payment_id
          JOIN finance.open_items item
            ON item.org_id=allocation.org_id AND item.id=allocation.open_item_id
           AND item.status<>'reversed'
          JOIN finance.accounting_events source_event
            ON source_event.org_id=item.org_id AND source_event.id=item.accounting_event_id
          JOIN item_totals total
            ON total.org_id=item.org_id AND total.open_item_id=item.id
         WHERE (
             (allocation_payment.direction='receipt'
              AND item.item_side='receivable'
              AND source_event.event_type='sales_invoice'
              AND source_event.sales_invoice_id IS NOT NULL)
             OR
             (allocation_payment.direction='disbursement'
              AND item.item_side='payable'
              AND source_event.event_type='supplier_invoice'
              AND source_event.supplier_invoice_id IS NOT NULL)
         )
         GROUP BY allocation.org_id, allocation.payment_id
    ), journal_facts AS (
        SELECT event.org_id, event.payment_id,
               (ARRAY_AGG(journal.id ORDER BY journal.id))[1] AS journal_entry_id,
               MIN(journal.journal_number) AS journal_number,
               MIN(journal.transaction_debit_total) AS journal_debit_total,
               MIN(journal.transaction_credit_total) AS journal_credit_total,
               SUM(line.transaction_debit) AS line_debit_total,
               SUM(line.transaction_credit) AS line_credit_total,
               COUNT(DISTINCT event.id) AS event_count,
               COUNT(DISTINCT journal.id) AS journal_count
          FROM finance.accounting_events event
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status='posted'
           AND journal.reversal_of_journal_entry_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM finance.journal_entries reversal
                WHERE reversal.org_id=journal.org_id
                  AND reversal.reversal_of_journal_entry_id=journal.id
                  AND reversal.status='posted'
           )
          JOIN finance.journal_lines line
            ON line.org_id=journal.org_id AND line.journal_entry_id=journal.id
         WHERE event.org_id=:org_id AND event.event_type='payment'
         GROUP BY event.org_id, event.payment_id
        HAVING COUNT(DISTINCT event.id)=1 AND COUNT(DISTINCT journal.id)=1
    ), authoritative_payments AS (
        SELECT payment.id AS payment_id, command.command_request_id,
               payment.payment_number, payment.payment_date, payment.branch_id,
               payment.party_id, party.legal_name AS party_name,
               CASE payment.direction WHEN 'receipt' THEN 'received' ELSE 'made' END
                   AS direction,
               payment.payment_method, payment.external_reference, payment.amount,
               allocation.allocated_amount, allocation.allocation_count,
               journal.journal_entry_id, journal.journal_number,
               journal.journal_debit_total, journal.journal_credit_total,
               allocation.allocated_amount=payment.amount AS allocation_reconciled,
               journal.journal_debit_total=payment.amount
                   AND journal.journal_credit_total=payment.amount
                   AND journal.line_debit_total=payment.amount
                   AND journal.line_credit_total=payment.amount AS journal_balanced,
               allocation.residuals_reconciled AS open_item_residuals_reconciled,
               payment.status
          FROM finance.payments payment
          JOIN canonical_commands command
            ON command.org_id=payment.org_id AND command.payment_id=payment.id
           AND ((payment.direction='receipt'
                 AND command.capability_code='finance.customer_receipt.prepare')
                OR (payment.direction='disbursement'
                    AND command.capability_code='finance.supplier_payment.prepare'))
          JOIN parties.parties party
            ON party.org_id=payment.org_id AND party.id=payment.party_id
          JOIN payment_allocations allocation
            ON allocation.org_id=payment.org_id AND allocation.payment_id=payment.id
          JOIN journal_facts journal
            ON journal.org_id=payment.org_id AND journal.payment_id=payment.id
         WHERE payment.org_id=:org_id
           AND payment.status='posted'
           AND payment.payment_purpose='commercial_settlement'
           AND payment.direction IN ('receipt','disbursement')
           AND command.branch_id=payment.branch_id
           AND payment.reversal_of_payment_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM finance.payments reversal
                WHERE reversal.org_id=payment.org_id
                  AND reversal.reversal_of_payment_id=payment.id
                  AND reversal.status='posted'
           )
           AND (:organization_scope
                OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
           AND (
               (payment.direction='receipt'
                AND EXISTS (
                    SELECT 1 FROM parties.customer_accounts customer
                     WHERE customer.org_id=payment.org_id
                       AND customer.party_id=payment.party_id
                ))
               OR
               (payment.direction='disbursement'
                AND EXISTS (
                    SELECT 1 FROM parties.supplier_accounts supplier
                     WHERE supplier.org_id=payment.org_id
                       AND supplier.party_id=payment.party_id
                ))
           )
    )
"""


def _filter_sql() -> str:
    return """
       WHERE (:direction='all' OR payment.direction=:direction)
         AND (CAST(:date_from AS date) IS NULL
              OR payment.payment_date>=CAST(:date_from AS date))
         AND (CAST(:date_to AS date) IS NULL
              OR payment.payment_date<=CAST(:date_to AS date))
         AND (
             CAST(:search AS text) IS NULL
             OR payment.payment_number ILIKE '%' || CAST(:search AS text) || '%'
             OR COALESCE(payment.external_reference,'')
                ILIKE '%' || CAST(:search AS text) || '%'
             OR payment.party_name ILIKE '%' || CAST(:search AS text) || '%'
         )
    """


def _wire_history_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        **row,
        "amount": money_json(row["amount"]),
        "allocated_amount": money_json(row["allocated_amount"]),
        "journal_debit_total": money_json(row["journal_debit_total"]),
        "journal_credit_total": money_json(row["journal_credit_total"]),
    }


@router.get("", response_model=CanonicalPaymentHistoryResponse)
def canonical_payment_history(
    direction: PaymentDirectionFilter = Query("all"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None, min_length=1, max_length=120),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return one authoritative page and a count over the identical filter."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="Payment history date range is invalid")
    org_id = _activate(db, user)
    organization_scope, branch_ids = _scope(user)
    params = {
        "org_id": org_id,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
        "direction": direction,
        "date_from": date_from,
        "date_to": date_to,
        "search": search.strip() if search else None,
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }
    total = int(db.execute(text(
        _EVIDENCE_CTES
        + " SELECT COUNT(*) FROM authoritative_payments payment "
        + _filter_sql()
    ), params).scalar_one())
    rows = _rows(
        db,
        _EVIDENCE_CTES
        + """
          SELECT payment.*
            FROM authoritative_payments payment
        """
        + _filter_sql()
        + """
           ORDER BY payment.payment_date DESC, payment.payment_number DESC,
                    payment.payment_id DESC
           LIMIT :limit OFFSET :offset
        """,
        params,
    )
    return {
        "items": [_wire_history_row(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/{payment_id:uuid}", response_model=CanonicalPaymentDetail)
def canonical_payment_detail(
    payment_id: UUID,
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return exact settlement, effective allocations, residuals, and journal lines."""
    org_id = _activate(db, user)
    organization_scope, branch_ids = _scope(user)
    params = {
        "org_id": org_id,
        "payment_id": payment_id,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
    }
    headers = _rows(
        db,
        _EVIDENCE_CTES
        + """
          SELECT payment.*
            FROM authoritative_payments payment
           WHERE payment.payment_id=:payment_id
        """,
        params,
    )
    if len(headers) != 1:
        raise HTTPException(status_code=404, detail="Canonical posted payment not found")
    allocations = _rows(db, """
        WITH item_totals AS (
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
               COALESCE(invoice.id, supplier_invoice.id) AS source_document_id,
               COALESCE(invoice.invoice_number, supplier_invoice.supplier_invoice_number)
                   AS source_document_number,
               CASE WHEN invoice.id IS NOT NULL THEN 'sales_invoice'
                    ELSE 'supplier_invoice' END AS source_document_type,
               allocation.allocation_date, allocation.amount,
               item.principal_amount, total.effective_allocated_amount,
               item.principal_amount-total.effective_allocated_amount AS residual_amount
          FROM finance.allocations allocation
          JOIN finance.payments payment
            ON payment.org_id=allocation.org_id AND payment.id=allocation.payment_id
          JOIN finance.open_items item
            ON item.org_id=allocation.org_id AND item.id=allocation.open_item_id
           AND item.status<>'reversed'
          JOIN item_totals total
            ON total.org_id=item.org_id AND total.open_item_id=item.id
          JOIN finance.accounting_events source_event
            ON source_event.org_id=item.org_id AND source_event.id=item.accounting_event_id
          LEFT JOIN sales.invoices invoice
            ON invoice.org_id=source_event.org_id
           AND invoice.id=source_event.sales_invoice_id
           AND source_event.event_type='sales_invoice'
           AND payment.direction='receipt' AND item.item_side='receivable'
          LEFT JOIN procurement.supplier_invoices supplier_invoice
            ON supplier_invoice.org_id=source_event.org_id
           AND supplier_invoice.id=source_event.supplier_invoice_id
           AND source_event.event_type='supplier_invoice'
           AND payment.direction='disbursement' AND item.item_side='payable'
         WHERE allocation.org_id=:org_id AND allocation.payment_id=:payment_id
           AND allocation.status='posted'
           AND allocation.reversal_of_allocation_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM finance.allocations reversal
                WHERE reversal.org_id=allocation.org_id
                  AND reversal.reversal_of_allocation_id=allocation.id
                  AND reversal.status='reversed')
           AND (:organization_scope
                OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
           AND ((payment.direction='receipt' AND invoice.id IS NOT NULL)
                OR (payment.direction='disbursement' AND supplier_invoice.id IS NOT NULL))
         ORDER BY allocation.allocation_date, allocation.id
    """, params)
    journal_lines = _rows(db, """
        SELECT line.id AS journal_line_id, line.line_number, line.account_id,
               line.party_id, line.transaction_debit AS debit,
               line.transaction_credit AS credit
          FROM finance.payments payment
          JOIN finance.accounting_events event
            ON event.org_id=payment.org_id AND event.payment_id=payment.id
           AND event.event_type='payment'
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status='posted'
          JOIN finance.journal_lines line
            ON line.org_id=journal.org_id AND line.journal_entry_id=journal.id
         WHERE payment.org_id=:org_id AND payment.id=:payment_id
           AND (:organization_scope
                OR payment.branch_id=ANY(CAST(:branch_ids AS uuid[])))
         ORDER BY line.line_number, line.id
    """, params)
    header = _wire_history_row(headers[0])
    return {
        **header,
        "allocations": [{
            **row,
            "amount": money_json(row["amount"]),
            "principal_amount": money_json(row["principal_amount"]),
            "effective_allocated_amount": money_json(row["effective_allocated_amount"]),
            "residual_amount": money_json(row["residual_amount"]),
        } for row in allocations],
        "journal_lines": [{
            **row,
            "debit": money_json(row["debit"]),
            "credit": money_json(row["credit"]),
        } for row in journal_lines],
    }


__all__ = ["router"]
