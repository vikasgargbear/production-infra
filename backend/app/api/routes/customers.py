"""
Customer management endpoints for enterprise pharma system
Implements GST-compliant customer management with credit tracking
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
def check_area_column_exists() -> bool:
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


@router.post("/", response_model=CustomerResponse)
async def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new customer with GST details and credit limit
    
    - **customer_name**: Business name
    - **phone**: 10-digit mobile number
    - **gstin**: Optional GST number (validated)
    - **credit_limit**: Maximum credit allowed
    - **credit_days**: Payment terms in days
    """
    try:
        # Generate customer code
        customer_code = CustomerService.generate_customer_code(db, customer.customer_name)
        
        # Create customer - check if area column exists
        customer_data = customer.dict()
        customer_data["customer_code"] = customer_code
        
        # For backward compatibility, check if we need to include area
        try:
            # Try with area field first
            result = db.execute(text("""
                INSERT INTO customers (
                    org_id, customer_code, customer_name, contact_person,
                    phone, alternate_phone, email,
                    address_line1, address_line2, area, city, state, pincode,
                    gstin, pan_number, drug_license_number,
                    customer_type, credit_limit, credit_days, discount_percent,
                    is_active, notes, created_at, updated_at
                ) VALUES (
                    :org_id, :customer_code, :customer_name, :contact_person,
                    :phone, :alternate_phone, :email,
                    :address_line1, :address_line2, :area, :city, :state, :pincode,
                    :gstin, :pan_number, :drug_license_number,
                    :customer_type, :credit_limit, :credit_days, :discount_percent,
                    :is_active, :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING customer_id
            """), customer_data)
        except Exception as e:
            if "column \"area\" of relation \"customers\" does not exist" in str(e):
                # Fallback to without area field
                result = db.execute(text("""
                    INSERT INTO customers (
                        org_id, customer_code, customer_name, contact_person,
                        phone, alternate_phone, email,
                        address_line1, address_line2, city, state, pincode,
                        gstin, pan_number, drug_license_number,
                        customer_type, credit_limit, credit_days, discount_percent,
                        is_active, notes, created_at, updated_at
                    ) VALUES (
                        :org_id, :customer_code, :customer_name, :contact_person,
                        :phone, :alternate_phone, :email,
                        :address_line1, :address_line2, :city, :state, :pincode,
                        :gstin, :pan_number, :drug_license_number,
                        :customer_type, :credit_limit, :credit_days, :discount_percent,
                        :is_active, :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    ) RETURNING customer_id
                """), customer_data)
            else:
                raise
        
        customer_id = result.scalar()
        db.commit()
        
        # Get created customer with statistics
        return await get_customer(customer_id, db)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating customer: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create customer: {str(e)}")


@router.get("/", response_model=CustomerListResponse)
async def list_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    customer_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    city: Optional[str] = None,
    has_gstin: Optional[bool] = None,
    include_stats: bool = Query(True, description="Include business statistics"),
    db: Session = Depends(get_db)
):
    """
    List customers with search, filter, and pagination
    
    - **search**: Search in name, phone, or customer code
    - **customer_type**: Filter by type (retail/wholesale/hospital/clinic/pharmacy)
    - **is_active**: Filter active/inactive customers
    - **has_gstin**: Filter customers with/without GST number
    - **include_stats**: Include business statistics (set to false for faster response)
    """
    try:
        logger.info(f"Customer search request: search={search}, limit={limit}, skip={skip}, include_stats={include_stats}")
        
        # Build query
        query = "SELECT * FROM customers WHERE org_id = :org_id"
        count_query = "SELECT COUNT(*) FROM customers WHERE org_id = :org_id"
        params = {"org_id": DEFAULT_ORG_ID}
        
        # Add filters
        if search:
            # Check if area column exists (cached)
            area_exists = check_area_column_exists()
            
            if area_exists:
                query += """ AND (
                    customer_name ILIKE :search OR 
                    customer_code ILIKE :search OR 
                    phone LIKE :search OR
                    gstin LIKE :search OR
                    area ILIKE :search OR
                    city ILIKE :search
                )"""
                count_query += """ AND (
                    customer_name ILIKE :search OR 
                    customer_code ILIKE :search OR 
                    phone LIKE :search OR
                    gstin LIKE :search OR
                    area ILIKE :search OR
                    city ILIKE :search
                )"""
            else:
                query += """ AND (
                    customer_name ILIKE :search OR 
                    customer_code ILIKE :search OR 
                    phone LIKE :search OR
                    gstin LIKE :search OR
                    city ILIKE :search
                )"""
                count_query += """ AND (
                    customer_name ILIKE :search OR 
                    customer_code ILIKE :search OR 
                    phone LIKE :search OR
                    gstin LIKE :search OR
                    city ILIKE :search
                )"""
            params["search"] = f"%{search}%"
        
        if customer_type:
            query += " AND customer_type = :customer_type"
            count_query += " AND customer_type = :customer_type"
            params["customer_type"] = customer_type
        
        if is_active is not None:
            query += " AND is_active = :is_active"
            count_query += " AND is_active = :is_active"
            params["is_active"] = is_active
        
        if city:
            query += " AND city ILIKE :city"
            count_query += " AND city ILIKE :city"
            params["city"] = f"%{city}%"
        
        if has_gstin is not None:
            if has_gstin:
                query += " AND gstin IS NOT NULL"
                count_query += " AND gstin IS NOT NULL"
            else:
                query += " AND gstin IS NULL"
                count_query += " AND gstin IS NULL"
        
        # Get total count
        logger.debug(f"Executing count query: {count_query}")
        total = db.execute(text(count_query), params).scalar()
        logger.info(f"Total customers found: {total}")
        
        # Get customers
        query += " ORDER BY customer_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        logger.debug(f"Executing main query with params: {params}")
        result = db.execute(text(query), params)
        
        customers = []
        # Collect all customer data first
        customer_rows = list(result)
        
        # Get statistics in batch if requested
        stats_by_customer = {}
        if include_stats:
            customer_ids = [row.customer_id for row in customer_rows]
            stats_by_customer = CustomerService.get_customers_statistics_batch(db, customer_ids)
        
        # Build customer responses
        for row in customer_rows:
            customer_dict = dict(row._mapping)
            
            # Add statistics from batch lookup or default values
            if include_stats:
                customer_stats = stats_by_customer.get(row.customer_id, {})
                customer_dict.update({
                    "total_orders": customer_stats.get("total_orders", 0),
                    "total_business": customer_stats.get("total_business", 0),
                    "last_order_date": customer_stats.get("last_order_date"),
                    "outstanding_amount": customer_stats.get("outstanding_amount", 0)
                })
            else:
                # Set default values for statistics
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
        logger.error(f"Error listing customers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list customers: {str(e)}")


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """Get customer details with outstanding balance and statistics"""
    try:
        # Get customer
        result = db.execute(text("""
            SELECT * FROM customers WHERE customer_id = :id
        """), {"id": customer_id})
        
        customer = result.fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Get statistics
        stats = CustomerService.get_customer_statistics(db, customer_id)
        
        customer_dict = dict(customer._mapping)
        customer_dict.update(stats)
        
        return CustomerResponse(**customer_dict)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting customer: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get customer: {str(e)}")


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    customer_update: CustomerUpdate,
    db: Session = Depends(get_db)
):
    """Update customer details"""
    try:
        # Check if customer exists
        exists = db.execute(text("""
            SELECT 1 FROM customers WHERE customer_id = :id
        """), {"id": customer_id}).scalar()
        
        if not exists:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Build update query
        update_fields = []
        params = {"id": customer_id}
        
        for field, value in customer_update.dict(exclude_unset=True).items():
            if value is not None:
                update_fields.append(f"{field} = :{field}")
                params[field] = value
        
        if update_fields:
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            query = f"""
                UPDATE customers 
                SET {', '.join(update_fields)}
                WHERE customer_id = :id
            """
            
            db.execute(text(query), params)
            db.commit()
        
        # Return updated customer
        return await get_customer(customer_id, db)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating customer: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update customer: {str(e)}")


@router.get("/{customer_id}/ledger", response_model=CustomerLedgerResponse)
async def get_customer_ledger(
    customer_id: int,
    from_date: Optional[date] = Query(None, description="Start date for ledger"),
    to_date: Optional[date] = Query(None, description="End date for ledger"),
    db: Session = Depends(get_db)
):
    """Get customer transaction history (ledger)"""
    try:
        return CustomerService.get_customer_ledger(db, customer_id, from_date, to_date)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting customer ledger: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get customer ledger: {str(e)}")


@router.get("/{customer_id}/outstanding", response_model=CustomerOutstandingResponse)
async def get_customer_outstanding(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """Get outstanding invoices for a customer"""
    try:
        return CustomerService.get_outstanding_invoices(db, customer_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting customer outstanding: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get customer outstanding: {str(e)}")


@router.post("/{customer_id}/payment", response_model=PaymentResponse)
async def record_customer_payment(
    customer_id: int,
    payment: PaymentRecord,
    db: Session = Depends(get_db)
):
    """
    Record payment from customer
    
    - Payment is auto-allocated to oldest invoices by default
    - Optionally specify invoice IDs for manual allocation
    """
    try:
        # Validate customer ID matches
        if payment.customer_id != customer_id:
            raise HTTPException(status_code=400, detail="Customer ID mismatch")
        
        return CustomerService.record_payment(db, payment)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {str(e)}")


@router.post("/{customer_id}/check-credit")
async def check_credit_limit(
    customer_id: int,
    order_amount: float,
    db: Session = Depends(get_db)
):
    """Check if customer has sufficient credit for a new order"""
    try:
        result = CustomerService.validate_credit_limit(db, customer_id, order_amount)
        return result
    except Exception as e:
        logger.error(f"Error checking credit limit: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check credit limit: {str(e)}")