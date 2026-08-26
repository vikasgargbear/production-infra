"""Strict posted sales-invoice accounting, tax, and inventory reconciliation."""

from decimal import Decimal
from typing import Annotated, Literal, Optional
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
    rounding_adjustment: Money
    lines: list[CanonicalSalesOrderLineReadback] = Field(min_length=1)

    @model_validator(mode="after")
    def reconcile(self):
        if sum((Decimal(line.line_total) for line in self.lines), Decimal("0")) + Decimal(self.rounding_adjustment) != Decimal(self.total_amount):
            raise ValueError("sales-order header total does not reconcile to its lines")
        for line in self.lines:
            if Decimal(line.reserved_base_quantity) != (
                Decimal(line.base_billed_quantity) + Decimal(line.base_free_quantity)
            ):
                raise ValueError("sales-order reservation does not reconcile to billed and free base quantities")
        return self


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


class CanonicalSalesDispatchReadback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dispatch_id: UUID
    challan_number: str
    sales_order_id: UUID
    status: str
    customer_name: str
    inventory_document_id: UUID
    inventory_base_quantity: Quantity
    lines: list[CanonicalSalesDispatchLineReadback] = Field(min_length=1)

    @model_validator(mode="after")
    def reconcile(self):
        base_total = Decimal("0")
        for line in self.lines:
            expected = Decimal(line.base_billed_quantity) + Decimal(line.base_free_quantity)
            if Decimal(line.ledger_base_quantity) != expected:
                raise ValueError("sales-dispatch ledger quantity does not reconcile to billed and free base quantities")
            base_total += Decimal(line.ledger_base_quantity)
        if base_total != Decimal(self.inventory_base_quantity):
            raise ValueError("sales-dispatch inventory quantity does not reconcile to its ledger lines")
        return self


class CanonicalSalesDispatchValuationLineReadback(
    CanonicalSalesDispatchLineReadback
):
    ledger_value: Money


class CanonicalSalesDispatchValuationReadback(CanonicalSalesDispatchReadback):
    inventory_value: Money
    lines: list[CanonicalSalesDispatchValuationLineReadback] = Field(min_length=1)

    @model_validator(mode="after")
    def reconcile_valuation(self):
        value_total = sum(
            (Decimal(line.ledger_value) for line in self.lines), Decimal("0")
        )
        if value_total != Decimal(self.inventory_value):
            raise ValueError(
                "sales-dispatch inventory value does not reconcile to its ledger lines"
            )
        return self


@router.get("/canonical/sales-orders/{order_id}/acceptance-readback", response_model=CanonicalSalesOrderReadback)
def sales_order_acceptance_readback(order_id: UUID, user: dict = SALES_USER, db: Session = Depends(get_db)):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT document.id AS sales_order_id, document.order_number, document.status,
               party.legal_name AS customer_name,
               to_char(document.grand_total, 'FM999999999999999990.00') AS total_amount,
               to_char(document.rounding_adjustment, 'FM999999999999999990.00') AS rounding_adjustment,
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


def _sales_dispatch_valuation_acceptance_readback(
    dispatch_id: UUID, user: dict, db: Session,
) -> CanonicalSalesDispatchValuationReadback:
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
    return CanonicalSalesDispatchValuationReadback.model_validate(rows[0])


@router.get(
    "/canonical/sales-dispatches/{dispatch_id}/acceptance-readback",
    response_model=CanonicalSalesDispatchReadback,
)
def sales_dispatch_acceptance_readback(
    dispatch_id: UUID, user: dict = SALES_USER, db: Session = Depends(get_db),
) -> CanonicalSalesDispatchReadback:
    evidence = _sales_dispatch_valuation_acceptance_readback(dispatch_id, user, db)
    public = evidence.model_dump(exclude={
        "inventory_value": True,
        "lines": {"__all__": {"ledger_value"}},
    })
    return CanonicalSalesDispatchReadback.model_validate(public)


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
    line_kind: Literal["product", "charge"]
    product_id: Optional[UUID]
    billed_quantity: Optional[Quantity]
    free_quantity: Optional[Quantity]
    base_billed_quantity: Optional[Quantity]
    base_free_quantity: Optional[Quantity]
    taxable_amount: Money
    cgst_amount: Money
    sgst_amount: Money
    igst_amount: Money
    cess_amount: Money
    line_total: Money

    @model_validator(mode="after")
    def require_product_quantities(self):
        quantities = (
            self.billed_quantity,
            self.free_quantity,
            self.base_billed_quantity,
            self.base_free_quantity,
        )
        if self.line_kind == "product" and (self.product_id is None or any(value is None for value in quantities)):
            raise ValueError("sales-invoice product line lacks exact product quantities")
        if self.line_kind == "charge" and (self.product_id is not None or any(value is not None for value in quantities)):
            raise ValueError("sales-invoice charge line carries product inventory quantities")
        return self


class SalesInvoiceInventoryEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice_line_id: UUID
    source_kind: Literal["direct_invoice_issue", "dispatch_issue"]
    source_document_id: UUID
    source_line_id: UUID
    invoice_dispatch_allocation_id: Optional[UUID]
    inventory_document_id: UUID
    inventory_document_line_id: UUID
    ledger_entry_id: UUID
    allocated_base_billed_quantity: Quantity
    allocated_base_free_quantity: Quantity
    ledger_base_quantity: Quantity


class SalesInvoiceValuationEvidence(SalesInvoiceInventoryEvidence):
    ledger_value: Money


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
    rounding_adjustment: Money
    invoice_lines: list[SalesInvoicePostedLine]
    tax_document_id: UUID
    tax_taxable_amount: Money
    tax_cgst_amount: Money
    tax_sgst_amount: Money
    tax_igst_amount: Money
    tax_cess_amount: Money
    tax_payable_amount: Money
    open_item_id: UUID
    receivable_principal: Money
    receivable_outstanding: Money
    inventory_fulfillment: Literal["direct_invoice_issue", "dispatch_issue", "mixed"]
    invoice_inventory_document_id: Optional[UUID]
    inventory_base_quantity: Quantity
    inventory_evidence: list[SalesInvoiceInventoryEvidence] = Field(min_length=1)

    @model_validator(mode="after")
    def reconcile(self):
        if not self.invoice_lines:
            raise ValueError("sales-invoice readback requires invoice lines")
        if Decimal(self.receivable_principal) != Decimal(self.invoice_total):
            raise ValueError("sales-invoice receivable does not reconcile to invoice total")
        outstanding = Decimal(self.receivable_outstanding)
        if outstanding < 0 or outstanding > Decimal(self.receivable_principal):
            raise ValueError("sales-invoice outstanding is outside its principal bounds")
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

        for field in ("taxable_amount", "cgst_amount", "sgst_amount", "igst_amount", "cess_amount", "line_total"):
            header_field = "invoice_total" if field == "line_total" else field
            expected = sum((Decimal(getattr(line, field)) for line in self.invoice_lines), Decimal("0"))
            if field == "line_total":
                expected += Decimal(self.rounding_adjustment)
            if expected != Decimal(getattr(self, header_field)):
                raise ValueError(f"sales-invoice {header_field} does not reconcile to its lines")

        product_lines = {line.invoice_line_id: line for line in self.invoice_lines if line.line_kind == "product"}
        evidence_by_line: dict[UUID, list[SalesInvoiceInventoryEvidence]] = {}
        for evidence in self.inventory_evidence:
            if evidence.invoice_line_id not in product_lines:
                raise ValueError("sales-invoice inventory evidence references a non-product line")
            if evidence.source_kind == "direct_invoice_issue":
                if evidence.invoice_dispatch_allocation_id is not None:
                    raise ValueError("direct sales-invoice issue carries dispatch allocation identity")
                if evidence.source_document_id != self.sales_invoice_id or evidence.source_line_id != evidence.invoice_line_id:
                    raise ValueError("direct sales-invoice inventory lineage is inconsistent")
                if Decimal(evidence.ledger_base_quantity) != (
                    Decimal(evidence.allocated_base_billed_quantity)
                    + Decimal(evidence.allocated_base_free_quantity)
                ):
                    raise ValueError("direct sales-invoice inventory quantity does not reconcile")
            elif evidence.invoice_dispatch_allocation_id is None:
                raise ValueError("dispatch sales-invoice inventory evidence lacks allocation identity")
            elif (Decimal(evidence.allocated_base_billed_quantity)
                  + Decimal(evidence.allocated_base_free_quantity)) > Decimal(evidence.ledger_base_quantity):
                raise ValueError("dispatch sales-invoice allocation exceeds its source ledger quantity")
            evidence_by_line.setdefault(evidence.invoice_line_id, []).append(evidence)

        kinds: set[str] = set()
        for line_id, line in product_lines.items():
            evidence = evidence_by_line.get(line_id, [])
            if not evidence:
                raise ValueError("sales-invoice product line lacks inventory fulfillment evidence")
            line_kinds = {item.source_kind for item in evidence}
            if len(line_kinds) != 1:
                raise ValueError("one sales-invoice line mixes direct and dispatch inventory ownership")
            kinds.update(line_kinds)
            if sum((Decimal(item.allocated_base_billed_quantity) for item in evidence), Decimal("0")) != Decimal(line.base_billed_quantity or "0") or sum((Decimal(item.allocated_base_free_quantity) for item in evidence), Decimal("0")) != Decimal(line.base_free_quantity or "0"):
                raise ValueError("sales-invoice inventory allocations do not reconcile to line quantities")

        expected_fulfillment = (
            "mixed" if len(kinds) == 2
            else "direct_invoice_issue" if kinds == {"direct_invoice_issue"}
            else "dispatch_issue"
        )
        if self.inventory_fulfillment != expected_fulfillment:
            raise ValueError("sales-invoice inventory fulfillment classification is inconsistent")
        has_direct = "direct_invoice_issue" in kinds
        if has_direct != (self.invoice_inventory_document_id is not None):
            raise ValueError("sales-invoice direct inventory ownership is inconsistent")
        if self.inventory_fulfillment == "dispatch_issue" and self.invoice_inventory_document_id is not None:
            raise ValueError("dispatch-allocated invoice must not own a second stock issue")

        unique_ledger = {item.ledger_entry_id: item for item in self.inventory_evidence}
        if sum((Decimal(item.ledger_base_quantity) for item in unique_ledger.values()), Decimal("0")) != Decimal(self.inventory_base_quantity):
            raise ValueError("sales-invoice source inventory quantity does not reconcile")
        return self


class CanonicalSalesInvoicePostingEvidence(CanonicalSalesInvoicePostingReadback):
    accounting_event_id: UUID
    journal_entry_id: UUID
    journal_debit_total: Money
    journal_credit_total: Money
    journal_lines: list[SalesInvoiceJournalLine] = Field(min_length=1)
    inventory_value: Money
    inventory_evidence: list[SalesInvoiceValuationEvidence] = Field(min_length=1)

    @model_validator(mode="after")
    def reconcile_accounting_and_valuation(self):
        debit = sum(
            (Decimal(line.transaction_debit) for line in self.journal_lines), Decimal("0")
        )
        credit = sum(
            (Decimal(line.transaction_credit) for line in self.journal_lines), Decimal("0")
        )
        if debit != credit:
            raise ValueError("sales-invoice journal lines are not balanced")
        if (
            debit != Decimal(self.journal_debit_total)
            or credit != Decimal(self.journal_credit_total)
        ):
            raise ValueError(
                "sales-invoice journal header does not reconcile to its lines"
            )
        unique_ledger = {item.ledger_entry_id: item for item in self.inventory_evidence}
        if sum(
            (Decimal(item.ledger_value) for item in unique_ledger.values()), Decimal("0")
        ) != Decimal(self.inventory_value):
            raise ValueError("sales-invoice source inventory value does not reconcile")
        return self


def _posted_sales_invoice_acceptance_evidence(
    invoice_id: UUID,
    user: dict,
    db: Session,
) -> CanonicalSalesInvoicePostingEvidence:
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT invoice.id AS sales_invoice_id, invoice.invoice_number, invoice.status,
               to_char(invoice.gst_taxable_total, 'FM999999999999999990.00') AS taxable_amount,
               to_char(invoice.cgst_total, 'FM999999999999999990.00') AS cgst_amount,
               to_char(invoice.sgst_total, 'FM999999999999999990.00') AS sgst_amount,
               to_char(invoice.igst_total, 'FM999999999999999990.00') AS igst_amount,
               to_char(invoice.cess_total, 'FM999999999999999990.00') AS cess_amount,
               to_char(invoice.grand_total, 'FM999999999999999990.00') AS invoice_total,
               to_char(invoice.rounding_adjustment, 'FM999999999999999990.00') AS rounding_adjustment,
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
               CASE
                 WHEN invoice_inventory.id IS NOT NULL AND inventory_sources.has_dispatch THEN 'mixed'
                 WHEN invoice_inventory.id IS NOT NULL THEN 'direct_invoice_issue'
                 ELSE 'dispatch_issue'
               END AS inventory_fulfillment,
               invoice_inventory.id AS invoice_inventory_document_id,
               inventory_sources.inventory_base_quantity,
               inventory_sources.inventory_value,
               inventory_sources.evidence AS inventory_evidence
          FROM sales.invoices invoice
          JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                         'invoice_line_id', line.id, 'line_kind', line.line_kind,
                         'product_id', line.product_id,
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
          LEFT JOIN inventory.inventory_documents invoice_inventory
            ON invoice_inventory.org_id=invoice.org_id
           AND invoice_inventory.sales_invoice_id=invoice.id
           AND invoice_inventory.document_type='sales_issue'
           AND invoice_inventory.status='posted'
          JOIN LATERAL (
              WITH evidence AS (
                  SELECT line.id AS invoice_line_id,
                         'direct_invoice_issue'::text AS source_kind,
                         invoice.id AS source_document_id,
                         line.id AS source_line_id,
                         NULL::uuid AS invoice_dispatch_allocation_id,
                         document.id AS inventory_document_id,
                         inventory_line.id AS inventory_document_line_id,
                         ledger.id AS ledger_entry_id,
                         round(
                           (requested_allocation.value->>'billed_quantity')::numeric
                             * line.uom_conversion_factor, 6
                         ) AS allocated_base_billed_quantity,
                         round(
                           (requested_allocation.value->>'free_quantity')::numeric
                             * line.uom_conversion_factor, 6
                         ) AS allocated_base_free_quantity,
                         abs(ledger.quantity_delta) AS ledger_base_quantity,
                         abs(ledger.value_delta) AS ledger_value
                    FROM sales.invoice_lines line
                    JOIN inventory.inventory_document_lines inventory_line
                      ON inventory_line.org_id=line.org_id AND inventory_line.sales_invoice_line_id=line.id
                    JOIN inventory.inventory_documents document
                      ON document.org_id=inventory_line.org_id AND document.id=inventory_line.inventory_document_id
                     AND document.sales_invoice_id=invoice.id AND document.document_type='sales_issue'
                     AND document.status='posted'
                    JOIN inventory.stock_ledger_entries ledger
                      ON ledger.org_id=inventory_line.org_id
                     AND ledger.inventory_document_line_id=inventory_line.id
                     AND ledger.entry_kind='issue'
                    JOIN LATERAL (
                        SELECT count(*)::integer AS evidence_count,
                               CASE WHEN count(*)=1 THEN (array_agg(
                                 pg_catalog.convert_from(command.request_bytes, 'UTF8')::jsonb
                                 ORDER BY command.id
                               ))[1] END AS value
                          FROM automation.command_requests command
                         WHERE command.org_id=invoice.org_id
                           AND command.branch_id=invoice.branch_id
                           AND command.capability_code='sales.invoice.prepare'
                           AND command.operation='sales.invoice.post'
                           AND command.target_resource_type='sales_invoice'
                           AND command.target_resource_id=invoice.id
                           AND command.status='succeeded'
                           AND command.result_resource_type='sales_invoice'
                           AND command.result_resource_id=invoice.id
                           AND command.response_status=200
                           AND command.request_hash=pg_catalog.sha256(command.request_bytes)
                    ) command_evidence ON command_evidence.evidence_count=1
                    JOIN LATERAL (
                        SELECT count(*)::integer AS evidence_count,
                               CASE WHEN count(*)=1 THEN (array_agg(requested.value))[1]
                               END AS value
                          FROM pg_catalog.jsonb_array_elements(
                            COALESCE(command_evidence.value->'lines', '[]'::jsonb)
                          ) requested(value)
                         WHERE requested.value->>'line_id'=line.id::text
                           AND requested.value->>'fulfillment_source'='direct_issue'
                    ) requested_line ON requested_line.evidence_count=1
                    JOIN LATERAL (
                        SELECT count(*)::integer AS evidence_count,
                               CASE WHEN count(*)=1 THEN (array_agg(requested.value))[1]
                               END AS value
                          FROM pg_catalog.jsonb_array_elements(
                            COALESCE(requested_line.value->'batch_allocations', '[]'::jsonb)
                          ) requested(value)
                         WHERE requested.value->>'inventory_line_id'=inventory_line.id::text
                           AND requested.value->>'batch_id'=inventory_line.batch_id::text
                    ) requested_allocation ON requested_allocation.evidence_count=1
                   WHERE line.org_id=invoice.org_id AND line.invoice_id=invoice.id
                     AND line.line_kind='product' AND line.product_id IS NOT NULL
                  UNION ALL
                  SELECT line.id AS invoice_line_id,
                         'dispatch_issue'::text AS source_kind,
                         dispatch.id AS source_document_id,
                         dispatch_line.id AS source_line_id,
                         allocation.id AS invoice_dispatch_allocation_id,
                         document.id AS inventory_document_id,
                         inventory_line.id AS inventory_document_line_id,
                         ledger.id AS ledger_entry_id,
                         allocation.allocated_base_billed_quantity,
                         allocation.allocated_base_free_quantity,
                         abs(ledger.quantity_delta) AS ledger_base_quantity,
                         abs(ledger.value_delta) AS ledger_value
                    FROM sales.invoice_lines line
                    JOIN sales.invoice_dispatch_allocations allocation
                      ON allocation.org_id=line.org_id AND allocation.invoice_line_id=line.id
                    JOIN sales.dispatch_lines dispatch_line
                      ON dispatch_line.org_id=allocation.org_id AND dispatch_line.id=allocation.dispatch_line_id
                    JOIN sales.dispatches dispatch
                      ON dispatch.org_id=dispatch_line.org_id AND dispatch.id=dispatch_line.dispatch_id
                     AND dispatch.status='posted'
                    JOIN inventory.inventory_document_lines inventory_line
                      ON inventory_line.org_id=dispatch_line.org_id
                     AND inventory_line.sales_dispatch_line_id=dispatch_line.id
                    JOIN inventory.inventory_documents document
                      ON document.org_id=inventory_line.org_id AND document.id=inventory_line.inventory_document_id
                     AND document.sales_dispatch_id=dispatch.id AND document.document_type='sales_issue'
                     AND document.status='posted'
                    JOIN inventory.stock_ledger_entries ledger
                      ON ledger.org_id=inventory_line.org_id
                     AND ledger.inventory_document_line_id=inventory_line.id
                     AND ledger.entry_kind='issue'
                   WHERE line.org_id=invoice.org_id AND line.invoice_id=invoice.id
                     AND line.line_kind='product' AND line.product_id IS NOT NULL
              ), unique_ledger AS (
                  SELECT DISTINCT ON (ledger_entry_id)
                         ledger_entry_id, ledger_base_quantity, ledger_value
                    FROM evidence
                   ORDER BY ledger_entry_id
              )
              SELECT jsonb_agg(jsonb_build_object(
                         'invoice_line_id', evidence.invoice_line_id,
                         'source_kind', evidence.source_kind,
                         'source_document_id', evidence.source_document_id,
                         'source_line_id', evidence.source_line_id,
                         'invoice_dispatch_allocation_id', evidence.invoice_dispatch_allocation_id,
                         'inventory_document_id', evidence.inventory_document_id,
                         'inventory_document_line_id', evidence.inventory_document_line_id,
                         'ledger_entry_id', evidence.ledger_entry_id,
                         'allocated_base_billed_quantity', to_char(evidence.allocated_base_billed_quantity, 'FM999999999999999990.000000'),
                         'allocated_base_free_quantity', to_char(evidence.allocated_base_free_quantity, 'FM999999999999999990.000000'),
                         'ledger_base_quantity', to_char(evidence.ledger_base_quantity, 'FM999999999999999990.000000'),
                         'ledger_value', to_char(evidence.ledger_value, 'FM999999999999999990.00')
                     ) ORDER BY evidence.invoice_line_id, evidence.source_kind,
                                evidence.invoice_dispatch_allocation_id NULLS FIRST,
                                evidence.inventory_document_line_id) AS evidence,
                     to_char((SELECT sum(ledger_base_quantity) FROM unique_ledger), 'FM999999999999999990.000000') AS inventory_base_quantity,
                     to_char((SELECT sum(ledger_value) FROM unique_ledger), 'FM999999999999999990.00') AS inventory_value,
                     bool_or(evidence.source_kind='dispatch_issue') AS has_dispatch
                FROM evidence
          ) inventory_sources ON true
         WHERE invoice.org_id=:org_id AND invoice.id=:invoice_id AND invoice.status='posted'
    """, {"org_id": org_id, "invoice_id": invoice_id})
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Posted canonical sales-invoice companions not found")
    return CanonicalSalesInvoicePostingEvidence.model_validate(rows[0])


@router.get(
    "/canonical/sales-invoices/{invoice_id}/posting-readback",
    response_model=CanonicalSalesInvoicePostingReadback,
)
def posted_sales_invoice_readback(
    invoice_id: UUID,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
) -> CanonicalSalesInvoicePostingReadback:
    evidence = _posted_sales_invoice_acceptance_evidence(invoice_id, user, db)
    public = evidence.model_dump(exclude={
        "accounting_event_id": True,
        "journal_entry_id": True,
        "journal_debit_total": True,
        "journal_credit_total": True,
        "journal_lines": True,
        "inventory_value": True,
        "inventory_evidence": {"__all__": {"ledger_value"}},
    })
    return CanonicalSalesInvoicePostingReadback.model_validate(public)
