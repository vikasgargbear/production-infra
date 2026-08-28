"""Exact, filtered, branch-scoped desktop document histories.

This read boundary deliberately excludes drafts and presents only canonical
business documents whose lifecycle status is authoritative.  It never calls
legacy compatibility views and never derives totals in Python.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker, check_module_access


router = APIRouter(
    prefix="/canonical/document-history",
    tags=["Canonical Document History"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)

DocumentKind = Literal[
    "sales_invoice", "sales_order", "sales_dispatch",
    "supplier_invoice", "purchase_order", "goods_receipt",
    "sales_return", "purchase_return",
]
DocumentGroup = Literal["returns"]
Money = Annotated[str, Field(pattern=r"^-?(?:0|[1-9]\d{0,17})\.\d{2}$")]
Quantity = Annotated[str, Field(pattern=r"^-?(?:0|[1-9]\d{0,13})\.\d{6}$")]
Rate = Annotated[str, Field(pattern=r"^-?(?:0|[1-9]\d{0,15})\.\d{4}$")]


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


def _organization_business_date(db: Session) -> date:
    """Resolve overdue state against the organization's authoritative clock."""

    value = db.execute(text("""
        SELECT erp_core_commands.current_organization_business_date()
    """)).scalar_one_or_none()
    if value is None:
        raise HTTPException(
            status_code=503,
            detail="The active organization has no authoritative business clock",
        )
    return value


class CanonicalDocumentHistoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    document_kind: DocumentKind
    document_id: UUID
    branch_id: UUID
    document_number: str
    document_date: date
    due_date: Optional[date]
    status: str
    party_account_id: UUID
    party_name: str
    source_document_type: Optional[str]
    source_document_id: Optional[UUID]
    source_document_number: Optional[str]
    line_count: int = Field(ge=0)
    total_quantity: Quantity
    minimum_unit_rate: Optional[Rate]
    maximum_unit_rate: Optional[Rate]
    taxable_amount: Optional[Money]
    total_tax: Optional[Money]
    total_amount: Optional[Money]
    paid_amount: Optional[Money]
    outstanding_amount: Optional[Money]
    payment_status: Optional[Literal["paid", "partial", "pending", "overdue", "cancelled"]]
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_document_semantics(self):
        provenance = (
            self.source_document_type,
            self.source_document_id,
            self.source_document_number,
        )
        if any(value is None for value in provenance) and any(value is not None for value in provenance):
            raise ValueError("document provenance must be complete or absent")
        settles_open_item = self.document_kind in {"sales_invoice", "supplier_invoice"}
        if settles_open_item:
            if any(value is None for value in (
                self.total_amount, self.paid_amount, self.outstanding_amount, self.payment_status,
            )):
                raise ValueError("settlement document amounts are incomplete")
        elif any(value is not None for value in (
            self.paid_amount, self.outstanding_amount, self.payment_status,
        )):
            raise ValueError("non-settlement documents cannot expose settlement semantics")
        if self.document_kind == "sales_dispatch":
            if any(value is not None for value in (
                self.taxable_amount, self.total_tax, self.total_amount,
            )):
                raise ValueError("dispatch histories cannot invent monetary values")
        elif self.total_amount is None:
            raise ValueError("document total is required")
        if self.document_kind == "goods_receipt" and any(value is not None for value in (
            self.taxable_amount, self.total_tax,
        )):
            raise ValueError("goods receipt histories cannot invent tax values")
        return self


class CanonicalDocumentHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    items: list[CanonicalDocumentHistoryItem]
    business_date: date
    page: int = Field(gt=0)
    page_size: int = Field(gt=0, le=100)
    total: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_page(self):
        if len(self.items) > self.page_size or self.total < len(self.items):
            raise ValueError("canonical history pagination is inconsistent")
        return self


_MONEY = "'FM999999999999999990.00'"
_QUANTITY = "'FM999999999999990.000000'"
_RATE = "'FM9999999999999990.0000'"
_HISTORY_COLUMNS = (
    "document_kind",
    "document_id",
    "branch_id",
    "document_number",
    "document_date",
    "due_date",
    "status",
    "party_account_id",
    "party_name",
    "source_document_type",
    "source_document_id",
    "source_document_number",
    "line_count",
    "total_quantity",
    "minimum_unit_rate",
    "maximum_unit_rate",
    "taxable_amount",
    "total_tax",
    "total_amount",
    "paid_amount",
    "outstanding_amount",
    "payment_status",
    "created_at",
    "updated_at",
)


def _history_sources() -> str:
    # Each arm returns the identical wire shape. Status predicates exclude
    # mutable drafts; reversed rows remain explicit and cannot masquerade as posted.
    columns = ", ".join(_HISTORY_COLUMNS)
    return f"""
    WITH authoritative_documents ({columns}) AS (
      SELECT 'sales_invoice'::text AS document_kind, invoice.id AS document_id,
             invoice.branch_id, invoice.invoice_number AS document_number,
             invoice.invoice_date AS document_date, payable.due_date,
             invoice.status, invoice.customer_account_id AS party_account_id,
             party.legal_name AS party_name,
             CASE WHEN provenance.source_document_id IS NULL THEN NULL ELSE 'sales_dispatch' END
               AS source_document_type,
             provenance.source_document_id, provenance.source_document_number,
             COALESCE(lines.line_count,0)::integer AS line_count,
             to_char(COALESCE(lines.total_quantity,0), {_QUANTITY}) AS total_quantity,
             CASE WHEN lines.minimum_unit_rate IS NULL THEN NULL ELSE to_char(lines.minimum_unit_rate, {_RATE}) END AS minimum_unit_rate,
             CASE WHEN lines.maximum_unit_rate IS NULL THEN NULL ELSE to_char(lines.maximum_unit_rate, {_RATE}) END AS maximum_unit_rate,
             to_char(invoice.gst_taxable_total, {_MONEY}) AS taxable_amount,
             to_char(invoice.cgst_total+invoice.sgst_total+invoice.igst_total+invoice.cess_total, {_MONEY}) AS total_tax,
             to_char(invoice.grand_total, {_MONEY}) AS total_amount,
             to_char(COALESCE(payable.paid_amount,0), {_MONEY}) AS paid_amount,
             to_char(GREATEST(invoice.grand_total-COALESCE(payable.paid_amount,0),0), {_MONEY}) AS outstanding_amount,
             CASE WHEN invoice.status IN ('cancelled','reversed') THEN 'cancelled'
                  WHEN COALESCE(payable.paid_amount,0)>=invoice.grand_total THEN 'paid'
                  WHEN COALESCE(payable.paid_amount,0)>0 THEN 'partial'
                  WHEN payable.due_date<CAST(:business_date AS date) THEN 'overdue' ELSE 'pending' END AS payment_status,
             invoice.created_at, invoice.updated_at
        FROM sales.invoices invoice
        JOIN parties.customer_accounts account ON account.org_id=invoice.org_id AND account.id=invoice.customer_account_id
        JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS line_count, SUM(line.billed_quantity+line.free_quantity) AS total_quantity,
                 MIN(line.quoted_unit_rate) AS minimum_unit_rate, MAX(line.quoted_unit_rate) AS maximum_unit_rate
            FROM sales.invoice_lines line WHERE line.org_id=invoice.org_id AND line.invoice_id=invoice.id AND line.line_kind='product'
        ) lines ON true
        LEFT JOIN LATERAL (
          SELECT CASE WHEN count(DISTINCT dispatch_line.dispatch_id)=1 THEN (array_agg(DISTINCT dispatch_line.dispatch_id))[1] END AS source_document_id,
                 CASE WHEN count(DISTINCT dispatch_line.dispatch_id)=1 THEN (array_agg(DISTINCT source.dispatch_number))[1] END AS source_document_number
            FROM sales.invoice_dispatch_allocations allocation
            JOIN sales.invoice_lines invoice_line ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.invoice_line_id
            JOIN sales.dispatch_lines dispatch_line ON dispatch_line.org_id=allocation.org_id AND dispatch_line.id=allocation.dispatch_line_id
            JOIN sales.dispatches source ON source.org_id=dispatch_line.org_id AND source.id=dispatch_line.dispatch_id
           WHERE invoice_line.org_id=invoice.org_id AND invoice_line.invoice_id=invoice.id
        ) provenance ON true
        LEFT JOIN LATERAL (
          SELECT item.due_date, COALESCE(SUM(allocation.amount) FILTER (
                   WHERE allocation.status='posted' AND allocation.reversal_of_allocation_id IS NULL
                     AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id)
                 ),0) AS paid_amount
            FROM finance.accounting_events event
            JOIN finance.open_items item ON item.org_id=event.org_id AND item.accounting_event_id=event.id AND item.item_side='receivable' AND item.status<>'reversed'
            LEFT JOIN finance.allocations allocation ON allocation.org_id=item.org_id AND allocation.open_item_id=item.id
           WHERE event.org_id=invoice.org_id AND event.sales_invoice_id=invoice.id GROUP BY item.due_date
           ORDER BY item.due_date DESC LIMIT 1
        ) payable ON true
       WHERE invoice.org_id=:org_id AND invoice.status IN ('posted','reversed','cancelled')

      UNION ALL
      SELECT 'sales_order', orders.id, orders.branch_id, orders.order_number,
             orders.order_date, orders.requested_delivery_date, orders.status,
             orders.customer_account_id, party.legal_name, NULL, NULL, NULL,
             COALESCE(lines.line_count,0)::integer,
             to_char(COALESCE(lines.total_quantity,0), {_QUANTITY}),
             CASE WHEN lines.minimum_unit_rate IS NULL THEN NULL ELSE to_char(lines.minimum_unit_rate, {_RATE}) END,
             CASE WHEN lines.maximum_unit_rate IS NULL THEN NULL ELSE to_char(lines.maximum_unit_rate, {_RATE}) END,
             to_char(orders.gst_taxable_total, {_MONEY}),
             to_char(orders.cgst_total+orders.sgst_total+orders.igst_total+orders.cess_total, {_MONEY}),
             to_char(orders.grand_total, {_MONEY}), NULL::text, NULL::text,
             NULL, orders.created_at, orders.updated_at
        FROM sales.orders orders
        JOIN parties.customer_accounts account ON account.org_id=orders.org_id AND account.id=orders.customer_account_id
        JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS line_count, SUM(line.billed_quantity+line.free_quantity) AS total_quantity,
                 MIN(line.quoted_unit_rate) AS minimum_unit_rate, MAX(line.quoted_unit_rate) AS maximum_unit_rate
            FROM sales.order_lines line WHERE line.org_id=orders.org_id AND line.order_id=orders.id AND line.line_kind='product'
        ) lines ON true
       WHERE orders.org_id=:org_id
         AND orders.status IN ('submitted','approved','partially_fulfilled','fulfilled','cancelled')

      UNION ALL
      SELECT 'sales_dispatch', dispatch.id, dispatch.branch_id, dispatch.dispatch_number,
             dispatch.dispatch_date, NULL::date, dispatch.status,
             dispatch.customer_account_id, party.legal_name,
             CASE WHEN provenance.source_document_id IS NULL THEN NULL ELSE 'sales_order' END,
             provenance.source_document_id,
             provenance.source_document_number,
             COALESCE(lines.line_count,0)::integer,
             to_char(COALESCE(lines.total_quantity,0), {_QUANTITY}),
             CASE WHEN lines.minimum_unit_rate IS NULL THEN NULL ELSE to_char(lines.minimum_unit_rate, {_RATE}) END,
             CASE WHEN lines.maximum_unit_rate IS NULL THEN NULL ELSE to_char(lines.maximum_unit_rate, {_RATE}) END,
	             NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
             NULL, dispatch.created_at, dispatch.updated_at
        FROM sales.dispatches dispatch
        JOIN parties.customer_accounts account ON account.org_id=dispatch.org_id AND account.id=dispatch.customer_account_id
        JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS line_count, SUM(line.billed_quantity+line.free_quantity) AS total_quantity,
	                 MIN(order_line.quoted_unit_rate) AS minimum_unit_rate, MAX(order_line.quoted_unit_rate) AS maximum_unit_rate
            FROM sales.dispatch_lines line
            JOIN sales.order_lines order_line ON order_line.org_id=line.org_id AND order_line.id=line.order_line_id
           WHERE line.org_id=dispatch.org_id AND line.dispatch_id=dispatch.id
        ) lines ON true
        LEFT JOIN LATERAL (
          SELECT CASE WHEN count(DISTINCT order_line.order_id)=1 THEN (array_agg(DISTINCT order_line.order_id))[1] END AS source_document_id,
                 CASE WHEN count(DISTINCT order_line.order_id)=1 THEN (array_agg(DISTINCT source.order_number))[1] END AS source_document_number
            FROM sales.dispatch_lines line JOIN sales.order_lines order_line ON order_line.org_id=line.org_id AND order_line.id=line.order_line_id
            JOIN sales.orders source ON source.org_id=order_line.org_id AND source.id=order_line.order_id
           WHERE line.org_id=dispatch.org_id AND line.dispatch_id=dispatch.id
        ) provenance ON true
       WHERE dispatch.org_id=:org_id AND dispatch.status IN ('posted','cancelled','reversed')

      UNION ALL
      SELECT 'purchase_order', purchase.id, purchase.branch_id, purchase.purchase_order_number,
             purchase.order_date, purchase.expected_delivery_date, purchase.status,
             purchase.supplier_account_id, party.legal_name, NULL, NULL, NULL,
             COALESCE(lines.line_count,0)::integer, to_char(COALESCE(lines.total_quantity,0), {_QUANTITY}),
             CASE WHEN lines.minimum_unit_rate IS NULL THEN NULL ELSE to_char(lines.minimum_unit_rate,{_RATE}) END,
             CASE WHEN lines.maximum_unit_rate IS NULL THEN NULL ELSE to_char(lines.maximum_unit_rate,{_RATE}) END,
             to_char(purchase.gst_taxable_total,{_MONEY}), to_char(purchase.cgst_total+purchase.sgst_total+purchase.igst_total+purchase.cess_total,{_MONEY}),
	             to_char(purchase.grand_total,{_MONEY}), NULL::text, NULL::text, NULL,
             purchase.created_at, purchase.updated_at
        FROM procurement.purchase_orders purchase
        JOIN parties.supplier_accounts account ON account.org_id=purchase.org_id AND account.id=purchase.supplier_account_id
        JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS line_count, SUM(line.billed_quantity+line.free_quantity) AS total_quantity,
                 MIN(line.quoted_unit_rate) AS minimum_unit_rate, MAX(line.quoted_unit_rate) AS maximum_unit_rate
            FROM procurement.purchase_order_lines line WHERE line.org_id=purchase.org_id AND line.purchase_order_id=purchase.id AND line.line_kind='product'
        ) lines ON true
       WHERE purchase.org_id=:org_id
         AND purchase.status IN ('submitted','approved','partially_received','received','cancelled')

      UNION ALL
      SELECT 'supplier_invoice', invoice.id, invoice.branch_id, invoice.supplier_invoice_number,
             invoice.supplier_invoice_date, invoice.due_date, invoice.status,
             invoice.supplier_account_id, invoice.supplier_legal_name_snapshot,
             CASE WHEN provenance.source_document_id IS NULL THEN NULL ELSE 'goods_receipt' END,
             provenance.source_document_id, provenance.source_document_number,
             COALESCE(lines.line_count,0)::integer, to_char(COALESCE(lines.total_quantity,0),{_QUANTITY}),
             CASE WHEN lines.minimum_unit_rate IS NULL THEN NULL ELSE to_char(lines.minimum_unit_rate,{_RATE}) END,
             CASE WHEN lines.maximum_unit_rate IS NULL THEN NULL ELSE to_char(lines.maximum_unit_rate,{_RATE}) END,
             to_char(invoice.gst_taxable_total,{_MONEY}), to_char(invoice.cgst_total+invoice.sgst_total+invoice.igst_total+invoice.cess_total,{_MONEY}),
             to_char(invoice.grand_total,{_MONEY}), to_char(GREATEST(invoice.grand_total-COALESCE(payable.outstanding_amount,invoice.grand_total),0),{_MONEY}),
             to_char(COALESCE(payable.outstanding_amount,invoice.grand_total),{_MONEY}),
             CASE WHEN invoice.status IN ('cancelled','reversed') THEN 'cancelled'
                  WHEN COALESCE(payable.outstanding_amount,invoice.grand_total)<=0 THEN 'paid'
                  WHEN COALESCE(payable.outstanding_amount,invoice.grand_total)<invoice.grand_total THEN 'partial'
	                  WHEN invoice.due_date<CAST(:business_date AS date) THEN 'overdue' ELSE 'pending' END,
             invoice.created_at, invoice.updated_at
        FROM procurement.supplier_invoices invoice
        LEFT JOIN LATERAL (
          SELECT count(*) AS line_count, SUM(line.billed_quantity+line.free_quantity) AS total_quantity,
                 MIN(line.quoted_unit_rate) AS minimum_unit_rate, MAX(line.quoted_unit_rate) AS maximum_unit_rate
            FROM procurement.supplier_invoice_lines line WHERE line.org_id=invoice.org_id AND line.supplier_invoice_id=invoice.id AND line.line_kind='product'
        ) lines ON true
        LEFT JOIN LATERAL (
          SELECT CASE WHEN count(DISTINCT receipt_line.goods_receipt_id)=1 THEN (array_agg(DISTINCT receipt_line.goods_receipt_id))[1] END AS source_document_id,
                 CASE WHEN count(DISTINCT receipt_line.goods_receipt_id)=1 THEN (array_agg(DISTINCT source.goods_receipt_number))[1] END AS source_document_number
            FROM procurement.supplier_invoice_lines invoice_line
            JOIN procurement.supplier_invoice_receipt_allocations allocation
              ON allocation.org_id=invoice_line.org_id AND allocation.supplier_invoice_line_id=invoice_line.id
            JOIN procurement.goods_receipt_lines receipt_line
              ON receipt_line.org_id=allocation.org_id AND receipt_line.id=allocation.goods_receipt_line_id
            JOIN procurement.goods_receipts source
              ON source.org_id=receipt_line.org_id AND source.id=receipt_line.goods_receipt_id
           WHERE invoice_line.org_id=invoice.org_id AND invoice_line.supplier_invoice_id=invoice.id
        ) provenance ON true
        LEFT JOIN LATERAL (
          SELECT GREATEST(item.principal_amount-COALESCE(applied.amount,0),0) AS outstanding_amount
            FROM finance.accounting_events event
            JOIN finance.open_items item ON item.org_id=event.org_id AND item.accounting_event_id=event.id AND item.item_side='payable' AND item.status<>'reversed'
            LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(allocation.amount),0) AS amount FROM finance.allocations allocation
               WHERE allocation.org_id=item.org_id AND allocation.open_item_id=item.id AND allocation.status='posted'
                 AND allocation.reversal_of_allocation_id IS NULL
                 AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id)
            ) applied ON true
           WHERE event.org_id=invoice.org_id AND event.supplier_invoice_id=invoice.id ORDER BY item.id LIMIT 1
        ) payable ON true
       WHERE invoice.org_id=:org_id AND invoice.status IN ('posted','reversed','cancelled')

      UNION ALL
      SELECT 'goods_receipt', receipt.id, receipt.branch_id, receipt.goods_receipt_number,
             (receipt.received_at AT TIME ZONE organization.timezone)::date,
             NULL::date, receipt.status,
             receipt.supplier_account_id, party.legal_name,
             CASE WHEN lines.source_document_id IS NULL THEN NULL ELSE 'purchase_order' END,
             lines.source_document_id, lines.source_document_number,
             COALESCE(lines.line_count,0)::integer, to_char(COALESCE(lines.total_quantity,0),{_QUANTITY}),
             CASE WHEN lines.minimum_unit_rate IS NULL THEN NULL ELSE to_char(lines.minimum_unit_rate,{_RATE}) END,
             CASE WHEN lines.maximum_unit_rate IS NULL THEN NULL ELSE to_char(lines.maximum_unit_rate,{_RATE}) END,
	             NULL::text, NULL::text, to_char(COALESCE(lines.total_amount,0),{_MONEY}),
	             NULL::text, NULL::text, NULL, receipt.created_at, receipt.updated_at
        FROM procurement.goods_receipts receipt
        JOIN core.organizations organization
          ON organization.id=receipt.org_id AND organization.status='active'
        JOIN parties.supplier_accounts account ON account.org_id=receipt.org_id AND account.id=receipt.supplier_account_id
        JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS line_count, SUM(line.base_accepted_quantity+line.base_free_quantity) AS total_quantity,
                 MIN(line.unit_cost) AS minimum_unit_rate, MAX(line.unit_cost) AS maximum_unit_rate,
                 SUM(line.extended_cost) AS total_amount,
                 CASE WHEN count(DISTINCT order_line.purchase_order_id)=1 THEN (array_agg(DISTINCT order_line.purchase_order_id))[1] END AS source_document_id,
                 CASE WHEN count(DISTINCT order_line.purchase_order_id)=1 THEN (array_agg(DISTINCT source.purchase_order_number))[1] END AS source_document_number
            FROM procurement.goods_receipt_lines line
            LEFT JOIN procurement.purchase_order_lines order_line
              ON order_line.org_id=line.org_id AND order_line.id=line.purchase_order_line_id
            LEFT JOIN procurement.purchase_orders source
              ON source.org_id=order_line.org_id AND source.id=order_line.purchase_order_id
           WHERE line.org_id=receipt.org_id AND line.goods_receipt_id=receipt.id
        ) lines ON true
       WHERE receipt.org_id=:org_id AND receipt.status IN ('posted','cancelled','reversed')

      UNION ALL
      SELECT 'sales_return', returns.id, returns.branch_id, returns.return_number,
             returns.return_date, NULL::date, returns.status, returns.customer_account_id,
             party.legal_name, 'sales_invoice', returns.invoice_id, source.invoice_number,
             COALESCE(lines.line_count,0)::integer, to_char(COALESCE(lines.total_quantity,0),{_QUANTITY}),
             CASE WHEN lines.minimum_unit_rate IS NULL THEN NULL ELSE to_char(lines.minimum_unit_rate,{_RATE}) END,
             CASE WHEN lines.maximum_unit_rate IS NULL THEN NULL ELSE to_char(lines.maximum_unit_rate,{_RATE}) END,
             to_char(returns.gst_taxable_total,{_MONEY}), to_char(returns.cgst_total+returns.sgst_total+returns.igst_total+returns.cess_total,{_MONEY}),
	             to_char(returns.grand_total,{_MONEY}), NULL::text, NULL::text, NULL,
             returns.created_at, returns.updated_at
        FROM sales.returns returns
        JOIN parties.customer_accounts account ON account.org_id=returns.org_id AND account.id=returns.customer_account_id
        JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
        JOIN sales.invoices source ON source.org_id=returns.org_id AND source.id=returns.invoice_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS line_count, SUM(line.billed_quantity+line.free_quantity) AS total_quantity,
                 MIN(line.quoted_unit_rate) AS minimum_unit_rate, MAX(line.quoted_unit_rate) AS maximum_unit_rate
            FROM sales.return_lines line WHERE line.org_id=returns.org_id AND line.return_id=returns.id
        ) lines ON true
       WHERE returns.org_id=:org_id AND returns.status IN ('posted','cancelled','reversed')

      UNION ALL
      SELECT 'purchase_return', returns.id, returns.branch_id, returns.purchase_return_number,
             returns.return_date, NULL::date, returns.status, returns.supplier_account_id,
             party.legal_name,
             CASE WHEN returns.supplier_invoice_id IS NULL THEN NULL ELSE 'supplier_invoice' END,
             returns.supplier_invoice_id, source.supplier_invoice_number,
             COALESCE(lines.line_count,0)::integer, to_char(COALESCE(lines.total_quantity,0),{_QUANTITY}),
             CASE WHEN lines.minimum_unit_rate IS NULL THEN NULL ELSE to_char(lines.minimum_unit_rate,{_RATE}) END,
             CASE WHEN lines.maximum_unit_rate IS NULL THEN NULL ELSE to_char(lines.maximum_unit_rate,{_RATE}) END,
             to_char(returns.gst_taxable_total,{_MONEY}), to_char(returns.cgst_total+returns.sgst_total+returns.igst_total+returns.cess_total,{_MONEY}),
	             to_char(returns.grand_total,{_MONEY}), NULL::text, NULL::text, NULL,
             returns.created_at, returns.updated_at
        FROM procurement.purchase_returns returns
        JOIN parties.supplier_accounts account ON account.org_id=returns.org_id AND account.id=returns.supplier_account_id
        JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
        LEFT JOIN procurement.supplier_invoices source
          ON source.org_id=returns.org_id AND source.id=returns.supplier_invoice_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS line_count, SUM(line.billed_quantity+line.free_quantity) AS total_quantity,
                 MIN(line.quoted_unit_rate) AS minimum_unit_rate, MAX(line.quoted_unit_rate) AS maximum_unit_rate
            FROM procurement.purchase_return_lines line WHERE line.org_id=returns.org_id AND line.purchase_return_id=returns.id
        ) lines ON true
       WHERE returns.org_id=:org_id AND returns.status IN ('posted','cancelled','reversed')
    )
    """


def _filter_sql() -> str:
    return """
      WHERE ((:document_kind IS NOT NULL AND document_kind=:document_kind)
             OR (:document_group='returns' AND document_kind IN ('sales_return','purchase_return')))
        AND (:organization_scope OR branch_id=ANY(CAST(:branch_ids AS uuid[])))
        AND (:status IS NULL OR status=:status OR payment_status=:status)
        AND (:date_from IS NULL OR document_date>=CAST(:date_from AS date))
        AND (:date_to IS NULL OR document_date<=CAST(:date_to AS date))
        AND (:document_id IS NULL OR document_id=CAST(:document_id AS uuid))
        AND (:search IS NULL OR document_id::text=CAST(:search AS text)
             OR document_number ILIKE '%' || CAST(:search AS text) || '%'
             OR party_name ILIKE '%' || CAST(:search AS text) || '%')
    """


@router.get("", response_model=CanonicalDocumentHistoryResponse)
def canonical_document_history(
    document_kind: Optional[DocumentKind] = Query(None),
    document_group: Optional[DocumentGroup] = Query(None),
    document_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None, min_length=1, max_length=120),
    status_filter: Optional[str] = Query(None, alias="status", min_length=1, max_length=40),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: dict[str, Any] = Depends(PermissionChecker()),
    db: Session = Depends(get_db),
):
    if (document_kind is None) == (document_group is None):
        raise HTTPException(status_code=422, detail="Select exactly one document kind or supported document group")
    module = "returns" if document_group == "returns" or document_kind in {"sales_return", "purchase_return"} \
        else "sales" if document_kind in {"sales_invoice", "sales_order", "sales_dispatch"} else "purchase"
    if not check_module_access(user, module):
        raise HTTPException(status_code=403, detail=f"Access denied to {module} document history")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="Document history date range is invalid")
    org_id = _activate(db, user)
    business_date = _organization_business_date(db)
    organization_scope, branch_ids = _scope(user)
    params = {
        "org_id": org_id,
        "business_date": business_date,
        "organization_scope": organization_scope,
        "branch_ids": branch_ids,
        "document_kind": document_kind,
        "document_group": document_group,
        "document_id": document_id,
        "search": search.strip() if search else None,
        "status": status_filter,
        "date_from": date_from,
        "date_to": date_to,
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }
    source = _history_sources()
    total = int(db.execute(text(source + " SELECT COUNT(*) FROM authoritative_documents " + _filter_sql()), params).scalar_one())
    rows = [dict(row._mapping) for row in db.execute(text(
        source + " SELECT * FROM authoritative_documents " + _filter_sql()
        + " ORDER BY document_date DESC, document_number DESC, document_id DESC LIMIT :limit OFFSET :offset"
    ), params).fetchall()]
    return {
        "items": rows,
        "business_date": business_date,
        "page": page,
        "page_size": page_size,
        "total": total,
    }
