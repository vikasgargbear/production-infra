"""
Delivery Challan API Router
Manages delivery challans and shipment tracking
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import date, datetime

from ...core.database import get_db
from ..services.document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/delivery-challan", tags=["delivery-challan"])

@router.get("/generate-number")
def generate_delivery_challan_number(
    db: Session = Depends(get_db)
):
    """Generate next delivery challan number using unified service"""
    try:
        # Use unified document number service
        new_number = DocumentNumberService.generate_number(db, "delivery_challan")
        return {"challan_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate challan number: {e}")
        # Use service's fallback mechanism
        current_year = datetime.now().year % 100
        timestamp = int(datetime.now().timestamp() * 1000) % 100000000
        fallback_number = f"DC-{current_year:02d}{timestamp:08d}"
        return {"challan_number": fallback_number}

@router.get("/")
def get_delivery_challans(
    skip: int = 0,
    limit: int = 100,
    customer_id: Optional[int] = Query(None, description="Filter by customer"),
    status: Optional[str] = Query(None, description="Filter by status"),
    start_date: Optional[date] = Query(None, description="Filter from date"),
    end_date: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db)
):
    """Get delivery challans with optional filtering"""
    try:
        # Query the actual delivery_challans table
        query = """
            SELECT 
                dc.challan_id,
                dc.challan_number,
                dc.challan_date,
                dc.challan_type,
                dc.customer_id,
                c.customer_name,
                dc.challan_status,
                dc.total_amount,
                dc.vehicle_number,
                dc.transporter_name
            FROM sales.delivery_challans dc
            LEFT JOIN parties.customers c ON dc.customer_id = c.customer_id
            WHERE 1=1
        """
        params = {}
        
        if customer_id:
            query += " AND dc.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        if status:
            query += " AND dc.challan_status = :status"
            params["status"] = status
            
        if start_date:
            query += " AND dc.challan_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND dc.challan_date <= :end_date"
            params["end_date"] = end_date
            
        query += " ORDER BY dc.challan_date DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        challans = [dict(row._mapping) for row in result]
        
        return challans
        
    except Exception as e:
        logger.error(f"Error fetching delivery challans: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get delivery challans: {str(e)}")

@router.get("/{challan_id}")
def get_delivery_challan(challan_id: int, db: Session = Depends(get_db)):
    """Get a single delivery challan by ID"""
    try:
        result = db.execute(
            text("""
                SELECT 
                    o.order_id as challan_id,
                    o.customer_id,
                    c.customer_name,
                    c.customer_address,
                    c.customer_phone,
                    o.order_date as challan_date,
                    o.total_amount,
                    o.delivery_status,
                    o.delivery_address,
                    o.delivery_date,
                    o.notes,
                    'challan' as document_type
                FROM sales.orders o
                LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
                WHERE o.order_id = :challan_id
                AND o.order_status IN ('confirmed', 'delivered', 'shipped')
            """),
            {"challan_id": challan_id}
        )
        challan = result.first()
        if not challan:
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        # Get challan items (order items)
        items_result = db.execute(
            text("""
                SELECT 
                    oi.order_item_id,
                    oi.product_id,
                    p.product_name,
                    oi.quantity,
                    oi.price,
                    (oi.quantity * oi.price) as total_amount
                FROM sales.order_items oi
                JOIN inventory.products p ON oi.product_id = p.product_id
                WHERE oi.order_id = :challan_id
            """),
            {"challan_id": challan_id}
        )
        items = [dict(row._mapping) for row in items_result]
        
        challan_data = dict(challan._mapping)
        challan_data["items"] = items
        
        return challan_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching delivery challan {challan_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get delivery challan: {str(e)}")

@router.post("/")
def create_delivery_challan(challan_data: dict, db: Session = Depends(get_db)):
    """Create a new delivery challan (actually creates an order)"""
    try:
        # Calculate totals from items if provided
        total_amount = 0
        if "items" in challan_data:
            for item in challan_data["items"]:
                quantity = item.get("quantity", 0)
                unit_price = item.get("unit_price", 0)
                total_amount += quantity * unit_price
        
        # Generate order number for the challan
        from datetime import datetime
        timestamp = datetime.now().strftime("%H%M%S")
        order_number = f"CH-{datetime.now().strftime('%Y%m%d')}-{timestamp}"
        
        # For now, this creates an order with delivery status
        order_data = {
            "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
            "branch_id": 1,  # Default branch
            "order_number": order_number,
            "customer_id": challan_data.get("customer_id"),
            "order_date": challan_data.get("order_date", datetime.utcnow()),
            "order_type": challan_data.get("order_type", "delivery"),
            "subtotal_amount": total_amount,
            "final_amount": total_amount,
            "order_status": "confirmed",
            "notes": challan_data.get("notes")
        }
        
        result = db.execute(
            text("""
                INSERT INTO sales.orders (org_id, branch_id, order_number, customer_id, order_date, order_type, subtotal_amount, final_amount, order_status, notes)
                VALUES (:org_id, :branch_id, :order_number, :customer_id, :order_date, :order_type, :subtotal_amount, :final_amount, :order_status, :notes)
                RETURNING order_id
            """),
            order_data
        )
        order_id = result.scalar()
        db.commit()
        
        return {"challan_id": order_id, "message": "Delivery challan created successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating delivery challan: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create delivery challan: {str(e)}")

@router.put("/{challan_id}")
def update_delivery_challan(challan_id: int, challan_data: dict, db: Session = Depends(get_db)):
    """Update a delivery challan"""
    try:
        # Check if order exists
        check_result = db.execute(
            text("SELECT order_id FROM sales.orders WHERE order_id = :order_id"),
            {"order_id": challan_id}
        )
        if not check_result.first():
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        # Update order with challan data
        update_fields = []
        params = {"order_id": challan_id}
        
        if "delivery_status" in challan_data:
            update_fields.append("delivery_status = :delivery_status")
            params["delivery_status"] = challan_data["delivery_status"]
            
        if "delivery_address" in challan_data:
            update_fields.append("delivery_address = :delivery_address")
            params["delivery_address"] = challan_data["delivery_address"]
            
        if "delivery_date" in challan_data:
            update_fields.append("delivery_date = :delivery_date")
            params["delivery_date"] = challan_data["delivery_date"]
            
        if "notes" in challan_data:
            update_fields.append("notes = :notes")
            params["notes"] = challan_data["notes"]
        
        if update_fields:
            query = f"UPDATE sales.orders SET {', '.join(update_fields)} WHERE order_id = :order_id"
            db.execute(text(query), params)
            db.commit()
        
        return {"message": "Delivery challan updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating delivery challan {challan_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update delivery challan: {str(e)}")

@router.delete("/{challan_id}")
def delete_delivery_challan(challan_id: int, db: Session = Depends(get_db)):
    """Delete a delivery challan"""
    try:
        result = db.execute(
            text("DELETE FROM sales.orders WHERE order_id = :order_id RETURNING order_id"),
            {"order_id": challan_id}
        )
        deleted_id = result.scalar()
        if not deleted_id:
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        db.commit()
        return {"message": "Delivery challan deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting delivery challan {challan_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete delivery challan: {str(e)}")

@router.put("/{challan_id}/mark-delivered")
def mark_challan_delivered(challan_id: int, db: Session = Depends(get_db)):
    """Mark a delivery challan as delivered"""
    try:
        result = db.execute(
            text("""
                UPDATE sales.orders 
                SET delivery_status = 'delivered', delivery_date = :delivery_date 
                WHERE order_id = :order_id 
                RETURNING order_id
            """),
            {"order_id": challan_id, "delivery_date": datetime.utcnow()}
        )
        updated_id = result.scalar()
        if not updated_id:
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        db.commit()
        return {"message": "Delivery challan marked as delivered"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error marking challan {challan_id} as delivered: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to mark challan as delivered: {str(e)}")

@router.get("/analytics/summary")
def get_delivery_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Get delivery analytics and summary"""
    try:
        query = """
            SELECT 
                COUNT(*) as total_challans,
                COUNT(CASE WHEN delivery_status = 'delivered' THEN 1 END) as delivered_count,
                COUNT(CASE WHEN delivery_status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN delivery_status = 'shipped' THEN 1 END) as shipped_count,
                AVG(total_amount) as avg_challan_amount
            FROM sales.orders 
            WHERE order_status IN ('confirmed', 'delivered', 'shipped')
        """
        params = {}
        
        if start_date:
            query += " AND order_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND order_date <= :end_date"
            params["end_date"] = end_date
        
        result = db.execute(text(query), params)
        analytics = dict(result.first()._mapping)
        
        return analytics
        
    except Exception as e:
        logger.error(f"Error fetching delivery analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get delivery analytics: {str(e)}")

@router.post("/{challan_id}/generate-eway-bill")
def generate_eway_bill(
    challan_id: int,
    eway_data: dict,
    db: Session = Depends(get_db)
):
    """
    Generate e-way bill for delivery challan
    
    - Validate required fields
    - Generate e-way bill number
    - Store e-way bill details
    """
    try:
        # Verify challan exists
        challan_check = db.execute(
            text("SELECT order_id FROM sales.orders WHERE order_id = :order_id"),
            {"order_id": challan_id}
        )
        if not challan_check.first():
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        # Extract e-way bill data
        eway_bill_data = {
            "challan_id": challan_id,
            "supply_type": eway_data.get("supply_type", "outward"),
            "sub_type": eway_data.get("sub_type", "supply"),
            "document_type": eway_data.get("document_type", "delivery_challan"),
            "document_number": f"DC-{challan_id}",
            "document_date": eway_data.get("document_date", datetime.utcnow()),
            "from_gstin": eway_data.get("from_gstin"),
            "to_gstin": eway_data.get("to_gstin"),
            "transport_mode": eway_data.get("transport_mode", "road"),
            "transport_distance": eway_data.get("distance_km", 0),
            "transporter_name": eway_data.get("transporter_name"),
            "transporter_id": eway_data.get("transporter_gstin"),
            "transporter_doc_no": eway_data.get("transport_document_number"),
            "transporter_doc_date": eway_data.get("transport_document_date"),
            "vehicle_number": eway_data.get("vehicle_number"),
            "vehicle_type": eway_data.get("vehicle_type", "regular"),
            "eway_bill_number": f"EWB{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "valid_until": datetime.utcnow() + timedelta(days=1),  # 1 day validity for <100km
            "status": "active"
        }
        
        # Adjust validity based on distance
        if eway_bill_data["transport_distance"] > 100:
            days_valid = 1 + ((eway_bill_data["transport_distance"] - 1) // 100)
            eway_bill_data["valid_until"] = datetime.utcnow() + timedelta(days=days_valid)
        
        # Insert e-way bill record
        insert_query = """
            INSERT INTO sales.eway_bills (
                challan_id, eway_bill_number, supply_type, sub_type,
                document_type, document_number, document_date,
                from_gstin, to_gstin, transport_mode, transport_distance,
                transporter_name, transporter_id, vehicle_number,
                valid_until, status, generated_date
            ) VALUES (
                :challan_id, :eway_bill_number, :supply_type, :sub_type,
                :document_type, :document_number, :document_date,
                :from_gstin, :to_gstin, :transport_mode, :transport_distance,
                :transporter_name, :transporter_id, :vehicle_number,
                :valid_until, :status, CURRENT_TIMESTAMP
            ) RETURNING eway_bill_id, eway_bill_number
        """
        
        result = db.execute(text(insert_query), eway_bill_data)
        eway_bill = result.first()
        
        # Update challan with e-way bill reference
        update_query = """
            UPDATE sales.orders 
            SET eway_bill_number = :eway_bill_number,
                notes = COALESCE(notes || ' | ', '') || 'E-way Bill: ' || :eway_bill_number
            WHERE order_id = :order_id
        """
        db.execute(text(update_query), {
            "eway_bill_number": eway_bill.eway_bill_number,
            "order_id": challan_id
        })
        
        db.commit()
        
        return {
            "eway_bill_id": eway_bill.eway_bill_id,
            "eway_bill_number": eway_bill.eway_bill_number,
            "valid_until": eway_bill_data["valid_until"].isoformat(),
            "status": "generated"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error generating e-way bill: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate e-way bill: {str(e)}")

@router.post("/{challan_id}/pod")
def record_proof_of_delivery(
    challan_id: int,
    pod_data: dict,
    db: Session = Depends(get_db)
):
    """
    Record Proof of Delivery (POD)
    
    - Capture delivery details
    - Store signature/photo
    - Update delivery status
    """
    try:
        # Verify challan exists
        challan_check = db.execute(
            text("SELECT order_id, customer_id FROM sales.orders WHERE order_id = :order_id"),
            {"order_id": challan_id}
        )
        challan = challan_check.first()
        if not challan:
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        # Create POD record
        pod_insert = """
            INSERT INTO sales.proof_of_delivery (
                challan_id, customer_id, delivered_date, delivered_time,
                received_by_name, received_by_designation, received_by_phone,
                delivery_location, delivery_notes, signature_image,
                delivery_photo, gps_latitude, gps_longitude,
                delivery_rating, created_date
            ) VALUES (
                :challan_id, :customer_id, :delivered_date, :delivered_time,
                :received_by_name, :received_by_designation, :received_by_phone,
                :delivery_location, :delivery_notes, :signature_image,
                :delivery_photo, :gps_latitude, :gps_longitude,
                :delivery_rating, CURRENT_TIMESTAMP
            ) RETURNING pod_id
        """
        
        pod_params = {
            "challan_id": challan_id,
            "customer_id": challan.customer_id,
            "delivered_date": pod_data.get("delivered_date", date.today()),
            "delivered_time": pod_data.get("delivered_time", datetime.now().time()),
            "received_by_name": pod_data.get("received_by_name"),
            "received_by_designation": pod_data.get("received_by_designation"),
            "received_by_phone": pod_data.get("received_by_phone"),
            "delivery_location": pod_data.get("delivery_location"),
            "delivery_notes": pod_data.get("remarks"),
            "signature_image": pod_data.get("signature"),
            "delivery_photo": pod_data.get("delivery_photo"),
            "gps_latitude": pod_data.get("gps_latitude"),
            "gps_longitude": pod_data.get("gps_longitude"),
            "delivery_rating": pod_data.get("delivery_rating")
        }
        
        result = db.execute(text(pod_insert), pod_params)
        pod_id = result.scalar()
        
        # Update challan status to delivered
        update_query = """
            UPDATE sales.orders 
            SET delivery_status = 'delivered',
                delivery_date = :delivery_date,
                pod_recorded = true
            WHERE order_id = :order_id
        """
        db.execute(text(update_query), {
            "delivery_date": pod_params["delivered_date"],
            "order_id": challan_id
        })
        
        db.commit()
        
        return {
            "pod_id": pod_id,
            "challan_id": challan_id,
            "status": "POD recorded successfully",
            "delivered_to": pod_params["received_by_name"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording POD: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record POD: {str(e)}")

@router.get("/{challan_id}/tracking")
def get_delivery_tracking(challan_id: int, db: Session = Depends(get_db)):
    """
    Get real-time delivery tracking information
    
    - Current status and location
    - Tracking history
    - Estimated delivery time
    """
    try:
        # Get challan details with tracking info
        challan_query = """
            SELECT 
                o.order_id as challan_id,
                o.customer_id,
                c.customer_name,
                o.delivery_status,
                o.delivery_address,
                o.delivery_date,
                o.order_date as dispatch_date,
                ewb.eway_bill_number,
                ewb.vehicle_number,
                ewb.transporter_name,
                ewb.valid_until
            FROM sales.orders o
            LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
            LEFT JOIN sales.eway_bills ewb ON ewb.challan_id = o.order_id
            WHERE o.order_id = :challan_id
        """
        
        result = db.execute(text(challan_query), {"challan_id": challan_id})
        challan = result.first()
        
        if not challan:
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        # Get tracking history
        tracking_query = """
            SELECT 
                tracking_id,
                status,
                location,
                timestamp,
                notes,
                updated_by
            FROM sales.delivery_tracking
            WHERE challan_id = :challan_id
            ORDER BY timestamp DESC
        """
        
        tracking_result = db.execute(text(tracking_query), {"challan_id": challan_id})
        tracking_history = [dict(row._mapping) for row in tracking_result]
        
        # Calculate estimated delivery
        estimated_delivery = None
        if challan.delivery_status in ['pending', 'shipped']:
            # Simple estimation: dispatch date + 2 days
            estimated_delivery = (challan.dispatch_date + timedelta(days=2)).isoformat()
        
        return {
            "challan_id": challan_id,
            "customer_name": challan.customer_name,
            "current_status": challan.delivery_status,
            "delivery_address": challan.delivery_address,
            "vehicle_number": challan.vehicle_number,
            "transporter": challan.transporter_name,
            "eway_bill_number": challan.eway_bill_number,
            "dispatch_date": challan.dispatch_date.isoformat() if challan.dispatch_date else None,
            "estimated_delivery": estimated_delivery,
            "actual_delivery": challan.delivery_date.isoformat() if challan.delivery_date else None,
            "tracking_history": tracking_history,
            "tracking_url": f"/track/{challan_id}"  # Public tracking URL
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting delivery tracking: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get delivery tracking: {str(e)}")

@router.post("/{challan_id}/update-tracking")
def update_delivery_tracking(
    challan_id: int,
    tracking_data: dict,
    db: Session = Depends(get_db)
):
    """
    Update delivery tracking status
    
    - Add tracking checkpoint
    - Update current location
    - Send notifications if configured
    """
    try:
        # Verify challan exists
        challan_check = db.execute(
            text("SELECT order_id FROM sales.orders WHERE order_id = :order_id"),
            {"order_id": challan_id}
        )
        if not challan_check.first():
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        # Insert tracking record
        tracking_insert = """
            INSERT INTO sales.delivery_tracking (
                challan_id, status, location, timestamp,
                gps_latitude, gps_longitude, notes, updated_by
            ) VALUES (
                :challan_id, :status, :location, :timestamp,
                :gps_latitude, :gps_longitude, :notes, :updated_by
            ) RETURNING tracking_id
        """
        
        tracking_params = {
            "challan_id": challan_id,
            "status": tracking_data.get("status"),
            "location": tracking_data.get("location"),
            "timestamp": tracking_data.get("timestamp", datetime.utcnow()),
            "gps_latitude": tracking_data.get("gps_latitude"),
            "gps_longitude": tracking_data.get("gps_longitude"),
            "notes": tracking_data.get("notes"),
            "updated_by": tracking_data.get("updated_by", "System")
        }
        
        result = db.execute(text(tracking_insert), tracking_params)
        tracking_id = result.scalar()
        
        # Update challan delivery status if changed
        if tracking_data.get("update_challan_status", False):
            update_query = """
                UPDATE sales.orders 
                SET delivery_status = :status,
                    last_tracking_update = CURRENT_TIMESTAMP
                WHERE order_id = :order_id
            """
            db.execute(text(update_query), {
                "status": tracking_data.get("status"),
                "order_id": challan_id
            })
        
        db.commit()
        
        return {
            "tracking_id": tracking_id,
            "challan_id": challan_id,
            "status": tracking_data.get("status"),
            "location": tracking_data.get("location"),
            "message": "Tracking updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating tracking: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update tracking: {str(e)}")

@router.get("/pending-deliveries")
def get_pending_deliveries(
    driver_id: Optional[int] = Query(None),
    date_filter: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get list of pending deliveries
    
    - Filter by driver/vehicle
    - Group by route/area
    - Priority-based sorting
    """
    try:
        query = """
            SELECT 
                o.order_id as challan_id,
                o.customer_id,
                c.customer_name,
                c.customer_address,
                c.customer_phone,
                o.delivery_address,
                o.delivery_priority,
                o.total_amount,
                o.order_date,
                o.expected_delivery_date,
                ewb.vehicle_number,
                ewb.transporter_name
            FROM sales.orders o
            LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
            LEFT JOIN sales.eway_bills ewb ON ewb.challan_id = o.order_id
            WHERE o.delivery_status IN ('pending', 'shipped')
            AND o.order_status != 'cancelled'
        """
        
        params = {}
        
        if date_filter:
            query += " AND DATE(o.expected_delivery_date) = :date_filter"
            params["date_filter"] = date_filter
        
        query += " ORDER BY o.delivery_priority DESC, o.order_date ASC"
        
        result = db.execute(text(query), params)
        pending_deliveries = [dict(row._mapping) for row in result]
        
        # Group by area/route if needed
        deliveries_by_area = {}
        for delivery in pending_deliveries:
            area = delivery.get("delivery_area", "unassigned")
            if area not in deliveries_by_area:
                deliveries_by_area[area] = []
            deliveries_by_area[area].append(delivery)
        
        return {
            "total_pending": len(pending_deliveries),
            "deliveries": pending_deliveries,
            "by_area": deliveries_by_area,
            "summary": {
                "high_priority": len([d for d in pending_deliveries if d.get("delivery_priority") == "high"]),
                "normal_priority": len([d for d in pending_deliveries if d.get("delivery_priority") == "normal"]),
                "total_value": sum(d.get("total_amount", 0) for d in pending_deliveries)
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting pending deliveries: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pending deliveries: {str(e)}")