"""
Invoice Service - Orchestrates invoice operations
Delegates to repository, validator, and calculator
"""
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from datetime import date, timedelta
from decimal import Decimal
import logging

from .invoice_repository import InvoiceRepository
from .invoice_validator import InvoiceValidator
from ...document_number_service import DocumentNumberService
from ...inventory.inventory_service import InventoryService
from ...compliance.gst_service import GSTService
# Import shared calculator for consistent calculations
from app.api.shared.calculations import calculate_line_item

logger = logging.getLogger(__name__)


class InvoiceService:
    """
    High-level invoice operations
    Orchestrates repository, validator, and calculator
    """
    
    @staticmethod
    def create_invoice_with_items(
        db: Session,
        org_id: str,
        user_id: int,
        branch_id: int,
        invoice_data: Any
    ) -> Dict[str, Any]:
        """
        Create invoice with full validation.
        Orchestrates: validate → get context → calculate → create → update stock
        
        Args:
            db: Database session
            org_id: Organization ID
            user_id: User ID from JWT
            branch_id: Branch ID from JWT
            invoice_data: Pydantic InvoiceCreateRequest
            
        Returns:
            Dict with invoice_id, invoice_number, order_id, final_amount
        """
        try:
            # 1. Validate input
            InvoiceValidator.validate_invoice_data(invoice_data)
            
            # 2. Get context (customer, org data)
            context = InvoiceRepository.get_invoice_context(
                db, org_id, invoice_data.customer_id
            )
            
            # Use JWT values, fallback to context
            actual_branch_id = branch_id or context["branch_id"]
            actual_user_id = user_id or context["user_id"]
            
            # 3. Calculate totals using canonical method
            items = [item.model_dump() if hasattr(item, 'model_dump') else item 
                    for item in invoice_data.items]
            
            # 3.1 Determine GST type (CGST/SGST or IGST) based on states
            gst_type = GSTService.determine_gst_type(
                db=db,
                org_id=org_id,
                customer_id=invoice_data.customer_id,
                delivery_address_id=getattr(invoice_data, 'shipping_address_id', None),
                billing_address_id=getattr(invoice_data, 'billing_address_id', None)
            )
            logger.debug(f"GST type determined: {gst_type}")
            
            # Use the static calculate_invoice_totals method (eliminates 50+ lines of duplication)
            totals = InvoiceService.calculate_invoice_totals(
                items=items,
                gst_type=gst_type,
                freight_charges=float(getattr(invoice_data, 'freight_charges', 0) or 0),
                insurance_charges=float(getattr(invoice_data, 'insurance_charges', 0) or 0),
                other_charges=float(getattr(invoice_data, 'other_charges', 0) or 0),
                discount_type=getattr(invoice_data, 'discount_type', 'percentage'),
                discount_percent=float(getattr(invoice_data, 'discount_percent', 0) or 0),
                discount_amount=float(getattr(invoice_data, 'discount_amount', 0) or 0)
            )
            
            # 3.5. VALIDATION: Compare frontend total with backend calculation
            # This ensures frontend can't send manipulated amounts
            frontend_total = float(getattr(invoice_data, 'total_amount', 0) or 0)
            backend_final = totals['final_amount']
            
            if frontend_total > 0 and abs(frontend_total - backend_final) > 1:
                logger.warning(
                    f"⚠️ Amount mismatch detected! Frontend: {frontend_total}, Backend: {backend_final}"
                )
                # For now, log warning but continue (can be made strict later)
                # raise ValueError(f"Amount mismatch: expected {backend_final}, got {frontend_total}")
            
            # 4. Generate numbers
            order_number = DocumentNumberService.generate_number(db, "sales_order", org_id)
            invoice_number = DocumentNumberService.generate_number(db, "invoice", org_id)
            
            # 5. Create order
            order_id = InvoiceRepository.create_order(
                db=db,
                org_id=org_id,
                branch_id=actual_branch_id,
                order_number=order_number,
                order_date=invoice_data.invoice_date,
                customer_id=invoice_data.customer_id,
                totals=totals,
                created_by=actual_user_id
            )
            
            # 6. Calculate due date
            # Note: Frontend may send payment_mode instead of payment_terms
            # Frontend may also send due_date directly (as date string) OR due_days (as integer)
            payment_terms = getattr(invoice_data, 'payment_terms', None) or getattr(invoice_data, 'payment_mode', 'cash')
            
            # Check if frontend sent due_date directly
            frontend_due_date = getattr(invoice_data, 'due_date', None)
            frontend_due_days = getattr(invoice_data, 'due_days', None)
            
            # If due_date is provided directly, use it; otherwise calculate from due_days
            if frontend_due_date and isinstance(frontend_due_date, (str, date)):
                from datetime import datetime
                if isinstance(frontend_due_date, str):
                    due_date = datetime.strptime(frontend_due_date, "%Y-%m-%d").date() if frontend_due_date else None
                else:
                    due_date = frontend_due_date
            else:
                # Convert due_days to int if it's a string
                due_days_int = int(frontend_due_days) if frontend_due_days and str(frontend_due_days).isdigit() else None
                due_date = InvoiceService._calculate_due_date(
                    invoice_data.invoice_date,
                    payment_terms,
                    due_days_int
                )
            
            # 6.5. Calculate paid_amount from payments array (operational tracking only)
            # NOTE: Does NOT create records in financial.payments - that's separate
            payments = getattr(invoice_data, 'payments', []) or []
            paid_amount = Decimal("0")
            
            logger.info(f"💰 Processing {len(payments)} payments: {payments}")
            
            if payments:
                for payment in payments:
                    payment_method = payment.get('method', 'cash')
                    payment_amt = Decimal(str(payment.get('amount', 0) or 0))
                    
                    # 'credit' method means unpaid - don't count as paid_amount
                    if payment_method != 'credit' and payment_amt > 0:
                        paid_amount += payment_amt
                        logger.info(f"💰 Adding {payment_method}: ₹{payment_amt}, running total: ₹{paid_amount}")
            
            # Determine payment_status based on paid_amount vs final_amount
            final_amount = Decimal(str(totals["final_amount"]))
            
            # VALIDATION: Reject if payments exceed invoice total
            if paid_amount > final_amount:
                raise ValueError(
                    f"Payment amount (₹{paid_amount}) exceeds invoice total (₹{final_amount}). "
                    f"Cannot pay more than the invoice amount."
                )
            
            if paid_amount >= final_amount:
                payment_status = "paid"
            elif paid_amount > 0:
                payment_status = "partial"
            else:
                payment_status = "pending"
            
            # Calculate credit_amount (amount not yet paid)
            credit_amount = final_amount - paid_amount
            
            logger.info(f"💰 FINAL Payment tracking: paid={paid_amount}, credit={credit_amount}, status={payment_status}")
            
            # Get salesperson_id - canonical name, no aliases
            salesperson_id = getattr(invoice_data, 'salesperson_id', None)
            
            # 7. Create invoice
            invoice_id = InvoiceRepository.create_invoice(
                db=db,
                org_id=org_id,
                branch_id=actual_branch_id,
                invoice_number=invoice_number,
                invoice_date=invoice_data.invoice_date,
                order_id=order_id,
                customer_id=invoice_data.customer_id,
                customer_name=context["customer_name"],
                billing_address_id=context.get("billing_address_id"),
                shipping_address_id=context.get("shipping_address_id"),
                totals=totals,
                payment_terms=payment_terms,
                due_date=due_date,
                notes=getattr(invoice_data, 'notes', None),
                created_by=actual_user_id,
                paid_amount=paid_amount,
                payment_status=payment_status,
                credit_amount=credit_amount,
                salesperson_id=salesperson_id
            )
            
            # 8. Prepare invoice items data
            invoice_items_data = InvoiceService._prepare_invoice_items(
                db, org_id, invoice_id, items, totals
            )
            
            # 9. Create invoice items
            InvoiceRepository.create_invoice_items_bulk(db, invoice_items_data)
            
            # 9.1. Auto-create linked challan if transport details provided
            transport_company = getattr(invoice_data, 'transport_company', None)
            vehicle_number = getattr(invoice_data, 'vehicle_number', None)
            challan_id = None
            challan_number = None
            
            # Create challan if any transport info is provided or if delivery type indicates shipping
            delivery_type = getattr(invoice_data, 'delivery_type', 'PICKUP')
            should_create_challan = (
                transport_company or 
                vehicle_number or 
                delivery_type in ('DELIVERY', 'COURIER', 'transport', 'courier', 'local')
            )
            
            if should_create_challan:
                # Generate challan number
                challan_number = DocumentNumberService.generate_number(db, "delivery_challan", org_id)
                
                # Use repository pattern for challan creation
                from ..challan.challan_repository import ChallanRepository
                challan_date = invoice_data.invoice_date or date.today()
                total_qty = sum(float(item.get('quantity', 0) or 0) for item in items)
                
                # Log values for debugging
                logger.info(f"📦 Auto-challan amounts - taxable: {totals.get('taxable_amount', 0)}, gst: {totals.get('total_tax_amount', 0)}, final: {totals['final_amount']}")
                
                challan_id = ChallanRepository.create_from_invoice(
                    db=db,
                    org_id=org_id,
                    branch_id=actual_branch_id,
                    challan_number=challan_number,
                    challan_date=challan_date,
                    invoice_id=invoice_id,
                    invoice_number=invoice_number,
                    order_id=order_id,
                    customer_id=invoice_data.customer_id,
                    delivery_address_id=context.get("shipping_address_id"),
                    dispatch_address_id=context.get("billing_address_id"),
                    transport_company=transport_company,
                    vehicle_number=vehicle_number,
                    lr_number=getattr(invoice_data, 'lr_number', None),
                    freight_charges=float(getattr(invoice_data, 'freight_charges', 0) or 0),
                    eway_bill_number=getattr(invoice_data, 'eway_bill_number', None),
                    total_quantity=total_qty,
                    total_amount=totals["final_amount"],
                    taxable_amount=totals.get("taxable_amount", 0),
                    gst_amount=totals.get("total_tax_amount", 0),
                    created_by=actual_user_id
                )
                
                # Update invoice with challan_id reference
                if challan_id:
                    db.execute(text("""
                        UPDATE sales.invoices 
                        SET challan_ids = ARRAY[:challan_id]::INTEGER[],
                            updated_at = CURRENT_TIMESTAMP
                        WHERE invoice_id = :invoice_id
                    """), {"challan_id": challan_id, "invoice_id": invoice_id})
            
            # 9.5. Update batch quantities and timestamps (for delta sync)
            batch_deductions = []
            for item in items:
                if item.get('batch_id') and item.get('quantity'):
                    batch_deductions.append({
                        "batch_id": item['batch_id'],
                        "quantity": item['quantity']
                    })
            
            if batch_deductions:
                # This method sets updated_at = CURRENT_TIMESTAMP on batches
                InventoryService.bulk_update_batch_quantities(db, batch_deductions, org_id)
                logger.info(f"✅ Updated {len(batch_deductions)} batch quantities for delta sync")
            
            # 10. Commit transaction
            db.commit()
            
            logger.info(f"✅ Invoice {invoice_number} created successfully (ID: {invoice_id})")
            
            return {
                "invoice_id": invoice_id,
                "invoice_number": invoice_number,
                "order_id": order_id,
                "order_number": order_number,
                "final_amount": totals["final_amount"],
                "items_created": len(invoice_items_data),
                "challan_id": challan_id,
                "challan_number": challan_number
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating invoice: {e}")
            raise
    
    @staticmethod
    def _prepare_invoice_items(
        db: Session,
        org_id: str,
        invoice_id: int,
        items: List[Dict],
        totals: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Prepare invoice items data with product/batch lookups.
        Returns list of dicts ready for bulk insert.
        """
        # Extract product and batch IDs
        product_ids = [int(item.get("product_id")) for item in items]
        batch_ids = [
            int(item.get("batch_id")) 
            for item in items 
            if item.get("batch_id") and str(item.get("batch_id")).isdigit()
        ]
        
        # Batch fetch products and batches
        products_lookup, batches_lookup, fifo_batches = InvoiceRepository.get_products_and_batches(
            db, org_id, product_ids, batch_ids
        )
        
        # Get line calculations from totals
        # NOTE: calculations.py returns 'calculated_items', not 'line_calculations'
        line_calculations = totals.get("calculated_items", []) or totals.get("line_calculations", [])
        
        # Prepare items data
        invoice_items_data = []
        
        for i, item in enumerate(items):
            product_id = int(item.get("product_id"))
            batch_id = item.get("batch_id")
            
            # Get product info
            product_info = products_lookup.get(product_id, {})
            product_name = item.get("product_name") or product_info.get("product_name", f"Product {product_id}")
            hsn_code = item.get("hsn_code") or product_info.get("hsn_code")
            
            # Get batch info
            batch_number = None
            mrp = item.get("mrp", 0)
            mfg_date = None
            exp_date = item.get("expiry_date")
            
            if batch_id and str(batch_id).isdigit():
                batch_info = batches_lookup.get(int(batch_id))
                if batch_info:
                    batch_number = batch_info.get("batch_number")
                    mrp = batch_info.get("mrp", mrp)
                    mfg_date = batch_info.get("mfg_date")
                    exp_date = batch_info.get("exp_date") or exp_date
            elif not batch_id:
                # Use FIFO batch
                fifo = fifo_batches.get(product_id)
                if fifo:
                    batch_id = fifo.get("batch_id")
                    batch_number = fifo.get("batch_number")
                    mrp = fifo.get("mrp", mrp)
                    mfg_date = fifo.get("mfg_date")
                    exp_date = fifo.get("exp_date") or exp_date
            
            # Get calculated values from totals (now properly returned)
            calc = line_calculations[i] if i < len(line_calculations) else {}
            
            # Fallback only for edge cases (shouldn't happen now)
            if not calc:
                logger.warning(f"Missing calculation for item {i}, using defaults")
                calc = {}
            
            # Get values with sensible defaults
            total_tax_amount = calc.get("total_tax_amount", 0) or calc.get("total_tax", 0)
            line_total = calc.get("line_total", 0)
            
            invoice_items_data.append({
                "org_id": org_id,
                "invoice_id": invoice_id,
                "product_id": product_id,
                "product_name": product_name,
                "hsn_code": hsn_code,
                "batch_number": batch_number or item.get("batch_number"),
                "manufacturing_date": mfg_date or item.get("manufacturing_date"),
                "expiry_date": exp_date,
                "quantity": float(item.get("quantity", 0)) + float(item.get("free_quantity", 0)),
                "uom": item.get("uom", "PCS"),
                "pack_type": item.get("pack_type", "UNIT"),
                "pack_size": int(item.get("pack_size", 1)),
                "base_quantity": float(item.get("quantity", 0)),
                "mrp": float(mrp),
                "unit_price": float(item.get("unit_price", 0)),
                "discount_percent": float(item.get("discount_percent", 0)),
                "discount_amount": calc.get("discount_amount", 0),
                "taxable_amount": calc.get("taxable_amount", 0),
                "igst_rate": calc.get("igst_percent", 0),
                "igst_amount": calc.get("igst_amount", 0),
                "cgst_rate": calc.get("cgst_percent", 0),
                "cgst_amount": calc.get("cgst_amount", 0),
                "sgst_rate": calc.get("sgst_percent", 0),
                "sgst_amount": calc.get("sgst_amount", 0),
                "total_tax_amount": total_tax_amount,
                "line_total": line_total,
                "free_quantity": float(item.get("free_quantity", 0))
            })
        
        return invoice_items_data
    
    @staticmethod
    def _calculate_due_date(
        invoice_date: date,
        payment_terms: str,
        due_days: int = None
    ) -> date:
        """Calculate invoice due date based on payment terms"""
        if due_days is not None and due_days > 0:
            return invoice_date + timedelta(days=due_days)
        
        if payment_terms in ["cash", "cod"]:
            return invoice_date
        elif payment_terms == "credit":
            return invoice_date + timedelta(days=30)
        elif payment_terms == "advance":
            return invoice_date
        else:
            return invoice_date + timedelta(days=7)
    
    @staticmethod
    def calculate_invoice_totals(
        items: list,
        gst_type: str = "CGST/SGST",
        freight_charges: float = 0,
        insurance_charges: float = 0,
        other_charges: float = 0,
        discount_type: str = "percentage",
        discount_percent: float = 0,
        discount_amount: float = 0
    ) -> Dict[str, Any]:
        """
        Calculate all invoice totals from item list.
        Uses shared/calculations.calculate_line_item() for IDENTICAL logic to frontend.
        
        This ensures frontend EnterpriseCalculator and backend use the same formulas.
        """
        # Calculate each line item
        subtotal = 0
        item_discount = 0
        cgst = 0
        sgst = 0
        igst = 0
        calculated_items = []  # Store individual calculations
        
        for item in items:
            # Check if line_total is pre-calculated (from frontend with full calculation)
            if item.get('line_total'):
                line_total = float(item.get('line_total', 0) or 0)
                item_disc = float(item.get('discount_amount', 0) or 0)
                item_cgst = float(item.get('cgst_amount', 0) or 0)
                item_sgst = float(item.get('sgst_amount', 0) or 0)
                item_igst = float(item.get('igst_amount', 0) or 0)
                
                # Store the pre-calculated values
                calculated_items.append({
                    'line_total': line_total,
                    'discount_amount': item_disc,
                    'taxable_amount': float(item.get('taxable_amount', 0) or 0),
                    'cgst_amount': item_cgst,
                    'sgst_amount': item_sgst,
                    'igst_amount': item_igst,
                    'cgst_percent': float(item.get('cgst_rate', 0) or item.get('cgst_percent', 0) or 0),
                    'sgst_percent': float(item.get('sgst_rate', 0) or item.get('sgst_percent', 0) or 0),
                    'igst_percent': float(item.get('igst_rate', 0) or item.get('igst_percent', 0) or 0),
                    'total_tax_amount': item_cgst + item_sgst + item_igst
                })
            else:
                # Use shared calculator for consistent calculations
                # Same formulas as frontend EnterpriseCalculator.calculateItem()
                quantity = float(item.get('quantity', 0) or 0)
                unit_price = float(item.get('unit_price', 0) or 0)
                discount_pct = float(item.get('discount_percent', 0) or 0)
                gst_pct = float(item.get('gst_percent', 0) or 0)
                
                # Use shared calculator function
                calculated = calculate_line_item(
                    quantity=quantity,
                    unit_price=unit_price,
                    discount_percent=discount_pct,
                    gst_percent=gst_pct,
                    gst_type=gst_type
                )
                
                line_total = calculated['line_total']
                item_disc = calculated['discount_amount']
                item_cgst = calculated['cgst_amount']
                item_sgst = calculated['sgst_amount']
                item_igst = calculated['igst_amount']
                
                # Store calculated values with percent rates
                calculated_items.append({
                    **calculated,
                    'cgst_percent': gst_pct / 2 if gst_type == "CGST/SGST" else 0,
                    'sgst_percent': gst_pct / 2 if gst_type == "CGST/SGST" else 0,
                    'igst_percent': gst_pct if gst_type == "IGST" else 0,
                    'total_tax_amount': calculated['total_tax']
                })
            
            subtotal += line_total
            item_discount += item_disc
            cgst += item_cgst
            sgst += item_sgst
            igst += item_igst
        
        # Invoice-level discount (scheme_discount)
        # Always calculate both amount and percentage for clarity in reports
        if discount_type == 'percentage' and discount_percent > 0:
            scheme_discount = subtotal * (discount_percent / 100)
            scheme_discount_percent = discount_percent
        elif discount_type in ('amount', 'fixed') and discount_amount > 0:
            scheme_discount = discount_amount
            # Calculate equivalent percentage for reports
            scheme_discount_percent = (discount_amount / subtotal * 100) if subtotal > 0 else 0
        else:
            scheme_discount = 0
            scheme_discount_percent = 0
        
        # Taxable amount after scheme discount
        taxable_amount = subtotal - scheme_discount
        total_tax = cgst + sgst + igst
        
        # Amount before rounding
        amount_before_round = taxable_amount + freight_charges + insurance_charges + other_charges
        
        # Round to nearest integer (Indian practice)
        final_amount = round(amount_before_round)
        round_off_amount = final_amount - amount_before_round
        
        return {
            'subtotal_amount': round(subtotal, 2),
            'discount_amount': round(item_discount, 2),
            'scheme_discount': round(scheme_discount, 2),
            'scheme_discount_percent': round(scheme_discount_percent, 2),
            'taxable_amount': round(taxable_amount, 2),
            'cgst_amount': round(cgst, 2),
            'sgst_amount': round(sgst, 2),
            'igst_amount': round(igst, 2),
            'total_tax_amount': round(total_tax, 2),
            'freight_charges': freight_charges,
            'insurance_charges': insurance_charges,
            'other_charges': other_charges,
            'round_off_amount': round(round_off_amount, 2),
            'final_amount': final_amount,
            'calculated_items': calculated_items,  # Return individual calculations
        }
    
    @staticmethod
    def get_customer_details(db: Session, customer_id: int, org_id: str) -> Dict[str, Any]:
        """
        Get customer details for invoice creation.
        Delegates to repository.
        """
        return InvoiceRepository.get_customer_context(db, org_id, customer_id)
    
    @staticmethod
    def list_invoices(
        db: Session,
        limit: int = 50,
        offset: int = 0,
        customer_id: int = None,
        date_from: date = None,
        date_to: date = None,
        payment_status: str = None,
        invoice_status: str = None,
        search: str = None
    ) -> Dict[str, Any]:
        """
        Get list of invoices with pagination and filters.
        TenantAwareSession auto-filters by org_id.
        """
        from sqlalchemy import text
        
        query = """
            SELECT
                i.invoice_id, i.invoice_number, i.invoice_date,
                i.customer_id, i.customer_name, i.final_amount,
                i.paid_amount, i.credit_amount, i.payment_status,
                i.invoice_status, i.cgst_amount, i.sgst_amount,
                i.igst_amount, i.total_tax_amount, i.taxable_amount,
                i.subtotal_amount
            FROM sales.invoices i
            WHERE 1=1
        """
        
        params = {"limit": limit, "offset": offset}
        count_conditions = ""
        count_params = {}

        if customer_id:
            query += " AND i.customer_id = :customer_id"
            params["customer_id"] = customer_id
            count_conditions += " AND customer_id = :customer_id"
            count_params["customer_id"] = customer_id

        if date_from:
            query += " AND i.invoice_date >= :date_from"
            params["date_from"] = date_from
            count_conditions += " AND invoice_date >= :date_from"
            count_params["date_from"] = date_from

        if date_to:
            query += " AND i.invoice_date <= :date_to"
            params["date_to"] = date_to
            count_conditions += " AND invoice_date <= :date_to"
            count_params["date_to"] = date_to
        
        if payment_status:
            query += " AND i.payment_status = :payment_status"
            params["payment_status"] = payment_status
        
        if invoice_status:
            query += " AND i.invoice_status = :invoice_status"
            params["invoice_status"] = invoice_status
        
        if search:
            query += """ AND (
                i.invoice_number ILIKE :search 
                OR i.customer_name ILIKE :search
            )"""
            params["search"] = f"%{search}%"

        query += " ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT :limit OFFSET :offset"
        
        result = db.execute(text(query), params)
        invoices = [dict(row._mapping) for row in result]
        
        # Get total count
        count_query = f"SELECT COUNT(*) FROM sales.invoices WHERE 1=1{count_conditions}"
        total = db.execute(text(count_query), count_params).scalar()
        
        return {
            "invoices": invoices,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    
    @staticmethod
    def get_invoice_with_items(db: Session, invoice_id: int, org_id: str) -> Dict[str, Any]:
        """
        Get invoice with items and order info.
        """
        from sqlalchemy import text
        
        result = db.execute(text("""
            SELECT
                i.*,
                o.order_number
            FROM sales.invoices i
            LEFT JOIN sales.orders o ON i.order_id = o.order_id AND o.org_id = i.org_id
            WHERE i.invoice_id = :invoice_id AND i.org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
        
        invoice = result.fetchone()
        if not invoice:
            return None
        
        invoice_dict = dict(invoice._mapping)
        
        # Get invoice items with pack information
        items_result = db.execute(text("""
            SELECT
                ii.*,
                b.pack_type, b.pack_size, b.units_per_pack,
                b.packages_per_box, b.pack_uom, b.base_uom
            FROM sales.invoice_items ii
            LEFT JOIN inventory.batches b ON ii.batch_id = b.batch_id AND b.org_id = :org_id
            WHERE ii.invoice_id = :invoice_id
            ORDER BY ii.invoice_item_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
        
        invoice_dict["items"] = [dict(item._mapping) for item in items_result]
        
        return invoice_dict
    
    @staticmethod
    def get_invoice_status(db: Session, invoice_id: int, org_id: str) -> Dict[str, Any]:
        """
        Get invoice status info for validation.
        """
        from sqlalchemy import text
        
        result = db.execute(text("""
            SELECT invoice_status, payment_status, paid_amount, final_amount
            FROM sales.invoices
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
        
        row = result.fetchone()
        if not row:
            return None
        
        return {
            "invoice_status": row[0],
            "payment_status": row[1],
            "paid_amount": row[2],
            "final_amount": row[3]
        }
    
    @staticmethod
    def update_invoice_draft(
        db: Session,
        invoice_id: int,
        org_id: str,
        update_data: Dict[str, Any]
    ) -> bool:
        """
        Update draft invoice with permitted fields.
        Returns True if update was applied.
        """
        from sqlalchemy import text
        
        EDITABLE_FIELDS = {
            "notes", "payment_terms", "due_date", 
            "freight_charges", "insurance_charges", "other_charges"
        }
        
        update_fields = []
        params = {"invoice_id": invoice_id, "org_id": org_id}
        
        for field in EDITABLE_FIELDS:
            if field in update_data:
                update_fields.append(f"{field} = :{field}")
                params[field] = update_data[field]
        
        if not update_fields:
            return False
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        db.execute(text(f"""
            UPDATE sales.invoices
            SET {', '.join(update_fields)}
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), params)
        
        return True
    
    @staticmethod
    def cancel_invoice(
        db: Session,
        invoice_id: int,
        org_id: str,
        cancelled_by: int,
        reason: str = None,
        reverse_inventory: bool = False
    ) -> Dict[str, Any]:
        """
        Cancel invoice and optionally reverse inventory.
        """
        from sqlalchemy import text
        from .....core.utils.constants import InvoiceStatus
        
        # Mark invoice as cancelled
        db.execute(text("""
            UPDATE sales.invoices
            SET invoice_status = :cancelled_status,
                cancelled_at = CURRENT_TIMESTAMP,
                cancelled_by = :cancelled_by,
                cancellation_reason = :reason,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {
            "invoice_id": invoice_id,
            "org_id": org_id,
            "cancelled_status": InvoiceStatus.CANCELLED.value,
            "cancelled_by": cancelled_by,
            "reason": reason or "Cancelled by user"
        })
        
        # Reverse inventory if needed
        if reverse_inventory:
            items_result = db.execute(text("""
                SELECT product_id, batch_id, quantity
                FROM sales.invoice_items
                WHERE invoice_id = :invoice_id
            """), {"invoice_id": invoice_id})
            
            for item in items_result:
                if item[1]:  # Has batch_id
                    db.execute(text("""
                        UPDATE inventory.batches
                        SET quantity_available = quantity_available + :quantity,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = :batch_id AND org_id = :org_id
                    """), {
                        "batch_id": item[1],
                        "quantity": item[2],
                        "org_id": org_id
                    })
        
        return {"success": True, "invoice_id": invoice_id}
    
    # ==================== BACKGROUND TASK METHODS ====================
    
    @staticmethod
    def update_invoice_totals(db: Session, invoice_id: int, totals: dict) -> bool:
        """
        Update invoice totals after background calculation.
        Used by async processing tasks.
        
        Args:
            invoice_id: Invoice ID to update
            totals: Dict with items_count, total_qty, subtotal, etc.
        """
        if not totals:
            return False
        
        db.execute(text("""
            UPDATE sales.invoices
            SET 
                items_count = :items_count,
                total_quantity = :total_qty,
                subtotal_amount = :subtotal,
                discount_amount = :item_discount,
                scheme_discount = :invoice_discount,
                taxable_amount = :taxable_amount,
                igst_amount = :igst,
                cgst_amount = :cgst,
                sgst_amount = :sgst,
                total_tax_amount = :total_tax,
                final_amount = :final_amount,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = :invoice_id
        """), {**totals, "invoice_id": invoice_id})
        
        logger.info(f"✅ Updated totals for invoice {invoice_id}")
        return True
    
    @staticmethod
    def update_customer_outstanding(
        db: Session,
        customer_id: int,
        amount: float
    ) -> bool:
        """
        Update customer's outstanding balance after invoice creation.
        Used by async processing tasks.
        
        Args:
            customer_id: Customer ID to update
            amount: Amount to add to outstanding balance
        """
        try:
            db.execute(text("""
                UPDATE parties.customers 
                SET current_outstanding = COALESCE(current_outstanding, 0) + :amount,
                    updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = :customer_id
            """), {
                "customer_id": customer_id,
                "amount": amount
            })
            logger.info(f"✅ Updated customer {customer_id} outstanding by +{amount}")
            return True
        except Exception as e:
            logger.warning(f"⚠️ Could not update customer outstanding: {e}")
            return False
