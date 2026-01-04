"""
Purchase Invoice Parser Schemas
Pydantic models for parsed invoice data with validation
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from enum import Enum


class ParserConfidence(str, Enum):
    """Confidence levels for parsed data"""
    HIGH = "high"       # >0.8 - All key fields extracted
    MEDIUM = "medium"   # 0.5-0.8 - Some fields missing
    LOW = "low"         # <0.5 - Manual review required


class ParsedItem(BaseModel):
    """Single line item from invoice"""
    product_name: str = Field(..., min_length=1, description="Product/medicine name")
    hsn_code: str = Field(default="", description="HSN code for GST")
    batch_number: str = Field(default="", description="Batch/lot number")
    expiry_date: Optional[date] = Field(default=None, description="Expiry date")
    quantity: int = Field(default=0, ge=0, description="Quantity received")
    free_quantity: int = Field(default=0, ge=0, description="Free/bonus quantity")
    unit: str = Field(default="strip", description="Unit of measure")
    pack_size: int = Field(default=1, ge=1, description="Pack size")
    mrp: Decimal = Field(default=Decimal("0"), ge=0, description="MRP per unit")
    cost_price: Decimal = Field(default=Decimal("0"), ge=0, description="Purchase rate")
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Decimal = Field(default=Decimal("12"), ge=0, le=28)
    amount: Decimal = Field(default=Decimal("0"), ge=0, description="Line total")

    @field_validator('expiry_date', mode='before')
    @classmethod
    def parse_expiry(cls, v):
        """Handle various expiry date formats"""
        if v is None or v == "":
            return None
        if isinstance(v, date):
            return v
        if isinstance(v, str):
            # Handle MM/YY format
            import re
            match = re.match(r'(\d{1,2})/(\d{2,4})', v.strip())
            if match:
                month, year = int(match.group(1)), int(match.group(2))
                if year < 100:
                    year += 2000
                from datetime import datetime
                # Last day of month
                if month == 12:
                    return date(year + 1, 1, 1) - datetime.timedelta(days=1)
                return date(year, month + 1, 1) - datetime.timedelta(days=1)
        return v


class ParsedInvoice(BaseModel):
    """Parsed invoice header and totals"""
    invoice_number: str = Field(default="", description="Invoice/bill number")
    invoice_date: Optional[date] = Field(default=None)
    supplier_name: str = Field(default="", description="Supplier/vendor name")
    supplier_gstin: str = Field(default="", max_length=15, description="15-digit GSTIN")
    supplier_address: str = Field(default="")
    drug_license: str = Field(default="", description="Drug license number")
    
    # Totals
    subtotal: Decimal = Field(default=Decimal("0"), ge=0)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    grand_total: Decimal = Field(default=Decimal("0"), ge=0)
    
    # Line items
    items: List[ParsedItem] = Field(default_factory=list)

    @field_validator('supplier_gstin')
    @classmethod
    def validate_gstin(cls, v):
        """Validate GSTIN format"""
        if v and len(v) != 15:
            return ""  # Invalid, clear it
        return v.upper() if v else ""


class ParseResult(BaseModel):
    """Complete parsing result with metadata"""
    success: bool = Field(default=False)
    confidence: ParserConfidence = Field(default=ParserConfidence.LOW)
    confidence_score: float = Field(default=0.0, ge=0, le=1)
    manual_review_required: bool = Field(default=True)
    
    # Parsed data
    extracted_data: ParsedInvoice = Field(default_factory=ParsedInvoice)
    
    # Errors/warnings
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    
    # Processing metadata
    pages_processed: int = Field(default=0, ge=0)
    processing_time_ms: int = Field(default=0, ge=0)

    def calculate_confidence(self) -> None:
        """Calculate confidence based on extracted data"""
        data = self.extracted_data
        score = 0.0
        
        # Key fields scoring
        if data.supplier_name:
            score += 0.2
        if data.invoice_number:
            score += 0.15
        if data.invoice_date:
            score += 0.1
        if data.supplier_gstin:
            score += 0.1
        if data.items:
            score += 0.25
            # Bonus for item completeness
            complete_items = sum(1 for item in data.items 
                               if item.product_name and item.quantity > 0 and item.cost_price > 0)
            if data.items:
                score += 0.2 * (complete_items / len(data.items))
        
        self.confidence_score = min(score, 1.0)
        
        if self.confidence_score >= 0.8:
            self.confidence = ParserConfidence.HIGH
            self.manual_review_required = False
        elif self.confidence_score >= 0.5:
            self.confidence = ParserConfidence.MEDIUM
        else:
            self.confidence = ParserConfidence.LOW
        
        self.success = self.confidence_score >= 0.5


class ParserDefaults:
    """Default values and constants"""
    DEFAULT_TAX_PERCENT = Decimal("12")
    DEFAULT_UNIT = "strip"
    CONFIDENCE_THRESHOLD = 0.7
    MAX_HEADER_LINES = 20
    MAX_TABLE_ROWS = 500
