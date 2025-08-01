"""
Enterprise Order Management API
Robust, enterprise-grade API that prevents data integrity issues
Uses proper validation, transactions, and comprehensive error handling
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging

from ...database import get_db
from ...core.auth import get_current_org
from ...services.enterprise_order_service import (
    EnterpriseOrderService,
    OrderCreationRequest,
    OrderCreationResponse,
    OrderServiceError,
    OrderItemRequest,
    PaymentMode
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/enterprise-orders",
    tags=["enterprise-orders"]
)

# Backwards compatibility endpoint that maps to enterprise service
@router.post("/", response_model=OrderCreationResponse)
async def create_enterprise_order(
    order_request: OrderCreationRequest,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Create a complete order with comprehensive validation and data integrity
    
    This enterprise-grade endpoint:
    1. ✅ Validates all customer data comprehensively
    2. ✅ Ensures all product information is correct
    3. ✅ Handles inventory with FIFO/FEFO logic
    4. ✅ Creates orders with ALL required fields populated
    5. ✅ Creates invoices with complete data
    6. ✅ Processes payments with full audit trail
    7. ✅ Updates customer outstanding amounts
    8. ✅ Creates inventory movement records
    9. ✅ Handles all edge cases and errors gracefully
    10. ✅ Uses atomic transactions for data consistency
    
    Unlike the old quick-sale endpoint, this:
    - Populates customer_name, customer_phone in orders table
    - Validates credit limits before processing
    - Creates comprehensive audit trails
    - Handles batch allocation properly
    - Validates all required fields
    - Prevents data integrity issues
    """
    try:
        org_id = current_org["org_id"]
        logger.info(f"Creating enterprise order for org {org_id}, customer {order_request.customer_id}")
        
        # Initialize enterprise service
        order_service = EnterpriseOrderService(db, org_id)
        
        # Create order using enterprise service
        result = order_service.create_order(order_request)
        
        logger.info(f"Enterprise order created successfully: {result.order_number}")
        return result
        
    except OrderServiceError as e:
        logger.error(f"Order service error: {e.message} (Code: {e.code})")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": e.message,
                "code": e.code,
                "details": e.details
            }
        )
    except Exception as e:
        import traceback
        logger.error(f"Unexpected error creating enterprise order: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Return more detailed error for debugging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{str(e)}"
        )

# Backwards compatibility - maps old quick-sale format to new enterprise format
@router.post("/quick-sale", response_model=OrderCreationResponse)
async def create_quick_sale_compatible(
    request_data: dict,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Backwards compatible endpoint that maps old quick-sale requests to enterprise format
    
    This endpoint accepts the old quick-sale format and transforms it to use
    the new enterprise service, ensuring data integrity without breaking existing clients.
    """
    try:
        org_id = current_org["org_id"]
        logger.info(f"Processing quick-sale request for org {org_id}")
        
        # Transform old format to new enterprise format
        enterprise_request = _transform_quick_sale_request(request_data)
        
        # Initialize enterprise service
        order_service = EnterpriseOrderService(db, org_id)
        
        # Create order using enterprise service
        result = order_service.create_order(enterprise_request)
        
        logger.info(f"Quick-sale compatibility order created: {result.order_number}")
        
        # Return the full enterprise response (it already has all required fields)
        return result
        
    except OrderServiceError as e:
        logger.error(f"Quick-sale compatibility error: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message
        )
    except Exception as e:
        logger.error(f"Unexpected error in quick-sale compatibility: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sale failed: {str(e)}"
        )

def _transform_quick_sale_request(request_data: dict) -> OrderCreationRequest:
    """Transform old quick-sale request format to enterprise format"""
    
    # Extract items and transform to new format
    items = []
    for item in request_data.get('items', []):
        enterprise_item = OrderItemRequest(
            product_id=item['product_id'],
            quantity=item['quantity'],
            unit_price=item.get('unit_price'),
            discount_percent=item.get('discount_percent', 0),
            batch_id=item.get('batch_id')
        )
        items.append(enterprise_item)
    
    # Map payment mode
    payment_mode_map = {
        'cash': PaymentMode.CASH,
        'credit': PaymentMode.CREDIT,
        'card': PaymentMode.CARD,
        'upi': PaymentMode.UPI,
        'bank_transfer': PaymentMode.BANK_TRANSFER
    }
    
    payment_mode = payment_mode_map.get(
        request_data.get('payment_mode', 'cash').lower(), 
        PaymentMode.CASH
    )
    
    # Create enterprise request
    return OrderCreationRequest(
        customer_id=request_data['customer_id'],
        items=items,
        payment_mode=payment_mode,
        payment_amount=request_data.get('payment_amount'),
        discount_amount=request_data.get('discount_amount', 0),
        delivery_charges=request_data.get('other_charges', 0),  # Map other_charges to delivery_charges
        notes=request_data.get('notes'),
        delivery_type="pickup",  # Default for quick-sale
        # Add document references (NEW)
        order_id=request_data.get('order_id'),
        challan_id=request_data.get('challan_id')
    )

def _transform_to_legacy_response(enterprise_response: OrderCreationResponse) -> dict:
    """Transform enterprise response to legacy quick-sale format"""
    return {
        "success": enterprise_response.success,
        "invoice_number": enterprise_response.invoice_number,
        "total_amount": float(enterprise_response.total_amount),
        "order_id": enterprise_response.order_id,
        "invoice_id": enterprise_response.invoice_id,
        "invoice_url": f"/api/v1/invoices/{enterprise_response.invoice_id}/print",
        "message": enterprise_response.message
    }

# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check for enterprise orders API"""
    return {
        "status": "healthy",
        "service": "enterprise-orders",
        "version": "1.0.0",
        "features": [
            "comprehensive_validation",
            "atomic_transactions", 
            "inventory_fifo",
            "credit_limit_validation",
            "audit_trail",
            "backwards_compatibility"
        ]
    }

# Get order details
@router.get("/{order_id}")
async def get_order_details(
    order_id: int,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """Get comprehensive order details"""
    try:
        org_id = current_org["org_id"]
        
        # Get order with all related data
        from sqlalchemy import text
        
        order_query = text("""
            SELECT 
                o.*,
                c.customer_name, c.phone, c.email, c.address,
                i.invoice_number, i.invoice_status, i.total_amount as invoice_amount
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.customer_id
            LEFT JOIN invoices i ON o.order_id = i.order_id
            WHERE o.order_id = :order_id AND o.org_id = :org_id
        """)
        
        order = db.execute(order_query, {
            "order_id": order_id,
            "org_id": org_id
        }).first()
        
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Order {order_id} not found"
            )
        
        # Get order items
        items_query = text("""
            SELECT 
                oi.*,
                p.product_name, p.hsn_code, p.gst_percent
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.product_id
            WHERE oi.order_id = :order_id
        """)
        
        items = db.execute(items_query, {"order_id": order_id}).fetchall()
        
        # Get payments
        payments_query = text("""
            SELECT ip.*
            FROM invoice_payments ip
            JOIN invoices i ON ip.invoice_id = i.invoice_id
            WHERE i.order_id = :order_id
        """)
        
        payments = db.execute(payments_query, {"order_id": order_id}).fetchall()
        
        return {
            "order": dict(order._mapping) if order else None,
            "items": [dict(item._mapping) for item in items],
            "payments": [dict(payment._mapping) for payment in payments]
        }
        
    except Exception as e:
        logger.error(f"Error fetching order {order_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching order: {str(e)}"
        )