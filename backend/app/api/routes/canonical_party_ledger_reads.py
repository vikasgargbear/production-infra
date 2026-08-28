"""Exact, posted and reversal-safe canonical party statements."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal
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
    prefix="/canonical/party-ledger",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Party Ledger Reads"],
)
FINANCE_USER = Depends(PermissionChecker("finance", "view"))
PartyType = Literal["customer", "supplier"]


def _activate(db: Session, user: dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(text("""
        SELECT erp_security.activate_context(:auth_user_id, :org_id),
               pg_catalog.set_config('app.request_id', :request_id, true)
    """), {
        "auth_user_id": UUID(str(user["auth_user_id"])),
        "org_id": org_id,
        "request_id": str(uuid4()),
    })
    return org_id


def _scope(user: dict[str, Any]) -> tuple[bool, list[UUID]]:
    organization_scope = (
        user.get("is_admin") is True
        or str(user.get("data_access_level") or "").lower() == "organization"
        or str(user.get("branch_scope") or "").lower() in {"all", "organization"}
    )
    return organization_scope, [UUID(str(value)) for value in (user.get("branch_ids") or [])]


class PartyLedgerEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    journal_entry_id: UUID
    journal_line_id: UUID
    accounting_event_id: UUID
    source_document_id: UUID
    source_type: str = Field(min_length=1, max_length=128)
    journal_number: str = Field(min_length=1, max_length=64)
    posting_date: date
    line_number: int = Field(gt=0)
    description: str
    debit: MoneyJSON
    credit: MoneyJSON
    running_balance: MoneyJSON

    @model_validator(mode="after")
    def validate_sides(self):
        debit, credit = Decimal(self.debit), Decimal(self.credit)
        if debit < 0 or credit < 0 or (debit > 0 and credit > 0):
            raise ValueError("party journal line must have one non-negative posting side")
        return self


class PartyLedgerStatement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    party_account_id: UUID
    party_id: UUID
    party_type: PartyType
    party_name: str = Field(min_length=1)
    account_id: UUID
    currency_code: Literal["INR"]
    date_from: date
    date_to: date
    opening_balance: MoneyJSON
    page_opening_balance: MoneyJSON
    closing_balance: MoneyJSON
    total_debit: MoneyJSON
    total_credit: MoneyJSON
    items: list[PartyLedgerEntry]
    page: int = Field(gt=0)
    page_size: int = Field(gt=0, le=200)
    total: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_statement(self):
        if self.date_to < self.date_from:
            raise ValueError("statement date range is inverted")
        if len(self.items) > self.page_size or self.total < len(self.items):
            raise ValueError("statement page metadata is inconsistent")
        if Decimal(self.total_debit) < 0 or Decimal(self.total_credit) < 0:
            raise ValueError("statement period totals must be non-negative")
        if self.page == 1 and self.page_opening_balance != self.opening_balance:
            raise ValueError("first statement page must start at the opening balance")
        balance = Decimal(self.page_opening_balance)
        for item in self.items:
            delta = (
                Decimal(item.debit) - Decimal(item.credit)
                if self.party_type == "customer"
                else Decimal(item.credit) - Decimal(item.debit)
            )
            balance += delta
            if balance != Decimal(item.running_balance):
                raise ValueError("statement running balance does not reconcile")
        if self.page == 1 and self.total == len(self.items):
            if balance != Decimal(self.closing_balance):
                raise ValueError("statement closing balance does not reconcile")
            if sum((Decimal(item.debit) for item in self.items), Decimal(0)) != Decimal(self.total_debit):
                raise ValueError("statement debit total does not reconcile")
            if sum((Decimal(item.credit) for item in self.items), Decimal(0)) != Decimal(self.total_credit):
                raise ValueError("statement credit total does not reconcile")
        return self


_STATEMENT_SQL = """
WITH selected_party AS (
    SELECT account.org_id, account.id AS party_account_id, account.party_id,
           account.default_receivable_account_id AS account_id,
           party.legal_name AS party_name, 'customer'::text AS party_type
      FROM parties.customer_accounts account
     JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
     WHERE account.org_id=:org_id AND account.id=:party_account_id
       AND :party_type='customer'
    UNION ALL
    SELECT account.org_id, account.id, account.party_id,
           account.default_payable_account_id, party.legal_name, 'supplier'::text
      FROM parties.supplier_accounts account
     JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
     WHERE account.org_id=:org_id AND account.id=:party_account_id
       AND :party_type='supplier'
), unique_events AS (
    SELECT event.org_id, event.journal_entry_id,
           (ARRAY_AGG(event.id ORDER BY event.id))[1] AS accounting_event_id,
           MIN(event.event_type) AS source_type,
           (ARRAY_REMOVE(ARRAY_AGG(COALESCE(
               event.sales_invoice_id, event.supplier_invoice_id, event.adjustment_note_id,
               event.purchase_order_advance_allocation_id, event.payment_id,
               event.expense_claim_id, event.inventory_document_id, event.withholding_id
           ) ORDER BY event.id), NULL))[1] AS source_document_id
      FROM finance.accounting_events event
     WHERE event.org_id=:org_id
     GROUP BY event.org_id, event.journal_entry_id
    HAVING COUNT(*)=1
       AND COUNT(COALESCE(
           event.sales_invoice_id, event.supplier_invoice_id, event.adjustment_note_id,
           event.purchase_order_advance_allocation_id, event.payment_id,
           event.expense_claim_id, event.inventory_document_id, event.withholding_id
       ))=1
), effective_lines AS (
    SELECT journal.id AS journal_entry_id, line.id AS journal_line_id,
           event.accounting_event_id, event.source_document_id, event.source_type,
           journal.journal_number, journal.posting_date, line.line_number,
           COALESCE(line.description, journal.description) AS description,
           line.functional_debit AS debit, line.functional_credit AS credit,
           CASE WHEN selected.party_type='customer'
                THEN line.functional_debit-line.functional_credit
                ELSE line.functional_credit-line.functional_debit END AS signed_delta
      FROM selected_party selected
      JOIN finance.journal_lines line
        ON line.org_id=selected.org_id AND line.party_id=selected.party_id
       AND line.account_id=selected.account_id
      JOIN finance.journal_entries journal
        ON journal.org_id=line.org_id AND journal.id=line.journal_entry_id
       AND journal.status='posted' AND journal.reversal_of_journal_entry_id IS NULL
      JOIN unique_events event
        ON event.org_id=journal.org_id AND event.journal_entry_id=journal.id
     WHERE (:organization_scope OR line.branch_id=ANY(CAST(:branch_ids AS uuid[])))
       AND NOT EXISTS (
           SELECT 1 FROM finance.journal_entries reversal
            WHERE reversal.org_id=journal.org_id
              AND reversal.reversal_of_journal_entry_id=journal.id
              AND reversal.status='posted'
       )
), opening AS (
    SELECT COALESCE(SUM(signed_delta), 0)::numeric(20,2) AS amount
      FROM effective_lines WHERE posting_date<:date_from
), period_lines AS (
    SELECT line.*,
           (SELECT amount FROM opening)
             + SUM(signed_delta) OVER (
                 ORDER BY posting_date, journal_entry_id, line_number, journal_line_id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS running_balance,
           (SELECT amount FROM opening)
             + COALESCE(SUM(signed_delta) OVER (
                 ORDER BY posting_date, journal_entry_id, line_number, journal_line_id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
               ), 0) AS balance_before,
           COUNT(*) OVER () AS total,
           SUM(debit) OVER () AS total_debit,
           SUM(credit) OVER () AS total_credit
      FROM effective_lines line
     WHERE posting_date BETWEEN :date_from AND :date_to
), metadata AS (
    SELECT selected.*, (SELECT amount FROM opening) AS opening_balance,
           COALESCE((SELECT SUM(signed_delta) FROM effective_lines
                     WHERE posting_date<=:date_to), 0)::numeric(20,2) AS closing_balance,
           COALESCE((SELECT SUM(debit) FROM period_lines), 0)::numeric(20,2) AS total_debit,
           COALESCE((SELECT SUM(credit) FROM period_lines), 0)::numeric(20,2) AS total_credit,
           COALESCE((SELECT MAX(total) FROM period_lines), 0)::bigint AS total
      FROM selected_party selected
)
SELECT metadata.party_account_id, metadata.party_id, metadata.account_id,
       metadata.party_name, metadata.party_type, metadata.opening_balance,
       metadata.closing_balance, metadata.total_debit, metadata.total_credit,
       metadata.total, page.*
  FROM metadata
  LEFT JOIN LATERAL (
      SELECT * FROM period_lines
       ORDER BY posting_date, journal_entry_id, line_number, journal_line_id
       LIMIT :page_size OFFSET :offset
  ) page ON TRUE
 ORDER BY page.posting_date, page.journal_entry_id, page.line_number, page.journal_line_id
"""


@router.get("/{party_account_id:uuid}", response_model=PartyLedgerStatement)
def get_party_statement(
    party_account_id: UUID,
    party_type: PartyType = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return a deterministic statement from effective posted journal evidence."""
    if date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be on or after date_from")
    org_id = _activate(db, user)
    organization_scope, branch_ids = _scope(user)
    rows = [dict(row._mapping) for row in db.execute(text(_STATEMENT_SQL), {
        "org_id": org_id,
        "party_account_id": party_account_id,
        "party_type": party_type,
        "date_from": date_from,
        "date_to": date_to,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
        "page_size": page_size,
        "offset": (page - 1) * page_size,
    }).fetchall()]
    if not rows:
        raise HTTPException(status_code=404, detail="Canonical party account not found")
    header = rows[0]
    items = []
    for row in rows:
        if row.get("journal_line_id") is None:
            continue
        items.append({
            key: row[key] for key in (
                "journal_entry_id", "journal_line_id", "accounting_event_id",
                "source_document_id", "source_type", "journal_number", "posting_date",
                "line_number", "description",
            )
        } | {
            "debit": money_json(row["debit"]),
            "credit": money_json(row["credit"]),
            "running_balance": money_json(row["running_balance"]),
        })
    return {
        "party_account_id": header["party_account_id"],
        "party_id": header["party_id"],
        "party_type": header["party_type"],
        "party_name": header["party_name"],
        "account_id": header["account_id"],
        "currency_code": "INR",
        "date_from": date_from,
        "date_to": date_to,
        "opening_balance": money_json(header["opening_balance"]),
        "page_opening_balance": money_json(
            header["balance_before"]
            if header.get("balance_before") is not None
            else header["closing_balance"]
        ),
        "closing_balance": money_json(header["closing_balance"]),
        "total_debit": money_json(header["total_debit"]),
        "total_credit": money_json(header["total_credit"]),
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": int(header["total"]),
    }


__all__ = ["router"]
