"""
Master Data API endpoints for Customers, Suppliers, and Products
Comprehensive CRUD operations with proper database integration
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import uuid4
import logging

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)
router = APIRouter()

# Default organization ID - replace with actual from session/context

# ============== CUSTOMER ENDPOINTS ==============

@router.post("/customers", response_model=Dict[str, Any])
async def create_customer(customer_data: Dict[str, Any], db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Create a new customer"""
    try:
        # Insert into parties.customers table with actual column names
        query = text("""
            INSERT INTO parties.customers (
                org_id, customer_name, customer_code, 
                primary_phone, secondary_phone, primary_email,
                contact_person_name, contact_person_phone, contact_person_email,
                gst_number, pan_number, drug_license_number, 
                customer_type, territory_id, route_id,
                credit_limit, credit_days, payment_terms,
                is_active, created_by
            ) VALUES (
                :org_id, :customer_name, :customer_code,
                :primary_phone, :secondary_phone, :primary_email,
                :contact_person_name, :contact_person_phone, :contact_person_email,
                :gst_number, :pan_number, :drug_license_number,
                :customer_type, :territory_id, :route_id,
                :credit_limit, :credit_days, :payment_terms,
                :is_active, :created_by
            ) RETURNING customer_id, customer_name, customer_code
        """)
        
        # Generate customer code if not provided
        customer_code = customer_data.get("customer_code") or f"CUST{int(datetime.now().timestamp())}"
        
        result = db.execute(query, {
            "org_id": org_id,
            "customer_name": customer_data.get("customer_name"),
            "customer_code": customer_code,
            "primary_phone": customer_data.get("phone") or customer_data.get("primary_phone"),
            "secondary_phone": customer_data.get("secondary_phone"),
            "primary_email": customer_data.get("email") or customer_data.get("primary_email"),
            "contact_person_name": customer_data.get("contact_person") or customer_data.get("contact_person_name"),
            "contact_person_phone": customer_data.get("contact_person_phone"),
            "contact_person_email": customer_data.get("contact_person_email"),
            "gst_number": customer_data.get("gst_number") or customer_data.get("gstin"),
            "pan_number": customer_data.get("pan_number"),
            "drug_license_number": customer_data.get("drug_license_number"),
            "customer_type": customer_data.get("customer_type", "retail"),
            "territory_id": customer_data.get("territory_id"),
            "route_id": customer_data.get("route_id"),
            "credit_limit": customer_data.get("credit_limit", 0),
            "credit_days": customer_data.get("credit_days", 0),
            "payment_terms": customer_data.get("payment_terms"),
            "is_active": True,
            "created_by": 1  # System user
        })
        
        db.commit()
        row = result.first()
        
        return {
            "customer_id": row[0],
            "customer_name": row[1],
            "customer_code": row[2],
            "message": "Customer created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating customer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/customers/{customer_id}")
async def get_customer(customer_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get customer by ID"""
    try:
        query = text("""
            SELECT * FROM parties.customers 
            WHERE customer_id = :customer_id
        """)
        
        result = db.execute(query, {"customer_id": customer_id})
        customer = result.first()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        return dict(customer._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching customer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/customers/{customer_id}")
async def update_customer(customer_id: int, customer_data: Dict[str, Any], db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Update customer"""
    try:
        # Build update query dynamically
        update_fields = []
        params = {"customer_id": customer_id}
        
        field_mapping = {
            "customer_name": "customer_name",
            "phone": "primary_phone",
            "email": "primary_email",
            "gst_number": "gst_number",
            "credit_limit": "credit_limit",
            "payment_terms": "payment_terms",
            "contact_person": "contact_person_name",
            "city": "city",
            "state": "state"
        }
        
        for api_field, db_field in field_mapping.items():
            if api_field in customer_data:
                update_fields.append(f"{db_field} = :{db_field}")
                params[db_field] = customer_data[api_field]
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        query = text(f"""
            UPDATE parties.customers 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id
            RETURNING customer_id, customer_name
        """)
        
        result = db.execute(query, params)
        db.commit()
        
        updated = result.first()
        if not updated:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        return {
            "customer_id": updated[0],
            "customer_name": updated[1],
            "message": "Customer updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating customer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== SUPPLIER ENDPOINTS ==============

@router.post("/suppliers", response_model=Dict[str, Any])
async def create_supplier(supplier_data: Dict[str, Any], db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Create a new supplier"""
    try:
        query = text("""
            INSERT INTO parties.suppliers (
                org_id, supplier_name, supplier_code, 
                primary_phone, secondary_phone, primary_email,
                contact_person_name, contact_person_phone,
                gst_number, pan_number, drug_license_number,
                supplier_type, payment_days, preferred_payment_mode,
                bank_name, account_number, ifsc_code,
                is_active, created_by
            ) VALUES (
                :org_id, :supplier_name, :supplier_code,
                :primary_phone, :secondary_phone, :primary_email,
                :contact_person_name, :contact_person_phone,
                :gst_number, :pan_number, :drug_license_number,
                :supplier_type, :payment_days, :preferred_payment_mode,
                :bank_name, :account_number, :ifsc_code,
                :is_active, :created_by
            ) RETURNING supplier_id, supplier_name, supplier_code
        """)
        
        # Generate supplier code if not provided
        supplier_code = supplier_data.get("supplier_code") or f"SUP{int(datetime.now().timestamp())}"
        
        result = db.execute(query, {
            "org_id": org_id,
            "supplier_name": supplier_data.get("supplier_name"),
            "supplier_code": supplier_code,
            "primary_phone": supplier_data.get("phone") or supplier_data.get("primary_phone"),
            "secondary_phone": supplier_data.get("secondary_phone"),
            "primary_email": supplier_data.get("email") or supplier_data.get("primary_email"),
            "contact_person_name": supplier_data.get("contact_person") or supplier_data.get("contact_person_name"),
            "contact_person_phone": supplier_data.get("contact_person_phone"),
            "gst_number": supplier_data.get("gst_number") or supplier_data.get("gstin"),
            "pan_number": supplier_data.get("pan_number"),
            "drug_license_number": supplier_data.get("drug_license_number"),
            "supplier_type": supplier_data.get("supplier_type", "manufacturer"),
            "payment_days": supplier_data.get("credit_days") or supplier_data.get("payment_days", 30),
            "preferred_payment_mode": supplier_data.get("preferred_payment_mode", "bank_transfer"),
            "bank_name": supplier_data.get("bank_name"),
            "account_number": supplier_data.get("bank_account_number") or supplier_data.get("account_number"),
            "ifsc_code": supplier_data.get("bank_ifsc_code") or supplier_data.get("ifsc_code"),
            "is_active": True,
            "created_by": 1  # System user
        })
        
        db.commit()
        row = result.first()
        
        return {
            "supplier_id": row[0],
            "supplier_name": row[1],
            "supplier_code": row[2],
            "message": "Supplier created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating supplier: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/suppliers")
async def list_suppliers(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """List all suppliers with pagination"""
    try:
        query = text("""
            SELECT supplier_id, supplier_name, supplier_code, contact_person,
                   primary_phone, email, city, state, gstin, status
            FROM parties.suppliers
            WHERE (:search IS NULL OR LOWER(supplier_name) LIKE LOWER(:search_pattern))
            ORDER BY supplier_name
            LIMIT :limit OFFSET :offset
        """)
        
        search_pattern = f"%{search}%" if search else None
        
        result = db.execute(query, {
            "search": search,
            "search_pattern": search_pattern,
            "limit": limit,
            "offset": offset
        })
        
        suppliers = []
        for row in result:
            suppliers.append(dict(row._mapping))
        
        # Get total count
        count_query = text("""
            SELECT COUNT(*) FROM parties.suppliers
            WHERE (:search IS NULL OR LOWER(supplier_name) LIKE LOWER(:search_pattern))
        """)
        
        count_result = db.execute(count_query, {
            "search": search,
            "search_pattern": search_pattern
        })
        total = count_result.scalar()
        
        return {
            "suppliers": suppliers,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing suppliers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/suppliers/{supplier_id}")
async def get_supplier(supplier_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get supplier by ID"""
    try:
        query = text("""
            SELECT * FROM parties.suppliers 
            WHERE supplier_id = :supplier_id
        """)
        
        result = db.execute(query, {"supplier_id": supplier_id})
        supplier = result.first()
        
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        return dict(supplier._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching supplier: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== PRODUCT ENDPOINTS ==============

@router.post("/products", response_model=Dict[str, Any])
async def create_product(product_data: Dict[str, Any], db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Create a new product"""
    try:
        query = text("""
            INSERT INTO inventory.products (
                org_id, product_code, product_name, generic_name,
                brand, manufacturer, category_id, product_type, product_class,
                composition, strength, hsn_code, 
                drug_schedule, requires_prescription, is_narcotic,
                is_controlled_substance, is_refrigerated,
                base_uom_id, secondary_uom_id, conversion_factor,
                pack_size, shelf_life_months, min_stock_quantity, max_stock_quantity,
                reorder_level, reorder_quantity, status, created_by
            ) VALUES (
                :org_id, :product_code, :product_name, :generic_name,
                :brand, :manufacturer, :category_id, :product_type, :product_class,
                :composition, :strength, :hsn_code,
                :drug_schedule, :requires_prescription, :is_narcotic,
                :is_controlled_substance, :is_refrigerated,
                :base_uom_id, :secondary_uom_id, :conversion_factor,
                :pack_size, :shelf_life_months, :min_stock_quantity, :max_stock_quantity,
                :reorder_level, :reorder_quantity, :status, :created_by
            ) RETURNING product_id, product_name, product_code
        """)
        
        # Generate product code if not provided
        product_code = product_data.get("product_code") or product_data.get("sku") or f"PRD{int(datetime.now().timestamp())}"
        
        result = db.execute(query, {
            "org_id": org_id,
            "product_code": product_code,
            "product_name": product_data.get("product_name"),
            "generic_name": product_data.get("generic_name", ""),
            "brand": product_data.get("brand"),
            "manufacturer": product_data.get("manufacturer"),
            "category_id": product_data.get("category_id"),
            "product_type": product_data.get("product_type", "standard"),
            "product_class": product_data.get("product_class", "medicine"),
            "composition": product_data.get("composition", {}),
            "strength": product_data.get("strength"),
            "hsn_code": product_data.get("hsn_code"),
            "drug_schedule": product_data.get("drug_schedule"),
            "requires_prescription": product_data.get("requires_prescription", False),
            "is_narcotic": product_data.get("is_narcotic", False),
            "is_controlled_substance": product_data.get("is_controlled_substance", False),
            "is_refrigerated": product_data.get("is_refrigerated", False),
            "base_uom_id": product_data.get("base_uom_id", 1),  # Default to Tablets
            "secondary_uom_id": product_data.get("secondary_uom_id"),
            "conversion_factor": product_data.get("conversion_factor", 1),
            "pack_size": product_data.get("pack_size", 1),
            "shelf_life_months": product_data.get("shelf_life_months", 24),
            "min_stock_quantity": product_data.get("min_stock", 0),
            "max_stock_quantity": product_data.get("max_stock", 1000),
            "reorder_level": product_data.get("reorder_level", 50),
            "reorder_quantity": product_data.get("reorder_quantity", 100),
            "status": "active",
            "created_by": 1  # System user
        })
        
        db.commit()
        row = result.first()
        
        # Also insert GST details if provided
        if product_data.get("gst_percentage"):
            gst_query = text("""
                INSERT INTO gst.gst_rates (hsn_code, gst_rate, cgst_rate, sgst_rate, igst_rate, description)
                VALUES (:hsn_code, :gst_rate, :cgst_rate, :sgst_rate, :igst_rate, :description)
                ON CONFLICT (hsn_code) DO NOTHING
            """)
            
            gst_rate = product_data.get("gst_percentage")
            db.execute(gst_query, {
                "hsn_code": product_data.get("hsn_code"),
                "gst_rate": gst_rate,
                "cgst_rate": gst_rate / 2,
                "sgst_rate": gst_rate / 2,
                "igst_rate": gst_rate,
                "description": product_data.get("product_name")
            })
            db.commit()
        
        return {
            "product_id": row[0],
            "product_name": row[1],
            "product_code": row[2],
            "message": "Product created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating product: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/products")
async def list_products(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """List all products with pagination and search"""
    try:
        query = text("""
            SELECT p.product_id, p.product_code, p.product_name, p.generic_name,
                   p.manufacturer, p.hsn_code, p.pack_size, p.status,
                   p.min_stock_quantity, p.max_stock_quantity,
                   COALESCE(g.gst_rate, 12) as gst_percentage
            FROM inventory.products p
            LEFT JOIN gst.gst_rates g ON p.hsn_code = g.hsn_code
            WHERE (:search IS NULL OR 
                   LOWER(p.product_name) LIKE LOWER(:search_pattern) OR
                   LOWER(p.product_code) LIKE LOWER(:search_pattern))
            ORDER BY p.product_name
            LIMIT :limit OFFSET :offset
        """)
        
        search_pattern = f"%{search}%" if search else None
        
        result = db.execute(query, {
            "search": search,
            "search_pattern": search_pattern,
            "limit": limit,
            "offset": offset
        })
        
        products = []
        for row in result:
            products.append(dict(row._mapping))
        
        # Get total count
        count_query = text("""
            SELECT COUNT(*) FROM inventory.products p
            WHERE (:search IS NULL OR 
                   LOWER(p.product_name) LIKE LOWER(:search_pattern) OR
                   LOWER(p.product_code) LIKE LOWER(:search_pattern))
        """)
        
        count_result = db.execute(count_query, {
            "search": search,
            "search_pattern": search_pattern
        })
        total = count_result.scalar()
        
        return {
            "products": products,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing products: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/products/search")
async def search_products(
    q: str = Query(..., description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Search products by name or code"""
    try:
        query = text("""
            SELECT p.product_id, p.product_code, p.product_name, 
                   p.manufacturer, p.pack_size,
                   COALESCE(g.gst_rate, 12) as gst_percentage,
                   COALESCE(
                       (SELECT b.mrp FROM inventory.batches b 
                        WHERE b.product_id = p.product_id 
                        AND b.quantity_available > 0
                        ORDER BY b.created_at DESC LIMIT 1), 
                       0
                   ) as mrp
            FROM inventory.products p
            LEFT JOIN gst.gst_rates g ON p.hsn_code = g.hsn_code
            WHERE LOWER(p.product_name) LIKE LOWER(:search_pattern)
               OR LOWER(p.product_code) LIKE LOWER(:search_pattern)
            ORDER BY p.product_name
            LIMIT :limit
        """)
        
        result = db.execute(query, {
            "search_pattern": f"%{q}%",
            "limit": limit
        })
        
        products = []
        for row in result:
            products.append(dict(row._mapping))
        
        return products
        
    except Exception as e:
        logger.error(f"Error searching products: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/products/{product_id}")
async def get_product(product_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get product by ID"""
    try:
        query = text("""
            SELECT p.*, g.gst_rate as gst_percentage
            FROM inventory.products p
            LEFT JOIN gst.gst_rates g ON p.hsn_code = g.hsn_code
            WHERE p.product_id = :product_id
        """)
        
        result = db.execute(query, {"product_id": product_id})
        product = result.first()
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        return dict(product._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching product: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))