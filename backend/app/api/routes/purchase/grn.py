"""
Goods Receipt Notes (GRN) API Router
Manages goods receipt against purchase orders

MODERNIZED: Uses TenantAwareSession + PermissionChecker
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, and_
import logging
from datetime import date, datetime
from uuid import UUID

# Modern imports
from ....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from ....core.auth.org_context import OrgContext, get_org_context
from ....core.security.permissions import PermissionChecker
from ...services.document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["goods-receipt-notes"])

@router.get("/generate-number")
@with_tenant_context
def generate_grn_number(
    _: dict = Depends(PermissionChecker("inventory", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Generate next GRN number using unified service"""
    try:
        # Use unified document number service
        new_number = DocumentNumberService.generate_number(db, "grn", str(context.org_id))
        db.commit()
        return {"grn_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate GRN number: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate GRN number: {str(e)}")

@router.post("")
@with_tenant_context
async def create_grn(
    grn_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("inventory", "create")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Create a new Goods Receipt Note
    
    Uses GRNService for centralized business logic (DRY principle)
    """
    try:
        # Import service here to avoid circular imports
        from ...services.purchase import GRNService

        items = grn_data.get("items") or []
        if not items:
            raise HTTPException(status_code=400, detail="At least one GRN item is required")
        
        # Get context values
        org_id = str(context.org_id)
        user_id = context.user_id
        branch_id = grn_data.get("branch_id") or context.primary_branch_id
        
        # Call service layer - all business logic is centralized there
        result = GRNService.create_grn(
            db=db,
            org_id=org_id,
            branch_id=branch_id,
            grn_data=grn_data,
            user_id=user_id
        )
        
        db.commit()
        
        return {
            "success": True,
            "grn_id": result["grn_id"],
            "grn_no": result["grn_number"],
            "items_created": result.get("items_created", 0),
            "batches_created": result.get("batches_created", 0),
            "stock_updated": result.get("stock_updated", False),
            "message": "GRN created successfully"
        }
        
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create GRN: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create GRN: {str(e)}")


@router.get("")
@with_tenant_context
def get_grns(
    skip: int = Query(0, description="Number of records to skip"),
    limit: int = Query(50, description="Number of records to return"),
    search: Optional[str] = Query(None, description="Search by GRN number or supplier"),
    grn_status: Optional[str] = Query(None, description="Filter by GRN status"),
    supplier_id: Optional[int] = Query(None, description="Filter by supplier"),
    date_from: Optional[date] = Query(None, description="Filter from date"),
    date_to: Optional[date] = Query(None, description="Filter to date"),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get list of GRNs with filtering and pagination"""
    try:
        org_id = str(context.org_id)
        
        # Build base query
        where_conditions = ["g.org_id = :org_id"]
        params = {"org_id": org_id}
        
        if search:
            where_conditions.append("(g.grn_number ILIKE :search OR s.supplier_name ILIKE :search)")
            params["search"] = f"%{search}%"
        
        if grn_status:
            where_conditions.append("g.grn_status = :grn_status")
            params["grn_status"] = grn_status
        
        if supplier_id:
            where_conditions.append("g.supplier_id = :supplier_id")
            params["supplier_id"] = supplier_id
        
        if date_from:
            where_conditions.append("g.grn_date >= :date_from")
            params["date_from"] = date_from
        
        if date_to:
            where_conditions.append("g.grn_date <= :date_to")
            params["date_to"] = date_to
        
        where_clause = " AND ".join(where_conditions)
        
        # Get total count
        count_sql = f"""
            SELECT COUNT(*)
            FROM procurement.goods_receipt_notes g
            LEFT JOIN parties.suppliers s ON g.supplier_id = s.supplier_id
            WHERE {where_clause}
        """
        
        total = db.execute(text(count_sql), params).scalar()
        
        # Get paginated results
        query_sql = f"""
            SELECT 
                g.grn_id,
                g.grn_number,
                g.grn_date,
                g.grn_status,
                g.qc_status,
                g.supplier_id,
                s.supplier_name,
                g.supplier_invoice_number,
                g.supplier_invoice_date,
                g.purchase_order_id,
                g.calculated_amount,
                g.supplier_amount,
                g.variance_amount,
                g.stock_updated,
                g.created_at,
                g.updated_at,
                COUNT(gi.grn_item_id) as items_count
            FROM procurement.goods_receipt_notes g
            LEFT JOIN parties.suppliers s ON g.supplier_id = s.supplier_id  
            LEFT JOIN procurement.grn_items gi ON g.grn_id = gi.grn_id
            WHERE {where_clause}
            GROUP BY g.grn_id, s.supplier_name
            ORDER BY g.created_at DESC
            LIMIT :limit OFFSET :offset
        """
        
        params["limit"] = limit
        params["offset"] = skip
        
        result = db.execute(text(query_sql), params)
        grns = [dict(row._mapping) for row in result]
        
        return {
            "data": grns,
            "total": total,
            "page": (skip // limit) + 1,
            "pages": (total + limit - 1) // limit,
            "per_page": limit
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch GRNs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch GRNs: {str(e)}")

@router.get("/{grn_id}")
@with_tenant_context
def get_grn_details(
    grn_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get detailed GRN information"""
    try:
        org_id = str(context.org_id)
        
        # Get GRN header
        grn_sql = """
            SELECT 
                g.*,
                s.supplier_name,
                s.contact_person_name,
                s.primary_phone,
                s.primary_email,
                s.gst_number,
                u.username as received_by_name
            FROM procurement.goods_receipt_notes g
            LEFT JOIN parties.suppliers s ON g.supplier_id = s.supplier_id
            LEFT JOIN master.org_users u ON g.received_by = u.user_id
            WHERE g.grn_id = :grn_id AND g.org_id = :org_id
        """
        
        result = db.execute(text(grn_sql), {"grn_id": grn_id, "org_id": org_id})
        grn = result.first()
        
        if not grn:
            raise HTTPException(status_code=404, detail="GRN not found")
        
        # Get GRN items
        items_sql = """
            SELECT 
                gi.*,
                p.product_name,
                p.manufacturer,
                p.hsn_code,
                p.gst_percent
            FROM procurement.grn_items gi
            LEFT JOIN inventory.products p ON gi.product_id = p.product_id
            WHERE gi.grn_id = :grn_id
            ORDER BY gi.display_order
        """
        
        items_result = db.execute(text(items_sql), {"grn_id": grn_id})
        items = [dict(row._mapping) for row in items_result]
        
        grn_dict = dict(grn._mapping)
        grn_dict["items"] = items
        
        return grn_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch GRN details: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch GRN details: {str(e)}")

@router.put("/{grn_id}")
@with_tenant_context
def update_grn(
    grn_id: int,
    grn_data: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
    
):
    """Update GRN details"""
    try:
        org_id = str(context.org_id)
        
        # Check if GRN exists
        check_sql = "SELECT grn_id FROM procurement.goods_receipt_notes WHERE grn_id = :grn_id AND org_id = :org_id"
        existing = db.execute(text(check_sql), {"grn_id": grn_id, "org_id": org_id}).first()
        
        if not existing:
            raise HTTPException(status_code=404, detail="GRN not found")
        
        # Update GRN
        update_data = {
            "grn_id": grn_id,
            "notes": grn_data.get("notes"),
            "qc_status": grn_data.get("qc_status"),
            "grn_status": grn_data.get("grn_status"),
            "updated_at": datetime.now()
        }
        
        update_sql = """
            UPDATE procurement.goods_receipt_notes 
            SET notes = :notes, qc_status = :qc_status, grn_status = :grn_status, updated_at = :updated_at
            WHERE grn_id = :grn_id
        """
        
        db.execute(text(update_sql), update_data)
        db.commit()
        
        return {"success": True, "message": "GRN updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update GRN: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update GRN: {str(e)}")

@router.post("/{grn_id}/approve")
@with_tenant_context
def approve_grn(
    grn_id: int,
    approval_data: Dict[str, Any],
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context),
    
):
    """
    Approve GRN and update stock if not already done
    
    Uses GRNService for centralized business logic
    """
    try:
        # Import service here to avoid circular imports
        from ...services.purchase import GRNService
        
        org_id = str(context.org_id)
        user_id = context.user_id
        
        # Call service layer
        result = GRNService.approve_grn(
            db=db,
            grn_id=grn_id,
            org_id=org_id,
            user_id=user_id,
            notes=approval_data.get("notes")
        )
        
        db.commit()
        
        return {
            "success": True, 
            "message": result.get("message", "GRN approved successfully"),
            "batches_created": result.get("batches_created", 0)
        }
        
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to approve GRN: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to approve GRN: {str(e)}")
