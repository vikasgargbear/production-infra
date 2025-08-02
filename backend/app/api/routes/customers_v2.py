"""
Customer API - Revamped for new schema
Works with parties.customers table and proper column names
"""
from typing import Optional, List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.database import get_db
from ...core.config import settings
from ...schemas.customer import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse,
    CustomerAddressCreate, CustomerAddressResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customers", tags=["master", "customers"])

# Default org_id from settings
DEFAULT_ORG_ID = settings.DEFAULT_ORG_ID


@router.post("/", response_model=CustomerResponse)
async def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new customer with complete details
    
    - Uses parties.customers table
    - Addresses stored separately in parties.customer_addresses
    - Validates GST number format
    - Generates unique customer code
    """
    try:
        # Generate customer code
        result = db.execute(text("""
            SELECT 'CUST' || LPAD(COALESCE(MAX(SUBSTRING(customer_code FROM '[0-9]+$')::INTEGER), 0) + 1::TEXT, 5, '0')
            FROM parties.customers
            WHERE customer_code LIKE 'CUST%'
        """))
        customer_code = result.scalar()
        
        # Validate GST if provided
        if customer.gst_number:
            # Basic GST validation
            if len(customer.gst_number) != 15:
                raise HTTPException(status_code=400, detail="Invalid GST number format")
        
        # Insert customer
        query = text("""
            INSERT INTO parties.customers (
                org_id, customer_code, customer_name, customer_type,
                primary_phone, primary_email, secondary_phone, whatsapp_number,
                contact_person_name, contact_person_phone, contact_person_email,
                gst_number, pan_number, drug_license_number, drug_license_validity,
                fssai_number, establishment_year, business_type,
                credit_limit, credit_days, credit_rating, payment_terms,
                security_deposit, overdue_interest_rate,
                customer_category, customer_grade,
                territory_id, route_id, area_code,
                assigned_salesperson_id, price_list_id, discount_group_id,
                preferred_payment_mode, preferred_delivery_time,
                prefer_sms, prefer_email, prefer_whatsapp,
                internal_notes, is_active
            ) VALUES (
                :org_id, :customer_code, :customer_name, :customer_type,
                :primary_phone, :primary_email, :secondary_phone, :whatsapp_number,
                :contact_person_name, :contact_person_phone, :contact_person_email,
                :gst_number, :pan_number, :drug_license_number, :drug_license_validity,
                :fssai_number, :establishment_year, :business_type,
                :credit_limit, :credit_days, :credit_rating, :payment_terms,
                :security_deposit, :overdue_interest_rate,
                :customer_category, :customer_grade,
                :territory_id, :route_id, :area_code,
                :assigned_salesperson_id, :price_list_id, :discount_group_id,
                :preferred_payment_mode, :preferred_delivery_time,
                :prefer_sms, :prefer_email, :prefer_whatsapp,
                :internal_notes, :is_active
            ) RETURNING customer_id
        """)
        
        # Prepare data with defaults
        customer_data = {
            "org_id": DEFAULT_ORG_ID,
            "customer_code": customer_code,
            "customer_name": customer.customer_name,
            "customer_type": customer.customer_type or "retail",
            "primary_phone": customer.primary_phone,
            "primary_email": customer.primary_email,
            "secondary_phone": customer.secondary_phone,
            "whatsapp_number": customer.whatsapp_number or customer.primary_phone,
            "contact_person_name": customer.contact_person_name,
            "contact_person_phone": customer.contact_person_phone,
            "contact_person_email": customer.contact_person_email,
            "gst_number": customer.gst_number,
            "pan_number": customer.pan_number,
            "drug_license_number": customer.drug_license_number,
            "drug_license_validity": customer.drug_license_validity,
            "fssai_number": customer.fssai_number,
            "establishment_year": customer.establishment_year,
            "business_type": customer.business_type or "retail_pharmacy",
            "credit_limit": customer.credit_limit or 0,
            "credit_days": customer.credit_days or 0,
            "credit_rating": customer.credit_rating or "C",
            "payment_terms": customer.payment_terms or "Cash",
            "security_deposit": customer.security_deposit or 0,
            "overdue_interest_rate": customer.overdue_interest_rate or 0,
            "customer_category": customer.customer_category or "regular",
            "customer_grade": customer.customer_grade or "C",
            "territory_id": customer.territory_id,
            "route_id": customer.route_id,
            "area_code": customer.area_code,
            "assigned_salesperson_id": customer.assigned_salesperson_id,
            "price_list_id": customer.price_list_id,
            "discount_group_id": customer.discount_group_id,
            "preferred_payment_mode": customer.preferred_payment_mode,
            "preferred_delivery_time": customer.preferred_delivery_time,
            "prefer_sms": customer.prefer_sms if customer.prefer_sms is not None else True,
            "prefer_email": customer.prefer_email if customer.prefer_email is not None else False,
            "prefer_whatsapp": customer.prefer_whatsapp if customer.prefer_whatsapp is not None else True,
            "internal_notes": customer.internal_notes,
            "is_active": True
        }
        
        result = db.execute(query, customer_data)
        customer_id = result.scalar()
        
        # Create primary address if provided
        if customer.address:
            addr = customer.address
            address_query = text("""
                INSERT INTO parties.customer_addresses (
                    customer_id, address_type, 
                    address_line1, address_line2, area_name,
                    city, state, pincode, country,
                    landmark, contact_person, contact_phone,
                    is_primary, is_billing, is_shipping, is_active
                ) VALUES (
                    :customer_id, :address_type,
                    :address_line1, :address_line2, :area_name,
                    :city, :state, :pincode, :country,
                    :landmark, :contact_person, :contact_phone,
                    :is_primary, :is_billing, :is_shipping, :is_active
                )
            """)
            
            address_data = {
                "customer_id": customer_id,
                "address_type": addr.address_type or "billing",
                "address_line1": addr.address_line1,
                "address_line2": addr.address_line2,
                "area_name": addr.area_name,
                "city": addr.city,
                "state": addr.state,
                "pincode": addr.pincode,
                "country": addr.country or "India",
                "landmark": addr.landmark,
                "contact_person": addr.contact_person,
                "contact_phone": addr.contact_phone,
                "is_primary": True,
                "is_billing": True,
                "is_shipping": addr.address_type == "both" or addr.address_type == "shipping",
                "is_active": True
            }
            
            db.execute(address_query, address_data)
        
        db.commit()
        
        # Fetch and return created customer
        return await get_customer(customer_id, db)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating customer: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create customer: {str(e)}")


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """Get customer details with addresses and metrics"""
    try:
        query = text("""
            SELECT 
                c.*,
                -- Aggregate addresses
                COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'address_id', a.address_id,
                            'address_type', a.address_type,
                            'address_line1', a.address_line1,
                            'address_line2', a.address_line2,
                            'area_name', a.area_name,
                            'city', a.city,
                            'state', a.state,
                            'pincode', a.pincode,
                            'country', a.country,
                            'landmark', a.landmark,
                            'contact_person', a.contact_person,
                            'contact_phone', a.contact_phone,
                            'is_primary', a.is_primary,
                            'is_billing', a.is_billing,
                            'is_shipping', a.is_shipping,
                            'is_active', a.is_active
                        ) ORDER BY a.is_primary DESC, a.address_id
                    ) FILTER (WHERE a.address_id IS NOT NULL),
                    '[]'::jsonb
                ) as addresses
            FROM parties.customers c
            LEFT JOIN parties.customer_addresses a ON c.customer_id = a.customer_id AND a.is_active = true
            WHERE c.customer_id = :customer_id
            AND c.org_id = :org_id
            GROUP BY c.customer_id
        """)
        
        result = db.execute(query, {"customer_id": customer_id, "org_id": DEFAULT_ORG_ID})
        customer = result.fetchone()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Convert to dict and add addresses
        customer_dict = dict(customer._mapping)
        
        return CustomerResponse(**customer_dict)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting customer: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get customer: {str(e)}")


@router.get("/", response_model=CustomerListResponse)
async def list_customers(
    search: Optional[str] = Query(None, description="Search in name, code, primary_phone as primary_phone as phone, GST"),
    customer_type: Optional[str] = Query(None, description="Filter by customer type"),
    customer_category: Optional[str] = Query(None, description="Filter by category"),
    city: Optional[str] = Query(None, description="Filter by city"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    has_gst: Optional[bool] = Query(None, description="Filter by GST registration"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500)
):
    """
    List customers with filtering and pagination
    
    - Searches across multiple fields
    - Includes basic metrics and primary address
    - Supports various filters
    """
    try:
        db = next(get_db())
        
        # Build query
        base_query = """
            SELECT 
                c.customer_id,
                c.customer_code,
                c.customer_name,
                c.customer_type,
                c.primary_phone,
                c.primary_email,
                c.contact_person_name_name,
                c.gst_number,
                c.customer_category,
                c.credit_limit,
                c.credit_days,
                c.current_outstanding,
                c.total_business_amount,
                c.last_transaction_date,
                c.is_active,
                -- Primary address
                a.address_line1,
                a.address_line2,
                a.area_name,
                a.city,
                a.state,
                a.pincode
            FROM parties.customers c
            LEFT JOIN parties.customer_addresses a ON c.customer_id = a.customer_id 
                AND a.is_primary = true AND a.is_active = true
            WHERE c.org_id = :org_id
        """
        
        count_query = """
            SELECT COUNT(DISTINCT c.customer_id)
            FROM parties.customers c
            LEFT JOIN parties.customer_addresses a ON c.customer_id = a.customer_id 
                AND a.is_primary = true AND a.is_active = true
            WHERE c.org_id = :org_id
        """
        
        params = {"org_id": DEFAULT_ORG_ID}
        
        # Add filters
        if search:
            search_filter = """ AND (
                c.customer_name ILIKE :search OR
                c.customer_code ILIKE :search OR
                c.primary_phone ILIKE :search OR
                c.gst_number ILIKE :search OR
                a.area_name ILIKE :search OR
                a.city ILIKE :search
            )"""
            base_query += search_filter
            count_query += search_filter
            params["search"] = f"%{search}%"
        
        if customer_type:
            filter_clause = " AND c.customer_type = :customer_type"
            base_query += filter_clause
            count_query += filter_clause
            params["customer_type"] = customer_type
        
        if customer_category:
            filter_clause = " AND c.customer_category = :customer_category"
            base_query += filter_clause
            count_query += filter_clause
            params["customer_category"] = customer_category
        
        if city:
            filter_clause = " AND a.city ILIKE :city"
            base_query += filter_clause
            count_query += filter_clause
            params["city"] = f"%{city}%"
        
        if is_active is not None:
            filter_clause = " AND c.is_active = :is_active"
            base_query += filter_clause
            count_query += filter_clause
            params["is_active"] = is_active
        
        if has_gst is not None:
            if has_gst:
                filter_clause = " AND c.gst_number IS NOT NULL"
            else:
                filter_clause = " AND c.gst_number IS NULL"
            base_query += filter_clause
            count_query += filter_clause
        
        # Get total count
        total = db.execute(text(count_query), params).scalar()
        
        # Add ordering and pagination
        base_query += " ORDER BY c.customer_name LIMIT :limit OFFSET :skip"
        params["limit"] = limit
        params["skip"] = skip
        
        # Execute query
        result = db.execute(text(base_query), params)
        customers = []
        
        for row in result:
            customer_dict = dict(row._mapping)
            customers.append(CustomerResponse(**customer_dict))
        
        return CustomerListResponse(
            total=total,
            page=skip // limit + 1,
            per_page=limit,
            customers=customers
        )
        
    except Exception as e:
        logger.error(f"Error listing customers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list customers: {str(e)}")


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
            SELECT 1 FROM parties.customers 
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {"customer_id": customer_id, "org_id": DEFAULT_ORG_ID}).scalar()
        
        if not exists:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Build update query dynamically
        update_fields = []
        params = {"customer_id": customer_id, "org_id": DEFAULT_ORG_ID}
        
        # Map frontend field names to database columns
        field_mapping = {
            "customer_name": "customer_name",
            "customer_type": "customer_type",
            "primary_phone": "primary_phone",
            "primary_email": "primary_email",
            "secondary_phone": "secondary_phone",
            "whatsapp_number": "whatsapp_number",
            "contact_person_name": "contact_person_name",
            "contact_person_phone": "contact_person_phone",
            "contact_person_email": "contact_person_email",
            "gst_number": "gst_number",
            "pan_number": "pan_number",
            "drug_license_number": "drug_license_number",
            "drug_license_validity": "drug_license_validity",
            "credit_limit": "credit_limit",
            "credit_days": "credit_days",
            "credit_rating": "credit_rating",
            "payment_terms": "payment_terms",
            "customer_category": "customer_category",
            "customer_grade": "customer_grade",
            "internal_notes": "internal_notes",
            "is_active": "is_active"
        }
        
        for field, column in field_mapping.items():
            value = getattr(customer_update, field, None)
            if value is not None:
                update_fields.append(f"{column} = :{field}")
                params[field] = value
        
        if update_fields:
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            query = f"""
                UPDATE parties.customers 
                SET {', '.join(update_fields)}
                WHERE customer_id = :customer_id AND org_id = :org_id
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


@router.post("/{customer_id}/addresses", response_model=CustomerAddressResponse)
async def add_customer_address(
    customer_id: int,
    address: CustomerAddressCreate,
    db: Session = Depends(get_db)
):
    """Add a new address for customer"""
    try:
        # Verify customer exists
        exists = db.execute(text("""
            SELECT 1 FROM parties.customers 
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {"customer_id": customer_id, "org_id": DEFAULT_ORG_ID}).scalar()
        
        if not exists:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # If this is set as primary, unset other primary addresses
        if address.is_primary:
            db.execute(text("""
                UPDATE parties.customer_addresses 
                SET is_primary = false 
                WHERE customer_id = :customer_id
            """), {"customer_id": customer_id})
        
        # Insert new address
        query = text("""
            INSERT INTO parties.customer_addresses (
                customer_id, address_type, 
                address_line1, address_line2, area_name,
                city, state, pincode, country,
                landmark, contact_person, contact_phone,
                is_primary, is_billing, is_shipping, is_active
            ) VALUES (
                :customer_id, :address_type,
                :address_line1, :address_line2, :area_name,
                :city, :state, :pincode, :country,
                :landmark, :contact_person, :contact_phone,
                :is_primary, :is_billing, :is_shipping, :is_active
            ) RETURNING address_id
        """)
        
        address_data = {
            "customer_id": customer_id,
            "address_type": address.address_type or "billing",
            "address_line1": address.address_line1,
            "address_line2": address.address_line2,
            "area_name": address.area_name,
            "city": address.city,
            "state": address.state,
            "pincode": address.pincode,
            "country": address.country or "India",
            "landmark": address.landmark,
            "contact_person": address.contact_person,
            "contact_phone": address.contact_phone,
            "is_primary": address.is_primary or False,
            "is_billing": address.is_billing if address.is_billing is not None else True,
            "is_shipping": address.is_shipping if address.is_shipping is not None else (address.address_type in ["shipping", "both"]),
            "is_active": True
        }
        
        result = db.execute(query, address_data)
        address_id = result.scalar()
        db.commit()
        
        # Fetch and return created address
        result = db.execute(text("""
            SELECT * FROM parties.customer_addresses 
            WHERE address_id = :address_id
        """), {"address_id": address_id})
        
        address = result.fetchone()
        return CustomerAddressResponse(**dict(address._mapping))
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding customer address: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to add customer address: {str(e)}")


@router.get("/{customer_id}/outstanding")
async def get_customer_outstanding(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """Get customer outstanding details"""
    try:
        query = text("""
            SELECT 
                c.customer_id,
                c.customer_name,
                c.credit_limit,
                c.credit_days,
                c.current_outstanding,
                c.credit_limit - c.current_outstanding as available_credit,
                -- Outstanding invoices
                COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'invoice_id', i.invoice_id,
                            'invoice_number', i.invoice_number,
                            'invoice_date', i.invoice_date,
                            'due_date', i.due_date,
                            'total_amount', i.final_amount,
                            'paid_amount', i.paid_amount,
                            'outstanding_amount', i.final_amount - i.paid_amount,
                            'days_overdue', GREATEST(0, CURRENT_DATE - i.due_date)
                        ) ORDER BY i.invoice_date DESC
                    ) FILTER (WHERE i.invoice_id IS NOT NULL AND i.payment_status != 'paid'),
                    '[]'::jsonb
                ) as outstanding_invoices
            FROM parties.customers c
            LEFT JOIN sales.invoices i ON c.customer_id = i.customer_id 
                AND i.payment_status IN ('pending', 'partial')
            WHERE c.customer_id = :customer_id
            AND c.org_id = :org_id
            GROUP BY c.customer_id
        """)
        
        result = db.execute(query, {"customer_id": customer_id, "org_id": DEFAULT_ORG_ID})
        outstanding = result.fetchone()
        
        if not outstanding:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        return dict(outstanding._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting customer outstanding: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get customer outstanding: {str(e)}")


# Export router
__all__ = ["router"]