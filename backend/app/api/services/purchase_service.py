"""
Purchase service layer for business logic
Handles purchase order creation, supplier invoices, and goods receipt
Shared across Purchase API and other procurement modules
"""
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from .product_service import ProductService
from .inventory_service import InventoryService
from .document_number_service import DocumentNumberService
from ...core.constants import (
    POStatus, GRNStatus, InvoicePaymentStatus, SupplierInvoiceStatus
)

logger = logging.getLogger(__name__)


class PurchaseService:
    """
    Service class for purchase-related business logic
    Follows InventoryService pattern with static methods
    """
    
    @staticmethod
    def resolve_user_and_branch(
        db: Session,
        org_id: str,
        user_id: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> Tuple[int, int]:
        """
        Resolve user_id and branch_id with proper fallbacks.
        Raises ValueError if no valid user/branch found.
        """
        # Resolve user_id
        resolved_user_id = user_id
        if not resolved_user_id:
            user_result = db.execute(text("""
                SELECT user_id FROM master.org_users 
                WHERE org_id = :org_id AND is_active = true
                ORDER BY user_id LIMIT 1
            """), {"org_id": org_id}).fetchone()
            if not user_result:
                raise ValueError(f"No active user found for org {org_id}")
            resolved_user_id = user_result.user_id
        
        # Resolve branch_id
        resolved_branch_id = branch_id
        if resolved_branch_id is None:
            result = db.execute(text("""
                SELECT branch_id FROM master.org_branches 
                WHERE org_id = :org_id AND is_active = true
                ORDER BY branch_id LIMIT 1
            """), {"org_id": org_id}).fetchone()
            if not result:
                raise ValueError(f"No active branch found for org {org_id}")
            resolved_branch_id = result.branch_id
        
        return resolved_user_id, resolved_branch_id
    
    @staticmethod
    def generate_purchase_number(db: Session, org_id: str) -> str:
        """Generate purchase order number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "purchase_order", org_id)
    
    @staticmethod
    def generate_invoice_number(db: Session, org_id: str) -> str:
        """Generate supplier invoice number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "supplier_invoice", org_id)
    
    @staticmethod
    def generate_grn_number(db: Session, org_id: str) -> str:
        """Generate GRN number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "grn", org_id)
    
    @staticmethod
    def create_purchase_order(
        db: Session,
        org_id: str,
        purchase_data: Dict[str, Any],
        user_id: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> int:
        """
        Create a purchase order with items.
        
        Args:
            db: Database session
            org_id: Organization ID
            purchase_data: Purchase order data including items
            user_id: User creating the PO
            branch_id: Branch for the PO
        
        Returns:
            purchase_order_id
        """
        try:
            # Resolve user and branch
            created_by, resolved_branch = PurchaseService.resolve_user_and_branch(
                db, org_id, user_id, branch_id
            )
            
            # Generate PO number
            po_number = purchase_data.get("po_number")
            if not po_number:
                po_number = PurchaseService.generate_purchase_number(db, org_id)
            
            # Create purchase order
            result = db.execute(text("""
                INSERT INTO procurement.purchase_orders (
                    org_id, branch_id, po_number, po_date,
                    supplier_id, supplier_name, expected_delivery_date,
                    po_status, notes, created_by, created_at
                ) VALUES (
                    :org_id, :branch_id, :po_number, :po_date,
                    :supplier_id, :supplier_name, :expected_delivery_date,
                    :po_status, :notes, :created_by, CURRENT_TIMESTAMP
                ) RETURNING purchase_order_id
            """), {
                "org_id": org_id,
                "branch_id": resolved_branch,
                "po_number": po_number,
                "po_date": purchase_data.get("po_date", date.today()),
                "supplier_id": purchase_data.get("supplier_id"),
                "supplier_name": purchase_data.get("supplier_name"),
                "expected_delivery_date": purchase_data.get("expected_delivery_date"),
                "notes": purchase_data.get("notes"),
                "created_by": created_by,
                "po_status": POStatus.PENDING.value
            })
            
            purchase_order_id = result.scalar()
            logger.info(f"Created purchase order {po_number} (ID: {purchase_order_id})")
            
            return purchase_order_id
            
        except Exception as e:
            logger.error(f"Error creating purchase order: {str(e)}")
            raise
    
    @staticmethod
    def create_supplier_invoice(
        db: Session,
        org_id: str,
        invoice_data: Dict[str, Any],
        user_id: Optional[int] = None,
        branch_id: Optional[int] = None
    ) -> int:
        """
        Create a supplier invoice.
        
        Args:
            db: Database session
            org_id: Organization ID
            invoice_data: Invoice data including items
            user_id: User creating the invoice
            branch_id: Branch for the invoice
        
        Returns:
            supplier_invoice_id
        """
        try:
            # Resolve user and branch
            created_by, resolved_branch = PurchaseService.resolve_user_and_branch(
                db, org_id, user_id, branch_id
            )
            
            # Generate invoice number if not provided
            invoice_number = invoice_data.get("invoice_number")
            if not invoice_number:
                invoice_number = PurchaseService.generate_invoice_number(db, org_id)
            
            # Create supplier invoice
            result = db.execute(text("""
                INSERT INTO procurement.supplier_invoices (
                    org_id, branch_id, invoice_number, invoice_date,
                    supplier_id, po_id, due_date,
                    subtotal, tax_amount, total_amount,
                    payment_status, notes, created_by, created_at
                ) VALUES (
                    :org_id, :branch_id, :invoice_number, :invoice_date,
                    :supplier_id, :po_id, :due_date,
                    :subtotal, :tax_amount, :total_amount,
                    :payment_status, :notes, :created_by, CURRENT_TIMESTAMP
                ) RETURNING supplier_invoice_id
            """), {
                "org_id": org_id,
                "branch_id": resolved_branch,
                "invoice_number": invoice_number,
                "invoice_date": invoice_data.get("invoice_date", date.today()),
                "supplier_id": invoice_data.get("supplier_id"),
                "po_id": invoice_data.get("po_id"),
                "due_date": invoice_data.get("due_date"),
                "subtotal": invoice_data.get("subtotal", 0),
                "tax_amount": invoice_data.get("tax_amount", 0),
                "total_amount": invoice_data.get("total_amount", 0),
                "notes": invoice_data.get("notes"),
                "created_by": created_by,
                "payment_status": InvoicePaymentStatus.UNPAID.value
            })
            
            invoice_id = result.scalar()
            logger.info(f"Created supplier invoice {invoice_number} (ID: {invoice_id})")
            
            return invoice_id
            
        except Exception as e:
            logger.error(f"Error creating supplier invoice: {str(e)}")
            raise
    
    @staticmethod
    def receive_purchase_items(
        db: Session,
        purchase_id: int,
        org_id: str,
        items: List[Dict[str, Any]],
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Receive items from a purchase order.
        Creates batches and updates inventory using InventoryService.
        
        Args:
            db: Database session
            purchase_id: Purchase order ID
            org_id: Organization ID
            items: List of items to receive with quantities
            user_id: User performing the receipt
        
        Returns:
            Receipt summary with batch count
        """
        try:
            # Get purchase details
            purchase = db.execute(text("""
                SELECT * FROM procurement.purchase_orders 
                WHERE purchase_order_id = :id AND org_id = :org_id
            """), {"id": purchase_id, "org_id": org_id}).first()
            
            if not purchase:
                raise ValueError(f"Purchase order {purchase_id} not found")
            
            if purchase.po_status == POStatus.RECEIVED.value:
                raise ValueError("Purchase already received")
            
            batches_created = 0
            
            for item in items:
                received_qty = item.get("received_quantity", 0)
                if received_qty <= 0:
                    continue
                
                # Get purchase item details
                pi = db.execute(text("""
                    SELECT * FROM procurement.purchase_order_items
                    WHERE po_item_id = :item_id
                        AND po_id = :purchase_id
                        AND org_id = :org_id
                """), {
                    "item_id": item.get("po_item_id"),
                    "purchase_id": purchase_id,
                    "org_id": org_id
                }).first()
                
                if not pi:
                    continue
                
                # Create batch using InventoryService
                from ..schemas.inventory import BatchCreate
                
                batch_data = BatchCreate(
                    org_id=org_id,
                    product_id=pi.product_id,
                    batch_number=item.get("batch_number", pi.batch_number),
                    manufacturing_date=item.get("manufacturing_date", pi.manufacturing_date),
                    expiry_date=item.get("expiry_date", pi.expiry_date),
                    quantity_received=received_qty,
                    quantity_available=received_qty,
                    cost_price=pi.cost_price,
                    mrp=pi.mrp,
                    purchase_invoice_number=purchase.po_number
                )
                
                InventoryService.create_batch(db, batch_data)
                batches_created += 1
                
                # Update purchase item status
                db.execute(text("""
                    UPDATE procurement.purchase_order_items 
                    SET received_quantity = :received_qty,
                        item_status = 'received'
                    WHERE po_item_id = :item_id
                """), {
                    "received_qty": received_qty,
                    "item_id": item.get("po_item_id")
                })
            
            # Update purchase status
            grn_number = PurchaseService.generate_grn_number(db, org_id)
            db.execute(text("""
                UPDATE procurement.purchase_orders 
                SET po_status = :po_status,
                    grn_number = :grn_number,
                    grn_date = CURRENT_DATE
                WHERE purchase_order_id = :purchase_id
            """), {
                "grn_number": grn_number,
                "purchase_id": purchase_id,
                "po_status": POStatus.RECEIVED.value
            })
            
            db.commit()
            
            return {
                "message": "Purchase items received successfully",
                "batches_created": batches_created,
                "grn_number": grn_number
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error receiving purchase items: {str(e)}")
            raise
