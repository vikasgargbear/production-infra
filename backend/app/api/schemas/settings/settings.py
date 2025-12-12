"""
Settings schemas for business configuration
Centralized from inline route definitions
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# =============================================================================
# GENERAL SETTINGS
# =============================================================================

class SettingUpdate(BaseModel):
    """Schema for updating a setting"""
    key: str
    value: Any
    description: Optional[str] = None


# =============================================================================
# BILLING SETTINGS
# =============================================================================

class BillingSettings(BaseModel):
    """Billing configuration settings"""
    tax_inclusive_pricing: bool = False
    default_tax_rate: float = 18.0
    round_off_enabled: bool = True
    round_off_threshold: float = 0.5
    auto_apply_discounts: bool = True


# =============================================================================
# INVENTORY SETTINGS
# =============================================================================

class InventorySettings(BaseModel):
    """Inventory configuration settings"""
    low_stock_threshold: int = 10
    expiry_alert_days: int = 90
    negative_stock_allowed: bool = False
    batch_tracking_required: bool = True
    fifo_enabled: bool = True


# =============================================================================
# COMPLIANCE SETTINGS  
# =============================================================================

class ComplianceSettings(BaseModel):
    """Compliance configuration settings"""
    drug_license_required: bool = True
    license_expiry_alert_days: int = 30
    schedule_h_verification: bool = True
    schedule_h1_verification: bool = True
    narcotics_tracking: bool = True
