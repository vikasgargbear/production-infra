"""Typed contracts for non-persistent financial calculation previews."""

from decimal import Decimal
from datetime import date
from typing import List, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PositiveInt


GSTType = Literal["CGST/SGST", "IGST"]
FreeSupplyTaxTreatment = Literal[
    "excluded_from_taxable_value", "included_at_unit_rate"
]
EntityId = Union[PositiveInt, UUID]


class CalculationLine(BaseModel):
    product_id: Optional[EntityId] = None
    product_name: Optional[str] = Field(default=None, max_length=255)
    quantity: Decimal = Field(ge=0)
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    free_supply_tax_treatment: FreeSupplyTaxTreatment = (
        "excluded_from_taxable_value"
    )
    unit_price: Decimal = Field(ge=0)
    mrp: Decimal = Field(default=Decimal("0"), ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    gst_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Optional[Decimal] = Field(default=None, ge=0, le=100)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class InvoiceCalculationRequest(BaseModel):
    customer_id: Optional[EntityId] = None
    gst_type: GSTType = "CGST/SGST"
    items: List[CalculationLine] = Field(min_length=1, max_length=500)
    freight_charges: Decimal = Field(default=Decimal("0"), ge=0)
    insurance_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)
    discount_type: Literal["percentage", "amount", "fixed"] = "percentage"
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(extra="forbid")


class SalesOrderCalculationLine(CalculationLine):
    batch_id: Optional[EntityId] = None
    batch_number: Optional[str] = Field(default=None, max_length=128)
    uom: Optional[str] = Field(default=None, max_length=32)
    pack_type: Optional[str] = Field(default=None, max_length=32)


class SalesOrderCalculationRequest(BaseModel):
    customer_id: EntityId
    gst_type: GSTType = "CGST/SGST"
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    items: List[SalesOrderCalculationLine] = Field(min_length=1, max_length=200)
    delivery_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)
    discount_type: Literal["percentage", "amount", "fixed"] = "percentage"
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(extra="forbid")


class PurchaseCalculationRequest(BaseModel):
    supplier_id: Optional[EntityId] = None
    gst_type: GSTType = "CGST/SGST"
    items: List[CalculationLine] = Field(min_length=1, max_length=500)
    freight_charges: Decimal = Field(default=Decimal("0"), ge=0)
    insurance_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(extra="forbid")


class ChallanCalculationRequest(BaseModel):
    customer_id: EntityId
    gst_type: GSTType = "CGST/SGST"
    items: List[CalculationLine] = Field(min_length=1, max_length=500)
    freight_charges: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(extra="forbid")


class CalculationPreviewLine(BaseModel):
    """Strict numeric line contract shared by sales calculation previews."""

    product_id: Optional[EntityId] = None
    batch_id: Optional[EntityId] = None
    quantity: float = Field(ge=0)
    free_quantity: float = Field(ge=0)
    free_supply_tax_treatment: FreeSupplyTaxTreatment
    subtotal: float = Field(ge=0)
    discount_amount: float = Field(ge=0)
    taxable_amount: float = Field(ge=0)
    cgst_amount: float = Field(ge=0)
    sgst_amount: float = Field(ge=0)
    igst_amount: float = Field(ge=0)
    total_tax: float = Field(ge=0)
    total_tax_amount: float = Field(ge=0)
    line_total: float = Field(ge=0)
    gst_percent: Optional[float] = Field(default=None, ge=0, le=100)
    cgst_percent: Optional[float] = Field(default=None, ge=0, le=100)
    sgst_percent: Optional[float] = Field(default=None, ge=0, le=100)
    igst_percent: Optional[float] = Field(default=None, ge=0, le=100)
    scheme_discount: Optional[float] = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class InvoiceCalculationPreviewTotals(BaseModel):
    subtotal_amount: float = Field(ge=0)
    discount_amount: float = Field(ge=0)
    scheme_discount: float = Field(ge=0)
    scheme_discount_percent: float = Field(ge=0, le=100)
    taxable_amount: float = Field(ge=0)
    cgst_amount: float = Field(ge=0)
    sgst_amount: float = Field(ge=0)
    igst_amount: float = Field(ge=0)
    total_tax_amount: float = Field(ge=0)
    freight_charges: float = Field(ge=0)
    insurance_charges: float = Field(ge=0)
    other_charges: float = Field(ge=0)
    round_off_amount: float
    final_amount: float = Field(ge=0)

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ChallanCalculationPreviewTotals(BaseModel):
    subtotal_amount: float = Field(ge=0)
    discount_amount: float = Field(ge=0)
    taxable_amount: float = Field(ge=0)
    cgst_amount: float = Field(ge=0)
    sgst_amount: float = Field(ge=0)
    igst_amount: float = Field(ge=0)
    total_tax_amount: float = Field(ge=0)
    freight_charges: float = Field(ge=0)
    final_amount: float = Field(ge=0)

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class InvoiceCalculationPreviewResponse(BaseModel):
    success: Literal[True]
    line_items: List[CalculationPreviewLine] = Field(min_length=1, max_length=500)
    totals: InvoiceCalculationPreviewTotals
    calculation_timestamp: int = Field(ge=0)
    gst_type: GSTType

    model_config = ConfigDict(extra="forbid")


class ChallanCalculationPreviewResponse(BaseModel):
    success: Literal[True]
    line_items: List[CalculationPreviewLine] = Field(min_length=1, max_length=500)
    totals: ChallanCalculationPreviewTotals
    calculation_timestamp: int = Field(ge=0)
    gst_type: GSTType

    model_config = ConfigDict(extra="forbid")


class ReturnCalculationLine(BaseModel):
    product_id: Optional[EntityId] = None
    return_quantity: Decimal = Field(gt=0)
    paid_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    unit_price: Decimal = Field(ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)

    model_config = ConfigDict(extra="forbid")


class ReturnCalculationRequest(BaseModel):
    return_type: Literal["sales", "purchase"]
    customer_id: Optional[EntityId] = None
    supplier_id: Optional[EntityId] = None
    gst_type: GSTType = "CGST/SGST"
    include_gst: bool = True
    items: List[ReturnCalculationLine] = Field(min_length=1, max_length=500)

    model_config = ConfigDict(extra="forbid")


class NoteCalculationRequest(BaseModel):
    note_type: Literal["credit", "debit"]
    party_type: Literal["customer", "supplier"] = "customer"
    party_id: Optional[EntityId] = None
    gst_type: GSTType = "CGST/SGST"
    include_gst: bool = True
    items: List[CalculationLine] = Field(min_length=1, max_length=500)

    model_config = ConfigDict(extra="forbid")
