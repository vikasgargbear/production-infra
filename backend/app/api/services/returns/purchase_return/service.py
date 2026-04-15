"""
Purchase Return Service
Handles database operations for purchase returns
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class PurchaseReturnService:
    """Service class for Purchase Return operations"""
    
    @staticmethod
    def get_returnable_items_from_invoice(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get returnable items from supplier invoice."""
        result = db.execute(text("""
            SELECT sii.invoice_item_id, sii.product_id, p.product_name, sii.batch_id, sii.batch_number,
                   sii.quantity as invoice_quantity, COALESCE(sii.quantity_returned, 0) as already_returned,
                   sii.quantity - COALESCE(sii.quantity_returned, 0) as returnable_quantity,
                   sii.unit_price, sii.discount_percent,
                   COALESCE(sii.cgst_percent, 0) + COALESCE(sii.sgst_percent, 0) + COALESCE(sii.igst_percent, 0) as tax_percent,
                   sii.total_amount, p.hsn_code, sii.unit, b.expiry_date, b.manufacturing_date
            FROM procurement.supplier_invoice_items sii
            JOIN inventory.products p ON sii.product_id = p.product_id
            LEFT JOIN inventory.batches b ON sii.batch_id = b.batch_id
            WHERE sii.supplier_invoice_id = :invoice_id
            AND sii.quantity - COALESCE(sii.quantity_returned, 0) > 0
            ORDER BY sii.invoice_item_id
        """), {"invoice_id": invoice_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_returnable_items_from_grn(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get returnable items from GRN linked to invoice."""
        result = db.execute(text("""
            SELECT gi.grn_item_id as invoice_item_id, gi.product_id, p.product_name,
                   NULL as batch_id, gi.batch_number,
                   gi.received_quantity as invoice_quantity,
                   COALESCE(gi.quantity_returned, 0) as already_returned,
                   gi.received_quantity - COALESCE(gi.quantity_returned, 0) as returnable_quantity,
                   gi.unit_price, 0 as discount_percent, 0 as tax_percent,
                   gi.received_quantity * gi.unit_price as total_amount,
                   p.hsn_code, gi.uom as unit, gi.expiry_date, gi.manufacturing_date
            FROM procurement.supplier_invoices si
            JOIN procurement.goods_receipt_notes grn ON si.grn_ids @> ARRAY[grn.grn_id]
            JOIN procurement.grn_items gi ON grn.grn_id = gi.grn_id
            JOIN inventory.products p ON gi.product_id = p.product_id
            WHERE si.supplier_invoice_id = :invoice_id
            AND gi.received_quantity - COALESCE(gi.quantity_returned, 0) > 0
            ORDER BY gi.grn_item_id
        """), {"invoice_id": invoice_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_supplier(db: Session, supplier_id: int) -> Optional[Dict[str, Any]]:
        """Get supplier details."""
        result = db.execute(text("""
            SELECT supplier_id, supplier_name, gst_number
            FROM parties.suppliers WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def create_purchase_return(db: Session, data: Dict[str, Any]) -> int:
        """Create purchase return header."""
        result = db.execute(text("""
            INSERT INTO procurement.purchase_returns (
                org_id, branch_id, return_number, return_date, return_type,
                supplier_invoice_id, grn_id, supplier_id, return_reason, detailed_reason,
                return_amount, tax_amount, total_amount, cgst_amount, sgst_amount, igst_amount,
                debit_note_number, debit_note_date, debit_note_status, gst_type, notes, created_by
            ) VALUES (
                :org_id, :branch_id, :return_number, :return_date, 'PURCHASE',
                :supplier_invoice_id, :grn_id, :supplier_id, :return_reason, :detailed_reason,
                :return_amount, :tax_amount, :total_amount, :cgst_amount, :sgst_amount, :igst_amount,
                :debit_note_number, CURRENT_DATE, :debit_note_status, :gst_type, :notes, :created_by
            ) RETURNING return_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def get_invoice_item_returnable(db: Session, invoice_item_id: int) -> Optional[Dict[str, Any]]:
        """Get invoice item returnable quantity."""
        result = db.execute(text("""
            SELECT sii.quantity as invoice_qty, COALESCE(sii.quantity_returned, 0) as already_returned
            FROM procurement.supplier_invoice_items sii WHERE sii.invoice_item_id = :invoice_item_id
        """), {"invoice_item_id": invoice_item_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_grn_item_returnable(db: Session, grn_item_id: int) -> Optional[Dict[str, Any]]:
        """Get GRN item returnable quantity."""
        result = db.execute(text("""
            SELECT gi.received_quantity as invoice_qty, COALESCE(gi.quantity_returned, 0) as already_returned
            FROM procurement.grn_items gi WHERE gi.grn_item_id = :grn_item_id
        """), {"grn_item_id": grn_item_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def insert_return_item(db: Session, data: Dict[str, Any]) -> None:
        """Insert purchase return item."""
        db.execute(text("""
            INSERT INTO procurement.purchase_return_items (
                return_id, grn_item_id, product_id, batch_id, batch_number,
                return_quantity, uom, damaged_quantity, saleable_quantity,
                unit_price, return_value, tax_amount, item_return_reason, disposition
            ) VALUES (
                :return_id, :grn_item_id, :product_id, :batch_id, :batch_number,
                :return_quantity, :uom, :damaged_quantity, :saleable_quantity,
                :unit_price, :return_value, :tax_amount, :item_return_reason, :disposition
            )
        """), data)
    
    @staticmethod
    def update_batch_stock_for_return(db: Session, batch_id: int, return_qty: float) -> None:
        """Update batch stock for return to supplier."""
        db.execute(text("""
            UPDATE inventory.batches 
            SET quantity_available = quantity_available - :return_qty,
                quantity_returned = COALESCE(quantity_returned, 0) + :return_qty,
                updated_at = CURRENT_TIMESTAMP
            WHERE batch_id = :batch_id AND quantity_available >= :return_qty
        """), {"return_qty": return_qty, "batch_id": batch_id})
    
    @staticmethod
    def list_purchase_returns(
        db: Session,
        skip: int = 0,
        limit: int = 25,
        supplier_id: int = None,
        from_date: str = None,
        to_date: str = None,
        org_id: str = None
    ) -> Dict[str, Any]:
        """List purchase returns with filters and pagination."""
        query = """
            SELECT 
                pr.return_id,
                pr.return_number,
                pr.return_date,
                pr.supplier_invoice_id,
                pr.grn_id,
                pr.supplier_id,
                pr.return_reason,
                pr.return_amount,
                pr.tax_amount,
                pr.total_amount,
                pr.debit_note_number,
                pr.debit_note_status,
                pr.notes,
                pr.created_at,
                s.supplier_name as party_name
            FROM procurement.purchase_returns pr
            LEFT JOIN parties.suppliers s ON pr.supplier_id = s.supplier_id AND s.org_id = pr.org_id
            WHERE pr.org_id = :org_id
        """
        params = {"skip": skip, "limit": limit, "org_id": org_id}
        count_conditions = ""
        
        if supplier_id:
            query += " AND pr.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
            count_conditions += " AND pr.supplier_id = :supplier_id"
        
        if from_date:
            query += " AND pr.return_date >= :from_date"
            params["from_date"] = from_date
            count_conditions += " AND pr.return_date >= :from_date"
        
        if to_date:
            query += " AND pr.return_date <= :to_date"
            params["to_date"] = to_date
            count_conditions += " AND pr.return_date <= :to_date"
        
        query += """
            ORDER BY pr.return_date DESC, pr.created_at DESC
            LIMIT :limit OFFSET :skip
        """
        
        returns = db.execute(text(query), params).fetchall()
        
        # Get item counts in separate queries to avoid TenantAwareSession subquery issues
        return_ids = [ret.return_id for ret in returns]
        item_counts = {}
        if return_ids:
            for rid in return_ids:
                count_result = db.execute(
                    text("SELECT COUNT(*) FROM procurement.purchase_return_items WHERE return_id = :rid"),
                    {"rid": rid}
                ).scalar()
                item_counts[rid] = count_result or 0
        
        result = []
        for ret in returns:
            result.append({
                "return_id": ret.return_id,
                "return_number": ret.return_number,
                "return_date": ret.return_date,
                "supplier_invoice_id": ret.supplier_invoice_id,
                "grn_id": ret.grn_id,
                "supplier_id": ret.supplier_id,
                "party_name": ret.party_name,
                "return_reason": ret.return_reason,
                "return_amount": ret.return_amount,
                "tax_amount": ret.tax_amount,
                "total_amount": ret.total_amount,
                "debit_note_number": ret.debit_note_number,
                "debit_note_status": ret.debit_note_status,
                "notes": ret.notes,
                "created_at": ret.created_at,
                "item_count": item_counts.get(ret.return_id, 0)
            })
        
        count_query = f"SELECT COUNT(*) FROM procurement.purchase_returns pr WHERE pr.org_id = :org_id{count_conditions}"
        total = db.execute(text(count_query), params).scalar()
        
        return {"total": total, "returns": result}
    
    @staticmethod
    def get_purchase_return_detail(db: Session, return_id: int, org_id: str = None) -> Optional[Dict[str, Any]]:
        """Get detailed purchase return with items."""
        purchase_return = db.execute(text("""
            SELECT pr.*, s.supplier_name as party_name, s.gst_number as party_gst
            FROM procurement.purchase_returns pr
            LEFT JOIN parties.suppliers s ON pr.supplier_id = s.supplier_id AND s.org_id = pr.org_id
            WHERE pr.org_id = :org_id AND pr.return_id = :return_id
        """), {"return_id": return_id, "org_id": org_id}).first()
        
        if not purchase_return:
            return None
        
        items = db.execute(text("""
            SELECT pri.*, p.product_name, p.hsn_code
            FROM procurement.purchase_return_items pri
            LEFT JOIN inventory.products p ON pri.product_id = p.product_id
            WHERE pri.return_id = :return_id
        """), {"return_id": return_id}).fetchall()
        
        result = dict(purchase_return._mapping)
        result["items"] = [dict(item._mapping) for item in items]

        return result

    @staticmethod
    def get_purchase_return_status(db: Session, return_id: int) -> Optional[Dict[str, Any]]:
        """Get purchase return status for cancel validation."""
        result = db.execute(text("""
            SELECT return_id, return_number, approval_status, debit_note_number
            FROM procurement.purchase_returns
            WHERE return_id = :return_id
        """), {"return_id": return_id}).first()

        if result:
            return dict(result._mapping)
        return None

    @staticmethod
    def cancel_purchase_return(
        db: Session,
        return_id: int,
        return_number: str = None,
        org_id: str = None
    ) -> Dict[str, Any]:
        """
        Cancel purchase return and reverse all side effects:
        1. Reverse batch stock (re-add qty_available, reduce qty_returned) for RETURN_TO_SUPPLIER items
        2. Delete inventory movements
        3. Void supplier outstanding entry for debit note
        4. Mark return as cancelled
        """
        # Get return items for batch reversal
        items = db.execute(
            text("SELECT * FROM procurement.purchase_return_items WHERE return_id = :return_id"),
            {"return_id": return_id}
        ).fetchall()

        movement_rows = db.execute(text("""
            SELECT product_id, batch_id, location_id, COALESCE(SUM(quantity), 0) AS quantity
            FROM inventory.inventory_movements
            WHERE reference_id = :return_id
              AND reference_type = 'PURCHASE_RETURN'
              AND movement_direction = 'out'
            GROUP BY product_id, batch_id, location_id
        """), {"return_id": return_id}).fetchall()

        # 1. Reverse batch stock (only RETURN_TO_SUPPLIER items had qty deducted)
        for item in items:
            return_qty = float(item.return_quantity or 0)

            if item.grn_item_id:
                db.execute(text("""
                    UPDATE procurement.grn_items
                    SET quantity_returned = GREATEST(0, COALESCE(quantity_returned, 0) - :return_qty)
                    WHERE grn_item_id = :grn_item_id
                """), {
                    "return_qty": return_qty,
                    "grn_item_id": item.grn_item_id,
                })

            if item.product_id:
                db.execute(text("""
                    UPDATE procurement.supplier_invoice_items sii
                    SET quantity_returned = GREATEST(0, COALESCE(sii.quantity_returned, 0) - :return_qty),
                        updated_at = CURRENT_TIMESTAMP
                    FROM procurement.purchase_returns pr
                    WHERE pr.return_id = :return_id
                      AND sii.supplier_invoice_id = pr.supplier_invoice_id
                      AND sii.product_id = :product_id
                      AND (
                        COALESCE(sii.batch_id, 0) = COALESCE(:batch_id, 0)
                        OR (sii.batch_id IS NULL AND sii.batch_number = :batch_number)
                      )
                """), {
                    "return_id": return_id,
                    "return_qty": return_qty,
                    "product_id": item.product_id,
                    "batch_id": item.batch_id,
                    "batch_number": item.batch_number,
                })

            if item.batch_id and item.disposition == "RETURN_TO_SUPPLIER":
                db.execute(text("""
                    UPDATE inventory.batches
                    SET quantity_available = quantity_available + :return_qty,
                        quantity_returned = GREATEST(0, COALESCE(quantity_returned, 0) - :return_qty),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                """), {
                    "return_qty": return_qty,
                    "batch_id": item.batch_id
                })

        # 2. Reverse location-wise stock using the recorded movements
        for movement in movement_rows:
            if not movement.batch_id or not movement.location_id or not movement.product_id:
                continue

            update_result = db.execute(text("""
                UPDATE inventory.location_wise_stock
                SET quantity_available = quantity_available + :quantity,
                    last_movement_date = CURRENT_DATE,
                    last_updated = CURRENT_TIMESTAMP
                WHERE batch_id = :batch_id
                  AND location_id = :location_id
                  AND product_id = :product_id
                  AND org_id = :org_id
            """), {
                "quantity": float(movement.quantity or 0),
                "batch_id": movement.batch_id,
                "location_id": movement.location_id,
                "product_id": movement.product_id,
                "org_id": org_id,
            })

            if update_result.rowcount == 0:
                db.execute(text("""
                    INSERT INTO inventory.location_wise_stock (
                        org_id,
                        location_id,
                        product_id,
                        batch_id,
                        quantity_available,
                        quantity_reserved,
                        last_movement_date
                    ) VALUES (
                        :org_id,
                        :location_id,
                        :product_id,
                        :batch_id,
                        :quantity,
                        0,
                        CURRENT_DATE
                    )
                """), {
                    "org_id": org_id,
                    "location_id": movement.location_id,
                    "product_id": movement.product_id,
                    "batch_id": movement.batch_id,
                    "quantity": float(movement.quantity or 0),
                })

        # 3. Delete inventory movements for this purchase return
        db.execute(text("""
            DELETE FROM inventory.inventory_movements
            WHERE reference_id = :return_id
              AND reference_type = 'PURCHASE_RETURN'
        """), {"return_id": return_id})

        # 4. Void supplier outstanding entry and cancel debit note (if created)
        if org_id:
            debit_note = db.execute(text("""
                SELECT debit_note_id
                FROM financial.debit_notes
                WHERE org_id = :org_id
                  AND reference_type = 'PURCHASE_RETURN'
                  AND reference_id = :return_id
                ORDER BY debit_note_id DESC
                LIMIT 1
            """), {"return_id": return_id, "org_id": org_id}).first()

            if debit_note:
                db.execute(text("""
                    UPDATE financial.debit_notes
                    SET status = 'cancelled',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE debit_note_id = :debit_note_id
                """), {"debit_note_id": debit_note.debit_note_id})

                db.execute(text("""
                    UPDATE financial.supplier_outstanding
                    SET status = 'cancelled',
                        outstanding_amount = 0,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE document_type = 'debit_note'
                      AND document_id = :debit_note_id
                      AND org_id = :org_id
                """), {"debit_note_id": debit_note.debit_note_id, "org_id": org_id})

            db.execute(text("""
                UPDATE procurement.purchase_returns
                SET debit_note_status = 'cancelled',
                    updated_at = CURRENT_TIMESTAMP
                WHERE return_id = :return_id
            """), {"return_id": return_id})

        # 5. Mark return as cancelled
        db.execute(text("""
            UPDATE procurement.purchase_returns
            SET approval_status = 'cancelled',
                updated_at = CURRENT_TIMESTAMP
            WHERE return_id = :return_id
        """), {"return_id": return_id})

        return {"success": True, "return_number": return_number}
