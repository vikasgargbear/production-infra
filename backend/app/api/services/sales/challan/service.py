"""
Challan Service
Handles all database operations for delivery challans
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, datetime
from decimal import Decimal
import logging

from app.api.shared.calculations import calculate_line_item
from app.core.money import decimal_value, money

logger = logging.getLogger(__name__)


class ChallanService:
    """Service class for Challan operations"""

    @staticmethod
    def calculate_challan_totals(
        items: List[Dict[str, Any]],
        gst_type: str,
        freight_charges: Any = 0,
        *,
        exact_output: bool = False,
    ) -> Dict[str, Any]:
        """Calculate delivery-challan lines and totals for preview and commit."""
        if not items:
            raise ValueError("items must contain at least one challan line")
        normalized_gst_type = str(gst_type).strip().upper()
        if normalized_gst_type not in {"IGST", "CGST/SGST"}:
            raise ValueError("gst_type must be 'IGST' or 'CGST/SGST'")

        calculated_items: List[Dict[str, Any]] = []
        subtotal = Decimal("0")
        discount = Decimal("0")
        taxable = Decimal("0")
        cgst = Decimal("0")
        sgst = Decimal("0")
        igst = Decimal("0")

        for item in items:
            quantity = decimal_value(item.get("quantity", 0), "quantity", minimum=Decimal("0"))
            free_quantity = decimal_value(
                item.get("free_quantity", 0),
                "free_quantity",
                minimum=Decimal("0"),
            )
            if quantity + free_quantity <= 0:
                raise ValueError("quantity plus free_quantity must be greater than 0")
            free_supply_tax_treatment = str(item.get(
                "free_supply_tax_treatment", "excluded_from_taxable_value"
            )).strip()
            if free_supply_tax_treatment not in {
                "excluded_from_taxable_value", "included_at_unit_rate"
            }:
                raise ValueError("free_supply_tax_treatment is invalid")
            priced_quantity = quantity + (
                free_quantity
                if free_supply_tax_treatment == "included_at_unit_rate"
                else Decimal("0")
            )
            unit_price = decimal_value(item.get("unit_price", 0), "unit_price", minimum=Decimal("0"))
            discount_percent = decimal_value(
                item.get("discount_percent", 0),
                "discount_percent",
                minimum=Decimal("0"),
                maximum=Decimal("100"),
            )
            gst_percent = decimal_value(
                item.get("gst_percent", item.get("tax_percent", 0)) or 0,
                "gst_percent",
                minimum=Decimal("0"),
                maximum=Decimal("100"),
            )
            line = calculate_line_item(
                quantity=priced_quantity,
                unit_price=unit_price,
                discount_percent=discount_percent,
                gst_percent=gst_percent,
                gst_type=normalized_gst_type,
            )
            line["gst_percent"] = gst_percent
            line["quantity"] = quantity
            line["free_quantity"] = free_quantity
            line["free_supply_tax_treatment"] = free_supply_tax_treatment
            line["total_tax_amount"] = line["total_tax"]
            calculated_items.append(line)
            subtotal += money(line["subtotal"])
            discount += money(line["discount_amount"])
            taxable += money(line["taxable_amount"])
            cgst += money(line["cgst_amount"])
            sgst += money(line["sgst_amount"])
            igst += money(line["igst_amount"])

        freight = money(decimal_value(freight_charges, "freight_charges", minimum=Decimal("0")))
        total_tax = money(cgst + sgst + igst)
        final_amount = money(taxable + total_tax + freight)
        totals = {
            "subtotal_amount": money(subtotal),
            "discount_amount": money(discount),
            "taxable_amount": money(taxable),
            "cgst_amount": money(cgst),
            "sgst_amount": money(sgst),
            "igst_amount": money(igst),
            "total_tax_amount": total_tax,
            "freight_charges": freight,
            "final_amount": final_amount,
            "calculated_items": calculated_items,
        }
        if exact_output:
            return totals
        return {
            **{key: float(value) for key, value in totals.items() if key != "calculated_items"},
            "calculated_items": [
                {
                    key: float(value) if isinstance(value, Decimal) else value
                    for key, value in item.items()
                }
                for item in calculated_items
            ],
        }
    
    @staticmethod
    def get_branch_id(db: Session, org_id: str) -> Optional[int]:
        """Get branch_id from org_branches."""
        try:
            result = db.execute(text(
                "SELECT branch_id FROM master.org_branches WHERE org_id = :org_id LIMIT 1"
            ), {"org_id": org_id})
            row = result.first()
            return row[0] if row else None
        except Exception:
            return None
    
    @staticmethod
    def get_order_with_customer(db: Session, org_id: str, order_id: int) -> Optional[Dict[str, Any]]:
        """Get order with customer details."""
        result = db.execute(text("""
            SELECT o.*, c.customer_name FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.order_id = :order_id AND o.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_customer_name(db: Session, customer_id: int) -> Optional[str]:
        """Get customer name."""
        result = db.execute(text(
            "SELECT customer_name FROM parties.customers WHERE customer_id = :customer_id"
        ), {"customer_id": customer_id})
        row = result.first()
        return row.customer_name if row else None
    
    @staticmethod
    def create_challan(db: Session, data: Dict[str, Any]) -> int:
        """Create delivery challan."""
        result = db.execute(text("""
            INSERT INTO sales.delivery_challans (
                org_id, branch_id, order_id, customer_id, challan_number, challan_date, dispatch_date,
                challan_status, challan_type, vehicle_number, transporter_name, lr_number,
                freight_charges, total_quantity, total_amount, taxable_amount, gst_amount,
                delivery_status, notes, created_by
            ) VALUES (
                :org_id, :branch_id, :order_id, :customer_id, :challan_number, :challan_date, :dispatch_date,
                :challan_status, :challan_type, :vehicle_number, :transporter_name, :lr_number,
                :freight_charges, :total_quantity, :total_amount, :taxable_amount, :gst_amount,
                :delivery_status, :notes, :created_by
            ) RETURNING challan_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def get_existing_order_items(db: Session, order_id: int) -> List[Dict[str, Any]]:
        """Get existing order items for an order."""
        result = db.execute(text("""
            SELECT order_item_id, product_id, quantity FROM sales.order_items WHERE order_id = :order_id
        """), {"order_id": order_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def check_order_item_exists(db: Session, order_item_id: int) -> bool:
        """Check if order item exists."""
        result = db.execute(text(
            "SELECT order_item_id FROM sales.order_items WHERE order_item_id = :order_item_id"
        ), {"order_item_id": order_item_id})
        return result.first() is not None
    
    @staticmethod
    def create_challan_item(db: Session, data: Dict[str, Any]) -> None:
        """Create challan item."""
        db.execute(text("""
            INSERT INTO sales.delivery_challan_items (
                challan_id, order_item_id, product_id, batch_id, ordered_quantity, dispatched_quantity,
                delivered_quantity, returned_quantity, damaged_quantity, uom, pack_type,
                item_status, item_notes, display_order, unit_price
            ) VALUES (
                :challan_id, :order_item_id, :product_id, :batch_id, :ordered_quantity, :dispatched_quantity,
                :delivered_quantity, :returned_quantity, :damaged_quantity, :uom, :pack_type,
                :item_status, :item_notes, :display_order, :unit_price
            )
        """), data)
    
    @staticmethod
    def update_challan_amounts(db: Session, challan_id: int, taxable_amount: Decimal,
                               gst_amount: Decimal, freight_charges: Decimal, total_amount: Decimal) -> None:
        """Update challan financial amounts (fix trigger corruption)."""
        db.execute(text("""
            UPDATE sales.delivery_challans SET taxable_amount = :taxable_amount, gst_amount = :gst_amount,
            freight_charges = :freight_charges, total_amount = :total_amount WHERE challan_id = :challan_id
        """), {"challan_id": challan_id, "taxable_amount": taxable_amount, "gst_amount": gst_amount,
               "freight_charges": freight_charges, "total_amount": total_amount})
    
    @staticmethod
    def get_challan_amounts(db: Session, challan_id: int) -> Optional[Dict[str, Any]]:
        """Get challan amounts for verification."""
        result = db.execute(text("""
            SELECT taxable_amount, gst_amount, freight_charges, total_amount
            FROM sales.delivery_challans WHERE challan_id = :challan_id
        """), {"challan_id": challan_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def list_challans(db: Session, org_id: str, customer_id: int = None, status: str = None,
                      start_date: date = None, end_date: date = None, limit: int = 100, skip: int = 0) -> List[Dict[str, Any]]:
        """List delivery challans with filters."""
        query = """
            SELECT c.challan_id, c.challan_number, c.challan_date, c.order_id, c.customer_id,
                   cust.customer_name, c.challan_status, c.dispatch_date, c.transporter_name,
                   c.vehicle_number, c.lr_number, c.total_quantity, c.total_amount,
                   c.taxable_amount, c.gst_amount, c.freight_charges, c.delivery_status, c.notes
            FROM sales.delivery_challans c
            JOIN parties.customers cust ON c.customer_id = cust.customer_id
            WHERE c.org_id = :org_id
        """
        params = {"org_id": org_id, "limit": limit, "skip": skip}
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
        if status:
            query += " AND c.challan_status = :status"
            params["status"] = status
        if start_date:
            query += " AND c.challan_date >= :start_date"
            params["start_date"] = start_date
        if end_date:
            query += " AND c.challan_date <= :end_date"
            params["end_date"] = end_date
        query += " ORDER BY c.challan_date DESC, c.challan_id DESC LIMIT :limit OFFSET :skip"
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_challan_with_customer(db: Session, challan_id: int) -> Optional[Dict[str, Any]]:
        """Get challan header with customer details."""
        result = db.execute(text("""
            SELECT c.*, cust.customer_name, cust.gst_number, cust.primary_phone
            FROM sales.delivery_challans c
            JOIN parties.customers cust ON c.customer_id = cust.customer_id
            WHERE c.challan_id = :challan_id
        """), {"challan_id": challan_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_challan_items(db: Session, challan_id: int) -> List[Dict[str, Any]]:
        """Get challan items with product details."""
        result = db.execute(text("""
            SELECT ci.*, p.hsn_code, p.gst_percent FROM sales.delivery_challan_items ci
            JOIN inventory.products p ON ci.product_id = p.product_id
            WHERE ci.challan_id = :challan_id
        """), {"challan_id": challan_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def dispatch_challan(db: Session, org_id: str, challan_id: int, dispatch_data: Dict[str, Any]) -> Optional[int]:
        """Dispatch challan."""
        result = db.execute(text("""
            UPDATE sales.delivery_challans SET challan_status = 'dispatched', dispatch_date = :dispatch_date,
            dispatch_time = :dispatch_time, vehicle_number = COALESCE(:vehicle_number, vehicle_number),
            driver_name = COALESCE(:driver_name, driver_name), driver_phone = COALESCE(:driver_phone, driver_phone),
            dispatched_by = :dispatched_by
            WHERE challan_id = :challan_id AND org_id = :org_id AND challan_status = 'draft'
            RETURNING challan_id
        """), {"challan_id": challan_id, "org_id": org_id, **dispatch_data})
        return result.scalar()
    
    @staticmethod
    def update_order_delivery_status_from_challan(db: Session, challan_id: int, status: str) -> None:
        """Update order delivery status from challan."""
        db.execute(text("""
            UPDATE sales.orders SET delivery_status = :status
            WHERE order_id = (SELECT order_id FROM sales.delivery_challans WHERE challan_id = :challan_id)
        """), {"challan_id": challan_id, "status": status})
    
    @staticmethod
    def deliver_challan(db: Session, org_id: str, challan_id: int) -> Optional[Dict[str, Any]]:
        """Mark challan as delivered."""
        result = db.execute(text("""
            UPDATE sales.delivery_challans SET challan_status = 'delivered', delivery_time = :delivery_time
            WHERE challan_id = :challan_id AND org_id = :org_id AND challan_status = 'dispatched'
            RETURNING challan_id, order_id
        """), {"challan_id": challan_id, "org_id": org_id, "delivery_time": datetime.now()})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def update_order_delivered(db: Session, order_id: int) -> None:
        """Update order as delivered."""
        db.execute(text("""
            UPDATE sales.orders SET delivery_status = 'delivered', delivery_date = :delivery_date,
            delivered_at = :delivered_at WHERE order_id = :order_id
        """), {"order_id": order_id, "delivery_date": date.today(), "delivered_at": datetime.now()})
    
    @staticmethod
    def check_challan_exists(db: Session, org_id: str, challan_id: int) -> bool:
        """Check if challan exists."""
        result = db.execute(text("""
            SELECT challan_id FROM sales.delivery_challans WHERE challan_id = :challan_id AND org_id = :org_id
        """), {"challan_id": challan_id, "org_id": org_id})
        return result.first() is not None
    
    @staticmethod
    def get_challan_analytics(db: Session, start_date: date = None, end_date: date = None) -> Dict[str, Any]:
        """Get challan analytics."""
        query = """
            SELECT COUNT(*) as total_challans, COUNT(CASE WHEN challan_status = 'draft' THEN 1 END) as draft_count,
                   COUNT(CASE WHEN challan_status = 'dispatched' THEN 1 END) as dispatched_count,
                   COUNT(CASE WHEN challan_status = 'delivered' THEN 1 END) as delivered_count,
                   COUNT(CASE WHEN challan_status = 'cancelled' THEN 1 END) as cancelled_count,
                   SUM(freight_charges) as total_freight,
                   AVG(CASE WHEN challan_status = 'delivered' AND dispatch_time IS NOT NULL
                       THEN EXTRACT(EPOCH FROM (delivery_time - dispatch_time))/3600 END) as avg_delivery_hours
            FROM sales.delivery_challans WHERE 1=1
        """
        params = {}
        if start_date:
            query += " AND challan_date >= :start_date"
            params["start_date"] = start_date
        if end_date:
            query += " AND challan_date <= :end_date"
            params["end_date"] = end_date
        result = db.execute(text(query), params)
        return dict(result.first()._mapping)
    
    @staticmethod
    def get_delivery_by_city(db: Session, start_date: date = None, end_date: date = None) -> List[Dict[str, Any]]:
        """Get delivery performance by city."""
        result = db.execute(text("""
            SELECT delivery_city, COUNT(*) as challan_count,
                   COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
                   AVG(CASE WHEN challan_status = 'delivered' AND dispatch_time IS NOT NULL
                       THEN EXTRACT(EPOCH FROM (delivery_time - dispatch_time))/3600 END) as avg_delivery_hours
            FROM sales.delivery_challans
            WHERE challan_date >= COALESCE(:start_date, challan_date) AND challan_date <= COALESCE(:end_date, challan_date)
            GROUP BY delivery_city ORDER BY challan_count DESC LIMIT 10
        """), {"start_date": start_date, "end_date": end_date})
        return [dict(row._mapping) for row in result]
