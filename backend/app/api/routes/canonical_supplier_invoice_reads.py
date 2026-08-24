"""Strict source projection and posted readback for canonical supplier invoices.

Supplier invoices are never allowed to manufacture receipt, GST, ITC, or
accounting facts in the browser.  The context endpoint exposes the exact
posted-GRN ceiling and immutable GSTR-2B evidence accepted by the reviewed
operator command.  The detail endpoint proves the resulting commercial,
regulatory, payable, journal, and receipt-capitalisation effects reconcile.
"""

from __future__ import annotations

from datetime import date, datetime
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
    prefix="/canonical/supplier-invoices",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Supplier Invoice Reads"],
)
PURCHASE_USER = Depends(PermissionChecker("purchase", "view"))


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


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in db.execute(text(sql), params).fetchall()]


def _one(db: Session, sql: str, params: dict[str, Any]) -> Optional[dict[str, Any]]:
    rows = _rows(db, sql, params)
    if len(rows) > 1:
        raise HTTPException(status_code=409, detail="Canonical source is ambiguous")
    return rows[0] if rows else None


class EligibleReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goods_receipt_id: UUID
    goods_receipt_number: str
    received_at: datetime
    branch_id: UUID
    supplier_account_id: UUID
    supplier_name: str
    purchase_order_id: UUID
    purchase_order_number: str
    remaining_line_count: int
    remaining_capitalized_value: Decimal


class EligibleReceiptResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receipts: list[EligibleReceipt]


class SupplierInvoiceContextLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goods_receipt_id: UUID
    goods_receipt_number: str
    goods_receipt_line_id: UUID
    goods_receipt_line_number: int
    purchase_order_line_id: UUID
    product_id: UUID
    product_name: str
    sku: str
    hsn_code: str
    uom_code: str
    uom_conversion_factor: Decimal
    accepted_base_quantity: Decimal
    free_base_quantity: Decimal
    allocated_base_billed_quantity: Decimal
    allocated_base_free_quantity: Decimal
    remaining_base_billed_quantity: Decimal
    remaining_base_free_quantity: Decimal
    remaining_billed_quantity: Decimal
    remaining_free_quantity: Decimal
    receipt_unit_cost: Decimal
    remaining_capitalized_value: Decimal
    suggested_quoted_unit_rate: Decimal
    suggested_price_basis: Literal["tax_exclusive", "tax_inclusive"]
    suggested_free_supply_tax_treatment: Literal[
        "excluded_from_taxable_value", "included_at_unit_rate"
    ]
    suggested_line_discount_kind: Literal["none", "percent", "amount"]
    suggested_line_discount_basis: Literal["taxable_value", "price_value"]
    suggested_line_discount_value: Decimal
    source_inventory_document_id: UUID
    source_inventory_document_line_id: UUID
    source_stock_ledger_entry_id: UUID

    @model_validator(mode="after")
    def reconcile_receipt_ceiling(self):
        if self.uom_conversion_factor <= 0:
            raise ValueError("supplier-invoice source UOM factor must be positive")
        if self.remaining_base_billed_quantity != (
            self.accepted_base_quantity - self.allocated_base_billed_quantity
        ):
            raise ValueError("supplier-invoice billed receipt ceiling does not reconcile")
        if self.remaining_base_free_quantity != (
            self.free_base_quantity - self.allocated_base_free_quantity
        ):
            raise ValueError("supplier-invoice free receipt ceiling does not reconcile")
        if self.remaining_base_billed_quantity < 0 or self.remaining_base_free_quantity < 0:
            raise ValueError("supplier-invoice receipt ceiling is over-allocated")
        if self.remaining_base_billed_quantity + self.remaining_base_free_quantity <= 0:
            raise ValueError("supplier-invoice source line has no unallocated receipt quantity")
        if (
            self.remaining_billed_quantity * self.uom_conversion_factor
            != self.remaining_base_billed_quantity
            or self.remaining_free_quantity * self.uom_conversion_factor
            != self.remaining_base_free_quantity
        ):
            raise ValueError("supplier-invoice entered/base quantities do not reconcile")
        expected_value = (
            (self.remaining_base_billed_quantity + self.remaining_base_free_quantity)
            * self.receipt_unit_cost
        ).quantize(Decimal("0.01"))
        if expected_value != self.remaining_capitalized_value:
            raise ValueError("supplier-invoice receipt capitalisation does not reconcile")
        return self


class PortalEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    portal_document_id: UUID
    portal_document_line_id: UUID
    return_period_id: UUID
    parsed_at: datetime
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_row_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    supplier_gstin: str
    invoice_number: str
    invoice_date: date
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    total_amount: Decimal


class SupplierInvoiceContextCharge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purchase_order_line_id: UUID
    expense_charge_code: Literal["freight", "packing", "insurance", "handling"]
    quoted_amount: Decimal
    expense_price_basis: Literal["tax_exclusive", "tax_inclusive"]
    expense_document_discount_eligible: bool
    net_value_account_id: Optional[UUID]
    account_code: Optional[str]
    account_name: Optional[str]


class SupplierInvoiceContextResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ready: bool
    blocking_reasons: list[str]
    branch_id: UUID
    buyer_tax_registration_id: Optional[UUID]
    buyer_gstin: Optional[str]
    supplier_account_id: UUID
    supplier_name: str
    supplier_tax_registration_id: Optional[UUID]
    supplier_gstin: Optional[str]
    purchase_order_id: UUID
    document_discount_kind: Literal["none", "percent", "amount"]
    document_discount_basis: Literal["taxable_value", "price_value"]
    document_discount_value: Decimal
    rounding_policy: Literal["none", "nearest_rupee"]
    goods_receipt_ids: list[UUID]
    portal_evidence: Optional[PortalEvidence]
    lines: list[SupplierInvoiceContextLine]
    expense_charge_lines: list[SupplierInvoiceContextCharge]
    inventory_effect: Literal["already_capitalized_by_goods_receipt"] = (
        "already_capitalized_by_goods_receipt"
    )
    supplier_invoice_inventory_value_delta: Decimal = Decimal("0.00")

    @model_validator(mode="after")
    def require_complete_ready_context(self):
        complete = bool(
            self.buyer_tax_registration_id
            and self.buyer_gstin
            and self.supplier_tax_registration_id
            and self.supplier_gstin
            and self.portal_evidence
            and self.lines
        )
        if self.ready != (complete and not self.blocking_reasons):
            raise ValueError("supplier-invoice context readiness is inconsistent")
        if len(set(self.goods_receipt_ids)) != len(self.goods_receipt_ids):
            raise ValueError("supplier-invoice context repeats a GRN identity")
        if self.lines and {line.goods_receipt_id for line in self.lines} != set(self.goods_receipt_ids):
            raise ValueError("supplier-invoice GRN set does not match its line lineage")
        if self.portal_evidence and self.supplier_gstin != self.portal_evidence.supplier_gstin:
            raise ValueError("supplier-invoice portal GSTIN differs from supplier registration")
        return self


class PostedAllocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allocation_id: UUID
    goods_receipt_id: UUID
    goods_receipt_line_id: UUID
    allocated_base_billed_quantity: Decimal
    allocated_base_free_quantity: Decimal
    receipt_unit_cost: Decimal
    capitalized_value: Decimal
    source_inventory_document_id: UUID
    source_inventory_document_line_id: UUID
    source_stock_ledger_entry_id: UUID


class PostedSupplierInvoiceLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_invoice_line_id: UUID
    line_number: int
    line_kind: Literal["product", "charge"]
    product_id: Optional[UUID]
    product_name: Optional[str]
    hsn_sac_code: str
    uom_code: Optional[str]
    billed_quantity: Optional[Decimal]
    free_quantity: Optional[Decimal]
    base_billed_quantity: Optional[Decimal]
    base_free_quantity: Optional[Decimal]
    quoted_unit_rate: Decimal
    gross_amount: Decimal
    line_discount_amount: Decimal
    document_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    itc_eligibility: Literal["eligible"]
    inventory_cost_treatment: Literal["capitalize", "expense"]
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    line_total: Decimal
    allocations: list[PostedAllocation]

    @model_validator(mode="after")
    def reconcile_product_allocation(self):
        if self.line_kind == "product":
            if not self.product_id or not self.product_name or not self.uom_code or not self.allocations:
                raise ValueError("posted supplier-invoice product line lacks receipt lineage")
            if sum((a.allocated_base_billed_quantity for a in self.allocations), Decimal("0")) != self.base_billed_quantity:
                raise ValueError("posted supplier-invoice billed allocation does not reconcile")
            if sum((a.allocated_base_free_quantity for a in self.allocations), Decimal("0")) != self.base_free_quantity:
                raise ValueError("posted supplier-invoice free allocation does not reconcile")
            if sum((a.capitalized_value for a in self.allocations), Decimal("0")) != self.net_value_amount:
                raise ValueError("posted supplier-invoice value differs from receipt capitalisation")
        elif self.allocations:
            raise ValueError("posted supplier-invoice charge line must not allocate receipt stock")
        return self


class JournalLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    journal_line_id: UUID
    line_number: int
    account_id: UUID
    account_code: str
    account_name: str
    party_id: Optional[UUID]
    debit: Decimal
    credit: Decimal


class PostedSupplierInvoiceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_invoice_id: UUID
    supplier_invoice_number: str
    supplier_invoice_date: date
    received_date: date
    due_date: date
    branch_id: UUID
    supplier_account_id: UUID
    supplier_name: str
    supplier_gstin: str
    buyer_gstin: str
    status: Literal["posted"]
    posted_at: datetime
    subtotal: Decimal
    discount_total: Decimal
    charges_total: Decimal
    net_value_total: Decimal
    gst_taxable_total: Decimal
    cgst_total: Decimal
    sgst_total: Decimal
    igst_total: Decimal
    cess_total: Decimal
    rounding_adjustment: Decimal
    grand_total: Decimal
    tax_document_id: UUID
    portal_document_line_id: UUID
    tax_document_taxable_total: Decimal
    tax_document_cgst_total: Decimal
    tax_document_sgst_total: Decimal
    tax_document_igst_total: Decimal
    tax_document_cess_total: Decimal
    tax_document_payable_total: Decimal
    portal_taxable_total: Decimal
    portal_cgst_total: Decimal
    portal_sgst_total: Decimal
    portal_igst_total: Decimal
    portal_cess_total: Decimal
    portal_grand_total: Decimal
    open_item_id: UUID
    open_item_status: Literal["open", "settled"]
    open_item_principal: Decimal
    journal_entry_id: UUID
    journal_number: str
    journal_status: Literal["posted"]
    journal_debit_total: Decimal
    journal_credit_total: Decimal
    supplier_invoice_inventory_document_count: int
    supplier_invoice_inventory_value_delta: Decimal
    lines: list[PostedSupplierInvoiceLine]
    journal_lines: list[JournalLine]

    @model_validator(mode="after")
    def reconcile_posted_effects(self):
        if not self.lines or not self.journal_lines:
            raise ValueError("posted supplier invoice lacks line or journal evidence")
        checks = (
            (sum((line.gross_amount for line in self.lines if line.line_kind == "product"), Decimal("0")), self.subtotal, "subtotal"),
            (sum((line.gross_amount for line in self.lines if line.line_kind == "charge"), Decimal("0")), self.charges_total, "charges"),
            (sum((line.line_discount_amount + line.document_discount_amount for line in self.lines), Decimal("0")), self.discount_total, "discount"),
            (sum((line.net_value_amount for line in self.lines), Decimal("0")), self.net_value_total, "net value"),
            (sum((line.gst_taxable_value for line in self.lines), Decimal("0")), self.gst_taxable_total, "taxable value"),
            (sum((line.cgst_amount for line in self.lines), Decimal("0")), self.cgst_total, "CGST"),
            (sum((line.sgst_amount for line in self.lines), Decimal("0")), self.sgst_total, "SGST"),
            (sum((line.igst_amount for line in self.lines), Decimal("0")), self.igst_total, "IGST"),
            (sum((line.cess_amount for line in self.lines), Decimal("0")), self.cess_total, "cess"),
        )
        for actual, expected, label in checks:
            if actual != expected:
                raise ValueError(f"posted supplier-invoice {label} does not reconcile")
        if sum((line.line_total for line in self.lines), Decimal("0")) + self.rounding_adjustment != self.grand_total:
            raise ValueError("posted supplier-invoice grand total does not reconcile")
        if self.open_item_principal != self.grand_total:
            raise ValueError("posted supplier-invoice payable does not reconcile")
        regulatory_checks = (
            (self.tax_document_taxable_total, self.gst_taxable_total, "tax-document taxable value"),
            (self.tax_document_cgst_total, self.cgst_total, "tax-document CGST"),
            (self.tax_document_sgst_total, self.sgst_total, "tax-document SGST"),
            (self.tax_document_igst_total, self.igst_total, "tax-document IGST"),
            (self.tax_document_cess_total, self.cess_total, "tax-document cess"),
            (self.tax_document_payable_total, self.grand_total, "tax-document payable"),
            (self.portal_taxable_total, self.gst_taxable_total, "GSTR-2B taxable value"),
            (self.portal_cgst_total, self.cgst_total, "GSTR-2B CGST"),
            (self.portal_sgst_total, self.sgst_total, "GSTR-2B SGST"),
            (self.portal_igst_total, self.igst_total, "GSTR-2B IGST"),
            (self.portal_cess_total, self.cess_total, "GSTR-2B cess"),
            (self.portal_grand_total, self.grand_total, "GSTR-2B grand total"),
        )
        for actual, expected, label in regulatory_checks:
            if actual != expected:
                raise ValueError(f"posted supplier-invoice {label} does not reconcile")
        if self.journal_debit_total != self.journal_credit_total or self.journal_debit_total != self.grand_total:
            raise ValueError("posted supplier-invoice journal is not balanced to payable")
        if sum((line.debit for line in self.journal_lines), Decimal("0")) != self.journal_debit_total:
            raise ValueError("posted supplier-invoice journal debits do not reconcile")
        if sum((line.credit for line in self.journal_lines), Decimal("0")) != self.journal_credit_total:
            raise ValueError("posted supplier-invoice journal credits do not reconcile")
        if self.supplier_invoice_inventory_document_count != 0 or self.supplier_invoice_inventory_value_delta != 0:
            raise ValueError("supplier invoice must not post a second inventory movement")
        return self


@router.get("/eligible-receipts", response_model=EligibleReceiptResponse)
def eligible_receipts(
    limit: int = Query(100, ge=1, le=500),
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    rows = _rows(db, """
        SELECT receipt.id AS goods_receipt_id,
               receipt.goods_receipt_number, receipt.received_at,
               receipt.branch_id, receipt.supplier_account_id,
               party.legal_name AS supplier_name,
               purchase.id AS purchase_order_id,
               purchase.purchase_order_number,
               count(*) FILTER (WHERE ceiling.remaining_billed+ceiling.remaining_free>0) AS remaining_line_count,
               COALESCE(sum(round((ceiling.remaining_billed+ceiling.remaining_free)*line.unit_cost,2))
                 FILTER (WHERE ceiling.remaining_billed+ceiling.remaining_free>0),0) AS remaining_capitalized_value
          FROM procurement.goods_receipts receipt
          JOIN procurement.goods_receipt_lines line
            ON line.org_id=receipt.org_id AND line.goods_receipt_id=receipt.id
          JOIN procurement.purchase_order_lines order_line
            ON order_line.org_id=line.org_id AND order_line.id=line.purchase_order_line_id
          JOIN procurement.purchase_orders purchase
            ON purchase.org_id=order_line.org_id AND purchase.id=order_line.purchase_order_id
           AND purchase.status IN ('partially_received','received')
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=receipt.org_id AND supplier.id=receipt.supplier_account_id
           AND supplier.status='active'
          JOIN parties.parties party
            ON party.org_id=supplier.org_id AND party.id=supplier.party_id AND party.status='active'
          LEFT JOIN LATERAL (
            SELECT line.base_accepted_quantity-COALESCE(sum(allocation.allocated_base_billed_quantity),0) AS remaining_billed,
                   line.base_free_quantity-COALESCE(sum(allocation.allocated_base_free_quantity),0) AS remaining_free
              FROM procurement.supplier_invoice_receipt_allocations allocation
             WHERE allocation.org_id=line.org_id AND allocation.goods_receipt_line_id=line.id
          ) ceiling ON true
         WHERE receipt.org_id=:org_id AND receipt.status='posted'
         GROUP BY receipt.id, receipt.goods_receipt_number, receipt.received_at,
                  receipt.branch_id, receipt.supplier_account_id, party.legal_name,
                  purchase.id, purchase.purchase_order_number
        HAVING count(*) FILTER (WHERE ceiling.remaining_billed+ceiling.remaining_free>0)>0
         ORDER BY receipt.received_at, receipt.id
         LIMIT :limit
    """, {"org_id": org_id, "limit": limit})
    return EligibleReceiptResponse(receipts=rows)


@router.get("/context", response_model=SupplierInvoiceContextResponse)
def supplier_invoice_context(
    goods_receipt_id: UUID,
    supplier_invoice_number: str = Query(min_length=1, max_length=64),
    invoice_date: date = Query(),
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    params = {
        "org_id": org_id,
        "goods_receipt_id": goods_receipt_id,
        "supplier_invoice_number": supplier_invoice_number.strip(),
        "invoice_date": invoice_date,
    }
    header = _one(db, """
        SELECT receipt.branch_id, receipt.supplier_account_id,
               party.legal_name AS supplier_name,
               purchase.id AS purchase_order_id,
               purchase.document_discount_kind,
               purchase.document_discount_basis,
               purchase.document_discount_value,
               purchase.rounding_policy,
               receipt.id AS goods_receipt_id
          FROM procurement.goods_receipts receipt
          JOIN procurement.goods_receipt_lines receipt_line
            ON receipt_line.org_id=receipt.org_id AND receipt_line.goods_receipt_id=receipt.id
          JOIN procurement.purchase_order_lines order_line
            ON order_line.org_id=receipt_line.org_id AND order_line.id=receipt_line.purchase_order_line_id
          JOIN procurement.purchase_orders purchase
            ON purchase.org_id=order_line.org_id AND purchase.id=order_line.purchase_order_id
           AND purchase.status IN ('partially_received','received')
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=receipt.org_id AND supplier.id=receipt.supplier_account_id
           AND supplier.status='active'
          JOIN parties.parties party
            ON party.org_id=supplier.org_id AND party.id=supplier.party_id AND party.status='active'
         WHERE receipt.org_id=:org_id AND receipt.id=:goods_receipt_id
           AND receipt.status='posted'
         GROUP BY receipt.branch_id, receipt.supplier_account_id, party.legal_name,
                  purchase.id, purchase.document_discount_kind,
                  purchase.document_discount_basis, purchase.document_discount_value,
                  purchase.rounding_policy, receipt.id
        HAVING count(DISTINCT purchase.id)=1
    """, params)
    if header is None:
        raise HTTPException(status_code=404, detail="Posted canonical GRN is unavailable for supplier invoicing")

    registrations = _rows(db, """
        SELECT supplier_registration.id AS supplier_tax_registration_id,
               supplier_registration.registration_number AS supplier_gstin,
               buyer_registration.id AS buyer_tax_registration_id,
               buyer_registration.gstin AS buyer_gstin
          FROM procurement.goods_receipts receipt
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=receipt.org_id AND supplier.id=receipt.supplier_account_id
          JOIN parties.tax_registrations supplier_registration
            ON supplier_registration.org_id=supplier.org_id
           AND supplier_registration.party_id=supplier.party_id
           AND supplier_registration.registration_type='GSTIN'
           AND supplier_registration.status='active'
           AND supplier_registration.verified_at IS NOT NULL
           AND supplier_registration.taxpayer_type IN ('regular','casual')
           AND (supplier_registration.valid_from IS NULL OR supplier_registration.valid_from<=:invoice_date)
           AND (supplier_registration.valid_until IS NULL OR supplier_registration.valid_until>=:invoice_date)
          JOIN parties.addresses supplier_address
            ON supplier_address.org_id=supplier.org_id AND supplier_address.party_id=supplier.party_id
           AND supplier_address.address_kind='registered' AND supplier_address.is_primary
           AND supplier_address.status='active'
           AND supplier_address.state_code=supplier_registration.state_code
           AND supplier_address.valid_from<=:invoice_date
           AND (supplier_address.valid_until IS NULL OR supplier_address.valid_until>=:invoice_date)
          JOIN tax.registration_branches buyer_scope
            ON buyer_scope.org_id=receipt.org_id AND buyer_scope.branch_id=receipt.branch_id
           AND buyer_scope.status='active' AND buyer_scope.effective_from<=:invoice_date
           AND (buyer_scope.effective_to IS NULL OR buyer_scope.effective_to>=:invoice_date)
          JOIN tax.registrations buyer_registration
            ON buyer_registration.org_id=buyer_scope.org_id AND buyer_registration.id=buyer_scope.registration_id
           AND buyer_registration.registration_type='regular' AND buyer_registration.status='active'
           AND buyer_registration.effective_from<=:invoice_date
           AND (buyer_registration.effective_to IS NULL OR buyer_registration.effective_to>=:invoice_date)
         WHERE receipt.org_id=:org_id AND receipt.id=:goods_receipt_id
           AND buyer_registration.state_code=(SELECT state_code FROM core.branches
                 WHERE org_id=receipt.org_id AND id=receipt.branch_id)
         ORDER BY supplier_registration.id, buyer_registration.id
    """, params)
    blockers: list[str] = []
    registration = registrations[0] if len(registrations) == 1 else None
    if registration is None:
        blockers.append("Exactly one effective verified supplier GSTIN and buyer branch GST registration is required")

    portal = None
    if registration is not None:
        portal_rows = _rows(db, """
            SELECT document.id AS portal_document_id, line.id AS portal_document_line_id,
                   document.return_period_id, document.parsed_at,
                   encode(document.source_sha256,'hex') AS source_sha256,
                   encode(line.source_row_hash,'hex') AS source_row_hash,
                   line.supplier_gstin, line.invoice_number, line.invoice_date,
                   line.taxable_amount, line.cgst_amount, line.sgst_amount,
                   line.igst_amount, line.cess_amount, line.total_amount
              FROM tax.portal_document_lines line
              JOIN tax.portal_documents document
                ON document.org_id=line.org_id AND document.id=line.portal_document_id
               AND document.registration_id=:buyer_tax_registration_id
               AND document.portal_document_type='gstr2b'
               AND document.status='parsed' AND document.parsed_at IS NOT NULL
              JOIN tax.return_periods period
                ON period.org_id=document.org_id AND period.id=document.return_period_id
               AND period.registration_id=document.registration_id
               AND period.period_start<=:invoice_date AND period.period_end>=:invoice_date
             WHERE line.org_id=:org_id AND line.document_type='invoice'
               AND line.supplier_gstin=:supplier_gstin
               AND line.invoice_number=:supplier_invoice_number
               AND line.invoice_date=:invoice_date
               AND line.place_of_supply_state_code=(SELECT state_code FROM tax.registrations
                     WHERE org_id=:org_id AND id=:buyer_tax_registration_id)
             ORDER BY line.id
        """, {**params, **registration})
        if len(portal_rows) == 1:
            portal = portal_rows[0]
        else:
            blockers.append("Exactly one parsed GSTR-2B invoice row must match supplier GSTIN, invoice number, date, and place of supply")

    lines = _rows(db, """
        SELECT receipt.id AS goods_receipt_id, receipt.goods_receipt_number,
               line.id AS goods_receipt_line_id, line.line_number AS goods_receipt_line_number,
               line.purchase_order_line_id, line.product_id, product.name AS product_name,
               product.sku, product.hsn_code, line.uom_code,
               order_line.uom_conversion_factor,
               line.base_accepted_quantity AS accepted_base_quantity,
               line.base_free_quantity AS free_base_quantity,
               COALESCE(allocated.billed,0) AS allocated_base_billed_quantity,
               COALESCE(allocated.free,0) AS allocated_base_free_quantity,
               line.base_accepted_quantity-COALESCE(allocated.billed,0) AS remaining_base_billed_quantity,
               line.base_free_quantity-COALESCE(allocated.free,0) AS remaining_base_free_quantity,
               (line.base_accepted_quantity-COALESCE(allocated.billed,0))/order_line.uom_conversion_factor AS remaining_billed_quantity,
               (line.base_free_quantity-COALESCE(allocated.free,0))/order_line.uom_conversion_factor AS remaining_free_quantity,
               line.unit_cost AS receipt_unit_cost,
               round(((line.base_accepted_quantity-COALESCE(allocated.billed,0))+
                      (line.base_free_quantity-COALESCE(allocated.free,0)))*line.unit_cost,2) AS remaining_capitalized_value,
               order_line.quoted_unit_rate AS suggested_quoted_unit_rate,
               order_line.price_basis AS suggested_price_basis,
               order_line.free_supply_tax_treatment AS suggested_free_supply_tax_treatment,
               order_line.line_discount_kind AS suggested_line_discount_kind,
               order_line.line_discount_basis AS suggested_line_discount_basis,
               order_line.line_discount_value AS suggested_line_discount_value,
               inventory_document.id AS source_inventory_document_id,
               inventory_line.id AS source_inventory_document_line_id,
               ledger.id AS source_stock_ledger_entry_id
          FROM procurement.goods_receipts receipt
          JOIN procurement.goods_receipt_lines line
            ON line.org_id=receipt.org_id AND line.goods_receipt_id=receipt.id
          JOIN procurement.purchase_order_lines order_line
            ON order_line.org_id=line.org_id AND order_line.id=line.purchase_order_line_id
           AND order_line.line_kind='product'
          JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id AND product.status='active'
          JOIN inventory.inventory_documents inventory_document
            ON inventory_document.org_id=receipt.org_id
           AND inventory_document.goods_receipt_id=receipt.id AND inventory_document.status='posted'
          JOIN inventory.inventory_document_lines inventory_line
            ON inventory_line.org_id=inventory_document.org_id
           AND inventory_line.inventory_document_id=inventory_document.id
           AND inventory_line.goods_receipt_line_id=line.id
          JOIN inventory.stock_ledger_entries ledger
            ON ledger.org_id=inventory_line.org_id
           AND ledger.inventory_document_line_id=inventory_line.id
          LEFT JOIN LATERAL (
            SELECT COALESCE(sum(allocation.allocated_base_billed_quantity),0) AS billed,
                   COALESCE(sum(allocation.allocated_base_free_quantity),0) AS free
              FROM procurement.supplier_invoice_receipt_allocations allocation
             WHERE allocation.org_id=line.org_id AND allocation.goods_receipt_line_id=line.id
          ) allocated ON true
         WHERE receipt.org_id=:org_id AND receipt.id=:goods_receipt_id
           AND receipt.status='posted'
           AND (line.base_accepted_quantity>COALESCE(allocated.billed,0)
                OR line.base_free_quantity>COALESCE(allocated.free,0))
         ORDER BY line.line_number, line.id
    """, params)
    if not lines:
        blockers.append("The posted GRN has no unallocated billed or free quantity")

    expense_charge_lines = _rows(db, """
        SELECT order_line.id AS purchase_order_line_id,
               order_line.charge_code AS expense_charge_code,
               order_line.quoted_unit_rate AS quoted_amount,
               order_line.price_basis AS expense_price_basis,
               order_line.document_discount_eligible AS expense_document_discount_eligible,
               NULL::uuid AS net_value_account_id,
               NULL::text AS account_code, NULL::text AS account_name
          FROM procurement.purchase_order_lines order_line
         WHERE order_line.org_id=:org_id
           AND order_line.purchase_order_id=:purchase_order_id
           AND order_line.line_kind='charge'
           AND order_line.charge_code IN ('freight','packing','insurance','handling')
         ORDER BY order_line.line_number, order_line.id
    """, {**params, "purchase_order_id": header["purchase_order_id"]})
    charge_count = _one(db, """
        SELECT count(*) AS count
          FROM procurement.purchase_order_lines
         WHERE org_id=:org_id AND purchase_order_id=:purchase_order_id
           AND line_kind='charge'
    """, {**params, "purchase_order_id": header["purchase_order_id"]})
    if charge_count and int(charge_count["count"]) != len(expense_charge_lines):
        blockers.append("Every PO charge must use freight, packing, insurance, or handling")
    if expense_charge_lines:
        blockers.append(
            "PO charge lines lack an authoritative effective expense-account mapping; "
            "supplier-invoice posting remains unavailable"
        )

    payload = {
        **header,
        "buyer_tax_registration_id": registration and registration["buyer_tax_registration_id"],
        "buyer_gstin": registration and registration["buyer_gstin"],
        "supplier_tax_registration_id": registration and registration["supplier_tax_registration_id"],
        "supplier_gstin": registration and registration["supplier_gstin"],
        "goods_receipt_ids": [header["goods_receipt_id"]],
        "portal_evidence": portal,
        "lines": lines,
        "expense_charge_lines": expense_charge_lines,
        "blocking_reasons": blockers,
        "ready": not blockers,
    }
    payload.pop("goods_receipt_id")
    return SupplierInvoiceContextResponse(**payload)


@router.get("/{supplier_invoice_id}", response_model=PostedSupplierInvoiceResponse)
def posted_supplier_invoice(
    supplier_invoice_id: UUID,
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    params = {"org_id": org_id, "supplier_invoice_id": supplier_invoice_id}
    header = _one(db, """
        SELECT invoice.id AS supplier_invoice_id, invoice.supplier_invoice_number,
               invoice.supplier_invoice_date, invoice.received_date, invoice.due_date,
               invoice.branch_id, invoice.supplier_account_id,
               invoice.supplier_legal_name_snapshot AS supplier_name,
               invoice.supplier_gstin_snapshot AS supplier_gstin,
               invoice.buyer_gstin_snapshot AS buyer_gstin,
               invoice.status, invoice.posted_at, invoice.subtotal,
               invoice.discount_total, invoice.charges_total, invoice.net_value_total,
               invoice.gst_taxable_total, invoice.cgst_total, invoice.sgst_total,
               invoice.igst_total, invoice.cess_total, invoice.rounding_adjustment,
               invoice.grand_total, tax_document.id AS tax_document_id,
               NULLIF(pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb
                 ->>'portal_document_line_id','')::uuid AS portal_document_line_id,
               tax_document.gst_taxable_value AS tax_document_taxable_total,
               tax_document.cgst_amount AS tax_document_cgst_total,
               tax_document.sgst_amount AS tax_document_sgst_total,
               tax_document.igst_amount AS tax_document_igst_total,
               tax_document.cess_amount AS tax_document_cess_total,
               tax_document.counterparty_payable_amount AS tax_document_payable_total,
               portal_line.taxable_amount AS portal_taxable_total,
               portal_line.cgst_amount AS portal_cgst_total,
               portal_line.sgst_amount AS portal_sgst_total,
               portal_line.igst_amount AS portal_igst_total,
               portal_line.cess_amount AS portal_cess_total,
               portal_line.total_amount AS portal_grand_total,
               open_item.id AS open_item_id, open_item.status AS open_item_status,
               open_item.principal_amount AS open_item_principal,
               journal.id AS journal_entry_id, journal.journal_number,
               journal.status AS journal_status,
               journal.transaction_debit_total AS journal_debit_total,
               journal.transaction_credit_total AS journal_credit_total,
               (SELECT count(*) FROM inventory.inventory_documents inventory_document
                 WHERE inventory_document.org_id=invoice.org_id
                   AND inventory_document.supplier_invoice_id=invoice.id) AS supplier_invoice_inventory_document_count,
               0::numeric(20,2) AS supplier_invoice_inventory_value_delta
          FROM procurement.supplier_invoices invoice
          JOIN tax.documents tax_document
            ON tax_document.org_id=invoice.org_id AND tax_document.supplier_invoice_id=invoice.id
           AND tax_document.document_class='supplier_invoice'
           AND tax_document.document_effect='original'
          JOIN automation.command_requests command
            ON command.org_id=invoice.org_id
           AND command.target_resource_type='supplier_invoice'
           AND command.target_resource_id=invoice.id
           AND command.result_resource_type='supplier_invoice'
           AND command.result_resource_id=invoice.id
           AND command.capability_code='procurement.supplier_invoice.prepare'
           AND command.operation='procurement.supplier_invoice.post'
           AND command.status='succeeded'
          JOIN tax.portal_document_lines portal_line
            ON portal_line.org_id=command.org_id
           AND portal_line.id=NULLIF(pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb
                 ->>'portal_document_line_id','')::uuid
           AND portal_line.document_type='invoice'
          JOIN finance.accounting_events event
            ON event.org_id=invoice.org_id AND event.supplier_invoice_id=invoice.id
           AND event.event_type='supplier_invoice'
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
          JOIN finance.open_items open_item
            ON open_item.org_id=event.org_id AND open_item.accounting_event_id=event.id
           AND open_item.item_side='payable'
         WHERE invoice.org_id=:org_id AND invoice.id=:supplier_invoice_id
           AND invoice.status='posted'
    """, params)
    if header is None:
        raise HTTPException(status_code=404, detail="Posted canonical supplier invoice not found")

    raw_lines = _rows(db, """
        SELECT line.id AS supplier_invoice_line_id, line.line_number, line.line_kind,
               line.product_id, product.name AS product_name,
               line.tax_classification_code_snapshot AS hsn_sac_code,
               line.uom_code, line.billed_quantity, line.free_quantity,
               line.base_billed_quantity, line.base_free_quantity,
               line.quoted_unit_rate, line.gross_amount, line.line_discount_amount,
               line.document_discount_amount, line.net_value_amount,
               line.gst_taxable_value, line.itc_eligibility,
               line.inventory_cost_treatment, line.cgst_amount, line.sgst_amount,
               line.igst_amount, line.cess_amount, line.line_total
          FROM procurement.supplier_invoice_lines line
          LEFT JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id
         WHERE line.org_id=:org_id AND line.supplier_invoice_id=:supplier_invoice_id
         ORDER BY line.line_number, line.id
    """, params)
    allocations = _rows(db, """
        SELECT allocation.supplier_invoice_line_id,
               allocation.id AS allocation_id, receipt.id AS goods_receipt_id,
               receipt_line.id AS goods_receipt_line_id,
               allocation.allocated_base_billed_quantity,
               allocation.allocated_base_free_quantity,
               receipt_line.unit_cost AS receipt_unit_cost,
               round((allocation.allocated_base_billed_quantity+
                      allocation.allocated_base_free_quantity)*receipt_line.unit_cost,2) AS capitalized_value,
               inventory_document.id AS source_inventory_document_id,
               inventory_line.id AS source_inventory_document_line_id,
               ledger.id AS source_stock_ledger_entry_id
          FROM procurement.supplier_invoice_receipt_allocations allocation
          JOIN procurement.supplier_invoice_lines invoice_line
            ON invoice_line.org_id=allocation.org_id
           AND invoice_line.id=allocation.supplier_invoice_line_id
          JOIN procurement.goods_receipt_lines receipt_line
            ON receipt_line.org_id=allocation.org_id
           AND receipt_line.id=allocation.goods_receipt_line_id
          JOIN procurement.goods_receipts receipt
            ON receipt.org_id=receipt_line.org_id AND receipt.id=receipt_line.goods_receipt_id
           AND receipt.status='posted'
          JOIN inventory.inventory_documents inventory_document
            ON inventory_document.org_id=receipt.org_id
           AND inventory_document.goods_receipt_id=receipt.id AND inventory_document.status='posted'
          JOIN inventory.inventory_document_lines inventory_line
            ON inventory_line.org_id=inventory_document.org_id
           AND inventory_line.inventory_document_id=inventory_document.id
           AND inventory_line.goods_receipt_line_id=receipt_line.id
          JOIN inventory.stock_ledger_entries ledger
            ON ledger.org_id=inventory_line.org_id
           AND ledger.inventory_document_line_id=inventory_line.id
         WHERE invoice_line.org_id=:org_id
           AND invoice_line.supplier_invoice_id=:supplier_invoice_id
         ORDER BY invoice_line.line_number, allocation.id
    """, params)
    allocations_by_line: dict[UUID, list[dict[str, Any]]] = {}
    for allocation in allocations:
        line_id = allocation.pop("supplier_invoice_line_id")
        allocations_by_line.setdefault(line_id, []).append(allocation)
    header["lines"] = [
        {**line, "allocations": allocations_by_line.get(line["supplier_invoice_line_id"], [])}
        for line in raw_lines
    ]
    header["journal_lines"] = _rows(db, """
        SELECT line.id AS journal_line_id, line.line_number,
               line.account_id, account.code AS account_code,
               account.name AS account_name, line.party_id,
               line.transaction_debit AS debit, line.transaction_credit AS credit
          FROM finance.journal_lines line
          JOIN finance.accounts account
            ON account.org_id=line.org_id AND account.id=line.account_id
         WHERE line.org_id=:org_id AND line.journal_entry_id=:journal_entry_id
         ORDER BY line.line_number, line.id
    """, {**params, "journal_entry_id": header["journal_entry_id"]})
    return PostedSupplierInvoiceResponse(**header)


__all__ = [
    "EligibleReceiptResponse",
    "PostedSupplierInvoiceResponse",
    "SupplierInvoiceContextResponse",
    "eligible_receipts",
    "posted_supplier_invoice",
    "router",
    "supplier_invoice_context",
]
