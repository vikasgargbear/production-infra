"""
Supplier Invoice Repository - Data Access Layer
All SQL queries for supplier invoice operations
"""
from typing import Optional, Dict, Any, List
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class SupplierInvoiceRepository:
    """Pure data access layer for supplier invoices - no business logic"""
    
    @staticmethod
    def create_invoice_header(
        db: Session,
        org_id: str,
        branch_id: int,
        invoice_data: Dict[str, Any],
        totals: Dict[str, Any],
        user_id: int
    ) -> int:
        """
        Create supplier invoice header record.
        
        Returns:
            supplier_invoice_id
        """
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
            "supplier_invoice_number": invoice_data.get("supplier_invoice_number"),
            "invoice_date": invoice_data.get("invoice_date", date.today()),
            "supplier_id": invoice_data.get("supplier_id"),
            "purchase_order_ids": invoice_data.get("purchase_order_ids"),
            "grn_ids": invoice_data.get("grn_ids"),
            "subtotal_amount": Decimal(str(totals['subtotal_amount'])),
            "discount_amount": Decimal(str(totals['discount_amount'])),
            "taxable_amount": Decimal(str(totals['taxable_amount'])),
            "cgst_amount": Decimal(str(totals['cgst_amount'])),
            "sgst_amount": Decimal(str(totals['sgst_amount'])),
            "igst_amount": Decimal(str(totals['igst_amount'])),
            "cess_amount": Decimal(str(invoice_data.get("cess_amount", 0))),
            "tax_amount": Decimal(str(totals['tax_amount'])),
            "freight_charges": Decimal(str(totals['freight_charges'])),
            "insurance_charges": Decimal(str(totals.get('insurance_charges', 0))),
            "other_charges": Decimal(str(totals['other_charges'])),
            "round_off_amount": Decimal(str(totals['round_off_amount'])),
            "invoice_total": Decimal(str(totals['invoice_total'])),
            "tds_applicable": totals.get('tds_percent', 0) > 0,
            "tds_percent": Decimal(str(totals.get('tds_percent', 0))),
            "tds_amount": Decimal(str(totals.get('tds_amount', 0))),
            "payment_terms": invoice_data.get("payment_terms", "immediate"),
            "due_date": invoice_data.get("due_date"),
            "payment_status": invoice_data.get("payment_status", "unpaid"),
            "invoice_status": invoice_data.get("invoice_status", "pending"),
            "notes": invoice_data.get("notes"),
            "created_by": user_id
        })
        
        return result.scalar()
    
    @staticmethod
    def create_invoice_item(
        db: Session,
        invoice_id: int,
        item: Dict[str, Any],
        calc_item: Dict[str, Any],
        batch_id: Optional[int] = None
    ) -> int:
        """Create a supplier invoice item. Returns invoice_item_id."""
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
            "igst_percent": Decimal('0'),
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
    def create_batch(
        db: Session,
        org_id: str,
        item: Dict[str, Any],
        calc_item: Dict[str, Any]
    ) -> Optional[int]:
        """Create inventory batch. Returns batch_id or None."""
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
    def get_invoice_by_id(db: Session, invoice_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """Get supplier invoice by ID."""
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
    def get_invoice_items(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get all items for a supplier invoice."""
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
        paid_amount: Optional[Decimal] = None
    ) -> None:
        """Update payment status of supplier invoice."""
        db.execute(text("""
            UPDATE procurement.supplier_invoices
            SET payment_status = :payment_status,
                paid_amount = COALESCE(:paid_amount, paid_amount),
                updated_at = CURRENT_TIMESTAMP
            WHERE supplier_invoice_id = :invoice_id
        """), {
            "invoice_id": invoice_id,
            "payment_status": payment_status,
            "paid_amount": paid_amount
        })
