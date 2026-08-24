"""Strict posted sales-invoice accounting, tax, and inventory reconciliation."""

from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from ...core.database import get_db
from .canonical_erp_reads import SALES_USER, _activate, _rows

router = APIRouter(dependencies=[Security(HTTPBearer(auto_error=False))])
Money = Annotated[str, Field(pattern=r"^-?(?:0|[1-9]\d*)\.\d{2}$")]
Quantity = Annotated[str, Field(pattern=r"^-?(?:0|[1-9]\d*)\.\d{6}$")]
Rate = Annotated[str, Field(pattern=r"^-?(?:0|[1-9]\d*)\.\d{4}$")]


class CanonicalSalesOrderLineReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sales_order_line_id: UUID
    product_id: UUID
    billed_quantity: Quantity
    free_quantity: Quantity
    base_billed_quantity: Quantity
    base_free_quantity: Quantity
    quoted_unit_rate: Rate
    taxable_amount: Money
    total_tax: Money
    line_total: Money
    reservation_id: UUID
    batch_id: UUID
    location_id: UUID
    reserved_base_quantity: Quantity


class CanonicalSalesOrderReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sales_order_id: UUID
    order_number: str
    status: str
    customer_name: str
    total_amount: Money
    lines: list[CanonicalSalesOrderLineReadback] = Field(min_length=1)


class CanonicalSalesDispatchLineReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dispatch_line_id: UUID
    sales_order_line_id: UUID
    product_id: UUID
    batch_id: UUID
    from_location_id: UUID
    billed_quantity: Quantity
    free_quantity: Quantity
    base_billed_quantity: Quantity
    base_free_quantity: Quantity
    inventory_document_line_id: UUID
    ledger_entry_id: UUID
    ledger_base_quantity: Quantity
    ledger_value: Money


class CanonicalSalesDispatchReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dispatch_id: UUID
    challan_number: str
    sales_order_id: UUID
    status: str
    customer_name: str
    inventory_document_id: UUID
    inventory_base_quantity: Quantity
    inventory_value: Money
    lines: list[CanonicalSalesDispatchLineReadback] = Field(min_length=1)


@router.get("/canonical/sales-orders/{order_id}/acceptance-readback", response_model=CanonicalSalesOrderReadback)
def sales_order_acceptance_readback(order_id: UUID, user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT document.id AS sales_order_id, document.order_number, document.status,
               party.legal_name AS customer_name,
               to_char(document.grand_total, 'FM999999999999999990.00') AS total_amount,
               lines.items AS lines
          FROM sales.orders document
          JOIN parties.customer_accounts account ON account.org_id=document.org_id AND account.id=document.customer_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'sales_order_line_id', line.id, 'product_id', line.product_id,
                         'billed_quantity', to_char(line.billed_quantity, 'FM999999999999999990.000000'),
                         'free_quantity', to_char(line.free_quantity, 'FM999999999999999990.000000'),
                         'base_billed_quantity', to_char(line.base_billed_quantity, 'FM999999999999999990.000000'),
                         'base_free_quantity', to_char(line.base_free_quantity, 'FM999999999999999990.000000'),
                         'quoted_unit_rate', to_char(line.quoted_unit_rate, 'FM999999999999999990.0000'),
                         'taxable_amount', to_char(line.gst_taxable_value, 'FM999999999999999990.00'),
                         'total_tax', to_char(line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount, 'FM999999999999999990.00'),
                         'line_total', to_char(line.line_total, 'FM999999999999999990.00'),
                         'reservation_id', reservation.id, 'batch_id', reservation.batch_id,
                         'location_id', reservation.location_id,
                         'reserved_base_quantity', to_char(reservation.quantity, 'FM999999999999999990.000000')
                     ) ORDER BY line.line_number, line.id) AS items
                FROM sales.order_lines line
                JOIN inventory.reservations reservation
                  ON reservation.org_id=line.org_id AND reservation.order_line_id=line.id
                 AND reservation.status='active' AND reservation.expires_at>transaction_timestamp()
               WHERE line.org_id=document.org_id AND line.order_id=document.id
                 AND line.line_kind='product' AND line.product_id IS NOT NULL
          ) lines ON true
         WHERE document.org_id=:org_id AND document.id=:order_id AND document.status='approved'
    """, {"org_id": org_id, "order_id": order_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Approved canonical sales order readback not found")
    return rows[0]


@router.get("/canonical/sales-dispatches/{dispatch_id}/acceptance-readback", response_model=CanonicalSalesDispatchReadback)
def sales_dispatch_acceptance_readback(dispatch_id: UUID, user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT dispatch.id AS dispatch_id, dispatch.dispatch_number AS challan_number,
               dispatch.sales_order_id, dispatch.status, party.legal_name AS customer_name,
               inventory_document.id AS inventory_document_id,
               to_char(inventory_document.total_abs_base_quantity, 'FM999999999999999990.000000') AS inventory_base_quantity,
               to_char(inventory_document.total_value, 'FM999999999999999990.00') AS inventory_value,
               lines.items AS lines
          FROM sales.dispatches dispatch
          JOIN parties.customer_accounts account ON account.org_id=dispatch.org_id AND account.id=dispatch.customer_account_id
          JOIN parties.parties party ON party.org_id=account.org_id AND party.id=account.party_id
          JOIN inventory.inventory_documents inventory_document
            ON inventory_document.org_id=dispatch.org_id AND inventory_document.sales_dispatch_id=dispatch.id
           AND inventory_document.status='posted'
          JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'dispatch_line_id', line.id, 'sales_order_line_id', line.order_line_id,
                         'product_id', line.product_id, 'batch_id', line.batch_id,
                         'from_location_id', line.from_location_id,
                         'billed_quantity', to_char(line.billed_quantity, 'FM999999999999999990.000000'),
                         'free_quantity', to_char(line.free_quantity, 'FM999999999999999990.000000'),
                         'base_billed_quantity', to_char(line.base_billed_quantity, 'FM999999999999999990.000000'),
                         'base_free_quantity', to_char(line.base_free_quantity, 'FM999999999999999990.000000'),
                         'inventory_document_line_id', inventory_line.id, 'ledger_entry_id', ledger.id,
                         'ledger_base_quantity', to_char(abs(ledger.quantity_delta), 'FM999999999999999990.000000'),
                         'ledger_value', to_char(abs(ledger.value_delta), 'FM999999999999999990.00')
                     ) ORDER BY line.line_number, line.id) AS items
                FROM sales.dispatch_lines line
                JOIN inventory.inventory_document_lines inventory_line
                  ON inventory_line.org_id=line.org_id AND inventory_line.sales_dispatch_line_id=line.id
                 AND inventory_line.inventory_document_id=inventory_document.id
                JOIN inventory.stock_ledger_entries ledger
                  ON ledger.org_id=inventory_line.org_id AND ledger.inventory_document_line_id=inventory_line.id
               WHERE line.org_id=dispatch.org_id AND line.dispatch_id=dispatch.id
          ) lines ON true
         WHERE dispatch.org_id=:org_id AND dispatch.id=:dispatch_id AND dispatch.status='posted'
    """, {"org_id": org_id, "dispatch_id": dispatch_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Posted canonical sales dispatch readback not found")
    return rows[0]


class SalesInvoiceJournalLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journal_line_id: UUID
    line_number: int = Field(gt=0)
    account_id: UUID
    transaction_debit: Money
    transaction_credit: Money


class SalesInvoicePostedLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice_line_id: UUID
    product_id: UUID
    billed_quantity: Quantity
    free_quantity: Quantity
    base_billed_quantity: Quantity
    base_free_quantity: Quantity
    taxable_amount: Money
    cgst_amount: Money
    sgst_amount: Money
    igst_amount: Money
    cess_amount: Money
    line_total: Money


class CanonicalSalesInvoicePostingReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sales_invoice_id: UUID
    invoice_number: str
    status: str
    taxable_amount: Money
    cgst_amount: Money
    sgst_amount: Money
    igst_amount: Money
    cess_amount: Money
    invoice_total: Money
    invoice_lines: list[SalesInvoicePostedLine]
    tax_document_id: UUID
    tax_taxable_amount: Money
    tax_cgst_amount: Money
    tax_sgst_amount: Money
    tax_igst_amount: Money
    tax_cess_amount: Money
    tax_payable_amount: Money
    accounting_event_id: UUID
    journal_entry_id: UUID
    journal_debit_total: Money
    journal_credit_total: Money
    journal_lines: list[SalesInvoiceJournalLine]
    open_item_id: UUID
    receivable_principal: Money
    receivable_outstanding: Money
    inventory_document_id: UUID
    inventory_base_quantity: Quantity
    inventory_value: Money

    @model_validator(mode="after")
    def reconcile(self):
        debit = sum((Decimal(line.transaction_debit) for line in self.journal_lines), Decimal("0"))
        credit = sum((Decimal(line.transaction_credit) for line in self.journal_lines), Decimal("0"))
        if not self.journal_lines or not self.invoice_lines or debit != credit:
            raise ValueError("sales-invoice journal lines are not balanced")
        if debit != Decimal(self.journal_debit_total) or credit != Decimal(self.journal_credit_total):
            raise ValueError("sales-invoice journal header does not reconcile to its lines")
        if Decimal(self.receivable_principal) != Decimal(self.invoice_total):
            raise ValueError("sales-invoice receivable does not reconcile to invoice total")
        if Decimal(self.receivable_outstanding) > Decimal(self.receivable_principal):
            raise ValueError("sales-invoice outstanding exceeds its principal")
        for invoice_value, tax_value in (
            (self.taxable_amount, self.tax_taxable_amount),
            (self.cgst_amount, self.tax_cgst_amount),
            (self.sgst_amount, self.tax_sgst_amount),
            (self.igst_amount, self.tax_igst_amount),
            (self.cess_amount, self.tax_cess_amount),
            (self.invoice_total, self.tax_payable_amount),
        ):
            if Decimal(invoice_value) != Decimal(tax_value):
                raise ValueError("sales-invoice tax document does not reconcile")
        return self


@router.get(
    "/canonical/sales-invoices/{invoice_id}/posting-readback",
    response_model=CanonicalSalesInvoicePostingReadback,
)
def posted_sales_invoice_readback(
    invoice_id: UUID,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT invoice.id AS sales_invoice_id, invoice.invoice_number, invoice.status,
               to_char(invoice.gst_taxable_total, 'FM999999999999999990.00') AS taxable_amount,
               to_char(invoice.cgst_total, 'FM999999999999999990.00') AS cgst_amount,
               to_char(invoice.sgst_total, 'FM999999999999999990.00') AS sgst_amount,
               to_char(invoice.igst_total, 'FM999999999999999990.00') AS igst_amount,
               to_char(invoice.cess_total, 'FM999999999999999990.00') AS cess_amount,
               to_char(invoice.grand_total, 'FM999999999999999990.00') AS invoice_total,
               invoice_lines.lines AS invoice_lines,
               tax_document.id AS tax_document_id,
               to_char(tax_document.gst_taxable_value, 'FM999999999999999990.00') AS tax_taxable_amount,
               to_char(tax_document.cgst_amount, 'FM999999999999999990.00') AS tax_cgst_amount,
               to_char(tax_document.sgst_amount, 'FM999999999999999990.00') AS tax_sgst_amount,
               to_char(tax_document.igst_amount, 'FM999999999999999990.00') AS tax_igst_amount,
               to_char(tax_document.cess_amount, 'FM999999999999999990.00') AS tax_cess_amount,
               to_char(tax_document.counterparty_payable_amount, 'FM999999999999999990.00') AS tax_payable_amount,
               event.id AS accounting_event_id, journal.id AS journal_entry_id,
               to_char(journal.transaction_debit_total, 'FM999999999999999990.00') AS journal_debit_total,
               to_char(journal.transaction_credit_total, 'FM999999999999999990.00') AS journal_credit_total,
               journal_lines.lines AS journal_lines,
               open_item.id AS open_item_id,
               to_char(open_item.principal_amount, 'FM999999999999999990.00') AS receivable_principal,
               to_char(open_item.principal_amount-COALESCE(allocations.allocated,0), 'FM999999999999999990.00') AS receivable_outstanding,
               inventory_document.id AS inventory_document_id,
               to_char(inventory_document.total_abs_base_quantity, 'FM999999999999999990.000000') AS inventory_base_quantity,
               to_char(inventory_document.total_value, 'FM999999999999999990.00') AS inventory_value
          FROM sales.invoices invoice
          JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'invoice_line_id', line.id, 'product_id', line.product_id,
                         'billed_quantity', to_char(line.billed_quantity, 'FM999999999999999990.000000'),
                         'free_quantity', to_char(line.free_quantity, 'FM999999999999999990.000000'),
                         'base_billed_quantity', to_char(line.base_billed_quantity, 'FM999999999999999990.000000'),
                         'base_free_quantity', to_char(line.base_free_quantity, 'FM999999999999999990.000000'),
                         'taxable_amount', to_char(line.gst_taxable_value, 'FM999999999999999990.00'),
                         'cgst_amount', to_char(line.cgst_amount, 'FM999999999999999990.00'),
                         'sgst_amount', to_char(line.sgst_amount, 'FM999999999999999990.00'),
                         'igst_amount', to_char(line.igst_amount, 'FM999999999999999990.00'),
                         'cess_amount', to_char(line.cess_amount, 'FM999999999999999990.00'),
                         'line_total', to_char(line.line_total, 'FM999999999999999990.00')
                     ) ORDER BY line.line_number, line.id) AS lines
                FROM sales.invoice_lines line
               WHERE line.org_id=invoice.org_id AND line.invoice_id=invoice.id
                 AND line.line_kind='product' AND line.product_id IS NOT NULL
          ) invoice_lines ON true
          JOIN tax.documents tax_document
            ON tax_document.org_id=invoice.org_id AND tax_document.sales_invoice_id=invoice.id
           AND tax_document.document_class='sales_invoice'
          JOIN finance.accounting_events event
            ON event.org_id=invoice.org_id AND event.sales_invoice_id=invoice.id
           AND event.event_type='sales_invoice'
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id AND journal.status='posted'
          JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'journal_line_id', line.id, 'line_number', line.line_number,
                         'account_id', line.account_id,
                         'transaction_debit', to_char(line.transaction_debit, 'FM999999999999999990.00'),
                         'transaction_credit', to_char(line.transaction_credit, 'FM999999999999999990.00')
                     ) ORDER BY line.line_number, line.id) AS lines
                FROM finance.journal_lines line
               WHERE line.org_id=journal.org_id AND line.journal_entry_id=journal.id
          ) journal_lines ON true
          JOIN finance.open_items open_item
            ON open_item.org_id=event.org_id AND open_item.accounting_event_id=event.id
           AND open_item.item_side='receivable' AND open_item.status<>'reversed'
          LEFT JOIN LATERAL (
              SELECT sum(allocation.amount) AS allocated
                FROM finance.allocations allocation
               WHERE allocation.org_id=open_item.org_id AND allocation.open_item_id=open_item.id
                 AND allocation.status='posted'
          ) allocations ON true
          JOIN inventory.inventory_documents inventory_document
            ON inventory_document.org_id=invoice.org_id
           AND inventory_document.sales_invoice_id=invoice.id
           AND inventory_document.document_type='sales_issue'
           AND inventory_document.status='posted'
         WHERE invoice.org_id=:org_id AND invoice.id=:invoice_id AND invoice.status='posted'
    """, {"org_id": org_id, "invoice_id": invoice_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Posted canonical sales-invoice companions not found")
    return rows[0]
