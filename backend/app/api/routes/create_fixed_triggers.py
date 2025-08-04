"""
API to create fixed triggers with correct schema and column names
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any
import logging

from ...core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/database-fix", tags=["Database Fix"])

@router.post("/create-fixed-triggers")
async def create_fixed_triggers(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Create all 4 triggers with FIXED schema and column names
    Instead of dropping, we're fixing them to work properly
    """
    try:
        created_triggers = []
        errors = []
        
        # First drop old broken versions
        logger.info("Dropping old broken triggers...")
        old_triggers = [
            ("calculate_gst_on_invoice_item_trigger", "sales.invoice_items"),
            ("sync_order_invoice_status_trigger", "sales.orders"),
            ("sync_order_invoice_status_trigger", "sales.invoices"),
            ("trigger_sync_order_invoice_status", "sales.invoices"),
            ("inventory_update_on_sale_trigger", "sales.invoice_items"),
            ("trigger_inventory_update_on_sale", "sales.invoice_items"),
            ("update_invoice_totals_trigger", "sales.invoice_items")
        ]
        
        for trigger_name, table_name in old_triggers:
            try:
                db.execute(text(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table_name} CASCADE"))
            except:
                pass  # Ignore errors on drop
        
        # Drop old functions
        old_functions = [
            "calculate_gst_on_invoice_item",
            "sync_order_invoice_status",
            "update_inventory_on_sale",
            "update_invoice_totals"
        ]
        
        for func in old_functions:
            try:
                db.execute(text(f"DROP FUNCTION IF EXISTS {func}() CASCADE"))
            except:
                pass
        
        # 1. Create FIXED GST Calculation Trigger
        logger.info("Creating fixed GST calculation trigger...")
        try:
            db.execute(text("""
                CREATE OR REPLACE FUNCTION calculate_gst_on_invoice_item()
                RETURNS TRIGGER AS $$
                DECLARE
                    v_gst_rate NUMERIC;
                    v_taxable_amount NUMERIC;
                BEGIN
                    -- Get GST rate from product
                    SELECT COALESCE(gst_percent, 12) INTO v_gst_rate
                    FROM inventory.products
                    WHERE product_id = NEW.product_id;
                    
                    -- Calculate taxable amount
                    v_taxable_amount := NEW.quantity * NEW.unit_price - COALESCE(NEW.discount_amount, 0);
                    NEW.taxable_amount := v_taxable_amount;
                    
                    -- For simplicity, always use CGST+SGST (intrastate)
                    NEW.cgst_rate := v_gst_rate / 2;
                    NEW.sgst_rate := v_gst_rate / 2;
                    NEW.igst_rate := 0;
                    NEW.cgst_amount := v_taxable_amount * (v_gst_rate / 200);
                    NEW.sgst_amount := v_taxable_amount * (v_gst_rate / 200);
                    NEW.igst_amount := 0;
                    
                    -- Calculate totals
                    NEW.total_tax_amount := NEW.cgst_amount + NEW.sgst_amount;
                    NEW.line_total := v_taxable_amount + NEW.total_tax_amount;
                    
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
            """))
            
            db.execute(text("""
                CREATE TRIGGER calculate_gst_on_invoice_item_trigger
                BEFORE INSERT OR UPDATE ON sales.invoice_items
                FOR EACH ROW
                EXECUTE FUNCTION calculate_gst_on_invoice_item()
            """))
            
            created_triggers.append("calculate_gst_on_invoice_item_trigger")
            logger.info("✅ GST trigger created")
            
        except Exception as e:
            errors.append(f"GST trigger: {str(e)}")
            logger.error(f"Failed to create GST trigger: {e}")
        
        # 2. Create FIXED Order-Invoice Status Sync Trigger
        logger.info("Creating fixed status sync trigger...")
        try:
            db.execute(text("""
                CREATE OR REPLACE FUNCTION sync_order_invoice_status()
                RETURNS TRIGGER AS $$
                BEGIN
                    -- Update order status when invoice changes
                    IF NEW.invoice_status = 'posted' THEN
                        UPDATE sales.orders
                        SET order_status = 'invoiced',
                            payment_status = NEW.payment_status,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE order_id = NEW.order_id;
                    END IF;
                    
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
            """))
            
            db.execute(text("""
                CREATE TRIGGER sync_order_invoice_status_trigger
                AFTER UPDATE OF invoice_status, payment_status ON sales.invoices
                FOR EACH ROW
                EXECUTE FUNCTION sync_order_invoice_status()
            """))
            
            created_triggers.append("sync_order_invoice_status_trigger")
            logger.info("✅ Status sync trigger created")
            
        except Exception as e:
            errors.append(f"Status sync trigger: {str(e)}")
            logger.error(f"Failed to create status sync trigger: {e}")
        
        # 3. Create FIXED Inventory Update Trigger
        logger.info("Creating fixed inventory update trigger...")
        try:
            db.execute(text("""
                CREATE OR REPLACE FUNCTION update_inventory_on_sale()
                RETURNS TRIGGER AS $$
                BEGIN
                    IF TG_OP = 'INSERT' THEN
                        -- Deduct from batch
                        UPDATE inventory.batches
                        SET quantity_available = quantity_available - NEW.quantity,
                            quantity_sold = COALESCE(quantity_sold, 0) + NEW.quantity,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = NEW.batch_id
                        AND quantity_available >= NEW.quantity;
                        
                        IF NOT FOUND THEN
                            RAISE EXCEPTION 'Insufficient stock in batch %', NEW.batch_id;
                        END IF;
                        
                    ELSIF TG_OP = 'DELETE' THEN
                        -- Restore to batch
                        UPDATE inventory.batches
                        SET quantity_available = quantity_available + OLD.quantity,
                            quantity_sold = GREATEST(0, COALESCE(quantity_sold, 0) - OLD.quantity),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = OLD.batch_id;
                    END IF;
                    
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
            """))
            
            db.execute(text("""
                CREATE TRIGGER inventory_update_on_sale_trigger
                AFTER INSERT OR DELETE ON sales.invoice_items
                FOR EACH ROW
                EXECUTE FUNCTION update_inventory_on_sale()
            """))
            
            created_triggers.append("inventory_update_on_sale_trigger")
            logger.info("✅ Inventory trigger created")
            
        except Exception as e:
            errors.append(f"Inventory trigger: {str(e)}")
            logger.error(f"Failed to create inventory trigger: {e}")
        
        # 4. Create FIXED Invoice Totals Update Trigger
        logger.info("Creating fixed invoice totals trigger...")
        try:
            db.execute(text("""
                CREATE OR REPLACE FUNCTION update_invoice_totals()
                RETURNS TRIGGER AS $$
                DECLARE
                    v_invoice_id INTEGER;
                    v_totals RECORD;
                BEGIN
                    -- Get invoice_id
                    IF TG_OP = 'DELETE' THEN
                        v_invoice_id := OLD.invoice_id;
                    ELSE
                        v_invoice_id := NEW.invoice_id;
                    END IF;
                    
                    -- Calculate totals
                    SELECT 
                        COALESCE(SUM(taxable_amount), 0) as subtotal,
                        COALESCE(SUM(cgst_amount), 0) as cgst,
                        COALESCE(SUM(sgst_amount), 0) as sgst,
                        COALESCE(SUM(igst_amount), 0) as igst,
                        COALESCE(SUM(discount_amount), 0) as discount,
                        COALESCE(SUM(line_total), 0) as total
                    INTO v_totals
                    FROM sales.invoice_items
                    WHERE invoice_id = v_invoice_id;
                    
                    -- Update invoice
                    UPDATE sales.invoices
                    SET 
                        subtotal_amount = v_totals.subtotal,
                        discount_amount = v_totals.discount,
                        taxable_amount = v_totals.subtotal,
                        cgst_amount = v_totals.cgst,
                        sgst_amount = v_totals.sgst,
                        igst_amount = v_totals.igst,
                        total_tax_amount = v_totals.cgst + v_totals.sgst + v_totals.igst,
                        final_amount = v_totals.total,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE invoice_id = v_invoice_id;
                    
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
            """))
            
            db.execute(text("""
                CREATE TRIGGER update_invoice_totals_trigger
                AFTER INSERT OR UPDATE OR DELETE ON sales.invoice_items
                FOR EACH ROW
                EXECUTE FUNCTION update_invoice_totals()
            """))
            
            created_triggers.append("update_invoice_totals_trigger")
            logger.info("✅ Invoice totals trigger created")
            
        except Exception as e:
            errors.append(f"Invoice totals trigger: {str(e)}")
            logger.error(f"Failed to create invoice totals trigger: {e}")
        
        # Commit all changes
        if created_triggers:
            db.commit()
        
        # Verify triggers were created
        verify_result = db.execute(text("""
            SELECT trigger_name, event_object_table
            FROM information_schema.triggers
            WHERE trigger_name IN (
                'calculate_gst_on_invoice_item_trigger',
                'sync_order_invoice_status_trigger',
                'inventory_update_on_sale_trigger',
                'update_invoice_totals_trigger'
            )
        """))
        
        verified = [f"{row[0]} on {row[1]}" for row in verify_result]
        
        return {
            "success": len(created_triggers) > 0,
            "message": f"Created {len(created_triggers)} fixed triggers",
            "created": created_triggers,
            "errors": errors,
            "verified": verified
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create triggers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/verify-triggers")
async def verify_triggers(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Verify which triggers exist and their status"""
    try:
        result = db.execute(text("""
            SELECT 
                t.trigger_name,
                t.event_manipulation,
                t.event_object_schema,
                t.event_object_table,
                t.action_timing
            FROM information_schema.triggers t
            WHERE t.event_object_schema = 'sales'
            AND t.event_object_table IN ('invoices', 'invoice_items', 'orders', 'order_items')
            ORDER BY t.event_object_table, t.trigger_name
        """))
        
        triggers = []
        for row in result:
            triggers.append({
                "name": row[0],
                "event": row[1],
                "schema": row[2],
                "table": row[3],
                "timing": row[4]
            })
        
        return {
            "total_triggers": len(triggers),
            "triggers": triggers,
            "expected_triggers": [
                "calculate_gst_on_invoice_item_trigger",
                "sync_order_invoice_status_trigger",
                "inventory_update_on_sale_trigger",
                "update_invoice_totals_trigger"
            ]
        }
        
    except Exception as e:
        logger.error(f"Failed to verify triggers: {e}")
        raise HTTPException(status_code=500, detail=str(e))