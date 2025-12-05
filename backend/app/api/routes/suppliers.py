"""
Suppliers API Router
Manages pharmaceutical suppliers and vendors
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, or_
import logging

from ...core.database import get_db
from ...core.secure_auth import get_org_id_string  # SECURE: JWT-based auth
from ...models import Supplier
from ...core.crud_base import create_crud
from ...schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse
from ...core.state_utils import get_state_name_and_code
from uuid import UUID

logger = logging.getLogger(__name__)

router = APIRouter(tags=["suppliers"])

# Create CRUD instance
supplier_crud = create_crud(Supplier)

@router.get("/search")
def search_suppliers(
    search_term: Optional[str] = Query(None, description="Search name, code, GST, phone"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """
    Search suppliers by name, code, GSTIN, phone, or email
    This endpoint must be defined BEFORE /{supplier_id} to avoid route conflicts
    """
    try:
        query = """
            SELECT s.supplier_id, s.supplier_name, s.supplier_code, s.gst_number,
                   s.primary_phone, s.primary_email, s.supplier_type, s.is_active,
                   a.city, a.state_name as state, a.address_line1 as address, a.pincode
            FROM parties.suppliers s
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'supplier'
                AND a.entity_id = s.supplier_id
                AND a.org_id = s.org_id
                AND a.is_default = true
            )
            WHERE s.is_active = true
            AND s.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if search_term:
            # Clean the search term
            clean_term = search_term.strip()
            query += """ 
                AND (
                    LOWER(s.supplier_name) LIKE LOWER(:search) OR
                    LOWER(s.supplier_code) LIKE LOWER(:search) OR
                    LOWER(s.gst_number) LIKE LOWER(:exact) OR
                    s.primary_phone LIKE :phone OR
                    LOWER(s.primary_email) LIKE LOWER(:search)
                )
            """
            params["search"] = f"%{clean_term}%"
            params["exact"] = clean_term  # For GST exact match
            params["phone"] = f"%{clean_term.replace(' ', '').replace('-', '')}%"
        
        query += " ORDER BY s.supplier_name LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset
        
        result = db.execute(text(query), params)
        suppliers = []
        
        for row in result:
            supplier_dict = {
                "supplier_id": row.supplier_id,
                "supplier_name": row.supplier_name,
                "supplier_code": row.supplier_code,
                "gstin": row.gst_number,  # Map gst_number to gstin for frontend compatibility
                "gst_number": row.gst_number,
                "phone": row.primary_phone,
                "mobile": row.primary_phone,  # Add mobile field for compatibility
                "primary_phone": row.primary_phone,
                "email": row.primary_email,
                "primary_email": row.primary_email,
                "supplier_type": row.supplier_type,
                "is_active": row.is_active,
                "city": row.city,
                "state": row.state,
                "address": row.address,
                "pincode": row.pincode
            }
            suppliers.append(supplier_dict)
        
        return suppliers
        
    except Exception as e:
        logger.error(f"Error searching suppliers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
def get_suppliers(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by supplier name"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get suppliers with optional search"""
    try:
        query = """
            SELECT s.*,
                   a.city,
                   a.state_name as state,
                   a.address_line1 as address,
                   a.pincode
            FROM parties.suppliers s
            LEFT JOIN master.addresses a ON (a.entity_type = 'supplier' AND a.entity_id = s.supplier_id AND a.org_id = s.org_id AND a.is_default = true)
            WHERE s.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if search:
            query += " AND LOWER(s.supplier_name) LIKE LOWER(:search)"
            params["search"] = f"%{search}%"
            
        query += " ORDER BY s.supplier_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        suppliers = []
        
        for row in result:
            suppliers.append({
                "id": row.supplier_id,
                "supplier_id": row.supplier_id,
                "name": row.supplier_name,
                "supplier_name": row.supplier_name,
                "code": row.supplier_code,
                "gst_number": row.gst_number,
                "pan_number": row.pan_number,
                "phone": row.primary_phone,
                "primary_phone": row.primary_phone,
                "email": row.primary_email,
                "primary_email": row.primary_email,
                "contact_person": row.contact_person_name,
                "contact_person_name": row.contact_person_name,
                "contact_person_phone": row.contact_person_phone,
                "city": row.city,
                "state": row.state,
                "address": row.address,
                "pincode": row.pincode,
                "created_at": row.created_at,
                "updated_at": row.updated_at
            })
        
        return suppliers
        
    except Exception as e:
        logger.error(f"Error fetching suppliers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get suppliers: {str(e)}")

@router.get("/{supplier_id}")
def get_supplier(supplier_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """Get a single supplier by ID with addresses"""
    try:
        result = db.execute(text("""
            SELECT s.*,
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
            FROM parties.suppliers s
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'supplier' 
                AND a.entity_id = s.supplier_id 
                AND a.org_id = s.org_id
                AND a.is_active = true
            )
            WHERE s.supplier_id = :supplier_id AND s.org_id = :org_id
            GROUP BY s.supplier_id
        """), {"supplier_id": supplier_id, "org_id": org_id})
        
        supplier = result.fetchone()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Parse addresses JSON
        import json
        addresses = supplier.addresses if hasattr(supplier, 'addresses') else "[]"
        if isinstance(addresses, str):
            addresses = json.loads(addresses)
        
        # Get default address for backward compatibility
        default_address = next((a for a in addresses if a.get('is_default')), addresses[0] if addresses else {})
        
        # Map database columns to response schema
        return {
            "id": supplier.supplier_id,
            "supplier_id": supplier.supplier_id,
            "name": supplier.supplier_name,
            "supplier_name": supplier.supplier_name,
            "code": supplier.supplier_code,
            "gst_number": supplier.gst_number,
            "pan_number": supplier.pan_number,
            "phone": supplier.primary_phone,
            "primary_phone": supplier.primary_phone,
            "email": supplier.primary_email,
            "primary_email": supplier.primary_email,
            "contact_person": supplier.contact_person_name,
            "contact_person_name": supplier.contact_person_name,
            "contact_person_phone": supplier.contact_person_phone,
            "supplier_type": supplier.supplier_type,
            "is_active": supplier.is_active,
            # Flat fields for backward compatibility
            "city": default_address.get('city'),
            "state": default_address.get('state_name'),
            "address": default_address.get('address_line1'),
            "pincode": default_address.get('pincode'),
            # Full addresses array
            "addresses": addresses,
            "created_at": supplier.created_at,
            "updated_at": supplier.updated_at
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get supplier: {str(e)}")

@router.post("/")
def create_supplier(supplier_data: SupplierCreate, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """Create a new supplier"""
    try:
        # Convert org_id to UUID for database operations
        from uuid import UUID
        if isinstance(org_id, str):
            org_id = UUID(org_id)
        
        # Generate supplier code if not provided
        supplier_code = supplier_data.code
        if not supplier_code:
            count_result = db.execute(text("""
                SELECT COUNT(*) FROM parties.suppliers 
                WHERE org_id = :org_id
            """), {"org_id": org_id}).scalar()
            supplier_code = f"SUP-{count_result + 1:04d}"
        
        # Create supplier using SQL
        result = db.execute(text("""
            INSERT INTO parties.suppliers (
                org_id, supplier_code, supplier_name, supplier_type,
                gst_number, pan_number, drug_license_number, drug_license_validity,
                primary_phone, secondary_phone, primary_email, contact_person_name,
                contact_person_phone, bank_name, account_number, ifsc_code, account_holder_name,
                payment_days, quality_rating, delivery_rating, compliance_rating,
                internal_notes, is_active,
                created_at, updated_at
            ) VALUES (
                :org_id, :supplier_code, :supplier_name, :supplier_type,
                :gst_number, :pan_number, :drug_license_number, :drug_license_validity,
                :phone, :secondary_phone, :email, :contact_person,
                :whatsapp_number, :bank_name, :account_number, :ifsc_code, :account_holder_name,
                :payment_days, :quality_rating, :delivery_rating, :compliance_rating,
                :internal_notes, :is_active,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING supplier_id, created_at
        """), {
            "org_id": org_id,
            "supplier_code": supplier_code,
            "supplier_name": supplier_data.name,
            "supplier_type": supplier_data.supplier_type or "distributor",
            "gst_number": supplier_data.gst_number,
            "pan_number": supplier_data.pan_number,
            "drug_license_number": supplier_data.drug_license_number,
            "drug_license_validity": supplier_data.drug_license_validity,
            "phone": supplier_data.phone or "N/A",  # Database requires non-null phone
            "secondary_phone": supplier_data.secondary_phone,
            "whatsapp_number": supplier_data.contact_person_phone or supplier_data.whatsapp_number or supplier_data.phone,  # Contact phone for WhatsApp
            "email": supplier_data.email,
            "contact_person": supplier_data.contact_person,
            "bank_name": supplier_data.bank_name,
            "account_number": supplier_data.account_number,
            "ifsc_code": supplier_data.ifsc_code,
            "account_holder_name": supplier_data.account_holder_name,
            "payment_days": supplier_data.payment_days or supplier_data.payment_terms or 30,
            "quality_rating": supplier_data.quality_rating or 4.0,
            "delivery_rating": supplier_data.delivery_rating or 4.0,
            "compliance_rating": supplier_data.compliance_rating or 'good',
            "internal_notes": supplier_data.notes or supplier_data.internal_notes,
            "is_active": True
        })
        
        row = result.fetchone()
        supplier_id = row.supplier_id
        
        # Create address record if complete address information provided
        # Only create address if we have city, state AND pincode (all required fields)
        if supplier_data.city and supplier_data.state and supplier_data.pincode:
            # Automatically map state name to GST state code
            state_name, state_code = get_state_name_and_code(supplier_data.state)
            
            db.execute(text("""
                INSERT INTO master.addresses (
                    org_id, entity_type, entity_id, address_type,
                    address_line1, address_line2, city, state_code, state_name, pincode,
                    country, is_default, is_active,
                    created_at
                ) VALUES (
                    :org_id, 'supplier', :entity_id, 'registered',
                    :address_line1, :address_line2, :city, :state_code, :state_name, :pincode,
                    :country, true, true,
                    CURRENT_TIMESTAMP
                )
            """), {
                "org_id": org_id,
                "entity_id": supplier_id,
                "address_line1": supplier_data.address or "",
                "address_line2": getattr(supplier_data, 'address_line2', None),
                "city": supplier_data.city,
                "state_code": state_code,
                "state_name": state_name,
                "pincode": supplier_data.pincode,
                "country": "India"
            })
        elif supplier_data.city and supplier_data.state:
            # If we have city and state but no pincode, use a default pincode
            # This ensures address can be saved even without pincode
            state_name, state_code = get_state_name_and_code(supplier_data.state)
            
            db.execute(text("""
                INSERT INTO master.addresses (
                    org_id, entity_type, entity_id, address_type,
                    address_line1, address_line2, city, state_code, state_name, pincode,
                    country, is_default, is_active,
                    created_at
                ) VALUES (
                    :org_id, 'supplier', :entity_id, 'registered',
                    :address_line1, :address_line2, :city, :state_code, :state_name, :pincode,
                    :country, true, true,
                    CURRENT_TIMESTAMP
                )
            """), {
                "org_id": org_id,
                "entity_id": supplier_id,
                "address_line1": supplier_data.address or "",
                "address_line2": getattr(supplier_data, 'address_line2', None),
                "city": supplier_data.city,
                "state_code": state_code,
                "state_name": state_name,
                "pincode": supplier_data.pincode or "000000",  # Default pincode if not provided
                "country": "India"
            })
        
        db.commit()
        
        return {
            "id": supplier_id,
            "name": supplier_data.name,
            "code": supplier_code,
            "gst_number": supplier_data.gst_number,
            "pan_number": supplier_data.pan_number,
            "phone": supplier_data.phone,
            "email": supplier_data.email,
            "contact_person": supplier_data.contact_person,
            "created_at": row.created_at,
            "message": "Supplier created successfully"
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating supplier: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create supplier: {str(e)}")

@router.put("/{supplier_id}")
def update_supplier(supplier_id: int, supplier_data: SupplierUpdate, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """Update a supplier"""
    try:
        # Check if supplier exists
        exists = db.execute(text("""
            SELECT 1 FROM parties.suppliers
            WHERE supplier_id = :supplier_id AND org_id = :org_id
        """), {"supplier_id": supplier_id, "org_id": org_id}).scalar()
        
        if not exists:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Build update query
        update_fields = []
        params = {"supplier_id": supplier_id}
        
        # Map schema fields to database columns
        field_mapping = {
            "name": "supplier_name",
            "gst_number": "gst_number",
            "pan_number": "pan_number",
            "address": "address",
            "city": "city",
            "state": "state",
            "pincode": "pincode",
            "phone": "primary_phone",
            "email": "primary_email",
            "contact_person": "contact_person_name"
        }
        
        for field, value in supplier_data.dict(exclude_unset=True).items():
            if value is not None:
                db_field = field_mapping.get(field, field)
                update_fields.append(f"{db_field} = :{field}")
                params[field] = value
        
        if update_fields:
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            params["org_id"] = org_id
            query = f"""
                UPDATE parties.suppliers
                SET {', '.join(update_fields)}
                WHERE supplier_id = :supplier_id AND org_id = :org_id
            """

            db.execute(text(query), params)
            db.commit()
        
        # Return updated supplier
        return get_supplier(supplier_id, db)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update supplier: {str(e)}")

@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """Delete a supplier"""
    try:
        # Check if supplier exists
        exists = db.execute(text("""
            SELECT 1 FROM parties.suppliers
            WHERE supplier_id = :supplier_id AND org_id = :org_id
        """), {"supplier_id": supplier_id, "org_id": org_id}).scalar()

        if not exists:
            raise HTTPException(status_code=404, detail="Supplier not found")

        # Delete supplier
        db.execute(text("""
            DELETE FROM parties.suppliers
            WHERE supplier_id = :supplier_id AND org_id = :org_id
        """), {"supplier_id": supplier_id, "org_id": org_id})
        
        db.commit()
        return {"message": "Supplier deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete supplier: {str(e)}")

@router.get("/{supplier_id}/products")
def get_supplier_products(supplier_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """Get products from a specific supplier"""
    try:
        result = db.execute(
            text("""
                SELECT p.* FROM inventory.products p
                JOIN purchases pur ON p.product_id = pur.product_id AND p.org_id = pur.org_id
                WHERE pur.supplier_id = :supplier_id
                AND p.org_id = :org_id
                GROUP BY p.product_id
                ORDER BY p.product_name
            """),
            {"supplier_id": supplier_id, "org_id": org_id}
        )
        products = [dict(row._mapping) for row in result]
        return products
    except Exception as e:
        logger.error(f"Error fetching products for supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get supplier products: {str(e)}")

@router.get("/{supplier_id}/purchases")
def get_supplier_purchases(supplier_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """Get purchase history for a supplier"""
    try:
        result = db.execute(
            text("""
                SELECT * FROM purchases
                WHERE supplier_id = :supplier_id
                AND org_id = :org_id
                ORDER BY purchase_date DESC
                LIMIT :limit OFFSET :skip
            """),
            {"supplier_id": supplier_id, "org_id": org_id, "limit": limit, "skip": skip}
        )
        purchases = [dict(row._mapping) for row in result]
        return purchases
    except Exception as e:
        logger.error(f"Error fetching purchases for supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get supplier purchases: {str(e)}")