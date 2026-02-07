"""
Return Service - Shared utilities for Sales and Purchase Returns

Provides DRY methods for:
- Tax resolution from source documents
- Batch ID resolution
- Inventory movement recording
- Return value calculations
"""
from typing import Optional, Tuple, Dict, Any
from decimal import Decimal
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

from ..inventory.inventory_service import InventoryService
from ...schemas.inventory.inventory import StockMovementCreate
from ....core.utils.constants import ReturnStatus, DispositionType
from ....core.utils.branch_utils import resolve_location_id

logger = logging.getLogger(__name__)

# Damaged/non-restockable reasons for inventory disposition decisions
# These match the frontend dropdown values exactly
# Quality Issue -> RESTOCK (customer complaint, product still sellable)
NON_RESTOCK_REASONS = [
    "expired product", "expired",
    "damaged product", "damaged", "broken",
    "contaminated", "manufacturing defect"
]



class ReturnService:
    """Shared service for sales and purchase returns processing"""
    
    @staticmethod
    def resolve_tax_from_sales_invoice(
        db: Session,
        invoice_item_id: int,
        provided_tax_percent: Optional[Decimal] = None,
        tax_percent_explicitly_provided: bool = False
    ) -> Tuple[Decimal, Decimal]:
        """
        Fetch tax and discount from original sales invoice if not explicitly provided.
        Respects frontend's explicit choice (e.g., tax_percent=0 means no GST return).
        
        Returns:
            Tuple of (tax_percent, discount_percent)
        """
        tax_percent = provided_tax_percent or Decimal("0")
        discount_percent = Decimal("0")
        
        if not invoice_item_id or tax_percent_explicitly_provided:
            return tax_percent, discount_percent
        
        try:
            result = db.execute(
                text("""
                    SELECT gst_percent, discount_percent
                    FROM sales.invoice_items
                    WHERE invoice_item_id = :invoice_item_id
                """),
                {"invoice_item_id": invoice_item_id}
            ).fetchone()
            
            if result:
                if result.gst_percent and tax_percent == 0:
                    tax_percent = Decimal(str(result.gst_percent))
                    logger.info(f"Fetched tax_percent {tax_percent}% from invoice item {invoice_item_id}")
                if result.discount_percent:
                    discount_percent = Decimal(str(result.discount_percent))
        except Exception as e:
            logger.warning(f"Could not fetch tax from invoice item {invoice_item_id}: {e}")
        
        return tax_percent, discount_percent
    
    @staticmethod
    def resolve_tax_from_supplier_invoice(
        db: Session,
        invoice_item_id: int,
        grn_item_id: Optional[int] = None,
        tax_percent_explicitly_provided: bool = False
    ) -> Decimal:
        """
        Fetch tax from supplier invoice or GRN if not explicitly provided.
        
        Returns:
            tax_percent as Decimal
        """
        if tax_percent_explicitly_provided:
            return Decimal("0")
        
        tax_percent = Decimal("0")
        
        try:
            # Try supplier invoice first
            if invoice_item_id:
                result = db.execute(
                    text("""
                        SELECT 
                            COALESCE(cgst_percent, 0) + COALESCE(sgst_percent, 0) + COALESCE(igst_percent, 0) as gst_percent
                        FROM procurement.supplier_invoice_items
                        WHERE invoice_item_id = :invoice_item_id
                    """),
                    {"invoice_item_id": invoice_item_id}
                ).fetchone()
                
                if result and result.gst_percent:
                    tax_percent = Decimal(str(result.gst_percent))
                    logger.info(f"Fetched tax_percent {tax_percent}% from supplier invoice item {invoice_item_id}")
                    return tax_percent
            
            # Fallback to GRN
            if grn_item_id:
                result = db.execute(
                    text("SELECT tax_percent FROM procurement.grn_items WHERE grn_item_id = :grn_item_id"),
                    {"grn_item_id": grn_item_id}
                ).fetchone()
                
                if result and result.tax_percent:
                    tax_percent = Decimal(str(result.tax_percent))
                    logger.info(f"Fetched tax_percent {tax_percent}% from GRN item {grn_item_id}")
        except Exception as e:
            logger.warning(f"Could not fetch tax from source document: {e}")
        
        return tax_percent
    
    @staticmethod
    def resolve_batch(
        db: Session,
        product_id: int,
        batch_number: Optional[str] = None,
        batch_id: Optional[int] = None,
        source_item_id: Optional[int] = None,
        source_type: str = "sales_invoice"  # or "grn"
    ) -> Tuple[Optional[int], Optional[str]]:
        """
        Resolve batch_id from batch_number, or fetch from source document.
        
        Returns:
            Tuple of (batch_id, batch_number)
        """
        # If we already have both, return
        if batch_id and batch_number:
            return batch_id, batch_number
        
        try:
            # Try to get from source document if we don't have batch info
            if source_item_id and not batch_number and not batch_id:
                if source_type == "sales_invoice":
                    result = db.execute(
                        text("""
                            SELECT batch_number, batch_id
                            FROM sales.invoice_items
                            WHERE invoice_item_id = :item_id
                        """),
                        {"item_id": source_item_id}
                    ).fetchone()
                elif source_type == "grn":
                    result = db.execute(
                        text("""
                            SELECT batch_number, batch_id
                            FROM procurement.grn_items
                            WHERE grn_item_id = :item_id
                        """),
                        {"item_id": source_item_id}
                    ).fetchone()
                else:
                    result = None
                
                if result:
                    batch_number = result.batch_number or getattr(result, '_mapping', {}).get('batch_number')
                    batch_id = result.batch_id or getattr(result, '_mapping', {}).get('batch_id')
            
            # If we have batch_number but no batch_id, look it up
            if batch_number and not batch_id:
                result = db.execute(
                    text("""
                        SELECT batch_id 
                        FROM inventory.batches 
                        WHERE batch_number = :batch_number 
                        AND product_id = :product_id
                        LIMIT 1
                    """),
                    {"batch_number": batch_number, "product_id": product_id}
                ).fetchone()
                
                if result:
                    batch_id = result.batch_id
        except Exception as e:
            logger.warning(f"Could not resolve batch for product {product_id}: {e}")
        
        return batch_id, batch_number
    
    @staticmethod
    def calculate_return_value(
        quantity: Decimal,
        unit_price: Decimal,
        discount_percent: Decimal = Decimal("0"),
        tax_percent: Decimal = Decimal("0")
    ) -> Dict[str, Decimal]:
        """
        Calculate return value components.
        
        Returns:
            Dict with base_value, discount_amount, return_value, tax_amount, total
        """
        base_value = round(quantity * unit_price, 2)
        discount_amount = round(base_value * discount_percent / 100, 2)
        return_value = round(base_value - discount_amount, 2)
        tax_amount = round(return_value * tax_percent / 100, 2)
        total = round(return_value + tax_amount, 2)

        return {
            "base_value": base_value,
            "discount_amount": discount_amount,
            "return_value": return_value,
            "tax_amount": tax_amount,
            "total": total
        }
    
    @staticmethod
    def record_inventory_movement(
        db: Session,
        org_id: str,
        product_id: int,
        batch_id: Optional[int],
        quantity: float,
        location_id: int,
        return_id: int,
        return_number: str,
        reason: str,
        created_by: int,
        movement_type: str = "return",
        reference_type: str = "sales_return"
    ) -> None:
        """Record inventory movement for returns using InventoryService."""
        movement_data = StockMovementCreate(
            org_id=org_id,
            product_id=product_id,
            batch_id=batch_id,
            movement_type=movement_type,
            quantity=Decimal(str(quantity)),
            reference_type=reference_type,
            reference_id=return_id,
            reference_number=return_number,
            location_id=location_id,
            reason=reason,
            notes=f"Return #{return_number}",
            created_by=created_by
        )
        InventoryService.record_stock_movement(db, movement_data)
    
    @staticmethod
    def determine_disposition(
        return_reason: str,
        explicit_restock: Optional[bool] = None,
        return_type: str = "sales"
    ) -> Tuple[str, bool]:
        """
        Determine item disposition based on reason, restock flag, and return type.
        Uses NON_RESTOCK_REASONS constant for consistency.

        Args:
            return_reason: The reason for return
            explicit_restock: Override restock decision (True/False/None)
            return_type: 'sales' or 'purchase' — determines non-damaged disposition

        Returns:
            Tuple of (disposition, is_damaged)
        """
        is_damaged = any(reason in return_reason.lower() for reason in NON_RESTOCK_REASONS)

        if explicit_restock is False or is_damaged:
            disposition = DispositionType.DESTROY.value if is_damaged else DispositionType.QUARANTINE.value
        elif return_type == "purchase":
            disposition = DispositionType.RETURN_TO_SUPPLIER.value
        else:
            disposition = DispositionType.RESTOCK.value

        return disposition, is_damaged

    @staticmethod
    def calculate_return_totals(
        items: list,
        gst_type: str = "CGST/SGST"
    ) -> Dict[str, Any]:
        """
        Calculate all return totals from items list.
        
        Args:
            items: List of item dicts with return_quantity/quantity, rate, discount_percent, tax_percent
            gst_type: CGST/SGST for intra-state, IGST for inter-state
            
        Returns:
            Dict with subtotal, tax_amount, cgst_amount, sgst_amount, igst_amount, total_amount
        """
        from ..compliance.gst_service import GSTService
        
        subtotal = Decimal("0")
        tax_amount = Decimal("0")
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        igst_amount = Decimal("0")
        total_amount = Decimal("0")
        total_return_quantity = Decimal("0")
        
        for item in items:
            # Handle both return_quantity and quantity field names
            qty = Decimal(str(item.get("return_quantity") or item.get("quantity", 0)))
            rate = Decimal(str(item.get("unit_price") or item.get("rate", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            
            # Calculate with discount
            base_amount = qty * rate
            discount_amount = (base_amount * discount_percent) / 100
            taxable_amount = base_amount - discount_amount
            
            # Use GSTService for consistent tax calculations
            gst_components = GSTService.calculate_gst_components(taxable_amount, tax_percent, gst_type)
            item_tax = gst_components["total_tax_amount"]
            item_cgst = gst_components["cgst_amount"]
            item_sgst = gst_components["sgst_amount"]
            item_igst = gst_components["igst_amount"]
            
            subtotal += taxable_amount
            tax_amount += item_tax
            cgst_amount += item_cgst
            sgst_amount += item_sgst
            igst_amount += item_igst
            total_amount += taxable_amount + item_tax
            total_return_quantity += qty
        
        return {
            "subtotal": round(subtotal, 2),
            "tax_amount": round(tax_amount, 2),
            "cgst_amount": round(cgst_amount, 2),
            "sgst_amount": round(sgst_amount, 2),
            "igst_amount": round(igst_amount, 2),
            "total_amount": round(total_amount, 2),
            "total_return_quantity": round(total_return_quantity, 2)
        }
    
    # ==================== READ OPERATIONS ====================
    
    @staticmethod
    def list_sales_returns(
        db: Session,
        skip: int = 0,
        limit: int = 20,
        party_id: str = None,
        from_date: str = None,
        to_date: str = None,
        org_id: str = None
    ) -> Dict[str, Any]:
        """
        List sales returns with filters.
        
        P3-10: Simplified query to avoid JSON_AGG FILTER ambiguity with multi-tenant org_id.
        Items can be fetched separately per return if needed.
        """
        query = """
            SELECT 
                sr.return_id,
                sr.return_number,
                sr.return_date,
                sr.return_type,
                sr.invoice_id,
                sr.customer_id,
                sr.return_reason,
                sr.return_category,
                sr.approval_required,
                sr.approval_status,
                sr.return_amount,
                sr.tax_amount,
                sr.total_amount,
                sr.cgst_amount,
                sr.sgst_amount,
                sr.igst_amount,
                sr.credit_note_number,
                sr.credit_note_date,
                sr.credit_note_status,
                sr.adjusted_amount,
                sr.pending_amount,
                sr.notes,
                sr.created_at,
                sr.updated_at,
                c.customer_name as party_name,
                i.invoice_number as original_invoice_number
            FROM sales.sales_returns sr
            LEFT JOIN parties.customers c ON sr.customer_id = c.customer_id AND c.org_id = sr.org_id
            LEFT JOIN sales.invoices i ON sr.invoice_id = i.invoice_id AND i.org_id = sr.org_id
            WHERE sr.org_id = :org_id
        """
        params = {"skip": skip, "limit": limit, "org_id": org_id}
        count_conditions = ""
        
        if party_id:
            query += " AND sr.customer_id = :party_id"
            params["party_id"] = party_id
            count_conditions += " AND sr.customer_id = :party_id"
        
        if from_date:
            query += " AND sr.return_date >= :from_date"
            params["from_date"] = from_date
            count_conditions += " AND sr.return_date >= :from_date"
        
        if to_date:
            query += " AND sr.return_date <= :to_date"
            params["to_date"] = to_date
            count_conditions += " AND sr.return_date <= :to_date"
        
        query += """
            ORDER BY sr.return_date DESC, sr.created_at DESC
            LIMIT :limit OFFSET :skip
        """
        
        returns = db.execute(text(query), params).fetchall()
        
        # Get item counts in a separate query to avoid TenantAwareSession subquery issues
        return_ids = [ret.return_id for ret in returns]
        item_counts = {}
        if return_ids:
            # Execute separate count query for each return's items
            for rid in return_ids:
                count_result = db.execute(
                    text("SELECT COUNT(*) FROM sales.sales_return_items WHERE return_id = :rid"),
                    {"rid": rid}
                ).scalar()
                item_counts[rid] = count_result or 0
        
        # Convert to dict format
        result = []
        for ret in returns:
            return_dict = {
                "return_id": ret.return_id,
                "return_number": ret.return_number,
                "return_date": ret.return_date,
                "return_type": ret.return_type,
                "invoice_id": ret.invoice_id,
                "customer_id": ret.customer_id,
                "party_name": ret.party_name,
                "original_invoice_number": ret.original_invoice_number,
                "return_reason": ret.return_reason,
                "return_category": ret.return_category,
                "approval_required": ret.approval_required,
                "approval_status": ret.approval_status,
                "return_amount": ret.return_amount,
                "tax_amount": ret.tax_amount,
                "total_amount": ret.total_amount,
                "cgst_amount": ret.cgst_amount,
                "sgst_amount": ret.sgst_amount,
                "igst_amount": ret.igst_amount,
                "credit_note_number": ret.credit_note_number,
                "credit_note_date": ret.credit_note_date,
                "credit_note_status": ret.credit_note_status,
                "adjusted_amount": ret.adjusted_amount,
                "pending_amount": ret.pending_amount,
                "notes": ret.notes,
                "created_at": ret.created_at,
                "updated_at": ret.updated_at,
                "item_count": item_counts.get(ret.return_id, 0),
                "items": []  # Items fetched separately if needed
            }
            result.append(return_dict)
        
        # Get total count
        count_query = f"SELECT COUNT(*) FROM sales.sales_returns sr WHERE sr.org_id = :org_id{count_conditions}"
        total = db.execute(text(count_query), params).scalar()
        
        return {"total": total, "returns": result}
    
    @staticmethod
    def get_returnable_invoices(
        db: Session,
        party_id: str = None,
        invoice_number: str = None,
        org_id: str = None
    ) -> Dict[str, Any]:
        """Get invoices available for return."""
        query = """
            SELECT 
                i.invoice_id, i.invoice_number, i.invoice_date,
                i.customer_id as party_id, c.customer_name as party_name,
                i.final_amount as grand_total, i.paid_amount,
                COUNT(DISTINCT ii.invoice_item_id) as total_items,
                SUM(ii.quantity) as total_quantity
            FROM sales.invoices i
            LEFT JOIN parties.customers c ON i.customer_id = c.customer_id AND c.org_id = i.org_id
            LEFT JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
            WHERE i.org_id = :org_id AND i.invoice_status = 'posted'
        """
        params = {"org_id": org_id}
        
        if party_id:
            query += " AND i.customer_id = :party_id"
            params["party_id"] = party_id
        
        if invoice_number:
            query += " AND i.invoice_number LIKE :invoice_number"
            params["invoice_number"] = f"%{invoice_number}%"
        
        query += """ 
            GROUP BY i.invoice_id, i.invoice_number, i.invoice_date, 
                     i.customer_id, c.customer_name, i.final_amount, i.paid_amount
            ORDER BY i.invoice_date DESC
            LIMIT 50
        """
        
        invoices = db.execute(text(query), params).fetchall()
        
        result = []
        for inv in invoices:
            invoice_dict = dict(inv._mapping)
            invoice_dict["has_returns"] = False
            invoice_dict["returnable_quantity"] = float(inv.total_quantity) if inv.total_quantity else 0
            invoice_dict["can_return"] = True
            result.append(invoice_dict)
        
        return {"invoices": result}
    
    @staticmethod
    def get_returns_for_invoice(db: Session, invoice_id: int) -> Dict[str, Any]:
        """Get all returns for a specific invoice."""
        returns = db.execute(text("""
            SELECT 
                sr.return_id, sr.return_number, sr.return_date,
                sr.return_reason, sr.total_amount,
                sr.credit_note_number, sr.credit_note_status,
                COUNT(sri.return_item_id) as item_count,
                SUM(sri.return_quantity) as total_quantity_returned
            FROM sales.sales_returns sr
            LEFT JOIN sales.sales_return_items sri ON sr.return_id = sri.return_id
            WHERE sr.invoice_id = :invoice_id
            GROUP BY sr.return_id, sr.return_number, sr.return_date, 
                     sr.return_reason, sr.total_amount, sr.credit_note_number, 
                     sr.credit_note_status
            ORDER BY sr.return_date DESC
        """), {"invoice_id": invoice_id}).fetchall()
        
        return {
            "invoice_id": invoice_id,
            "has_returns": len(returns) > 0,
            "return_count": len(returns),
            "returns": [dict(r._mapping) for r in returns] if returns else []
        }
    
    @staticmethod
    def get_returnable_items(db: Session, invoice_id: int) -> Dict[str, Any]:
        """Get invoice items with returnable quantities."""
        items = db.execute(text("""
            SELECT
                ii.invoice_item_id, ii.product_id, p.product_name,
                ii.batch_id, ii.batch_number,
                ii.quantity as invoice_quantity, ii.free_quantity,
                ii.quantity - COALESCE(ii.free_quantity, 0) as paid_quantity,
                COALESCE(SUM(sri.return_quantity), 0) as already_returned,
                ii.quantity - COALESCE(SUM(sri.return_quantity), 0) as returnable_quantity,
                ii.unit_price, ii.discount_percent,
                COALESCE(ii.cgst_rate, 0) + COALESCE(ii.sgst_rate, 0) + COALESCE(ii.igst_rate, 0) as tax_percent,
                ii.line_total as total_amount, p.hsn_code, ii.uom as unit
            FROM sales.invoice_items ii
            JOIN inventory.products p ON ii.product_id = p.product_id
            LEFT JOIN sales.sales_return_items sri ON ii.invoice_item_id = sri.invoice_item_id
                AND sri.return_id IN (
                    SELECT return_id FROM sales.sales_returns
                    WHERE return_status != 'CANCELLED' AND approval_status != 'cancelled'
                )
            WHERE ii.invoice_id = :invoice_id
            GROUP BY ii.invoice_item_id, p.product_name, p.hsn_code
            HAVING ii.quantity - COALESCE(SUM(sri.return_quantity), 0) > 0
            ORDER BY ii.invoice_item_id
        """), {"invoice_id": invoice_id}).fetchall()
        
        result = []
        for item in items:
            result.append({
                "invoice_item_id": item.invoice_item_id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "batch_id": item.batch_id,
                "batch_number": item.batch_number,
                "invoice_quantity": float(item.invoice_quantity),
                "already_returned": float(item.already_returned),
                "returnable_quantity": float(item.returnable_quantity),
                "max_returnable_qty": float(item.returnable_quantity),
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent) if item.discount_percent else 0,
                "tax_percent": float(item.tax_percent) if item.tax_percent else 0,
                "hsn_code": item.hsn_code,
                "unit": item.unit,
                "can_return": float(item.returnable_quantity) > 0
            })
        
        return {"items": result}
    
    @staticmethod
    def get_invoice_for_return(db: Session, invoice_id: int) -> Dict[str, Any]:
        """Get invoice with items for return."""
        invoice = db.execute(
            text("SELECT * FROM sales.invoices WHERE invoice_id = :invoice_id"),
            {"invoice_id": invoice_id}
        ).first()
        
        if not invoice:
            return None
        
        items = db.execute(text("""
            SELECT 
                ii.*, p.product_name, p.hsn_code,
                COALESCE(ret.total_returned, 0) as returned_quantity,
                COALESCE(ret.saleable_returned, 0) as saleable_returned,
                COALESCE(ret.damaged_returned, 0) as damaged_returned,
                ret.return_numbers, ret.last_return_date
            FROM sales.invoice_items ii
            LEFT JOIN inventory.products p ON ii.product_id = p.product_id
            LEFT JOIN (
                SELECT sri.product_id, sri.batch_id,
                    SUM(sri.return_quantity) as total_returned,
                    SUM(sri.saleable_quantity) as saleable_returned,
                    SUM(sri.damaged_quantity) as damaged_returned,
                    STRING_AGG(DISTINCT sr.return_number, ', ') as return_numbers,
                    MAX(sr.return_date) as last_return_date
                FROM sales.sales_return_items sri
                JOIN sales.sales_returns sr ON sri.return_id = sr.return_id
                WHERE sr.invoice_id = :invoice_id
                  AND sr.return_status != 'CANCELLED'
                  AND sr.approval_status != 'cancelled'
                GROUP BY sri.product_id, sri.batch_id
            ) ret ON (ret.product_id = ii.product_id 
                     AND (ret.batch_id = ii.batch_id OR (ret.batch_id IS NULL AND ii.batch_id IS NULL)))
            WHERE ii.invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).fetchall()
        
        result_items = []
        for item in items:
            item_dict = dict(item._mapping)
            original_qty = float(item.quantity) if item.quantity else 0
            returned_qty = float(item.returned_quantity) if item.returned_quantity else 0
            
            item_dict["original_quantity"] = original_qty
            item_dict["returned_quantity"] = returned_qty
            item_dict["returnable_quantity"] = max(0, original_qty - returned_qty)
            item_dict["can_return"] = item_dict["returnable_quantity"] > 0
            
            if returned_qty > 0:
                item_dict["return_status"] = "FULLY_RETURNED" if returned_qty >= original_qty else "PARTIALLY_RETURNED"
            else:
                item_dict["return_status"] = "NOT_RETURNED"
            
            result_items.append(item_dict)
        
        return {"invoice": dict(invoice._mapping), "items": result_items}
    
    @staticmethod
    def get_return_detail(db: Session, return_id: str, org_id: str = None) -> Dict[str, Any]:
        """Get detailed return with items."""
        sale_return = db.execute(text("""
            SELECT sr.*, c.customer_name as party_name, c.gst_number as party_gst,
                   i.invoice_number as original_invoice_number
            FROM sales.sales_returns sr
            LEFT JOIN parties.customers c ON sr.customer_id = c.customer_id AND c.org_id = sr.org_id
            LEFT JOIN sales.invoices i ON sr.invoice_id = i.invoice_id AND i.org_id = sr.org_id
            WHERE sr.org_id = :org_id AND sr.return_id = :return_id AND sr.return_type = 'SALES'
        """), {"return_id": return_id, "org_id": org_id}).first()
        
        if not sale_return:
            return None
        
        # Note: sales_return_items doesn't have org_id column.
        # Avoid JOIN with products/batches (which have org_id) to prevent TenantAwareSession ambiguity.
        # Product/batch names are returned via separate queries if needed, or fetched from batch_id.
        items = db.execute(text("""
            SELECT sri.*, 
                   (SELECT product_name FROM inventory.products WHERE product_id = sri.product_id LIMIT 1) as product_name,
                   (SELECT hsn_code FROM inventory.products WHERE product_id = sri.product_id LIMIT 1) as hsn_code,
                   (SELECT batch_number FROM inventory.batches WHERE batch_id = sri.batch_id LIMIT 1) as batch_number,
                   (SELECT expiry_date FROM inventory.batches WHERE batch_id = sri.batch_id LIMIT 1) as expiry_date
            FROM sales.sales_return_items sri
            WHERE sri.return_id = :return_id
        """), {"return_id": return_id}).fetchall()
        
        result = dict(sale_return._mapping)
        result["items"] = [dict(item._mapping) for item in items]
        
        return result
    
    @staticmethod
    def cancel_sales_return(
        db: Session,
        return_id: str,
        return_number: str = None,
        org_id: str = None
    ) -> Dict[str, Any]:
        """
        Cancel return and reverse all side effects:
        1. Reverse batch stock (quantity_available, quantity_returned)
        2. Delete inventory movements
        3. Void credit note and customer outstanding entry
        4. Mark return as CANCELLED
        """
        from ....core.utils.constants import ReturnStatus

        # Get return items for batch reversal
        items = db.execute(
            text("SELECT * FROM sales.sales_return_items WHERE return_id = :return_id"),
            {"return_id": return_id}
        ).fetchall()

        # 1. Reverse batch stock (only saleable items were added to quantity_available)
        for item in items:
            if item.batch_id:
                saleable_qty = float(item.saleable_quantity or 0)
                total_qty = float(item.return_quantity or 0)
                db.execute(text("""
                    UPDATE inventory.batches
                    SET quantity_available = GREATEST(0, quantity_available - :saleable_qty),
                        quantity_returned = GREATEST(0, COALESCE(quantity_returned, 0) - :total_qty),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                """), {
                    "saleable_qty": saleable_qty,
                    "total_qty": total_qty,
                    "batch_id": item.batch_id
                })

        # 2. Delete inventory movements for this return
        db.execute(text("""
            DELETE FROM inventory.inventory_movements
            WHERE reference_id = :return_id
              AND reference_type = 'SALES_RETURN'
        """), {"return_id": return_id})

        # 3. Void credit note and customer outstanding (if credit note was created)
        if org_id:
            # Void the credit note
            db.execute(text("""
                UPDATE financial.credit_notes
                SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                WHERE reference_type = 'sales_return'
                  AND reference_id = :return_id
                  AND org_id = :org_id
            """), {"return_id": return_id, "org_id": org_id})

            # Void the customer outstanding entry for this credit note
            db.execute(text("""
                UPDATE financial.customer_outstanding
                SET status = 'cancelled', outstanding_amount = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE document_type = 'credit_note'
                  AND org_id = :org_id
                  AND document_id IN (
                      SELECT credit_note_id FROM financial.credit_notes
                      WHERE reference_type = 'sales_return'
                        AND reference_id = :return_id
                        AND org_id = :org_id
                  )
            """), {"return_id": return_id, "org_id": org_id})

        # 4. Mark return as cancelled
        db.execute(text("""
            UPDATE sales.sales_returns
            SET return_status = :cancelled_status,
                updated_at = CURRENT_TIMESTAMP
            WHERE return_id = :return_id
        """), {"return_id": return_id, "cancelled_status": ReturnStatus.CANCELLED.value})

        return {"success": True, "return_number": return_number}
    
    # ==================== CREATE RETURN HELPER METHODS ====================
    
    @staticmethod
    def get_customer_for_return(db: Session, customer_id: int) -> Optional[dict]:
        """
        Get customer details for return processing, including GST info.
        """
        result = db.execute(text("""
            SELECT customer_id, customer_name, gst_number
            FROM parties.customers
            WHERE customer_id = :customer_id
        """), {"customer_id": customer_id}).fetchone()
        
        if result:
            return dict(result._mapping)
        return None
    
    @staticmethod
    def insert_sales_return(
        db: Session,
        org_id: str,
        branch_id: int,
        return_number: str,
        return_data: dict,
        totals: dict,
        credit_note_no: Optional[str],
        created_by: int
    ) -> int:
        """
        Insert a new sales return record and return the return_id.
        Now includes return_method for proper financial flow handling.
        """
        # Extract return_method from frontend data (default: credit_note)
        return_method = return_data.get("return_method") or return_data.get("return_type") or "credit_note"
        
        # Validate return_method
        valid_methods = ("credit_note", "replacement", "refund", "no_adjustment")
        if return_method not in valid_methods:
            return_method = "credit_note"  # Safe default
        
        # For refund type, require approval
        approval_required = return_method == "refund"
        approval_status = "pending" if approval_required else "approved"
        
        result = db.execute(text("""
            INSERT INTO sales.sales_returns (
                org_id, branch_id, return_number, return_date,
                return_type, return_method, invoice_id, customer_id,
                return_reason, return_category,
                approval_required, approval_status,
                return_amount, tax_amount, total_amount,
                cgst_amount, sgst_amount, igst_amount,
                credit_note_number, credit_note_date, credit_note_status,
                adjusted_amount, pending_amount,
                return_quantity,
                notes, created_by
            ) VALUES (
                :org_id, :branch_id, :return_number, :return_date,
                'SALES', :return_method, :invoice_id, :customer_id,
                :reason, :category,
                :approval_required, :approval_status,
                :subtotal, :tax_amount, :total_amount,
                :cgst_amount, :sgst_amount, :igst_amount,
                :credit_note_no, :credit_note_date, :credit_note_status,
                0, :total_amount,
                :return_quantity,
                :notes, :created_by
            )
            RETURNING return_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "return_number": return_number,
            "return_date": return_data["return_date"],
            "return_method": return_method,
            "invoice_id": return_data.get("invoice_id") if return_data.get("invoice_id") else None,
            "customer_id": return_data["customer_id"],
            "reason": return_data.get("return_reason", "Customer Return"),
            "category": return_data.get("return_category", "QUALITY"),
            "approval_required": approval_required,
            "approval_status": approval_status,
            "subtotal": float(totals["subtotal"]),
            "tax_amount": float(totals["tax_amount"]),
            "total_amount": float(totals["total_amount"]),
            "cgst_amount": float(totals["cgst_amount"]),
            "sgst_amount": float(totals["sgst_amount"]),
            "igst_amount": float(totals["igst_amount"]),
            "return_quantity": float(totals.get("total_return_quantity", 0)),
            "credit_note_no": credit_note_no,
            "credit_note_date": return_data["return_date"] if credit_note_no else None,
            "credit_note_status": "issued" if credit_note_no else None,
            "notes": return_data.get("notes", ""),
            "created_by": created_by
        }).fetchone()
        
        return result.return_id
    
    @staticmethod
    def get_invoice_item_details(db: Session, invoice_item_id: int) -> Optional[dict]:
        """
        Get invoice item details for tax/discount resolution.
        """
        result = db.execute(text("""
            SELECT 
                COALESCE(ii.cgst_rate, 0) + COALESCE(ii.sgst_rate, 0) + COALESCE(ii.igst_rate, 0) as gst_percent,
                ii.discount_percent,
                ii.unit_price,
                ii.free_quantity as invoice_free_qty
            FROM sales.invoice_items ii
            WHERE ii.invoice_item_id = :invoice_item_id
        """), {"invoice_item_id": invoice_item_id}).fetchone()
        
        if result:
            return dict(result._mapping)
        return None
    
    @staticmethod
    def validate_return_quantity(
        db: Session,
        invoice_item_id: int,
        return_qty: float
    ) -> tuple:
        """
        Validate return quantity against already returned amounts.
        Returns (max_returnable, already_returned).
        """
        logger.info(f"Validating return quantity for invoice_item_id={invoice_item_id}, requested_qty={return_qty}")
        
        result = db.execute(text("""
            SELECT
                ii.invoice_item_id,
                ii.quantity as invoice_qty,
                COALESCE(SUM(sri.return_quantity), 0) as already_returned
            FROM sales.invoice_items ii
            LEFT JOIN sales.sales_return_items sri
                ON ii.invoice_item_id = sri.invoice_item_id
                AND sri.return_id IN (
                    SELECT return_id FROM sales.sales_returns
                    WHERE return_status != 'CANCELLED' AND approval_status != 'cancelled'
                )
            WHERE ii.invoice_item_id = :invoice_item_id
            GROUP BY ii.invoice_item_id, ii.quantity
        """), {"invoice_item_id": invoice_item_id}).fetchone()
        
        if result:
            max_returnable = float(result.invoice_qty) - float(result.already_returned)
            logger.info(f"Found invoice_item: qty={result.invoice_qty}, already_returned={result.already_returned}, max_returnable={max_returnable}")
            return (max_returnable, float(result.already_returned))
        
        logger.warning(f"Invoice item {invoice_item_id} not found in sales.invoice_items")
        return (0, 0)
    
    @staticmethod
    def insert_return_item(
        db: Session,
        return_id: int,
        item_data: dict
    ) -> None:
        """
        Insert a single return item record.
        """
        db.execute(text("""
            INSERT INTO sales.sales_return_items (
                return_id, invoice_item_id, product_id,
                batch_id, batch_number,
                return_quantity, uom,
                damaged_quantity, saleable_quantity,
                unit_price, return_value, tax_amount,
                item_return_reason, disposition
            ) VALUES (
                :return_id, :invoice_item_id, :product_id,
                :batch_id, :batch_number,
                :return_quantity, :uom,
                :damaged_quantity, :saleable_quantity,
                :unit_price, :return_value, :tax_amount,
                :item_return_reason, :disposition
            )
        """), {
            "return_id": return_id,
            "invoice_item_id": item_data.get("invoice_item_id"),
            "product_id": item_data["product_id"],
            "batch_id": item_data.get("batch_id"),
            "batch_number": item_data.get("batch_number"),
            "return_quantity": item_data["return_quantity"],
            "uom": item_data.get("uom", "PCS"),
            "damaged_quantity": item_data.get("damaged_quantity", 0),
            "saleable_quantity": item_data.get("saleable_quantity", 0),
            "unit_price": item_data.get("unit_price", 0),
            "return_value": item_data.get("return_value", 0),
            "tax_amount": item_data.get("tax_amount", 0),
            "item_return_reason": item_data.get("item_return_reason", "Customer Return"),
            "disposition": item_data.get("disposition", "restock")
        })
    
    @staticmethod
    def update_batch_for_return(
        db: Session,
        batch_id: Optional[int],
        product_id: int,
        saleable_qty: float,
        total_qty: float
    ) -> None:
        """
        Update batch quantities for a return (restock or track return).
        Handles both direct batch updates and quarantine for items without batch.
        """
        if batch_id:
            if saleable_qty > 0:
                # Update both quantity_available and quantity_returned for restockable items
                db.execute(text("""
                    UPDATE inventory.batches 
                    SET quantity_available = quantity_available + :saleable_qty,
                        quantity_returned = COALESCE(quantity_returned, 0) + :total_qty,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                """), {
                    "saleable_qty": saleable_qty,
                    "total_qty": total_qty,
                    "batch_id": batch_id
                })
            else:
                # Only update quantity_returned for non-restockable items (damaged/expired)
                db.execute(text("""
                    UPDATE inventory.batches 
                    SET quantity_returned = COALESCE(quantity_returned, 0) + :total_qty
                    WHERE batch_id = :batch_id
                """), {
                    "total_qty": total_qty,
                    "batch_id": batch_id
                })
        elif saleable_qty > 0:
            # No batch ID but item is restockable - put in quarantine for batch assignment
            oldest_batch = db.execute(text("""
                SELECT batch_id 
                FROM inventory.batches 
                WHERE product_id = :product_id
                AND quantity_available > 0
                ORDER BY expiry_date ASC NULLS LAST
                LIMIT 1
            """), {"product_id": product_id}).first()
            
            if oldest_batch:
                db.execute(text("""
                    UPDATE inventory.batches 
                    SET quantity_quarantine = COALESCE(quantity_quarantine, 0) + :qty
                    WHERE batch_id = :batch_id
                """), {"qty": saleable_qty, "batch_id": oldest_batch.batch_id})
    
    @staticmethod
    def get_return_status(db: Session, return_id: int) -> Optional[dict]:
        """
        Get return status for cancel validation.
        Returns dict with return_id, return_number, return_status or None.
        """
        result = db.execute(text("""
            SELECT return_id, return_number, return_status
            FROM sales.sales_returns
            WHERE return_id = :return_id
        """), {"return_id": return_id}).first()
        
        if result:
            return dict(result._mapping)
        return None
    
    # ==================== LEDGER INTEGRATION ====================
    
    @staticmethod
    def update_customer_credit_balance(
        db: Session,
        customer_id: int,
        amount: float,
        return_method: str,
        return_number: str
    ) -> dict:
        """
        Update customer credit balance based on return_method.
        
        - credit_note: Add amount to customer's credit_balance
        - replacement: No financial update (goods exchange)
        - refund: Mark as pending refund (requires approval)
        - no_adjustment: No financial update
        
        Returns: dict with updated balance and action taken
        """
        action_taken = "none"

        if return_method == "credit_note":
            # Credit note returns are handled by CreditNoteService.create_credit_note_for_return()
            # which creates the credit note record + updates financial.customer_outstanding.
            # This branch should not be reached from routes — log a warning if it is.
            logger.warning(f"update_customer_credit_balance called with credit_note method for return {return_number}. "
                          f"This should be handled by CreditNoteService instead.")
            action_taken = "deferred_to_credit_note_service"

        elif return_method == "refund":
            # Create pending refund entry (not immediately paid)
            # The actual refund will be processed through payment module
            action_taken = "refund_pending"
            logger.info(f"Refund of {amount} pending approval for customer {customer_id}, return {return_number}")
            
        elif return_method == "replacement":
            # No financial adjustment - goods will be replaced
            action_taken = "replacement_issued"
            logger.info(f"Replacement to be issued for customer {customer_id}, return {return_number}")
            
        else:  # no_adjustment
            action_taken = "no_adjustment"
            logger.info(f"No financial adjustment for customer {customer_id}, return {return_number}")
        
        # Get updated balance
        result = db.execute(text("""
            SELECT current_outstanding
            FROM parties.customers 
            WHERE customer_id = :customer_id
        """), {"customer_id": customer_id}).first()
        
        return {
            "customer_id": customer_id,
            "action": action_taken,
            "amount": amount,
            "current_outstanding": float(result.current_outstanding or 0) if result else 0
        }
    
    @staticmethod
    def get_return_with_ledger_info(db: Session, return_id: int) -> Optional[dict]:
        """
        Get return details with customer ledger information.
        Useful for verification and testing.
        """
        # Get return record
        sale_return = db.execute(text("""
            SELECT sr.*, c.customer_name, c.current_outstanding,
                   c.gst_number
            FROM sales.sales_returns sr
            LEFT JOIN parties.customers c ON sr.customer_id = c.customer_id AND c.org_id = sr.org_id
            WHERE sr.return_id = :return_id
        """), {"return_id": return_id}).first()
        
        if not sale_return:
            return None
        
        # Get return items
        items = db.execute(text("""
            SELECT sri.*, p.product_name
            FROM sales.sales_return_items sri
            LEFT JOIN inventory.products p ON sri.product_id = p.product_id
            WHERE sri.return_id = :return_id
        """), {"return_id": return_id}).fetchall()
        
        # Get inventory movements
        movements = db.execute(text("""
            SELECT * FROM inventory.inventory_movements
            WHERE reference_type = 'SALES_RETURN' AND reference_id = :return_id
        """), {"return_id": return_id}).fetchall()
        
        return {
            "return": dict(sale_return._mapping),
            "items": [dict(i._mapping) for i in items],
            "customer_balance": {
                "current_outstanding": float(sale_return.current_outstanding or 0)
            },
            "inventory_movements": [dict(m._mapping) for m in movements]
        }

    # ========================================================================
    # BULK OPERATIONS - Performance optimized methods for multiple items
    # ========================================================================
    
    @staticmethod
    def bulk_insert_return_items(
        db: Session,
        return_id: int,
        items: list[dict]
    ) -> None:
        """
        Insert all return items in a single query using bulk INSERT.
        ~8x faster than per-item INSERT for 8 items.
        """
        if not items:
            return
        
        # Build values list for bulk insert
        values_list = []
        params = {"return_id": return_id}
        
        for idx, item in enumerate(items):
            values_list.append(f"""(
                :return_id,
                :invoice_item_id_{idx},
                :product_id_{idx},
                :batch_id_{idx},
                :batch_number_{idx},
                :return_quantity_{idx},
                :uom_{idx},
                :damaged_quantity_{idx},
                :saleable_quantity_{idx},
                :unit_price_{idx},
                :return_value_{idx},
                :tax_amount_{idx},
                :return_reason_{idx},
                :disposition_{idx}
            )""")
            
            params[f"invoice_item_id_{idx}"] = item.get("invoice_item_id")
            params[f"product_id_{idx}"] = item["product_id"]
            params[f"batch_id_{idx}"] = item.get("batch_id")
            params[f"batch_number_{idx}"] = item.get("batch_number")
            params[f"return_quantity_{idx}"] = item["return_quantity"]
            params[f"uom_{idx}"] = item.get("uom", "PCS")
            params[f"damaged_quantity_{idx}"] = item.get("damaged_quantity", 0)
            params[f"saleable_quantity_{idx}"] = item.get("saleable_quantity", 0)
            params[f"unit_price_{idx}"] = item["unit_price"]
            params[f"return_value_{idx}"] = item["return_value"]
            params[f"tax_amount_{idx}"] = item.get("tax_amount", 0)
            params[f"return_reason_{idx}"] = item.get("item_return_reason", "Customer Return")
            params[f"disposition_{idx}"] = item.get("disposition", "RESTOCK")
        
        sql = f"""
            INSERT INTO sales.sales_return_items (
                return_id, invoice_item_id, product_id, batch_id, batch_number,
                return_quantity, uom, damaged_quantity, saleable_quantity,
                unit_price, return_value, tax_amount, item_return_reason, disposition
            ) VALUES {', '.join(values_list)}
        """
        
        db.execute(text(sql), params)
        logger.info(f"Bulk inserted {len(items)} return items for return_id={return_id}")
    
    @staticmethod
    def bulk_update_batch_stock(
        db: Session,
        items: list[dict]
    ) -> None:
        """
        Update batch quantities for all items in a single query.
        Uses UPDATE ... FROM VALUES pattern for bulk update.
        """
        if not items:
            return
        
        # Filter to items with batch_id
        batch_updates = [(item["batch_id"], item.get("saleable_quantity", 0), item["return_quantity"]) 
                         for item in items if item.get("batch_id")]
        
        if not batch_updates:
            return
        
        # Build case statements for each batch
        values_list = []
        params = {}
        
        for idx, (batch_id, saleable_qty, total_qty) in enumerate(batch_updates):
            values_list.append(f"(:batch_id_{idx}, :saleable_{idx}, :total_{idx})")
            params[f"batch_id_{idx}"] = batch_id
            params[f"saleable_{idx}"] = saleable_qty
            params[f"total_{idx}"] = total_qty
        
        # Single UPDATE using a CTE
        # quantity_available increases by saleable_qty (restockable items go back on shelf)
        # quantity_returned tracks total items returned (saleable + damaged)
        sql = f"""
            WITH updates(batch_id, saleable_qty, total_qty) AS (
                VALUES {', '.join(values_list)}
            )
            UPDATE inventory.batches b
            SET
                quantity_available = quantity_available + u.saleable_qty,
                quantity_returned = COALESCE(quantity_returned, 0) + u.total_qty,
                updated_at = CURRENT_TIMESTAMP
            FROM updates u
            WHERE b.batch_id = u.batch_id::int
        """
        
        db.execute(text(sql), params)
        logger.info(f"Bulk updated {len(batch_updates)} batch quantities")
    
    @staticmethod
    def bulk_record_stock_movements(
        db: Session,
        org_id: str,
        return_id: int,
        return_number: str,
        items: list[dict],
        branch_id: int,
        created_by: int
    ) -> None:
        """
        Record stock movements for all items in a single query.
        """
        if not items:
            return

        from datetime import date

        location_id = resolve_location_id(db, org_id, branch_id)

        values_list = []
        params = {
            "org_id": org_id,
            "movement_date": date.today(),
            "return_id": return_id,
            "return_number": return_number,
            "location_id": location_id,
            "created_by": created_by
        }
        
        for idx, item in enumerate(items):
            if not (item.get("batch_id") or item.get("product_id")):
                continue
                
            saleable_qty = item.get("saleable_quantity", 0)
            movement_type = "return" if saleable_qty > 0 else "return_damaged"
            
            values_list.append(f"""(
                :org_id,
                :product_id_{idx},
                :batch_id_{idx},
                '{movement_type}',
                'in',
                :movement_date,
                :quantity_{idx},
                :location_id,
                'SALES_RETURN',
                :return_id,
                :return_number,
                :reason_{idx},
                :notes_{idx},
                :created_by
            )""")
            
            params[f"product_id_{idx}"] = item["product_id"]
            params[f"batch_id_{idx}"] = item.get("batch_id")
            params[f"quantity_{idx}"] = item["return_quantity"]  # already rounded to 2 decimals
            params[f"reason_{idx}"] = item.get("item_return_reason", "Customer Return")
            params[f"notes_{idx}"] = f"Return #{return_number}"
        
        if not values_list:
            return
        
        sql = f"""
            INSERT INTO inventory.inventory_movements (
                org_id, product_id, batch_id, movement_type, movement_direction,
                movement_date, quantity, location_id, reference_type, reference_id,
                reference_number, reason, notes, created_by
            ) VALUES {', '.join(values_list)}
        """
        
        db.execute(text(sql), params)
        logger.info(f"Bulk recorded {len(values_list)} stock movements for return_id={return_id}")

