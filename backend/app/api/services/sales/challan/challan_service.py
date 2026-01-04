"""
Challan Service - Orchestrates challan operations
Delegates to repository, validator, and calculator
"""
from sqlalchemy.orm import Session
from typing import Dict, Any, List
import logging

from .challan_repository import ChallanRepository
from .challan_validator import ChallanValidator
from ..calculations import InvoiceCalculator
from ...document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)


class ChallanService:
    """
    High-level challan operations
    Orchestrates repository, validator, and calculator
    """
    
    @staticmethod
    def create_challan_with_items(
        db: Session,
        org_id: str,
        user_id: int,
        branch_id: int,
        challan_data: Any
    ) -> Dict[str, Any]:
        """
        Create delivery challan with full validation.
        Orchestrates: validate → get context → calculate → create → update stock
        
        Args:
            db: Database session
            org_id: Organization ID
            user_id: User ID from JWT
            branch_id: Branch ID from JWT
            challan_data: Pydantic ChallanCreateRequest
            
        Returns:
            Dict with challan_id, challan_number, final_amount
        """
        try:
            # 1. Validate input
            ChallanValidator.validate_challan_data(challan_data)
            
            # 2. Get context (customer, org data)
            context = ChallanRepository.get_challan_context(
                db, org_id, challan_data.customer_id
            )
            
            # Use JWT values, fallback to context
            actual_branch_id = branch_id or context["branch_id"]
            actual_user_id = user_id or context["user_id"]
            
            # 3. Calculate totals
            items = [item.model_dump() if hasattr(item, 'model_dump') else item 
                    for item in challan_data.items]
            
            totals = InvoiceCalculator.calculate_invoice_totals(
                items=items,
                gst_type=getattr(challan_data, 'gst_type', 'CGST/SGST'),
                freight_charges=0,
                insurance_charges=0,
                other_charges=0,
                discount_type='percentage',
                discount_percent=0,
                discount_amount=0
            )
            
            # 4. Generate challan number
            challan_number = DocumentNumberService.generate_number(db, "delivery_challan", org_id)
            
            # 5. Create challan
            challan_id = ChallanRepository.create_challan(
                db=db,
                org_id=org_id,
                branch_id=actual_branch_id,
                challan_number=challan_number,
                challan_date=challan_data.challan_date,
                customer_id=challan_data.customer_id,
                customer_name=context["customer_name"],
                billing_address_id=context.get("billing_address_id"),
                shipping_address_id=context.get("shipping_address_id"),
                totals=totals,
                notes=getattr(challan_data, 'notes', None),
                created_by=actual_user_id
            )
            
            # 6. Prepare challan items data
            challan_items_data = ChallanService._prepare_challan_items(
                db, org_id, challan_id, items, totals
            )
            
            # 7. Validate stock availability
            batch_deductions = [
                {
                    "batch_id": item["batch_id"],
                    "quantity": item["quantity"],
                    "product_id": item["product_id"]
                }
                for item in challan_items_data
                if item.get("batch_id")
            ]
            
            if batch_deductions:
                ChallanRepository.validate_stock_availability(db, org_id, batch_deductions)
            
            # 8. Create challan items
            ChallanRepository.create_challan_items_bulk(db, challan_items_data)
            
            # 9. Commit transaction
            db.commit()
            
            logger.info(f"✅ Challan {challan_number} created successfully (ID: {challan_id})")
            
            return {
                "challan_id": challan_id,
                "challan_number": challan_number,
                "final_amount": totals["final_amount"],
                "items_created": len(challan_items_data)
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating challan: {e}")
            raise
    
    @staticmethod
    def _prepare_challan_items(
        db: Session,
        org_id: str,
        challan_id: int,
        items: List[Dict],
        totals: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Prepare challan items data with product/batch lookups.
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
        products_lookup, batches_lookup, fifo_batches = ChallanRepository.get_products_and_batches(
            db, org_id, product_ids, batch_ids
        )
        
        # Get line calculations from totals
        line_calculations = totals.get("line_calculations", [])
        
        # Prepare items data
        challan_items_data = []
        
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
            
            if batch_id and str(batch_id).isdigit():
                batch_info = batches_lookup.get(int(batch_id))
                if batch_info:
                    batch_number = batch_info.get("batch_number")
                    mrp = batch_info.get("mrp", mrp)
            elif not batch_id:
                # Use FIFO batch
                fifo = fifo_batches.get(product_id)
                if fifo:
                    batch_id = fifo.get("batch_id")
                    batch_number = fifo.get("batch_number")
                    mrp = fifo.get("mrp", mrp)
            
            # Get calculated values
            calc = line_calculations[i] if i < len(line_calculations) else {}
            
            # Calculate total_tax_amount and line_total
            total_tax_amount = calc.get("total_tax_amount", 0)
            if not total_tax_amount:
                total_tax_amount = (
                    calc.get("cgst_amount", 0) + 
                    calc.get("sgst_amount", 0) + 
                    calc.get("igst_amount", 0)
                )
            
            line_total = calc.get("line_total", 0)
            if not line_total:
                line_total = calc.get("taxable_amount", 0) + total_tax_amount
            
            challan_items_data.append({
                "org_id": org_id,
                "challan_id": challan_id,
                "product_id": product_id,
                "product_name": product_name,
                "hsn_code": hsn_code,
                "batch_number": batch_number or item.get("batch_number"),
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
                "free_quantity": float(item.get("free_quantity", 0)),
                "batch_id": batch_id  # Include batch_id for stock validation
            })
        
        return challan_items_data
