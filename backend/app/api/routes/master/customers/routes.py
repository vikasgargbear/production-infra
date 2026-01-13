"""
Customer management endpoints for enterprise pharma system
Implements GST-compliant customer management with credit tracking

PRODUCTION-READY: All endpoints use TenantAwareSession for AI-agent safety
"""
from typing import Optional
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy import text
import logging
import json

# Core utilities - shared across all APIs
from .....core.database import SessionLocal
from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession  
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.utils.state_utils import get_state_code  # Shared Indian GST state codes
from .....core.utils.api_utils import handle_error  # Shared error handler
from .....core.security.permissions import PermissionChecker  # RBAC

# Customer-specific imports
from ....schemas.master.customer import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse,
    CustomerLedgerResponse, CustomerOutstandingResponse,
    PaymentRecord, PaymentResponse
)
from ....services.master.customer.service import CustomerService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["master", "customers"])


# =============================================================================
# ENDPOINTS
# =============================================================================


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.get("/all-with-addresses")
@with_tenant_context
async def get_all_customers_with_addresses(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=500, description="Customers per page"),
    since: Optional[str] = Query(None, description="ISO timestamp for delta sync"),
    include_inactive: bool = Query(False, description="Include inactive customers"),
    _: dict = Depends(PermissionChecker("master", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get all customers with their addresses embedded (for offline sync).
    Similar to /products/all-with-batches pattern.
    
    Returns customers with:
    - Basic customer info (name, phone, GST, credit)
    - Contact person details
    - Embedded addresses array (billing/shipping)
    
    Usage:
    - Initial sync: GET /customers/all-with-addresses?page=1&page_size=100
    - Delta sync: GET /customers/all-with-addresses?since=2026-01-01T00:00:00Z
    """
    try:
        offset = (page - 1) * page_size
        
        # Step 1: Count total customers using service
        total_count = CustomerService.count_customers(
            db=db,
            org_id=str(context.org_id),
            include_inactive=include_inactive,
            since=since
        )
        
        # Step 2: Fetch customers page using service
        customers = CustomerService.get_customers_page(
            db=db,
            org_id=str(context.org_id),
            limit=page_size,
            offset=offset,
            include_inactive=include_inactive,
            since=since
        )
        
        if not customers:
            return {
                "customers": [],
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total_customers": total_count,
                    "total_pages": 0,
                    "has_more": False
                },
                "sync_metadata": {
                    "synced_at": datetime.utcnow().isoformat() + "Z",
                    "customers_in_page": 0,
                    "addresses_in_page": 0
                }
            }
        
        # Step 3: Get addresses for all customers using service
        customer_ids = [c["customer_id"] for c in customers]
        addresses = CustomerService.get_addresses_for_customers(
            db=db,
            org_id=str(context.org_id),
            customer_ids=customer_ids
        )
        
        # Group addresses by customer_id
        addresses_by_customer = {}
        total_addresses = 0
        for addr in addresses:
            cid = addr.pop("customer_id")
            if cid not in addresses_by_customer:
                addresses_by_customer[cid] = []
            addresses_by_customer[cid].append(addr)
            total_addresses += 1
        
        # Embed addresses into customers
        for customer in customers:
            cid = customer["customer_id"]
            customer["addresses"] = addresses_by_customer.get(cid, [])
            
            # Convert decimal fields
            customer["credit_limit"] = float(customer["credit_limit"] or 0)
            customer["current_outstanding"] = float(customer["current_outstanding"] or 0)
            customer["created_at"] = str(customer["created_at"]) if customer["created_at"] else None
            customer["updated_at"] = str(customer["updated_at"]) if customer["updated_at"] else None
            customer["drug_license_validity"] = str(customer["drug_license_validity"]) if customer["drug_license_validity"] else None
        
        total_pages = (total_count + page_size - 1) // page_size
        
        return {
            "customers": customers,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_customers": total_count,
                "total_pages": total_pages,
                "has_more": page < total_pages
            },
            "sync_metadata": {
                "synced_at": datetime.utcnow().isoformat() + "Z",
                "customers_in_page": len(customers),
                "addresses_in_page": total_addresses
            }
        }
        
    except Exception as e:
        logger.error(f"Error in get_all_customers_with_addresses: {e}")
        raise handle_error(e, "get all customers with addresses")


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
        customer_data = customer.dict()
        
        # Validate customer data using service (GSTIN, PAN, phone validation)
        validation = CustomerService.validate_customer_data(customer_data)
        if not validation["valid"]:
            raise HTTPException(
                status_code=400, 
                detail=f"Validation failed: {', '.join(validation['errors'])}"
            )
        
        # Use validated and enriched data
        validated_data = validation["data"]
        
        # Check for duplicate customers (GSTIN and phone)
        duplicate_check = CustomerService.check_duplicate_customer(
            db, context.org_id,
            gst_number=validated_data.get("gst_number"),
            primary_phone=validated_data.get("primary_phone")
        )
        if duplicate_check["has_duplicates"]:
            raise HTTPException(
                status_code=409,  # Conflict
                detail=duplicate_check["duplicates"][0]["message"]
            )
        
        # Generate customer code
        customer_code = CustomerService.generate_customer_code(db, customer.customer_name)
        
        # Map schema fields to database columns - NO ALIASING, direct database names
        mapped_data = {
            "org_id": str(context.org_id),
            "customer_code": customer_code,
            "customer_name": validated_data.get("customer_name"),
            "customer_type": validated_data.get("customer_type"),
            "business_type": validated_data.get("business_type", "retail_pharmacy"),
            "primary_phone": validated_data.get("primary_phone"),
            "primary_email": validated_data.get("primary_email"),
            "secondary_phone": validated_data.get("secondary_phone"),
            "whatsapp_number": validated_data.get("whatsapp_number", validated_data.get("secondary_phone")),
            "contact_person_name": validated_data.get("contact_person_name"),
            "contact_person_phone": validated_data.get("contact_person_phone"),
            "contact_person_email": validated_data.get("contact_person_email"),
            "gst_number": validated_data.get("gst_number"),
            "pan_number": validated_data.get("pan_number"),
            "drug_license_number": validated_data.get("drug_license_number"),
            "drug_license_validity": validated_data.get("drug_license_validity"),
            "credit_limit": validated_data.get("credit_limit", 0),
            "credit_days": validated_data.get("credit_days", 0),
            "credit_rating": validated_data.get("credit_rating", "NEW"),
            "payment_terms": validated_data.get("payment_terms", "CASH"),
            "internal_notes": validated_data.get("internal_notes"),
            "is_active": validated_data.get("is_active", True)
        }
        
        # Create customer using service method
        customer_id = CustomerService.insert_customer(
            db=db,
            org_id=str(context.org_id),
            customer_data=mapped_data
        )
        
        # Create address record if address data is provided
        if any([customer_data.get(f) for f in ['address_line1', 'city', 'state', 'pincode']]):
            state_name = customer_data.get('state', '')
            state_code = get_state_code(state_name)
            
            address_data = {
                "address_type": "billing",
                "address_line1": customer_data.get("address_line1", ""),
                "address_line2": customer_data.get("address_line2", ""),
                "city": customer_data.get("city", ""),
                "state_code": state_code,
                "state_name": state_name or "Maharashtra",
                "pincode": customer_data.get("pincode", ""),
                "country": "India",
                "is_default": True
            }
            
            # Insert billing address using service
            CustomerService.insert_address(
                db=db,
                org_id=str(context.org_id),
                customer_id=customer_id,
                address_data=address_data
            )
            
            # Also create shipping address (same as billing for now)
            address_data["address_type"] = "shipping"
            CustomerService.insert_address(
                db=db,
                org_id=str(context.org_id),
                customer_id=customer_id,
                address_data=address_data
            )
        
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
        
        # Use service method for core customer query and count
        customer_rows, total = CustomerService.list_customers(
            db=db,
            skip=skip,
            limit=limit,
            search=search,
            customer_type=customer_type,
            is_active=is_active,
            has_gstin=has_gstin,
            fast_search=fast_search
        )
        
        logger.info(f"Total customers found: {total}")
        
        customers = []
        
        # Get statistics in batch if requested (with error handling for production)
        stats_by_customer = {}
        if include_stats:
            try:
                customer_ids = [row["customer_id"] for row in customer_rows]
                stats_by_customer = CustomerService.get_customers_statistics_batch(db, customer_ids)
                logger.info(f"Successfully loaded stats for {len(stats_by_customer)} customers")
            except Exception as stats_error:
                logger.warning(f"Failed to load customer statistics: {stats_error}")
                # Continue without stats rather than failing the entire request
                stats_by_customer = {}
        
        # Build customer responses
        for row in customer_rows:
            customer_dict = dict(row)  # Already a dict from service
            
            # ✅ CLEAN CODE: Use database field names directly - NO ALIASES
            
            # Add statistics from batch lookup or default values
            if include_stats:
                customer_stats = stats_by_customer.get(row["customer_id"], {})
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

@router.get("/{customer_id}")
@with_tenant_context
async def get_customer(
    customer_id: int,
    _: dict = Depends(PermissionChecker("master", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get customer details with addresses, outstanding balance and statistics"""
    try:
        # Get customer with addresses using service
        customer_dict = CustomerService.get_customer_with_addresses(
            db=db,
            customer_id=customer_id
        )
        
        if not customer_dict:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Get statistics and merge
        stats = CustomerService.get_customer_statistics(db, customer_id)
        
        # Parse addresses JSON if needed
        addresses = customer_dict.get("addresses", [])
        if isinstance(addresses, str):
            customer_dict["addresses"] = json.loads(addresses)
        elif addresses is None:
            customer_dict["addresses"] = []
        
        # Add computed statistics from service
        customer_dict.update(stats)
        
        # Convert org_id to string for JSON serialization
        if "org_id" in customer_dict and customer_dict["org_id"]:
            customer_dict["org_id"] = str(customer_dict["org_id"])
        
        # Return the dict directly (avoids Pydantic validation issues)
        return customer_dict
        
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
        # Check if customer exists using service
        if not CustomerService.customer_exists(db, customer_id):
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Get update data
        update_data = customer_update.dict(exclude_unset=True)
        
        # Validate update data using CustomerService
        if update_data:
            validation = CustomerService.validate_customer_data(update_data)
            if not validation["valid"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Validation failed: {', '.join(validation['errors'])}"
                )
            
            # Use validated data
            validated_data = validation["data"]
            
            # Check for duplicates (excluding current customer)
            if validated_data.get("gst_number") or validated_data.get("primary_phone"):
                duplicate_check = CustomerService.check_duplicate_customer(
                    db, context.org_id,
                    gst_number=validated_data.get("gst_number"),
                    primary_phone=validated_data.get("primary_phone"),
                    exclude_id=customer_id
                )
                if duplicate_check["has_duplicates"]:
                    raise HTTPException(
                        status_code=409,
                        detail=duplicate_check["duplicates"][0]["message"]
                    )
        
            # Build update query - use database field names directly (NO ALIASING)
            update_fields = []
            params = {"id": customer_id}
            
            for field, value in validated_data.items():
                if value is not None:
                    update_fields.append(f"{field} = :{field}")
                    params[field] = value
            
            if update_fields:
                # Use service method for dynamic update
                CustomerService.update_customer_dynamic(
                    db=db,
                    customer_id=customer_id,
                    update_fields=update_fields,
                    params=params
                )
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
        # First check if customer exists using service
        exists = CustomerService.customer_exists(db, customer_id)
        
        if not exists:
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Get all addresses for this customer using service
        addresses = CustomerService.get_customer_addresses(
            db=db,
            customer_id=customer_id
        )
        
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


@router.post("/{customer_id}/addresses/")
@with_tenant_context
async def create_customer_address(
    customer_id: int,
    address_data: dict,
    _: dict = Depends(PermissionChecker("master", "create")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a new address for a customer.
    
    Required fields:
    - address_line1: Street address
    - city: City name
    - state: State name (auto-converts to state code)
    - pincode: PIN code
    
    Optional fields:
    - address_line2: Additional address line
    - landmark: Nearby landmark
    - address_type: 'billing' or 'shipping' (default: 'shipping')
    - is_default: Set as default address
    - mobile: Contact phone for this address
    """
    try:
        # Check if customer exists
        if not CustomerService.customer_exists(db, customer_id):
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Validate required fields
        required_fields = ['address_line1', 'city', 'pincode']
        missing = [f for f in required_fields if not address_data.get(f)]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required fields: {', '.join(missing)}"
            )
        
        # Validate pincode format (6 digits for India)
        pincode = str(address_data.get('pincode', '')).strip()
        if not pincode.isdigit() or len(pincode) != 6:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid pincode '{pincode}'. Indian pincodes must be exactly 6 digits."
            )
        
        # Get state code from state name
        state_name = address_data.get('state', '')
        state_code = get_state_code(state_name)
        
        # Prepare address data for insertion
        insert_data = {
            "address_type": address_data.get("address_type", "shipping"),
            "address_line1": address_data.get("address_line1", ""),
            "address_line2": address_data.get("address_line2", ""),
            "landmark": address_data.get("landmark", ""),
            "city": address_data.get("city", ""),
            "state_code": state_code,
            "state_name": state_name or "Maharashtra",
            "pincode": pincode,
            "country": address_data.get("country", "India") or "India",
            "is_default": address_data.get("is_default", False),
            "mobile": address_data.get("mobile", "")
        }
        
        # Insert address using service
        address_id = CustomerService.insert_address(
            db=db,
            org_id=str(context.org_id),
            customer_id=customer_id,
            address_data=insert_data
        )
        
        db.commit()
        
        return {
            "success": True,
            "address_id": address_id,
            "customer_id": customer_id,
            "message": "Address created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "create customer address", customer_id)


@router.put("/{customer_id}/addresses/{address_id}")
@with_tenant_context
async def update_customer_address(
    customer_id: int,
    address_id: int,
    address_data: dict = Body(...),
    _: dict = Depends(PermissionChecker("master", "edit")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Update an existing customer address
    
    - address_line1: Street address
    - address_line2: Additional address
    - city: City name
    - state: State name
    - pincode: 6-digit Indian pincode
    - mobile: Contact phone
    - is_default: Set as default address
    """
    try:
        # Check if customer exists
        if not CustomerService.customer_exists(db, customer_id):
            raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
        
        # Validate pincode if provided
        pincode = str(address_data.get('pincode', '')).strip()
        if pincode and (not pincode.isdigit() or len(pincode) != 6):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid pincode '{pincode}'. Indian pincodes must be exactly 6 digits."
            )
        
        # Get state code from state name
        state_name = address_data.get('state', '')
        state_code = get_state_code(state_name)
        
        # Build update query
        update_fields = []
        params = {"address_id": address_id, "customer_id": customer_id}
        
        if address_data.get('address_line1'):
            update_fields.append("address_line1 = :address_line1")
            params["address_line1"] = address_data['address_line1']
        
        if 'address_line2' in address_data:
            update_fields.append("address_line2 = :address_line2")
            params["address_line2"] = address_data.get('address_line2', '')
            
        if 'landmark' in address_data:
            update_fields.append("landmark = :landmark")
            params["landmark"] = address_data.get('landmark', '')
        
        if address_data.get('city'):
            update_fields.append("city = :city")
            params["city"] = address_data['city']
        
        if state_name:
            update_fields.append("state_code = :state_code")
            update_fields.append("state_name = :state_name")
            params["state_code"] = state_code
            params["state_name"] = state_name
        
        if pincode:
            update_fields.append("pincode = :pincode")
            params["pincode"] = pincode
        
        if 'mobile' in address_data:
            update_fields.append("contact_number = :mobile")
            params["mobile"] = address_data.get('mobile', '')
        
        if 'is_default' in address_data:
            update_fields.append("is_default = :is_default")
            params["is_default"] = address_data.get('is_default', False)
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        # Execute update
        db.execute(text(f"""
            UPDATE master.addresses 
            SET {', '.join(update_fields)}
            WHERE address_id = :address_id 
            AND entity_type = 'customer'
            AND entity_id = :customer_id
        """), params)
        
        db.commit()
        
        return {
            "success": True,
            "address_id": address_id,
            "customer_id": customer_id,
            "message": "Address updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "update customer address", address_id)

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
        # Check customer status using service
        result = CustomerService.get_deletion_status(db, customer_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        if not result["is_active"]:
            return {"message": "Customer is already inactive"}
        
        if result["outstanding_balance"] and result["outstanding_balance"] > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete customer with outstanding balance of {result['outstanding_balance']}"
            )
        
        # Soft delete using service
        CustomerService.soft_delete(db, customer_id)
        
        db.commit()
        
        return {
            "message": f"Customer '{result['customer_name']}' has been deactivated",
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