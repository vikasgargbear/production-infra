"""
Organization settings and profile management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, Optional
import json
import uuid
from datetime import datetime

from ...database import get_db
from ...core.auth import get_current_org

router = APIRouter(prefix="/organizations", tags=["organizations"])

@router.get("/{org_id}")
async def get_organization_profile(
    org_id: str,
    db: Session = Depends(get_db),
    current_org: Dict = Depends(get_current_org)
):
    """Get organization profile and settings"""
    try:
        # Verify user has access to this org
        if str(current_org["org_id"]) != org_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        
        result = db.execute(text("""
            SELECT 
                org_id,
                org_name,
                business_type,
                company_registration_number,
                pan_number,
                gst_number,
                drug_license_number,
                primary_contact_name,
                primary_email,
                primary_phone,
                business_address,
                business_settings,
                features_enabled,
                plan_type,
                subscription_status,
                max_users,
                max_products,
                max_customers,
                max_monthly_transactions,
                created_at,
                updated_at
            FROM organizations
            WHERE org_id = :org_id AND is_active = true
        """), {"org_id": org_id}).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Convert row to dict
        org_data = {
            "org_id": str(result.org_id),
            "org_name": result.org_name,
            "business_type": result.business_type,
            "company_registration_number": result.company_registration_number,
            "pan_number": result.pan_number,
            "gst_number": result.gst_number,
            "drug_license_number": result.drug_license_number,
            "primary_contact_name": result.primary_contact_name,
            "primary_email": result.primary_email,
            "primary_phone": result.primary_phone,
            "business_address": result.business_address or {},
            "business_settings": result.business_settings or {},
            "features_enabled": result.features_enabled or ["basic_erp"],
            "plan_type": result.plan_type,
            "subscription_status": result.subscription_status,
            "limits": {
                "max_users": result.max_users,
                "max_products": result.max_products,
                "max_customers": result.max_customers,
                "max_monthly_transactions": result.max_monthly_transactions
            },
            "created_at": result.created_at.isoformat() if result.created_at else None,
            "updated_at": result.updated_at.isoformat() if result.updated_at else None
        }
        
        return {"success": True, "data": org_data}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch organization: {str(e)}")

@router.put("/{org_id}")
async def update_organization_profile(
    org_id: str,
    profile_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_org: Dict = Depends(get_current_org)
):
    """Update organization profile and basic settings"""
    try:
        # Verify user has access to this org
        if str(current_org["org_id"]) != org_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        
        # Build update query dynamically based on provided fields
        allowed_fields = [
            "org_name", "business_type", "company_registration_number",
            "pan_number", "gst_number", "drug_license_number",
            "primary_contact_name", "primary_email", "primary_phone"
        ]
        
        update_fields = []
        update_values = {"org_id": org_id}
        
        for field in allowed_fields:
            if field in profile_data:
                update_fields.append(f"{field} = :{field}")
                update_values[field] = profile_data[field]
        
        # Handle business_address separately (JSONB field)
        if "business_address" in profile_data:
            update_fields.append("business_address = :business_address")
            update_values["business_address"] = json.dumps(profile_data["business_address"])
        
        # Handle business_settings separately (JSONB field)
        if "business_settings" in profile_data:
            # Merge with existing settings
            existing = db.execute(text(
                "SELECT business_settings FROM organizations WHERE org_id = :org_id"
            ), {"org_id": org_id}).scalar()
            
            existing_settings = existing or {}
            existing_settings.update(profile_data["business_settings"])
            
            update_fields.append("business_settings = :business_settings")
            update_values["business_settings"] = json.dumps(existing_settings)
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        
        # Add updated_at
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        # Set context for audit log
        db.execute(text("SET LOCAL app.current_user_id = :user_id"), {
            "user_id": current_org.get("user_id", 1)  # Use actual user ID when auth is implemented
        })
        db.execute(text("SET LOCAL app.change_source = 'api'"))
        
        # Execute update
        query = f"""
            UPDATE organizations 
            SET {', '.join(update_fields)}
            WHERE org_id = :org_id
            RETURNING org_id
        """
        
        result = db.execute(text(query), update_values).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        db.commit()
        
        return {
            "success": True,
            "message": "Organization profile updated successfully",
            "org_id": str(result.org_id)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update organization: {str(e)}")

@router.get("/{org_id}/features")
async def get_feature_settings(
    org_id: str,
    db: Session = Depends(get_db),
    current_org: Dict = Depends(get_current_org)
):
    """Get organization feature settings"""
    try:
        # Verify user has access to this org
        if str(current_org["org_id"]) != org_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        
        result = db.execute(text("""
            SELECT business_settings, features_enabled
            FROM organizations
            WHERE org_id = :org_id
        """), {"org_id": org_id}).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Extract feature settings from business_settings
        business_settings = result.business_settings or {}
        feature_settings = business_settings.get("features", {})
        
        # Provide default feature settings if not set
        default_features = {
            # Inventory Features
            "allowNegativeStock": False,
            "expiryDateMandatory": True,
            "batchWiseTracking": True,
            "stockAdjustmentApproval": False,
            "lowStockAlerts": True,
            
            # Sales Features
            "creditLimitForParties": True,
            "creditLimitThreshold": 100000,
            "salesReturnFlow": "with-credit-note",
            "salesApprovalRequired": False,
            "discountLimit": 20,
            
            # Purchase Features
            "grnWorkflow": True,
            "purchaseApprovalLimit": 50000,
            "autoGeneratePurchaseOrder": False,
            "vendorRatingSystem": False,
            
            # E-Way Bill
            "ewayBillEnabled": True,
            "ewayBillThreshold": 50000,
            "autoGenerateEwayBill": False,
            
            # GST Features
            "gstRoundOff": True,
            "reverseChargeApplicable": False,
            "compositionScheme": False,
            "tcsApplicable": False,
            
            # Payment Features
            "allowPartialPayments": True,
            "autoReconciliation": False,
            "paymentReminders": True,
            "reminderDays": [7, 15, 30],
            
            # General Features
            "multiCurrency": False,
            "multiLocation": True,
            "barcodeScannerIntegration": False,
            "smsNotifications": False,
            "emailNotifications": True,
            "whatsappNotifications": False,
            
            # Security Features
            "twoFactorAuth": False,
            "ipRestriction": False,
            "sessionTimeout": 30,
            "passwordComplexity": "medium",
            
            # Workflow Features
            "purchaseWorkflow": True,
            "salesWorkflow": False,
            "paymentApproval": True,
            "returnApproval": True
        }
        
        # Merge with existing settings
        for key, value in feature_settings.items():
            default_features[key] = value
        
        return {
            "success": True,
            "data": {
                "features": default_features,
                "features_enabled": result.features_enabled or ["basic_erp"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch feature settings: {str(e)}")

@router.put("/{org_id}/features")
async def update_feature_settings(
    org_id: str,
    features: Dict[str, Any],
    db: Session = Depends(get_db),
    current_org: Dict = Depends(get_current_org)
):
    """Update organization feature settings"""
    try:
        # Verify user has access to this org
        if str(current_org["org_id"]) != org_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        
        # Get existing business_settings
        result = db.execute(text("""
            SELECT business_settings
            FROM organizations
            WHERE org_id = :org_id
        """), {"org_id": org_id}).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Update business_settings with new features
        business_settings = result.business_settings or {}
        business_settings["features"] = features
        business_settings["features_last_updated"] = datetime.utcnow().isoformat()
        
        # Set context for audit log
        db.execute(text("SET LOCAL app.current_user_id = :user_id"), {
            "user_id": current_org.get("user_id", 1)  # Use actual user ID when auth is implemented
        })
        db.execute(text("SET LOCAL app.change_source = 'api'"))
        
        # Update in database
        db.execute(text("""
            UPDATE organizations
            SET business_settings = :settings,
                updated_at = CURRENT_TIMESTAMP
            WHERE org_id = :org_id
        """), {
            "org_id": org_id,
            "settings": json.dumps(business_settings)
        })
        
        db.commit()
        
        return {
            "success": True,
            "message": "Feature settings updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update feature settings: {str(e)}")

@router.post("/{org_id}/logo")
async def upload_organization_logo(
    org_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_org: Dict = Depends(get_current_org)
):
    """Upload organization logo"""
    try:
        # Verify user has access to this org
        if str(current_org["org_id"]) != org_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        
        # Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed")
        
        # Validate file size (max 5MB)
        contents = await file.read()
        if len(contents) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB")
        
        # TODO: Save file to storage (S3, local, etc.)
        # For now, we'll just update the business_settings with a placeholder
        
        # Get existing business_settings
        result = db.execute(text("""
            SELECT business_settings
            FROM organizations
            WHERE org_id = :org_id
        """), {"org_id": org_id}).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        business_settings = result.business_settings or {}
        business_settings["logo_uploaded"] = True
        business_settings["logo_upload_date"] = datetime.utcnow().isoformat()
        
        # Update in database
        db.execute(text("""
            UPDATE organizations
            SET business_settings = :settings,
                updated_at = CURRENT_TIMESTAMP
            WHERE org_id = :org_id
        """), {
            "org_id": org_id,
            "settings": json.dumps(business_settings)
        })
        
        db.commit()
        
        return {
            "success": True,
            "message": "Logo uploaded successfully",
            "filename": file.filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload logo: {str(e)}")