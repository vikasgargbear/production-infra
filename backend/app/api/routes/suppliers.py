"""
Suppliers API Router
Manages pharmaceutical suppliers and vendors
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID
from ...models import Supplier
from ...core.crud_base import create_crud
from ...schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse
from uuid import UUID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

# Create CRUD instance
supplier_crud = create_crud(Supplier)

@router.get("/")
def get_suppliers(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by supplier name"),
    db: Session = Depends(get_db)
):
    """Get suppliers with optional search"""
    try:
        query = "SELECT * FROM parties.suppliers WHERE 1=1"
        params = {}
        
        if search:
            query += " AND LOWER(supplier_name) LIKE LOWER(:search)"
            params["search"] = f"%{search}%"
            
        query += " ORDER BY supplier_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        suppliers = []
        
        for row in result:
            suppliers.append({
                "id": row.supplier_id,
                "name": row.supplier_name,
                "code": row.supplier_code,
                "gst_number": row.gst_number,
                "pan_number": row.pan_number,
                "address": row.address,
                "city": row.city,
                "state": row.state,
                "pincode": row.pincode,
                "phone": row.primary_phone,
                "email": row.primary_email,
                "contact_person": row.contact_person_name,
                "created_at": row.created_at,
                "updated_at": row.updated_at
            })
        
        return suppliers
        
    except Exception as e:
        logger.error(f"Error fetching suppliers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get suppliers: {str(e)}")

@router.get("/{supplier_id}")
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    """Get a single supplier by ID"""
    try:
        result = db.execute(text("""
            SELECT * FROM parties.suppliers 
            WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id})
        
        supplier = result.fetchone()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Map database columns to response schema
        return {
            "id": supplier.supplier_id,
            "name": supplier.supplier_name,
            "code": supplier.supplier_code,
            "gst_number": supplier.gst_number,
            "pan_number": supplier.pan_number,
            "address": supplier.address,
            "city": supplier.city,
            "state": supplier.state,
            "pincode": supplier.pincode,
            "phone": supplier.primary_phone,
            "email": supplier.primary_email,
            "contact_person": supplier.contact_person_name,
            "created_at": supplier.created_at,
            "updated_at": supplier.updated_at
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get supplier: {str(e)}")

@router.post("/")
def create_supplier(supplier_data: SupplierCreate, db: Session = Depends(get_db)):
    """Create a new supplier"""
    try:
        # Generate supplier code if not provided
        supplier_code = supplier_data.code
        if not supplier_code:
            count_result = db.execute(text("""
                SELECT COUNT(*) FROM parties.suppliers 
                WHERE org_id = :org_id
            """), {"org_id": DEFAULT_ORG_ID}).scalar()
            supplier_code = f"SUP-{count_result + 1:04d}"
        
        # Create supplier using SQL
        result = db.execute(text("""
            INSERT INTO parties.suppliers (
                org_id, supplier_code, supplier_name, supplier_type,
                gst_number, pan_number, 
                primary_phone, primary_email, contact_person_name,
                payment_days, is_active,
                created_at, updated_at
            ) VALUES (
                :org_id, :supplier_code, :supplier_name, :supplier_type,
                :gst_number, :pan_number,
                :phone, :email, :contact_person,
                :payment_days, :is_active,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING supplier_id, created_at
        """), {
            "org_id": DEFAULT_ORG_ID,
            "supplier_code": supplier_code,
            "supplier_name": supplier_data.name,
            "supplier_type": "distributor",  # Default type
            "gst_number": supplier_data.gst_number,
            "pan_number": supplier_data.pan_number,
            "phone": supplier_data.phone,
            "email": supplier_data.email,
            "contact_person": supplier_data.contact_person,
            "payment_days": 30,  # Default payment terms
            "is_active": True
        })
        
        row = result.fetchone()
        db.commit()
        
        return {
            "id": row.supplier_id,
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
def update_supplier(supplier_id: int, supplier_data: SupplierUpdate, db: Session = Depends(get_db)):
    """Update a supplier"""
    try:
        # Check if supplier exists
        exists = db.execute(text("""
            SELECT 1 FROM parties.suppliers 
            WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id}).scalar()
        
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
            query = f"""
                UPDATE parties.suppliers 
                SET {', '.join(update_fields)}
                WHERE supplier_id = :supplier_id
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
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    """Delete a supplier"""
    try:
        # Check if supplier exists
        exists = db.execute(text("""
            SELECT 1 FROM parties.suppliers 
            WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id}).scalar()
        
        if not exists:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Delete supplier
        db.execute(text("""
            DELETE FROM parties.suppliers 
            WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id})
        
        db.commit()
        return {"message": "Supplier deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete supplier: {str(e)}")

@router.get("/{supplier_id}/products")
def get_supplier_products(supplier_id: int, db: Session = Depends(get_db)):
    """Get products from a specific supplier"""
    try:
        result = db.execute(
            text("""
                SELECT p.* FROM inventory.products p 
                JOIN purchases pur ON p.product_id = pur.product_id
                WHERE pur.supplier_id = :supplier_id
                GROUP BY p.product_id
                ORDER BY p.product_name
            """),
            {"supplier_id": supplier_id}
        )
        products = [dict(row._mapping) for row in result]
        return products
    except Exception as e:
        logger.error(f"Error fetching products for supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get supplier products: {str(e)}")

@router.get("/{supplier_id}/purchases")
def get_supplier_purchases(supplier_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get purchase history for a supplier"""
    try:
        result = db.execute(
            text("""
                SELECT * FROM purchases 
                WHERE supplier_id = :supplier_id
                ORDER BY purchase_date DESC
                LIMIT :limit OFFSET :skip
            """),
            {"supplier_id": supplier_id, "limit": limit, "skip": skip}
        )
        purchases = [dict(row._mapping) for row in result]
        return purchases
    except Exception as e:
        logger.error(f"Error fetching purchases for supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get supplier purchases: {str(e)}")