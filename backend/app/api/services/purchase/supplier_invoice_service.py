"""
Supplier Invoice Service
Business logic for supplier invoices (purchase bills)
Follows same pattern as invoice_service.py from sales module
"""
from typing import Optional, Dict, Any, List
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from .calculations import PurchaseCalculator
from ..document_number_service import DocumentNumberService
from ....core.utils.constants import InvoicePaymentStatus, SupplierInvoiceStatus

logger = logging.getLogger(__name__)


class SupplierInvoiceService:
    """
    Service class for supplier invoice business logic
    Centralizes all supplier invoice operations
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
        Create a supplier invoice with items and optionally create batches
        
        Uses correct schema column names:
        - supplier_invoice_number (not invoice_number)
        - purchase_order_ids (ARRAY, not po_id)
        - subtotal_amount, taxable_amount, invoice_total
        
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
            
            # Calculate totals using PurchaseCalculator
            items = invoice_data.get("items", [])
            calc_result = PurchaseCalculator.calculate_supplier_invoice_totals(
                items=items,
                gst_type=invoice_data.get("gst_type", "CGST/SGST"),
                freight_charges=float(invoice_data.get("freight_charges", 0)),
                insurance_charges=float(invoice_data.get("insurance_charges", 0)),
                other_charges=float(invoice_data.get("other_charges", 0)),
                tds_percent=float(invoice_data.get("tds_percent", 0))
            )
            
            # Handle purchase_order_ids as array
            po_id = invoice_data.get("purchase_order_id") or invoice_data.get("po_id")
            purchase_order_ids = [po_id] if po_id else None
            
            # Insert supplier invoice - using correct column names
            result = db.execute(text("""
                INSERT INTO procurement.supplier_invoices (
                    org_id, branch_id, supplier_invoice_number, invoice_date,
                    supplier_id, purchase_order_ids, grn_ids,
                    subtotal_amount, discount_amount, taxable_amount,
                    cgst_amount, sgst_amount, igst_amount, cess_amount, tax_amount,
                    freight_charges, insurance_charges, other_charges,
                    round_off_amount, invoice_total,
                    tds_applicable, tds_percent, tds_amount,
                    payment_terms, due_date, payment_status,
                    invoice_status, notes, created_by
                ) VALUES (
                    :org_id, :branch_id, :supplier_invoice_number, :invoice_date,
                    :supplier_id, :purchase_order_ids, :grn_ids,
                    :subtotal_amount, :discount_amount, :taxable_amount,
                    :cgst_amount, :sgst_amount, :igst_amount, :cess_amount, :tax_amount,
                    :freight_charges, :insurance_charges, :other_charges,
                    :round_off_amount, :invoice_total,
                    :tds_applicable, :tds_percent, :tds_amount,
                    :payment_terms, :due_date, :payment_status,
                    :invoice_status, :notes, :created_by
                ) RETURNING supplier_invoice_id
            """), {
                "org_id": org_id,
                "branch_id": branch_id,
                "supplier_invoice_number": invoice_number,
                "invoice_date": invoice_data.get("invoice_date", date.today()),
                "supplier_id": invoice_data.get("supplier_id"),
                "purchase_order_ids": purchase_order_ids,
                "grn_ids": invoice_data.get("grn_ids"),
                "subtotal_amount": Decimal(str(calc_result['subtotal_amount'])),
                "discount_amount": Decimal(str(calc_result['discount_amount'])),
                "taxable_amount": Decimal(str(calc_result['taxable_amount'])),
                "cgst_amount": Decimal(str(calc_result['cgst_amount'])),
                "sgst_amount": Decimal(str(calc_result['sgst_amount'])),
                "igst_amount": Decimal(str(calc_result['igst_amount'])),
                "cess_amount": Decimal(str(invoice_data.get("cess_amount", 0))),
                "tax_amount": Decimal(str(calc_result['tax_amount'])),
                "freight_charges": Decimal(str(calc_result['freight_charges'])),
                "insurance_charges": Decimal(str(calc_result.get('insurance_charges', 0))),
                "other_charges": Decimal(str(calc_result['other_charges'])),
                "round_off_amount": Decimal(str(calc_result['round_off_amount'])),
                "invoice_total": Decimal(str(calc_result['invoice_total'])),
                "tds_applicable": calc_result.get('tds_percent', 0) > 0,
                "tds_percent": Decimal(str(calc_result.get('tds_percent', 0))),
                "tds_amount": Decimal(str(calc_result.get('tds_amount', 0))),
                "payment_terms": invoice_data.get("payment_terms", "immediate"),
                "due_date": invoice_data.get("due_date"),
                "payment_status": InvoicePaymentStatus.UNPAID.value if hasattr(InvoicePaymentStatus, 'UNPAID') else "unpaid",
                "invoice_status": invoice_data.get("invoice_status", "pending"),
                "notes": invoice_data.get("notes"),
                "created_by": user_id
            })
            
            invoice_id = result.scalar()
            
            # Create invoice items
            items_created = 0
            for idx, item in enumerate(items):
                # Use calculated values from PurchaseCalculator
                calc_item = calc_result['calculated_items'][idx] if idx < len(calc_result['calculated_items']) else {}
                
                SupplierInvoiceService._create_invoice_item(
                    db, invoice_id, item, calc_item, org_id
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
    def _create_invoice_item(
        db: Session,
        invoice_id: int,
        item: Dict[str, Any],
        calc_item: Dict[str, Any],
        org_id: str
    ) -> int:
        """
        Create a supplier invoice item, optionally with batch
        
        Returns:
            invoice_item_id
        """
        # Create batch if batch_number provided
        batch_id = item.get("batch_id")
        if not batch_id and item.get("batch_number") and item.get("product_id"):
            batch_id = SupplierInvoiceService._create_batch(db, org_id, item, calc_item)
        
        result = db.execute(text("""
            INSERT INTO procurement.supplier_invoice_items (
                supplier_invoice_id, product_id, batch_id,
                batch_number, quantity, free_quantity,
                unit_price, discount_percent, discount_amount,
                taxable_amount, cgst_percent, sgst_percent, igst_percent,
                cgst_amount, sgst_amount, igst_amount, total_amount,
                hsn_code, unit, pack_type, pack_size
            ) VALUES (
                :supplier_invoice_id, :product_id, :batch_id,
                :batch_number, :quantity, :free_quantity,
                :unit_price, :discount_percent, :discount_amount,
                :taxable_amount, :cgst_percent, :sgst_percent, :igst_percent,
                :cgst_amount, :sgst_amount, :igst_amount, :total_amount,
                :hsn_code, :unit, :pack_type, :pack_size
            ) RETURNING invoice_item_id
        """), {
            "supplier_invoice_id": invoice_id,
            "product_id": item.get("product_id"),
            "batch_id": batch_id,
            "batch_number": item.get("batch_number"),
            "quantity": Decimal(str(calc_item.get('quantity', item.get('quantity', 0)))),
            "free_quantity": Decimal(str(item.get("free_quantity", 0))),
            "unit_price": Decimal(str(calc_item.get('unit_price', item.get('unit_price', 0)))),
            "discount_percent": Decimal(str(calc_item.get('discount_percent', item.get('discount_percent', 0)))),
            "discount_amount": Decimal(str(calc_item.get('discount_amount', 0))),
            "taxable_amount": Decimal(str(calc_item.get('taxable_amount', 0))),
            "cgst_percent": Decimal(str(calc_item.get('tax_percent', item.get('tax_percent', 0)) / 2)),
            "sgst_percent": Decimal(str(calc_item.get('tax_percent', item.get('tax_percent', 0)) / 2)),
            "igst_percent": Decimal('0'),  # TODO: Support IGST
            "cgst_amount": Decimal(str(calc_item.get('cgst_amount', 0))),
            "sgst_amount": Decimal(str(calc_item.get('sgst_amount', 0))),
            "igst_amount": Decimal(str(calc_item.get('igst_amount', 0))),
            "total_amount": Decimal(str(calc_item.get('taxable_amount', 0) + calc_item.get('tax_amount', 0))),
            "hsn_code": item.get("hsn_code", "30049099"),
            "unit": item.get("uom") or item.get("unit", "NOS"),
            "pack_type": item.get("pack_type", "STRIP"),
            "pack_size": item.get("pack_size", 1)
        })
        
        return result.scalar()
    
    @staticmethod
    def _create_batch(
        db: Session,
        org_id: str,
        item: Dict[str, Any],
        calc_item: Dict[str, Any]
    ) -> Optional[int]:
        """
        Create inventory batch from invoice item
        
        Uses correct schema column names for inventory.batches
        """
        try:
            result = db.execute(text("""
                INSERT INTO inventory.batches (
                    org_id, product_id, batch_number, expiry_date,
                    mrp_per_unit, initial_quantity, quantity_available,
                    cost_per_unit, sale_price_per_unit,
                    source_type,
                    pack_size, pack_type, pack_uom, base_uom, units_per_pack,
                    batch_status, expiry_status,
                    created_at, updated_at
                ) VALUES (
                    :org_id, :product_id, :batch_number, :expiry_date,
                    :mrp_per_unit, :initial_quantity, :quantity_available,
                    :cost_per_unit, :sale_price_per_unit,
                    'purchase',
                    :pack_size, :pack_type, :pack_uom, :base_uom, :units_per_pack,
                    'active', 'normal',
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING batch_id
            """), {
                "org_id": org_id,
                "product_id": item.get("product_id"),
                "batch_number": item.get("batch_number"),
                "expiry_date": item.get("expiry_date"),
                "mrp_per_unit": Decimal(str(item.get("mrp", 0))),
                "initial_quantity": Decimal(str(calc_item.get('quantity', item.get('quantity', 0)))),
                "quantity_available": Decimal(str(calc_item.get('quantity', item.get('quantity', 0)))),
                "cost_per_unit": Decimal(str(calc_item.get('unit_price', item.get('unit_price', 0)))),
                "sale_price_per_unit": Decimal(str(item.get("selling_price", item.get("mrp", 0) * 0.9))),
                "pack_size": item.get("pack_size", 1),
                "pack_type": item.get("pack_type", "STRIP"),
                "pack_uom": item.get("pack_uom", "STRIP"),
                "base_uom": item.get("base_uom", "NOS"),
                "units_per_pack": item.get("units_per_pack", 1)
            })
            
            return result.scalar()
            
        except Exception as e:
            logger.warning(f"Could not create batch: {e}")
            return None
    
    @staticmethod
    def get_invoice_by_id(
        db: Session,
        invoice_id: int,
        org_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get supplier invoice by ID"""
        result = db.execute(text("""
            SELECT si.*, s.supplier_name, s.gst_number as supplier_gstin
            FROM procurement.supplier_invoices si
            LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
            WHERE si.supplier_invoice_id = :invoice_id AND si.org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": org_id}).first()
        
        if not result:
            return None
        
        return dict(result._mapping)
    
    @staticmethod
    def get_invoice_items(
        db: Session,
        invoice_id: int
    ) -> List[Dict[str, Any]]:
        """Get all items for a supplier invoice"""
        result = db.execute(text("""
            SELECT sii.*, p.product_name, p.hsn_code as product_hsn,
                   b.expiry_date, b.mrp_per_unit
            FROM procurement.supplier_invoice_items sii
            JOIN inventory.products p ON sii.product_id = p.product_id
            LEFT JOIN inventory.batches b ON sii.batch_id = b.batch_id
            WHERE sii.supplier_invoice_id = :invoice_id
            ORDER BY sii.invoice_item_id
        """), {"invoice_id": invoice_id})
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def update_payment_status(
        db: Session,
        invoice_id: int,
        payment_status: str,
        paid_amount: Optional[float] = None
    ) -> Dict[str, Any]:
        """Update payment status of supplier invoice"""
        db.execute(text("""
            UPDATE procurement.supplier_invoices
            SET payment_status = :payment_status,
                paid_amount = COALESCE(:paid_amount, paid_amount),
                updated_at = CURRENT_TIMESTAMP
            WHERE supplier_invoice_id = :invoice_id
        """), {
            "invoice_id": invoice_id,
            "payment_status": payment_status,
            "paid_amount": Decimal(str(paid_amount)) if paid_amount else None
        })
        
        return {"message": "Payment status updated", "invoice_id": invoice_id}
