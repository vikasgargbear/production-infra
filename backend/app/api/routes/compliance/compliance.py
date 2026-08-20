"""
Compliance Management API
Manages drug licenses, regulatory compliance, and inspections
"""
from typing import Optional, List
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging
import json

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ....core.security.permissions import PermissionChecker
from ....core.auth.jwt_auth import get_org_id_string
from ...schemas.compliance.mutations import (
    DrugLicenseMutationResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])

class DrugLicenseCreate(BaseModel):
    """Schema for creating drug license"""
    license_type: str = Field(..., pattern="^(wholesale|retail|manufacturing|import|export)$")
    license_number: str
    license_category: List[str]  # ["20B", "21B", "20C", "21C"]
    issuing_authority: str
    issue_date: date
    expiry_date: date
    premises_address: str
    pharmacist_name: str
    pharmacist_registration: str
    pharmacist_qualification: str
    storage_capacity: Optional[dict] = None  # {"normal": 100, "cold": 20}
    is_active: bool = True

class ComplianceDocument(BaseModel):
    """Schema for compliance document"""
    document_type: str
    document_name: str
    expiry_date: Optional[date] = None
    reminder_days: int = 30
    tags: Optional[List[str]] = []

@router.post("/drug-licenses", response_model=DrugLicenseMutationResponse)
@with_tenant_context
async def create_drug_license(
    license: DrugLicenseCreate,
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create or update drug license information
    
    - Store license details
    - Set expiry reminders
    - Link pharmacist information
    """
    try:
        # Check if license already exists
        check_query = """
            SELECT license_id FROM compliance.drug_licenses
            WHERE org_id = :org_id AND license_number = :license_number
        """
        existing = db.execute(text(check_query), {
            "org_id": str(context.org_id),
            "license_number": license.license_number
        }).first()
        
        if existing:
            # Update existing license
            update_query = """
                UPDATE compliance.drug_licenses
                SET license_type = :license_type,
                    license_category = :license_category,
                    issuing_authority = :issuing_authority,
                    issue_date = :issue_date,
                    expiry_date = :expiry_date,
                    premises_address = :premises_address,
                    pharmacist_name = :pharmacist_name,
                    pharmacist_registration = :pharmacist_registration,
                    pharmacist_qualification = :pharmacist_qualification,
                    storage_capacity = :storage_capacity,
                    is_active = :is_active,
                    updated_at = CURRENT_TIMESTAMP
                WHERE license_id = :license_id
            """
            
            db.execute(text(update_query), {
                "license_id": existing.license_id,
                "license_type": license.license_type,
                "license_category": json.dumps(license.license_category),
                "issuing_authority": license.issuing_authority,
                "issue_date": license.issue_date,
                "expiry_date": license.expiry_date,
                "premises_address": license.premises_address,
                "pharmacist_name": license.pharmacist_name,
                "pharmacist_registration": license.pharmacist_registration,
                "pharmacist_qualification": license.pharmacist_qualification,
                "storage_capacity": json.dumps(license.storage_capacity) if license.storage_capacity else None,
                "is_active": license.is_active
            })
            
            license_id = existing.license_id
            message = "Drug license updated successfully"
            
        else:
            # Create new license
            insert_query = """
                INSERT INTO compliance.drug_licenses (
                    org_id, license_type, license_number, license_category,
                    issuing_authority, issue_date, expiry_date, premises_address,
                    pharmacist_name, pharmacist_registration, pharmacist_qualification,
                    storage_capacity, is_active, created_by
                ) VALUES (
                    :org_id, :license_type, :license_number, :license_category,
                    :issuing_authority, :issue_date, :expiry_date, :premises_address,
                    :pharmacist_name, :pharmacist_registration, :pharmacist_qualification,
                    :storage_capacity, :is_active, :created_by
                ) RETURNING license_id
            """
            
            result = db.execute(text(insert_query), {
                "org_id": str(context.org_id),
                "license_type": license.license_type,
                "license_number": license.license_number,
                "license_category": json.dumps(license.license_category),
                "issuing_authority": license.issuing_authority,
                "issue_date": license.issue_date,
                "expiry_date": license.expiry_date,
                "premises_address": license.premises_address,
                "pharmacist_name": license.pharmacist_name,
                "pharmacist_registration": license.pharmacist_registration,
                "pharmacist_qualification": license.pharmacist_qualification,
                "storage_capacity": json.dumps(license.storage_capacity) if license.storage_capacity else None,
                "is_active": license.is_active,
                "created_by": 1
            })
            
            license_id = result.scalar()
            message = "Drug license created successfully"
        
        # Create expiry alert
        alert_query = """
            INSERT INTO compliance.compliance_alerts (
                org_id, alert_type, alert_date, reference_type,
                reference_id, alert_message, is_active
            ) VALUES (
                :org_id, 'license_expiry', :alert_date, 'drug_license',
                :license_id, :message, true
            )
            ON CONFLICT (org_id, reference_type, reference_id, alert_type) 
            DO UPDATE SET 
                alert_date = EXCLUDED.alert_date,
                is_active = true
        """
        
        db.execute(text(alert_query), {
            "org_id": str(context.org_id),
            "alert_date": license.expiry_date - timedelta(days=30),
            "license_id": license_id,
            "message": f"Drug License {license.license_number} expiring on {license.expiry_date}"
        })
        
        # TenantAwareSession auto-commits
        
        return {
            "license_id": license_id,
            "license_number": license.license_number,
            "message": message
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating drug license: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create drug license: {str(e)}")

@router.get("/drug-licenses")
@with_tenant_context
async def get_drug_licenses(
    org_id: str = Depends(get_org_id_string),
    include_expired: bool = Query(False),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get all drug licenses for the organization"""
    try:
        query = """
            SELECT 
                license_id,
                license_type,
                license_number,
                license_category,
                issuing_authority,
                issue_date,
                expiry_date,
                premises_address,
                pharmacist_name,
                pharmacist_registration,
                is_active,
                CASE 
                    WHEN expiry_date < CURRENT_DATE THEN 'expired'
                    WHEN expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
                    ELSE 'valid'
                END as status,
                (expiry_date - CURRENT_DATE) as days_until_expiry
            FROM compliance.drug_licenses
            WHERE org_id = :org_id
        """
        
        if not include_expired:
            query += " AND (is_active = true OR expiry_date >= CURRENT_DATE)"
        
        query += " ORDER BY expiry_date"
        
        result = db.execute(text(query), {"org_id": str(context.org_id)})
        licenses = []
        
        for row in result:
            license_data = dict(row._mapping)
            license_data["license_category"] = json.loads(license_data["license_category"])
            licenses.append(license_data)
        
        return licenses
        
    except Exception as e:
        logger.error(f"Error fetching drug licenses: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch drug licenses")

@router.get("/drug-licenses/expiring")
@with_tenant_context
async def get_expiring_licenses(
    days_ahead: int = Query(90, description="Days to look ahead"),
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get licenses expiring within specified days"""
    try:
        query = """
            SELECT 
                license_id,
                license_type,
                license_number,
                expiry_date,
                pharmacist_name,
                (expiry_date - CURRENT_DATE) as days_until_expiry
            FROM compliance.drug_licenses
            WHERE org_id = :org_id
                AND is_active = true
                AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL ':days_ahead days'
            ORDER BY expiry_date
        """
        
        result = db.execute(text(query), {
            "org_id": str(context.org_id),
            "days_ahead": days_ahead
        })
        
        expiring_licenses = [dict(row._mapping) for row in result]
        
        return {
            "total_expiring": len(expiring_licenses),
            "licenses": expiring_licenses,
            "checked_days_ahead": days_ahead
        }
        
    except Exception as e:
        logger.error(f"Error fetching expiring licenses: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch expiring licenses")

@router.get("/checklist")
@with_tenant_context
async def get_compliance_checklist(
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Get compliance checklist and status
    
    - All compliance requirements
    - Current status
    - Action items
    """
    try:
        checklist = []
        
        # Drug License Status
        license_query = """
            SELECT 
                COUNT(*) as total_licenses,
                COUNT(CASE WHEN expiry_date > CURRENT_DATE THEN 1 END) as valid_licenses,
                MIN(expiry_date) as next_expiry
            FROM compliance.drug_licenses
            WHERE org_id = :org_id AND is_active = true
        """
        
        license_result = db.execute(text(license_query), {"org_id": str(context.org_id)})
        license_data = dict(license_result.first()._mapping)
        
        checklist.append({
            "category": "Drug Licenses",
            "requirement": "Valid drug license required",
            "status": "compliant" if license_data["valid_licenses"] > 0 else "non_compliant",
            "details": f"{license_data['valid_licenses']} of {license_data['total_licenses']} licenses valid",
            "next_action_date": license_data["next_expiry"]
        })
        
        # Pharmacist Registration
        pharmacist_query = """
            SELECT 
                COUNT(DISTINCT pharmacist_registration) as registered_pharmacists,
                MIN(expiry_date) as next_renewal
            FROM compliance.pharmacist_registrations
            WHERE org_id = :org_id AND is_active = true
        """
        
        pharmacist_result = db.execute(text(pharmacist_query), {"org_id": str(context.org_id)})
        pharmacist_data = dict(pharmacist_result.first()._mapping)
        
        checklist.append({
            "category": "Pharmacist Registration",
            "requirement": "Registered pharmacist required during operations",
            "status": "compliant" if pharmacist_data["registered_pharmacists"] > 0 else "non_compliant",
            "details": f"{pharmacist_data['registered_pharmacists']} registered pharmacists",
            "next_action_date": pharmacist_data["next_renewal"]
        })
        
        # Temperature Monitoring
        temp_query = """
            SELECT 
                COUNT(*) as monitored_zones,
                COUNT(CASE WHEN last_reading > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 1 END) as active_zones
            FROM compliance.temperature_zones
            WHERE org_id = :org_id AND is_active = true
        """
        
        temp_result = db.execute(text(temp_query), {"org_id": str(context.org_id)})
        temp_data = dict(temp_result.first()._mapping)
        
        checklist.append({
            "category": "Temperature Monitoring",
            "requirement": "Continuous temperature monitoring for cold storage",
            "status": "compliant" if temp_data["active_zones"] == temp_data["monitored_zones"] else "action_required",
            "details": f"{temp_data['active_zones']} of {temp_data['monitored_zones']} zones actively monitored",
            "next_action_date": None
        })
        
        # Overall compliance score
        compliant_items = len([item for item in checklist if item["status"] == "compliant"])
        total_items = len(checklist)
        compliance_score = (compliant_items / total_items) * 100 if total_items > 0 else 0
        
        return {
            "compliance_score": round(compliance_score, 2),
            "status": "compliant" if compliance_score >= 80 else "action_required",
            "checklist": checklist,
            "last_updated": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Error fetching compliance checklist: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch checklist")

@router.get("/alerts")
@with_tenant_context
async def get_compliance_alerts(
    alert_type: Optional[str] = Query(None),
    include_resolved: bool = Query(False),
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get active compliance alerts"""
    try:
        query = """
            SELECT 
                alert_id,
                alert_type,
                alert_date,
                reference_type,
                reference_id,
                alert_message,
                priority,
                is_resolved,
                resolved_date,
                resolved_by,
                created_at
            FROM compliance.compliance_alerts
            WHERE org_id = :org_id
        """
        
        params = {"org_id": str(context.org_id)}
        
        if not include_resolved:
            query += " AND is_resolved = false"
            
        if alert_type:
            query += " AND alert_type = :alert_type"
            params["alert_type"] = alert_type
            
        query += " ORDER BY priority DESC, alert_date"
        
        result = db.execute(text(query), params)
        alerts = [dict(row._mapping) for row in result]
        
        # Group by alert type
        alerts_by_type = {}
        for alert in alerts:
            alert_type = alert["alert_type"]
            if alert_type not in alerts_by_type:
                alerts_by_type[alert_type] = []
            alerts_by_type[alert_type].append(alert)
        
        return {
            "total_alerts": len(alerts),
            "alerts_by_type": alerts_by_type,
            "critical_alerts": len([a for a in alerts if a.get("priority") == "high"])
        }
        
    except Exception as e:
        logger.error(f"Error fetching alerts: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch alerts")

@router.post("/documents/upload")
@with_tenant_context
async def upload_compliance_document(
    document: ComplianceDocument,
    file_data: Optional[str] = None,  # Base64 encoded file
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Upload compliance-related documents"""
    try:
        insert_query = """
            INSERT INTO compliance.compliance_documents (
                org_id, document_type, document_name, file_data,
                expiry_date, reminder_days, tags, created_by
            ) VALUES (
                :org_id, :document_type, :document_name, :file_data,
                :expiry_date, :reminder_days, :tags, :created_by
            ) RETURNING document_id
        """
        
        result = db.execute(text(insert_query), {
            "org_id": str(context.org_id),
            "document_type": document.document_type,
            "document_name": document.document_name,
            "file_data": file_data,
            "expiry_date": document.expiry_date,
            "reminder_days": document.reminder_days,
            "tags": json.dumps(document.tags) if document.tags else None,
            "created_by": 1
        })
        
        document_id = result.scalar()
        
        # Create expiry reminder if applicable
        if document.expiry_date:
            alert_date = document.expiry_date - timedelta(days=document.reminder_days)
            alert_query = """
                INSERT INTO compliance.compliance_alerts (
                    org_id, alert_type, alert_date, reference_type,
                    reference_id, alert_message, is_active
                ) VALUES (
                    :org_id, 'document_expiry', :alert_date, 'document',
                    :document_id, :message, true
                )
            """
            
            db.execute(text(alert_query), {
                "org_id": str(context.org_id),
                "alert_date": alert_date,
                "document_id": document_id,
                "message": f"Document '{document.document_name}' expiring on {document.expiry_date}"
            })
        
        # TenantAwareSession auto-commits
        
        return {
            "document_id": document_id,
            "message": "Document uploaded successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error uploading document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")

@router.get("/reports/regulatory")
@with_tenant_context
async def generate_regulatory_report(
    report_type: str = Query(..., description="Report type (monthly, quarterly, annual)"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Generate regulatory compliance reports
    
    - Schedule H drug report
    - Narcotic/Psychotropic report
    - Expired/Destroyed items report
    """
    try:
        if not from_date:
            if report_type == "monthly":
                from_date = date.today().replace(day=1)
            elif report_type == "quarterly":
                month = ((date.today().month - 1) // 3) * 3 + 1
                from_date = date.today().replace(month=month, day=1)
            else:  # annual
                from_date = date.today().replace(month=1, day=1)
                
        if not to_date:
            to_date = date.today()
        
        report_data = {
            "report_type": report_type,
            "period": {
                "from_date": from_date,
                "to_date": to_date
            },
            "generated_on": datetime.utcnow(),
            "organization_id": org_id
        }
        
        # Schedule H Drug Sales
        schedule_h_query = """
            SELECT 
                p.product_name,
                p.drug_schedule,
                SUM(ii.quantity) as quantity_sold,
                COUNT(DISTINCT i.invoice_id) as invoice_count,
                COUNT(DISTINCT i.customer_id) as customer_count
            FROM sales.invoice_items ii
            JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
            JOIN inventory.products p ON ii.product_id = p.product_id
            WHERE i.org_id = :org_id
                AND i.invoice_date BETWEEN :from_date AND :to_date
                AND p.drug_schedule IN ('H', 'H1', 'X')
            GROUP BY p.product_id, p.product_name, p.drug_schedule
            ORDER BY p.drug_schedule, quantity_sold DESC
        """
        
        schedule_h_result = db.execute(text(schedule_h_query), {
            "org_id": str(context.org_id),
            "from_date": from_date,
            "to_date": to_date
        })
        
        report_data["schedule_h_drugs"] = [dict(row._mapping) for row in schedule_h_result]
        
        # Expired Products Destroyed
        expired_query = """
            SELECT 
                p.product_name,
                ed.batch_number,
                ed.quantity_destroyed,
                ed.expiry_date,
                ed.destruction_date,
                ed.destruction_method,
                ed.witness_names
            FROM compliance.expired_destructions ed
            JOIN inventory.products p ON ed.product_id = p.product_id
            WHERE ed.org_id = :org_id
                AND ed.destruction_date BETWEEN :from_date AND :to_date
            ORDER BY ed.destruction_date
        """
        
        expired_result = db.execute(text(expired_query), {
            "org_id": str(context.org_id),
            "from_date": from_date,
            "to_date": to_date
        })
        
        report_data["expired_destructions"] = [dict(row._mapping) for row in expired_result]
        
        
        return report_data
        
    except Exception as e:
        logger.error(f"Error generating regulatory report: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate report")
