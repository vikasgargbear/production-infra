"""Typed contracts for non-persistent financial calculation previews."""

from decimal import Decimal
from typing import List, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PositiveInt


GSTType = Literal["CGST/SGST", "IGST"]
EntityId = Union[PositiveInt, UUID]


class CalculationLine(BaseModel):
    product_id: Optional[EntityId] = None
    product_name: Optional[str] = Field(default=None, max_length=255)
    quantity: Decimal = Field(ge=0)
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
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
    items: List[CalculationLine] = Field(min_length=1, max_length=500)
    freight_charges: Decimal = Field(default=Decimal("0"), ge=0)

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
