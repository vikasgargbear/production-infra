"""
Settings schemas for business configuration
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal


# =============================================================================
# GENERAL SETTINGS
# =============================================================================

class SettingUpdate(BaseModel):
    """Schema for updating a setting"""
    
    key: str = Field(..., min_length=1, max_length=100)
    value: Any
    description: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class SettingResponse(BaseModel):
    """Schema for setting response"""
    
    setting_id: int
    key: str
    value: Any
    description: Optional[str] = None
    category: Optional[str] = None
    is_system: bool = False

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# BILLING SETTINGS
# =============================================================================

class BillingSettings(BaseModel):
    """Billing configuration settings"""
    
    tax_inclusive_pricing: bool = Field(default=False, description="Include tax in displayed prices")
    default_tax_rate: Decimal = Field(default=Decimal("18.0"), ge=0, le=28)
    round_off_enabled: bool = Field(default=True)
    round_off_threshold: Decimal = Field(default=Decimal("0.5"))
    auto_apply_discounts: bool = Field(default=True)
    
    # Invoice settings
    invoice_prefix: str = Field(default="INV", max_length=10)
    invoice_suffix: Optional[str] = None
    invoice_start_number: int = Field(default=1, ge=1)
    
    # Payment terms
    default_payment_terms: str = Field(default="NET30")
    default_credit_days: int = Field(default=30, ge=0, le=365)

    model_config = ConfigDict(str_strip_whitespace=True)


# =============================================================================
# INVENTORY SETTINGS
# =============================================================================

class InventorySettings(BaseModel):
    """Inventory configuration settings"""
    
    low_stock_threshold: int = Field(default=10, ge=0)
    expiry_alert_days: int = Field(default=90, ge=0, description="Days before expiry to alert")
    near_expiry_days: int = Field(default=180, ge=0)
    negative_stock_allowed: bool = Field(default=False)
    batch_tracking_required: bool = Field(default=True)
    
    # Stock valuation
    valuation_method: str = Field(default="FIFO", description="FIFO, LIFO, or WAC")
    auto_reserve_stock: bool = Field(default=True)
    
    # Reorder
    auto_reorder_enabled: bool = Field(default=False)
    reorder_calculation_method: str = Field(default="average_sales")

    model_config = ConfigDict(str_strip_whitespace=True)


# =============================================================================
# COMPLIANCE SETTINGS
# =============================================================================

class ComplianceSettings(BaseModel):
    """Compliance configuration settings for pharma"""
    
    drug_license_required: bool = Field(default=True)
    license_expiry_alert_days: int = Field(default=30, ge=0)
    
    # Schedule verification
    schedule_h_verification: bool = Field(default=True, description="Require verification for Schedule H drugs")
    schedule_h1_verification: bool = Field(default=True, description="Require verification for Schedule H1 drugs")
    schedule_x_verification: bool = Field(default=True, description="Require verification for Schedule X drugs")
    
    # Narcotics
    narcotics_tracking: bool = Field(default=True)
    narcotics_register_required: bool = Field(default=True)
    
    # Audit
    audit_trail_enabled: bool = Field(default=True)
    retention_period_years: int = Field(default=5, ge=1)

    model_config = ConfigDict(str_strip_whitespace=True)


# =============================================================================
# NOTIFICATION SETTINGS
# =============================================================================

class NotificationSettings(BaseModel):
    """Notification configuration"""
    
    email_notifications: bool = Field(default=True)
    sms_notifications: bool = Field(default=False)
    whatsapp_notifications: bool = Field(default=False)
    
    low_stock_alert: bool = Field(default=True)
    expiry_alert: bool = Field(default=True)
    payment_reminder: bool = Field(default=True)
    order_confirmation: bool = Field(default=True)
    
    alert_recipients: list = Field(default_factory=list)

    model_config = ConfigDict(str_strip_whitespace=True)


# =============================================================================
# ORGANIZATION SETTINGS
# =============================================================================

class OrganizationSettings(BaseModel):
    """Organization-level settings"""
    
    org_name: str = Field(..., max_length=200)
    org_type: str = Field(default="retail_pharmacy")
    gstin: Optional[str] = Field(None, min_length=15, max_length=15)
    pan_number: Optional[str] = Field(None, min_length=10, max_length=10)
    
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, pattern=r"^\d{6}$")
    
    phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    email: Optional[str] = None
    website: Optional[str] = None
    
    logo_url: Optional[str] = None
    signature_url: Optional[str] = None
    
    financial_year_start: int = Field(default=4, ge=1, le=12, description="Month (1-12)")
    currency: str = Field(default="INR")
    timezone: str = Field(default="Asia/Kolkata")

    model_config = ConfigDict(str_strip_whitespace=True)
