"""
Compliance Management API
Manages drug licenses, regulatory compliance, and inspections
"""
from typing import Optional, List
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging
import json

from ....core.database import get_db
from ....core.jwt_auth import get_org_id_string  # SECURE: JWT-based auth

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

class ComplianceAudit(BaseModel):
    """Schema for compliance audit"""
    audit_type: str = Field(..., pattern="^(internal|regulatory|third_party|surprise)$")
    audit_date: date
    auditor_name: str
    auditor_organization: Optional[str] = None
    areas_audited: List[str]
    findings: List[dict]  # [{"area": "storage", "status": "compliant", "observations": "...", "corrective_action": "..."}]
    overall_status: str = Field(..., pattern="^(compliant|minor_issues|major_issues|non_compliant)$")
    next_audit_date: Optional[date] = None

class InspectorVisit(BaseModel):
    """Schema for inspector visit"""
    visit_date: date
    inspector_name: str
    inspector_id: str
    inspector_designation: str
    visit_type: str = Field(..., pattern="^(routine|surprise|follow_up|complaint_based)$")
    areas_inspected: List[str]
    violations_found: List[dict] = []
    recommendations: List[str] = []
    follow_up_required: bool = False
    next_visit_date: Optional[date] = None

class ComplianceDocument(BaseModel):
    """Schema for compliance document"""
    document_type: str
    document_name: str
    expiry_date: Optional[date] = None
    reminder_days: int = 30
    tags: Optional[List[str]] = []

@router.post("/drug-licenses", response_model=dict)
async def create_drug_license(
    license: DrugLicenseCreate,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
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
            "org_id": org_id,
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
                "org_id": org_id,
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
            "org_id": org_id,
            "alert_date": license.expiry_date - timedelta(days=30),
            "license_id": license_id,
            "message": f"Drug License {license.license_number} expiring on {license.expiry_date}"
        })
        
        db.commit()
        
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
async def get_drug_licenses(
    org_id: str = Depends(get_org_id_string),
    include_expired: bool = Query(False),
    db: Session = Depends(get_db)
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
        
        result = db.execute(text(query), {"org_id": org_id})
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
async def get_expiring_licenses(
    days_ahead: int = Query(90, description="Days to look ahead"),
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
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
            "org_id": org_id,
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

@router.post("/audits", response_model=dict)
async def record_compliance_audit(
    audit: ComplianceAudit,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """
    Record a compliance audit
    
    - Internal or external audits
    - Track findings and corrective actions
    - Schedule follow-up audits
    """
    try:
        # Insert audit record
        insert_query = """
            INSERT INTO compliance.compliance_audits (
                org_id, audit_type, audit_date, auditor_name,
                auditor_organization, areas_audited, audit_findings,
                overall_status, next_audit_date, created_by
            ) VALUES (
                :org_id, :audit_type, :audit_date, :auditor_name,
                :auditor_organization, :areas_audited, :findings,
                :overall_status, :next_audit_date, :created_by
            ) RETURNING audit_id
        """
        
        result = db.execute(text(insert_query), {
            "org_id": org_id,
            "audit_type": audit.audit_type,
            "audit_date": audit.audit_date,
            "auditor_name": audit.auditor_name,
            "auditor_organization": audit.auditor_organization,
            "areas_audited": json.dumps(audit.areas_audited),
            "findings": json.dumps(audit.findings),
            "overall_status": audit.overall_status,
            "next_audit_date": audit.next_audit_date,
            "created_by": 1
        })
        
        audit_id = result.scalar()
        
        # Create corrective action tasks for non-compliant findings
        for finding in audit.findings:
            if finding.get("status") in ["non_compliant", "major_issues"]:
                if finding.get("corrective_action"):
                    action_query = """
                        INSERT INTO compliance.corrective_actions (
                            org_id, audit_id, area, issue_description,
                            corrective_action, priority, due_date,
                            status, created_by
                        ) VALUES (
                            :org_id, :audit_id, :area, :issue,
                            :action, :priority, :due_date,
                            'pending', :created_by
                        )
                    """
                    
                    # Set due date based on priority
                    priority = "high" if finding["status"] == "non_compliant" else "medium"
                    due_days = 7 if priority == "high" else 30
                    
                    db.execute(text(action_query), {
                        "org_id": org_id,
                        "audit_id": audit_id,
                        "area": finding["area"],
                        "issue": finding.get("observations", ""),
                        "action": finding["corrective_action"],
                        "priority": priority,
                        "due_date": date.today() + timedelta(days=due_days),
                        "created_by": 1
                    })
        
        # Create alert for next audit
        if audit.next_audit_date:
            alert_query = """
                INSERT INTO compliance.compliance_alerts (
                    org_id, alert_type, alert_date, reference_type,
                    reference_id, alert_message, is_active
                ) VALUES (
                    :org_id, 'audit_due', :alert_date, 'audit',
                    :audit_id, :message, true
                )
            """
            
            db.execute(text(alert_query), {
                "org_id": org_id,
                "alert_date": audit.next_audit_date - timedelta(days=7),
                "audit_id": audit_id,
                "message": f"{audit.audit_type.title()} audit scheduled for {audit.next_audit_date}"
            })
        
        db.commit()
        
        return {
            "audit_id": audit_id,
            "message": "Compliance audit recorded successfully",
            "corrective_actions_created": len([f for f in audit.findings if f.get("corrective_action")])
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording audit: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record audit: {str(e)}")

@router.post("/inspector-visits", response_model=dict)
async def record_inspector_visit(
    visit: InspectorVisit,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """
    Record drug inspector visit
    
    - Track inspections and findings
    - Record violations and recommendations
    - Schedule follow-ups
    """
    try:
        insert_query = """
            INSERT INTO compliance.inspector_visits (
                org_id, visit_date, inspector_name, inspector_id,
                inspector_designation, visit_type, areas_inspected,
                violations_found, recommendations, follow_up_required,
                next_visit_date, created_by
            ) VALUES (
                :org_id, :visit_date, :inspector_name, :inspector_id,
                :inspector_designation, :visit_type, :areas_inspected,
                :violations_found, :recommendations, :follow_up_required,
                :next_visit_date, :created_by
            ) RETURNING visit_id
        """
        
        result = db.execute(text(insert_query), {
            "org_id": org_id,
            "visit_date": visit.visit_date,
            "inspector_name": visit.inspector_name,
            "inspector_id": visit.inspector_id,
            "inspector_designation": visit.inspector_designation,
            "visit_type": visit.visit_type,
            "areas_inspected": json.dumps(visit.areas_inspected),
            "violations_found": json.dumps(visit.violations_found),
            "recommendations": json.dumps(visit.recommendations),
            "follow_up_required": visit.follow_up_required,
            "next_visit_date": visit.next_visit_date,
            "created_by": 1
        })
        
        visit_id = result.scalar()
        
        # Create corrective actions for violations
        for violation in visit.violations_found:
            action_query = """
                INSERT INTO compliance.corrective_actions (
                    org_id, visit_id, area, issue_description,
                    corrective_action, priority, due_date,
                    status, created_by
                ) VALUES (
                    :org_id, :visit_id, :area, :issue,
                    :action, :priority, :due_date,
                    'pending', :created_by
                )
            """
            
            db.execute(text(action_query), {
                "org_id": org_id,
                "visit_id": visit_id,
                "area": violation.get("area", "general"),
                "issue": violation.get("description", ""),
                "action": violation.get("required_action", "Address violation"),
                "priority": violation.get("severity", "high"),
                "due_date": date.today() + timedelta(days=violation.get("deadline_days", 15)),
                "created_by": 1
            })
        
        db.commit()
        
        return {
            "visit_id": visit_id,
            "message": "Inspector visit recorded successfully",
            "violations_count": len(visit.violations_found),
            "follow_up_required": visit.follow_up_required
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording inspector visit: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record visit: {str(e)}")

@router.get("/checklist")
async def get_compliance_checklist(
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
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
        
        license_result = db.execute(text(license_query), {"org_id": org_id})
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
        
        pharmacist_result = db.execute(text(pharmacist_query), {"org_id": org_id})
        pharmacist_data = dict(pharmacist_result.first()._mapping)
        
        checklist.append({
            "category": "Pharmacist Registration",
            "requirement": "Registered pharmacist required during operations",
            "status": "compliant" if pharmacist_data["registered_pharmacists"] > 0 else "non_compliant",
            "details": f"{pharmacist_data['registered_pharmacists']} registered pharmacists",
            "next_action_date": pharmacist_data["next_renewal"]
        })
        
        # Recent Audits
        audit_query = """
            SELECT 
                MAX(audit_date) as last_audit,
                MIN(next_audit_date) as next_audit
            FROM compliance.compliance_audits
            WHERE org_id = :org_id
        """
        
        audit_result = db.execute(text(audit_query), {"org_id": org_id})
        audit_data = dict(audit_result.first()._mapping)
        
        days_since_audit = (date.today() - audit_data["last_audit"]).days if audit_data["last_audit"] else 999
        
        checklist.append({
            "category": "Compliance Audits",
            "requirement": "Regular compliance audits required",
            "status": "compliant" if days_since_audit < 180 else "action_required",
            "details": f"Last audit: {audit_data['last_audit'] or 'Never'}",
            "next_action_date": audit_data["next_audit"]
        })
        
        # Temperature Monitoring
        temp_query = """
            SELECT 
                COUNT(*) as monitored_zones,
                COUNT(CASE WHEN last_reading > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 1 END) as active_zones
            FROM compliance.temperature_zones
            WHERE org_id = :org_id AND is_active = true
        """
        
        temp_result = db.execute(text(temp_query), {"org_id": org_id})
        temp_data = dict(temp_result.first()._mapping)
        
        checklist.append({
            "category": "Temperature Monitoring",
            "requirement": "Continuous temperature monitoring for cold storage",
            "status": "compliant" if temp_data["active_zones"] == temp_data["monitored_zones"] else "action_required",
            "details": f"{temp_data['active_zones']} of {temp_data['monitored_zones']} zones actively monitored",
            "next_action_date": None
        })
        
        # Pending Corrective Actions
        actions_query = """
            SELECT 
                COUNT(*) as total_actions,
                COUNT(CASE WHEN status = 'pending' AND due_date < CURRENT_DATE THEN 1 END) as overdue_actions
            FROM compliance.corrective_actions
            WHERE org_id = :org_id AND status = 'pending'
        """
        
        actions_result = db.execute(text(actions_query), {"org_id": org_id})
        actions_data = dict(actions_result.first()._mapping)
        
        checklist.append({
            "category": "Corrective Actions",
            "requirement": "All corrective actions must be completed on time",
            "status": "action_required" if actions_data["overdue_actions"] > 0 else "compliant",
            "details": f"{actions_data['total_actions']} pending actions, {actions_data['overdue_actions']} overdue",
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
async def get_compliance_alerts(
    alert_type: Optional[str] = Query(None),
    include_resolved: bool = Query(False),
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
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
        
        params = {"org_id": org_id}
        
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
async def upload_compliance_document(
    document: ComplianceDocument,
    file_data: Optional[str] = None,  # Base64 encoded file
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
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
            "org_id": org_id,
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
                "org_id": org_id,
                "alert_date": alert_date,
                "document_id": document_id,
                "message": f"Document '{document.document_name}' expiring on {document.expiry_date}"
            })
        
        db.commit()
        
        return {
            "document_id": document_id,
            "message": "Document uploaded successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error uploading document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")

@router.get("/reports/regulatory")
async def generate_regulatory_report(
    report_type: str = Query(..., description="Report type (monthly, quarterly, annual)"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
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
            "org_id": org_id,
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
            "org_id": org_id,
            "from_date": from_date,
            "to_date": to_date
        })
        
        report_data["expired_destructions"] = [dict(row._mapping) for row in expired_result]
        
        # Compliance Summary
        summary_query = """
            SELECT 
                (SELECT COUNT(*) FROM compliance.compliance_audits 
                 WHERE org_id = :org_id AND audit_date BETWEEN :from_date AND :to_date) as audits_conducted,
                (SELECT COUNT(*) FROM compliance.inspector_visits 
                 WHERE org_id = :org_id AND visit_date BETWEEN :from_date AND :to_date) as inspector_visits,
                (SELECT COUNT(*) FROM compliance.corrective_actions 
                 WHERE org_id = :org_id AND created_at BETWEEN :from_date AND :to_date) as corrective_actions,
                (SELECT COUNT(*) FROM compliance.corrective_actions 
                 WHERE org_id = :org_id AND status = 'completed' 
                 AND updated_at BETWEEN :from_date AND :to_date) as actions_completed
        """
        
        summary_result = db.execute(text(summary_query), {
            "org_id": org_id,
            "from_date": from_date,
            "to_date": to_date
        })
        
        report_data["compliance_summary"] = dict(summary_result.first()._mapping)
        
        return report_data
        
    except Exception as e:
        logger.error(f"Error generating regulatory report: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate report")