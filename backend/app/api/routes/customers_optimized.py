"""
Optimized customer management endpoints with improved search performance
"""
from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from functools import lru_cache

from ...database import get_db
from ...schemas_v2.customer import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse,
    CustomerLedgerResponse, CustomerOutstandingResponse,
    PaymentRecord, PaymentResponse
)
from ...services.customer_service import CustomerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/customers", tags=["customers"])

# Default organization ID (should come from auth in production)
DEFAULT_ORG_ID = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"

# Cache the area column check result
@lru_cache(maxsize=1)
def check_area_column_exists(db_url: str) -> bool:
    """Check if area column exists in customers table (cached)"""
    from ...database import SessionLocal
    db = SessionLocal()
    try:
        result = db.execute(text("""
            SELECT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'customers' 
                AND column_name = 'area'
            )
        """)).scalar()
        return result
    except Exception as e:
        logger.error(f"Error checking area column: {e}")
        return False
    finally:
        db.close()


@router.get("/", response_model=CustomerListResponse)
async def list_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    customer_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    city: Optional[str] = None,
    has_gstin: Optional[bool] = None,
    include_stats: bool = Query(False, description="Include statistics (slower)"),
    db: Session = Depends(get_db)
):
    """
    List customers with search, filter, and pagination
    
    - **search**: Search in name, phone, or customer code
    - **customer_type**: Filter by type (retail/wholesale/hospital/clinic/pharmacy)
    - **is_active**: Filter active/inactive customers
    - **has_gstin**: Filter customers with/without GST number
    - **include_stats**: Include business statistics (slower query)
    """
    try:
        logger.info(f"Customer search request: search={search}, limit={limit}, skip={skip}")
        
        # Check if area column exists (cached)
        from ...core.config import settings
        area_exists = check_area_column_exists(settings.DATABASE_URL)
        
        # Build optimized query with LEFT JOINs for statistics if requested
        if include_stats:
            # Single query with aggregated statistics
            base_query = """
                SELECT 
                    c.*,
                    COALESCE(COUNT(DISTINCT o.order_id), 0) as total_orders,
                    COALESCE(SUM(o.final_amount), 0) as total_business,
                    MAX(o.order_date) as last_order_date,
                    COALESCE(SUM(CASE 
                        WHEN o.order_status NOT IN ('cancelled', 'draft') 
                        AND o.paid_amount < o.final_amount 
                        THEN o.final_amount - o.paid_amount 
                        ELSE 0 
                    END), 0) as outstanding_amount
                FROM customers c
                LEFT JOIN orders o ON c.customer_id = o.customer_id 
                    AND o.order_status NOT IN ('cancelled', 'draft')
                WHERE c.org_id = :org_id
            """
            group_by = " GROUP BY c.customer_id"
        else:
            # Simple query without statistics
            base_query = "SELECT * FROM customers c WHERE c.org_id = :org_id"
            group_by = ""
        
        count_query = "SELECT COUNT(*) FROM customers WHERE org_id = :org_id"
        params = {"org_id": DEFAULT_ORG_ID}
        
        # Add filters
        if search:
            search_condition = """ AND (
                c.customer_name ILIKE :search OR 
                c.customer_code ILIKE :search OR 
                c.phone LIKE :search OR
                c.gstin LIKE :search OR
                c.city ILIKE :search"""
            
            if area_exists:
                search_condition += " OR c.area ILIKE :search"
            
            search_condition += ")"
            
            base_query += search_condition
            count_query += search_condition.replace("c.", "")
            params["search"] = f"%{search}%"
        
        if customer_type:
            base_query += " AND c.customer_type = :customer_type"
            count_query += " AND customer_type = :customer_type"
            params["customer_type"] = customer_type
        
        if is_active is not None:
            base_query += " AND c.is_active = :is_active"
            count_query += " AND is_active = :is_active"
            params["is_active"] = is_active
        
        if city:
            base_query += " AND c.city ILIKE :city"
            count_query += " AND city ILIKE :city"
            params["city"] = f"%{city}%"
        
        if has_gstin is not None:
            if has_gstin:
                base_query += " AND c.gstin IS NOT NULL"
                count_query += " AND gstin IS NOT NULL"
            else:
                base_query += " AND c.gstin IS NULL"
                count_query += " AND gstin IS NULL"
        
        # Get total count
        logger.debug(f"Executing count query: {count_query}")
        total = db.execute(text(count_query), params).scalar()
        logger.info(f"Total customers found: {total}")
        
        # Add grouping, ordering and pagination
        query = base_query + group_by + " ORDER BY c.customer_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        logger.debug(f"Executing main query: {query}")
        result = db.execute(text(query), params)
        
        customers = []
        for row in result:
            customer_dict = dict(row._mapping)
            
            # If statistics weren't included in the query, set default values
            if not include_stats:
                customer_dict.update({
                    "total_orders": 0,
                    "total_business": 0,
                    "last_order_date": None,
                    "outstanding_amount": 0
                })
            
            customers.append(CustomerResponse(**customer_dict))
        
        logger.info(f"Returning {len(customers)} customers")
        
        return CustomerListResponse(
            total=total,
            page=skip // limit + 1,
            per_page=limit,
            customers=customers
        )
        
    except Exception as e:
        logger.error(f"Error listing customers: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list customers: {str(e)}")


# You would also need to update the other endpoints similarly...
# For now, let's focus on the search optimization