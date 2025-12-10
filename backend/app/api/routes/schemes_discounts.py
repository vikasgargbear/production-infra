"""
Schemes & Discounts API
Manages promotional schemes, discounts, and offers
"""
from typing import Optional, List
from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging
import json

from ...core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ...core.org_context import get_org_context, OrgContext
from ...core.permissions import PermissionChecker
# get_org_id_string replaced with OrgContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schemes", tags=["schemes-discounts"])

class SchemeCreate(BaseModel):
    """Schema for creating a promotional scheme"""
    scheme_name: str
    scheme_type: str = Field(..., pattern="^(percentage_discount|flat_discount|buy_x_get_y|volume_based|product_combo|bill_value_discount)$")
    description: Optional[str] = None
    start_date: date
    end_date: date
    is_active: bool = True
    
    # Discount details
    discount_percentage: Optional[float] = Field(None, ge=0, le=100)
    discount_amount: Optional[Decimal] = Field(None, ge=0)
    
    # Buy X Get Y details
    buy_quantity: Optional[int] = None
    get_quantity: Optional[int] = None
    
    # Volume-based details
    volume_slabs: Optional[List[dict]] = None  # [{"min_qty": 10, "max_qty": 50, "discount": 5}]
    
    # Product filters
    applicable_products: Optional[List[int]] = None  # Product IDs
    applicable_categories: Optional[List[int]] = None  # Category IDs
    applicable_brands: Optional[List[str]] = None
    
    # Customer filters
    applicable_customers: Optional[List[int]] = None  # Customer IDs
    applicable_customer_groups: Optional[List[str]] = None
    
    # Bill value discount
    min_bill_value: Optional[Decimal] = None
    max_discount_amount: Optional[Decimal] = None
    
    # Additional rules
    max_uses_per_customer: Optional[int] = None
    can_combine_with_other: bool = False
    priority: int = Field(default=1, ge=1, le=10)

class SchemeResponse(BaseModel):
    """Schema for scheme response"""
    scheme_id: int
    scheme_name: str
    scheme_type: str
    discount_value: Optional[float]
    start_date: date
    end_date: date
    is_active: bool
    usage_count: int
    
class DiscountCalculation(BaseModel):
    """Schema for discount calculation request"""
    customer_id: Optional[int] = None
    products: List[dict]  # [{"product_id": 1, "quantity": 10, "price": 100}]
    bill_value: Decimal
    apply_best_scheme: bool = True

@router.post("/", response_model=dict)
@with_tenant_context
async def create_scheme(
    scheme: SchemeCreate,
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a new promotional scheme
    
    - Supports multiple scheme types
    - Configurable validity period
    - Product/customer filtering
    """
    try:
        # Generate scheme code
        scheme_code = f"SCH-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Prepare scheme data
        scheme_data = {
            "org_id": str(context.org_id),
            "scheme_code": scheme_code,
            "scheme_name": scheme.scheme_name,
            "scheme_type": scheme.scheme_type,
            "description": scheme.description,
            "start_date": scheme.start_date,
            "end_date": scheme.end_date,
            "is_active": scheme.is_active,
            "discount_percentage": scheme.discount_percentage,
            "discount_amount": scheme.discount_amount,
            "buy_quantity": scheme.buy_quantity,
            "get_quantity": scheme.get_quantity,
            "min_bill_value": scheme.min_bill_value,
            "max_discount_amount": scheme.max_discount_amount,
            "max_uses_per_customer": scheme.max_uses_per_customer,
            "can_combine": scheme.can_combine_with_other,
            "priority": scheme.priority,
            "created_by": 1
        }
        
        # Insert main scheme
        insert_query = """
            INSERT INTO sales.promotional_schemes (
                org_id, scheme_code, scheme_name, scheme_type, description,
                start_date, end_date, is_active, discount_percentage, discount_amount,
                buy_quantity, get_quantity, min_bill_value, max_discount_amount,
                max_uses_per_customer, can_combine, priority, created_by
            ) VALUES (
                :org_id, :scheme_code, :scheme_name, :scheme_type, :description,
                :start_date, :end_date, :is_active, :discount_percentage, :discount_amount,
                :buy_quantity, :get_quantity, :min_bill_value, :max_discount_amount,
                :max_uses_per_customer, :can_combine, :priority, :created_by
            ) RETURNING scheme_id
        """
        
        result = db.execute(text(insert_query), scheme_data)
        scheme_id = result.scalar()
        
        # Save volume slabs if provided
        if scheme.volume_slabs:
            for slab in scheme.volume_slabs:
                slab_query = """
                    INSERT INTO sales.scheme_volume_slabs (
                        scheme_id, min_quantity, max_quantity, discount_percentage, discount_amount
                    ) VALUES (
                        :scheme_id, :min_qty, :max_qty, :discount_percentage, :discount_amount
                    )
                """
                db.execute(text(slab_query), {
                    "scheme_id": scheme_id,
                    "min_qty": slab.get("min_qty"),
                    "max_qty": slab.get("max_qty"),
                    "discount_percentage": slab.get("discount_percentage"),
                    "discount_amount": slab.get("discount_amount")
                })
        
        # Save product filters
        if scheme.applicable_products:
            for product_id in scheme.applicable_products:
                product_query = """
                    INSERT INTO sales.scheme_products (scheme_id, product_id)
                    VALUES (:scheme_id, :product_id)
                """
                db.execute(text(product_query), {
                    "scheme_id": scheme_id,
                    "product_id": product_id
                })
        
        # Save customer filters
        if scheme.applicable_customers:
            for customer_id in scheme.applicable_customers:
                customer_query = """
                    INSERT INTO sales.scheme_customers (scheme_id, customer_id)
                    VALUES (:scheme_id, :customer_id)
                """
                db.execute(text(customer_query), {
                    "scheme_id": scheme_id,
                    "customer_id": customer_id
                })
        
        # TenantAwareSession auto-commits
        
        return {
            "scheme_id": scheme_id,
            "scheme_code": scheme_code,
            "message": "Scheme created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating scheme: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create scheme: {str(e)}")

@router.get("/active")
@with_tenant_context
async def get_active_schemes(
    customer_id: Optional[int] = None,
    product_id: Optional[int] = None,
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get all active schemes
    
    - Filter by customer eligibility
    - Filter by product applicability
    - Shows scheme details and usage
    """
    try:
        query = """
            SELECT DISTINCT
                s.scheme_id,
                s.scheme_code,
                s.scheme_name,
                s.scheme_type,
                s.description,
                s.discount_percentage,
                s.discount_amount,
                s.buy_quantity,
                s.get_quantity,
                s.min_bill_value,
                s.start_date,
                s.end_date,
                s.priority,
                s.can_combine,
                COUNT(DISTINCT su.usage_id) as total_usage
            FROM sales.promotional_schemes s
            LEFT JOIN sales.scheme_usage su ON s.scheme_id = su.scheme_id
            WHERE s.is_active = true
                AND CURRENT_DATE BETWEEN s.start_date AND s.end_date
        """
        
        params = {}
        
        # Filter by customer if specified
        if customer_id:
            query += """
                AND (
                    NOT EXISTS (
                        SELECT 1 FROM sales.scheme_customers sc 
                        WHERE sc.scheme_id = s.scheme_id
                    )
                    OR EXISTS (
                        SELECT 1 FROM sales.scheme_customers sc 
                        WHERE sc.scheme_id = s.scheme_id 
                        AND sc.customer_id = :customer_id
                    )
                )
            """
            params["customer_id"] = customer_id
        
        # Filter by product if specified
        if product_id:
            query += """
                AND (
                    NOT EXISTS (
                        SELECT 1 FROM sales.scheme_products sp 
                        WHERE sp.scheme_id = s.scheme_id
                    )
                    OR EXISTS (
                        SELECT 1 FROM sales.scheme_products sp 
                        WHERE sp.scheme_id = s.scheme_id 
                        AND sp.product_id = :product_id
                    )
                )
            """
            params["product_id"] = product_id
        
        query += " GROUP BY s.scheme_id ORDER BY s.priority DESC, s.scheme_id"
        
        result = db.execute(text(query), params)
        schemes = [dict(row._mapping) for row in result]
        
        # Get volume slabs for volume-based schemes
        for scheme in schemes:
            if scheme["scheme_type"] == "volume_based":
                slab_query = """
                    SELECT min_quantity, max_quantity, discount_percentage, discount_amount
                    FROM sales.scheme_volume_slabs
                    WHERE scheme_id = :scheme_id
                    ORDER BY min_quantity
                """
                slab_result = db.execute(text(slab_query), {"scheme_id": scheme["scheme_id"]})
                scheme["volume_slabs"] = [dict(row._mapping) for row in slab_result]
        
        return schemes
        
    except Exception as e:
        logger.error(f"Error fetching active schemes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch active schemes")

@router.post("/calculate-discount")
@with_tenant_context
async def calculate_discount(
    calculation: DiscountCalculation,
    _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Calculate applicable discounts for given products
    
    - Evaluates all eligible schemes
    - Returns best discount or all applicable discounts
    - Handles scheme combinations
    """
    try:
        # Get applicable schemes
        schemes = await get_active_schemes(
            customer_id=calculation.customer_id,
            db=db
        )
        
        applicable_discounts = []
        
        for scheme in schemes:
            discount_info = {
                "scheme_id": scheme["scheme_id"],
                "scheme_name": scheme["scheme_name"],
                "scheme_type": scheme["scheme_type"],
                "discount_amount": 0,
                "free_items": []
            }
            
            # Check if scheme applies to the products
            scheme_products = []
            if scheme["scheme_type"] in ["percentage_discount", "flat_discount", "buy_x_get_y", "volume_based"]:
                # Check product applicability
                for product in calculation.products:
                    product_check = """
                        SELECT 1 FROM sales.scheme_products sp
                        WHERE sp.scheme_id = :scheme_id AND sp.product_id = :product_id
                    """
                    result = db.execute(text(product_check), {
                        "scheme_id": scheme["scheme_id"],
                        "product_id": product["product_id"]
                    })
                    
                    # If no specific products configured, or product is in list
                    if not result.first():
                        # Check if no products configured (applies to all)
                        all_check = """
                            SELECT COUNT(*) as count FROM sales.scheme_products
                            WHERE scheme_id = :scheme_id
                        """
                        all_result = db.execute(text(all_check), {"scheme_id": scheme["scheme_id"]})
                        if all_result.scalar() == 0:
                            scheme_products.append(product)
                    else:
                        scheme_products.append(product)
            
            # Calculate discount based on scheme type
            if scheme["scheme_type"] == "percentage_discount" and scheme_products:
                total_eligible = sum(p["quantity"] * p["price"] for p in scheme_products)
                discount_info["discount_amount"] = total_eligible * (scheme["discount_percentage"] / 100)
                
            elif scheme["scheme_type"] == "flat_discount" and scheme_products:
                discount_info["discount_amount"] = float(scheme["discount_amount"] or 0)
                
            elif scheme["scheme_type"] == "buy_x_get_y" and scheme_products:
                for product in scheme_products:
                    if product["quantity"] >= scheme["buy_quantity"]:
                        free_qty = (product["quantity"] // scheme["buy_quantity"]) * scheme["get_quantity"]
                        discount_info["free_items"].append({
                            "product_id": product["product_id"],
                            "free_quantity": free_qty
                        })
                        # Calculate discount as value of free items
                        discount_info["discount_amount"] += free_qty * product["price"]
                        
            elif scheme["scheme_type"] == "volume_based" and scheme_products:
                # Get applicable slab
                total_qty = sum(p["quantity"] for p in scheme_products)
                for slab in scheme.get("volume_slabs", []):
                    if slab["min_quantity"] <= total_qty <= (slab["max_quantity"] or float('inf')):
                        if slab["discount_percentage"]:
                            total_value = sum(p["quantity"] * p["price"] for p in scheme_products)
                            discount_info["discount_amount"] = total_value * (slab["discount_percentage"] / 100)
                        elif slab["discount_amount"]:
                            discount_info["discount_amount"] = float(slab["discount_amount"])
                        break
                        
            elif scheme["scheme_type"] == "bill_value_discount":
                if calculation.bill_value >= (scheme["min_bill_value"] or 0):
                    if scheme["discount_percentage"]:
                        discount_info["discount_amount"] = float(calculation.bill_value) * (scheme["discount_percentage"] / 100)
                    elif scheme["discount_amount"]:
                        discount_info["discount_amount"] = float(scheme["discount_amount"])
                    
                    # Apply max discount cap if set
                    if scheme["max_discount_amount"] and discount_info["discount_amount"] > float(scheme["max_discount_amount"]):
                        discount_info["discount_amount"] = float(scheme["max_discount_amount"])
            
            # Add to applicable discounts if discount > 0
            if discount_info["discount_amount"] > 0 or discount_info["free_items"]:
                discount_info["can_combine"] = scheme["can_combine"]
                discount_info["priority"] = scheme["priority"]
                applicable_discounts.append(discount_info)
        
        # Sort by discount amount (best first)
        applicable_discounts.sort(key=lambda x: x["discount_amount"], reverse=True)
        
        # Apply best scheme or combine if allowed
        if calculation.apply_best_scheme and applicable_discounts:
            # Find best non-combinable scheme
            best_exclusive = next((d for d in applicable_discounts if not d["can_combine"]), None)
            
            # Find all combinable schemes
            combinable = [d for d in applicable_discounts if d["can_combine"]]
            
            # Calculate total combinable discount
            total_combinable = sum(d["discount_amount"] for d in combinable)
            
            # Return best option
            if best_exclusive and best_exclusive["discount_amount"] > total_combinable:
                return {
                    "applied_schemes": [best_exclusive],
                    "total_discount": best_exclusive["discount_amount"],
                    "net_amount": float(calculation.bill_value) - best_exclusive["discount_amount"]
                }
            else:
                return {
                    "applied_schemes": combinable,
                    "total_discount": total_combinable,
                    "net_amount": float(calculation.bill_value) - total_combinable
                }
        else:
            # Return all applicable discounts
            total_discount = sum(d["discount_amount"] for d in applicable_discounts)
            return {
                "applicable_schemes": applicable_discounts,
                "total_possible_discount": total_discount,
                "net_amount": float(calculation.bill_value) - total_discount
            }
        
    except Exception as e:
        logger.error(f"Error calculating discount: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate discount: {str(e)}")

@router.post("/apply-to-invoice")
@with_tenant_context
async def apply_scheme_to_invoice(
    invoice_data: dict,
    _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Apply schemes to an invoice
    
    Records scheme usage and updates invoice with discounts
    """
    try:
        invoice_id = invoice_data.get("invoice_id")
        applied_schemes = invoice_data.get("applied_schemes", [])
        
        total_discount = 0
        
        for scheme_application in applied_schemes:
            scheme_id = scheme_application.get("scheme_id")
            discount_amount = scheme_application.get("discount_amount", 0)
            free_items = scheme_application.get("free_items", [])
            
            # Record scheme usage
            usage_query = """
                INSERT INTO sales.scheme_usage (
                    scheme_id, invoice_id, customer_id, usage_date,
                    discount_given, free_items_data
                ) VALUES (
                    :scheme_id, :invoice_id, :customer_id, CURRENT_DATE,
                    :discount_given, :free_items_data
                ) RETURNING usage_id
            """
            
            # Get customer_id from invoice
            invoice_check = db.execute(
                text("SELECT customer_id FROM sales.invoices WHERE invoice_id = :invoice_id"),
                {"invoice_id": invoice_id}
            )
            invoice = invoice_check.first()
            if not invoice:
                raise ValueError(f"Invoice {invoice_id} not found")
            
            db.execute(text(usage_query), {
                "scheme_id": scheme_id,
                "invoice_id": invoice_id,
                "customer_id": invoice.customer_id,
                "discount_given": discount_amount,
                "free_items_data": json.dumps(free_items) if free_items else None
            })
            
            total_discount += discount_amount
            
            # Add free items to invoice if any
            for free_item in free_items:
                free_item_query = """
                    INSERT INTO sales.invoice_items (
                        invoice_id, product_id, quantity, price,
                        is_free_item, scheme_id
                    ) VALUES (
                        :invoice_id, :product_id, :quantity, 0,
                        true, :scheme_id
                    )
                """
                db.execute(text(free_item_query), {
                    "invoice_id": invoice_id,
                    "product_id": free_item["product_id"],
                    "quantity": free_item["free_quantity"],
                    "scheme_id": scheme_id
                })
        
        # Update invoice with total scheme discount
        if total_discount > 0:
            update_invoice = """
                UPDATE sales.invoices
                SET scheme_discount = :discount,
                    final_amount = final_amount - :discount
                WHERE invoice_id = :invoice_id
            """
            db.execute(text(update_invoice), {
                "discount": total_discount,
                "invoice_id": invoice_id
            })
        
        # TenantAwareSession auto-commits
        
        return {
            "invoice_id": invoice_id,
            "schemes_applied": len(applied_schemes),
            "total_discount": total_discount,
            "status": "success"
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error applying schemes to invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to apply schemes: {str(e)}")

@router.get("/{scheme_id}")
@with_tenant_context
async def get_scheme_details(
    scheme_id: int,
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get detailed information about a specific scheme"""
    try:
        # Get scheme details
        scheme_query = """
            SELECT 
                s.*,
                COUNT(DISTINCT su.usage_id) as total_usage,
                COALESCE(SUM(su.discount_given), 0) as total_discount_given
            FROM sales.promotional_schemes s
            LEFT JOIN sales.scheme_usage su ON s.scheme_id = su.scheme_id
            WHERE s.scheme_id = :scheme_id
            GROUP BY s.scheme_id
        """
        
        result = db.execute(text(scheme_query), {"scheme_id": scheme_id})
        scheme = result.first()
        
        if not scheme:
            raise HTTPException(status_code=404, detail="Scheme not found")
        
        scheme_data = dict(scheme._mapping)
        
        # Get applicable products
        products_query = """
            SELECT p.product_id, p.product_name, p.product_code
            FROM sales.scheme_products sp
            JOIN inventory.products p ON sp.product_id = p.product_id
            WHERE sp.scheme_id = :scheme_id
        """
        products_result = db.execute(text(products_query), {"scheme_id": scheme_id})
        scheme_data["applicable_products"] = [dict(row._mapping) for row in products_result]
        
        # Get applicable customers
        customers_query = """
            SELECT c.customer_id, c.customer_name, c.customer_code
            FROM sales.scheme_customers sc
            JOIN parties.customers c ON sc.customer_id = c.customer_id
            WHERE sc.scheme_id = :scheme_id
        """
        customers_result = db.execute(text(customers_query), {"scheme_id": scheme_id})
        scheme_data["applicable_customers"] = [dict(row._mapping) for row in customers_result]
        
        # Get volume slabs if applicable
        if scheme_data["scheme_type"] == "volume_based":
            slabs_query = """
                SELECT * FROM sales.scheme_volume_slabs
                WHERE scheme_id = :scheme_id
                ORDER BY min_quantity
            """
            slabs_result = db.execute(text(slabs_query), {"scheme_id": scheme_id})
            scheme_data["volume_slabs"] = [dict(row._mapping) for row in slabs_result]
        
        return scheme_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching scheme details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch scheme details")

@router.put("/{scheme_id}")
@with_tenant_context
async def update_scheme(
    scheme_id: int,
    update_data: dict,
    _: dict = Depends(PermissionChecker("sales", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update scheme details"""
    try:
        # Build update query dynamically
        update_fields = []
        params = {"scheme_id": scheme_id}
        
        allowed_fields = [
            "scheme_name", "description", "start_date", "end_date", "is_active",
            "discount_percentage", "discount_amount", "buy_quantity", "get_quantity",
            "min_bill_value", "max_discount_amount", "max_uses_per_customer",
            "can_combine", "priority"
        ]
        
        for field in allowed_fields:
            if field in update_data:
                update_fields.append(f"{field} = :{field}")
                params[field] = update_data[field]
        
        if update_fields:
            query = f"""
                UPDATE sales.promotional_schemes
                SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
                WHERE scheme_id = :scheme_id
            """
            
            db.execute(text(query), params)
            # TenantAwareSession auto-commits
        
        return {"message": "Scheme updated successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating scheme: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update scheme: {str(e)}")

@router.delete("/{scheme_id}")
@with_tenant_context
async def deactivate_scheme(
    scheme_id: int,
    _: dict = Depends(PermissionChecker("sales", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Deactivate a scheme (soft delete)"""
    try:
        query = """
            UPDATE sales.promotional_schemes
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE scheme_id = :scheme_id
        """
        
        result = db.execute(text(query), {"scheme_id": scheme_id})
        
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Scheme not found")
        
        # TenantAwareSession auto-commits
        
        return {"message": "Scheme deactivated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deactivating scheme: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to deactivate scheme")

@router.get("/usage/report")
@with_tenant_context
async def get_scheme_usage_report(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    scheme_id: Optional[int] = Query(None),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get scheme usage analytics and report
    
    - Usage by scheme
    - Total discounts given
    - Customer-wise usage
    """
    try:
        query = """
            SELECT 
                s.scheme_id,
                s.scheme_name,
                s.scheme_type,
                COUNT(DISTINCT su.usage_id) as usage_count,
                COUNT(DISTINCT su.customer_id) as unique_customers,
                COALESCE(SUM(su.discount_given), 0) as total_discount,
                COALESCE(AVG(su.discount_given), 0) as avg_discount
            FROM sales.promotional_schemes s
            LEFT JOIN sales.scheme_usage su ON s.scheme_id = su.scheme_id
            WHERE 1=1
        """
        
        params = {}
        
        if from_date:
            query += " AND su.usage_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND su.usage_date <= :to_date"
            params["to_date"] = to_date
            
        if scheme_id:
            query += " AND s.scheme_id = :scheme_id"
            params["scheme_id"] = scheme_id
        
        query += " GROUP BY s.scheme_id ORDER BY total_discount DESC"
        
        result = db.execute(text(query), params)
        usage_report = [dict(row._mapping) for row in result]
        
        # Calculate totals
        total_discount_given = sum(row["total_discount"] for row in usage_report)
        total_usage = sum(row["usage_count"] for row in usage_report)
        
        return {
            "report_period": {
                "from_date": from_date,
                "to_date": to_date
            },
            "summary": {
                "total_schemes": len(usage_report),
                "total_usage": total_usage,
                "total_discount_given": total_discount_given,
                "average_discount_per_use": total_discount_given / total_usage if total_usage > 0 else 0
            },
            "scheme_wise_usage": usage_report
        }
        
    except Exception as e:
        logger.error(f"Error generating usage report: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate usage report")