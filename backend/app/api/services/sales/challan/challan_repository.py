"""
Challan Repository - Data Access Layer
All SQL queries for challan operations
"""
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Dict, Any, List
import logging

from ..shared import SalesSharedRepository

logger = logging.getLogger(__name__)


class ChallanRepository:
    """Pure data access layer for challans - no business logic"""
    
    # Reuse shared methods
    get_customer_context = SalesSharedRepository.get_customer_context
    get_org_context = SalesSharedRepository.get_org_context
    get_products_and_batches = SalesSharedRepository.get_products_and_batches
    validate_stock_availability = SalesSharedRepository.validate_stock_availability
    
    @staticmethod
    def get_challan_context(
        db: Session,
        org_id: str,
        customer_id: int
    ) -> Dict[str, Any]:
        """
        Get all context data needed for challan creation.
        Combines customer and org context.
        """
        customer_ctx = SalesSharedRepository.get_customer_context(db, org_id, customer_id)
        org_ctx = SalesSharedRepository.get_org_context(db, org_id)
        
        return {**customer_ctx, **org_ctx}
    
    @staticmethod
    def create_challan(
        db: Session,
        org_id: str,
        branch_id: int,
        challan_number: str,
        challan_date: Any,
        customer_id: int,
        customer_name: str,
        billing_address_id: int,
        shipping_address_id: int,
        totals: Dict[str, Any],
        notes: str,
        created_by: int
    ) -> int:
        """
        Create delivery challan record.
        Returns challan_id.
        """
        result = db.execute(text("""
            INSERT INTO sales.delivery_challans (
                org_id, branch_id, challan_number, challan_date,
                customer_id, customer_name,
                billing_address_id, shipping_address_id,
                subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                round_off_amount, final_amount,
                notes, created_by, created_at
            ) VALUES (
                :org_id, :branch_id, :challan_number, :challan_date,
                :customer_id, :customer_name,
                :billing_address_id, :shipping_address_id,
                :subtotal, :discount, :taxable,
                :cgst, :sgst, :igst, :tax,
                :round_off, :final,
                :notes, :created_by, CURRENT_TIMESTAMP
            ) RETURNING challan_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "challan_number": challan_number,
            "challan_date": challan_date,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "billing_address_id": billing_address_id,
            "shipping_address_id": shipping_address_id,
            "subtotal": totals.get("subtotal_amount", 0),
            "discount": totals.get("discount_amount", 0),
            "taxable": totals.get("taxable_amount", 0),
            "cgst": totals.get("cgst_amount", 0),
            "sgst": totals.get("sgst_amount", 0),
            "igst": totals.get("igst_amount", 0),
            "tax": totals.get("total_tax_amount", 0),
            "round_off": totals.get("round_off_amount", 0),
            "final": totals.get("final_amount", 0),
            "notes": notes,
            "created_by": created_by
        })
        
        challan_id = result.scalar()
        logger.info(f"✅ Created challan {challan_number} (ID: {challan_id})")
        return challan_id
    
    @staticmethod
    def create_challan_items_bulk(
        db: Session,
        challan_items_data: List[Dict[str, Any]]
    ) -> None:
        """
        Bulk insert challan items (single query).
        """
        if not challan_items_data:
            return
        
        values_list = []
        params = {}
        
        for i, item_data in enumerate(challan_items_data):
            values_list.append(f"""(
                :org_id_{i}, :challan_id_{i}, :product_id_{i}, :product_name_{i}, :hsn_code_{i},
                :batch_number_{i}, :quantity_{i}, :uom_{i}, :pack_type_{i}, :pack_size_{i},
                :base_quantity_{i}, :mrp_{i}, :unit_price_{i}, :discount_percent_{i},
                :discount_amount_{i}, :taxable_amount_{i}, :igst_rate_{i}, :igst_amount_{i},
                :cgst_rate_{i}, :cgst_amount_{i}, :sgst_rate_{i}, :sgst_amount_{i},
                :total_tax_amount_{i}, :line_total_{i}, :free_quantity_{i}
            )""")
            
            for key, value in item_data.items():
                params[f"{key}_{i}"] = value
        
        bulk_insert_sql = f"""
            INSERT INTO sales.challan_items (
                org_id, challan_id, product_id, product_name, hsn_code,
                batch_number, quantity, uom, pack_type, pack_size,
                base_quantity, mrp, unit_price, discount_percent,
                discount_amount, taxable_amount, igst_rate, igst_amount,
                cgst_rate, cgst_amount, sgst_rate, sgst_amount,
                total_tax_amount, line_total, free_quantity
            ) VALUES {", ".join(values_list)}
        """
        
        db.execute(text(bulk_insert_sql), params)
        logger.info(f"✅ Bulk inserted {len(challan_items_data)} challan items")
    
    @staticmethod
    def create_from_invoice(
        db: Session,
        org_id: str,
        branch_id: int,
        challan_number: str,
        challan_date: Any,
        invoice_id: int,
        invoice_number: str,
        order_id: int | None,
        customer_id: int,
        delivery_address_id: int | None,
        dispatch_address_id: int | None,
        transport_company: str | None,
        vehicle_number: str | None,
        lr_number: str | None,
        freight_charges: float,
        eway_bill_number: str | None,
        total_quantity: float,
        total_amount: float,
        taxable_amount: float,
        gst_amount: float,
        created_by: int
    ) -> int:
        """
        Create delivery challan linked to an invoice.
        Used for auto-creating challans when invoices have transport details.
        Returns challan_id.
        """
        # Log values being inserted with type info for debugging
        logger.info(f"📊 Challan INSERT - taxable_amount={taxable_amount} (type={type(taxable_amount).__name__}), gst_amount={gst_amount} (type={type(gst_amount).__name__}), total_amount={total_amount}")
        
        result = db.execute(text("""
            INSERT INTO sales.delivery_challans (
                org_id, branch_id, challan_number, challan_date, challan_type,
                order_id, invoice_id, customer_id,
                delivery_address_id, dispatch_address_id,
                dispatch_date, transport_mode,
                transporter_name, vehicle_number, lr_number, lr_date,
                freight_charges, eway_bill_number, eway_bill_date,
                total_quantity, total_amount, taxable_amount, gst_amount,
                challan_status, delivery_status,
                notes, created_by, created_at, updated_at
            ) VALUES (
                :org_id, :branch_id, :challan_number, :challan_date, 'delivery',
                :order_id, :invoice_id, :customer_id,
                :delivery_address_id, :dispatch_address_id,
                :dispatch_date, :transport_mode,
                :transporter_name, :vehicle_number, :lr_number, :lr_date,
                :freight_charges, :eway_bill_number, :eway_bill_date,
                :total_quantity, :total_amount, :taxable_amount, :gst_amount,
                'dispatched', 'in_transit',
                :notes, :created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING challan_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "challan_number": challan_number,
            "challan_date": challan_date,
            "order_id": order_id,
            "invoice_id": invoice_id,
            "customer_id": customer_id,
            "delivery_address_id": delivery_address_id,
            "dispatch_address_id": dispatch_address_id,
            "dispatch_date": challan_date,
            "transport_mode": "road" if transport_company or vehicle_number else None,
            "transporter_name": transport_company,
            "vehicle_number": vehicle_number,
            "lr_number": lr_number,
            "lr_date": challan_date if lr_number else None,
            "freight_charges": freight_charges,
            "eway_bill_number": eway_bill_number,
            "eway_bill_date": challan_date if eway_bill_number else None,
            "total_quantity": total_quantity,
            "total_amount": total_amount,
            "taxable_amount": taxable_amount,
            "gst_amount": gst_amount,
            "notes": f"Auto-created from invoice {invoice_number}",
            "created_by": created_by
        })
        
        challan_id = result.scalar()
        logger.info(f"✅ Created challan {challan_number} (ID: {challan_id}) linked to invoice {invoice_number}")
        return challan_id
