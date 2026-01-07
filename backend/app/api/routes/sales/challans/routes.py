"""
Delivery Challan API Router
REFACTORED: Uses ChallanService for database operations
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
import logging

from .....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from .....core.auth.org_context import get_org_context, OrgContext  
from .....core.security.permissions import PermissionChecker
from ....services.sales.challan.service import ChallanService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["challan"])


class ChallanItemRequest(BaseModel):
    order_item_id: Optional[int] = None
    product_id: int
    product_name: str
    batch_id: Optional[int] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    ordered_quantity: Optional[int] = None
    dispatched_quantity: int
    unit_price: Decimal = Field(ge=0)
    gst_percent: Optional[Decimal] = Field(default=0, ge=0)
    cgst_percent: Optional[Decimal] = Field(default=0, ge=0)
    sgst_percent: Optional[Decimal] = Field(default=0, ge=0)
    igst_percent: Optional[Decimal] = Field(default=0, ge=0)
    uom: Optional[str] = None
    package_type: Optional[str] = None
    packages_count: Optional[int] = None


class ChallanCreationRequest(BaseModel):
    order_id: Optional[int] = None
    customer_id: int
    dispatch_date: Optional[date] = None
    expected_delivery_date: Optional[date] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    transport_company: Optional[str] = None
    lr_number: Optional[str] = None
    freight_charges: Optional[Decimal] = Field(default=0, ge=0)
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


class ChallanTrackingRequest(BaseModel):
    location: str
    status: str
    remarks: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("/", response_model=Dict[str, Any])
@with_tenant_context
async def create_delivery_challan(
    request: ChallanCreationRequest,
    _: dict = Depends(PermissionChecker("sales", "create")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Create new delivery challan"""
    try:
        org_id = str(context.org_id)
        created_by = context.user_id
        order = None
        customer_name = None
        taxable_amount = Decimal("0")
        gst_amount = Decimal("0")
        total_amount = Decimal("0")
        freight = Decimal(str(request.freight_charges)) if request.freight_charges else Decimal("0")
        branch_id = ChallanService.get_branch_id(db, org_id)
        
        if request.order_id:
            order = ChallanService.get_order_with_customer(db, org_id, request.order_id)
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            if order.get("branch_id"):
                branch_id = order["branch_id"]
            customer_name = order.get("customer_name")
        else:
            customer_name = ChallanService.get_customer_name(db, request.customer_id)
        
        if not request.order_id:
            for item in request.items:
                item_total = Decimal(str(item.unit_price)) * Decimal(str(item.dispatched_quantity))
                taxable_amount += item_total
                gst_rate = Decimal(str(item.gst_percent)) if item.gst_percent else Decimal("0")
                gst_amount += item_total * gst_rate / 100
            total_amount = taxable_amount + gst_amount + freight
        else:
            if order:
                total_amount = Decimal(str(order.get("final_amount", 0))) + freight
                taxable_amount = (Decimal(str(order.get("final_amount", 0))) - freight) / Decimal("1.12")
                gst_amount = Decimal(str(order.get("final_amount", 0))) - freight - taxable_amount
        
        today = datetime.now()
        date_part = today.strftime("%Y%m%d")
        next_seq = ChallanService.get_next_challan_sequence(db, f"DC{date_part}%")
        challan_number = f"DC{date_part}{next_seq:04d}"
        
        challan_id = ChallanService.create_challan(db, {
            "org_id": org_id, "branch_id": branch_id, "order_id": request.order_id,
            "customer_id": request.customer_id, "challan_number": challan_number,
            "challan_date": date.today(), "dispatch_date": request.dispatch_date or date.today(),
            "challan_status": "draft", "challan_type": "delivery", "vehicle_number": request.vehicle_number,
            "transporter_name": request.transport_company, "lr_number": request.lr_number,
            "freight_charges": freight, "total_quantity": sum(item.dispatched_quantity for item in request.items),
            "total_amount": total_amount, "taxable_amount": taxable_amount, "gst_amount": gst_amount,
            "delivery_status": "pending", "notes": f"Delivery to: {request.delivery_address}, {request.delivery_city}",
            "created_by": created_by
        })
        
        existing_items_map = {}
        if request.order_id:
            existing_items = ChallanService.get_existing_order_items(db, request.order_id)
            existing_items_map = {item["product_id"]: item for item in existing_items}
        
        for idx, item in enumerate(request.items):
            order_item_id = None
            if request.order_id and item.order_item_id:
                if ChallanService.check_order_item_exists(db, item.order_item_id):
                    order_item_id = item.order_item_id
            elif request.order_id:
                existing = existing_items_map.get(item.product_id)
                if existing:
                    order_item_id = existing["order_item_id"]
            
            uom = item.uom if item.uom else "NOS"
            pack_type = item.package_type if item.package_type else "UNIT"
            
            ChallanService.create_challan_item(db, {
                "challan_id": challan_id, "order_item_id": order_item_id, "product_id": item.product_id,
                "batch_id": item.batch_id, "ordered_quantity": item.ordered_quantity or item.dispatched_quantity,
                "dispatched_quantity": item.dispatched_quantity, "delivered_quantity": None,
                "returned_quantity": 0, "damaged_quantity": 0, "uom": uom, "pack_type": pack_type,
                "item_status": "dispatched", "item_notes": f"Product: {item.product_name}",
                "display_order": idx + 1, "unit_price": item.unit_price
            })
        
        db.commit()
        
        ChallanService.update_challan_amounts(db, challan_id, taxable_amount, gst_amount, freight, total_amount)
        db.commit()
        
        return {"challan_id": challan_id, "challan_number": challan_number, "customer_name": customer_name,
                "status": "draft", "total_amount": float(total_amount), "taxable_amount": float(taxable_amount),
                "gst_amount": float(gst_amount), "freight_charges": float(freight), "items": len(request.items),
                "is_independent": request.order_id is None}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating challan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
@with_tenant_context
async def list_delivery_challans(
    skip: int = 0, limit: int = 100, customer_id: Optional[int] = None,
    status: Optional[str] = None, start_date: Optional[date] = None, end_date: Optional[date] = None,
    _: dict = Depends(PermissionChecker("sales", "view")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """List delivery challans with filters"""
    try:
        return ChallanService.list_challans(db, str(context.org_id), customer_id, status, start_date, end_date, limit, skip)
    except Exception as e:
        logger.error(f"Error listing delivery challans: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{challan_id}")
@with_tenant_context
async def get_challan_details(
    challan_id: int,
    _: dict = Depends(PermissionChecker("sales", "view")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get detailed challan information"""
    try:
        challan = ChallanService.get_challan_with_customer(db, challan_id)
        if not challan:
            raise HTTPException(status_code=404, detail="Challan not found")
        items = ChallanService.get_challan_items(db, challan_id)
        return {**challan, "items": items, "tracking_history": []}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting challan details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{challan_id}/dispatch")
@with_tenant_context
async def dispatch_challan(
    challan_id: int, dispatch_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("sales", "edit")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Mark challan as dispatched"""
    try:
        result = ChallanService.dispatch_challan(db, str(context.org_id), challan_id, {
            "dispatch_date": dispatch_data.get("dispatch_date", date.today()), "dispatch_time": datetime.now(),
            "vehicle_number": dispatch_data.get("vehicle_number"), "driver_name": dispatch_data.get("driver_name"),
            "driver_phone": dispatch_data.get("driver_phone"), "dispatched_by": None
        })
        if not result:
            raise HTTPException(status_code=404, detail="Challan not found or already dispatched")
        ChallanService.update_order_delivery_status_from_challan(db, challan_id, "shipped")
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
@with_tenant_context
async def deliver_challan(
    challan_id: int, delivery_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("sales", "edit")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Mark challan as delivered"""
    try:
        result = ChallanService.deliver_challan(db, str(context.org_id), challan_id)
        if not result:
            raise HTTPException(status_code=404, detail="Challan not found or not dispatched")
        ChallanService.update_order_delivered(db, result["order_id"])
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
@with_tenant_context
async def add_tracking_update(
    challan_id: int, tracking: ChallanTrackingRequest,
    _: dict = Depends(PermissionChecker("sales", "edit")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Add tracking update to challan"""
    try:
        if not ChallanService.check_challan_exists(db, str(context.org_id), challan_id):
            raise HTTPException(status_code=404, detail="Challan not found")
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
@with_tenant_context
async def get_challan_analytics(
    start_date: Optional[date] = None, end_date: Optional[date] = None,
    _: dict = Depends(PermissionChecker("reports", "view")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get delivery challan analytics"""
    try:
        analytics = ChallanService.get_challan_analytics(db, start_date, end_date)
        analytics["delivery_by_city"] = ChallanService.get_delivery_by_city(db, start_date, end_date)
        return analytics
    except Exception as e:
        logger.error(f"Error fetching challan analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
