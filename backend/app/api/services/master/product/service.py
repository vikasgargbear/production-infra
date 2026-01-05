"""
Product service layer for business logic

SECURITY: Uses TenantAwareSession for automatic org_id/branch_id filtering
Do NOT manually filter by org_id in SELECT queries - TenantAwareSession handles it
Note: org_id parameter still needed for INSERT operations (creating new records)

Handles product management, search, and creation
Shared across Product API, Purchase API, and other modules
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import logging
import re

from ...gst_service import GSTService
from ...document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

# Constants - single source of truth for product defaults
DEFAULT_HSN_PHARMA = "30049099"  # Default pharmaceutical HSN code
DEFAULT_HSN_GENERAL = "3004"     # General medicines HSN
DEFAULT_BASE_UOM = "NOS"         # Default unit of measure
DEFAULT_CONVERSION_FACTOR = 1
DEFAULT_CESS_RATE = Decimal("0.00")
GST_RATES = [0, 5, 12, 18, 28]   # Valid GST slabs in India
PRODUCT_CODE_PREFIX = "PROD"


class ProductService:
    """
    Service class for product-related business logic
    
    SECURITY NOTE: All methods expect TenantAwareSession which auto-filters by:
    - org_id: Always (hard tenant boundary)
    - branch_id: Based on user's branch_scope
    """
    
    # --- Validation Methods ---
    
    @staticmethod
    def validate_product_data(product_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate product data including HSN and GST.
        Uses GSTService for GST slab validation.
        """
        errors = []
        validated_data = product_data.copy()
        
        # Validate product name (required)
        product_name = product_data.get("product_name")
        if not product_name or not product_name.strip():
            errors.append("Product name is required")
        
        # Validate HSN code format (4-8 digits)
        hsn = product_data.get("hsn_code")
        if hsn:
            hsn = str(hsn).strip()
            if not re.match(r"^\d{4,8}$", hsn):
                errors.append("Invalid HSN code format (must be 4-8 digits)")
            else:
                validated_data["hsn_code"] = hsn
        else:
            # Default to pharma HSN
            validated_data["hsn_code"] = DEFAULT_HSN_PHARMA
        
        # Validate GST rate using approved slabs
        gst = product_data.get("gst_rate") or product_data.get("gst_percent")
        if gst is not None:
            try:
                gst_value = int(gst)
                if gst_value not in GST_RATES:
                    errors.append(f"Invalid GST rate {gst_value}%. Must be one of: {GST_RATES}")
                else:
                    validated_data["gst_percent"] = gst_value
            except (ValueError, TypeError):
                errors.append(f"GST rate must be a number")
        
        # Validate base UOM
        if not product_data.get("base_uom"):
            validated_data["base_uom"] = DEFAULT_BASE_UOM
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "data": validated_data
        }
    
    @staticmethod
    def check_duplicate_product(
        db: Session,
        org_id: str,
        product_name: Optional[str] = None,
        product_code: Optional[str] = None,
        exclude_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Check for duplicate products by name or code.
        TenantAwareSession auto-filters by org_id.
        """
        duplicates = []
        
        # Check product name duplicate (exact match, case insensitive)
        if product_name:
            query = """
                SELECT product_id, product_name, product_code 
                FROM inventory.products 
                WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(:product_name))
            """
            params = {"product_name": product_name}
            if exclude_id:
                query += " AND product_id != :exclude_id"
                params["exclude_id"] = exclude_id
            
            result = db.execute(text(query), params).fetchone()
            if result:
                duplicates.append({
                    "field": "product_name",
                    "product_id": result.product_id,
                    "product_name": result.product_name,
                    "message": f"Product with name '{result.product_name}' already exists"
                })
        
        # Check product code duplicate
        if product_code:
            query = """
                SELECT product_id, product_name, product_code 
                FROM inventory.products 
                WHERE product_code = :product_code
            """
            params = {"product_code": product_code}
            if exclude_id:
                query += " AND product_id != :exclude_id"
                params["exclude_id"] = exclude_id
            
            result = db.execute(text(query), params).fetchone()
            if result:
                duplicates.append({
                    "field": "product_code",
                    "product_id": result.product_id,
                    "product_name": result.product_name,
                    "message": f"Product code '{product_code}' already exists for '{result.product_name}'"
                })
        
        return {
            "has_duplicates": len(duplicates) > 0,
            "duplicates": duplicates
        }
    
    @staticmethod
    def generate_product_code(db: Session, org_id: str, product_name: str = None) -> str:
        """Generate unique product code using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "product", org_id)
    
    # --- CRUD Methods ---
    
    @staticmethod
    def get_or_create_product(
        db: Session,
        org_id: str,
        product_name: str,
        hsn_code: Optional[str] = None,
        user_id: Optional[int] = None,
        **additional_fields
    ) -> int:
        """
        Look up existing product by exact name match or create a new one.
        TenantAwareSession auto-filters by org_id for SELECT.
        
        For pharma products: We DON'T do partial matching.
        PARACETAMOL 500MG and PARACETAMOL 650MG are different products.
        Only exact name matches are acceptable.
        
        Args:
            db: Database session
            org_id: Organization ID
            product_name: Product name (exact match required)
            hsn_code: HSN code (optional, defaults to 30049099 for pharma)
            user_id: User creating the product (for audit)
            **additional_fields: Any additional product fields
        
        Returns:
            product_id
        """
        # Try to find existing product (exact name match only)
        # TenantAwareSession auto-adds org_id filter
        existing_product = db.execute(text("""
            SELECT product_id FROM inventory.products
            WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(:product_name))
            LIMIT 1
        """), {"product_name": product_name}).fetchone()
        
        if existing_product:
            logger.info(f"Found existing product: {product_name} (ID: {existing_product.product_id})")
            return existing_product.product_id
        
        # Product doesn't exist - create it
        logger.info(f"Creating new product: {product_name}")
        return ProductService.create_product(
            db=db,
            org_id=org_id,
            product_name=product_name,
            hsn_code=hsn_code,
            user_id=user_id,
            **additional_fields
        )
    
    @staticmethod
    def create_product(
        db: Session,
        org_id: str,
        product_name: str,
        hsn_code: Optional[str] = None,
        user_id: Optional[int] = None,
        **additional_fields
    ) -> int:
        """
        Create a new product with validation.
        org_id parameter needed for INSERT (creating new record).
        
        Args:
            db: Database session
            org_id: Organization ID
            product_name: Product name
            hsn_code: HSN code (optional)
            user_id: User creating the product
            **additional_fields: Additional product attributes
        
        Returns:
            product_id
        """
        try:
            # Get or create a default category
            category_id = ProductService._get_or_create_default_category(db, org_id)
            
            # Generate product code using service method if not provided
            product_code = additional_fields.get('product_code')
            if not product_code:
                product_code = ProductService.generate_product_code(db, org_id, product_name)
            
            # Use provided HSN or default pharma HSN (using constant)
            hsn = hsn_code or additional_fields.get('hsn_code') or DEFAULT_HSN_PHARMA
            
            # Prepare product data (using constants for defaults)
            product_data = {
                "org_id": org_id,
                "product_name": product_name,
                "product_code": product_code,
                "category_id": category_id,
                "hsn_code": hsn,
                "is_active": additional_fields.get('is_active', True),
                # Optional fields
                "manufacturer": additional_fields.get('manufacturer'),
                "brand": additional_fields.get('brand'),
                "product_group": additional_fields.get('product_group'),
                "product_class": additional_fields.get('product_class'),
                "product_type": additional_fields.get('product_type'),
                "description": additional_fields.get('description'),
                "base_uom": additional_fields.get('base_uom', DEFAULT_BASE_UOM),
                "alt_uom": additional_fields.get('alt_uom'),
                "conversion_factor": additional_fields.get('conversion_factor', DEFAULT_CONVERSION_FACTOR),
                "gst_rate": additional_fields.get('gst_rate'),
                "cess_rate": additional_fields.get('cess_rate', DEFAULT_CESS_RATE),
                "minimum_stock": additional_fields.get('minimum_stock'),
                "reorder_level": additional_fields.get('reorder_level'),
                "is_prescription_required": additional_fields.get('is_prescription_required', False),
                "is_narcotics": additional_fields.get('is_narcotics', False)
            }
            
            # Remove None values
            product_data = {k: v for k, v in product_data.items() if v is not None}
            
            # Create the product - org_id needed for INSERT
            new_product = db.execute(text("""
                INSERT INTO inventory.products (
                    org_id, product_name, product_code,
                    category_id, hsn_code, is_active, 
                    manufacturer, brand, product_group, product_class, product_type,
                    description, base_uom, alt_uom, conversion_factor,
                    gst_rate, cess_rate, minimum_stock, reorder_level,
                    is_prescription_required, is_narcotics,
                    created_at
                ) VALUES (
                    :org_id, :product_name, :product_code,
                    :category_id, :hsn_code, :is_active,
                    :manufacturer, :brand, :product_group, :product_class, :product_type,
                    :description, :base_uom, :alt_uom, :conversion_factor,
                    :gst_rate, :cess_rate, :minimum_stock, :reorder_level,
                    :is_prescription_required, :is_narcotics,
                    CURRENT_TIMESTAMP
                ) RETURNING product_id
            """), product_data).fetchone()
            
            product_id = new_product.product_id
            logger.info(f"Created product {product_name} with ID {product_id}")
            return product_id
            
        except Exception as e:
            logger.error(f"Error creating product: {str(e)}")
            raise
    
    @staticmethod
    def _get_or_create_default_category(db: Session, org_id: str) -> int:
        """
        Get default category or create one if it doesn't exist.
        TenantAwareSession auto-filters by org_id for SELECT.
        
        Returns:
            category_id
        """
        # Try to get existing category
        category_result = db.execute(text("""
            SELECT category_id FROM inventory.product_categories 
            ORDER BY category_id
            LIMIT 1
        """)).fetchone()
        
        if category_result:
            return category_result.category_id
        
        # Create a default "General" category - org_id needed for INSERT
        new_category = db.execute(text("""
            INSERT INTO inventory.product_categories (
                org_id, category_name, category_code, is_active
            ) VALUES (
                :org_id, 'General', 'GEN', true
            ) RETURNING category_id
        """), {"org_id": org_id}).fetchone()
        
        return new_category.category_id if new_category else None
    
    @staticmethod
    def get_product(db: Session, product_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """
        Get product by ID with validation.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT * FROM inventory.products
            WHERE product_id = :product_id
        """), {"product_id": product_id}).fetchone()
        
        if not result:
            raise ValueError(f"Product {product_id} not found")
        
        return dict(result._mapping)
    
    @staticmethod
    def search_products(
        db: Session,
        org_id: str,
        query: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Search products by name, brand, or code.
        TenantAwareSession auto-filters by org_id.
        
        Args:
            db: Database session
            org_id: Organization ID
            query: Search query string
            limit: Max results to return
            offset: Results offset for pagination
        
        Returns:
            List of product dictionaries
        """
        results = db.execute(text("""
            SELECT 
                product_id, product_code, product_name,
                brand, manufacturer, hsn_code,
                base_uom, is_active
            FROM inventory.products
            WHERE is_active = true
                AND (
                    LOWER(product_name) LIKE LOWER(:pattern)
                    OR LOWER(brand) LIKE LOWER(:pattern)
                    OR LOWER(product_code) LIKE LOWER(:pattern)
                    OR LOWER(manufacturer) LIKE LOWER(:pattern)
                )
            ORDER BY product_name
            LIMIT :limit OFFSET :offset
        """), {
            "pattern": f"%{query}%",
            "limit": limit,
            "offset": offset
        })
        
        return [dict(row._mapping) for row in results]
    
    @staticmethod
    def update_product(
        db: Session,
        product_id: int,
        org_id: str,
        updates: Dict[str, Any]
    ) -> None:
        """
        Update product fields.
        TenantAwareSession auto-filters UPDATE by org_id.
        
        Args:
            db: Database session
            product_id: Product ID to update
            org_id: Organization ID (for security)
            updates: Dictionary of fields to update
        """
        # Verify product exists and belongs to org
        ProductService.get_product(db, product_id, org_id)
        
        # Build UPDATE query dynamically
        allowed_fields = {
            'product_name', 'product_code', 'manufacturer', 'brand',
            'hsn_code', 'gst_rate', 'cess_rate', 'description',
            'base_uom', 'alt_uom', 'conversion_factor',
            'minimum_stock', 'reorder_level', 'is_active',
            'is_prescription_required', 'is_narcotics'
        }
        
        update_fields = {k: v for k, v in updates.items() if k in allowed_fields}
        
        if not update_fields:
            return
        
        set_clause = ", ".join([f"{field} = :{field}" for field in update_fields])
        update_fields['product_id'] = product_id
        
        db.execute(text(f"""
            UPDATE inventory.products
            SET {set_clause}, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = :product_id
        """), update_fields)
        
        logger.info(f"Updated product {product_id} with fields: {list(update_fields.keys())}")
    
    @staticmethod
    def validate_supplier(db: Session, supplier_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """
        Validate that supplier exists and belongs to the organization.
        TenantAwareSession auto-filters by org_id.
        
        Returns:
            Dictionary with supplier details (supplier_id, supplier_name) or None if not found
        """
        supplier_result = db.execute(text("""
            SELECT supplier_id, supplier_name 
            FROM parties.suppliers 
            WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id}).first()
        
        if supplier_result:
            return {
                "supplier_id": supplier_result.supplier_id,
                "supplier_name": supplier_result.supplier_name
            }
        return None
    
    @staticmethod
    def get_categories(db: Session) -> List[Dict[str, Any]]:
        """
        Get all active product categories.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT category_id, category_name, category_code, parent_category_id
            FROM inventory.product_categories
            WHERE is_active = true
            ORDER BY category_name
        """))
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_types(db: Session) -> List[Dict[str, Any]]:
        """
        Get all active product types.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT type_id, type_name, type_code, default_base_uom
            FROM inventory.product_types
            WHERE is_active = true
            ORDER BY type_name
        """))
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def search_for_purchase(
        db: Session,
        org_id: str,
        product_name: str
    ) -> Dict[str, Any]:
        """
        Search for existing products before creating purchase entry.
        Returns matching products with their latest batch info.
        """
        if not product_name or not product_name.strip():
            return {"products": [], "search_term": "", "exact_match_found": False}
        
        product_name = product_name.strip()
        result = db.execute(text("""
            SELECT DISTINCT
                p.product_id,
                p.product_name,
                p.product_code,
                p.hsn_code,
                p.manufacturer,
                b.batch_number as last_batch,
                b.mrp_per_unit as last_mrp,
                b.cost_per_unit as last_cost,
                b.expiry_date as last_expiry,
                CASE 
                    WHEN LOWER(TRIM(p.product_name)) = LOWER(TRIM(:exact_name)) THEN 100
                    WHEN LOWER(p.product_name) LIKE LOWER(:pattern) THEN 80
                    ELSE 60
                END as match_score
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON b.product_id = p.product_id
                AND b.org_id = p.org_id
                AND b.batch_id = (
                    SELECT batch_id FROM inventory.batches
                    WHERE product_id = p.product_id
                    AND org_id = p.org_id
                    ORDER BY created_at DESC LIMIT 1
                )
            WHERE p.org_id = :org_id
                AND (
                    LOWER(TRIM(p.product_name)) = LOWER(TRIM(:exact_name))
                    OR LOWER(p.product_name) LIKE LOWER(:pattern)
                )
            ORDER BY match_score DESC, p.product_name
            LIMIT 10
        """), {
            "org_id": org_id,
            "exact_name": product_name,
            "pattern": f"%{product_name}%"
        })
        
        products = []
        for row in result:
            products.append({
                "product_id": row.product_id,
                "product_name": row.product_name,
                "product_code": row.product_code,
                "hsn_code": row.hsn_code,
                "manufacturer": row.manufacturer,
                "last_batch": row.last_batch,
                "last_mrp": float(row.last_mrp) if row.last_mrp else None,
                "last_cost": float(row.last_cost) if row.last_cost else None,
                "last_expiry": str(row.last_expiry) if row.last_expiry else None,
                "match_score": row.match_score,
                "is_exact_match": row.match_score == 100
            })
        
        return {
            "search_term": product_name,
            "products": products,
            "exact_match_found": any(p["is_exact_match"] for p in products)
        }
    
    @staticmethod
    def validate_purchase_items(
        db: Session,
        org_id: str,
        items: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Validate purchase items before creating entry.
        Uses batch lookup for efficiency instead of N+1 queries.
        """
        if not items:
            return {"items": [], "all_valid": True, "new_products_count": 0, "existing_products_count": 0}
        
        # BATCH: Get all product names and look them up together
        product_names = [item.get("product_name", "").strip().lower() for item in items]
        existing_products = {}
        
        if product_names:
            result = db.execute(text("""
                SELECT product_id, product_name, hsn_code, LOWER(TRIM(product_name)) as name_key
                FROM inventory.products
                WHERE LOWER(TRIM(product_name)) = ANY(:names)
                AND org_id = :org_id
            """), {"names": product_names, "org_id": org_id})
            
            for row in result:
                existing_products[row.name_key] = {
                    "product_id": row.product_id,
                    "product_name": row.product_name,
                    "hsn_code": row.hsn_code
                }
        
        # Now validate each item using the pre-fetched lookup
        validated_items = []
        for item in items:
            product_name = item.get("product_name", "").strip()
            name_key = product_name.lower()
            
            validated_item = {
                "product_name": product_name,
                "quantity": item.get("quantity"),
                "cost_price": item.get("cost_price"),
                "mrp": item.get("mrp"),
                "selling_price": item.get("selling_price"),
                "batch_number": item.get("batch_number"),
                "expiry_date": item.get("expiry_date"),
                "hsn_code": item.get("hsn_code"),
                "tax_percent": item.get("tax_percent", 0)
            }
            
            existing = existing_products.get(name_key)
            if existing:
                validated_item["product_exists"] = True
                validated_item["product_id"] = existing["product_id"]
                validated_item["existing_product_name"] = existing["product_name"]
                validated_item["existing_hsn_code"] = existing["hsn_code"]
            else:
                validated_item["product_exists"] = False
                validated_item["product_id"] = None
                validated_item["will_create_new"] = True
            
            # Validate required fields
            errors = []
            if not validated_item["quantity"] or validated_item["quantity"] <= 0:
                errors.append("Quantity is required and must be > 0")
            if not validated_item["cost_price"] or validated_item["cost_price"] <= 0:
                errors.append("Cost price is required and must be > 0")
            if not validated_item["batch_number"]:
                errors.append("Batch number is required")
            if not validated_item["expiry_date"]:
                errors.append("Expiry date is required for pharma products")
            
            # Validate pricing logic
            if validated_item.get("mrp") and validated_item.get("cost_price"):
                if validated_item["mrp"] < validated_item["cost_price"]:
                    errors.append("MRP cannot be less than cost price")
            
            if validated_item.get("selling_price") and validated_item.get("mrp"):
                if validated_item["selling_price"] > validated_item["mrp"]:
                    errors.append("Selling price cannot be greater than MRP")
            
            validated_item["validation_errors"] = errors
            validated_item["is_valid"] = len(errors) == 0
            validated_items.append(validated_item)
        
        return {
            "items": validated_items,
            "all_valid": all(item["is_valid"] for item in validated_items),
            "new_products_count": sum(1 for item in validated_items if not item.get("product_exists")),
            "existing_products_count": sum(1 for item in validated_items if item.get("product_exists"))
        }
