"""
Customer management endpoints for enterprise pharma system
Implements GST-compliant customer management with credit tracking
"""
from typing import Optional
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from functools import lru_cache

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID
from ..schemas.customer import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse,
    CustomerLedgerResponse, CustomerOutstandingResponse,
    PaymentRecord, PaymentResponse
)
from ..services.customer_service import CustomerService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["master", "customers"])

# Cache the area column check result
@lru_cache(maxsize=1)
def check_area_column_exists() -> bool:
    """Check if area column exists in customers table (cached)"""
    from ...core.database import SessionLocal
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


@router.post("/")
async def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new customer with GST details and credit limit
    
    - **customer_name**: Business name
    - **primary_phone as phone**: 10-digit mobile number
    - **gst_number as gstin**: Optional GST number (validated)
    - **credit_limit**: Maximum credit allowed
    - **credit_days**: Payment terms in days
    """
    try:
        # Generate customer code
        customer_code = CustomerService.generate_customer_code(db, customer.customer_name)
        
        # Create customer - check if area column exists
        customer_data = customer.dict()
        customer_data["customer_code"] = customer_code
        
        # Map schema fields to database columns
        mapped_data = {
            "org_id": customer_data.get("org_id"),
            "customer_code": customer_code,
            "customer_name": customer_data.get("customer_name"),
            "customer_type": customer_data.get("customer_type"),
            "primary_phone": customer_data.get("primary_phone"),
            "primary_email": customer_data.get("email"),
            "secondary_phone": customer_data.get("secondary_phone"),
            "contact_person_name": customer_data.get("contact_person"),
            "gst_number": customer_data.get("gstin"),
            "pan_number": customer_data.get("pan_number"),
            "drug_license_number": customer_data.get("drug_license_number"),
            "credit_limit": customer_data.get("credit_limit", 0),
            "credit_days": customer_data.get("credit_days", 0),
            "internal_notes": customer_data.get("notes"),
            "is_active": customer_data.get("is_active", True)
        }
        
        # Create customer with correct column names
        result = db.execute(text("""
            INSERT INTO parties.customers (
                org_id, customer_code, customer_name, customer_type,
                primary_phone, primary_email, secondary_phone,
                contact_person_name, gst_number, pan_number, drug_license_number,
                credit_limit, credit_days, internal_notes, is_active,
                created_at, updated_at
            ) VALUES (
                :org_id, :customer_code, :customer_name, :customer_type,
                :primary_phone, :primary_email, :secondary_phone,
                :contact_person_name, :gst_number, :pan_number, :drug_license_number,
                :credit_limit, :credit_days, :internal_notes, :is_active,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING customer_id
        """), mapped_data)
        
        customer_id = result.scalar()
        
        # Create address record if address data is provided
        if any([customer_data.get(f) for f in ['address_line1', 'city', 'state', 'pincode']]):
            # Map state name to state code (simplified mapping for common states)
            state_code_map = {
                'maharashtra': '27', 'rajasthan': '08', 'gujarat': '24',
                'delhi': '07', 'karnataka': '29', 'tamil nadu': '33',
                'uttar pradesh': '09', 'west bengal': '19', 'haryana': '06',
                'punjab': '03', 'kerala': '32', 'telangana': '36'
            }
            
            state_name = customer_data.get('state', '')
            state_code = state_code_map.get(state_name.lower(), '27')  # Default to Maharashtra
            
            address_data = {
                "org_id": customer_data.get("org_id"),
                "entity_type": "customer",
                "entity_id": customer_id,
                "address_type": "billing",  # Default billing address
                "address_line1": customer_data.get("address_line1", ""),
                "address_line2": customer_data.get("address_line2", ""),
                "city": customer_data.get("city", ""),
                "state_code": state_code,
                "state_name": state_name or "Maharashtra",
                "pincode": customer_data.get("pincode", ""),
                "country": "India",
                "is_default": True
            }
            
            # Insert address
            db.execute(text("""
                INSERT INTO master.addresses (
                    org_id, entity_type, entity_id, address_type,
                    address_line1, address_line2, city, state_code, state_name,
                    pincode, country, is_default, created_at, updated_at
                ) VALUES (
                    :org_id, :entity_type, :entity_id, :address_type,
                    :address_line1, :address_line2, :city, :state_code, :state_name,
                    :pincode, :country, :is_default, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """), address_data)
            
            # Also create shipping address (same as billing for now)
            address_data["address_type"] = "shipping"
            db.execute(text("""
                INSERT INTO master.addresses (
                    org_id, entity_type, entity_id, address_type,
                    address_line1, address_line2, city, state_code, state_name,
                    pincode, country, is_default, created_at, updated_at
                ) VALUES (
                    :org_id, :entity_type, :entity_id, :address_type,
                    :address_line1, :address_line2, :city, :state_code, :state_name,
                    :pincode, :country, :is_default, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """), address_data)
        
        db.commit()
        
        # Return simplified response
        return {
            "customer_id": customer_id,
            "customer_code": customer_code,
            "customer_name": customer_data.get("customer_name"),
            "customer_type": customer_data.get("customer_type"),
            "primary_phone": customer_data.get("primary_phone"),
            "email": customer_data.get("email"),
            "gstin": customer_data.get("gstin"),
            "credit_limit": customer_data.get("credit_limit", 0),
            "credit_days": customer_data.get("credit_days", 0),
            "is_active": True,
            "created_at": datetime.now().isoformat(),
            "message": "Customer created successfully"
        }
        
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
    include_stats: bool = Query(False, description="Include business statistics (disabled by default for performance)"),
    fast_search: bool = Query(True, description="Use fast search mode (minimal data for quick response)"),
    db: Session = Depends(get_db)
):
    """
    List customers with search, filter, and pagination
    
    - **search**: Search in name, primary_phone as phone, or customer code
    - **customer_type**: Filter by type (retail/wholesale/hospital/clinic/pharmacy)
    - **is_active**: Filter active/inactive customers
    - **has_gstin**: Filter customers with/without GST number
    - **include_stats**: Include business statistics (set to false for faster response)
    """
    try:
        logger.info(f"Customer search request: search={search}, limit={limit}, skip={skip}, include_stats={include_stats}")
        
        # Build query with fast search optimization (include required fields for Pydantic)
        if fast_search:
            # Minimal columns for fast search response + required schema fields
            query = """SELECT customer_id, customer_name, customer_code, primary_phone, 
                      customer_type, gst_number, is_active, org_id, created_at, updated_at 
                      FROM parties.customers WHERE org_id = :org_id"""
        else:
            # Full query for detailed view
            query = "SELECT * FROM parties.customers WHERE org_id = :org_id"
        count_query = "SELECT COUNT(*) FROM parties.customers WHERE org_id = :org_id"
        params = {"org_id": DEFAULT_ORG_ID}
        
        # Add filters
        if search:
            # Check if area column exists (cached)
            area_exists = check_area_column_exists()
            
            if area_exists:
                query += """ AND (
                    customer_name ILIKE :search OR 
                    customer_code ILIKE :search OR 
                    primary_phone LIKE :search OR
                    gst_number LIKE :search
                )"""
                count_query += """ AND (
                    customer_name ILIKE :search OR 
                    customer_code ILIKE :search OR 
                    primary_phone LIKE :search OR
                    gst_number LIKE :search
                )"""
            else:
                query += """ AND (
                    customer_name ILIKE :search OR 
                    customer_code ILIKE :search OR 
                    primary_phone LIKE :search OR
                    gst_number LIKE :search
                )"""
                count_query += """ AND (
                    customer_name ILIKE :search OR 
                    customer_code ILIKE :search OR 
                    primary_phone LIKE :search OR
                    gst_number LIKE :search
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
        
        # Note: city filter removed as it's not in customers table
        
        if has_gstin is not None:
            if has_gstin:
                query += " AND gst_number IS NOT NULL"
                count_query += " AND gst_number IS NOT NULL"
            else:
                query += " AND gst_number IS NULL"
                count_query += " AND gst_number IS NULL"
        
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
        
        # Get statistics in batch if requested (with error handling for production)
        stats_by_customer = {}
        if include_stats:
            try:
                customer_ids = [row.customer_id for row in customer_rows]
                stats_by_customer = CustomerService.get_customers_statistics_batch(db, customer_ids)
                logger.info(f"Successfully loaded stats for {len(stats_by_customer)} customers")
            except Exception as stats_error:
                logger.warning(f"Failed to load customer statistics: {stats_error}")
                # Continue without stats rather than failing the entire request
                stats_by_customer = {}
        
        # Build customer responses
        for row in customer_rows:
            customer_dict = dict(row._mapping)
            
            # Map database columns to schema fields
            customer_dict["primary_phone"] = customer_dict.get("primary_phone", None)
            customer_dict["email"] = customer_dict.pop("primary_email", None)
            customer_dict["secondary_phone"] = customer_dict.get("secondary_phone", None)
            customer_dict["contact_person"] = customer_dict.pop("contact_person_name", None)
            customer_dict["gstin"] = customer_dict.pop("gst_number", None)
            customer_dict["notes"] = customer_dict.pop("internal_notes", None)
            
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
            SELECT * FROM parties.customers WHERE customer_id = :id
        """), {"id": customer_id})
        
        customer = result.fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Get statistics
        stats = CustomerService.get_customer_statistics(db, customer_id)
        
        customer_dict = dict(customer._mapping)
        
        # Map database columns to schema fields
        customer_dict["primary_phone"] = customer_dict.get("primary_phone", None)
        customer_dict["email"] = customer_dict.pop("primary_email", None)
        customer_dict["secondary_phone"] = customer_dict.get("secondary_phone", None)
        customer_dict["contact_person"] = customer_dict.pop("contact_person_name", None)
        customer_dict["gstin"] = customer_dict.pop("gst_number", None)
        customer_dict["notes"] = customer_dict.pop("internal_notes", None)
        
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
            SELECT 1 FROM parties.customers WHERE customer_id = :id
        """), {"id": customer_id}).scalar()
        
        if not exists:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Build update query
        update_fields = []
        params = {"id": customer_id}
        
        # Map schema fields to database columns
        field_mapping = {
            "primary_phone": "primary_phone",
            "email": "primary_email",
            "secondary_phone": "secondary_phone",
            "contact_person": "contact_person_name",
            "gstin": "gst_number",
            "notes": "internal_notes"
        }
        
        for field, value in customer_update.dict(exclude_unset=True).items():
            if value is not None:
                db_field = field_mapping.get(field, field)
                update_fields.append(f"{db_field} = :{field}")
                params[field] = value
        
        if update_fields:
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            query = f"""
                UPDATE parties.customers 
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


@router.get("/{customer_id}/addresses")
async def get_customer_addresses(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """Get all addresses for a customer"""
    try:
        # First check if customer exists
        customer_check = db.execute(text("""
            SELECT customer_id FROM parties.customers WHERE customer_id = :id
        """), {"id": customer_id})
        
        if not customer_check.fetchone():
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Get all addresses for this customer
        result = db.execute(text("""
            SELECT 
                address_id, entity_type, entity_id, address_type,
                address_line1, address_line2, landmark, city, 
                state_code, state_name, country, pincode,
                latitude, longitude, contact_person, contact_number,
                is_default, is_active, created_at, updated_at
            FROM master.addresses 
            WHERE entity_type = 'customer' 
            AND entity_id = :customer_id 
            AND is_active = true
            ORDER BY is_default DESC, address_type ASC, created_at DESC
        """), {"customer_id": customer_id})
        
        addresses = [dict(row._mapping) for row in result.fetchall()]
        
        # Return empty array if no addresses found (not 404)
        return {
            "success": True,
            "data": addresses,
            "customer_id": customer_id,
            "total_addresses": len(addresses),
            "message": f"Found {len(addresses)} addresses for customer {customer_id}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting customer addresses: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get customer addresses: {str(e)}")


@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a customer (soft delete)
    
    Note: This will mark the customer as inactive rather than deleting permanently.
    Related transactions and history will be preserved.
    """
    try:
        # Check if customer exists
        customer = db.execute(text("""
            SELECT customer_id, customer_name, is_active
            FROM parties.customers 
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {"customer_id": customer_id, "org_id": DEFAULT_ORG_ID}).fetchone()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        if not customer.is_active:
            return {"message": "Customer is already inactive"}
        
        # Check for outstanding balance
        outstanding = db.execute(text("""
            SELECT COALESCE(SUM(final_amount - COALESCE(paid_amount, 0)), 0) as balance
            FROM sales.invoices
            WHERE customer_id = :customer_id
            AND payment_status != 'paid'
        """), {"customer_id": customer_id}).scalar()
        
        if outstanding and outstanding > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete customer with outstanding balance of {outstanding}"
            )
        
        # Soft delete - mark as inactive
        db.execute(text("""
            UPDATE parties.customers
            SET is_active = false,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {"customer_id": customer_id, "org_id": DEFAULT_ORG_ID})
        
        db.commit()
        
        return {
            "message": f"Customer '{customer.customer_name}' has been deactivated",
            "customer_id": customer_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting customer {customer_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete customer: {str(e)}")


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