"""
Purchase Order Service
Business logic for purchase orders
Uses PurchaseOrderRepository for data access
"""
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
import logging

from .order_repository import PurchaseOrderRepository
from ..calculations import PurchaseCalculator
from ...document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)


class PurchaseOrderService:
    """
    Service class for purchase order business logic.
    Uses PurchaseOrderRepository for all data access.
    """
    
    @staticmethod
    def generate_po_number(db: Session, org_id: str) -> str:
        """Generate PO number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "purchase_order", org_id)
    
    @staticmethod
    def create_purchase_order(
        db: Session,
        org_id: str,
        branch_id: int,
        order_data: Dict[str, Any],
        user_id: int
    ) -> Dict[str, Any]:
        """
        Create a purchase order with items.
        
        Args:
            db: Database session
            org_id: Organization ID
            branch_id: Branch ID
            order_data: Order data including items
            user_id: User creating the order
            
        Returns:
            Dict with order_id, po_number, items_created
        """
        try:
            # Generate PO number if not provided
            po_number = order_data.get("po_number")
            if not po_number:
                po_number = PurchaseOrderService.generate_po_number(db, org_id)
            
            order_data["po_number"] = po_number
            
            # Calculate totals using PurchaseCalculator
            items = order_data.get("items", [])
            calc_result = PurchaseCalculator.calculate_purchase_order_totals(
                items=items,
                gst_type=order_data.get("gst_type", "CGST/SGST")
            )
            
            # Create order header via repository
            order_id = PurchaseOrderRepository.create_order_header(
                db, org_id, branch_id, order_data, calc_result, user_id
            )
            
            # Create order items with calculated values
            items_created = 0
            for idx, item in enumerate(items):
                calc_item = calc_result.get('calculated_items', [])[idx] if idx < len(calc_result.get('calculated_items', [])) else {}
                
                # Merge calculated values into item
                item_with_calcs = {**item, **calc_item}
                
                PurchaseOrderRepository.create_order_item(
                    db, order_id, item_with_calcs, idx + 1
                )
                items_created += 1
            
            logger.info(f"Created purchase order {po_number} (ID: {order_id}) with {items_created} items")
            
            return {
                "purchase_order_id": order_id,
                "po_number": po_number,
                "items_created": items_created,
                "totals": calc_result
            }
            
        except Exception as e:
            logger.error(f"Error creating purchase order: {str(e)}")
            raise
    
    @staticmethod
    def get_order_by_id(db: Session, order_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """Get purchase order by ID."""
        return PurchaseOrderRepository.get_order_by_id(db, order_id, org_id)
    
    @staticmethod
    def get_order_items(db: Session, order_id: int) -> List[Dict[str, Any]]:
        """Get all items for a purchase order."""
        return PurchaseOrderRepository.get_order_items(db, order_id)
    
    @staticmethod
    def update_order_status(
        db: Session,
        order_id: int,
        po_status: Optional[str] = None,
        receipt_status: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update purchase order status."""
        PurchaseOrderRepository.update_order_status(db, order_id, po_status, receipt_status)
        return {"message": "Order status updated", "order_id": order_id}
    
    @staticmethod
    def list_orders(
        db: Session,
        org_id: str,
        skip: int = 0,
        limit: int = 25,
        search: Optional[str] = None,
        status: Optional[str] = None,
        supplier_id: Optional[int] = None,
        date_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        List purchase orders with filters and pagination.
        Delegates to repository for data access.
        """
        return PurchaseOrderRepository.list_orders(
            db, org_id, skip, limit, search, status, supplier_id, date_filter
        )
    
    @staticmethod
    def get_pending_receipts(
        db: Session,
        org_id: str,
        supplier_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get purchase orders pending receipt."""
        return PurchaseOrderRepository.get_pending_receipt_orders(db, org_id, supplier_id)
    
    @staticmethod
    def get_items_for_order(
        db: Session,
        purchase_id: int
    ) -> List[Dict[str, Any]]:
        """
        Get all items for a purchase order with product details.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT 
                pi.*,
                p.product_name as product_full_name,
                p.hsn_code,
                p.category_id,
                p.brand
            FROM procurement.purchase_order_items pi
            LEFT JOIN inventory.products p ON pi.product_id = p.product_id
            WHERE pi.purchase_order_id = :purchase_id
            ORDER BY pi.po_item_id
        """), {"purchase_id": purchase_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_supplier_name(db: Session, supplier_id: int, org_id: str) -> Optional[str]:
        """Get supplier name by ID."""
        result = db.execute(text("""
            SELECT supplier_name FROM parties.suppliers 
            WHERE supplier_id = :id AND org_id = :org_id
        """), {"id": supplier_id, "org_id": org_id}).first()
        return result.supplier_name if result else None
    
    @staticmethod
    def get_default_user(db: Session, org_id: str) -> Optional[int]:
        """Get default user for an org when context is missing."""
        result = db.execute(text("""
            SELECT user_id FROM master.org_users 
            WHERE org_id = :org_id AND is_active = true
            ORDER BY user_id LIMIT 1
        """), {"org_id": org_id}).first()
        return result.user_id if result else None
    
    @staticmethod
    def get_default_branch(db: Session, org_id: str) -> Optional[int]:
        """Get default branch for an org when context is missing."""
        result = db.execute(text("""
            SELECT branch_id FROM master.org_branches 
            WHERE org_id = :org_id AND is_active = true
            ORDER BY branch_id LIMIT 1
        """), {"org_id": org_id}).first()
        return result.branch_id if result else None
