"""
GRN (Goods Receipt Note) Service
Business logic for receiving goods against purchase orders
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
from ..inventory.inventory_service import InventoryService
from ....core.utils.constants import GRNStatus

logger = logging.getLogger(__name__)


class GRNService:
    """
    Service class for GRN-related business logic
    Centralizes all GRN operations - routes should call these methods
    """
    
    @staticmethod
    def generate_grn_number(db: Session, org_id: str) -> str:
        """Generate GRN number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "grn", org_id)
    
    @staticmethod
    def create_grn(
        db: Session,
        org_id: str,
        branch_id: int,
        grn_data: Dict[str, Any],
        user_id: int
    ) -> Dict[str, Any]:
        """
        Create a Goods Receipt Note with items
        
        Args:
            db: Database session
            org_id: Organization ID
            branch_id: Branch ID
            grn_data: GRN data including items
            user_id: User creating the GRN
            
        Returns:
            Dict with grn_id, grn_number, and status
        """
        try:
            # Generate GRN number if not provided
            grn_number = grn_data.get("grn_number") or grn_data.get("grn_no")
            if not grn_number:
                grn_number = GRNService.generate_grn_number(db, org_id)
            
            # Insert GRN header
            result = db.execute(text("""
                INSERT INTO procurement.goods_receipt_notes (
                    org_id, branch_id, grn_number, grn_date, grn_type,
                    purchase_order_id, supplier_id, 
                    supplier_invoice_number, supplier_invoice_date,
                    supplier_challan_number, supplier_challan_date,
                    received_by, received_at,
                    transport_mode, vehicle_number, lr_number, lr_date,
                    qc_required, qc_status,
                    supplier_amount, calculated_amount,
                    grn_status, stock_updated,
                    notes, created_at, updated_at
                ) VALUES (
                    :org_id, :branch_id, :grn_number, :grn_date, :grn_type,
                    :purchase_order_id, :supplier_id,
                    :supplier_invoice_number, :supplier_invoice_date,
                    :supplier_challan_number, :supplier_challan_date,
                    :received_by, :received_at,
                    :transport_mode, :vehicle_number, :lr_number, :lr_date,
                    :qc_required, :qc_status,
                    :supplier_amount, :calculated_amount,
                    :grn_status, :stock_updated,
                    :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING grn_id
            """), {
                "org_id": org_id,
                "branch_id": branch_id,
                "grn_number": grn_number,
                "grn_date": grn_data.get("grn_date", date.today()),
                "grn_type": grn_data.get("grn_type", "regular"),
                "purchase_order_id": grn_data.get("purchase_order_id") or grn_data.get("po_reference"),
                "supplier_id": grn_data.get("supplier_id"),
                "supplier_invoice_number": grn_data.get("supplier_invoice_number") or grn_data.get("supplier_invoice_no"),
                "supplier_invoice_date": grn_data.get("supplier_invoice_date"),
                "supplier_challan_number": grn_data.get("supplier_challan_number") or grn_data.get("challan_number"),
                "supplier_challan_date": grn_data.get("supplier_challan_date") or grn_data.get("challan_date"),
                "received_by": user_id,
                "received_at": datetime.now(),
                "transport_mode": grn_data.get("transport_mode", "Road"),
                "vehicle_number": grn_data.get("vehicle_number") or grn_data.get("vehicle_no"),
                "lr_number": grn_data.get("lr_number"),
                "lr_date": grn_data.get("lr_date"),
                "qc_required": grn_data.get("qc_required", False),
                "qc_status": "pending" if grn_data.get("qc_required") else "not_required",
                "supplier_amount": grn_data.get("supplier_amount"),
                "calculated_amount": grn_data.get("total_amount"),
                "grn_status": GRNStatus.CREATED.value if hasattr(GRNStatus, 'CREATED') else "created",
                "stock_updated": False,
                "notes": grn_data.get("notes")
            })
            
            grn_id = result.scalar()
            
            # Insert GRN items
            items = grn_data.get("items", [])
            items_created = 0
            
            for idx, item in enumerate(items):
                GRNService._create_grn_item(db, grn_id, item, idx + 1)
                items_created += 1
            
            # If QC not required, update inventory immediately
            if not grn_data.get("qc_required", False):
                batches_created = GRNService._update_inventory(
                    db, org_id, grn_id, grn_data.get("supplier_id"), items
                )
                
                # Mark stock as updated
                db.execute(text("""
                    UPDATE procurement.goods_receipt_notes 
                    SET stock_updated = true, stock_updated_at = CURRENT_TIMESTAMP 
                    WHERE grn_id = :grn_id
                """), {"grn_id": grn_id})
            else:
                batches_created = 0
            
            logger.info(f"Created GRN {grn_number} (ID: {grn_id}) with {items_created} items")
            
            return {
                "grn_id": grn_id,
                "grn_number": grn_number,
                "items_created": items_created,
                "batches_created": batches_created,
                "stock_updated": not grn_data.get("qc_required", False)
            }
            
        except Exception as e:
            logger.error(f"Error creating GRN: {str(e)}")
            raise
    
    @staticmethod
    def _create_grn_item(
        db: Session,
        grn_id: int,
        item: Dict[str, Any],
        display_order: int
    ) -> int:
        """Create a single GRN item"""
        result = db.execute(text("""
            INSERT INTO procurement.grn_items (
                grn_id, product_id, batch_number, 
                manufacturing_date, expiry_date,
                ordered_quantity, received_quantity, 
                accepted_quantity, rejected_quantity, free_quantity,
                uom, pack_type, pack_size,
                unit_price, mrp, ptr, pts,
                qc_status, item_status, display_order, created_at
            ) VALUES (
                :grn_id, :product_id, :batch_number,
                :manufacturing_date, :expiry_date,
                :ordered_quantity, :received_quantity,
                :accepted_quantity, :rejected_quantity, :free_quantity,
                :uom, :pack_type, :pack_size,
                :unit_price, :mrp, :ptr, :pts,
                :qc_status, :item_status, :display_order, CURRENT_TIMESTAMP
            ) RETURNING grn_item_id
        """), {
            "grn_id": grn_id,
            "product_id": item.get("product_id"),
            "batch_number": item.get("batch_number") or item.get("batch_no"),
            "manufacturing_date": item.get("manufacturing_date") or item.get("mfg_date"),
            "expiry_date": item.get("expiry_date"),
            "ordered_quantity": item.get("ordered_quantity", 0),
            "received_quantity": item.get("received_quantity") or item.get("quantity"),
            "accepted_quantity": item.get("accepted_quantity") or item.get("quantity"),
            "rejected_quantity": item.get("rejected_quantity", 0),
            "free_quantity": item.get("free_quantity", 0),
            "uom": item.get("uom", "Strip"),
            "pack_type": item.get("pack_type", "STRIP"),
            "pack_size": item.get("pack_size", 10),
            "unit_price": item.get("unit_price") or item.get("purchase_price"),
            "mrp": item.get("mrp"),
            "ptr": item.get("ptr"),
            "pts": item.get("pts"),
            "qc_status": item.get("qc_status", "pending"),
            "item_status": item.get("item_status", "received"),
            "display_order": display_order
        })
        
        return result.scalar()
    
    @staticmethod
    def _update_inventory(
        db: Session,
        org_id: str,
        grn_id: int,
        supplier_id: Optional[int],
        items: List[Dict[str, Any]]
    ) -> int:
        """
        Create/update inventory batches from GRN items
        
        Uses correct schema column names:
        - mrp_per_unit (not mrp)
        - initial_quantity (not quantity_received)
        - source_type, source_reference_id
        - storage_condition (not storage_temperature)
        """
        batches_created = 0
        
        for item in items:
            quantity = item.get("quantity") or item.get("received_quantity") or 0
            if quantity <= 0:
                continue
            
            db.execute(text("""
                INSERT INTO inventory.batches (
                    org_id, product_id, batch_number, 
                    manufacturing_date, expiry_date,
                    mrp_per_unit, initial_quantity, quantity_available, 
                    cost_per_unit, supplier_id,
                    source_type, source_reference_id, batch_status,
                    storage_condition, 
                    pack_size, pack_type, pack_uom, base_uom, units_per_pack,
                    created_at, updated_at
                ) VALUES (
                    :org_id, :product_id, :batch_number,
                    :manufacturing_date, :expiry_date,
                    :mrp_per_unit, :initial_quantity, :quantity_available,
                    :cost_per_unit, :supplier_id,
                    :source_type, :source_reference_id, :batch_status,
                    :storage_condition,
                    :pack_size, :pack_type, :pack_uom, :base_uom, :units_per_pack,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (org_id, product_id, batch_number) 
                DO UPDATE SET 
                    initial_quantity = inventory.batches.initial_quantity + EXCLUDED.initial_quantity,
                    quantity_available = inventory.batches.quantity_available + EXCLUDED.quantity_available,
                    updated_at = CURRENT_TIMESTAMP
            """), {
                "org_id": org_id,
                "product_id": item.get("product_id"),
                "batch_number": item.get("batch_number") or item.get("batch_no"),
                "manufacturing_date": item.get("manufacturing_date") or item.get("mfg_date"),
                "expiry_date": item.get("expiry_date"),
                "mrp_per_unit": item.get("mrp"),
                "initial_quantity": quantity,
                "quantity_available": quantity,
                "cost_per_unit": item.get("unit_price") or item.get("purchase_price"),
                "supplier_id": supplier_id,
                "source_type": "GRN",
                "source_reference_id": grn_id,
                "batch_status": "active",
                "storage_condition": item.get("storage_conditions", "room_temperature"),
                "pack_size": item.get("pack_size", 1),
                "pack_type": item.get("pack_type", "PACK"),
                "pack_uom": item.get("pack_uom", "PACK"),
                "base_uom": item.get("base_uom", "NOS"),
                "units_per_pack": item.get("units_per_pack", 1)
            })
            
            batches_created += 1
        
        return batches_created
    
    @staticmethod
    def get_grn_by_id(
        db: Session,
        grn_id: int,
        org_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get GRN details by ID"""
        result = db.execute(text("""
            SELECT g.*, s.supplier_name
            FROM procurement.goods_receipt_notes g
            LEFT JOIN parties.suppliers s ON g.supplier_id = s.supplier_id
            WHERE g.grn_id = :grn_id AND g.org_id = :org_id
        """), {"grn_id": grn_id, "org_id": org_id}).first()
        
        if not result:
            return None
        
        return dict(result._mapping)
    
    @staticmethod
    def get_grn_items(
        db: Session,
        grn_id: int
    ) -> List[Dict[str, Any]]:
        """Get all items for a GRN"""
        result = db.execute(text("""
            SELECT gi.*, p.product_name, p.hsn_code
            FROM procurement.grn_items gi
            JOIN inventory.products p ON gi.product_id = p.product_id
            WHERE gi.grn_id = :grn_id
            ORDER BY gi.display_order, gi.grn_item_id
        """), {"grn_id": grn_id})
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def approve_grn(
        db: Session,
        grn_id: int,
        org_id: str,
        user_id: int,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Approve a GRN and update inventory if not already done
        
        Args:
            db: Database session
            grn_id: GRN ID to approve
            org_id: Organization ID
            user_id: Approving user ID
            notes: Approval notes
            
        Returns:
            Dict with approval status
        """
        # Get GRN
        grn = GRNService.get_grn_by_id(db, grn_id, org_id)
        if not grn:
            raise ValueError(f"GRN {grn_id} not found")
        
        if grn.get("approval_status") == "approved":
            return {"message": "GRN already approved", "grn_id": grn_id}
        
        # Update inventory if not already done
        batches_created = 0
        if not grn.get("stock_updated"):
            items = GRNService.get_grn_items(db, grn_id)
            batches_created = GRNService._update_inventory(
                db, org_id, grn_id, grn.get("supplier_id"), items
            )
        
        # Update GRN status
        db.execute(text("""
            UPDATE procurement.goods_receipt_notes
            SET approval_status = 'approved',
                approved_by = :user_id,
                approved_at = CURRENT_TIMESTAMP,
                stock_updated = true,
                stock_updated_at = CURRENT_TIMESTAMP,
                grn_status = 'approved',
                notes = COALESCE(:notes, notes)
            WHERE grn_id = :grn_id
        """), {
            "grn_id": grn_id,
            "user_id": user_id,
            "notes": notes
        })
        
        logger.info(f"Approved GRN {grn_id}, created {batches_created} batches")
        
        return {
            "message": "GRN approved successfully",
            "grn_id": grn_id,
            "batches_created": batches_created
        }
