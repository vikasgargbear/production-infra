"""Authenticated canonical context and exact standalone adjustment-note readback."""

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
    prefix="/canonical/adjustment-notes",
    tags=["Canonical Adjustment Note Reads"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)
FINANCE_USER = Depends(PermissionChecker("finance", "view"))
Side = Literal["sales", "purchase"]


def _activate(db: Session, user: dict[str, Any]) -> tuple[UUID, bool, list[UUID]]:
    org_id = UUID(str(user["org_id"]))
    db.execute(text("""
        SELECT erp_security.activate_context(:auth_user_id, :org_id),
               pg_catalog.set_config('app.request_id', :request_id, true)
    """), {
        "auth_user_id": UUID(str(user["auth_user_id"])),
        "org_id": org_id,
        "request_id": str(uuid4()),
    })
    organization_scope = (
        user.get("is_admin") is True
        or str(user.get("data_access_level") or "").lower() == "organization"
        or str(user.get("branch_scope") or "").lower() in {"all", "organization"}
    )
    branches = [UUID(str(value)) for value in (user.get("branch_ids") or [])]
    return org_id, organization_scope, branches


class StrictRead(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AdjustmentDiscountPolicy(StrictRead):
    kind: Literal["none", "percent", "amount"]
    basis: Literal["taxable_value", "price_value"]
    value: Decimal = Field(ge=0)

    @model_validator(mode="after")
    def exact_kind_value(self):
        if self.kind == "none" and self.value != 0:
            raise ValueError("none discount must have value zero")
        if self.kind == "percent" and self.value > 100:
            raise ValueError("percent discount cannot exceed 100")
        if self.kind == "amount" and self.value != self.value.quantize(Decimal("0.01")):
            raise ValueError("amount discount must use exact paise precision")
        return self


class AdjustmentSourceLine(StrictRead):
    original_line_id: UUID
    line_number: int = Field(gt=0)
    product_id: UUID
    product_name: str
    sku: str
    uom_code: str
    uom_conversion_factor: Decimal = Field(gt=0)
    original_billed_quantity: Decimal = Field(ge=0)
    original_free_quantity: Decimal = Field(ge=0)
    net_decreased_billed_quantity: Decimal = Field(ge=0)
    net_decreased_free_quantity: Decimal = Field(ge=0)
    remaining_billed_quantity: Decimal = Field(ge=0)
    remaining_free_quantity: Decimal = Field(ge=0)
    quoted_unit_rate: Decimal = Field(ge=0)
    price_basis: Literal["tax_exclusive", "tax_inclusive"]
    line_discount: AdjustmentDiscountPolicy
    document_discount_eligible: bool
    free_supply_tax_treatment: Literal["excluded_from_taxable_value", "included_at_unit_rate"]
    tax_charge_mechanism: Literal["normal", "reverse_charge"]
    tax_classification_code_snapshot: str
    tax_code_version_id: UUID
    taxability_snapshot: Literal["taxable", "zero_rated", "exempt", "nil_rated", "non_gst"]
    cgst_rate: Decimal = Field(ge=0, le=100)
    sgst_rate: Decimal = Field(ge=0, le=100)
    igst_rate: Decimal = Field(ge=0, le=100)
    cess_rate: Decimal = Field(ge=0, le=100)

    @model_validator(mode="after")
    def reconcile(self):
        if self.original_billed_quantity - self.net_decreased_billed_quantity != self.remaining_billed_quantity:
            raise ValueError("adjustment billed quantities do not reconcile")
        if self.original_free_quantity - self.net_decreased_free_quantity != self.remaining_free_quantity:
            raise ValueError("adjustment free quantities do not reconcile")
        return self


class AdjustmentRuleChoice(StrictRead):
    id: UUID
    reason_code: str
    gst_tax_treatment: Literal["statutory", "commercial_only"]
    deadline_policy: str
    deadline_days: Optional[int]
    effective_from: date
    effective_to: Optional[date]
    rule_version: str


class AdjustmentNoteContext(StrictRead):
    side: Side
    direction: Literal["credit", "debit"]
    document_effect: Literal["decrease"]
    original_document_id: UUID
    original_document_number: str
    original_document_date: date
    branch_id: UUID
    party_id: UUID
    party_account_id: UUID
    party_name: str
    original_open_item_id: UUID
    original_open_item_principal: Decimal = Field(gt=0)
    original_open_item_outstanding: Decimal = Field(gt=0)
    currency_code: Literal["INR"]
    supply_type: Literal["intra_state", "inter_state", "export", "sez"]
    zero_rated_payment_mode: Literal["not_applicable", "without_payment", "with_igst"]
    tax_charge_mechanism: Literal["normal", "reverse_charge"]
    rounding_policy: Literal["none", "nearest_rupee"]
    document_discount: AdjustmentDiscountPolicy
    lines: list[AdjustmentSourceLine]
    rule_choices: list[AdjustmentRuleChoice]

    @model_validator(mode="after")
    def nonempty(self):
        if not self.lines:
            raise ValueError("posted source has no adjustable product lines")
        if not self.rule_choices:
            raise ValueError("no effective reviewed adjustment rule")
        if any(line.tax_charge_mechanism != self.tax_charge_mechanism for line in self.lines):
            raise ValueError("source line tax mechanism differs from the original document")
        if self.supply_type == "intra_state" and any(line.igst_rate != 0 for line in self.lines):
            raise ValueError("intra-state source unexpectedly carries IGST")
        if self.supply_type != "intra_state" and any(
            line.cgst_rate != 0 or line.sgst_rate != 0 for line in self.lines
        ):
            raise ValueError("non-intra-state source unexpectedly carries CGST or SGST")
        return self


class AdjustmentReadbackLine(StrictRead):
    id: UUID
    line_number: int
    original_line_id: UUID
    product_id: UUID
    billed_quantity: Decimal
    free_quantity: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    line_total: Decimal


class AdjustmentNoteReadback(StrictRead):
    id: UUID
    note_number: str
    note_date: date
    side: Side
    direction: Literal["credit", "debit"]
    document_effect: Literal["decrease", "increase"]
    status: Literal["posted"]
    original_document_id: UUID
    party_id: UUID
    gst_tax_treatment: Literal["statutory", "commercial_only"]
    counterparty_payable_amount: Decimal
    posted_at: datetime
    tax_document_id: Optional[UUID]
    tax_document_total: Optional[Decimal]
    accounting_event_id: UUID
    journal_entry_id: UUID
    journal_debit_total: Decimal
    journal_credit_total: Decimal
    journal_line_debit_total: Decimal
    journal_line_credit_total: Decimal
    allocated_amount: Decimal = Field(ge=0)
    residual_open_item_amount: Decimal = Field(ge=0)
    lines: list[AdjustmentReadbackLine]

    @model_validator(mode="after")
    def exact_effects(self):
        if self.journal_debit_total != self.journal_credit_total:
            raise ValueError("adjustment journal is not balanced")
        if self.journal_line_debit_total != self.journal_debit_total or self.journal_line_credit_total != self.journal_credit_total:
            raise ValueError("adjustment journal lines do not reconcile")
        if self.allocated_amount + self.residual_open_item_amount != self.counterparty_payable_amount:
            raise ValueError("adjustment allocation and residual do not reconcile")
        if self.gst_tax_treatment == "statutory":
            if self.tax_document_id is None or self.tax_document_total != self.counterparty_payable_amount:
                raise ValueError("statutory adjustment lacks exact tax document")
        elif self.tax_document_id is not None:
            raise ValueError("commercial-only adjustment unexpectedly has a tax document")
        return self


_CONTEXT_HEADER_SQL = {
    "sales": """
      SELECT invoice.id original_document_id, invoice.invoice_number original_document_number,
             invoice.invoice_date original_document_date, invoice.branch_id, customer.party_id,
             customer.id party_account_id, party.legal_name party_name, item.id original_open_item_id,
             item.principal_amount original_open_item_principal,
             item.principal_amount-coalesce(allocation_total.amount,0) original_open_item_outstanding,
             invoice.currency_code, invoice.supply_type, invoice.zero_rated_payment_mode,
             invoice.tax_charge_mechanism,
             invoice.rounding_policy,
             pg_catalog.jsonb_build_object(
               'kind',invoice.document_discount_kind,
               'basis',invoice.document_discount_basis,
               'value',invoice.document_discount_value
             ) document_discount
        FROM sales.invoices invoice
        JOIN parties.customer_accounts customer ON customer.org_id=invoice.org_id AND customer.id=invoice.customer_account_id
        JOIN parties.parties party ON party.org_id=customer.org_id AND party.id=customer.party_id
        JOIN finance.accounting_events event ON event.org_id=invoice.org_id AND event.sales_invoice_id=invoice.id AND event.event_type='sales_invoice'
        JOIN finance.open_items item ON item.org_id=event.org_id AND item.accounting_event_id=event.id AND item.item_side='receivable' AND item.status IN ('open','partially_settled')
        JOIN tax.documents tax ON tax.org_id=invoice.org_id AND tax.sales_invoice_id=invoice.id
          AND tax.document_effect='original' AND tax.currency_code=invoice.currency_code
          AND tax.supply_type=invoice.supply_type
          AND tax.zero_rated_payment_mode=invoice.zero_rated_payment_mode
          AND tax.tax_charge_mechanism=invoice.tax_charge_mechanism
        LEFT JOIN LATERAL (
          SELECT sum(allocation.amount) amount
            FROM finance.allocations allocation
           WHERE allocation.org_id=item.org_id AND allocation.open_item_id=item.id
             AND allocation.status='posted' AND allocation.reversal_of_allocation_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal
               WHERE reversal.org_id=allocation.org_id
                 AND reversal.reversal_of_allocation_id=allocation.id
                 AND reversal.status='reversed')
        ) allocation_total ON true
       WHERE invoice.org_id=:org_id AND invoice.id=:document_id AND invoice.status='posted'
         AND invoice.invoice_type='tax_invoice' AND invoice.currency_code='INR'
         AND invoice.zero_rated_payment_mode='not_applicable'
         AND invoice.tax_charge_mechanism='normal'
         AND (:organization_scope OR invoice.branch_id=ANY(CAST(:branch_ids AS uuid[])))
    """,
    "purchase": """
      SELECT invoice.id original_document_id, invoice.supplier_invoice_number original_document_number,
             invoice.supplier_invoice_date original_document_date, invoice.branch_id, supplier.party_id,
             supplier.id party_account_id, party.legal_name party_name, item.id original_open_item_id,
             item.principal_amount original_open_item_principal,
             item.principal_amount-coalesce(allocation_total.amount,0) original_open_item_outstanding,
             invoice.currency_code, invoice.supply_type, invoice.zero_rated_payment_mode,
             invoice.tax_charge_mechanism,
             invoice.rounding_policy,
             pg_catalog.jsonb_build_object(
               'kind',invoice.document_discount_kind,
               'basis',invoice.document_discount_basis,
               'value',invoice.document_discount_value
             ) document_discount
        FROM procurement.supplier_invoices invoice
        JOIN parties.supplier_accounts supplier ON supplier.org_id=invoice.org_id AND supplier.id=invoice.supplier_account_id
        JOIN parties.parties party ON party.org_id=supplier.org_id AND party.id=supplier.party_id
        JOIN finance.accounting_events event ON event.org_id=invoice.org_id AND event.supplier_invoice_id=invoice.id AND event.event_type='supplier_invoice'
        JOIN finance.open_items item ON item.org_id=event.org_id AND item.accounting_event_id=event.id AND item.item_side='payable' AND item.status IN ('open','partially_settled')
        JOIN tax.documents tax ON tax.org_id=invoice.org_id AND tax.supplier_invoice_id=invoice.id
          AND tax.document_effect='original' AND tax.currency_code=invoice.currency_code
          AND tax.supply_type=invoice.supply_type
          AND tax.zero_rated_payment_mode=invoice.zero_rated_payment_mode
          AND tax.tax_charge_mechanism=invoice.tax_charge_mechanism
        LEFT JOIN LATERAL (
          SELECT sum(allocation.amount) amount
            FROM finance.allocations allocation
           WHERE allocation.org_id=item.org_id AND allocation.open_item_id=item.id
             AND allocation.status='posted' AND allocation.reversal_of_allocation_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal
               WHERE reversal.org_id=allocation.org_id
                 AND reversal.reversal_of_allocation_id=allocation.id
                 AND reversal.status='reversed')
        ) allocation_total ON true
       WHERE invoice.org_id=:org_id AND invoice.id=:document_id AND invoice.status='posted'
         AND invoice.currency_code='INR'
         AND invoice.zero_rated_payment_mode='not_applicable'
         AND invoice.tax_charge_mechanism='normal'
         AND (:organization_scope OR invoice.branch_id=ANY(CAST(:branch_ids AS uuid[])))
    """,
}


@router.get("/context", response_model=AdjustmentNoteContext)
def adjustment_note_context(
    side: Side,
    document_id: UUID,
    note_date: date,
    db: Session = Depends(get_db),
    user: dict[str, Any] = FINANCE_USER,
) -> AdjustmentNoteContext:
    org_id, organization_scope, branch_ids = _activate(db, user)
    params = {"org_id": org_id, "document_id": document_id, "note_date": note_date,
              "organization_scope": organization_scope, "branch_ids": branch_ids}
    header = db.execute(text(_CONTEXT_HEADER_SQL[side]), params).mappings().one_or_none()
    if header is None or Decimal(str(header["original_open_item_outstanding"])) <= 0:
        raise HTTPException(status_code=404, detail="Posted source with an outstanding open item was not found")
    table, source_fk = (("sales.invoice_lines", "sales_invoice_id") if side == "sales" else ("procurement.supplier_invoice_lines", "supplier_invoice_id"))
    line_sql = f"""
      SELECT source.id original_line_id,source.line_number,source.product_id,product.name product_name,product.sku,
             source.uom_code,source.uom_conversion_factor,source.billed_quantity original_billed_quantity,
             source.free_quantity original_free_quantity,
             coalesce(adjusted.billed_quantity,0) net_decreased_billed_quantity,
             coalesce(adjusted.free_quantity,0) net_decreased_free_quantity,
             source.billed_quantity-coalesce(adjusted.billed_quantity,0) remaining_billed_quantity,
             source.free_quantity-coalesce(adjusted.free_quantity,0) remaining_free_quantity,
             source.quoted_unit_rate,source.price_basis,
             pg_catalog.jsonb_build_object(
               'kind',source.line_discount_kind,
               'basis',source.line_discount_basis,
               'value',source.line_discount_value
             ) line_discount,
             source.document_discount_eligible,source.free_supply_tax_treatment,
             source.tax_charge_mechanism,source.tax_classification_code_snapshot,
             source.tax_code_version_id,source.taxability_snapshot,
             source.cgst_rate,source.sgst_rate,source.igst_rate,source.cess_rate
        FROM {table} source JOIN catalog.products product ON product.org_id=source.org_id AND product.id=source.product_id
        LEFT JOIN LATERAL (
          SELECT
            coalesce(sum(CASE note.document_effect WHEN 'decrease' THEN line.billed_quantity ELSE -line.billed_quantity END) FILTER (WHERE note.status='posted'),0) billed_quantity,
            coalesce(sum(CASE note.document_effect WHEN 'decrease' THEN line.free_quantity ELSE -line.free_quantity END) FILTER (WHERE note.status='posted'),0) free_quantity
            FROM finance.adjustment_note_lines line
            JOIN finance.adjustment_notes note
              ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
           WHERE line.org_id=source.org_id
             AND {('line.sales_invoice_line_id' if side == 'sales' else 'line.supplier_invoice_line_id')}=source.id
        ) adjusted ON true
       WHERE source.org_id=:org_id AND source.{source_fk}=:document_id AND source.line_kind='product'
         AND source.billed_quantity+source.free_quantity>
           coalesce(adjusted.billed_quantity,0)+coalesce(adjusted.free_quantity,0)
       ORDER BY source.line_number,source.id
    """
    lines = db.execute(text(line_sql), params).mappings().all()
    direction = "credit" if side == "sales" else "debit"
    rules = db.execute(text("""
      SELECT id,reason_code,tax_effect gst_tax_treatment,deadline_policy,deadline_days,
             effective_from,effective_to,rule_version
        FROM tax.gst_adjustment_rule_versions
       WHERE status='active' AND side=:side AND direction=:direction AND document_effect='decrease'
         AND effective_from<=:note_date AND (effective_to IS NULL OR effective_to>=:note_date)
       ORDER BY reason_code,tax_effect,id
    """), {**params, "side": side, "direction": direction}).mappings().all()
    return AdjustmentNoteContext(**dict(header), side=side, direction=direction,
                                 document_effect="decrease", lines=[dict(row) for row in lines],
                                 rule_choices=[dict(row) for row in rules])


@router.get("/{note_id}", response_model=AdjustmentNoteReadback)
def adjustment_note_readback(
    note_id: UUID,
    db: Session = Depends(get_db),
    user: dict[str, Any] = FINANCE_USER,
) -> AdjustmentNoteReadback:
    org_id, organization_scope, branch_ids = _activate(db, user)
    return load_adjustment_note_readback(
        note_id=note_id,
        db=db,
        org_id=org_id,
        organization_scope=organization_scope,
        branch_ids=branch_ids,
    )


def load_adjustment_note_readback(
    *,
    note_id: UUID,
    db: Session,
    org_id: UUID,
    organization_scope: bool,
    branch_ids: list[UUID],
) -> AdjustmentNoteReadback:
    """Authoritative posted projection shared by REST and MCP transports."""

    params = {"org_id": org_id, "note_id": note_id, "organization_scope": organization_scope, "branch_ids": branch_ids}
    row = db.execute(text("""
      SELECT note.id,note.note_number,note.note_date,note.side,note.direction,note.document_effect,note.status,
             coalesce(note.sales_invoice_id,note.supplier_invoice_id) original_document_id,note.party_id,
             note.gst_tax_treatment,note.counterparty_payable_amount,note.posted_at,tax.id tax_document_id,
             tax.counterparty_payable_amount tax_document_total,event.id accounting_event_id,event.journal_entry_id,
             journal.transaction_debit_total journal_debit_total,journal.transaction_credit_total journal_credit_total,
             sum(jline.transaction_debit) journal_line_debit_total,sum(jline.transaction_credit) journal_line_credit_total,
             coalesce((SELECT sum(a.amount) FROM finance.allocations a WHERE a.org_id=note.org_id
               AND a.adjustment_note_id=note.id AND a.status='posted' AND a.reversal_of_allocation_id IS NULL
               AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=a.org_id
                 AND reversal.reversal_of_allocation_id=a.id AND reversal.status='reversed')),0) allocated_amount,
             coalesce((SELECT sum(item.principal_amount) FROM finance.open_items item WHERE item.org_id=event.org_id AND item.accounting_event_id=event.id AND item.status<>'reversed'),0) residual_open_item_amount
        FROM finance.adjustment_notes note
        JOIN finance.accounting_events event ON event.org_id=note.org_id AND event.adjustment_note_id=note.id AND event.event_type='adjustment_note'
        JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id AND journal.status='posted'
        JOIN finance.journal_lines jline ON jline.org_id=journal.org_id AND jline.journal_entry_id=journal.id
        LEFT JOIN tax.documents tax ON tax.org_id=note.org_id AND tax.adjustment_note_id=note.id AND tax.document_class='adjustment_note'
        LEFT JOIN sales.invoices sinv ON sinv.org_id=note.org_id AND sinv.id=note.sales_invoice_id
        LEFT JOIN procurement.supplier_invoices pinv ON pinv.org_id=note.org_id AND pinv.id=note.supplier_invoice_id
       WHERE note.org_id=:org_id AND note.id=:note_id AND note.status='posted'
         AND note.sales_return_id IS NULL AND note.purchase_return_id IS NULL
         AND (:organization_scope OR coalesce(sinv.branch_id,pinv.branch_id)=ANY(CAST(:branch_ids AS uuid[])))
       GROUP BY note.id,tax.id,event.id,journal.id
    """), params).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Posted standalone adjustment note was not found")
    lines = db.execute(text("""
      SELECT line.id,line.line_number,coalesce(line.sales_invoice_line_id,line.supplier_invoice_line_id) original_line_id,
             line.product_id,line.billed_quantity,line.free_quantity,line.net_value_amount,line.gst_taxable_value,
             line.cgst_amount,line.sgst_amount,line.igst_amount,line.cess_amount,line.line_total
        FROM finance.adjustment_note_lines line
       WHERE line.org_id=:org_id AND line.adjustment_note_id=:note_id ORDER BY line.line_number,line.id
    """), params).mappings().all()
    return AdjustmentNoteReadback(**dict(row), lines=[dict(item) for item in lines])
