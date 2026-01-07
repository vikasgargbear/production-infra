# Compliance schemas
from .compliance import (
    # Enums
    LicenseType, LicenseStatus, AuditType, AuditStatus,
    # Drug License
    DrugLicenseCreate, DrugLicenseResponse, DrugLicenseListResponse,
    # Audit
    ComplianceAuditCreate, ComplianceAuditResponse,
    # Inspector
    InspectorVisitCreate, InspectorVisitResponse,
    # Document
    ComplianceDocumentCreate, ComplianceDocumentResponse,
    # Dashboard
    ComplianceDashboard,
)

# Loyalty schemas moved to schemas/loyalty/
from ..loyalty.loyalty import (
    # Loyalty Program
    LoyaltyProgramCreate, CustomerTier,
    PointsTransaction, PointsRedemption,
    # Schemes
    SchemeCreate, SchemeResponse, DiscountCalculation,
)

__all__ = [
    # Enums
    "LicenseType", "LicenseStatus", "AuditType", "AuditStatus",
    # Drug License
    "DrugLicenseCreate", "DrugLicenseResponse", "DrugLicenseListResponse",
    # Audit
    "ComplianceAuditCreate", "ComplianceAuditResponse",
    # Inspector
    "InspectorVisitCreate", "InspectorVisitResponse",
    # Document
    "ComplianceDocumentCreate", "ComplianceDocumentResponse",
    # Dashboard
    "ComplianceDashboard",
    # Loyalty (re-exported for backward compatibility)
    "LoyaltyProgramCreate", "CustomerTier",
    "PointsTransaction", "PointsRedemption",
    # Schemes
    "SchemeCreate", "SchemeResponse", "DiscountCalculation",
]
