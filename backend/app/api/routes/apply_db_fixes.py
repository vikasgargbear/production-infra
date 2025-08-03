"""
Temporary endpoint to apply database fixes
This should be removed after fixes are applied
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from ...core.database import get_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/db-fixes",
    tags=["Database Fixes"]
)

@router.post("/apply-column-fixes")
async def apply_column_fixes(db: Session = Depends(get_db)):
    """Apply missing column fixes to database"""
    try:
        fixes_applied = []
        
        # Fix 1: Add item_id to invoice_items
        try:
            result = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'sales' 
                AND table_name = 'invoice_items' 
                AND column_name = 'item_id'
            """))
            
            if not result.fetchone():
                db.execute(text("""
                    ALTER TABLE sales.invoice_items 
                    ADD COLUMN item_id SERIAL
                """))
                fixes_applied.append("Added item_id column to sales.invoice_items")
        except Exception as e:
            logger.error(f"Error adding item_id: {e}")
        
        # Fix 2: Add missing columns to invoice_items
        try:
            # Check and add gst_percentage
            result = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'sales' 
                AND table_name = 'invoice_items' 
                AND column_name = 'gst_percentage'
            """))
            
            if not result.fetchone():
                db.execute(text("""
                    ALTER TABLE sales.invoice_items 
                    ADD COLUMN gst_percentage NUMERIC(5,2) DEFAULT 0
                """))
                fixes_applied.append("Added gst_percentage column to sales.invoice_items")
                
            # Check and add discount_percentage
            result = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'sales' 
                AND table_name = 'invoice_items' 
                AND column_name = 'discount_percentage'
            """))
            
            if not result.fetchone():
                db.execute(text("""
                    ALTER TABLE sales.invoice_items 
                    ADD COLUMN discount_percentage NUMERIC(5,2) DEFAULT 0
                """))
                fixes_applied.append("Added discount_percentage column to sales.invoice_items")
                
            # Check and add line_total
            result = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'sales' 
                AND table_name = 'invoice_items' 
                AND column_name = 'line_total'
            """))
            
            if not result.fetchone():
                db.execute(text("""
                    ALTER TABLE sales.invoice_items 
                    ADD COLUMN line_total NUMERIC(15,2) DEFAULT 0
                """))
                fixes_applied.append("Added line_total column to sales.invoice_items")
                
            # Check and add line_total_with_tax
            result = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'sales' 
                AND table_name = 'invoice_items' 
                AND column_name = 'line_total_with_tax'
            """))
            
            if not result.fetchone():
                db.execute(text("""
                    ALTER TABLE sales.invoice_items 
                    ADD COLUMN line_total_with_tax NUMERIC(15,2) DEFAULT 0
                """))
                fixes_applied.append("Added line_total_with_tax column to sales.invoice_items")
                
        except Exception as e:
            logger.error(f"Error adding invoice_items columns: {e}")
        
        # Fix 3: Add gstin to customers
        try:
            result = db.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'parties' 
                AND table_name = 'customers' 
                AND column_name = 'gstin'
            """))
            
            if not result.fetchone():
                db.execute(text("""
                    ALTER TABLE parties.customers 
                    ADD COLUMN gstin TEXT
                """))
                
                # Copy values from gst_number
                db.execute(text("""
                    UPDATE parties.customers 
                    SET gstin = gst_number 
                    WHERE gstin IS NULL
                """))
                
                fixes_applied.append("Added gstin column to parties.customers")
        except Exception as e:
            logger.error(f"Error adding gstin: {e}")
        
        # Fix 4: Update API function to use gst_number instead of gstin
        try:
            db.execute(text("""
                CREATE OR REPLACE FUNCTION api.search_customers(
                    p_search_term TEXT DEFAULT NULL,
                    p_customer_type TEXT DEFAULT NULL,
                    p_limit INTEGER DEFAULT 50,
                    p_offset INTEGER DEFAULT 0,
                    p_category_id INTEGER DEFAULT NULL
                )
                RETURNS JSON
                LANGUAGE plpgsql
                AS $$
                DECLARE
                    v_result JSON;
                    v_total INTEGER;
                BEGIN
                    -- Get total count
                    SELECT COUNT(*)
                    INTO v_total
                    FROM parties.customers c
                    WHERE c.is_active = TRUE
                    AND (p_search_term IS NULL OR 
                         c.customer_name ILIKE '%' || p_search_term || '%' OR
                         c.customer_code ILIKE '%' || p_search_term || '%' OR
                         c.primary_phone ILIKE '%' || p_search_term || '%' OR
                         c.gst_number ILIKE '%' || p_search_term || '%')
                    AND (p_customer_type IS NULL OR c.customer_type = p_customer_type)
                    AND (p_category_id IS NULL OR c.category_id = p_category_id);
                    
                    -- Get paginated results
                    SELECT json_build_object(
                        'total', v_total,
                        'customers', COALESCE(json_agg(
                            json_build_object(
                                'customer_id', c.customer_id,
                                'customer_code', c.customer_code,
                                'customer_name', c.customer_name,
                                'customer_type', c.customer_type,
                                'primary_phone', c.primary_phone,
                                'primary_email', c.primary_email,
                                'gst_number', c.gst_number,
                                'credit_limit', c.credit_limit,
                                'current_outstanding', c.current_outstanding,
                                'is_active', c.is_active
                            ) ORDER BY c.customer_name
                        ), '[]'::json)
                    )
                    INTO v_result
                    FROM (
                        SELECT * FROM parties.customers c
                        WHERE c.is_active = TRUE
                        AND (p_search_term IS NULL OR 
                             c.customer_name ILIKE '%' || p_search_term || '%' OR
                             c.customer_code ILIKE '%' || p_search_term || '%' OR
                             c.primary_phone ILIKE '%' || p_search_term || '%' OR
                             c.gst_number ILIKE '%' || p_search_term || '%')
                        AND (p_customer_type IS NULL OR c.customer_type = p_customer_type)
                        AND (p_category_id IS NULL OR c.category_id = p_category_id)
                        ORDER BY c.customer_name
                        LIMIT p_limit OFFSET p_offset
                    ) c;
                    
                    RETURN v_result;
                END;
                $$;
            """))
            fixes_applied.append("Updated api.search_customers function")
        except Exception as e:
            logger.error(f"Error updating search function: {e}")
        
        db.commit()
        
        return {
            "status": "success",
            "fixes_applied": fixes_applied,
            "message": f"Applied {len(fixes_applied)} fixes"
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))