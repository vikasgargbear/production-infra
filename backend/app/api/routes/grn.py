"""
Goods Receipt Notes (GRN) API Router
Manages goods receipt against purchase orders
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, and_
import logging
from datetime import date, datetime
from uuid import UUID

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header
from ...dependencies import get_current_org_id, get_current_user_id
from ..services.document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["goods-receipt-notes"])

@router.get("/generate-number")
def generate_grn_number(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_current_org_id)
,
    org_id: str = Depends(get_org_id_from_header)
):
    """Generate next GRN number using unified service"""
    try:
        # Use unified document number service
        new_number = DocumentNumberService.generate_number(db, "grn", org_id)
        return {"grn_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate GRN number: {e}")
        # Use service's fallback mechanism
        current_year = datetime.now().year % 100
        timestamp = int(datetime.now().timestamp() * 1000) % 100000000
        fallback_number = f"GRN-{current_year:02d}{timestamp:08d}"
        return {"grn_number": fallback_number}

@router.post("")
async def create_grn(
    grn_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_current_org_id),
    user_id: Optional[int] = Depends(get_current_user_id)
,
    org_id: str = Depends(get_org_id_from_header)
):
    """Create a new Goods Receipt Note"""
    try:
        # Extract main GRN data
        main_data = {
            "org_id": org_id,
            "branch_id": grn_data.get("branch_id", 1),
            "grn_number": grn_data.get("grn_no") or grn_data.get("grn_number"),
            "grn_date": grn_data.get("grn_date"),
            "grn_type": grn_data.get("grn_type", "regular"),
            "purchase_order_id": grn_data.get("po_reference"),
            "supplier_id": grn_data.get("supplier_id"),
            "supplier_invoice_number": grn_data.get("supplier_invoice_no"),
            "supplier_invoice_date": grn_data.get("supplier_invoice_date"),
            "supplier_challan_number": grn_data.get("challan_number"),
            "supplier_challan_date": grn_data.get("challan_date"),
            "received_by": user_id if user_id else None,
            "received_at": datetime.now(),
            "transport_mode": grn_data.get("transport_mode", "Road"),
            "vehicle_number": grn_data.get("vehicle_no"),
            "lr_number": grn_data.get("lr_number"),
            "lr_date": grn_data.get("lr_date"),
            "qc_required": grn_data.get("qc_required", False),
            "qc_status": "pending" if grn_data.get("qc_required") else "not_required",
            "supplier_amount": grn_data.get("supplier_amount"),
            "calculated_amount": grn_data.get("total_amount"),
            "grn_status": "created",
            "stock_updated": False,
            "notes": grn_data.get("notes"),
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        # Insert main GRN record
        insert_grn_sql = """
            INSERT INTO procurement.goods_receipt_notes (
                org_id, branch_id, grn_number, grn_date, grn_type,
                purchase_order_id, supplier_id, supplier_invoice_number, 
                supplier_invoice_date, supplier_challan_number, supplier_challan_date,
                received_by, received_at, transport_mode, vehicle_number,
                lr_number, lr_date, qc_required, qc_status,
                supplier_amount, calculated_amount, grn_status, stock_updated,
                notes, created_at, updated_at
            )
            VALUES (
                :org_id, :branch_id, :grn_number, :grn_date, :grn_type,
                :purchase_order_id, :supplier_id, :supplier_invoice_number,
                :supplier_invoice_date, :supplier_challan_number, :supplier_challan_date,
                :received_by, :received_at, :transport_mode, :vehicle_number,
                :lr_number, :lr_date, :qc_required, :qc_status,
                :supplier_amount, :calculated_amount, :grn_status, :stock_updated,
                :notes, :created_at, :updated_at
            )
            RETURNING grn_id
        """
        
        result = db.execute(text(insert_grn_sql), main_data)
        grn_id = result.fetchone()[0]
        
        # Insert GRN items
        items = grn_data.get("items", [])
        for idx, item in enumerate(items):
            item_data = {
                "grn_id": grn_id,
                "product_id": item.get("product_id"),
                "batch_number": item.get("batch_no") or item.get("batch_number"),
                "manufacturing_date": item.get("mfg_date"),
                "expiry_date": item.get("expiry_date"),
                "ordered_quantity": item.get("ordered_quantity", 0),
                "received_quantity": item.get("quantity") or item.get("received_quantity"),
                "accepted_quantity": item.get("accepted_quantity") or item.get("quantity"),
                "rejected_quantity": item.get("rejected_quantity", 0),
                "free_quantity": item.get("free_quantity", 0),
                "uom": item.get("uom", "Strip"),
                "pack_type": item.get("pack_type", "STRIP"),
                "pack_size": item.get("pack_size", 10),
                "unit_price": item.get("purchase_price") or item.get("unit_price"),
                "mrp": item.get("mrp"),
                "ptr": item.get("ptr"),
                "pts": item.get("pts"),
                "qc_status": "pending" if main_data["qc_required"] else "approved",
                "item_status": "received",
                "display_order": idx + 1,
                "created_at": datetime.now()
            }
            
            insert_item_sql = """
                INSERT INTO procurement.grn_items (
                    grn_id, product_id, batch_number, manufacturing_date, expiry_date,
                    ordered_quantity, received_quantity, accepted_quantity, rejected_quantity,
                    free_quantity, uom, pack_type, pack_size, unit_price, mrp, ptr, pts,
                    qc_status, item_status, display_order, created_at
                )
                VALUES (
                    :grn_id, :product_id, :batch_number, :manufacturing_date, :expiry_date,
                    :ordered_quantity, :received_quantity, :accepted_quantity, :rejected_quantity,
                    :free_quantity, :uom, :pack_type, :pack_size, :unit_price, :mrp, :ptr, :pts,
                    :qc_status, :item_status, :display_order, :created_at
                )
            """
            
            db.execute(text(insert_item_sql), item_data)
        
        # Update inventory for accepted items (if not requiring QC)
        if not main_data["qc_required"]:
            for item in items:
                # Insert into batches table
                batch_data = {
                    "org_id": org_id,
                    "product_id": item.get("product_id"),
                    "batch_number": item.get("batch_no") or item.get("batch_number"),
                    "manufacturing_date": item.get("mfg_date"),
                    "expiry_date": item.get("expiry_date"),
                    "mrp": item.get("mrp"),
                    "quantity_received": item.get("quantity"),
                    "quantity_available": item.get("quantity"),
                    "cost_per_unit": item.get("purchase_price"),
                    "supplier_id": grn_data.get("supplier_id"),
                    "reference_type": "GRN",
                    "reference_id": grn_id,
                    "batch_status": "available",
                    "storage_temperature": item.get("storage_conditions", "room_temperature"),
                    "created_at": datetime.now(),
                    "updated_at": datetime.now()
                }
                
                # Insert or update batch
                upsert_batch_sql = """
                    INSERT INTO inventory.batches (
                        org_id, product_id, batch_number, manufacturing_date, expiry_date,
                        mrp, quantity_received, quantity_available, cost_per_unit,
                        supplier_id, reference_type, reference_id, batch_status,
                        storage_temperature, created_at, updated_at
                    )
                    VALUES (
                        :org_id, :product_id, :batch_number, :manufacturing_date, :expiry_date,
                        :mrp, :quantity_received, :quantity_available, :cost_per_unit,
                        :supplier_id, :reference_type, :reference_id, :batch_status,
                        :storage_temperature, :created_at, :updated_at
                    )
                    ON CONFLICT (org_id, product_id, batch_number) 
                    DO UPDATE SET 
                        quantity_received = inventory.batches.quantity_received + EXCLUDED.quantity_received,
                        quantity_available = inventory.batches.quantity_available + EXCLUDED.quantity_available,
                        updated_at = EXCLUDED.updated_at
                """
                
                db.execute(text(upsert_batch_sql), batch_data)
            
            # Mark stock as updated
            db.execute(
                text("UPDATE procurement.goods_receipt_notes SET stock_updated = true, stock_updated_at = :now WHERE grn_id = :grn_id"),
                {"now": datetime.now(), "grn_id": grn_id}
            )
        
        db.commit()
        
        return {
            "success": True,
            "grn_id": grn_id,
            "grn_no": main_data["grn_number"],
            "message": "GRN created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create GRN: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create GRN: {str(e)}")

@router.get("")
def get_grns(
    skip: int = Query(0, description="Number of records to skip"),
    limit: int = Query(50, description="Number of records to return"),
    search: Optional[str] = Query(None, description="Search by GRN number or supplier"),
    grn_status: Optional[str] = Query(None, description="Filter by GRN status"),
    supplier_id: Optional[int] = Query(None, description="Filter by supplier"),
    date_from: Optional[date] = Query(None, description="Filter from date"),
    date_to: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_current_org_id),
,
    org_id: str = Depends(get_org_id_from_header)
):
    """Get list of GRNs with filtering and pagination"""
    try:
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
def get_grn_details(
    grn_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_current_org_id),
,
    org_id: str = Depends(get_org_id_from_header)
):
    """Get detailed GRN information"""
    try:
        # Get GRN header
        grn_sql = """
            SELECT 
                g.*,
                s.supplier_name,
                s.contact_person,
                s.phone,
                s.email,
                s.address_line1,
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
                p.gst_percentage
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
def update_grn(
    grn_id: int,
    grn_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_current_org_id),
    user_id: Optional[int] = Depends(get_current_user_id)
,
    org_id: str = Depends(get_org_id_from_header)
):
    """Update GRN details"""
    try:
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
def approve_grn(
    grn_id: int,
    approval_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_current_org_id),
    user_id: Optional[int] = Depends(get_current_user_id)
,
    org_id: str = Depends(get_org_id_from_header)
):
    """Approve GRN and update stock if not already done"""
    try:
        # Check if GRN exists and get details
        check_sql = """
            SELECT grn_id, grn_status, stock_updated 
            FROM procurement.goods_receipt_notes 
            WHERE grn_id = :grn_id AND org_id = :org_id
        """
        grn = db.execute(text(check_sql), {"grn_id": grn_id, "org_id": org_id}).first()
        
        if not grn:
            raise HTTPException(status_code=404, detail="GRN not found")
        
        # Update approval status
        approve_sql = """
            UPDATE procurement.goods_receipt_notes 
            SET approval_status = 'approved', approved_by = :user_id, approved_at = :now,
                grn_status = 'approved', updated_at = :now
            WHERE grn_id = :grn_id
        """
        
        db.execute(text(approve_sql), {
            "grn_id": grn_id,
            "user_id": user_id if user_id else None,
            "now": datetime.now()
        })
        
        # Update stock if not already done
        if not grn["stock_updated"]:
            # Get GRN items
            items_sql = """
                SELECT gi.*, g.supplier_id
                FROM procurement.grn_items gi
                JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
                WHERE gi.grn_id = :grn_id
            """
            
            items = db.execute(text(items_sql), {"grn_id": grn_id})
            
            for item in items:
                item_dict = dict(item._mapping)
                
                # Update batch inventory
                batch_data = {
                    "org_id": org_id,
                    "product_id": item_dict["product_id"],
                    "batch_number": item_dict["batch_number"],
                    "manufacturing_date": item_dict["manufacturing_date"],
                    "expiry_date": item_dict["expiry_date"],
                    "mrp": item_dict["mrp"],
                    "quantity_received": item_dict["accepted_quantity"],
                    "quantity_available": item_dict["accepted_quantity"],
                    "cost_per_unit": item_dict["unit_price"],
                    "supplier_id": item_dict["supplier_id"],
                    "reference_type": "GRN",
                    "reference_id": grn_id,
                    "batch_status": "available",
                    "created_at": datetime.now(),
                    "updated_at": datetime.now()
                }
                
                # Insert or update batch
                upsert_batch_sql = """
                    INSERT INTO inventory.batches (
                        org_id, product_id, batch_number, manufacturing_date, expiry_date,
                        mrp, quantity_received, quantity_available, cost_per_unit,
                        supplier_id, reference_type, reference_id, batch_status,
                        created_at, updated_at
                    )
                    VALUES (
                        :org_id, :product_id, :batch_number, :manufacturing_date, :expiry_date,
                        :mrp, :quantity_received, :quantity_available, :cost_per_unit,
                        :supplier_id, :reference_type, :reference_id, :batch_status,
                        :created_at, :updated_at
                    )
                    ON CONFLICT (org_id, product_id, batch_number) 
                    DO UPDATE SET 
                        quantity_received = inventory.batches.quantity_received + EXCLUDED.quantity_received,
                        quantity_available = inventory.batches.quantity_available + EXCLUDED.quantity_available,
                        updated_at = EXCLUDED.updated_at
                """
                
                db.execute(text(upsert_batch_sql), batch_data)
            
            # Mark stock as updated
            stock_update_sql = """
                UPDATE procurement.goods_receipt_notes 
                SET stock_updated = true, stock_updated_at = :now 
                WHERE grn_id = :grn_id
            """
            
            db.execute(text(stock_update_sql), {"grn_id": grn_id, "now": datetime.now()})
        
        db.commit()
        
        return {"success": True, "message": "GRN approved and stock updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to approve GRN: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to approve GRN: {str(e)}")