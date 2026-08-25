"""Canonical source projections and posted readback for ERP returns.

These endpoints intentionally expose the same UUID lineage and fixed-precision
facts consumed by the reviewed return command resolvers.  They never infer a
batch, location, billed/free split, address, or statutory evidence choice.
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
from .web_operator_actions import (
    WEB_CLIENT_ID,
    _command_context,
    _uuid,
    _web_user,
)


router = APIRouter(
    prefix="/canonical/returns",
    tags=["Canonical ERP Returns"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)
SALES_USER = Depends(PermissionChecker("sales", "view"))
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


def _one(db: Session, sql: str, params: dict[str, Any]) -> Optional[dict[str, Any]]:
    row = db.execute(text(sql), params).mappings().one_or_none()
    return dict(row) if row is not None else None


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params).mappings().all()]


class StrictRead(BaseModel):
    model_config = ConfigDict(extra="forbid")


ReturnCommandStatus = Literal[
    "prepared",
    "pending_approval",
    "approved",
    "executing",
    "succeeded",
    "failed",
    "rejected",
    "expired",
    "cancelled",
]


class ReturnCommandSummary(StrictRead):
    model_config = ConfigDict(extra="forbid", strict=True)

    command_request_id: UUID
    command_type: Literal["sales.return.post", "procurement.purchase_return.post"]
    return_kind: Literal["sales", "purchase"]
    status: ReturnCommandStatus
    branch_id: UUID
    requested_by_membership_id: UUID
    requester_name: str
    created_at: datetime
    expires_at: datetime
    approved_at: Optional[datetime]
    executed_at: Optional[datetime]
    resource_type: Optional[Literal["sales_return", "purchase_return"]]
    resource_id: Optional[UUID]
    failure_code: Optional[str]
    failure_message: Optional[str]


class ReturnCommandDetail(ReturnCommandSummary):
    preview_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    resolved_references: list[dict[str, Any]]
    source_versions: list[dict[str, Any]]
    calculation_ruleset: list[dict[str, Any]]
    inventory_impact: list[dict[str, Any]]
    financial_impact: list[dict[str, Any]]
    tax_impact: list[dict[str, Any]]
    policy_warnings: list[dict[str, Any]]
    required_approvals: list[dict[str, Any]]


class ReturnLocation(StrictRead):
    id: UUID
    code: str
    name: str
    location_type: Literal["quarantine", "saleable", "cold_storage"]
    allows_sale: bool


class ReturnAttachmentEvidence(StrictRead):
    id: UUID
    original_filename: str
    document_date: Optional[date]
    status: Literal["verified", "retained"]
    verified_at: datetime


class ReturnReasonChoice(StrictRead):
    reason_code: str = Field(min_length=1, max_length=64)
    supported_gst_treatments: list[Literal["commercial_only", "statutory"]]

    @model_validator(mode="after")
    def require_distinct_treatments(self):
        if not self.supported_gst_treatments:
            raise ValueError("return reason has no executable GST treatment")
        if len(set(self.supported_gst_treatments)) != len(self.supported_gst_treatments):
            raise ValueError("return reason repeats a GST treatment")
        return self


def _effective_return_reason_choices(
    db: Session,
    *,
    return_date: date,
    side: Literal["sales", "purchase"],
    statutory_evidence_available: bool,
) -> list[ReturnReasonChoice]:
    direction = "credit" if side == "sales" else "debit"
    rows = _rows(
        db,
        """
        WITH exact_effective_rules AS (
            SELECT rule.reason_code, rule.tax_effect
              FROM tax.gst_adjustment_rule_versions rule
              JOIN core.reference_data_releases release
                ON release.id=rule.release_id
               AND release.dataset_kind='gst_adjustment_rules'
               AND release.status='active'
             WHERE rule.status='active' AND rule.side=:side
               AND rule.direction=:direction AND rule.document_effect='decrease'
               AND rule.effective_from<=:return_date
               AND (rule.effective_to IS NULL OR rule.effective_to>=:return_date)
             GROUP BY rule.reason_code, rule.tax_effect
            HAVING count(*)=1
        )
        SELECT reason_code,
               array_agg(
                   tax_effect ORDER BY CASE tax_effect
                       WHEN 'commercial_only' THEN 1
                       WHEN 'statutory' THEN 2
                   END
               ) AS supported_gst_treatments
          FROM exact_effective_rules
         WHERE tax_effect='commercial_only'
            OR (:statutory_evidence_available AND tax_effect='statutory')
         GROUP BY reason_code
         ORDER BY reason_code
        """,
        {
            "side": side,
            "direction": direction,
            "return_date": return_date,
            "statutory_evidence_available": statutory_evidence_available,
        },
    )
    return [ReturnReasonChoice.model_validate(row) for row in rows]


class SalesReturnableAllocation(StrictRead):
    original_invoice_line_id: UUID
    invoice_dispatch_allocation_id: UUID
    dispatch_id: UUID
    dispatch_line_id: UUID
    product_id: UUID
    product_name: str
    sku: str
    batch_id: UUID
    batch_number: str
    expires_on: Optional[date]
    uom_code: str
    uom_conversion_factor: Decimal = Field(gt=0)
    allocated_base_billed_quantity: Decimal = Field(ge=0)
    allocated_base_free_quantity: Decimal = Field(ge=0)
    returned_base_billed_quantity: Decimal = Field(ge=0)
    returned_base_free_quantity: Decimal = Field(ge=0)
    remaining_base_billed_quantity: Decimal = Field(ge=0)
    remaining_base_free_quantity: Decimal = Field(ge=0)
    returnable_billed_quantity: Decimal = Field(ge=0)
    returnable_free_quantity: Decimal = Field(ge=0)
    quoted_unit_rate: Decimal = Field(ge=0)
    cgst_rate: Decimal = Field(ge=0)
    sgst_rate: Decimal = Field(ge=0)
    igst_rate: Decimal = Field(ge=0)
    cess_rate: Decimal = Field(ge=0)
    hsn_code: str

    @model_validator(mode="after")
    def reconcile_remaining(self):
        if (
            self.allocated_base_billed_quantity
            - self.returned_base_billed_quantity
            != self.remaining_base_billed_quantity
            or self.allocated_base_free_quantity
            - self.returned_base_free_quantity
            != self.remaining_base_free_quantity
            or self.returnable_billed_quantity * self.uom_conversion_factor
            != self.remaining_base_billed_quantity
            or self.returnable_free_quantity * self.uom_conversion_factor
            != self.remaining_base_free_quantity
        ):
            raise ValueError("sales returnable quantities do not reconcile")
        if self.remaining_base_billed_quantity + self.remaining_base_free_quantity <= 0:
            raise ValueError("sales allocation is already fully returned")
        return self


class SalesReturnContext(StrictRead):
    invoice_id: UUID
    invoice_number: str
    invoice_date: date
    branch_id: UUID
    customer_account_id: UUID
    customer_name: str
    customer_registered: bool
    return_date: date
    lines: list[SalesReturnableAllocation]
    quarantine_locations: list[ReturnLocation]
    statutory_itc_reversal_evidence: list[ReturnAttachmentEvidence]
    return_reason_choices: list[ReturnReasonChoice]
    approval_policy: Literal["separate_approver"] = "separate_approver"

    @model_validator(mode="after")
    def require_complete_source(self):
        if not self.lines:
            raise ValueError("invoice has no dispatch-allocated quantity remaining")
        if not self.quarantine_locations:
            raise ValueError("branch has no active non-saleable quarantine location")
        if not self.return_reason_choices:
            raise ValueError("sales return has no exact effective GST adjustment authority")
        if len({choice.reason_code for choice in self.return_reason_choices}) != len(self.return_reason_choices):
            raise ValueError("sales return repeats an effective reason code")
        statutory_available = self.customer_registered and bool(self.statutory_itc_reversal_evidence)
        if not statutory_available and any(
            "statutory" in choice.supported_gst_treatments
            for choice in self.return_reason_choices
        ):
            raise ValueError("sales return exposes statutory treatment without exact evidence")
        return self


class SupplierAddress(StrictRead):
    id: UUID
    address_kind: Literal["registered", "shipping", "warehouse"]
    line1: str
    line2: Optional[str]
    city: str
    state_code: str
    postal_code: str


class PortalCreditNoteEvidence(StrictRead):
    id: UUID
    invoice_number: str
    invoice_date: date
    portal_reference: Optional[str]
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    total_amount: Decimal

    @model_validator(mode="after")
    def reconcile_total(self):
        if self.total_amount != (
            self.taxable_amount
            + self.cgst_amount
            + self.sgst_amount
            + self.igst_amount
            + self.cess_amount
        ):
            raise ValueError("GSTR-2B credit-note evidence does not reconcile")
        return self


class PurchaseReturnableAllocation(StrictRead):
    supplier_invoice_line_id: UUID
    supplier_invoice_receipt_allocation_id: UUID
    goods_receipt_id: UUID
    goods_receipt_line_id: UUID
    product_id: UUID
    product_name: str
    sku: str
    batch_id: UUID
    batch_number: str
    expires_on: date
    from_location_id: UUID
    from_location_code: str
    from_location_name: str
    from_location_type: Literal["saleable", "cold_storage"]
    uom_code: str
    uom_conversion_factor: Decimal = Field(gt=0)
    allocated_base_billed_quantity: Decimal = Field(ge=0)
    allocated_base_free_quantity: Decimal = Field(ge=0)
    returned_base_billed_quantity: Decimal = Field(ge=0)
    returned_base_free_quantity: Decimal = Field(ge=0)
    remaining_base_billed_quantity: Decimal = Field(ge=0)
    remaining_base_free_quantity: Decimal = Field(ge=0)
    returnable_billed_quantity: Decimal = Field(ge=0)
    returnable_free_quantity: Decimal = Field(ge=0)
    stock_on_hand_base_quantity: Decimal = Field(ge=0)
    average_unit_cost: Decimal = Field(gt=0)
    quoted_unit_rate: Decimal = Field(ge=0)
    cgst_rate: Decimal = Field(ge=0)
    sgst_rate: Decimal = Field(ge=0)
    igst_rate: Decimal = Field(ge=0)
    cess_rate: Decimal = Field(ge=0)
    hsn_code: str

    @model_validator(mode="after")
    def reconcile_remaining(self):
        if (
            self.allocated_base_billed_quantity
            - self.returned_base_billed_quantity
            != self.remaining_base_billed_quantity
            or self.allocated_base_free_quantity
            - self.returned_base_free_quantity
            != self.remaining_base_free_quantity
            or self.returnable_billed_quantity * self.uom_conversion_factor
            != self.remaining_base_billed_quantity
            or self.returnable_free_quantity * self.uom_conversion_factor
            != self.remaining_base_free_quantity
        ):
            raise ValueError("purchase returnable quantities do not reconcile")
        if self.remaining_base_billed_quantity + self.remaining_base_free_quantity <= 0:
            raise ValueError("purchase allocation is already fully returned")
        return self


class PurchaseReturnContext(StrictRead):
    supplier_invoice_id: UUID
    supplier_invoice_number: str
    supplier_invoice_date: date
    branch_id: UUID
    supplier_account_id: UUID
    supplier_name: str
    return_date: date
    lines: list[PurchaseReturnableAllocation]
    supplier_destinations: list[SupplierAddress]
    statutory_gstr2b_credit_notes: list[PortalCreditNoteEvidence]
    return_reason_choices: list[ReturnReasonChoice]
    approval_policy: Literal["separate_approver"] = "separate_approver"

    @model_validator(mode="after")
    def require_complete_source(self):
        if not self.lines:
            raise ValueError("supplier invoice has no returnable receipt allocation")
        if not self.supplier_destinations:
            raise ValueError("supplier has no active return destination")
        if not self.return_reason_choices:
            raise ValueError("purchase return has no exact effective GST adjustment authority")
        if len({choice.reason_code for choice in self.return_reason_choices}) != len(self.return_reason_choices):
            raise ValueError("purchase return repeats an effective reason code")
        if not self.statutory_gstr2b_credit_notes and any(
            "statutory" in choice.supported_gst_treatments
            for choice in self.return_reason_choices
        ):
            raise ValueError("purchase return exposes statutory treatment without exact evidence")
        return self


class PostedReturnLine(StrictRead):
    return_line_id: UUID
    source_line_id: UUID
    source_allocation_id: UUID
    product_id: UUID
    batch_id: UUID
    location_id: UUID
    billed_quantity: Decimal
    free_quantity: Decimal
    base_billed_quantity: Decimal
    base_free_quantity: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    line_total: Decimal
    inventory_document_line_id: UUID
    inventory_base_quantity: Decimal
    inventory_extended_cost: Decimal
    stock_ledger_entry_id: UUID
    stock_quantity_delta: Decimal
    stock_value_delta: Decimal


class PostedReturnAllocation(StrictRead):
    allocation_id: UUID
    open_item_id: UUID
    amount: Decimal = Field(gt=0)


class PostedReturnReadback(StrictRead):
    return_id: UUID
    return_number: str
    return_date: date
    status: Literal["posted"]
    source_document_id: UUID
    branch_id: UUID
    party_account_id: UUID
    gst_tax_treatment: Literal["commercial_only", "statutory"]
    net_value_total: Decimal
    gst_taxable_total: Decimal
    cgst_total: Decimal
    sgst_total: Decimal
    igst_total: Decimal
    cess_total: Decimal
    rounding_adjustment: Decimal
    grand_total: Decimal
    adjustment_note_id: UUID
    adjustment_note_number: str
    adjustment_note_total: Decimal
    tax_document_id: Optional[UUID]
    tax_document_total: Optional[Decimal]
    inventory_document_id: UUID
    inventory_direction: Literal["receipt", "issue"]
    inventory_total_base_quantity: Decimal
    inventory_total_value: Decimal
    journal_entry_id: UUID
    journal_debit_total: Decimal
    journal_credit_total: Decimal
    journal_line_debit_total: Decimal
    journal_line_credit_total: Decimal
    residual_open_item_amount: Decimal = Field(ge=0)
    lines: list[PostedReturnLine]
    allocations: list[PostedReturnAllocation]

    @model_validator(mode="after")
    def reconcile_posted_impacts(self):
        if not self.lines:
            raise ValueError("posted return has no line evidence")
        if self.adjustment_note_total != self.grand_total:
            raise ValueError("adjustment note does not reconcile to return")
        if self.journal_debit_total != self.journal_credit_total:
            raise ValueError("journal header is not balanced")
        if (
            self.journal_line_debit_total != self.journal_debit_total
            or self.journal_line_credit_total != self.journal_credit_total
        ):
            raise ValueError("journal lines do not reconcile to header")
        if self.gst_tax_treatment == "statutory":
            if self.tax_document_id is None or self.tax_document_total != self.grand_total:
                raise ValueError("statutory return lacks matching tax document")
        elif self.tax_document_id is not None or any(
            value != 0
            for value in (
                self.gst_taxable_total,
                self.cgst_total,
                self.sgst_total,
                self.igst_total,
                self.cess_total,
            )
        ):
            raise ValueError("commercial-only return altered GST")
        line_base = sum(
            (line.base_billed_quantity + line.base_free_quantity for line in self.lines),
            Decimal("0"),
        )
        if line_base != self.inventory_total_base_quantity:
            raise ValueError("inventory quantity does not reconcile to return lines")
        expected_sign = Decimal("1") if self.inventory_direction == "receipt" else Decimal("-1")
        if any(
            line.inventory_base_quantity != line.base_billed_quantity + line.base_free_quantity
            or line.stock_quantity_delta != expected_sign * line.inventory_base_quantity
            or line.stock_value_delta != expected_sign * line.inventory_extended_cost
            for line in self.lines
        ):
            raise ValueError("stock ledger does not reconcile to return inventory lines")
        if sum((line.inventory_extended_cost for line in self.lines), Decimal("0")) != self.inventory_total_value:
            raise ValueError("inventory valuation does not reconcile to return lines")
        applied = sum((item.amount for item in self.allocations), Decimal("0"))
        if applied + self.residual_open_item_amount != self.grand_total:
            raise ValueError("open-item effects do not reconcile to return total")
        return self


@router.get(
    "/sales-invoices/{invoice_id}/context",
    response_model=SalesReturnContext,
)
def sales_return_context(
    invoice_id: UUID,
    return_date: date = Query(...),
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    header = _one(
        db,
        """
        SELECT invoice.id AS invoice_id, invoice.invoice_number,
               invoice.invoice_date, invoice.branch_id,
               invoice.customer_account_id,
               party.legal_name AS customer_name,
               EXISTS (
                   SELECT 1
                     FROM parties.tax_registrations registration
                    WHERE registration.org_id=invoice.org_id
                      AND registration.id=invoice.customer_tax_registration_id
                      AND registration.party_id=customer.party_id
                      AND registration.registration_type='GSTIN'
                      AND registration.status='active'
                      AND registration.verified_at IS NOT NULL
                      AND registration.taxpayer_type IN ('regular','casual')
                      AND (registration.valid_from IS NULL OR registration.valid_from<=:return_date)
                      AND (registration.valid_until IS NULL OR registration.valid_until>=:return_date)
               ) AS customer_registered
          FROM sales.invoices invoice
          JOIN parties.customer_accounts customer
            ON customer.org_id=invoice.org_id
           AND customer.id=invoice.customer_account_id AND customer.status='active'
          JOIN parties.parties party
            ON party.org_id=customer.org_id AND party.id=customer.party_id
           AND party.status='active'
          JOIN tax.documents original_tax
            ON original_tax.org_id=invoice.org_id
           AND original_tax.sales_invoice_id=invoice.id
           AND original_tax.direction='outward'
           AND original_tax.document_effect='original'
          JOIN tax.registrations seller_registration
            ON seller_registration.org_id=invoice.org_id
           AND seller_registration.id=original_tax.registration_id
           AND seller_registration.status='active'
           AND seller_registration.effective_from<=:return_date
           AND (seller_registration.effective_to IS NULL OR seller_registration.effective_to>=:return_date)
          JOIN tax.registration_branches seller_branch
            ON seller_branch.org_id=seller_registration.org_id
           AND seller_branch.registration_id=seller_registration.id
           AND seller_branch.branch_id=invoice.branch_id
           AND seller_branch.status='active'
           AND seller_branch.effective_from<=:return_date
           AND (seller_branch.effective_to IS NULL OR seller_branch.effective_to>=:return_date)
         WHERE invoice.org_id=:org_id AND invoice.id=:invoice_id
           AND invoice.status='posted' AND invoice.invoice_type='tax_invoice'
           AND invoice.currency_code='INR' AND invoice.tax_charge_mechanism='normal'
           AND invoice.invoice_date<=:return_date
        """,
        {"org_id": org_id, "invoice_id": invoice_id, "return_date": return_date},
    )
    if header is None:
        raise HTTPException(status_code=404, detail="Posted canonical sales invoice is not returnable")
    lines = _rows(
        db,
        """
        SELECT line.id AS original_invoice_line_id,
               allocation.id AS invoice_dispatch_allocation_id,
               dispatch.id AS dispatch_id, dispatch_line.id AS dispatch_line_id,
               line.product_id, product.name AS product_name, product.sku,
               batch.id AS batch_id, batch.batch_number, batch.expires_on,
               line.uom_code, line.uom_conversion_factor,
               allocation.allocated_base_billed_quantity,
               allocation.allocated_base_free_quantity,
               returned.base_billed AS returned_base_billed_quantity,
               returned.base_free AS returned_base_free_quantity,
               allocation.allocated_base_billed_quantity-returned.base_billed
                 AS remaining_base_billed_quantity,
               allocation.allocated_base_free_quantity-returned.base_free
                 AS remaining_base_free_quantity,
               (allocation.allocated_base_billed_quantity-returned.base_billed)
                 / line.uom_conversion_factor AS returnable_billed_quantity,
               (allocation.allocated_base_free_quantity-returned.base_free)
                 / line.uom_conversion_factor AS returnable_free_quantity,
               line.quoted_unit_rate, line.cgst_rate, line.sgst_rate,
               line.igst_rate, line.cess_rate,
               line.tax_classification_code_snapshot AS hsn_code
          FROM sales.invoice_lines line
          JOIN sales.invoice_dispatch_allocations allocation
            ON allocation.org_id=line.org_id AND allocation.invoice_line_id=line.id
          JOIN sales.dispatch_lines dispatch_line
            ON dispatch_line.org_id=allocation.org_id
           AND dispatch_line.id=allocation.dispatch_line_id
          JOIN sales.dispatches dispatch
            ON dispatch.org_id=dispatch_line.org_id AND dispatch.id=dispatch_line.dispatch_id
           AND dispatch.status='posted' AND dispatch.branch_id=:branch_id
           AND dispatch.customer_account_id=:customer_account_id
          JOIN inventory.inventory_documents issue_document
            ON issue_document.org_id=dispatch.org_id
           AND issue_document.sales_dispatch_id=dispatch.id
           AND issue_document.document_type='sales_issue'
           AND issue_document.status='posted'
          JOIN inventory.inventory_document_lines issue_line
            ON issue_line.org_id=issue_document.org_id
           AND issue_line.inventory_document_id=issue_document.id
           AND issue_line.sales_dispatch_line_id=dispatch_line.id
           AND issue_line.product_id=line.product_id
           AND issue_line.base_quantity=(
                allocation.allocated_base_billed_quantity
                + allocation.allocated_base_free_quantity
           )
          JOIN inventory.stock_ledger_entries issue_ledger
            ON issue_ledger.org_id=issue_line.org_id
           AND issue_ledger.inventory_document_line_id=issue_line.id
           AND issue_ledger.entry_kind='issue'
          JOIN inventory.batches batch
            ON batch.org_id=issue_line.org_id AND batch.id=issue_line.batch_id
           AND batch.product_id=line.product_id
          JOIN catalog.products product
            ON product.org_id=line.org_id AND product.id=line.product_id
          LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(return_line.base_billed_quantity),0) AS base_billed,
                     COALESCE(SUM(return_line.base_free_quantity),0) AS base_free
                FROM sales.return_lines return_line
                JOIN sales.returns return_header
                  ON return_header.org_id=return_line.org_id
                 AND return_header.id=return_line.return_id
                 AND return_header.status='posted'
               WHERE return_line.org_id=allocation.org_id
                 AND return_line.invoice_dispatch_allocation_id=allocation.id
          ) returned ON true
         WHERE line.org_id=:org_id AND line.invoice_id=:invoice_id
           AND line.line_kind='product'
           AND 1=(
                SELECT count(*)
                  FROM inventory.inventory_document_lines exact_issue_line
                 WHERE exact_issue_line.org_id=issue_document.org_id
                   AND exact_issue_line.inventory_document_id=issue_document.id
                   AND exact_issue_line.sales_dispatch_line_id=dispatch_line.id
                   AND exact_issue_line.product_id=line.product_id
           )
           AND (allocation.allocated_base_billed_quantity>returned.base_billed
                OR allocation.allocated_base_free_quantity>returned.base_free)
         ORDER BY line.line_number, allocation.id
        """,
        {
            "org_id": org_id,
            "invoice_id": invoice_id,
            "branch_id": header["branch_id"],
            "customer_account_id": header["customer_account_id"],
        },
    )
    locations = _rows(
        db,
        """
        SELECT id, code, name, location_type, allows_sale
          FROM inventory.locations
         WHERE org_id=:org_id AND branch_id=:branch_id AND status='active'
           AND location_type='quarantine' AND allows_sale=false
         ORDER BY code, id
        """,
        {"org_id": org_id, "branch_id": header["branch_id"]},
    )
    evidence = _rows(
        db,
        """
        SELECT id, original_filename, document_date, status, verified_at
          FROM core.attachments
         WHERE org_id=:org_id AND evidence_kind='recipient_itc_reversal'
           AND status IN ('verified','retained') AND verified_at IS NOT NULL
           AND verified_at<=transaction_timestamp()
         ORDER BY verified_at DESC, id
        """,
        {"org_id": org_id},
    )
    reason_choices = _effective_return_reason_choices(
        db,
        return_date=return_date,
        side="sales",
        statutory_evidence_available=bool(header["customer_registered"] and evidence),
    )
    if not reason_choices:
        raise HTTPException(
            status_code=409,
            detail="No exact effective GST adjustment rule permits this sales return date",
        )
    return SalesReturnContext.model_validate(
        {
            **header,
            "return_date": return_date,
            "lines": lines,
            "quarantine_locations": locations,
            "statutory_itc_reversal_evidence": evidence,
            "return_reason_choices": reason_choices,
        }
    )


@router.get(
    "/supplier-invoices/{invoice_id}/context",
    response_model=PurchaseReturnContext,
)
def purchase_return_context(
    invoice_id: UUID,
    return_date: date = Query(...),
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    org_id = _activate(db, user)
    header = _one(
        db,
        """
        SELECT invoice.id AS supplier_invoice_id,
               invoice.supplier_invoice_number, invoice.supplier_invoice_date,
               invoice.branch_id, invoice.supplier_account_id,
               party.id AS supplier_party_id,
               party.legal_name AS supplier_name,
               original_tax.registration_id AS buyer_registration_id,
               original_tax.counterparty_gstin AS supplier_gstin,
               original_tax.place_of_supply_state_code
          FROM procurement.supplier_invoices invoice
          JOIN parties.supplier_accounts supplier
            ON supplier.org_id=invoice.org_id
           AND supplier.id=invoice.supplier_account_id AND supplier.status='active'
          JOIN parties.parties party
            ON party.org_id=supplier.org_id AND party.id=supplier.party_id
           AND party.status='active'
          JOIN tax.documents original_tax
            ON original_tax.org_id=invoice.org_id
           AND original_tax.supplier_invoice_id=invoice.id
           AND original_tax.direction='inward'
           AND original_tax.document_effect='original'
          JOIN tax.registrations buyer_registration
            ON buyer_registration.org_id=invoice.org_id
           AND buyer_registration.id=original_tax.registration_id
           AND buyer_registration.status='active'
           AND buyer_registration.effective_from<=:return_date
           AND (buyer_registration.effective_to IS NULL OR buyer_registration.effective_to>=:return_date)
          JOIN tax.registration_branches buyer_branch
            ON buyer_branch.org_id=buyer_registration.org_id
           AND buyer_branch.registration_id=buyer_registration.id
           AND buyer_branch.branch_id=invoice.branch_id
           AND buyer_branch.status='active'
           AND buyer_branch.effective_from<=:return_date
           AND (buyer_branch.effective_to IS NULL OR buyer_branch.effective_to>=:return_date)
          JOIN parties.tax_registrations supplier_registration
            ON supplier_registration.org_id=invoice.org_id
           AND supplier_registration.id=invoice.supplier_tax_registration_id
           AND supplier_registration.party_id=party.id
           AND supplier_registration.registration_type='GSTIN'
           AND supplier_registration.registration_number=original_tax.counterparty_gstin
           AND supplier_registration.status='active'
           AND supplier_registration.verified_at IS NOT NULL
           AND supplier_registration.taxpayer_type IN ('regular','casual')
           AND (supplier_registration.valid_from IS NULL OR supplier_registration.valid_from<=:return_date)
           AND (supplier_registration.valid_until IS NULL OR supplier_registration.valid_until>=:return_date)
         WHERE invoice.org_id=:org_id AND invoice.id=:invoice_id
           AND invoice.status='posted' AND invoice.currency_code='INR'
           AND invoice.supply_type IN ('intra_state','inter_state')
           AND invoice.zero_rated_payment_mode='not_applicable'
           AND invoice.tax_charge_mechanism='normal'
           AND invoice.supplier_invoice_date<=:return_date
        """,
        {"org_id": org_id, "invoice_id": invoice_id, "return_date": return_date},
    )
    if header is None:
        raise HTTPException(status_code=404, detail="Posted canonical supplier invoice is not returnable")
    lines = _rows(
        db,
        """
        SELECT invoice_line.id AS supplier_invoice_line_id,
               allocation.id AS supplier_invoice_receipt_allocation_id,
               receipt.id AS goods_receipt_id,
               receipt_line.id AS goods_receipt_line_id,
               invoice_line.product_id, product.name AS product_name, product.sku,
               batch.id AS batch_id, batch.batch_number, batch.expires_on,
               location.id AS from_location_id, location.code AS from_location_code,
               location.name AS from_location_name,
               location.location_type AS from_location_type,
               invoice_line.uom_code, invoice_line.uom_conversion_factor,
               allocation.allocated_base_billed_quantity,
               allocation.allocated_base_free_quantity,
               returned.base_billed AS returned_base_billed_quantity,
               returned.base_free AS returned_base_free_quantity,
               allocation.allocated_base_billed_quantity-returned.base_billed
                 AS remaining_base_billed_quantity,
               allocation.allocated_base_free_quantity-returned.base_free
                 AS remaining_base_free_quantity,
               (allocation.allocated_base_billed_quantity-returned.base_billed)
                 / invoice_line.uom_conversion_factor AS returnable_billed_quantity,
               (allocation.allocated_base_free_quantity-returned.base_free)
                 / invoice_line.uom_conversion_factor AS returnable_free_quantity,
               balance.on_hand_quantity AS stock_on_hand_base_quantity,
               balance.average_unit_cost,
               invoice_line.quoted_unit_rate, invoice_line.cgst_rate,
               invoice_line.sgst_rate, invoice_line.igst_rate, invoice_line.cess_rate,
               invoice_line.tax_classification_code_snapshot AS hsn_code
          FROM procurement.supplier_invoice_lines invoice_line
          JOIN procurement.supplier_invoice_receipt_allocations allocation
            ON allocation.org_id=invoice_line.org_id
           AND allocation.supplier_invoice_line_id=invoice_line.id
          JOIN procurement.goods_receipt_lines receipt_line
            ON receipt_line.org_id=allocation.org_id
           AND receipt_line.id=allocation.goods_receipt_line_id
           AND receipt_line.product_id=invoice_line.product_id
           AND receipt_line.uom_code=invoice_line.uom_code
          JOIN procurement.goods_receipts receipt
            ON receipt.org_id=receipt_line.org_id
           AND receipt.id=receipt_line.goods_receipt_id
           AND receipt.status='posted' AND receipt.branch_id=:branch_id
           AND receipt.supplier_account_id=:supplier_account_id
          JOIN inventory.inventory_documents receipt_document
            ON receipt_document.org_id=receipt.org_id
           AND receipt_document.goods_receipt_id=receipt.id
           AND receipt_document.document_type='purchase_receipt'
           AND receipt_document.status='posted'
          JOIN inventory.inventory_document_lines receipt_inventory_line
            ON receipt_inventory_line.org_id=receipt_document.org_id
           AND receipt_inventory_line.inventory_document_id=receipt_document.id
           AND receipt_inventory_line.goods_receipt_line_id=receipt_line.id
           AND receipt_inventory_line.product_id=receipt_line.product_id
           AND receipt_inventory_line.batch_id=receipt_line.batch_id
           AND receipt_inventory_line.to_location_id=receipt_line.location_id
          JOIN inventory.batches batch
            ON batch.org_id=receipt_line.org_id AND batch.id=receipt_line.batch_id
           AND batch.product_id=invoice_line.product_id
           AND batch.lot_kind='manufacturer_batch' AND batch.status='released'
           AND batch.released_at IS NOT NULL AND batch.expires_on>:return_date
          JOIN inventory.locations location
            ON location.org_id=receipt_line.org_id AND location.id=receipt_line.location_id
           AND location.branch_id=:branch_id AND location.status='active'
           AND location.allows_sale=true
           AND location.location_type IN ('saleable','cold_storage')
          JOIN inventory.stock_balances balance
            ON balance.org_id=location.org_id AND balance.location_id=location.id
           AND balance.product_id=invoice_line.product_id AND balance.batch_id=batch.id
           AND balance.on_hand_quantity>0 AND balance.average_unit_cost>0
          JOIN catalog.products product
            ON product.org_id=invoice_line.org_id AND product.id=invoice_line.product_id
          LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(return_line.base_billed_quantity),0) AS base_billed,
                     COALESCE(SUM(return_line.base_free_quantity),0) AS base_free
                FROM procurement.purchase_return_lines return_line
                JOIN procurement.purchase_returns return_header
                  ON return_header.org_id=return_line.org_id
                 AND return_header.id=return_line.purchase_return_id
                 AND return_header.status='posted'
               WHERE return_line.org_id=allocation.org_id
                 AND return_line.supplier_invoice_receipt_allocation_id=allocation.id
          ) returned ON true
         WHERE invoice_line.org_id=:org_id
           AND invoice_line.supplier_invoice_id=:invoice_id
           AND invoice_line.line_kind='product'
           AND invoice_line.inventory_cost_treatment='capitalize'
           AND invoice_line.itc_eligibility='eligible'
           AND invoice_line.tax_charge_mechanism='normal'
           AND (allocation.allocated_base_billed_quantity>returned.base_billed
                OR allocation.allocated_base_free_quantity>returned.base_free)
         ORDER BY invoice_line.line_number, allocation.id
        """,
        {
            "org_id": org_id,
            "invoice_id": invoice_id,
            "branch_id": header["branch_id"],
            "supplier_account_id": header["supplier_account_id"],
            "return_date": return_date,
        },
    )
    addresses = _rows(
        db,
        """
        SELECT id, address_kind, line1, line2, city, state_code, postal_code
          FROM parties.addresses
         WHERE org_id=:org_id AND party_id=:party_id
           AND address_kind IN ('registered','shipping','warehouse')
           AND status='active' AND valid_from<=:return_date
           AND (valid_until IS NULL OR valid_until>=:return_date)
         ORDER BY is_primary DESC, address_kind, id
        """,
        {"org_id": org_id, "party_id": header["supplier_party_id"], "return_date": return_date},
    )
    portal = _rows(
        db,
        """
        SELECT line.id, line.invoice_number, line.invoice_date,
               line.portal_reference, line.taxable_amount, line.cgst_amount,
               line.sgst_amount, line.igst_amount, line.cess_amount,
               line.total_amount
          FROM tax.portal_document_lines line
          JOIN tax.portal_documents document
            ON document.org_id=line.org_id AND document.id=line.portal_document_id
           AND document.portal_document_type='gstr2b'
           AND document.status='parsed'
           AND document.registration_id=:registration_id
         WHERE line.org_id=:org_id AND line.document_type='credit_note'
           AND line.supplier_gstin=:supplier_gstin
           AND line.place_of_supply_state_code=:place_of_supply_state_code
           AND NOT EXISTS (
                SELECT 1
                  FROM tax.portal_document_lines duplicate_line
                  JOIN tax.portal_documents duplicate_document
                    ON duplicate_document.org_id=duplicate_line.org_id
                   AND duplicate_document.id=duplicate_line.portal_document_id
                   AND duplicate_document.portal_document_type='gstr2b'
                   AND duplicate_document.status='parsed'
                   AND duplicate_document.registration_id=:registration_id
                 WHERE duplicate_line.org_id=line.org_id
                   AND duplicate_line.id<>line.id
                   AND ROW(
                        duplicate_line.supplier_gstin,
                        duplicate_line.invoice_number,
                        duplicate_line.invoice_date,
                        duplicate_line.place_of_supply_state_code
                   ) IS NOT DISTINCT FROM ROW(
                        line.supplier_gstin,
                        line.invoice_number,
                        line.invoice_date,
                        line.place_of_supply_state_code
                   )
           )
         ORDER BY line.invoice_date DESC, line.id
        """,
        {
            "org_id": org_id,
            "registration_id": header["buyer_registration_id"],
            "supplier_gstin": header["supplier_gstin"],
            "place_of_supply_state_code": header["place_of_supply_state_code"],
        },
    )
    reason_choices = _effective_return_reason_choices(
        db,
        return_date=return_date,
        side="purchase",
        statutory_evidence_available=bool(portal),
    )
    if not reason_choices:
        raise HTTPException(
            status_code=409,
            detail="No exact effective GST adjustment rule permits this purchase return date",
        )
    public_header = {
        key: value
        for key, value in header.items()
        if key not in {
            "supplier_party_id",
            "buyer_registration_id",
            "supplier_gstin",
            "place_of_supply_state_code",
        }
    }
    return PurchaseReturnContext.model_validate(
        {
            **public_header,
            "return_date": return_date,
            "lines": lines,
            "supplier_destinations": addresses,
            "statutory_gstr2b_credit_notes": portal,
            "return_reason_choices": reason_choices,
        }
    )


def _posted_return_readback(
    db: Session,
    org_id: UUID,
    return_id: UUID,
    *,
    side: Literal["sales", "purchase"],
) -> PostedReturnReadback:
    if side == "sales":
        header_table = "sales.returns"
        line_table = "sales.return_lines"
        return_fk = "return_id"
        source_document = "invoice_id"
        party_account = "customer_account_id"
        number_field = "return_number"
        source_line = "invoice_line_id"
        source_allocation = "invoice_dispatch_allocation_id"
        location = "disposition_location_id"
        inventory_line_fk = "sales_return_line_id"
        inventory_sign = 1
        note_fk = "sales_return_id"
        document_type = "sales_return_receipt"
    else:
        header_table = "procurement.purchase_returns"
        line_table = "procurement.purchase_return_lines"
        return_fk = "purchase_return_id"
        source_document = "supplier_invoice_id"
        party_account = "supplier_account_id"
        number_field = "purchase_return_number"
        source_line = "goods_receipt_line_id"
        source_allocation = "supplier_invoice_receipt_allocation_id"
        location = "from_location_id"
        inventory_line_fk = "purchase_return_line_id"
        inventory_sign = -1
        note_fk = "purchase_return_id"
        document_type = "purchase_return_issue"
    params = {"org_id": org_id, "return_id": return_id}
    header = _one(
        db,
        f"""
        SELECT header.id AS return_id, header.{number_field} AS return_number,
               header.return_date, header.status,
               header.{source_document} AS source_document_id,
               header.branch_id, header.{party_account} AS party_account_id,
               header.gst_tax_treatment, header.net_value_total,
               header.gst_taxable_total, header.cgst_total, header.sgst_total,
               header.igst_total, header.cess_total, header.rounding_adjustment,
               header.grand_total, note.id AS adjustment_note_id,
               note.note_number AS adjustment_note_number,
               note.counterparty_payable_amount AS adjustment_note_total,
               tax_document.id AS tax_document_id,
               tax_document.counterparty_payable_amount AS tax_document_total,
               inventory_document.id AS inventory_document_id,
               inventory_document.total_abs_base_quantity AS inventory_total_base_quantity,
               inventory_document.total_value AS inventory_total_value,
               journal.id AS journal_entry_id,
               journal.transaction_debit_total AS journal_debit_total,
               journal.transaction_credit_total AS journal_credit_total,
               COALESCE(journal_lines.debit,0) AS journal_line_debit_total,
               COALESCE(journal_lines.credit,0) AS journal_line_credit_total,
               COALESCE(residual.principal_amount,0) AS residual_open_item_amount
          FROM {header_table} header
          JOIN finance.adjustment_notes note
            ON note.org_id=header.org_id AND note.{note_fk}=header.id
           AND note.status='posted'
          LEFT JOIN tax.documents tax_document
            ON tax_document.org_id=note.org_id
           AND tax_document.adjustment_note_id=note.id
           AND tax_document.document_class='adjustment_note'
          JOIN inventory.inventory_documents inventory_document
            ON inventory_document.org_id=header.org_id
           AND inventory_document.{note_fk}=header.id
           AND inventory_document.document_type='{document_type}'
           AND inventory_document.status='posted'
          JOIN finance.accounting_events event
            ON event.org_id=note.org_id AND event.adjustment_note_id=note.id
           AND event.event_type='adjustment_note'
          JOIN finance.journal_entries journal
            ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
           AND journal.status='posted'
          JOIN LATERAL (
              SELECT SUM(line.transaction_debit) AS debit,
                     SUM(line.transaction_credit) AS credit
                FROM finance.journal_lines line
               WHERE line.org_id=journal.org_id
                 AND line.journal_entry_id=journal.id
          ) journal_lines ON true
          LEFT JOIN finance.open_items residual
            ON residual.org_id=event.org_id
           AND residual.accounting_event_id=event.id
           AND residual.status='open'
         WHERE header.org_id=:org_id AND header.id=:return_id
           AND header.status='posted'
        """,
        params,
    )
    if header is None:
        raise HTTPException(status_code=404, detail="Posted canonical return not found")
    lines = _rows(
        db,
        f"""
        SELECT line.id AS return_line_id, line.{source_line} AS source_line_id,
               line.{source_allocation} AS source_allocation_id,
               line.product_id, line.batch_id, line.{location} AS location_id,
               line.billed_quantity, line.free_quantity,
               line.base_billed_quantity, line.base_free_quantity,
               line.net_value_amount, line.gst_taxable_value,
               line.cgst_amount, line.sgst_amount, line.igst_amount,
               line.cess_amount, line.line_total,
               inventory_line.id AS inventory_document_line_id,
               inventory_line.base_quantity AS inventory_base_quantity,
               inventory_line.extended_cost AS inventory_extended_cost,
               ledger.id AS stock_ledger_entry_id,
               ledger.quantity_delta AS stock_quantity_delta,
               ledger.value_delta AS stock_value_delta
          FROM {line_table} line
          JOIN inventory.inventory_document_lines inventory_line
            ON inventory_line.org_id=line.org_id
           AND inventory_line.{inventory_line_fk}=line.id
          JOIN inventory.stock_ledger_entries ledger
            ON ledger.org_id=inventory_line.org_id
           AND ledger.inventory_document_line_id=inventory_line.id
           AND ledger.quantity_delta {">" if inventory_sign > 0 else "<"} 0
         WHERE line.org_id=:org_id AND line.{return_fk}=:return_id
         ORDER BY line.line_number, line.id
        """,
        params,
    )
    allocations = _rows(
        db,
        """
        SELECT allocation.id AS allocation_id, allocation.open_item_id,
               allocation.amount
          FROM finance.allocations allocation
         WHERE allocation.org_id=:org_id
           AND allocation.adjustment_note_id=:adjustment_note_id
           AND allocation.status='posted'
           AND allocation.reversal_of_allocation_id IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM finance.allocations reversal
                WHERE reversal.org_id=allocation.org_id
                  AND reversal.reversal_of_allocation_id=allocation.id
           )
         ORDER BY allocation.id
        """,
        {**params, "adjustment_note_id": header["adjustment_note_id"]},
    )
    return PostedReturnReadback.model_validate(
        {
            **header,
            "inventory_direction": "receipt" if side == "sales" else "issue",
            "lines": lines,
            "allocations": allocations,
        }
    )


@router.get("/sales/{return_id}", response_model=PostedReturnReadback)
def sales_return_readback(
    return_id: UUID,
    user: dict = SALES_USER,
    db: Session = Depends(get_db),
):
    return _posted_return_readback(db, _activate(db, user), return_id, side="sales")


@router.get("/purchases/{return_id}", response_model=PostedReturnReadback)
def purchase_return_readback(
    return_id: UUID,
    user: dict = PURCHASE_USER,
    db: Session = Depends(get_db),
):
    return _posted_return_readback(db, _activate(db, user), return_id, side="purchase")


def _signed_membership(
    db: Session,
    user: dict[str, Any],
) -> tuple[UUID, UUID]:
    """Resolve one active membership from signed UUID claims, without a grant."""

    org_id = _uuid(user.get("org_id"), "organization")
    auth_user_id = _uuid(user.get("auth_user_id"), "identity")
    user_id = _uuid(user.get("user_id"), "user")
    db.execute(
        text("SELECT erp_security.activate_context(:auth_user_id, :org_id)"),
        {"auth_user_id": auth_user_id, "org_id": org_id},
    )
    rows = db.execute(
        text(
            """
            SELECT membership.id
              FROM core.memberships membership
              JOIN core.users user_row ON user_row.id=membership.user_id
              JOIN core.organizations organization ON organization.id=membership.org_id
             WHERE membership.org_id=:org_id
               AND membership.user_id=:user_id
               AND membership.status='active'
               AND user_row.auth_user_id=:auth_user_id
               AND user_row.status='active'
               AND organization.status='active'
             ORDER BY membership.id
             LIMIT 2
            """
        ),
        {
            "org_id": org_id,
            "user_id": user_id,
            "auth_user_id": auth_user_id,
        },
    ).fetchall()
    if len(rows) != 1:
        raise HTTPException(
            status_code=403,
            detail="Exactly one active ERP membership is required",
        )
    return org_id, rows[0]._mapping["id"]


def _return_command_status(value: dict[str, Any]) -> str:
    status = str(value["status"])
    if status in {"prepared", "pending_approval", "approved"}:
        expires_at = value["expires_at"]
        if expires_at <= datetime.now(tz=expires_at.tzinfo):
            return "expired"
    return status


def _return_command_model(value: dict[str, Any]) -> ReturnCommandDetail:
    preview = value["preview"]
    return ReturnCommandDetail(
        command_request_id=value["id"],
        command_type=value["operation"],
        return_kind="sales"
        if value["capability_code"] == "sales.return.prepare"
        else "purchase",
        status=_return_command_status(value),
        branch_id=value["branch_id"],
        requested_by_membership_id=value["requested_by_membership_id"],
        requester_name=value["requester_name"],
        created_at=value["created_at"],
        expires_at=value["expires_at"],
        approved_at=value["approved_at"],
        executed_at=value["completed_at"],
        resource_type=value["result_resource_type"],
        resource_id=value["result_resource_id"],
        failure_code=value["failure_code"],
        failure_message=value["failure_message"],
        preview_hash="sha256:" + bytes(value["preview_hash"]).hex(),
        resolved_references=list(preview.get("resolved_references") or []),
        source_versions=list(preview.get("source_versions") or []),
        calculation_ruleset=list(preview.get("calculation_ruleset") or []),
        inventory_impact=list(preview.get("inventory_impact") or []),
        financial_impact=list(preview.get("financial_impact") or []),
        tax_impact=list(preview.get("tax_impact") or []),
        policy_warnings=list(preview.get("policy_warnings") or []),
        required_approvals=[{"policy": "separate_approver", "count": 1}],
    )


def _return_command_summary(value: dict[str, Any]) -> ReturnCommandSummary:
    detail = _return_command_model(value)
    return ReturnCommandSummary(
        **{
            field_name: getattr(detail, field_name)
            for field_name in ReturnCommandSummary.model_fields
        }
    )


_RETURN_COMMAND_SELECT = """
    SELECT command.id, command.operation, command.capability_code,
           command.status, command.branch_id,
           command.requested_by_membership_id,
           COALESCE(NULLIF(user_row.display_name,''), 'ERP member') AS requester_name,
           command.created_at, command.expires_at, command.completed_at,
           command.result_resource_type, command.result_resource_id,
           command.failure_code, command.failure_message,
           command.preview_hash,
           convert_from(command.preview_bytes,'UTF8')::jsonb AS preview,
           approval.approved_at
      FROM automation.command_requests command
      JOIN core.memberships requester
        ON requester.org_id=command.org_id
       AND requester.id=command.requested_by_membership_id
      JOIN core.users user_row ON user_row.id=requester.user_id
      LEFT JOIN LATERAL (
          SELECT max(decided_at) AS approved_at
            FROM automation.command_approvals
           WHERE org_id=command.org_id
             AND command_request_id=command.id
             AND decision='approved'
             AND preview_hash=command.preview_hash
             AND aggregate_version_hash=command.aggregate_version_hash
      ) approval ON true
"""


@router.get("/approval-inbox", response_model=list[ReturnCommandSummary])
def return_approval_inbox(
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> list[ReturnCommandSummary]:
    """List only live return commands this distinct reviewer may approve."""

    if not WEB_CLIENT_ID:
        raise HTTPException(status_code=503, detail="ERP web client authority is not configured")
    org_id, membership_id = _signed_membership(db, user)
    rows = _rows(
        db,
        _RETURN_COMMAND_SELECT
        + """
         WHERE command.org_id=:org_id
           AND command.capability_code IN (
                'sales.return.prepare',
                'procurement.purchase_return.prepare'
           )
           AND command.approval_policy='separate_approver'
           AND command.status IN ('prepared','pending_approval')
           AND command.expires_at>transaction_timestamp()
           AND command.requested_by_membership_id<>:membership_id
           AND 1=(
               SELECT count(*)
                 FROM automation.agent_grants reviewer_grant
                 JOIN automation.agent_grant_capabilities reviewer_capability
                   ON reviewer_capability.org_id=reviewer_grant.org_id
                  AND reviewer_capability.agent_grant_id=reviewer_grant.id
                WHERE reviewer_grant.org_id=command.org_id
                  AND reviewer_grant.client_id=:client_id
                  AND reviewer_grant.subject_membership_id=:membership_id
                  AND reviewer_grant.consented_by_membership_id=:membership_id
                  AND reviewer_grant.status='active'
                  AND reviewer_grant.expires_at>transaction_timestamp()
                  AND reviewer_capability.capability_code='automation.command.approve'
                  AND reviewer_capability.status='active'
                  AND (reviewer_grant.branch_id IS NULL
                       OR reviewer_grant.branch_id=command.branch_id)
           )
           AND EXISTS (
               SELECT 1
                 FROM core.access_grants access_grant
                 JOIN core.roles role
                   ON role.org_id=access_grant.org_id
                  AND role.id=access_grant.role_id
                 JOIN core.role_permissions role_permission
                   ON role_permission.org_id=role.org_id
                  AND role_permission.role_id=role.id
                 JOIN core.permissions permission
                   ON permission.code=role_permission.permission_code
                WHERE access_grant.org_id=command.org_id
                  AND access_grant.membership_id=:membership_id
                  AND access_grant.status='active'
                  AND access_grant.scope_kind='organization'
                  AND access_grant.branch_id IS NULL
                  AND access_grant.valid_from_at<=transaction_timestamp()
                  AND (access_grant.expires_at IS NULL
                       OR access_grant.expires_at>transaction_timestamp())
                  AND role.status='active'
                  AND permission.code='automation.command.approve'
                  AND permission.status='active'
           )
         ORDER BY command.created_at, command.id
         LIMIT 100
        """,
        {
            "org_id": org_id,
            "membership_id": membership_id,
            "client_id": WEB_CLIENT_ID,
        },
    )
    return [_return_command_summary(row) for row in rows]


@router.get("/requester-inbox", response_model=list[ReturnCommandSummary])
def return_requester_inbox(
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> list[ReturnCommandSummary]:
    """List the signed requester's immutable return commands and outcomes."""

    org_id, membership_id = _signed_membership(db, user)
    rows = _rows(
        db,
        _RETURN_COMMAND_SELECT
        + """
         WHERE command.org_id=:org_id
           AND command.requested_by_membership_id=:membership_id
           AND command.capability_code IN (
                'sales.return.prepare',
                'procurement.purchase_return.prepare'
           )
           AND command.approval_policy='separate_approver'
         ORDER BY command.created_at DESC, command.id DESC
         LIMIT 100
        """,
        {"org_id": org_id, "membership_id": membership_id},
    )
    return [_return_command_summary(row) for row in rows]


@router.get(
    "/requester/commands/{command_request_id}",
    response_model=ReturnCommandDetail,
)
def requester_return_command(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> ReturnCommandDetail:
    org_id, membership_id = _signed_membership(db, user)
    row = _one(
        db,
        _RETURN_COMMAND_SELECT
        + """
         WHERE command.org_id=:org_id
           AND command.id=:command_request_id
           AND command.requested_by_membership_id=:membership_id
           AND command.capability_code IN (
                'sales.return.prepare',
                'procurement.purchase_return.prepare'
           )
           AND command.approval_policy='separate_approver'
         FOR SHARE OF command
        """,
        {
            "org_id": org_id,
            "membership_id": membership_id,
            "command_request_id": command_request_id,
        },
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Requester return command not found")
    return _return_command_model(row)


@router.get(
    "/commands/{command_request_id}/review",
    response_model=ReturnCommandDetail,
)
def return_command_review(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> ReturnCommandDetail:
    """Load an immutable return preview for a distinct authorized approver.

    Approval itself remains on the shared reviewed command endpoint.  Resolving
    this view through automation.command.approve is intentional: the requester
    membership cannot satisfy this endpoint's distinct-approver predicate.
    """

    context = _command_context(
        db, user, "automation.command.approve", command_request_id
    )
    row = db.execute(
        text(
            _RETURN_COMMAND_SELECT
            + """
             WHERE command.org_id=:org_id
               AND command.id=:command_request_id
               AND command.capability_code IN (
                    'sales.return.prepare',
                    'procurement.purchase_return.prepare'
               )
               AND command.approval_policy='separate_approver'
               AND command.status IN ('prepared','pending_approval')
               AND command.expires_at>transaction_timestamp()
               AND command.requested_by_membership_id<>:membership_id
             FOR SHARE OF command
            """
        ),
        {
            "org_id": context.organization_id,
            "command_request_id": command_request_id,
            "membership_id": context.membership_id,
        },
    ).first()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No unexpired return preview is available for independent approval",
        )
    return _return_command_model(dict(row._mapping))
