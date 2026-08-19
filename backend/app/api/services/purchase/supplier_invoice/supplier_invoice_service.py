"""
Supplier Invoice Service
Business logic for supplier invoices (purchase bills)
Uses SupplierInvoiceRepository for data access
"""
from typing import Optional, Dict, Any, List
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
import logging

from .supplier_invoice_repository import SupplierInvoiceRepository
from ..calculations import PurchaseCalculator
from ...document_number_service import DocumentNumberService
from .....core.utils.constants import InvoicePaymentStatus, SupplierInvoiceStatus
from ...compliance.gst_service import GSTService

logger = logging.getLogger(__name__)


class SupplierInvoiceService:
    """
    Service class for supplier invoice business logic.
    Uses SupplierInvoiceRepository for all data access.
    """
    
    @staticmethod
    def generate_invoice_number(db: Session, org_id: str) -> str:
        """Generate supplier invoice number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "supplier_invoice", org_id)
    
    @staticmethod
    def create_supplier_invoice(
        db: Session,
        org_id: str,
        branch_id: int,
        invoice_data: Dict[str, Any],
        user_id: int
    ) -> Dict[str, Any]:
        """
        Create a supplier invoice with items and optionally create batches.
        
        Args:
            db: Database session
            org_id: Organization ID
            branch_id: Branch ID
            invoice_data: Invoice data including items
            user_id: User creating the invoice
            
        Returns:
            Dict with invoice_id, invoice_number, items_created
        """
        try:
            # Generate invoice number if not provided
            invoice_number = invoice_data.get("supplier_invoice_number") or invoice_data.get("invoice_number")
            if not invoice_number:
                invoice_number = SupplierInvoiceService.generate_invoice_number(db, org_id)
            
            # Determine GST type from GSTIN state codes
            supplier_id = invoice_data.get("supplier_id")
            gst_type = GSTService.determine_gst_type(
                db=db,
                org_id=org_id,
                branch_id=branch_id,
                supplier_id=int(supplier_id) if supplier_id else None
            ) if supplier_id else invoice_data.get("gst_type", "CGST/SGST")
            logger.info(f"GST type determined for supplier invoice: {gst_type}")

            # Strip pre-calculated tax values to force backend recalculation
            items = invoice_data.get("items", [])
            for item in items:
                item.pop('line_total', None)
                item.pop('cgst_amount', None)
                item.pop('sgst_amount', None)
                item.pop('igst_amount', None)
                item.pop('total_tax', None)
                item.pop('total_tax_amount', None)

            # Calculate totals using PurchaseCalculator
            calc_result = PurchaseCalculator.calculate_supplier_invoice_totals(
                items=items,
                gst_type=gst_type,
                freight_charges=float(invoice_data.get("freight_charges", 0)),
                insurance_charges=float(invoice_data.get("insurance_charges", 0)),
                other_charges=float(invoice_data.get("other_charges", 0)),
                tds_percent=float(invoice_data.get("tds_percent", 0))
            )
            
            # Handle purchase_order_ids as array
            po_id = invoice_data.get("purchase_order_id") or invoice_data.get("po_id")
            invoice_data["purchase_order_ids"] = [po_id] if po_id else None
            invoice_data["supplier_invoice_number"] = invoice_number
            invoice_data["payment_status"] = InvoicePaymentStatus.UNPAID.value if hasattr(InvoicePaymentStatus, 'UNPAID') else "unpaid"
            
            # Create invoice header via repository
            invoice_id = SupplierInvoiceRepository.create_invoice_header(
                db, org_id, branch_id, invoice_data, calc_result, user_id,
                gst_type=gst_type
            )
            
            # Create invoice items
            items_created = 0
            for idx, item in enumerate(items):
                calc_item = calc_result['calculated_items'][idx] if idx < len(calc_result['calculated_items']) else {}
                
                # Create batch if needed
                batch_id = item.get("batch_id")
                if not batch_id and item.get("batch_number") and item.get("product_id"):
                    batch_id = SupplierInvoiceRepository.create_batch(db, org_id, item, calc_item)
                
                SupplierInvoiceRepository.create_invoice_item(
                    db, invoice_id, item, calc_item, batch_id
                )
                items_created += 1
            
            logger.info(f"Created supplier invoice {invoice_number} (ID: {invoice_id}) with {items_created} items")
            
            return {
                "supplier_invoice_id": invoice_id,
                "supplier_invoice_number": invoice_number,
                "items_created": items_created,
                "totals": calc_result
            }
            
        except Exception as e:
            logger.error(f"Error creating supplier invoice: {str(e)}")
            raise
    
    @staticmethod
    def get_invoice_by_id(db: Session, invoice_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """Get supplier invoice by ID."""
        return SupplierInvoiceRepository.get_invoice_by_id(db, invoice_id, org_id)
    
    @staticmethod
    def get_invoice_items(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get all items for a supplier invoice."""
        return SupplierInvoiceRepository.get_invoice_items(db, invoice_id)
    
    @staticmethod
    def update_payment_status(
        db: Session,
        invoice_id: int,
        payment_status: str,
        paid_amount: Optional[float] = None
    ) -> Dict[str, Any]:
        """Update payment status of supplier invoice."""
        SupplierInvoiceRepository.update_payment_status(
            db, invoice_id, payment_status,
            Decimal(str(paid_amount)) if paid_amount else None
        )
        
        return {"message": "Payment status updated", "invoice_id": invoice_id}
