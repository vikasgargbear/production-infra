"""Exact current receivable and payable aging from canonical open items."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.money import money_json
from ...core.security.permissions import PermissionChecker
from ..schemas.money import MoneyJSON


router = APIRouter(
    prefix="/canonical/party-aging",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Party Aging Reads"],
)
FINANCE_USER = Depends(PermissionChecker("finance", "view"))
PartyType = Literal["customer", "supplier"]
DocumentKind = Literal["sales_invoice", "supplier_invoice", "opening_balance"]
AgingBucket = Literal["current", "1-30", "31-60", "61-90", "over_90"]


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


class AgingDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: UUID
    open_item_id: UUID
    branch_id: UUID
    document_kind: DocumentKind
    document_number: str = Field(min_length=1)
    document_date: date
    due_date: date
    original_amount: MoneyJSON
    settled_amount: MoneyJSON
    outstanding_amount: MoneyJSON
    days_overdue: int = Field(ge=0)
    aging_bucket: AgingBucket
    status: Literal["pending", "partial", "overdue"]

    @model_validator(mode="after")
    def validate_document(self):
        original = Decimal(self.original_amount)
        settled = Decimal(self.settled_amount)
        outstanding = Decimal(self.outstanding_amount)
        if min(original, settled, outstanding) < 0 or settled + outstanding != original:
            raise ValueError("aging document settlement does not reconcile")
        expected_bucket: AgingBucket = (
            "current" if self.days_overdue == 0
            else "1-30" if self.days_overdue <= 30
            else "31-60" if self.days_overdue <= 60
            else "61-90" if self.days_overdue <= 90
            else "over_90"
        )
        if self.aging_bucket != expected_bucket:
            raise ValueError("aging bucket does not match days overdue")
        expected_status = (
            "overdue" if self.days_overdue > 0
            else "partial" if settled > 0
            else "pending"
        )
        if self.status != expected_status:
            raise ValueError("aging status does not match settlement and due date")
        return self


class AgingParty(BaseModel):
    model_config = ConfigDict(extra="forbid")

    party_account_id: UUID
    party_id: UUID
    party_type: PartyType
    party_code: str = Field(min_length=1)
    party_name: str = Field(min_length=1)
    account_status: Literal["active", "on_hold", "closed"]
    phone: Optional[str] = None
    email: Optional[str] = None
    limit_amount: Optional[MoneyJSON] = None
    total_outstanding: MoneyJSON
    overdue_amount: MoneyJSON
    document_count: int = Field(ge=1)
    overdue_document_count: int = Field(ge=0)
    max_overdue_days: int = Field(ge=0)
    documents: list[AgingDocument]

    @model_validator(mode="after")
    def validate_party(self):
        if self.document_count != len(self.documents):
            raise ValueError("party aging document count does not reconcile")
        overdue = [row for row in self.documents if row.days_overdue > 0]
        if self.overdue_document_count != len(overdue):
            raise ValueError("party overdue document count does not reconcile")
        if Decimal(self.total_outstanding) != sum(
            (Decimal(row.outstanding_amount) for row in self.documents), Decimal(0)
        ):
            raise ValueError("party outstanding does not reconcile")
        if Decimal(self.overdue_amount) != sum(
            (Decimal(row.outstanding_amount) for row in overdue), Decimal(0)
        ):
            raise ValueError("party overdue amount does not reconcile")
        if self.max_overdue_days != max(
            (row.days_overdue for row in self.documents), default=0
        ):
            raise ValueError("party maximum overdue days does not reconcile")
        return self


class AgingBucketSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: MoneyJSON
    document_count: int = Field(ge=0)


class PartyAgingSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    total_outstanding: MoneyJSON
    total_overdue: MoneyJSON
    party_count: int = Field(ge=0)
    document_count: int = Field(ge=0)
    buckets: dict[AgingBucket, AgingBucketSummary]


class PartyAgingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_version: Literal["1.0.0"]
    currency_code: Literal["INR"]
    party_type: PartyType
    as_of_date: date
    parties: list[AgingParty]
    summary: PartyAgingSummary

    @model_validator(mode="after")
    def validate_response(self):
        documents = [document for party in self.parties for document in party.documents]
        expected_buckets = {"current", "1-30", "31-60", "61-90", "over_90"}
        if set(self.summary.buckets) != expected_buckets:
            raise ValueError("aging summary must contain every canonical bucket")
        if self.summary.party_count != len(self.parties):
            raise ValueError("aging party count does not reconcile")
        if self.summary.document_count != len(documents):
            raise ValueError("aging document count does not reconcile")
        if Decimal(self.summary.total_outstanding) != sum(
            (Decimal(row.total_outstanding) for row in self.parties), Decimal(0)
        ):
            raise ValueError("aging outstanding summary does not reconcile")
        if Decimal(self.summary.total_overdue) != sum(
            (Decimal(row.overdue_amount) for row in self.parties), Decimal(0)
        ):
            raise ValueError("aging overdue summary does not reconcile")
        for bucket, summary in self.summary.buckets.items():
            rows = [row for row in documents if row.aging_bucket == bucket]
            if summary.document_count != len(rows) or Decimal(summary.amount) != sum(
                (Decimal(row.outstanding_amount) for row in rows), Decimal(0)
            ):
                raise ValueError(f"aging bucket {bucket} does not reconcile")
        return self


_AGING_SQL = """
WITH business_clock AS MATERIALIZED (
    SELECT erp_core_commands.current_organization_business_date() AS business_date
), effective_allocations AS (
    SELECT allocation.org_id, allocation.open_item_id,
           COALESCE(SUM(allocation.amount), 0) AS settled_amount
      FROM finance.allocations allocation
     WHERE allocation.org_id=:org_id
       AND allocation.status='posted'
       AND allocation.allocation_date<=(SELECT business_date FROM business_clock)
       AND allocation.reversal_of_allocation_id IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM finance.allocations reversal
            WHERE reversal.org_id=allocation.org_id
              AND reversal.reversal_of_allocation_id=allocation.id
              AND reversal.status='posted'
              AND reversal.allocation_date<=(SELECT business_date FROM business_clock)
       )
     GROUP BY allocation.org_id, allocation.open_item_id
), party_documents AS (
    SELECT invoice.org_id, invoice.branch_id, invoice.id AS document_id,
           'sales_invoice'::text AS document_kind,
           invoice.customer_account_id AS party_account_id,
           account.party_id, account.customer_code AS party_code,
           account.status AS account_status, party.legal_name AS party_name,
           account.credit_limit AS limit_amount,
           invoice.invoice_number AS document_number,
           invoice.invoice_date AS document_date
      FROM sales.invoices invoice
      JOIN parties.customer_accounts account
        ON account.org_id=invoice.org_id AND account.id=invoice.customer_account_id
      JOIN parties.parties party
        ON party.org_id=account.org_id AND party.id=account.party_id
     WHERE :party_type='customer' AND invoice.org_id=:org_id
       AND invoice.status='posted'
    UNION ALL
    SELECT invoice.org_id, invoice.branch_id, invoice.id,
           'supplier_invoice'::text, invoice.supplier_account_id,
           account.party_id, account.supplier_code, account.status,
           party.legal_name, NULL::numeric,
           invoice.supplier_invoice_number, invoice.supplier_invoice_date
      FROM procurement.supplier_invoices invoice
      JOIN parties.supplier_accounts account
        ON account.org_id=invoice.org_id AND account.id=invoice.supplier_account_id
      JOIN parties.parties party
        ON party.org_id=account.org_id AND party.id=account.party_id
     WHERE :party_type='supplier' AND invoice.org_id=:org_id
       AND invoice.status='posted'
    UNION ALL
    SELECT event.org_id, posting.branch_id, event.opening_balance_document_id,
           'opening_balance'::text, account.id,
           account.party_id, account.customer_code, account.status,
           party.legal_name, account.credit_limit,
           item.document_number, item.document_date
      FROM finance.accounting_events event
      JOIN finance.open_items item
        ON item.org_id=event.org_id AND item.accounting_event_id=event.id
      JOIN LATERAL (
          SELECT line.branch_id
            FROM finance.journal_lines line
           WHERE line.org_id=event.org_id
             AND line.journal_entry_id=event.journal_entry_id
             AND line.party_id=item.party_id
           ORDER BY line.line_number, line.id LIMIT 1
      ) posting ON true
      JOIN parties.customer_accounts account
        ON account.org_id=item.org_id AND account.party_id=item.party_id
      JOIN parties.parties party
        ON party.org_id=account.org_id AND party.id=account.party_id
     WHERE :party_type='customer' AND event.org_id=:org_id
       AND event.opening_balance_document_id IS NOT NULL
       AND item.item_side='receivable'
    UNION ALL
    SELECT event.org_id, posting.branch_id, event.opening_balance_document_id,
           'opening_balance'::text, account.id,
           account.party_id, account.supplier_code, account.status,
           party.legal_name, NULL::numeric,
           item.document_number, item.document_date
      FROM finance.accounting_events event
      JOIN finance.open_items item
        ON item.org_id=event.org_id AND item.accounting_event_id=event.id
      JOIN LATERAL (
          SELECT line.branch_id
            FROM finance.journal_lines line
           WHERE line.org_id=event.org_id
             AND line.journal_entry_id=event.journal_entry_id
             AND line.party_id=item.party_id
           ORDER BY line.line_number, line.id LIMIT 1
      ) posting ON true
      JOIN parties.supplier_accounts account
        ON account.org_id=item.org_id AND account.party_id=item.party_id
      JOIN parties.parties party
        ON party.org_id=account.org_id AND party.id=account.party_id
     WHERE :party_type='supplier' AND event.org_id=:org_id
       AND event.opening_balance_document_id IS NOT NULL
       AND item.item_side='payable'
), open_documents AS (
    SELECT document.org_id, document.branch_id, document.document_id,
           document.document_kind, document.party_account_id,
           document.party_id, document.party_code, document.account_status,
           document.party_name, document.limit_amount,
           document.document_number, document.document_date,
           item.id AS open_item_id, item.due_date, item.principal_amount,
           COALESCE(allocation.settled_amount,0) AS settled_amount,
           item.principal_amount-COALESCE(allocation.settled_amount,0)
             AS outstanding_amount,
           GREATEST((SELECT business_date FROM business_clock)-item.due_date,0)
             AS days_overdue
      FROM party_documents document
      JOIN finance.accounting_events event
        ON event.org_id=document.org_id
       AND ((document.document_kind='sales_invoice'
             AND event.sales_invoice_id=document.document_id)
         OR (document.document_kind='supplier_invoice'
             AND event.supplier_invoice_id=document.document_id)
         OR (document.document_kind='opening_balance'
             AND event.opening_balance_document_id=document.document_id))
      JOIN finance.open_items item
        ON item.org_id=event.org_id AND item.accounting_event_id=event.id
       AND item.party_id=document.party_id
       AND item.item_side=CASE WHEN :party_type='customer'
                              THEN 'receivable' ELSE 'payable' END
       AND item.status='open'
       AND item.currency_code='INR'
      LEFT JOIN effective_allocations allocation
        ON allocation.org_id=item.org_id AND allocation.open_item_id=item.id
     WHERE (:organization_scope
            OR document.branch_id=ANY(CAST(:branch_ids AS uuid[])))
       AND item.principal_amount-COALESCE(allocation.settled_amount,0)>0
)
SELECT row.*, (SELECT business_date FROM business_clock) AS as_of_date,
       contact.phone, contact.email
  FROM open_documents row
  LEFT JOIN LATERAL (
      SELECT value.phone, value.email
        FROM parties.contacts value
       WHERE value.org_id=row.org_id AND value.party_id=row.party_id
         AND value.status='active'
       ORDER BY value.is_primary DESC, value.created_at, value.id LIMIT 1
  ) contact ON true
 ORDER BY row.party_name, row.party_account_id, row.due_date,
          row.document_number, row.document_id, row.open_item_id
"""


def _bucket(days_overdue: int) -> AgingBucket:
    return (
        "current" if days_overdue == 0
        else "1-30" if days_overdue <= 30
        else "31-60" if days_overdue <= 60
        else "61-90" if days_overdue <= 90
        else "over_90"
    )


def query_party_aging(
    db: Session,
    *,
    org_id: UUID,
    party_type: PartyType,
    organization_scope: bool,
    branch_ids: list[UUID],
) -> dict[str, Any]:
    rows = [
        dict(row._mapping) for row in db.execute(text(_AGING_SQL), {
            "org_id": org_id,
            "party_type": party_type,
            "organization_scope": organization_scope,
            "branch_ids": branch_ids,
        }).fetchall()
    ]
    as_of_date = rows[0]["as_of_date"] if rows else db.execute(text(
        "SELECT erp_core_commands.current_organization_business_date()"
    )).scalar_one()
    grouped: dict[UUID, dict[str, Any]] = {}
    for row in rows:
        account_id = row["party_account_id"]
        party = grouped.setdefault(account_id, {
            "party_account_id": account_id,
            "party_id": row["party_id"],
            "party_type": party_type,
            "party_code": row["party_code"],
            "party_name": row["party_name"],
            "account_status": row["account_status"],
            "phone": row.get("phone"),
            "email": row.get("email"),
            "limit_amount": (
                None if row.get("limit_amount") is None
                else money_json(row["limit_amount"])
            ),
            "documents": [],
        })
        days_overdue = int(row["days_overdue"])
        outstanding = Decimal(str(row["outstanding_amount"]))
        principal = Decimal(str(row["principal_amount"]))
        settled = Decimal(str(row["settled_amount"]))
        party["documents"].append({
            "document_id": row["document_id"],
            "open_item_id": row["open_item_id"],
            "branch_id": row["branch_id"],
            "document_kind": row["document_kind"],
            "document_number": row["document_number"],
            "document_date": row["document_date"],
            "due_date": row["due_date"],
            "original_amount": money_json(principal),
            "settled_amount": money_json(settled),
            "outstanding_amount": money_json(outstanding),
            "days_overdue": days_overdue,
            "aging_bucket": _bucket(days_overdue),
            "status": (
                "overdue" if days_overdue > 0
                else "partial" if settled > 0
                else "pending"
            ),
        })
    parties = []
    for party in grouped.values():
        documents = party["documents"]
        overdue = [row for row in documents if row["days_overdue"] > 0]
        parties.append({
            **party,
            "total_outstanding": money_json(sum(
                (Decimal(row["outstanding_amount"]) for row in documents), Decimal(0)
            )),
            "overdue_amount": money_json(sum(
                (Decimal(row["outstanding_amount"]) for row in overdue), Decimal(0)
            )),
            "document_count": len(documents),
            "overdue_document_count": len(overdue),
            "max_overdue_days": max(
                (row["days_overdue"] for row in documents), default=0
            ),
        })
    documents = [row for party in parties for row in party["documents"]]
    buckets = {}
    for name in ("current", "1-30", "31-60", "61-90", "over_90"):
        bucket_rows = [row for row in documents if row["aging_bucket"] == name]
        buckets[name] = {
            "amount": money_json(sum(
                (Decimal(row["outstanding_amount"]) for row in bucket_rows), Decimal(0)
            )),
            "document_count": len(bucket_rows),
        }
    payload = {
        "contract_version": "1.0.0",
        "currency_code": "INR",
        "party_type": party_type,
        "as_of_date": as_of_date,
        "parties": parties,
        "summary": {
            "total_outstanding": money_json(sum(
                (Decimal(row["total_outstanding"]) for row in parties), Decimal(0)
            )),
            "total_overdue": money_json(sum(
                (Decimal(row["overdue_amount"]) for row in parties), Decimal(0)
            )),
            "party_count": len(parties),
            "document_count": len(documents),
            "buckets": buckets,
        },
    }
    return PartyAgingResponse.model_validate(payload).model_dump(mode="json")


@router.get("", response_model=PartyAgingResponse)
@router.get("/", response_model=PartyAgingResponse, include_in_schema=False)
def get_party_aging(
    party_type: PartyType = Query(...),
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
):
    """Return current branch-visible aging for receivables or payables."""
    org_id = _activate(db, user)
    organization_scope, branch_ids = _scope(user)
    return query_party_aging(
        db,
        org_id=org_id,
        party_type=party_type,
        organization_scope=organization_scope,
        branch_ids=branch_ids,
    )


__all__ = ["router", "query_party_aging"]
