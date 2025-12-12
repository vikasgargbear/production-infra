"""
Compliance-related schemas for drug licenses, audits, and inspections
Centralized from inline route definitions
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from pydantic import BaseModel, Field


# =============================================================================
# DRUG LICENSE SCHEMAS
# =============================================================================

class DrugLicenseCreate(BaseModel):
    """Schema for creating drug license record"""
    license_number: str = Field(..., min_length=1)
    license_type: str = Field(..., description="retail, wholesale, manufacturing")
    issuing_authority: str
    issue_date: date
    expiry_date: date
    file_number: Optional[str] = None
    categories: List[str] = Field(default_factory=list)
    conditions: Optional[str] = None
    status: str = Field(default="active")


# =============================================================================
# AUDIT SCHEMAS
# =============================================================================

class ComplianceAudit(BaseModel):
    """Schema for compliance audit record"""
    audit_date: date
    audit_type: str = Field(..., description="internal, external, regulatory")
    auditor_name: str
    findings: Optional[str] = None
    recommendations: Optional[str] = None
    corrective_actions: Optional[str] = None
    status: str = Field(default="pending")
    next_audit_date: Optional[date] = None


# =============================================================================
# INSPECTOR VISIT SCHEMAS
# =============================================================================

class InspectorVisit(BaseModel):
    """Schema for inspector visit record"""
    visit_date: date
    inspector_name: str
    inspector_designation: Optional[str] = None
    department: str
    purpose: str
    observations: Optional[str] = None
    action_required: Optional[str] = None
    follow_up_date: Optional[date] = None
    status: str = Field(default="completed")


# =============================================================================
# DOCUMENT SCHEMAS
# =============================================================================

class ComplianceDocument(BaseModel):
    """Schema for compliance document"""
    document_type: str
    document_name: str
    file_path: Optional[str] = None
    expiry_date: Optional[date] = None
    reminder_days: int = Field(default=30)
    status: str = Field(default="active")
