"""
Compliance schemas for drug licenses, audits, and regulatory inspections
"""
from typing import List, Optional
from datetime import date, datetime
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class LicenseType(str, Enum):
    """Drug license types"""
    RETAIL = "retail"
    WHOLESALE = "wholesale"
    MANUFACTURING = "manufacturing"
    IMPORT = "import"


class LicenseStatus(str, Enum):
    """License status"""
    ACTIVE = "active"
    EXPIRED = "expired"
    SUSPENDED = "suspended"
    PENDING_RENEWAL = "pending_renewal"


class AuditType(str, Enum):
    """Audit types"""
    INTERNAL = "internal"
    EXTERNAL = "external"
    REGULATORY = "regulatory"


class AuditStatus(str, Enum):
    """Audit status"""
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FOLLOW_UP = "follow_up"


# =============================================================================
# DRUG LICENSE SCHEMAS
# =============================================================================

class DrugLicenseCreate(BaseModel):
    """Schema for creating drug license record"""
    
    license_number: str = Field(..., min_length=1, max_length=50)
    license_type: LicenseType
    issuing_authority: str = Field(..., max_length=200)
    issue_date: date
    expiry_date: date
    file_number: Optional[str] = Field(None, max_length=50)
    categories: List[str] = Field(default_factory=list, description="Drug categories allowed")
    conditions: Optional[str] = Field(None, max_length=1000)
    status: LicenseStatus = LicenseStatus.ACTIVE

    model_config = ConfigDict(str_strip_whitespace=True)


class DrugLicenseResponse(BaseModel):
    """Schema for drug license response"""
    
    license_id: int
    license_number: str
    license_type: str
    issuing_authority: str
    issue_date: date
    expiry_date: date
    file_number: Optional[str] = None
    categories: List[str] = Field(default_factory=list)
    conditions: Optional[str] = None
    status: str
    days_to_expiry: Optional[int] = None
    is_expired: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DrugLicenseListResponse(BaseModel):
    """Paginated license list"""
    
    total: int
    licenses: List[DrugLicenseResponse] = Field(default_factory=list)


# =============================================================================
# AUDIT SCHEMAS
# =============================================================================

class ComplianceAuditCreate(BaseModel):
    """Schema for creating compliance audit record"""
    
    audit_date: date
    audit_type: AuditType
    auditor_name: str = Field(..., max_length=100)
    auditor_organization: Optional[str] = Field(None, max_length=200)
    scope: Optional[str] = Field(None, max_length=500)
    findings: Optional[str] = Field(None, max_length=2000)
    recommendations: Optional[str] = Field(None, max_length=2000)
    corrective_actions: Optional[str] = Field(None, max_length=2000)
    status: AuditStatus = AuditStatus.SCHEDULED
    next_audit_date: Optional[date] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class ComplianceAuditResponse(BaseModel):
    """Schema for audit response"""
    
    audit_id: int
    audit_date: date
    audit_type: str
    auditor_name: str
    auditor_organization: Optional[str] = None
    scope: Optional[str] = None
    findings: Optional[str] = None
    recommendations: Optional[str] = None
    corrective_actions: Optional[str] = None
    status: str
    next_audit_date: Optional[date] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# INSPECTOR VISIT SCHEMAS
# =============================================================================

class InspectorVisitCreate(BaseModel):
    """Schema for recording inspector visit"""
    
    visit_date: date
    inspector_name: str = Field(..., max_length=100)
    inspector_designation: Optional[str] = Field(None, max_length=100)
    inspector_id: Optional[str] = Field(None, max_length=50)
    department: str = Field(..., max_length=100)
    purpose: str = Field(..., max_length=500)
    observations: Optional[str] = Field(None, max_length=2000)
    action_required: Optional[str] = Field(None, max_length=1000)
    follow_up_date: Optional[date] = None
    status: str = Field(default="completed")

    model_config = ConfigDict(str_strip_whitespace=True)


class InspectorVisitResponse(BaseModel):
    """Schema for inspector visit response"""
    
    visit_id: int
    visit_date: date
    inspector_name: str
    inspector_designation: Optional[str] = None
    department: str
    purpose: str
    observations: Optional[str] = None
    action_required: Optional[str] = None
    follow_up_date: Optional[date] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# DOCUMENT SCHEMAS
# =============================================================================

class ComplianceDocumentCreate(BaseModel):
    """Schema for compliance document"""
    
    document_type: str = Field(..., max_length=50)
    document_name: str = Field(..., max_length=200)
    file_path: Optional[str] = Field(None, max_length=500)
    file_size: Optional[int] = None
    mime_type: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[date] = None
    reminder_days: int = Field(default=30, ge=0)
    status: str = Field(default="active")

    model_config = ConfigDict(str_strip_whitespace=True)


class ComplianceDocumentResponse(BaseModel):
    """Schema for document response"""
    
    document_id: int
    document_type: str
    document_name: str
    file_path: Optional[str] = None
    expiry_date: Optional[date] = None
    reminder_days: int
    status: str
    days_to_expiry: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# DASHBOARD SCHEMAS
# =============================================================================

class ComplianceDashboard(BaseModel):
    """Compliance dashboard summary"""
    
    active_licenses: int = 0
    expiring_licenses: int = 0
    expired_licenses: int = 0
    
    pending_audits: int = 0
    completed_audits: int = 0
    
    recent_visits: int = 0
    pending_actions: int = 0
    
    license_alerts: List[dict] = Field(default_factory=list)
    upcoming_audits: List[dict] = Field(default_factory=list)
