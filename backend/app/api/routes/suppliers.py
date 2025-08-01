"""
Suppliers API Router
Manages pharmaceutical suppliers and vendors
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...database import get_db
from ...models import Supplier
from ...core.crud_base import create_crud
from ...schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse
from uuid import UUID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/suppliers", tags=["suppliers"])

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
        query = "SELECT * FROM suppliers WHERE 1=1"
        params = {}
        
        if search:
            query += " AND LOWER(supplier_name) LIKE LOWER(:search)"
            params["search"] = f"%{search}%"
            
        query += " ORDER BY supplier_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        suppliers = [dict(row._mapping) for row in result]
        
        return suppliers
        
    except Exception as e:
        logger.error(f"Error fetching suppliers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get suppliers: {str(e)}")

@router.get("/{supplier_id}")
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    """Get a single supplier by ID"""
    try:
        supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        return supplier
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching supplier {supplier_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get supplier: {str(e)}")

@router.post("/", response_model=SupplierResponse)
def create_supplier(supplier_data: SupplierCreate, db: Session = Depends(get_db)):
    """Create a new supplier"""
    try:
        # Get org_id from somewhere (should come from auth in production)
        org_id = UUID("12de5e22-eee7-4d25-b3a7-d16d01c6170f")  # Default org for now
        
        # Convert Pydantic model to dict and handle field mappings
        supplier_dict = supplier_data.dict(exclude_unset=True)
        
        # Add org_id
        supplier_dict['org_id'] = org_id
        
        # Generate supplier code if not provided
        if not supplier_dict.get('supplier_code'):
            count = db.query(Supplier).filter(Supplier.org_id == org_id).count()
            supplier_dict['supplier_code'] = f"SUP-{count + 1:04d}"
        
        # Handle field mappings from frontend to database
        field_mappings = {
            'gstin': 'gst_number',
            'payment_terms': 'credit_period_days',
            'bank_account_no': 'account_number',
            'bank_ifsc_code': 'ifsc_code',
            'drug_license_no': 'drug_license_number'
        }
        
        for frontend_field, db_field in field_mappings.items():
            if frontend_field in supplier_dict:
                supplier_dict[db_field] = supplier_dict.pop(frontend_field)
        
        # Handle address fields
        if 'address_line1' in supplier_dict:
            address = supplier_dict.pop('address_line1')
            if 'address_line2' in supplier_dict:
                address_line2 = supplier_dict.pop('address_line2')
                if address_line2:
                    address += f", {address_line2}"
            supplier_dict['address'] = address
        else:
            # Remove address_line2 if present without address_line1
            supplier_dict.pop('address_line2', None)
        
        # Create supplier
        supplier = Supplier(**supplier_dict)
        db.add(supplier)
        db.commit()
        db.refresh(supplier)
        return supplier
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating supplier: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create supplier: {str(e)}")

@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(supplier_id: int, supplier_data: SupplierUpdate, db: Session = Depends(get_db)):
    """Update a supplier"""
    try:
        supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        update_dict = supplier_data.dict(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(supplier, key, value)
        
        db.commit()
        db.refresh(supplier)
        return supplier
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
        supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        db.delete(supplier)
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
                SELECT p.* FROM products p 
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