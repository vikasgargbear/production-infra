"""
Inventory service layer for business logic

SECURITY: Uses TenantAwareSession for automatic org_id/branch_id filtering
Do NOT manually filter by org_id - TenantAwareSession handles it

Handles batch management, stock movements, and expiry tracking
"""
from typing import Optional, List, Tuple
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import logging

from ....core.utils.constants import DateDefaults, SourceType

from ...schemas.inventory.inventory import (
    BatchCreate, BatchResponse, StockMovementCreate,
    StockMovementResponse, StockAdjustment,
    CurrentStock, ExpiryAlert,
    StockValuation, InventoryDashboard
)

logger = logging.getLogger(__name__)


class InventoryService:
    """
    Service class for inventory-related business logic
    
    SECURITY NOTE: All methods expect TenantAwareSession which auto-filters by:
    - org_id: Always (hard tenant boundary)
    - branch_id: Based on user's branch_scope
    
    Note: org_id parameter still needed for INSERT operations
    """
    
    @staticmethod
    def calculate_days_to_expiry(expiry_date: date) -> int:
        """Calculate days until expiry"""
        if not expiry_date:
            return None
        return (expiry_date - date.today()).days
    
    @staticmethod
    def get_expiry_alert_level(days_to_expiry: int) -> str:
        """Determine alert level based on days to expiry"""
        if days_to_expiry <= 0:
            return "expired"
        elif days_to_expiry <= 30:
            return "critical"
        elif days_to_expiry <= DateDefaults.NEAR_EXPIRY_THRESHOLD:
            return "warning"
        elif days_to_expiry <= 180:
            return "info"
        return "normal"
    
    @staticmethod
    def create_batch(db: Session, batch_data: BatchCreate, user_id: int = None) -> BatchResponse:
        """Create a new batch with validation"""
        try:
            # Validate product exists (TenantAwareSession auto-adds org_id)
            product = db.execute(text("""
                SELECT product_id, product_name, product_code 
                FROM inventory.products WHERE product_id = :product_id
            """), {"product_id": batch_data.product_id}).fetchone()
            
            if not product:
                raise ValueError(f"Product {batch_data.product_id} not found")
            
            # Check for duplicate batch number
            existing = db.execute(text("""
                SELECT 1 FROM inventory.batches 
                WHERE product_id = :product_id AND batch_number = :batch_number
            """), {
                "product_id": batch_data.product_id,
                "batch_number": batch_data.batch_number
            }).scalar()
            
            if existing:
                raise ValueError(f"Batch {batch_data.batch_number} already exists for this product")
            
            # Create batch - org_id needed for INSERT (creating new record)
            # Map schema field names to actual DB column names
            batch_dict = batch_data.dict()
            result = db.execute(text("""
                INSERT INTO inventory.batches (
                    org_id, product_id, batch_number, manufacturing_date,
                    expiry_date, initial_quantity, quantity_available,
                    cost_per_unit, mrp_per_unit,
                    supplier_id, storage_location, source_type,
                    created_at, updated_at
                ) VALUES (
                    :org_id, :product_id, :batch_number, :manufacturing_date,
                    :expiry_date, :quantity_received, :quantity_available,
                    :cost_price, :mrp,
                    :supplier_id, :location_code, :source_type,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING batch_id
            """), {**batch_dict, "source_type": SourceType.MANUAL.value})

            batch_id = result.scalar()

            # Record stock movement - org_id needed for INSERT
            db.execute(text("""
                INSERT INTO inventory.inventory_movements (
                    org_id, product_id, batch_id, movement_type, movement_direction,
                    movement_date, quantity, reference_type,
                    notes, created_by, created_at
                ) VALUES (
                    :org_id, :product_id, :batch_id, 'purchase', 'in',
                    :movement_date, :quantity, 'batch_creation',
                    'New batch created', :created_by, CURRENT_TIMESTAMP
                )
            """), {
                "org_id": batch_dict["org_id"],
                "product_id": batch_dict["product_id"],
                "batch_id": batch_id,
                "movement_date": date.today(),
                "quantity": batch_dict["quantity_received"],
                "created_by": user_id or batch_dict.get("created_by", 1)
            })
            
            # Note: We do NOT commit here - caller controls transaction
            
            # Return created batch
            return InventoryService.get_batch(db, batch_id)
            
        except Exception as e:
            # Caller handles rollback
            logger.error(f"Error creating batch: {str(e)}")
            raise
    
    @staticmethod
    def get_batch(db: Session, batch_id: int) -> BatchResponse:
        """
        Get batch details with calculated fields.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
            SELECT b.*, p.product_name, p.product_code,
                   b.initial_quantity as quantity_received,
                   b.cost_per_unit as cost_price,
                   b.mrp_per_unit as mrp,
                   b.storage_location as location_code,
                   b.initial_quantity - b.quantity_available - COALESCE(b.quantity_returned, 0) as quantity_sold
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.batch_id = :batch_id
        """), {"batch_id": batch_id})
        
        batch = result.fetchone()
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")
        
        batch_dict = dict(batch._mapping)
        
        # Calculate additional fields
        batch_dict["quantity_sold"] = batch_dict.get("quantity_sold", 0)
        batch_dict["stock_value"] = (
            Decimal(str(batch_dict["quantity_available"])) *
            Decimal(str(batch_dict.get("cost_per_unit", 0)))
        )
        
        if batch_dict["expiry_date"]:
            batch_dict["days_to_expiry"] = InventoryService.calculate_days_to_expiry(
                batch_dict["expiry_date"]
            )
            batch_dict["is_expired"] = batch_dict["days_to_expiry"] <= 0
            batch_dict["is_near_expiry"] = 0 < batch_dict["days_to_expiry"] <= DateDefaults.NEAR_EXPIRY_THRESHOLD
        
        return BatchResponse(**batch_dict)
    
    @staticmethod
    def get_current_stock(db: Session, product_id: int) -> CurrentStock:
        """
        Get current stock summary for a product.
        TenantAwareSession auto-filters by org_id.
        """
        # Get product details
        product = db.execute(text("""
            SELECT product_id, product_code, product_name
            FROM inventory.products WHERE product_id = :product_id
        """), {"product_id": product_id}).fetchone()
        
        if not product:
            raise ValueError(f"Product {product_id} not found")
        
        # Get batch summary
        batch_summary = db.execute(text("""
            SELECT 
                COUNT(*) as total_batches,
                COALESCE(SUM(quantity_available), 0) as total_quantity,
                COALESCE(SUM(quantity_available), 0) as available_quantity,
                COALESCE(SUM(quantity_sold), 0) as allocated_quantity,
                COALESCE(SUM(quantity_available * cost_price), 0) as total_value,
                COALESCE(AVG(cost_price), 0) as average_cost,
                COUNT(CASE WHEN expiry_date <= CURRENT_DATE THEN 1 END) as expired_batches,
                COUNT(CASE WHEN expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 END) as near_expiry_batches
            FROM inventory.batches
            WHERE product_id = :product_id
        """), {"product_id": product_id}).fetchone()
        
        stock_dict = dict(product._mapping)
        stock_dict.update(dict(batch_summary._mapping))
        
        # Check reorder levels
        total_qty = stock_dict["total_quantity"]
        stock_dict["is_below_minimum"] = total_qty < 10  # Default threshold
        stock_dict["is_below_reorder"] = total_qty <= 20  # Default threshold
        
        return CurrentStock(**stock_dict)
    
    @staticmethod
    def record_stock_movement(
        db: Session, 
        movement_data: StockMovementCreate
    ) -> StockMovementResponse:
        """Record a stock movement with comprehensive field support.
        
        Note: This method does NOT commit the transaction - the caller is
        responsible for calling db.commit() to maintain transaction atomicity.
        """
        try:
            # Get current stock levels
            if movement_data.batch_id:
                current = db.execute(text("""
                    SELECT quantity_available FROM inventory.batches 
                    WHERE batch_id = :batch_id
                """), {"batch_id": movement_data.batch_id}).scalar()
            else:
                current = db.execute(text("""
                    SELECT COALESCE(SUM(quantity_available), 0) 
                    FROM inventory.batches WHERE product_id = :product_id
                """), {"product_id": movement_data.product_id}).scalar()
            
            stock_before = current or 0
            
            # Determine direction (explicit or inferred from movement_type)
            direction = movement_data.movement_direction
            if not direction:
                # Infer direction from movement type
                if movement_data.movement_type in ['purchase', 'return', 'adjustment_in']:
                    direction = 'in'
                elif movement_data.movement_type in ['sale', 'writeoff', 'adjustment_out', 'transfer_out']:
                    direction = 'out'
                else:
                    direction = 'in' if movement_data.quantity > 0 else 'out'
            
            # Validate sufficient stock for outward movement
            quantity_change = movement_data.quantity if direction == 'in' else -movement_data.quantity
            if direction == 'out' and movement_data.quantity > stock_before:
                raise ValueError(f"Insufficient stock for this movement. Available: {stock_before}")
            
            # Build movement record - org_id needed for INSERT
            movement_params = {
                "org_id": str(movement_data.org_id) if movement_data.org_id else None,
                "product_id": movement_data.product_id,
                "batch_id": movement_data.batch_id,
                "movement_type": movement_data.movement_type,
                "movement_direction": direction,
                "movement_date": movement_data.movement_date,
                "quantity": movement_data.quantity,
                "pack_type": movement_data.pack_type,
                "base_quantity": movement_data.base_quantity or movement_data.quantity,
                "unit_cost": float(movement_data.unit_cost) if movement_data.unit_cost else None,
                "total_cost": float(movement_data.total_cost) if movement_data.total_cost else None,
                "reference_type": movement_data.reference_type,
                "reference_id": movement_data.reference_id,
                "reference_number": movement_data.reference_number,
                "location_id": movement_data.location_id,
                "transfer_type": movement_data.transfer_type,
                "reason": movement_data.reason,
                "notes": movement_data.notes,
                "created_by": movement_data.created_by
            }
            
            result = db.execute(text("""
                INSERT INTO inventory.inventory_movements (
                    org_id, product_id, batch_id, movement_type, movement_direction,
                    movement_date, quantity, pack_type, base_quantity,
                    unit_cost, total_cost,
                    reference_type, reference_id, reference_number,
                    location_id, transfer_type, reason,
                    created_by, created_at
                ) VALUES (
                    :org_id, :product_id, :batch_id, :movement_type, :movement_direction,
                    :movement_date, :quantity, :pack_type, :base_quantity,
                    :unit_cost, :total_cost,
                    :reference_type, :reference_id, :reference_number,
                    :location_id, :transfer_type, :reason,
                    :created_by, CURRENT_TIMESTAMP
                ) RETURNING movement_id
            """), movement_params)
            
            movement_id = result.scalar()
            
            # Update batch quantities if batch specified
            if movement_data.batch_id:
                db.execute(text("""
                    UPDATE inventory.batches
                    SET quantity_available = quantity_available + :quantity_change,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                """), {
                    "quantity_change": quantity_change,
                    "batch_id": movement_data.batch_id
                })

            # Update location_wise_stock if location_id provided
            if movement_data.location_id and movement_data.org_id:
                org_id_str = str(movement_data.org_id)
                existing = db.execute(text("""
                    SELECT stock_id FROM inventory.location_wise_stock
                    WHERE org_id = :org_id AND product_id = :product_id
                    AND location_id = :location_id
                    AND COALESCE(batch_id, 0) = COALESCE(:batch_id, 0)
                """), {
                    "org_id": org_id_str,
                    "product_id": movement_data.product_id,
                    "location_id": movement_data.location_id,
                    "batch_id": movement_data.batch_id
                }).scalar()

                if existing:
                    if direction == 'in':
                        InventoryService.update_location_stock_increase(
                            db, existing, movement_data.quantity,
                            str(movement_data.movement_date)
                        )
                    else:
                        InventoryService.update_location_stock_decrease(
                            db, existing, movement_data.quantity,
                            str(movement_data.movement_date)
                        )
                elif direction == 'in':
                    InventoryService.insert_location_stock(
                        db, org_id_str, movement_data.location_id,
                        movement_data.product_id, movement_data.batch_id,
                        movement_data.quantity, str(movement_data.movement_date)
                    )

            # Note: We do NOT commit here - caller controls transaction
            # This ensures atomicity when called from returns, invoices, etc.
            
            # Build response
            movement_response = {
                "movement_id": movement_id,
                "org_id": movement_data.org_id,
                "product_id": movement_data.product_id,
                "product_name": "",  # Would need to fetch
                "product_code": "",  # Would need to fetch
                "batch_id": movement_data.batch_id,
                "batch_number": None,
                "movement_type": movement_data.movement_type,
                "movement_date": movement_data.movement_date,
                "quantity": movement_data.quantity,
                "reference_type": movement_data.reference_type,
                "reference_id": movement_data.reference_id,
                "reason": movement_data.reason,
                "notes": movement_data.notes,
                "performed_by": movement_data.performed_by,
                "stock_before": stock_before,
                "stock_after": stock_before + quantity_change,
                "created_at": None
            }
            
            return StockMovementResponse(**movement_response)
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error recording stock movement: {str(e)}")
            raise
    
    @staticmethod
    def process_stock_adjustment(
        db: Session, 
        adjustment: StockAdjustment,
        org_id: UUID
    ) -> StockMovementResponse:
        """Process a stock adjustment"""
        movement_data = StockMovementCreate(
            org_id=org_id,
            product_id=adjustment.product_id,
            batch_id=adjustment.batch_id,
            movement_type="adjustment",
            quantity=adjustment.quantity,
            reference_type="adjustment",
            reason=adjustment.reason,
            notes=adjustment.notes,
            performed_by=None  # Should come from auth
        )
        
        return InventoryService.record_stock_movement(db, movement_data)

    @staticmethod
    def record_stock_transfer(
        db: Session,
        org_id: UUID,
        product_id: int,
        batch_id: int,
        quantity: float,
        source_location_id: int,
        destination_location_id: int,
        movement_date: date = None,
        reason: str = "Stock transfer",
        created_by: int = None
    ) -> dict:
        """
        Atomic stock transfer between two locations.
        Creates two movements (out from source, in to destination)
        and updates location_wise_stock for both.
        """
        from datetime import date as date_type
        if not movement_date:
            movement_date = date_type.today()

        org_id_str = str(org_id)

        # Validate source has sufficient stock
        source_stock = InventoryService.get_location_wise_stock(
            db, org_id_str, product_id, source_location_id, batch_id
        )
        if not source_stock or source_stock["quantity_available"] < quantity:
            available = source_stock["quantity_available"] if source_stock else 0
            raise ValueError(f"Insufficient stock at source location. Available: {available}")

        # 1. OUT movement from source
        out_movement = StockMovementCreate(
            org_id=org_id,
            product_id=product_id,
            batch_id=batch_id,
            movement_type="transfer_out",
            movement_direction="out",
            movement_date=movement_date,
            quantity=quantity,
            reference_type="stock_transfer",
            location_id=source_location_id,
            transfer_type="inter_location",
            reason=reason,
            created_by=created_by
        )
        out_result = InventoryService.record_stock_movement(db, out_movement)

        # 2. IN movement to destination
        in_movement = StockMovementCreate(
            org_id=org_id,
            product_id=product_id,
            batch_id=batch_id,
            movement_type="transfer_in",
            movement_direction="in",
            movement_date=movement_date,
            quantity=quantity,
            reference_type="stock_transfer",
            location_id=destination_location_id,
            transfer_type="inter_location",
            reason=reason,
            created_by=created_by
        )
        in_result = InventoryService.record_stock_movement(db, in_movement)

        return {
            "out_movement_id": out_result.movement_id,
            "in_movement_id": in_result.movement_id,
            "product_id": product_id,
            "batch_id": batch_id,
            "quantity": quantity,
            "source_location_id": source_location_id,
            "destination_location_id": destination_location_id
        }

    @staticmethod
    def get_expiry_alerts(
        db: Session, 
        org_id: UUID,
        days_ahead: int = 180
    ) -> List[ExpiryAlert]:
        """
        Get products expiring within specified days.
        TenantAwareSession auto-filters by org_id.
        """
        cutoff_date = date.today() + timedelta(days=days_ahead)
        
        result = db.execute(text("""
            SELECT 
                b.batch_id, b.product_id, p.product_name, p.product_code,
                b.batch_number, b.expiry_date, b.quantity_available,
                b.quantity_available * b.cost_per_unit as stock_value,
                b.expiry_date - CURRENT_DATE as days_to_expiry
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.quantity_available > 0
                AND b.expiry_date <= :cutoff_date
            ORDER BY b.expiry_date, p.product_name
        """), {
            "cutoff_date": cutoff_date
        })
        
        alerts = []
        for row in result:
            alert = dict(row._mapping)
            alert["alert_level"] = InventoryService.get_expiry_alert_level(
                alert["days_to_expiry"]
            )
            alerts.append(ExpiryAlert(**alert))
        
        return alerts
    
    @staticmethod
    def get_stock_valuation(
        db: Session,
        org_id: UUID,
        as_of_date: Optional[date] = None
    ) -> StockValuation:
        """
        Get stock valuation report.
        TenantAwareSession auto-filters by org_id.
        """
        if not as_of_date:
            as_of_date = date.today()
        
        # Overall summary
        summary = db.execute(text("""
            SELECT 
                COUNT(DISTINCT b.product_id) as total_products,
                COUNT(*) as total_batches,
                COALESCE(SUM(b.quantity_available), 0) as total_quantity,
                COALESCE(SUM(CASE WHEN b.expiry_date <= :as_of_date THEN b.quantity_available ELSE 0 END), 0) as expired_quantity,
                COALESCE(SUM(CASE 
                    WHEN b.expiry_date > :as_of_date AND b.expiry_date <= :as_of_date + INTERVAL '90 days' 
                    THEN b.quantity_available ELSE 0 END), 0) as near_expiry_quantity,
                COALESCE(SUM(b.quantity_available * b.cost_per_unit), 0) as total_value,
                COALESCE(SUM(CASE 
                    WHEN b.expiry_date <= :as_of_date 
                    THEN b.quantity_available * b.cost_per_unit ELSE 0 END), 0) as expired_value,
                COALESCE(SUM(CASE 
                    WHEN b.expiry_date > :as_of_date AND b.expiry_date <= :as_of_date + INTERVAL '90 days' 
                    THEN b.quantity_available * b.cost_per_unit ELSE 0 END), 0) as near_expiry_value
            FROM inventory.batches b
            WHERE b.quantity_available > 0
        """), {
            "as_of_date": as_of_date
        }).fetchone()
        
        valuation = dict(summary._mapping)
        valuation["valuation_date"] = as_of_date
        
        # Category-wise breakdown
        category_result = db.execute(text("""
            SELECT 
                p.category_id,
                COUNT(DISTINCT b.product_id) as products,
                COALESCE(SUM(b.quantity_available), 0) as quantity,
                COALESCE(SUM(b.quantity_available * b.cost_per_unit), 0) as value
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.quantity_available > 0
            GROUP BY p.category_id
            ORDER BY value DESC
        """))
        
        valuation["category_wise"] = [
            dict(row._mapping) for row in category_result
        ]
        
        return StockValuation(**valuation)
    
    @staticmethod
    def get_inventory_dashboard(db: Session, org_id: UUID) -> InventoryDashboard:
        """
        Get inventory dashboard data.
        TenantAwareSession auto-filters by org_id.
        """
        # Stock overview
        overview = db.execute(text("""
            SELECT 
                COUNT(DISTINCT b.product_id) as total_products,
                COUNT(*) as total_batches,
                COALESCE(SUM(b.quantity_available * b.cost_per_unit), 0) as total_stock_value
            FROM inventory.batches b
            WHERE b.quantity_available > 0
        """)).fetchone()
        
        # Alert counts
        alerts = db.execute(text("""
            SELECT 
                COUNT(DISTINCT CASE WHEN b.expiry_date <= CURRENT_DATE THEN b.product_id END) as expired_products,
                COUNT(DISTINCT CASE 
                    WHEN b.expiry_date > CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + INTERVAL '90 days' 
                    THEN b.product_id END) as near_expiry_products,
                COUNT(DISTINCT CASE 
                    WHEN sq.total_quantity < 10 
                    THEN p.product_id END) as low_stock_products,
                COUNT(DISTINCT CASE 
                    WHEN sq.total_quantity = 0 
                    THEN p.product_id END) as out_of_stock_products
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id
            LEFT JOIN (
                SELECT product_id, SUM(quantity_available) as total_quantity
                FROM inventory.batches
                GROUP BY product_id
            ) sq ON p.product_id = sq.product_id
        """)).fetchone()
        
        # Today's activity
        activity = db.execute(text("""
            SELECT 
                COUNT(*) as todays_movements
            FROM inventory.movement_summary
            WHERE DATE(movement_date) = CURRENT_DATE
        """)).fetchone()
        
        # Pending orders
        pending = db.execute(text("""
            SELECT COUNT(*) as pending_orders
            FROM sales.orders
            WHERE order_status IN ('pending', 'confirmed')
        """)).fetchone()
        
        # Fast moving products (last 30 days)
        fast_moving = db.execute(text("""
            SELECT 
                p.product_id, p.product_code, p.product_name,
                COALESCE(SUM(im.quantity), 0) as movement_quantity
            FROM inventory.products p
            LEFT JOIN inventory.movement_summary im ON p.product_id = im.product_id
                AND im.movement_type = 'sale'
                AND im.movement_date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY p.product_id, p.product_code, p.product_name
            ORDER BY movement_quantity DESC
            LIMIT 10
        """))
        
        # Get expiry alerts
        expiry_alerts = InventoryService.get_expiry_alerts(db, org_id, days_ahead=90)
        
        dashboard = {
            **dict(overview._mapping),
            **dict(alerts._mapping),
            "todays_movements": activity.todays_movements,
            "pending_orders": pending.pending_orders,
            "fast_moving_products": [dict(row._mapping) for row in fast_moving],
            "slow_moving_products": [],  # Would need more complex query
            "expiry_alerts": expiry_alerts[:10]  # Top 10 alerts
        }
        
        return InventoryDashboard(**dashboard)
    
    # ==================== BULK OPERATIONS FOR BACKGROUND TASKS ====================
    
    @staticmethod
    def bulk_update_batch_quantities(
        db: Session,
        batch_deductions: List[dict],
        org_id: str
    ) -> int:
        """
        Bulk update batch quantities for invoice/sale processing.
        Used by background tasks for performance.
        
        Args:
            batch_deductions: List of {"batch_id": int, "quantity": int}
            org_id: Organization ID
            
        Returns:
            Number of batches updated
        """
        if not batch_deductions:
            return 0
        
        case_parts = []
        batch_ids_to_update = []
        update_params = {"org_id": org_id}
        
        for i, bd in enumerate(batch_deductions):
            case_parts.append(f"WHEN batch_id = :bid_{i} THEN quantity_available - :qty_{i}")
            batch_ids_to_update.append(bd["batch_id"])
            update_params[f"bid_{i}"] = bd["batch_id"]
            update_params[f"qty_{i}"] = bd["quantity"]
        
        update_params["batch_ids"] = batch_ids_to_update
        
        bulk_update_sql = f"""
            UPDATE inventory.batches
            SET 
                quantity_available = CASE {" ".join(case_parts)} ELSE quantity_available END,
                last_movement_date = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE batch_id = ANY(:batch_ids) AND org_id = :org_id
        """
        db.execute(text(bulk_update_sql), update_params)
        logger.info(f"✅ Bulk updated {len(batch_deductions)} batch quantities")
        
        return len(batch_deductions)
    
    @staticmethod
    def bulk_insert_movements(
        db: Session,
        movement_records: List[dict],
        invoice_id: int,
        created_by: int
    ) -> int:
        """
        Bulk insert inventory movements for invoice processing.
        Used by background tasks for performance.
        
        Args:
            movement_records: List of movement data dicts
            invoice_id: Invoice ID for reference
            created_by: User ID who created the invoice
            
        Returns:
            Number of movements inserted
        """
        if not movement_records:
            return 0
        
        mv_values_list = []
        mv_params = {}
        
        for i, mv in enumerate(movement_records):
            mv_values_list.append(f"""(
                :org_id_{i}, 'sale', 'out',
                :product_id_{i}, :batch_id_{i}, :quantity_{i},
                :pack_type_{i}, :base_quantity_{i},
                :unit_cost_{i}, :total_cost_{i},
                'invoice', :invoice_id_{i}, :reference_number_{i},
                'sale', 'Customer Sale',
                :location_id_{i}, :created_by_{i}, CURRENT_TIMESTAMP
            )""")
            mv_params[f"location_id_{i}"] = mv["location_id"]
            mv_params[f"org_id_{i}"] = mv["org_id"]
            mv_params[f"product_id_{i}"] = mv["product_id"]
            mv_params[f"batch_id_{i}"] = mv["batch_id"]
            mv_params[f"quantity_{i}"] = mv["quantity"]
            mv_params[f"pack_type_{i}"] = mv.get("pack_type")
            mv_params[f"base_quantity_{i}"] = mv.get("base_quantity", mv["quantity"])
            mv_params[f"unit_cost_{i}"] = mv.get("unit_cost", 0)
            mv_params[f"total_cost_{i}"] = mv.get("total_cost", 0)
            mv_params[f"invoice_id_{i}"] = invoice_id
            mv_params[f"reference_number_{i}"] = f"INV-{invoice_id}"
            mv_params[f"created_by_{i}"] = created_by
        
        bulk_mv_sql = f"""
            INSERT INTO inventory.inventory_movements (
                org_id, movement_type, movement_direction,
                product_id, batch_id, quantity,
                pack_type, base_quantity,
                unit_cost, total_cost,
                reference_type, reference_id, reference_number,
                transfer_type, reason,
                location_id, created_by, movement_date
            ) VALUES {", ".join(mv_values_list)}
        """
        db.execute(text(bulk_mv_sql), mv_params)
        logger.info(f"✅ Bulk inserted {len(movement_records)} inventory movements")
        
        return len(movement_records)
    
    # =========================================================================
    # MOVEMENT QUERY METHODS
    # =========================================================================
    
    @staticmethod
    def list_inventory_movements(
        db: Session, org_id: str,
        movement_type: str = None, product_id: int = None, batch_id: int = None,
        location_id: int = None, from_date: str = None, to_date: str = None,
        sort: str = "movement_date", order: str = "desc",
        limit: int = 100, skip: int = 0
    ) -> List[dict]:
        """List inventory movements with filters."""
        query = """
            SELECT
                im.movement_id, im.movement_type, im.movement_date, im.movement_direction,
                im.product_id, p.product_name, p.product_code,
                im.batch_id, b.batch_number, im.quantity,
                COALESCE(im.unit_cost, 0) as unit_price,
                COALESCE(im.total_cost, im.quantity * im.unit_cost, 0) as total_value,
                im.reference_type, im.reference_number,
                im.from_location_id, fl.location_name as from_location_name,
                im.to_location_id, tl.location_name as to_location_name,
                im.reason, im.notes, im.created_at, im.created_by,
                u.username as created_by_name
            FROM inventory.inventory_movements im
            LEFT JOIN inventory.products p ON im.product_id = p.product_id
            LEFT JOIN inventory.batches b ON im.batch_id = b.batch_id
            LEFT JOIN inventory.storage_locations fl ON im.from_location_id = fl.location_id
            LEFT JOIN inventory.storage_locations tl ON im.to_location_id = tl.location_id
            LEFT JOIN master.org_users u ON im.created_by = u.user_id
            WHERE im.org_id = :org_id
        """
        params = {"org_id": org_id, "limit": limit, "skip": skip}
        
        if movement_type:
            query += " AND im.movement_type = :movement_type"
            params["movement_type"] = movement_type
        if product_id:
            query += " AND im.product_id = :product_id"
            params["product_id"] = product_id
        if batch_id:
            query += " AND im.batch_id = :batch_id"
            params["batch_id"] = batch_id
        if location_id:
            query += " AND (im.from_location_id = :location_id OR im.to_location_id = :location_id)"
            params["location_id"] = location_id
        if from_date:
            query += " AND im.movement_date >= :from_date::date"
            params["from_date"] = from_date
        if to_date:
            query += " AND im.movement_date <= :to_date::date + INTERVAL '1 day'"
            params["to_date"] = to_date
        
        sort_field = "im.movement_date" if sort == "movement_date" else "im.movement_id"
        sort_order = "DESC" if order == "desc" else "ASC"
        query += f" ORDER BY {sort_field} {sort_order} LIMIT :limit OFFSET :skip"
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def count_inventory_movements(
        db: Session, org_id: str,
        movement_type: str = None, product_id: int = None, batch_id: int = None,
        from_date: str = None, to_date: str = None
    ) -> int:
        """Count inventory movements with filters."""
        query = "SELECT COUNT(*) FROM inventory.inventory_movements im WHERE im.org_id = :org_id"
        params = {"org_id": org_id}
        
        if movement_type:
            query += " AND im.movement_type = :movement_type"
            params["movement_type"] = movement_type
        if product_id:
            query += " AND im.product_id = :product_id"
            params["product_id"] = product_id
        if batch_id:
            query += " AND im.batch_id = :batch_id"
            params["batch_id"] = batch_id
        if from_date:
            query += " AND im.movement_date >= :from_date::date"
            params["from_date"] = from_date
        else:
            query += " AND im.movement_date >= (CURRENT_DATE - INTERVAL '30 days')"
        if to_date:
            query += " AND im.movement_date <= :to_date::date + INTERVAL '1 day'"
            params["to_date"] = to_date
        
        return db.execute(text(query), params).scalar() or 0
    
    @staticmethod
    def get_product_by_id(db: Session, org_id: str, product_id: int) -> Optional[dict]:
        """Get product by ID."""
        result = db.execute(text(
            "SELECT * FROM inventory.products WHERE product_id = :product_id AND org_id = :org_id"
        ), {"product_id": product_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_location_wise_stock(
        db: Session, org_id: str, product_id: int, location_id: int, batch_id: int = None
    ) -> Optional[dict]:
        """Get location-wise stock entry."""
        result = db.execute(text("""
            SELECT * FROM inventory.location_wise_stock 
            WHERE org_id = :org_id AND product_id = :product_id 
            AND location_id = :location_id
            AND COALESCE(batch_id, 0) = COALESCE(:batch_id, 0)
        """), {"org_id": org_id, "product_id": product_id, "location_id": location_id, "batch_id": batch_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def update_location_stock_increase(db: Session, stock_id: int, quantity: float, movement_date: str) -> None:
        """Increase location stock quantity (both on_hand and available)."""
        db.execute(text("""
            UPDATE inventory.location_wise_stock
            SET quantity_on_hand = quantity_on_hand + :quantity,
                quantity_available = quantity_available + :quantity,
                last_movement_date = :movement_date, updated_at = CURRENT_TIMESTAMP
            WHERE stock_id = :stock_id
        """), {"quantity": quantity, "movement_date": movement_date, "stock_id": stock_id})
    
    @staticmethod
    def update_location_stock_decrease(db: Session, stock_id: int, quantity: float, movement_date: str) -> None:
        """Decrease location stock quantity."""
        db.execute(text("""
            UPDATE inventory.location_wise_stock 
            SET quantity_on_hand = quantity_on_hand - :quantity,
                quantity_available = quantity_available - :quantity,
                last_movement_date = :movement_date, updated_at = CURRENT_TIMESTAMP
            WHERE stock_id = :stock_id
        """), {"quantity": quantity, "movement_date": movement_date, "stock_id": stock_id})
    
    @staticmethod
    def insert_location_stock(
        db: Session, org_id: str, location_id: int, product_id: int,
        batch_id: int, quantity: float, movement_date: str
    ) -> None:
        """Insert new location stock entry."""
        db.execute(text("""
            INSERT INTO inventory.location_wise_stock (
                org_id, location_id, product_id, batch_id,
                quantity_on_hand, quantity_available, quantity_reserved, last_movement_date
            ) VALUES (:org_id, :location_id, :product_id, :batch_id, :quantity, :quantity, 0, :movement_date)
        """), {
            "org_id": org_id, "location_id": location_id, "product_id": product_id,
            "batch_id": batch_id, "quantity": quantity, "movement_date": movement_date
        })
    
    @staticmethod
    def get_product_batches_with_stock(db: Session, org_id: str, product_id: int) -> List[dict]:
        """Get available batches for a product."""
        result = db.execute(text("""
            SELECT batch_id, batch_number, expiry_date, manufacturing_date, quantity_available,
                   cost_per_unit as purchase_price, sale_price_per_unit as selling_price, mrp_per_unit as mrp
            FROM inventory.batches
            WHERE org_id = :org_id AND product_id = :product_id AND quantity_available > 0
            AND batch_status = 'active'
            AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
            ORDER BY expiry_date ASC NULLS LAST, batch_number
        """), {"org_id": org_id, "product_id": product_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_near_expiry_stock(db: Session, org_id: str, days: int) -> List[dict]:
        """Get products nearing expiry."""
        result = db.execute(text("""
            SELECT b.batch_id, b.batch_number, b.product_id, b.expiry_date,
                   b.quantity_available, b.cost_per_unit, b.mrp_per_unit,
                   p.product_name, p.hsn_code,
                   EXTRACT(DAY FROM b.expiry_date - CURRENT_DATE) as days_to_expiry
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id AND b.org_id = p.org_id
            WHERE b.org_id = :org_id AND b.quantity_available > 0
            AND b.batch_status = 'active'
            AND b.expiry_date IS NOT NULL
            AND b.expiry_date <= CURRENT_DATE + make_interval(days => :days)
            ORDER BY b.expiry_date ASC
        """), {"org_id": org_id, "days": days})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_low_stock_items(db: Session, org_id: str) -> List[dict]:
        """Get products with low stock (below reorder level)."""
        result = db.execute(text("""
            SELECT p.product_id, p.product_name, p.hsn_code, p.reorder_level, p.reorder_quantity,
                   COALESCE(SUM(b.quantity_available), 0) as total_stock
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id
                AND b.org_id = p.org_id AND b.batch_status = 'active'
            WHERE p.org_id = :org_id AND p.reorder_level IS NOT NULL AND p.reorder_level > 0
            GROUP BY p.product_id, p.product_name, p.hsn_code, p.reorder_level, p.reorder_quantity
            HAVING COALESCE(SUM(b.quantity_available), 0) <= p.reorder_level
            ORDER BY (COALESCE(SUM(b.quantity_available), 0) / NULLIF(p.reorder_level, 0)) ASC
        """), {"org_id": org_id})
        return [dict(row._mapping) for row in result]
    
    # =========================================================================
    # STOCK QUERY METHODS
    # =========================================================================
    
    @staticmethod
    def get_inventory_overview(db: Session) -> dict:
        """Get inventory overview."""
        result = db.execute(text("""
            SELECT COUNT(*) as total_products,
                   SUM(CASE WHEN quantity_available > 0 THEN 1 ELSE 0 END) as products_in_stock,
                   SUM(quantity_available) as total_quantity
            FROM inventory.batches WHERE batch_status = 'active'
        """), {})
        row = result.fetchone()
        return dict(row._mapping) if row else {}
    
    @staticmethod
    def list_batches(
        db: Session, product_id: int = None, location: str = None,
        include_expired: bool = False, expiring_in_days: int = None,
        limit: int = 100, skip: int = 0
    ) -> Tuple[List[dict], int]:
        """List batches with filters. Returns (batches, total)."""
        query = """
            SELECT b.*, p.product_name, p.product_code,
                   b.expiry_date - CURRENT_DATE as days_to_expiry,
                   b.quantity_available * b.cost_per_unit as stock_value
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id AND b.org_id = p.org_id
            WHERE 1=1
        """
        params = {}
        
        if product_id:
            query += " AND b.product_id = :product_id"
            params["product_id"] = product_id
        if location:
            query += " AND b.storage_location ILIKE :location"
            params["location"] = f"%{location}%"
        if not include_expired:
            query += " AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)"
        if expiring_in_days:
            query += " AND b.expiry_date <= CURRENT_DATE + INTERVAL '1 day' * :days"
            params["days"] = expiring_in_days
        
        count_query = f"SELECT COUNT(*) FROM ({query}) t"
        total = db.execute(text(count_query), params).scalar() or 0
        
        query += " ORDER BY b.expiry_date, b.batch_id LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result], total
    
    @staticmethod
    def list_current_stock(
        db: Session, category: str = None, low_stock_only: bool = False,
        limit: int = 100, skip: int = 0
    ) -> Tuple[List[dict], int]:
        """List current stock levels. Returns (stocks, total)."""
        query = """
            SELECT p.product_id, p.product_code, p.product_name, p.category_id,
                   c.category_name as category, p.product_type, p.product_class,
                   p.manufacturer, p.brand, p.generic_name, p.hsn_code, p.reorder_level,
                   COALESCE(b.total_quantity, 0) as total_quantity,
                   COALESCE(b.available_quantity, 0) as available_quantity,
                   COALESCE(b.allocated_quantity, 0) as allocated_quantity,
                   COALESCE(b.total_batches, 0) as total_batches,
                   COALESCE(b.expired_batches, 0) as expired_batches,
                   COALESCE(b.near_expiry_batches, 0) as near_expiry_batches,
                   COALESCE(b.total_value, 0) as total_value,
                   COALESCE(b.average_cost, 0) as average_cost
            FROM inventory.products p
            LEFT JOIN inventory.product_categories c ON p.category_id = c.category_id AND p.org_id = c.org_id
            LEFT JOIN (
                SELECT product_id, COUNT(*) as total_batches,
                       SUM(quantity_available) as total_quantity,
                       SUM(quantity_available) as available_quantity,
                       SUM(COALESCE(quantity_reserved, 0)) as allocated_quantity,
                       SUM(quantity_available * cost_per_unit) as total_value,
                       AVG(cost_per_unit) as average_cost,
                       COUNT(CASE WHEN expiry_date <= CURRENT_DATE THEN 1 END) as expired_batches,
                       COUNT(CASE WHEN expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 END) as near_expiry_batches
                FROM inventory.batches WHERE 1=1 GROUP BY product_id
            ) b ON p.product_id = b.product_id
            WHERE 1=1
        """
        params = {}
        
        if category:
            query += " AND p.category_id = :category"
            params["category"] = category
        if low_stock_only:
            query += " AND COALESCE(b.total_quantity, 0) <= 10"
        
        count_query = f"SELECT COUNT(*) FROM ({query}) t"
        total = db.execute(text(count_query), params).scalar() or 0
        
        query += " ORDER BY p.product_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result], total
    
    # =========================================================================
    # ADJUSTMENT QUERY METHODS
    # =========================================================================
    
    @staticmethod
    def list_stock_adjustments(
        db: Session, org_id: str, product_id: int = None, batch_id: int = None,
        adjustment_type: str = None, start_date = None, end_date = None,
        limit: int = 100, skip: int = 0
    ) -> List[dict]:
        """List stock adjustments from inventory movements."""
        type_mapping = {"damage": "stock_damage", "expiry": "stock_expiry", "count": "stock_count", "other": "stock_adjustment"}
        
        query = """
            SELECT movement_id as adjustment_id, movement_date as adjustment_date,
                   movement_type as adjustment_type, product_id, batch_id,
                   CASE WHEN movement_direction = 'in' THEN quantity ELSE -quantity END as quantity_adjusted,
                   reason, reference_number, created_by as adjusted_by, created_at, org_id
            FROM inventory.inventory_movements
            WHERE movement_type IN ('stock_damage', 'stock_expiry', 'stock_count', 'stock_adjustment')
            AND org_id = :org_id
        """
        params = {"org_id": org_id, "limit": limit, "skip": skip}
        
        if product_id:
            query += " AND product_id = :product_id"
            params["product_id"] = product_id
        if batch_id:
            query += " AND batch_id = :batch_id"
            params["batch_id"] = batch_id
        if adjustment_type:
            movement_type = type_mapping.get(adjustment_type, 'stock_adjustment')
            query += " AND movement_type = :movement_type"
            params["movement_type"] = movement_type
        if start_date:
            query += " AND movement_date >= :start_date"
            params["start_date"] = start_date
        if end_date:
            query += " AND movement_date <= :end_date"
            params["end_date"] = end_date
        
        query += " ORDER BY movement_date DESC LIMIT :limit OFFSET :skip"
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_batch_for_adjustment(db: Session, org_id: str, batch_id: int) -> Optional[dict]:
        """Get batch with product info for adjustment."""
        result = db.execute(text("""
            SELECT b.*, p.product_name, COALESCE(b.cost_per_unit, 0) as unit_cost
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.batch_id = :batch_id AND b.org_id = :org_id
        """), {"batch_id": batch_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_expired_batches(db: Session, org_id: str) -> List[dict]:
        """Get expired batches with available stock."""
        result = db.execute(text("""
            SELECT b.*, p.product_name
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            WHERE b.expiry_date <= CURRENT_DATE AND b.quantity_available > 0
            AND b.batch_status != 'expired' AND b.org_id = :org_id
        """), {"org_id": org_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def update_batch_status(db: Session, batch_id: int, status: str) -> None:
        """Update batch status."""
        db.execute(text("""
            UPDATE inventory.batches SET batch_status = :status WHERE batch_id = :batch_id
        """), {"batch_id": batch_id, "status": status})
    
    @staticmethod
    def get_adjustment_analytics(
        db: Session, org_id: str, start_date = None, end_date = None
    ) -> dict:
        """Get stock adjustment analytics."""
        query = """
            SELECT COUNT(*) as total_adjustments,
                   COALESCE(SUM(CASE WHEN movement_direction = 'in' THEN quantity ELSE 0 END), 0) as total_quantity_added,
                   COALESCE(SUM(CASE WHEN movement_direction = 'out' THEN quantity ELSE 0 END), 0) as total_quantity_removed,
                   COUNT(DISTINCT product_id) as products_affected,
                   COUNT(DISTINCT batch_id) as batches_affected,
                   COUNT(CASE WHEN movement_type = 'stock_damage' THEN 1 END) as damage_adjustments,
                   COUNT(CASE WHEN movement_type = 'stock_expiry' THEN 1 END) as expiry_adjustments,
                   COUNT(CASE WHEN movement_type = 'stock_count' THEN 1 END) as count_adjustments
            FROM inventory.inventory_movements
            WHERE movement_type IN ('stock_damage', 'stock_expiry', 'stock_count', 'stock_adjustment')
            AND org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if start_date:
            query += " AND movement_date >= :start_date"
            params["start_date"] = start_date
        if end_date:
            query += " AND movement_date <= :end_date"
            params["end_date"] = end_date
        
        result = db.execute(text(query), params)
        row = result.first()
        return dict(row._mapping) if row else {}