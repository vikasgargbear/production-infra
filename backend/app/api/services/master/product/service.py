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

from ...compliance.gst_service import GSTService
from ...document_number_service import DocumentNumberService
from ....core.utils.constants import (
    ProductDefaults, PackDefaults, PricingDefaults, DateDefaults,
    TaxRates, SourceType,
)

logger = logging.getLogger(__name__)

# Aliases for backward compatibility within this file
DEFAULT_HSN_PHARMA = ProductDefaults.HSN_PHARMA
DEFAULT_HSN_GENERAL = ProductDefaults.HSN_GENERAL
DEFAULT_BASE_UOM = ProductDefaults.DEFAULT_BASE_UOM
DEFAULT_CONVERSION_FACTOR = 1
DEFAULT_CESS_RATE = Decimal(str(ProductDefaults.DEFAULT_CESS_RATE))
GST_RATES = TaxRates.VALID_SLABS
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
    
    @staticmethod
    def validate_products_exist(db: Session, product_ids: List[int]) -> Dict[str, Any]:
        """
        Validate that all product IDs exist.
        Returns dict with valid flag and list of missing IDs.
        """
        if not product_ids:
            return {"valid": True, "missing": []}
        
        result = db.execute(text("""
            SELECT product_id FROM inventory.products 
            WHERE product_id = ANY(:product_ids)
        """), {"product_ids": product_ids})
        
        existing_ids = {row.product_id for row in result}
        missing = set(product_ids) - existing_ids
        
        return {
            "valid": len(missing) == 0,
            "missing": list(missing)
        }
    
    @staticmethod
    def get_classes(db: Session) -> List[Dict[str, Any]]:
        """
        Get all distinct product classes.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT DISTINCT product_class
            FROM inventory.products
            WHERE product_class IS NOT NULL
            AND product_class != ''
            ORDER BY product_class
        """))
        return [{"class_name": row.product_class} for row in result if row.product_class]
    
    @staticmethod
    def list_products(
        db: Session,
        skip: int = 0,
        limit: int = 50,
        category_id: Optional[int] = None,
        search: Optional[str] = None,
        manufacturer: Optional[str] = None,
        product_type: Optional[str] = None,
        include_stock: bool = True
    ) -> List[Dict[str, Any]]:
        """
        List products with filters and pagination.
        TenantAwareSession auto-filters by org_id.
        
        Args:
            include_stock: If True, includes stock/pricing subqueries (slower but complete)
        """
        # Base fields
        base_fields = """
            p.product_id, p.product_code, p.product_name, p.generic_name,
            p.brand, p.manufacturer, p.category_id, p.product_type,
            p.composition, p.strength, p.hsn_code,
            p.gst_percent, p.is_active, p.is_saleable,
            p.created_at, p.updated_at,
            pc.category_name
        """
        
        # Stock and pricing subqueries (optional for performance)
        stock_fields = ""
        if include_stock:
            stock_fields = """,
                COALESCE(
                    (SELECT SUM(quantity_available) 
                     FROM inventory.batches b 
                     WHERE b.product_id = p.product_id 
                       AND b.batch_status = 'active'
                       AND b.quality_status = 'approved'), 0
                ) as current_stock,
                (SELECT mrp_per_unit 
                 FROM inventory.batches b 
                 WHERE b.product_id = p.product_id 
                   AND b.mrp_per_unit IS NOT NULL
                   AND b.batch_status = 'active'
                 ORDER BY b.created_at DESC LIMIT 1) as mrp_per_unit,
                (SELECT sale_price_per_unit 
                 FROM inventory.batches b 
                 WHERE b.product_id = p.product_id 
                   AND b.sale_price_per_unit IS NOT NULL
                   AND b.batch_status = 'active'
                 ORDER BY b.created_at DESC LIMIT 1) as sale_price_per_unit
            """
        
        query = f"""
            SELECT {base_fields}{stock_fields}
            FROM inventory.products p
            LEFT JOIN inventory.product_categories pc ON p.category_id = pc.category_id
            WHERE p.is_active = true
        """
        params: Dict[str, Any] = {}
        
        if category_id:
            query += " AND p.category_id = :category_id"
            params["category_id"] = category_id
        
        if search:
            query += """ AND (
                p.product_name ILIKE :search OR
                p.generic_name ILIKE :search OR
                p.brand ILIKE :search OR
                p.manufacturer ILIKE :search OR
                p.product_code ILIKE :search
            )"""
            params["search"] = f"%{search}%"
        
        if manufacturer:
            query += " AND p.manufacturer ILIKE :manufacturer"
            params["manufacturer"] = f"%{manufacturer}%"
        
        if product_type:
            query += " AND p.product_type = :product_type"
            params["product_type"] = product_type
        
        query += " ORDER BY p.created_at DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def search_products(
        db: Session,
        q: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Search products by name, brand, HSN, or code.
        Includes average pricing from active batches.
        TenantAwareSession auto-filters by org_id.
        """
        if not q:
            # Return empty search for no query
            return []
        
        result = db.execute(text("""
            SELECT 
                p.product_id, p.product_code, p.product_name, p.generic_name,
                p.brand, p.manufacturer, p.hsn_code, p.gst_percent, p.category_id,
                p.total_quantity_available,
                COALESCE(AVG(b.mrp_per_unit), 0) as mrp_per_unit,
                COALESCE(AVG(b.sale_price_per_unit), 0) as sale_price_per_unit,
                COALESCE(AVG(b.cost_per_unit), 0) as cost_per_unit
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id
                AND p.org_id = b.org_id
                AND b.batch_status = 'active'
                AND b.quantity_available > 0
            WHERE (p.product_name ILIKE :search 
                OR p.brand ILIKE :search 
                OR p.manufacturer ILIKE :search
                OR p.hsn_code ILIKE :search
                OR p.product_code ILIKE :search)
            GROUP BY p.product_id, p.product_code, p.product_name, p.generic_name,
                p.brand, p.manufacturer, p.hsn_code, p.gst_percent, p.category_id,
                p.total_quantity_available
            ORDER BY p.product_name
            LIMIT :limit OFFSET :offset
        """), {"search": f"%{q}%", "limit": limit, "offset": offset})
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def search_products_with_batches(
        db: Session,
        search: Optional[str] = None,
        category_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 50,
        include_zero_stock: bool = False
    ) -> Dict[str, Any]:
        """
        Search products with their active batch details.
        Returns products with nested batches array.
        TenantAwareSession auto-filters by org_id.
        """
        # Build product query
        product_query = """
            SELECT DISTINCT
                p.product_id, p.product_code, p.product_name, p.generic_name,
                p.brand, p.manufacturer, p.hsn_code, p.gst_percent, p.category_id,
                p.total_quantity_available, p.created_at,
                pc.category_name
            FROM inventory.products p
            LEFT JOIN inventory.product_categories pc ON p.category_id = pc.category_id
            WHERE 1=1
        """
        params: Dict[str, Any] = {}
        
        if search:
            product_query += """ AND (p.product_name ILIKE :search 
                OR p.product_code ILIKE :search 
                OR p.brand ILIKE :search
                OR p.hsn_code ILIKE :search)"""
            params["search"] = f"%{search}%"
        
        if category_id:
            product_query += " AND p.category_id = :category_id"
            params["category_id"] = category_id
        
        if not include_zero_stock:
            product_query += " AND p.total_quantity_available > 0"
        
        product_query += " ORDER BY p.product_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        products_result = db.execute(text(product_query), params)
        products = [dict(row._mapping) for row in products_result]
        
        if not products:
            return {"products": [], "total": 0}
        
        # Get batches for found products
        product_ids = [p["product_id"] for p in products]
        batches_result = db.execute(text("""
            SELECT 
                b.batch_id, b.product_id, b.batch_number, b.expiry_date,
                b.quantity_available, b.mrp_per_unit, b.sale_price_per_unit,
                b.cost_per_unit, b.batch_status
            FROM inventory.batches b
            WHERE b.product_id = ANY(:product_ids)
            AND b.batch_status = 'active'
            AND b.quantity_available > 0
            ORDER BY b.expiry_date ASC
        """), {"product_ids": product_ids})
        
        batches = [dict(row._mapping) for row in batches_result]
        
        # Group batches by product
        batches_by_product: Dict[int, List[Dict]] = {}
        for batch in batches:
            pid = batch["product_id"]
            if pid not in batches_by_product:
                batches_by_product[pid] = []
            batches_by_product[pid].append(batch)
        
        # Add batches to products
        for product in products:
            product["batches"] = batches_by_product.get(product["product_id"], [])
        
        return {"products": products, "total": len(products)}
    
    @staticmethod
    def create_category(
        db: Session,
        org_id: str,
        category_name: str,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new product category.
        Returns created category or raises ValueError if exists.
        """
        if not category_name or not category_name.strip():
            raise ValueError("Category name is required")
        
        category_name = category_name.strip()
        category_code = category_name.upper().replace(" ", "_").replace("-", "_")
        
        # Check if already exists
        existing = db.execute(text("""
            SELECT category_id FROM inventory.product_categories
            WHERE org_id = :org_id
            AND (LOWER(category_name) = LOWER(:category_name)
            OR LOWER(category_code) = LOWER(:category_code))
        """), {
            "org_id": org_id,
            "category_name": category_name,
            "category_code": category_code
        }).first()
        
        if existing:
            raise ValueError("Category already exists")
        
        # Insert new category
        result = db.execute(text("""
            INSERT INTO inventory.product_categories (
                org_id, category_name, category_code, is_active, created_at
            ) VALUES (
                :org_id, :category_name, :category_code, true, CURRENT_TIMESTAMP
            ) RETURNING category_id, category_name, category_code
        """), {
            "org_id": org_id,
            "category_name": category_name,
            "category_code": category_code
        })
        
        created = result.fetchone()
        return {
            "category_id": created.category_id,
            "category_name": created.category_name,
            "category_code": created.category_code
        }
    
    @staticmethod
    def create_type(
        db: Session,
        type_name: str,
        default_base_uom: str = "Unit"
    ) -> Dict[str, Any]:
        """
        Create a new product type.
        Returns created type or raises ValueError if exists.
        Note: product_types may be org-agnostic in some implementations.
        """
        if not type_name or not type_name.strip():
            raise ValueError("Type name is required")
        
        type_name = type_name.strip()
        type_code = type_name.upper().replace(" ", "_").replace("-", "_")
        
        # Check if already exists
        existing = db.execute(text("""
            SELECT type_id FROM inventory.product_types
            WHERE LOWER(type_name) = LOWER(:type_name)
            OR LOWER(type_code) = LOWER(:type_code)
        """), {
            "type_name": type_name,
            "type_code": type_code
        }).first()
        
        if existing:
            raise ValueError("Product type already exists")
        
        # Insert new type
        result = db.execute(text("""
            INSERT INTO inventory.product_types (
                type_name, type_code, default_base_uom, is_active
            ) VALUES (
                :type_name, :type_code, :default_base_uom, true
            ) RETURNING type_id, type_name, type_code, default_base_uom
        """), {
            "type_name": type_name,
            "type_code": type_code,
            "default_base_uom": default_base_uom
        })
        
        created = result.fetchone()
        return {
            "type_id": created.type_id,
            "type_name": created.type_name,
            "type_code": created.type_code,
            "default_base_uom": created.default_base_uom
        }

    # ==================== SEARCH WITH BATCHES ====================
    
    @staticmethod
    def search_products_summary(
        db: Session,
        search: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Search products with stock summary (for search_products_with_batches).
        TenantAwareSession auto-filters by org_id.
        """
        query = """
            SELECT 
                p.product_id, p.product_code, p.product_name, p.generic_name,
                p.brand, p.manufacturer, p.hsn_code, p.gst_percent, p.category_id,
                p.is_active,
                COALESCE(SUM(b.quantity_available), 0) as total_stock
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id
                AND p.org_id = b.org_id
                AND b.batch_status = 'active'
            WHERE p.is_active = true
        """
        params = {"limit": limit, "offset": offset}
        
        if search:
            query += """ AND (
                p.product_name ILIKE :search 
                OR p.brand ILIKE :search 
                OR p.manufacturer ILIKE :search
                OR p.hsn_code ILIKE :search
                OR p.product_code ILIKE :search
            )"""
            params["search"] = f"%{search}%"
        
        query += """
            GROUP BY p.product_id, p.product_code, p.product_name, p.generic_name,
                     p.brand, p.manufacturer, p.hsn_code, p.gst_percent, p.category_id,
                     p.is_active
            ORDER BY p.product_name
            LIMIT :limit OFFSET :offset
        """
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_batches_for_products(
        db: Session,
        product_ids: List[int],
        include_expired: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get all batches for a list of product IDs.
        TenantAwareSession auto-filters by org_id.
        
        Returns:
            List of batch dictionaries with days_to_expiry calculated
        """
        if not product_ids:
            return []
        
        query = """
            SELECT 
                b.batch_id,
                b.product_id,
                b.batch_number,
                b.manufacturing_date,
                b.expiry_date,
                b.quantity_available,
                b.mrp_per_unit,
                b.sale_price_per_unit,
                b.cost_per_unit,
                b.units_per_pack,
                b.packages_per_box,
                b.pack_type,
                b.batch_status,
                b.quality_status,
                (b.expiry_date - CURRENT_DATE) as days_to_expiry
            FROM inventory.batches b
            WHERE b.product_id = ANY(:product_ids)
              AND b.batch_status = 'active'
              AND b.quality_status = 'approved'
        """
        
        if not include_expired:
            query += " AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)"
        
        query += " ORDER BY b.expiry_date ASC, b.batch_id"
        
        result = db.execute(text(query), {"product_ids": product_ids})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def count_products(
        db: Session,
        include_inactive: bool = False,
        since: Optional[str] = None
    ) -> int:
        """
        Count products with optional filters.
        TenantAwareSession auto-filters by org_id.
        """
        query = "SELECT COUNT(*) FROM inventory.products p WHERE 1=1"
        params = {}
        
        if not include_inactive:
            query += " AND p.is_active = true"
        
        if since:
            query += " AND p.updated_at > :since"
            params["since"] = since
        
        result = db.execute(text(query), params)
        return result.scalar() or 0
    
    @staticmethod
    def get_products_page(
        db: Session,
        limit: int = 100,
        offset: int = 0,
        include_inactive: bool = False,
        since: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get paginated products for bulk sync.
        TenantAwareSession auto-filters by org_id.
        """
        query = """
            SELECT 
                p.product_id, p.product_code, p.product_name, p.generic_name,
                p.brand, p.manufacturer, p.hsn_code, p.gst_percent, p.category_id,
                p.product_type, p.composition, p.strength,
                p.is_active, p.is_saleable, p.maintain_batch,
                p.created_at, p.updated_at,
                pc.category_name
            FROM inventory.products p
            LEFT JOIN inventory.product_categories pc ON p.category_id = pc.category_id
                AND pc.org_id = p.org_id
            WHERE p.org_id IS NOT NULL
        """
        params = {"limit": limit, "offset": offset}
        
        if not include_inactive:
            query += " AND p.is_active = true"
        
        if since:
            query += " AND p.updated_at > :since"
            params["since"] = since
        
        query += " ORDER BY p.product_name LIMIT :limit OFFSET :offset"
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def insert_product(
        db: Session,
        org_id: str,
        product_data: Dict[str, Any]
    ) -> int:
        """
        Insert a new product record. Returns product_id.
        """
        result = db.execute(text("""
            INSERT INTO inventory.products (
                org_id, product_code, product_name, generic_name,
                brand, manufacturer, category_id, product_type,
                hsn_code, gst_percent, composition, strength,
                is_active, is_saleable, maintain_batch,
                created_at, updated_at
            ) VALUES (
                :org_id, :product_code, :product_name, :generic_name,
                :brand, :manufacturer, :category_id, :product_type,
                :hsn_code, :gst_percent, :composition::jsonb, :strength,
                :is_active, :is_saleable, :maintain_batch,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING product_id
        """), {
            "org_id": org_id,
            "product_code": product_data.get("product_code", ""),
            "product_name": product_data.get("product_name", ""),
            "generic_name": product_data.get("generic_name"),
            "brand": product_data.get("brand"),
            "manufacturer": product_data.get("manufacturer"),
            "category_id": product_data.get("category_id"),
            "product_type": product_data.get("product_type", ProductDefaults.DEFAULT_PRODUCT_TYPE),
            "hsn_code": product_data.get("hsn_code", DEFAULT_HSN_PHARMA),
            "gst_percent": product_data.get("gst_percent", ProductDefaults.DEFAULT_GST_PERCENT),
            "composition": product_data.get("composition", "{}"),
            "strength": product_data.get("strength"),
            "is_active": product_data.get("is_active", True),
            "is_saleable": product_data.get("is_saleable", True),
            "maintain_batch": product_data.get("maintain_batch", True)
        })
        return result.scalar()
    
    @staticmethod
    def update_product_fields(
        db: Session,
        product_id: int,
        updates: Dict[str, Any]
    ) -> None:
        """
        Update product fields dynamically.
        TenantAwareSession auto-filters by org_id.
        """
        if not updates:
            return
        
        # Build dynamic UPDATE query
        set_clauses = []
        params = {"product_id": product_id}
        
        for field, value in updates.items():
            if value is not None:
                set_clauses.append(f"{field} = :{field}")
                params[field] = value
        
        if set_clauses:
            set_clauses.append("updated_at = CURRENT_TIMESTAMP")
            query = f"""
                UPDATE inventory.products 
                SET {', '.join(set_clauses)}
                WHERE product_id = :product_id
            """
            db.execute(text(query), params)
    
    @staticmethod
    def get_category_by_name(
        db: Session,
        category_name: str
    ) -> Optional[int]:
        """
        Look up category_id by name.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT category_id FROM inventory.product_categories
            WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(:name))
            AND is_active = true
            LIMIT 1
        """), {"name": category_name}).fetchone()
        return result.category_id if result else None
    
    @staticmethod
    def create_initial_batch(
        db: Session,
        org_id: str,
        product_id: int,
        batch_data: Dict[str, Any]
    ) -> Optional[int]:
        """
        Create initial batch for a product with trigger handling.
        Disables expiry trigger during insert to avoid errors.
        
        Returns:
            batch_id or None if no batch created
        """
        batch_number = batch_data.get("batch_number")
        if not batch_number:
            return None
        
        try:
            # Disable trigger
            db.execute(text("ALTER TABLE inventory.batches DISABLE TRIGGER trigger_batch_expiry_status"))
            
            result = db.execute(text("""
                INSERT INTO inventory.batches (
                    org_id, product_id, batch_number,
                    expiry_date, manufacturing_date,
                    quantity_available, quantity_reserved,
                    mrp_per_unit, sale_price_per_unit, cost_per_unit,
                    batch_status, quality_status,
                    source_type,
                    pack_type, pack_size, units_per_pack,
                    packages_per_box, pack_uom, base_uom,
                    created_at, updated_at
                ) VALUES (
                    :org_id, :product_id, :batch_number,
                    :expiry_date, :mfg_date,
                    :quantity, 0,
                    :mrp, :sale_price, :cost,
                    'active', 'approved',
                    'MANUAL',
                    :pack_type, :pack_size, :units_per_pack,
                    :packages_per_box, :pack_uom, :base_uom,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING batch_id
            """), {
                "org_id": org_id,
                "product_id": product_id,
                "batch_number": batch_number,
                "expiry_date": batch_data.get("expiry_date"),
                "mfg_date": batch_data.get("manufacturing_date"),
                "quantity": batch_data.get("quantity", 0),
                "mrp": batch_data.get("mrp_per_unit", 0),
                "sale_price": batch_data.get("sale_price_per_unit", 0),
                "cost": batch_data.get("cost_per_unit", 0),
                "pack_type": batch_data.get("pack_type", PackDefaults.PACK_TYPE),
                "pack_size": batch_data.get("pack_size", PackDefaults.PACK_SIZE),
                "units_per_pack": batch_data.get("units_per_pack", PackDefaults.UNITS_PER_PACK),
                "packages_per_box": batch_data.get("packages_per_box", PackDefaults.PACKAGES_PER_BOX),
                "pack_uom": batch_data.get("pack_uom", PackDefaults.PACK_UOM),
                "base_uom": batch_data.get("base_uom", PackDefaults.BASE_UOM)
            })
            
            return result.scalar()
        finally:
            # Always re-enable trigger
            db.execute(text("ALTER TABLE inventory.batches ENABLE TRIGGER trigger_batch_expiry_status"))
    
    @staticmethod
    def update_product_dynamic(
        db: Session,
        product_id: int,
        update_fields: List[str],
        params: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Update product with dynamic field list and return product info.
        """
        if not update_fields:
            return None
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        query = f"""
            UPDATE inventory.products
            SET {', '.join(update_fields)}
            WHERE product_id = :product_id
            RETURNING product_id, product_code, product_name
        """
        
        result = db.execute(text(query), params).fetchone()
        return dict(result._mapping) if result else None
    
    @staticmethod
    def get_product_basic(
        db: Session,
        product_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get basic product info (id, code, name).
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT product_id, product_code, product_name 
            FROM inventory.products 
            WHERE product_id = :product_id
        """), {"product_id": product_id}).fetchone()
        
        return dict(result._mapping) if result else None
    
    @staticmethod
    def update_product_batches(
        db: Session,
        product_id: int,
        batch_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Update batch-level properties for all active batches of a product.
        
        Args:
            db: Database session
            product_id: Product ID
            batch_data: Dictionary of batch fields to update
            
        Returns:
            List of updated batch details
        """
        batch_field_mapping = {
            "category_name": "category_name",
            "pack_type": "pack_type",
            "pack_size": "pack_size",
            "units_per_pack": "units_per_pack",
            "packages_per_box": "packages_per_box",
            "tablets_per_strip": "tablets_per_strip",
            "pack_uom": "pack_uom",
            "base_uom": "base_uom",
            "storage_condition": "storage_condition",
            "quality_status": "quality_status"
        }
        
        update_fields = []
        params = {"product_id": product_id}
        
        for frontend_field, db_field in batch_field_mapping.items():
            if frontend_field in batch_data:
                update_fields.append(f"{db_field} = :{db_field}")
                params[db_field] = batch_data[frontend_field]
        
        if not update_fields:
            return []
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        query = f"""
            UPDATE inventory.batches
            SET {', '.join(update_fields)}
            WHERE product_id = :product_id
            AND batch_status = 'active'
            AND quality_status = 'approved'
            RETURNING batch_id, batch_number, category_name, pack_type, pack_size
        """
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result.fetchall()]

