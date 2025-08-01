"""
Smart Invoice API - Handles invoice creation intelligently
If order doesn't exist, creates it automatically
"""

from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session
from sqlalchemy import text
import json

from ...database import get_db
from ...core.auth import get_current_org
from ...services.invoice_service import InvoiceService

router = APIRouter(
    prefix="/api/v1/smart-invoice",
    tags=["smart-invoice"]
)

@router.post("/order/{order_id}")
async def smart_invoice_generation(
    order_id: int = Path(..., description="Expected order ID"),
    invoice_data: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Smart invoice generation that handles missing orders gracefully
    
    If order exists: Generate invoice for it
    If order doesn't exist: Return helpful info and create order if data provided
    """
    org_id = current_org["org_id"]
    
    # Check if order exists
    order = db.execute(text("""
        SELECT order_id, order_status, customer_id, final_amount
        FROM orders
        WHERE order_id = :order_id AND org_id = :org_id
    """), {
        "order_id": order_id,
        "org_id": org_id
    }).first()
    
    if order:
        # Order exists - generate invoice normally
        try:
            result = InvoiceService.generate_invoice_for_order(
                db=db,
                order_id=order_id,
                org_id=org_id,
                invoice_date=datetime.utcnow()
            )
            db.commit()
            return {
                "status": "success",
                "action": "invoice_generated",
                "order_existed": True,
                **result
            }
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
    
    else:
        # Order doesn't exist - provide smart handling
        
        # Get system info
        latest_order = db.execute(text("""
            SELECT MAX(order_id) as max_id FROM orders WHERE org_id = :org_id
        """), {"org_id": org_id}).scalar()
        
        next_sequence = db.execute(text("""
            SELECT last_value + 1 as next_id FROM orders_order_id_seq
        """)).scalar()
        
        # Check if invoice_data contains order creation info
        if invoice_data and "customer_id" in invoice_data and "items" in invoice_data:
            # We have enough data to create the order
            print(f"Creating missing order {order_id} with provided data")
            
            # Note: We can't force a specific order_id due to sequence
            # So we'll create a new order and return its actual ID
            
            # Redirect to create-with-order endpoint logic
            from ..invoice_with_order import create_invoice_with_order
            from ..invoice_with_order import InvoiceWithOrderCreate
            
            try:
                # Convert to proper request model
                create_request = InvoiceWithOrderCreate(**invoice_data)
                
                # Create order and invoice
                result = await create_invoice_with_order(
                    invoice_data=create_request,
                    db=db,
                    current_org=current_org
                )
                
                return {
                    "status": "success",
                    "action": "order_and_invoice_created",
                    "original_requested_order_id": order_id,
                    "actual_order_id": result.order_id,
                    "message": f"Order {order_id} didn't exist. Created new order {result.order_id} instead.",
                    **result.dict()
                }
                
            except Exception as e:
                db.rollback()
                return {
                    "status": "error",
                    "action": "creation_failed",
                    "error": str(e),
                    "message": "Failed to create order and invoice"
                }
        
        else:
            # No data to create order - return helpful info
            return {
                "status": "error",
                "action": "order_not_found",
                "requested_order_id": order_id,
                "latest_existing_order_id": latest_order,
                "next_sequence_value": next_sequence,
                "gap_in_sequence": order_id - latest_order if latest_order else None,
                "message": f"Order {order_id} does not exist. Latest order is #{latest_order}.",
                "instructions": {
                    "option_1": "Use POST /api/v1/invoices/create-with-order to create both",
                    "option_2": "Create order first using POST /api/v1/orders/",
                    "option_3": "Provide order data in invoice_data parameter to auto-create"
                },
                "required_for_auto_create": {
                    "customer_id": "number",
                    "items": [
                        {
                            "product_id": "number",
                            "quantity": "number",
                            "unit_price": "number"
                        }
                    ]
                }
            }

@router.get("/debug/sequence")
async def debug_sequence_issue(
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Debug endpoint to understand the order sequence issue
    """
    org_id = current_org["org_id"]
    
    # Get all relevant info
    latest_order = db.execute(text("""
        SELECT order_id, created_at FROM orders 
        WHERE org_id = :org_id 
        ORDER BY order_id DESC LIMIT 1
    """), {"org_id": org_id}).first()
    
    sequence_info = db.execute(text("""
        SELECT last_value, is_called FROM orders_order_id_seq
    """)).first()
    
    recent_orders = db.execute(text("""
        SELECT order_id, order_status, created_at 
        FROM orders 
        WHERE org_id = :org_id 
        ORDER BY order_id DESC LIMIT 10
    """), {"org_id": org_id}).fetchall()
    
    # Find gaps
    order_ids = [o.order_id for o in recent_orders]
    gaps = []
    if order_ids:
        for i in range(min(order_ids), max(order_ids)):
            if i not in order_ids:
                gaps.append(i)
    
    return {
        "database_sequence": {
            "last_value": sequence_info.last_value,
            "is_called": sequence_info.is_called,
            "next_value": sequence_info.last_value + 1 if sequence_info.is_called else sequence_info.last_value
        },
        "latest_order": {
            "order_id": latest_order.order_id if latest_order else None,
            "created_at": latest_order.created_at if latest_order else None
        },
        "missing_order_ids": gaps,
        "recent_orders": [
            {
                "order_id": o.order_id,
                "status": o.order_status,
                "created_at": o.created_at
            } for o in recent_orders
        ],
        "analysis": {
            "sequence_ahead_of_orders": sequence_info.last_value > (latest_order.order_id if latest_order else 0),
            "gap_count": len(gaps),
            "likely_cause": "Orders were attempted but rolled back due to errors, incrementing sequence without creating records"
        }
    }