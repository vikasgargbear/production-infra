"""
Supplier Service
Handles all database operations for suppliers
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class SupplierService:
    """Service class for Supplier operations"""
    
    @staticmethod
    def search_suppliers(
        db: Session, 
        org_id: str,
        search_term: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Search suppliers by name, code, GST, phone, or email."""
        query = """
            SELECT s.supplier_id, s.supplier_name, s.supplier_code, s.gst_number,
                   s.primary_phone, s.primary_email, s.supplier_type, s.is_active,
                   a.city, a.state_name, a.address_line1, a.pincode
            FROM parties.suppliers s
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'supplier'
                AND a.entity_id = s.supplier_id
                AND a.org_id = s.org_id
                AND a.is_default = true
            )
            WHERE s.is_active = true AND s.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if search_term:
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
            params["exact"] = clean_term
            params["phone"] = f"%{clean_term.replace(' ', '').replace('-', '')}%"
        
        query += " ORDER BY s.supplier_name LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def list_suppliers(
        db: Session,
        org_id: str,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get suppliers with optional search and pagination."""
        query = """
            SELECT s.*,
                   a.city as default_city,
                   a.state_name as default_state,
                   a.address_line1 as default_address,
                   a.pincode as default_pincode
            FROM parties.suppliers s
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'supplier' 
                AND a.entity_id = s.supplier_id 
                AND a.org_id = s.org_id 
                AND a.is_default = true
            )
            WHERE s.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if search:
            query += " AND LOWER(s.supplier_name) LIKE LOWER(:search)"
            params["search"] = f"%{search}%"
            
        query += " ORDER BY s.supplier_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_supplier_with_addresses(
        db: Session,
        org_id: str,
        supplier_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get supplier by ID with addresses."""
        result = db.execute(text("""
            SELECT s.*,
                   COALESCE(
                       json_agg(
                           json_build_object(
                               'address_id', a.address_id,
                               'address_type', a.address_type,
                               'address_line1', a.address_line1,
                               'address_line2', a.address_line2,
                               'city', a.city,
                               'state_code', a.state_code,
                               'state_name', a.state_name,
                               'pincode', a.pincode,
                               'is_default', a.is_default
                           ) ORDER BY a.is_default DESC
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
        
        row = result.fetchone()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def count_suppliers(db: Session, org_id: str) -> int:
        """Count total suppliers for an org."""
        result = db.execute(text("""
            SELECT COUNT(*) FROM parties.suppliers WHERE org_id = :org_id
        """), {"org_id": org_id})
        return result.scalar() or 0
    
    @staticmethod
    def insert_supplier(
        db: Session,
        org_id: str,
        supplier_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Insert a new supplier. Returns created supplier info."""
        result = db.execute(text("""
            INSERT INTO parties.suppliers (
                org_id, supplier_code, supplier_name, supplier_type,
                gst_number, pan_number, drug_license_number, drug_license_validity,
                primary_phone, secondary_phone, primary_email, 
                contact_person_name, contact_person_phone,
                bank_name, account_number, ifsc_code, account_holder_name,
                payment_days, quality_rating, delivery_rating, compliance_rating,
                internal_notes, is_active, created_at, updated_at
            ) VALUES (
                :org_id, :supplier_code, :supplier_name, :supplier_type,
                :gst_number, :pan_number, :drug_license_number, :drug_license_validity,
                :primary_phone, :secondary_phone, :primary_email,
                :contact_person_name, :contact_person_phone,
                :bank_name, :account_number, :ifsc_code, :account_holder_name,
                :payment_days, :quality_rating, :delivery_rating, :compliance_rating,
                :internal_notes, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING supplier_id, supplier_code, supplier_name, created_at
        """), {"org_id": org_id, **supplier_data})
        
        row = result.fetchone()
        return dict(row._mapping) if row else {}
    
    @staticmethod
    def insert_address(
        db: Session,
        org_id: str,
        entity_type: str,
        entity_id: int,
        address_data: Dict[str, Any]
    ) -> None:
        """Insert an address for a supplier."""
        db.execute(text("""
            INSERT INTO master.addresses (
                org_id, entity_type, entity_id, address_type,
                address_line1, address_line2, city, state_code, state_name, pincode,
                country, is_default, is_active, created_at
            ) VALUES (
                :org_id, :entity_type, :entity_id, 'registered',
                :address_line1, :address_line2, :city, :state_code, :state_name, :pincode,
                'India', true, true, CURRENT_TIMESTAMP
            )
        """), {
            "org_id": org_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            **address_data
        })
    
    @staticmethod
    def supplier_exists(db: Session, org_id: str, supplier_id: int) -> bool:
        """Check if a supplier exists."""
        result = db.execute(text("""
            SELECT 1 FROM parties.suppliers WHERE supplier_id = :supplier_id AND org_id = :org_id
        """), {"supplier_id": supplier_id, "org_id": org_id})
        return result.scalar() is not None
    
    @staticmethod
    def update_supplier_dynamic(
        db: Session,
        supplier_id: int,
        org_id: str,
        update_fields: List[str],
        params: Dict[str, Any]
    ) -> None:
        """Update supplier with dynamic fields."""
        if not update_fields:
            return
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        query = f"""
            UPDATE parties.suppliers
            SET {', '.join(update_fields)}
            WHERE supplier_id = :supplier_id AND org_id = :org_id
        """
        db.execute(text(query), {**params, "supplier_id": supplier_id, "org_id": org_id})
    
    @staticmethod
    def soft_delete_supplier(db: Session, supplier_id: int, org_id: str) -> None:
        """Soft delete a supplier by marking inactive."""
        db.execute(text("""
            UPDATE parties.suppliers
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE supplier_id = :supplier_id AND org_id = :org_id
        """), {"supplier_id": supplier_id, "org_id": org_id})
    
    @staticmethod
    def get_supplier_products(
        db: Session,
        org_id: str,
        supplier_id: int
    ) -> List[Dict[str, Any]]:
        """Get products from a specific supplier."""
        result = db.execute(text("""
            SELECT p.* FROM inventory.products p
            JOIN procurement.purchase_orders pur ON p.product_id = pur.product_id AND p.org_id = pur.org_id
            WHERE pur.supplier_id = :supplier_id AND p.org_id = :org_id
            GROUP BY p.product_id
            ORDER BY p.product_name
        """), {"supplier_id": supplier_id, "org_id": org_id})
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_supplier_purchases(
        db: Session,
        org_id: str,
        supplier_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get purchase history for a supplier."""
        result = db.execute(text("""
            SELECT * FROM procurement.purchase_orders
            WHERE supplier_id = :supplier_id AND org_id = :org_id
            ORDER BY po_date DESC
            LIMIT :limit OFFSET :skip
        """), {"supplier_id": supplier_id, "org_id": org_id, "limit": limit, "skip": skip})
        
        return [dict(row._mapping) for row in result]
