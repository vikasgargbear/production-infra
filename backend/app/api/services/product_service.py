"""
Product service layer for business logic
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

logger = logging.getLogger(__name__)


class ProductService:
    """
    Service class for product-related business logic
    Follows same pattern as InventoryService
    """
    
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
        existing_product = db.execute(text("""
            SELECT product_id FROM inventory.products
            WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(:product_name))
            AND org_id = :org_id
            LIMIT 1
        """), {"product_name": product_name, "org_id": org_id}).fetchone()
        
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
            
            # Generate product code if not provided
            product_code = additional_fields.get('product_code')
            if not product_code:
                product_code = f"PROD-{product_name[:10].upper().replace(' ', '')}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            # Use provided HSN or default pharma HSN
            hsn = hsn_code or additional_fields.get('hsn_code') or "30049099"
            
            # Prepare product data
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
                "base_uom": additional_fields.get('base_uom', 'NOS'),
                "alt_uom": additional_fields.get('alt_uom'),
                "conversion_factor": additional_fields.get('conversion_factor', 1),
                "gst_rate": additional_fields.get('gst_rate'),
                "cess_rate": additional_fields.get('cess_rate', 0),
                "minimum_stock": additional_fields.get('minimum_stock'),
                "reorder_level": additional_fields.get('reorder_level'),
                "is_prescription_required": additional_fields.get('is_prescription_required', False),
                "is_narcotics": additional_fields.get('is_narcotics', False)
            }
            
            # Remove None values
            product_data = {k: v for k, v in product_data.items() if v is not None}
            
            # Create the product
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
        
        Returns:
            category_id
        """
        # Try to get existing category
        category_result = db.execute(text("""
            SELECT category_id FROM inventory.product_categories 
            WHERE org_id = :org_id
            ORDER BY category_id
            LIMIT 1
        """), {"org_id": org_id}).fetchone()
        
        if category_result:
            return category_result.category_id
        
        # Create a default "General" category
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
        """Get product by ID with validation"""
        result = db.execute(text("""
            SELECT * FROM inventory.products
            WHERE product_id = :product_id AND org_id = :org_id
        """), {"product_id": product_id, "org_id": org_id}).fetchone()
        
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
        Search products by name, brand, or code
        
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
            WHERE org_id = :org_id
                AND is_active = true
                AND (
                    LOWER(product_name) LIKE LOWER(:pattern)
                    OR LOWER(brand) LIKE LOWER(:pattern)
                    OR LOWER(product_code) LIKE LOWER(:pattern)
                    OR LOWER(manufacturer) LIKE LOWER(:pattern)
                )
            ORDER BY product_name
            LIMIT :limit OFFSET :offset
        """), {
            "org_id": org_id,
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
        Update product fields
        
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
        update_fields['org_id'] = org_id
        
        db.execute(text(f"""
            UPDATE inventory.products
            SET {set_clause}, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = :product_id AND org_id = :org_id
        """), update_fields)
        
        logger.info(f"Updated product {product_id} with fields: {list(update_fields.keys())}")
    
    @staticmethod
    def validate_supplier(db: Session, supplier_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """
        Validate that supplier exists and belongs to the organization.
        
        Returns:
            Dictionary with supplier details (supplier_id, supplier_name) or None if not found
        """
        supplier_result = db.execute(text("""
            SELECT supplier_id, supplier_name 
            FROM parties.suppliers 
            WHERE supplier_id = :supplier_id AND org_id = :org_id
        """), {"supplier_id": supplier_id, "org_id": org_id}).first()
        
        if supplier_result:
            return {
                "supplier_id": supplier_result.supplier_id,
                "supplier_name": supplier_result.supplier_name
            }
        return None
