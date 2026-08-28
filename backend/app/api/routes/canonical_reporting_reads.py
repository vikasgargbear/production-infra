"""Versioned factual financial and customer report projections."""

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
    prefix="/canonical/reports",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Reporting Reads"],
)
FINANCE_USER = Depends(PermissionChecker("finance", "view"))
REPORT_VERSION = "canonical-factual-v1"


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
    return organization_scope, [
        UUID(str(value)) for value in (user.get("branch_ids") or [])
    ]


def _period(date_from: date, date_to: date) -> None:
    if date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be on or after date_from")
    if (date_to - date_from).days > 3660:
        raise HTTPException(status_code=422, detail="report period cannot exceed ten years")


class TrialBalanceRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_id: UUID
    account_code: str = Field(min_length=1)
    account_name: str = Field(min_length=1)
    account_type: Literal["asset", "liability", "equity", "income", "expense"]
    opening_balance: MoneyJSON
    period_debit: MoneyJSON
    period_credit: MoneyJSON
    closing_balance: MoneyJSON

    @model_validator(mode="after")
    def reconcile(self):
        if (
            Decimal(self.opening_balance)
            + Decimal(self.period_debit)
            - Decimal(self.period_credit)
            != Decimal(self.closing_balance)
        ):
            raise ValueError("trial-balance row does not reconcile")
        return self


class TrialBalanceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_version: Literal["1.0.0"]
    definition_version: Literal["canonical-factual-v1"]
    currency_code: Literal["INR"]
    date_from: date
    date_to: date
    rows: list[TrialBalanceRow]
    total_period_debit: MoneyJSON
    total_period_credit: MoneyJSON
    period_balanced: bool


class ProfitLossRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_id: UUID
    account_code: str = Field(min_length=1)
    account_name: str = Field(min_length=1)
    account_type: Literal["income", "expense"]
    amount: MoneyJSON


class ProfitLossResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_version: Literal["1.0.0"]
    definition_version: Literal["canonical-factual-v1"]
    currency_code: Literal["INR"]
    date_from: date
    date_to: date
    income: MoneyJSON
    expenses: MoneyJSON
    result: MoneyJSON
    rows: list[ProfitLossRow]

    @model_validator(mode="after")
    def reconcile(self):
        income_rows = sum(
            (Decimal(row.amount) for row in self.rows if row.account_type == "income"),
            Decimal(0),
        )
        expense_rows = sum(
            (Decimal(row.amount) for row in self.rows if row.account_type == "expense"),
            Decimal(0),
        )
        if income_rows != Decimal(self.income) or expense_rows != Decimal(self.expenses):
            raise ValueError("profit-and-loss account rows do not reconcile")
        if Decimal(self.income) - Decimal(self.expenses) != Decimal(self.result):
            raise ValueError("profit-and-loss result does not reconcile")
        return self


class CustomerActivityRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_account_id: UUID
    party_id: UUID
    customer_code: str = Field(min_length=1)
    customer_name: str = Field(min_length=1)
    account_status: Literal["active", "on_hold", "closed"]
    invoice_count: int = Field(gt=0)
    billed_sales: MoneyJSON
    first_invoice_date: date
    last_invoice_date: date


class CustomerActivityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_version: Literal["1.0.0"]
    definition_version: Literal["canonical-factual-v1"]
    currency_code: Literal["INR"]
    date_from: date
    date_to: date
    transacting_customer_count: int = Field(ge=0)
    invoice_count: int = Field(ge=0)
    billed_sales: MoneyJSON
    customers: list[CustomerActivityRow]

    @model_validator(mode="after")
    def reconcile(self):
        if self.transacting_customer_count != len(self.customers):
            raise ValueError("customer activity count does not reconcile")
        if self.invoice_count != sum(row.invoice_count for row in self.customers):
            raise ValueError("customer invoice count does not reconcile")
        if Decimal(self.billed_sales) != sum(
            (Decimal(row.billed_sales) for row in self.customers), Decimal(0)
        ):
            raise ValueError("customer billed sales does not reconcile")
        return self


_TRIAL_BALANCE_SQL = """
WITH effective_lines AS (
    SELECT account.id AS account_id, account.code AS account_code,
           account.name AS account_name, account.account_type,
           journal.posting_date, line.functional_debit AS debit,
           line.functional_credit AS credit
      FROM finance.journal_entries journal
      JOIN finance.journal_lines line
        ON line.org_id=journal.org_id AND line.journal_entry_id=journal.id
      JOIN finance.accounts account
        ON account.org_id=line.org_id AND account.id=line.account_id
     WHERE journal.org_id=:org_id AND journal.status='posted'
       AND journal.reversal_of_journal_entry_id IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM finance.journal_entries reversal
            WHERE reversal.org_id=journal.org_id
              AND reversal.reversal_of_journal_entry_id=journal.id
              AND reversal.status='posted'
       )
       AND (:organization_scope
            OR line.branch_id=ANY(CAST(:branch_ids AS uuid[])))
       AND journal.posting_date<=:date_to
)
SELECT account_id, account_code, account_name, account_type,
       COALESCE(SUM(debit-credit)
                FILTER (WHERE posting_date<:date_from),0) AS opening_balance,
       COALESCE(SUM(debit)
                FILTER (WHERE posting_date BETWEEN :date_from AND :date_to),0)
         AS period_debit,
       COALESCE(SUM(credit)
                FILTER (WHERE posting_date BETWEEN :date_from AND :date_to),0)
         AS period_credit
  FROM effective_lines
 GROUP BY account_id, account_code, account_name, account_type
HAVING COALESCE(SUM(debit),0)<>0
    OR COALESCE(SUM(credit),0)<>0
 ORDER BY account_code, account_id
"""


_CUSTOMER_ACTIVITY_SQL = """
SELECT account.id AS customer_account_id, account.party_id,
       account.customer_code, party.legal_name AS customer_name,
       account.status AS account_status, COUNT(*)::integer AS invoice_count,
       SUM(invoice.grand_total) AS billed_sales,
       MIN(invoice.invoice_date) AS first_invoice_date,
       MAX(invoice.invoice_date) AS last_invoice_date
  FROM sales.invoices invoice
  JOIN parties.customer_accounts account
    ON account.org_id=invoice.org_id AND account.id=invoice.customer_account_id
  JOIN parties.parties party
    ON party.org_id=account.org_id AND party.id=account.party_id
 WHERE invoice.org_id=:org_id AND invoice.status='posted'
   AND invoice.currency_code='INR'
   AND invoice.invoice_date BETWEEN :date_from AND :date_to
   AND (:organization_scope
        OR invoice.branch_id=ANY(CAST(:branch_ids AS uuid[])))
 GROUP BY account.id, account.party_id, account.customer_code,
          party.legal_name, account.status
 ORDER BY billed_sales DESC, party.legal_name, account.id
"""


def query_trial_balance(
    db: Session, *, org_id: UUID, date_from: date, date_to: date,
    organization_scope: bool, branch_ids: list[UUID],
) -> dict[str, Any]:
    rows = [dict(row._mapping) for row in db.execute(text(_TRIAL_BALANCE_SQL), {
        "org_id": org_id, "date_from": date_from, "date_to": date_to,
        "organization_scope": organization_scope, "branch_ids": branch_ids,
    }).fetchall()]
    projected = []
    for row in rows:
        opening = Decimal(str(row["opening_balance"]))
        debit = Decimal(str(row["period_debit"]))
        credit = Decimal(str(row["period_credit"]))
        projected.append({
            **{key: row[key] for key in (
                "account_id", "account_code", "account_name", "account_type"
            )},
            "opening_balance": money_json(opening),
            "period_debit": money_json(debit),
            "period_credit": money_json(credit),
            "closing_balance": money_json(opening + debit - credit),
        })
    total_debit = sum((Decimal(row["period_debit"]) for row in projected), Decimal(0))
    total_credit = sum((Decimal(row["period_credit"]) for row in projected), Decimal(0))
    payload = {
        "contract_version": "1.0.0", "definition_version": REPORT_VERSION,
        "currency_code": "INR",
        "date_from": date_from, "date_to": date_to, "rows": projected,
        "total_period_debit": money_json(total_debit),
        "total_period_credit": money_json(total_credit),
        "period_balanced": total_debit == total_credit,
    }
    return TrialBalanceResponse.model_validate(payload).model_dump(mode="json")


def query_profit_loss(
    db: Session, *, org_id: UUID, date_from: date, date_to: date,
    organization_scope: bool, branch_ids: list[UUID],
) -> dict[str, Any]:
    trial = query_trial_balance(
        db, org_id=org_id, date_from=date_from, date_to=date_to,
        organization_scope=organization_scope, branch_ids=branch_ids,
    )
    rows = []
    for row in trial["rows"]:
        if row["account_type"] not in {"income", "expense"}:
            continue
        debit, credit = Decimal(row["period_debit"]), Decimal(row["period_credit"])
        amount = credit - debit if row["account_type"] == "income" else debit - credit
        rows.append({
            "account_id": row["account_id"], "account_code": row["account_code"],
            "account_name": row["account_name"], "account_type": row["account_type"],
            "amount": money_json(amount),
        })
    income = sum(
        (Decimal(row["amount"]) for row in rows if row["account_type"] == "income"),
        Decimal(0),
    )
    expenses = sum(
        (Decimal(row["amount"]) for row in rows if row["account_type"] == "expense"),
        Decimal(0),
    )
    payload = {
        "contract_version": "1.0.0", "definition_version": REPORT_VERSION,
        "currency_code": "INR",
        "date_from": date_from, "date_to": date_to,
        "income": money_json(income), "expenses": money_json(expenses),
        "result": money_json(income - expenses), "rows": rows,
    }
    return ProfitLossResponse.model_validate(payload).model_dump(mode="json")


@router.get("/trial-balance", response_model=TrialBalanceResponse)
def trial_balance(
    date_from: date = Query(...), date_to: date = Query(...),
    user: dict[str, Any] = FINANCE_USER, db: Session = Depends(get_db),
):
    _period(date_from, date_to)
    org_id = _activate(db, user)
    organization_scope, branch_ids = _scope(user)
    return query_trial_balance(
        db, org_id=org_id, date_from=date_from, date_to=date_to,
        organization_scope=organization_scope, branch_ids=branch_ids,
    )


@router.get("/profit-loss", response_model=ProfitLossResponse)
def profit_loss(
    date_from: date = Query(...), date_to: date = Query(...),
    user: dict[str, Any] = FINANCE_USER, db: Session = Depends(get_db),
):
    _period(date_from, date_to)
    org_id = _activate(db, user)
    organization_scope, branch_ids = _scope(user)
    return query_profit_loss(
        db, org_id=org_id, date_from=date_from, date_to=date_to,
        organization_scope=organization_scope, branch_ids=branch_ids,
    )


def query_customer_activity(
    db: Session, *, org_id: UUID, date_from: date, date_to: date,
    organization_scope: bool, branch_ids: list[UUID],
) -> dict[str, Any]:
    params = {
        "org_id": org_id, "date_from": date_from, "date_to": date_to,
        "organization_scope": organization_scope, "branch_ids": branch_ids,
    }
    rows = [dict(row._mapping) for row in db.execute(
        text(_CUSTOMER_ACTIVITY_SQL), params
    ).fetchall()]
    customers = [{
        **{key: row[key] for key in (
            "customer_account_id", "party_id", "customer_code", "customer_name",
            "account_status", "invoice_count", "first_invoice_date", "last_invoice_date",
        )},
        "billed_sales": money_json(row["billed_sales"]),
    } for row in rows]
    payload = {
        "contract_version": "1.0.0", "definition_version": REPORT_VERSION,
        "currency_code": "INR",
        "date_from": date_from, "date_to": date_to,
        "transacting_customer_count": len(customers),
        "invoice_count": sum(row["invoice_count"] for row in customers),
        "billed_sales": money_json(sum(
            (Decimal(row["billed_sales"]) for row in customers), Decimal(0)
        )),
        "customers": customers,
    }
    return CustomerActivityResponse.model_validate(payload).model_dump(mode="json")


@router.get("/customer-activity", response_model=CustomerActivityResponse)
def customer_activity(
    date_from: date = Query(...), date_to: date = Query(...),
    user: dict[str, Any] = FINANCE_USER, db: Session = Depends(get_db),
):
    _period(date_from, date_to)
    org_id = _activate(db, user)
    organization_scope, branch_ids = _scope(user)
    return query_customer_activity(
        db, org_id=org_id, date_from=date_from, date_to=date_to,
        organization_scope=organization_scope, branch_ids=branch_ids,
    )


__all__ = [
    "router", "query_trial_balance", "query_profit_loss", "query_customer_activity",
    "TrialBalanceResponse",
    "ProfitLossResponse", "CustomerActivityResponse",
]
