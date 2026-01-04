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
from ..calculations import InvoiceCalculator
from ...document_number_service import DocumentNumberService

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
            
            # 3. Calculate totals
            items = [item.model_dump() if hasattr(item, 'model_dump') else item 
                    for item in invoice_data.items]
            
            totals = InvoiceCalculator.calculate_invoice_totals(
                items=items,
                gst_type=getattr(invoice_data, 'gst_type', 'CGST/SGST'),
                freight_charges=float(getattr(invoice_data, 'freight_charges', 0) or 0),
                insurance_charges=float(getattr(invoice_data, 'insurance_charges', 0) or 0),
                other_charges=float(getattr(invoice_data, 'other_charges', 0) or 0),
                discount_type=getattr(invoice_data, 'discount_type', 'percentage'),
                discount_percent=float(getattr(invoice_data, 'discount_percent', 0) or 0),
                discount_amount=float(getattr(invoice_data, 'discount_amount', 0) or 0)
            )
            
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
            due_date = InvoiceService._calculate_due_date(
                invoice_data.invoice_date,
                getattr(invoice_data, 'payment_terms', 'cash'),
                getattr(invoice_data, 'due_days', None)
            )
            
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
                payment_terms=getattr(invoice_data, 'payment_terms', 'cash'),
                due_date=due_date,
                notes=getattr(invoice_data, 'notes', None),
                created_by=actual_user_id
            )
            
            # 8. Prepare invoice items data
            invoice_items_data = InvoiceService._prepare_invoice_items(
                db, org_id, invoice_id, items, totals
            )
            
            # 9. Create invoice items
            InvoiceRepository.create_invoice_items_bulk(db, invoice_items_data)
            
            # 10. Commit transaction
            db.commit()
            
            logger.info(f"✅ Invoice {invoice_number} created successfully (ID: {invoice_id})")
            
            return {
                "invoice_id": invoice_id,
                "invoice_number": invoice_number,
                "order_id": order_id,
                "order_number": order_number,
                "final_amount": totals["final_amount"],
                "items_created": len(invoice_items_data)
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
        line_calculations = totals.get("line_calculations", [])
        
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
            
            # Get calculated values
            calc = line_calculations[i] if i < len(line_calculations) else {}
            
            # Calculate total_tax_amount from components if not present
            total_tax_amount = calc.get("total_tax_amount", 0)
            if not total_tax_amount:
                total_tax_amount = (
                    calc.get("cgst_amount", 0) + 
                    calc.get("sgst_amount", 0) + 
                    calc.get("igst_amount", 0)
                )
            
            # Calculate line_total if not present
            line_total = calc.get("line_total", 0)
            if not line_total:
                line_total = calc.get("taxable_amount", 0) + total_tax_amount
            
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
        Delegates to InvoiceCalculator (existing calculation service).
        """
        return InvoiceCalculator.calculate_invoice_totals(
            items=items,
            gst_type=gst_type,
            freight_charges=freight_charges,
            insurance_charges=insurance_charges,
            other_charges=other_charges,
            discount_type=discount_type,
            discount_percent=discount_percent,
            discount_amount=discount_amount
        )
    
    @staticmethod
    def get_customer_details(db: Session, customer_id: int, org_id: str) -> Dict[str, Any]:
        """
        Get customer details for invoice creation.
        Delegates to repository.
        """
        return InvoiceRepository.get_customer_context(db, org_id, customer_id)
