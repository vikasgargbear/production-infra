"""
Customer management endpoints for enterprise pharma system
Implements GST-compliant customer management with credit tracking

PRODUCTION-READY: All endpoints use TenantAwareSession for AI-agent safety
"""
from typing import Optional
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
import logging
import json

# Core utilities - shared across all APIs
from ....core.database import SessionLocal
from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession  
from ....core.org_context import get_org_context, OrgContext
from ....core.state_utils import get_state_code  # Shared Indian GST state codes
from ....core.api_utils import handle_error  # Shared error handler
from ....core.permissions import PermissionChecker  # RBAC

# Customer-specific imports
from ...schemas.customer import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse,
    CustomerLedgerResponse, CustomerOutstandingResponse,
    PaymentRecord, PaymentResponse
)
from ...services.customer_service import CustomerService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["master", "customers"])


# =============================================================================
# ENDPOINTS
# =============================================================================


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.post("/")
@with_tenant_context
async def create_customer(
    customer: CustomerCreate,
    _: dict = Depends(PermissionChecker("master", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a new customer with GST details and credit limit
    
    Required fields:
    - **customer_name**: Business name
    - **primary_phone**: 10-digit mobile number
    - **customer_type**: retail, wholesale, hospital, clinic, or pharmacy
    
    Optional fields:
    - **gst_number**: 15-character GST number (validated)
    - **credit_limit**: Maximum credit allowed (default: 0)
    - **credit_days**: Payment terms in days (default: 0)
    """
    try:
        # Generate customer code
        customer_code = CustomerService.generate_customer_code(db, customer.customer_name)
        
        # Create customer - check if area column exists
        customer_data = customer.dict()
        customer_data["customer_code"] = customer_code
        
        # Map schema fields to database columns - NO ALIASING, direct database names
        mapped_data = {
            "org_id": str(context.org_id),
            "customer_code": customer_code,
            "customer_name": customer_data.get("customer_name"),
            "customer_type": customer_data.get("customer_type"),
            "business_type": customer_data.get("business_type", "retail_pharmacy"),
            "primary_phone": customer_data.get("primary_phone"),
            "primary_email": customer_data.get("primary_email"),
            "secondary_phone": customer_data.get("secondary_phone"),
            "whatsapp_number": customer_data.get("whatsapp_number", customer_data.get("secondary_phone")),
            "contact_person_name": customer_data.get("contact_person_name"),
            "contact_person_phone": customer_data.get("contact_person_phone"),
            "contact_person_email": customer_data.get("contact_person_email"),
            "gst_number": customer_data.get("gst_number"),
            "pan_number": customer_data.get("pan_number"),
            "drug_license_number": customer_data.get("drug_license_number"),
            "drug_license_validity": customer_data.get("drug_license_validity"),
            "credit_limit": customer_data.get("credit_limit", 0),
            "credit_days": customer_data.get("credit_days", 0),
            "credit_rating": customer_data.get("credit_rating", "NEW"),
            "payment_terms": customer_data.get("payment_terms", "CASH"),
            "internal_notes": customer_data.get("internal_notes"),
            "is_active": customer_data.get("is_active", True)
        }
        
        # Create customer with correct column names
        result = db.execute(text("""
            INSERT INTO parties.customers (
                org_id, customer_code, customer_name, customer_type, business_type,
                primary_phone, primary_email, secondary_phone, whatsapp_number,
                contact_person_name, contact_person_phone, contact_person_email,
                gst_number, pan_number, drug_license_number, drug_license_validity,
                credit_limit, credit_days, credit_rating, payment_terms,
                internal_notes, is_active,
                created_at, updated_at
            ) VALUES (
                :org_id, :customer_code, :customer_name, :customer_type, :business_type,
                :primary_phone, :primary_email, :secondary_phone, :whatsapp_number,
                :contact_person_name, :contact_person_phone, :contact_person_email,
                :gst_number, :pan_number, :drug_license_number, :drug_license_validity,
                :credit_limit, :credit_days, :credit_rating, :payment_terms,
                :internal_notes, :is_active,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING customer_id
        """), mapped_data)
        
        customer_id = result.scalar()
        
        # Create address record if address data is provided
        if any([customer_data.get(f) for f in ['address_line1', 'city', 'state', 'pincode']]):
            state_name = customer_data.get('state', '')
            state_code = get_state_code(state_name)
            
            address_data = {
                "org_id": str(context.org_id),  # Use org_id from context
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
        
        # Return response with database field names - NO ALIASES
        return {
            "customer_id": customer_id,
            "customer_code": customer_code,
            "customer_name": customer_data.get("customer_name"),
            "customer_type": customer_data.get("customer_type"),
            "primary_phone": customer_data.get("primary_phone"),
            "primary_email": customer_data.get("primary_email"),
            "gst_number": customer_data.get("gst_number"),
            "credit_limit": customer_data.get("credit_limit", 0),
            "credit_days": customer_data.get("credit_days", 0),
            "is_active": True,
            "created_at": datetime.now().isoformat(),
            "message": "Customer created successfully"
        }
        
    except Exception as e:
        db.rollback()
        raise handle_error(e, "create customer")

@router.get("/", response_model=CustomerListResponse)
@with_tenant_context  # FIXED: Automatic tenant filtering
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
    _: dict = Depends(PermissionChecker("master", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),  # FIXED: Tenant context
    db: TenantAwareSession = Depends(get_tenant_aware_db)  # FIXED: Tenant-aware DB
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
        
        # Build query - optimized for fast search but with essential fields
        if fast_search:
            # Essential fields for fast search - balance between performance and usefulness
            query = """SELECT customer_id, customer_name, customer_code, primary_phone, primary_email,
                      customer_type, business_type, gst_number, credit_limit, credit_days,
                      is_active, org_id, created_at, updated_at 
                      FROM parties.customers"""
        else:
            # Full query for detailed view
            query = "SELECT * FROM parties.customers"
        count_query = "SELECT COUNT(*) FROM parties.customers"
        params = {}  # FIXED: No manual org_id needed - handled by tenant service
        
        # Add filters - build WHERE conditions
        where_conditions = []  # FIXED: No manual org_id filtering - automatic via tenant service
        
        if search:
            search_condition = """(
                customer_name ILIKE :search OR 
                customer_code ILIKE :search OR 
                primary_phone LIKE :search OR
                gst_number LIKE :search
            )"""
            where_conditions.append(search_condition)
            params["search"] = f"%{search}%"
        
        if customer_type:
            where_conditions.append("customer_type = :customer_type")
            params["customer_type"] = customer_type
        
        if is_active is not None:
            where_conditions.append("is_active = :is_active")
            params["is_active"] = is_active
        
        if has_gstin is not None:
            if has_gstin:
                where_conditions.append("gst_number IS NOT NULL")
            else:
                where_conditions.append("gst_number IS NULL")
        
        # Add WHERE clause if we have conditions
        if where_conditions:
            where_clause = " WHERE " + " AND ".join(where_conditions)
            query += where_clause
            count_query += where_clause
        
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
            
            # ✅ CLEAN CODE: Use database field names directly - NO ALIASES
            
            # Add statistics from batch lookup or default values
            if include_stats:
                customer_stats = stats_by_customer.get(row.customer_id, {})
                customer_dict.update({
                    "total_transactions": customer_stats.get("total_orders", 0),
                    "total_business_amount": customer_stats.get("total_business", 0),
                    "last_transaction_date": customer_stats.get("last_order_date"),
                    "current_outstanding": customer_stats.get("outstanding_amount", 0),
                })
            else:
                customer_dict.update({
                    "total_transactions": 0,
                    "total_business_amount": 0,
                    "last_transaction_date": None,
                    "current_outstanding": 0,
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
        raise handle_error(e, "list customers")
    # FIXED: No manual session closing needed - handled by tenant service dependency

@router.get("/{customer_id}", response_model=CustomerResponse)
@with_tenant_context
async def get_customer(
    customer_id: int,
    _: dict = Depends(PermissionChecker("master", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get customer details with addresses, outstanding balance and statistics"""
    try:
        # Get customer with addresses
        result = db.execute(text("""
            SELECT c.*,
                   COALESCE(
                       json_agg(
                           json_build_object(
                               'address_id', a.address_id,
                               'address_type', a.address_type,
                               'address_line1', a.address_line1,
                               'address_line2', a.address_line2,
                               'landmark', a.landmark,
                               'city', a.city,
                               'state_code', a.state_code,
                               'state_name', a.state_name,
                               'country', a.country,
                               'pincode', a.pincode,
                               'contact_person', a.contact_person,
                               'contact_number', a.contact_number,
                               'is_default', a.is_default,
                               'is_active', a.is_active
                           ) ORDER BY a.is_default DESC, a.address_type
                       ) FILTER (WHERE a.address_id IS NOT NULL),
                       '[]'::json
                   ) as addresses
            FROM parties.customers c
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'customer' 
                AND a.entity_id = c.customer_id 
                AND a.org_id = c.org_id
                AND a.is_active = true
            )
            WHERE c.customer_id = :id
            GROUP BY c.customer_id
        """), {"id": customer_id})
        
        customer = result.fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Get statistics
        stats = CustomerService.get_customer_statistics(db, customer_id)
        
        customer_dict = dict(customer._mapping)
        
        # ✅ ENTERPRISE STANDARD: Use database field names directly (no aliasing!)
        # All fields from SELECT c.* are already in customer_dict
        
        # Parse addresses JSON (json module imported at top of file)
        addresses = customer_dict.get("addresses", "[]")
        if isinstance(addresses, str):
            customer_dict["addresses"] = json.loads(addresses)
        elif addresses is None:
            customer_dict["addresses"] = []
        
        # ✅ CLEAN CODE: Use database field names directly - NO ALIASES
        # Add computed statistics from service
        customer_dict.update(stats)
        
        return CustomerResponse(**customer_dict)
        
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "get customer", customer_id)

@router.put("/{customer_id}", response_model=CustomerResponse)
@with_tenant_context
async def update_customer(
    customer_id: int,
    customer_update: CustomerUpdate,
    _: dict = Depends(PermissionChecker("master", "edit")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Update customer details"""
    try:
        # Check if customer exists
        exists = db.execute(text("""
            SELECT 1 FROM parties.customers WHERE customer_id = :id
        """), {"id": customer_id}).scalar()
        
        if not exists:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Build update query - use database field names directly (NO ALIASING)
        update_fields = []
        params = {"id": customer_id}
        
        for field, value in customer_update.dict(exclude_unset=True).items():
            if value is not None:
                update_fields.append(f"{field} = :{field}")
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
        return await get_customer(customer_id, context, db)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "update customer", customer_id)

@router.get("/{customer_id}/ledger", response_model=CustomerLedgerResponse)
@with_tenant_context
async def get_customer_ledger(
    customer_id: int,
    from_date: Optional[date] = Query(None, description="Start date for ledger"),
    to_date: Optional[date] = Query(None, description="End date for ledger"),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get customer transaction history (ledger)"""
    try:
        return CustomerService.get_customer_ledger(db, customer_id, from_date, to_date)
    except ValueError as e:
        raise HTTPException(status_code=404, detail="Customer not found")
    except Exception as e:
        raise handle_error(e, "get customer ledger", customer_id)

@router.get("/{customer_id}/outstanding", response_model=CustomerOutstandingResponse)
@with_tenant_context
async def get_customer_outstanding(
    customer_id: int,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get outstanding invoices for a customer"""
    try:
        return CustomerService.get_outstanding_invoices(db, customer_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail="Customer not found")
    except Exception as e:
        raise handle_error(e, "get customer outstanding", customer_id)

@router.get("/{customer_id}/addresses")
@with_tenant_context
async def get_customer_addresses(
    customer_id: int,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
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
        raise handle_error(e, "get customer addresses", customer_id)

@router.delete("/{customer_id}")
@with_tenant_context
async def delete_customer(
    customer_id: int,
    _: dict = Depends(PermissionChecker("master", "delete")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Soft delete a customer (marks as inactive)
    
    - Only deactivates if no outstanding balance
    - Preserves related transactions and history
    """
    try:
        # OPTIMIZED: Combined query using CTE (was 3 separate queries)
        # Checks customer exists, is active, and has no outstanding balance in one round trip
        result = db.execute(text("""
            WITH customer_check AS (
                SELECT 
                    c.customer_id, 
                    c.customer_name, 
                    c.is_active,
                    COALESCE(
                        (SELECT SUM(final_amount - COALESCE(paid_amount, 0))
                         FROM sales.invoices i
                         WHERE i.customer_id = c.customer_id 
                         AND i.payment_status != 'paid'),
                        0
                    ) as outstanding_balance
                FROM parties.customers c
                WHERE c.customer_id = :customer_id
            )
            SELECT customer_id, customer_name, is_active, outstanding_balance 
            FROM customer_check
        """), {"customer_id": customer_id}).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        if not result.is_active:
            return {"message": "Customer is already inactive"}
        
        if result.outstanding_balance and result.outstanding_balance > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete customer with outstanding balance of {result.outstanding_balance}"
            )
        
        # Soft delete - mark as inactive
        db.execute(text("""
            UPDATE parties.customers
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id
        """), {"customer_id": customer_id})
        
        db.commit()
        
        return {
            "message": f"Customer '{result.customer_name}' has been deactivated",
            "customer_id": customer_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "delete customer", customer_id)

@router.post("/{customer_id}/payment", response_model=PaymentResponse)
@with_tenant_context
async def record_customer_payment(
    customer_id: int,
    payment: PaymentRecord,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
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
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "record payment", customer_id)

@router.post("/{customer_id}/check-credit")
@with_tenant_context
async def check_credit_limit(
    customer_id: int,
    order_amount: float,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Check if customer has sufficient credit for a new order"""
    try:
        result = CustomerService.validate_credit_limit(db, customer_id, order_amount)
        return result
    except Exception as e:
        raise handle_error(e, "check credit limit", customer_id)