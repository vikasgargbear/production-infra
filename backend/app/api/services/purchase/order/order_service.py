"""
Purchase Order Service
Business logic for purchase orders
Uses PurchaseOrderRepository for data access
"""
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from .order_repository import PurchaseOrderRepository
from ..calculations import PurchaseCalculator
from ...document_number_service import DocumentNumberService
from ...master.product.service import ProductService

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
    
    @staticmethod
    def create_direct_entry(
        db: Session,
        org_id: str,
        branch_id: int,
        purchase_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create direct purchase entry (bill entry) with items and batches.
        
        Args:
            db: Database session
            org_id: Organization ID
            branch_id: Branch ID
            purchase_data: Purchase data including items
            
        Returns:
            Dict with po_id, po_number, items_created, batches_created
        """
        from ...document_number_service import DocumentNumberService
        from datetime import datetime
        
        try:
            # Generate invoice number
            po_number = DocumentNumberService.generate_number(db, "supplier_invoice", org_id)
            
            # Prepare order data
            order_data = {
                "po_number": po_number,
                "po_date": purchase_data.get("purchase_date", datetime.now().date()),
                "supplier_id": purchase_data.get("supplier_id"),
                "supplier_name": purchase_data.get("supplier_name", "Direct Purchase"),
                "subtotal_amount": purchase_data.get("subtotal_amount", 0),
                "tax_amount": purchase_data.get("tax_amount", 0),
                "total_amount": purchase_data.get("total_amount", 0)
            }
            
            # Create header
            po_id = PurchaseOrderRepository.create_direct_order_header(
                db, org_id, branch_id, order_data
            )
            
            # Process items
            items = purchase_data.get("items", [])
            
            # Batch lookup for products
            product_names = [
                item.get("product_name") for item in items 
                if item.get("product_name") and not item.get("product_id")
            ]
            product_lookup = PurchaseOrderRepository.lookup_products_by_name(db, org_id, product_names)
            
            # Get default category
            default_category_id = PurchaseOrderRepository.get_default_category(db, org_id)
            if not default_category_id:
                default_category_id = PurchaseOrderRepository.create_category(db, org_id, "General")
            
            items_created = 0
            batches_created = 0
            
            for item in items:
                # Get or create product
                product_id = item.get("product_id")
                if not product_id and item.get("product_name"):
                    name_key = item["product_name"].lower().strip()
                    product_id = product_lookup.get(name_key)
                    
                    if not product_id:
                        product_id = ProductService.get_or_create_product(
                            db=db,
                            org_id=org_id,
                            product_name=item["product_name"],
                            hsn_code=item.get("hsn_code"),
                        )
                        product_lookup[name_key] = product_id
                
                item["product_id"] = product_id
                
                # Create order item
                PurchaseOrderRepository.create_direct_order_item(db, po_id, item)
                items_created += 1
                
                # Create batch for inventory
                if product_id:
                    batch_number = item.get("batch_number") or f"BATCH{po_number[-4:]}"
                    
                    # Check if batch exists
                    existing_batch = PurchaseOrderRepository.find_existing_batch(db, product_id, batch_number)
                    
                    if existing_batch:
                        PurchaseOrderRepository.update_batch_quantity(
                            db, existing_batch, item.get("quantity", 0)
                        )
                    else:
                        batch_data = {
                            "product_id": product_id,
                            "batch_number": batch_number,
                            "manufacturing_date": item.get("manufacturing_date") or item.get("mfg_date"),
                            "expiry_date": item.get("expiry_date") or item.get("exp_date"),
                            "quantity": item.get("quantity", 0),
                            "purchase_price": item.get("unit_price", 0),
                            "mrp": item.get("mrp", 0),
                            "sale_price": item.get("sale_price", 0) or item.get("mrp", 0)
                        }
                        PurchaseOrderRepository.create_batch(db, org_id, batch_data)
                        batches_created += 1
            
            logger.info(f"Created direct entry {po_number}: {items_created} items, {batches_created} batches")
            
            return {
                "purchase_order_id": po_id,
                "po_number": po_number,
                "items_created": items_created,
                "batches_created": batches_created
            }
            
        except Exception as e:
            logger.error(f"Error creating direct entry: {str(e)}")
            raise
    
    @staticmethod
    def create_supplier_invoice(
        db: Session,
        org_id: str,
        branch_id: int,
        invoice_data: Dict[str, Any],
        created_by: int
    ) -> int:
        """
        Create a supplier invoice record.
        Returns supplier_invoice_id.
        """

        
        result = db.execute(text("""
            INSERT INTO procurement.supplier_invoices (
                org_id, branch_id, supplier_invoice_number, invoice_date,
                supplier_id, 
                subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount, tax_amount,
                freight_charges, insurance_charges, other_charges,
                round_off_amount, invoice_total,
                payment_terms, due_date, payment_status,
                invoice_status, created_by
            ) VALUES (
                :org_id, :branch_id, :invoice_number, :invoice_date,
                :supplier_id,
                :subtotal, :discount, :taxable,
                :cgst, :sgst, :igst, :tax,
                :freight, :insurance, :other,
                :round_off, :total,
                :payment_terms, :due_date, :payment_status,
                :invoice_status, :created_by
            ) RETURNING supplier_invoice_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "invoice_number": invoice_data.get("invoice_number"),
            "invoice_date": invoice_data.get("invoice_date"),
            "supplier_id": invoice_data.get("supplier_id"),
            "subtotal": invoice_data.get("subtotal", 0),
            "discount": invoice_data.get("discount", 0),
            "taxable": invoice_data.get("taxable", 0),
            "cgst": invoice_data.get("cgst", 0),
            "sgst": invoice_data.get("sgst", 0),
            "igst": invoice_data.get("igst", 0),
            "tax": invoice_data.get("tax", 0),
            "freight": invoice_data.get("freight", 0),
            "insurance": invoice_data.get("insurance", 0),
            "other": invoice_data.get("other", 0),
            "round_off": invoice_data.get("round_off", 0),
            "total": invoice_data.get("total", 0),
            "payment_terms": invoice_data.get("payment_terms", "NET30"),
            "due_date": invoice_data.get("due_date"),
            "payment_status": invoice_data.get("payment_status", "pending"),
            "invoice_status": invoice_data.get("invoice_status", "draft"),
            "created_by": created_by
        })
        
        return result.scalar()
    
    @staticmethod
    def get_or_create_product(
        db: Session,
        org_id: str,
        product_name: str,
        category_name: Optional[str] = None
    ) -> int:
        """
        Get existing product by name or create new one.
        Delegates to centralized ProductService.
        Returns product_id.
        """
        return ProductService.get_or_create_product(
            db=db,
            org_id=org_id,
            product_name=product_name,
            hsn_code=None,
        )
    
    @staticmethod
    def receive_purchase_items(
        db: Session,
        purchase_id: int,
        items: List[Dict[str, Any]],
        org_id: str
    ) -> Dict[str, Any]:
        """
        Receive purchase order items (GRN creation).
        Creates batches from received items.
        
        Returns:
            Dict with batches_created count
        """
        batches_created = 0
        
        for item in items:
            product_id = item.get("product_id")
            batch_number = item.get("batch_number")
            quantity = item.get("received_quantity", item.get("quantity", 0))
            
            if not product_id or not quantity:
                continue
            
            # Check for existing batch
            existing_batch = PurchaseOrderRepository.find_existing_batch(
                db, product_id, batch_number
            ) if batch_number else None
            
            if existing_batch:
                PurchaseOrderRepository.update_batch_quantity(
                    db, existing_batch, quantity
                )
            else:
                batch_data = {
                    "product_id": product_id,
                    "batch_number": batch_number or f"BATCH{purchase_id}_{product_id}",
                    "manufacturing_date": item.get("manufacturing_date") or item.get("mfg_date"),
                    "expiry_date": item.get("expiry_date") or item.get("exp_date"),
                    "quantity": quantity,
                    "purchase_price": item.get("unit_price", 0),
                    "mrp": item.get("mrp", 0),
                    "sale_price": item.get("sale_price", 0) or item.get("mrp", 0)
                }
                PurchaseOrderRepository.create_batch(db, org_id, batch_data)
                batches_created += 1
        
        return {"batches_created": batches_created}
    
    @staticmethod
    def get_purchase_for_grn(
        db: Session,
        purchase_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get purchase order details for GRN processing.
        TenantAwareSession auto-filters by org_id.
        """

        
        result = db.execute(text("""
            SELECT 
                purchase_order_id, po_number, supplier_id, po_status, receipt_status
            FROM procurement.purchase_orders
            WHERE purchase_order_id = :id
        """), {"id": purchase_id}).fetchone()
        
        return dict(result._mapping) if result else None
    
    @staticmethod
    def update_grn_status(
        db: Session,
        purchase_id: int,
        po_status: str = "completed",
        receipt_status: str = "received"
    ) -> None:
        """
        Update purchase order status after GRN receipt.
        """

        
        db.execute(text("""
            UPDATE procurement.purchase_orders
            SET po_status = :po_status,
                receipt_status = :receipt_status,
                updated_at = CURRENT_TIMESTAMP
            WHERE purchase_order_id = :id
        """), {
            "id": purchase_id,
            "po_status": po_status,
            "receipt_status": receipt_status
        })
    
    @staticmethod
    def get_batch_count_for_purchase(
        db: Session,
        purchase_id: int
    ) -> int:
        """
        Get count of batches for a purchase order.
        """

        
        result = db.execute(text("""
            SELECT COUNT(*) FROM inventory.batches b
            WHERE b.source_document_id = :purchase_id
            AND b.source_document_type = 'purchase_order'
        """), {"purchase_id": purchase_id})
        
        return result.scalar() or 0

