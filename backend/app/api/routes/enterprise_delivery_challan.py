"""
Enterprise Delivery Challan API Router
Uses actual challan tables for proper challan management
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/enterprise-delivery-challan", tags=["enterprise-delivery-challan"])

# =============================================
# PYDANTIC MODELS
# =============================================

class ChallanItemRequest(BaseModel):
    order_item_id: int
    product_id: int
    product_name: str
    batch_id: Optional[int] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    ordered_quantity: int
    dispatched_quantity: int
    unit_price: Decimal = Field(ge=0)
    package_type: Optional[str] = None
    packages_count: Optional[int] = None

class ChallanCreationRequest(BaseModel):
    order_id: int
    customer_id: int
    dispatch_date: Optional[date] = None
    expected_delivery_date: Optional[date] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    transport_company: Optional[str] = None
    lr_number: Optional[str] = None
    freight_amount: Optional[Decimal] = Field(default=0, ge=0)
    delivery_address: str
    delivery_city: str
    delivery_state: str
    delivery_pincode: str
    delivery_contact_person: Optional[str] = None
    delivery_contact_phone: Optional[str] = None
    total_packages: Optional[int] = None
    total_weight: Optional[Decimal] = None
    notes: Optional[str] = None
    items: List[ChallanItemRequest]

class ChallanResponse(BaseModel):
    challan_id: int
    challan_number: str
    challan_date: date
    order_id: int
    customer_id: int
    customer_name: str
    status: str
    dispatch_date: Optional[date]
    delivery_address: str
    total_packages: Optional[int]
    vehicle_number: Optional[str]
    driver_name: Optional[str]

class ChallanTrackingRequest(BaseModel):
    location: str
    status: str
    remarks: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

# =============================================
# CHALLAN SERVICE CLASS
# =============================================

class EnterpriseChallanService:
    def __init__(self, db: Session, org_id: str):
        self.db = db
        self.org_id = org_id
        
    def _generate_challan_number(self) -> str:
        """Generate unique challan number"""
        today = datetime.now()
        date_part = today.strftime("%Y%m%d")
        
        # Get today's challan count
        result = self.db.execute(
            text("""
                SELECT COUNT(*) + 1 as next_seq
                FROM challans
                WHERE challan_number LIKE :pattern
            """),
            {
                "pattern": f"DC{date_part}%"
            }
        )
        next_seq = result.scalar() or 1
        
        return f"DC{date_part}{next_seq:04d}"
    
    def create_challan(self, request: ChallanCreationRequest) -> Dict[str, Any]:
        """Create new delivery challan"""
        try:
            # Validate order exists WITH org_id
            order_result = self.db.execute(
                text("""
                    SELECT o.*, c.customer_name 
                    FROM orders o
                    JOIN customers c ON o.customer_id = c.customer_id
                    WHERE o.order_id = :order_id
                    AND o.org_id = :org_id
                """),
                {"order_id": request.order_id, "org_id": self.org_id}
            )
            order = order_result.first()
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            
            # Generate challan number
            challan_number = self._generate_challan_number()
            
            # Create challan record WITH org_id
            challan_result = self.db.execute(
                text("""
                    INSERT INTO challans (
                        org_id, order_id, customer_id, challan_number,
                        challan_date, dispatch_date, expected_delivery_date,
                        status, vehicle_number, driver_name, driver_phone,
                        transport_company, lr_number, freight_amount,
                        delivery_address, delivery_city, delivery_state,
                        delivery_pincode, delivery_contact_person,
                        delivery_contact_phone, total_packages, total_weight,
                        prepared_by
                    ) VALUES (
                        :org_id, :order_id, :customer_id, :challan_number,
                        :challan_date, :dispatch_date, :expected_delivery_date,
                        :status, :vehicle_number, :driver_name, :driver_phone,
                        :transport_company, :lr_number, :freight_amount,
                        :delivery_address, :delivery_city, :delivery_state,
                        :delivery_pincode, :delivery_contact_person,
                        :delivery_contact_phone, :total_packages, :total_weight,
                        :prepared_by
                    )
                    RETURNING challan_id
                """),
                {
                    "org_id": self.org_id,
                    "order_id": request.order_id,
                    "customer_id": request.customer_id,
                    "challan_number": challan_number,
                    "challan_date": date.today(),
                    "dispatch_date": request.dispatch_date,
                    "expected_delivery_date": request.expected_delivery_date,
                    "status": "draft",
                    "vehicle_number": request.vehicle_number,
                    "driver_name": request.driver_name,
                    "driver_phone": request.driver_phone,
                    "transport_company": request.transport_company,
                    "lr_number": request.lr_number,
                    "freight_amount": request.freight_amount,
                    "delivery_address": request.delivery_address,
                    "delivery_city": request.delivery_city,
                    "delivery_state": request.delivery_state,
                    "delivery_pincode": request.delivery_pincode,
                    "delivery_contact_person": request.delivery_contact_person,
                    "delivery_contact_phone": request.delivery_contact_phone,
                    "total_packages": request.total_packages,
                    "total_weight": request.total_weight,
                    "prepared_by": None  # TODO: Get from session
                }
            )
            challan_id = challan_result.scalar()
            
            # Check if this order already has order_items
            existing_order_items = self.db.execute(
                text("""
                    SELECT order_item_id, product_id, quantity
                    FROM order_items
                    WHERE order_id = :order_id
                """),
                {"order_id": request.order_id}
            ).fetchall()
            
            # Create a map of existing order items by product_id
            existing_items_map = {item.product_id: item for item in existing_order_items}
            
            # Create challan items
            for idx, item in enumerate(request.items):
                # Check if order_item exists for this product
                existing_order_item = existing_items_map.get(item.product_id)
                
                if existing_order_item:
                    # Use existing order_item_id
                    order_item_id = existing_order_item.order_item_id
                else:
                    # For items not in the original order, we need to handle differently
                    # This shouldn't happen in normal flow
                    logger.warning(f"Product {item.product_id} not found in order {request.order_id}")
                    # Skip this item or handle as needed
                    continue
                
                pending_qty = item.ordered_quantity - item.dispatched_quantity
                
                self.db.execute(
                    text("""
                        INSERT INTO challan_items (
                            challan_id, order_item_id, product_id,
                            product_name, batch_id, batch_number,
                            expiry_date, ordered_quantity, dispatched_quantity,
                            pending_quantity, unit_price, package_type,
                            packages_count
                        ) VALUES (
                            :challan_id, :order_item_id, :product_id,
                            :product_name, :batch_id, :batch_number,
                            :expiry_date, :ordered_quantity, :dispatched_quantity,
                            :pending_quantity, :unit_price, :package_type,
                            :packages_count
                        )
                    """),
                    {
                        "challan_id": challan_id,
                        "order_item_id": order_item_id,  # Use the found order_item_id
                        "product_id": item.product_id,
                        "product_name": item.product_name,
                        "batch_id": item.batch_id,
                        "batch_number": item.batch_number,
                        "expiry_date": item.expiry_date,
                        "ordered_quantity": item.ordered_quantity,
                        "dispatched_quantity": item.dispatched_quantity,
                        "pending_quantity": pending_qty,
                        "unit_price": item.unit_price,
                        "package_type": item.package_type,
                        "packages_count": item.packages_count
                    }
                )
            
            # Add initial tracking entry
            self.db.execute(
                text("""
                    INSERT INTO challan_tracking (
                        challan_id, location, status, remarks, timestamp
                    ) VALUES (
                        :challan_id, :location, :status, :remarks, :timestamp
                    )
                """),
                {
                    "challan_id": challan_id,
                    "location": "Warehouse",
                    "status": "draft",
                    "remarks": "Challan created",
                    "timestamp": datetime.now()
                }
            )
            
            self.db.commit()
            
            return {
                "challan_id": challan_id,
                "challan_number": challan_number,
                "customer_name": order.customer_name,
                "status": "draft"
            }
            
        except HTTPException:
            self.db.rollback()
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating challan: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

# =============================================
# API ENDPOINTS
# =============================================

@router.post("/", response_model=Dict[str, Any])
async def create_delivery_challan(
    request: ChallanCreationRequest,
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"  # TODO: Get from session
):
    """Create new delivery challan"""
    service = EnterpriseChallanService(db, org_id)
    return service.create_challan(request)

@router.get("/")
async def list_challans(
    skip: int = 0,
    limit: int = 100,
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
):
    """List delivery challans with filters"""
    try:
        query = """
            SELECT 
                c.challan_id,
                c.challan_number,
                c.challan_date,
                c.order_id,
                c.customer_id,
                cust.customer_name,
                c.status,
                c.dispatch_date,
                c.expected_delivery_date,
                c.delivery_address,
                c.delivery_city,
                c.vehicle_number,
                c.driver_name,
                c.total_packages
            FROM challans c
            JOIN customers cust ON c.customer_id = cust.customer_id
            WHERE c.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        if status:
            query += " AND c.status = :status"
            params["status"] = status
            
        if start_date:
            query += " AND c.challan_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND c.challan_date <= :end_date"
            params["end_date"] = end_date
            
        query += " ORDER BY c.challan_date DESC, c.challan_id DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        challans = [dict(row._mapping) for row in result]
        
        return challans
        
    except Exception as e:
        logger.error(f"Error listing challans: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{challan_id}")
async def get_challan_details(
    challan_id: int,
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
):
    """Get detailed challan information"""
    try:
        # Get challan header
        challan_result = db.execute(
            text("""
                SELECT c.*, cust.customer_name, cust.gstin as customer_gstin,
                       cust.address as customer_address, cust.phone as customer_phone
                FROM challans c
                JOIN customers cust ON c.customer_id = cust.customer_id
                WHERE c.challan_id = :challan_id
            """),
            {"challan_id": challan_id}
        )
        challan = challan_result.first()
        if not challan:
            raise HTTPException(status_code=404, detail="Challan not found")
        
        # Get challan items
        items_result = db.execute(
            text("""
                SELECT ci.*, p.hsn_code, p.gst_percent
                FROM challan_items ci
                JOIN products p ON ci.product_id = p.product_id
                WHERE ci.challan_id = :challan_id
            """),
            {"challan_id": challan_id}
        )
        items = [dict(row._mapping) for row in items_result]
        
        # Get tracking history
        tracking_result = db.execute(
            text("""
                SELECT * FROM challan_tracking
                WHERE challan_id = :challan_id
                ORDER BY timestamp DESC
            """),
            {"challan_id": challan_id}
        )
        tracking = [dict(row._mapping) for row in tracking_result]
        
        return {
            **dict(challan._mapping),
            "items": items,
            "tracking_history": tracking
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting challan details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{challan_id}/dispatch")
async def dispatch_challan(
    challan_id: int,
    dispatch_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
):
    """Mark challan as dispatched"""
    try:
        # Update challan status
        result = db.execute(
            text("""
                UPDATE challans
                SET status = 'dispatched',
                    dispatch_date = :dispatch_date,
                    dispatch_time = :dispatch_time,
                    vehicle_number = COALESCE(:vehicle_number, vehicle_number),
                    driver_name = COALESCE(:driver_name, driver_name),
                    driver_phone = COALESCE(:driver_phone, driver_phone),
                    dispatched_by = :dispatched_by
                WHERE challan_id = :challan_id
                AND org_id = :org_id
                AND status = 'draft'
                RETURNING challan_id
            """),
            {
                "challan_id": challan_id,
                "org_id": org_id,
                "dispatch_date": dispatch_data.get("dispatch_date", date.today()),
                "dispatch_time": datetime.now(),
                "vehicle_number": dispatch_data.get("vehicle_number"),
                "driver_name": dispatch_data.get("driver_name"),
                "driver_phone": dispatch_data.get("driver_phone"),
                "dispatched_by": None  # TODO: Get from session
            }
        )
        
        if not result.scalar():
            raise HTTPException(status_code=404, detail="Challan not found or already dispatched")
        
        # Add tracking entry
        db.execute(
            text("""
                INSERT INTO challan_tracking (
                    challan_id, location, status, remarks, timestamp
                ) VALUES (
                    :challan_id, :location, :status, :remarks, :timestamp
                )
            """),
            {
                "challan_id": challan_id,
                "location": dispatch_data.get("dispatch_location", "Warehouse"),
                "status": "dispatched",
                "remarks": dispatch_data.get("remarks", "Challan dispatched"),
                "timestamp": datetime.now()
            }
        )
        
        # Update order delivery status
        db.execute(
            text("""
                UPDATE orders
                SET delivery_status = 'shipped'
                WHERE order_id = (
                    SELECT order_id FROM challans WHERE challan_id = :challan_id
                )
            """),
            {"challan_id": challan_id}
        )
        
        db.commit()
        return {"message": "Challan dispatched successfully"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error dispatching challan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{challan_id}/deliver")
async def deliver_challan(
    challan_id: int,
    delivery_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
):
    """Mark challan as delivered"""
    try:
        # Update challan status
        result = db.execute(
            text("""
                UPDATE challans
                SET status = 'delivered',
                    delivery_time = :delivery_time
                WHERE challan_id = :challan_id
                AND org_id = :org_id
                AND status = 'dispatched'
                RETURNING challan_id, order_id
            """),
            {
                "challan_id": challan_id,
                "org_id": org_id,
                "delivery_time": datetime.now()
            }
        )
        
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Challan not found or not dispatched")
        
        # Add tracking entry
        db.execute(
            text("""
                INSERT INTO challan_tracking (
                    challan_id, location, status, remarks, timestamp,
                    latitude, longitude
                ) VALUES (
                    :challan_id, :location, :status, :remarks, :timestamp,
                    :latitude, :longitude
                )
            """),
            {
                "challan_id": challan_id,
                "location": delivery_data.get("delivery_location", "Customer location"),
                "status": "delivered",
                "remarks": delivery_data.get("remarks", "Challan delivered"),
                "timestamp": datetime.now(),
                "latitude": delivery_data.get("latitude"),
                "longitude": delivery_data.get("longitude")
            }
        )
        
        # Update order delivery status
        db.execute(
            text("""
                UPDATE orders
                SET delivery_status = 'delivered',
                    delivery_date = :delivery_date,
                    delivered_at = :delivered_at
                WHERE order_id = :order_id
            """),
            {
                "order_id": row.order_id,
                "delivery_date": date.today(),
                "delivered_at": datetime.now()
            }
        )
        
        db.commit()
        return {"message": "Challan delivered successfully"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error delivering challan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{challan_id}/tracking")
async def add_tracking_update(
    challan_id: int,
    tracking: ChallanTrackingRequest,
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
):
    """Add tracking update to challan"""
    try:
        # Verify challan exists
        check_result = db.execute(
            text("""
                SELECT challan_id FROM challans
                WHERE challan_id = :challan_id
                AND org_id = :org_id
            """),
            {"challan_id": challan_id, "org_id": org_id}
        )
        if not check_result.first():
            raise HTTPException(status_code=404, detail="Challan not found")
        
        # Add tracking entry
        db.execute(
            text("""
                INSERT INTO challan_tracking (
                    challan_id, location, status, remarks, 
                    latitude, longitude, timestamp
                ) VALUES (
                    :challan_id, :location, :status, :remarks,
                    :latitude, :longitude, :timestamp
                )
            """),
            {
                "challan_id": challan_id,
                "location": tracking.location,
                "status": tracking.status,
                "remarks": tracking.remarks,
                "latitude": tracking.latitude,
                "longitude": tracking.longitude,
                "timestamp": datetime.now()
            }
        )
        
        db.commit()
        return {"message": "Tracking update added successfully"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding tracking update: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/summary")
async def get_challan_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
):
    """Get delivery challan analytics"""
    try:
        query = """
            SELECT 
                COUNT(*) as total_challans,
                COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
                COUNT(CASE WHEN status = 'dispatched' THEN 1 END) as dispatched_count,
                COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
                SUM(freight_amount) as total_freight,
                AVG(CASE 
                    WHEN status = 'delivered' AND dispatch_time IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (delivery_time - dispatch_time))/3600 
                END) as avg_delivery_hours
            FROM challans
            WHERE 1=1
        """
        params = {}
        
        if start_date:
            query += " AND challan_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND challan_date <= :end_date"
            params["end_date"] = end_date
        
        result = db.execute(text(query), params)
        analytics = dict(result.first()._mapping)
        
        # Get delivery performance by city
        city_result = db.execute(
            text("""
                SELECT 
                    delivery_city,
                    COUNT(*) as challan_count,
                    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
                    AVG(CASE 
                        WHEN status = 'delivered' AND dispatch_time IS NOT NULL 
                        THEN EXTRACT(EPOCH FROM (delivery_time - dispatch_time))/3600 
                    END) as avg_delivery_hours
                FROM challans
                WHERE challan_date >= COALESCE(:start_date, challan_date)
                AND challan_date <= COALESCE(:end_date, challan_date)
                GROUP BY delivery_city
                ORDER BY challan_count DESC
                LIMIT 10
            """),
            params
        )
        
        analytics["delivery_by_city"] = [dict(row._mapping) for row in city_result]
        
        return analytics
        
    except Exception as e:
        logger.error(f"Error fetching challan analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Backwards compatibility endpoint
@router.get("/legacy")
async def get_legacy_challans(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Legacy endpoint for backward compatibility"""
    # Redirect to order-based challans
    from . import delivery_challan as legacy_router
    return legacy_router.get_delivery_challans(skip, limit, None, None, None, None, db)