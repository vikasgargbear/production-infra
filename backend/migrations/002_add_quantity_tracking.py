"""
Migration: Add quantity tracking fields to invoice_items and related tables
Author: System
Date: 2025-08-07
Purpose: Track base quantity, free quantity, and total quantity separately for better inventory and analytics
"""

import asyncio
from sqlalchemy import text
from app.database import engine
import logging

logger = logging.getLogger(__name__)

async def upgrade():
    """Add quantity tracking fields to database"""
    
    async with engine.begin() as conn:
        try:
            # 1. Add columns to invoice_items
            logger.info("Adding quantity columns to sales.invoice_items...")
            await conn.execute(text("""
                ALTER TABLE sales.invoice_items 
                ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
                ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0
            """))
            
            # 2. Add comments for documentation
            await conn.execute(text("""
                COMMENT ON COLUMN sales.invoice_items.quantity IS 'Total quantity delivered (base + free) - used for inventory deduction'
            """))
            await conn.execute(text("""
                COMMENT ON COLUMN sales.invoice_items.base_quantity IS 'Billable/paid quantity - used for revenue calculation'
            """))
            await conn.execute(text("""
                COMMENT ON COLUMN sales.invoice_items.free_quantity IS 'Free/promotional quantity given - used for tracking and analytics'
            """))
            
            # 3. Backfill existing data
            logger.info("Backfilling existing records...")
            await conn.execute(text("""
                UPDATE sales.invoice_items 
                SET base_quantity = quantity,
                    free_quantity = 0
                WHERE base_quantity IS NULL
            """))
            
            # 4. Make base_quantity NOT NULL
            await conn.execute(text("""
                ALTER TABLE sales.invoice_items 
                ALTER COLUMN base_quantity SET NOT NULL
            """))
            
            # 5. Create index for performance
            logger.info("Creating indexes...")
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_invoice_items_free_quantity 
                ON sales.invoice_items(free_quantity) 
                WHERE free_quantity > 0
            """))
            
            # 6. Add check constraint
            await conn.execute(text("""
                ALTER TABLE sales.invoice_items 
                DROP CONSTRAINT IF EXISTS chk_quantity_integrity
            """))
            await conn.execute(text("""
                ALTER TABLE sales.invoice_items 
                ADD CONSTRAINT chk_quantity_integrity 
                CHECK (quantity = base_quantity + free_quantity)
            """))
            
            # 7. Create reporting view
            logger.info("Creating reporting view...")
            await conn.execute(text("""
                CREATE OR REPLACE VIEW sales.v_invoice_items_with_quantities AS
                SELECT 
                    ii.*,
                    ii.base_quantity * ii.unit_price as billable_amount,
                    ii.free_quantity * ii.unit_price as free_value,
                    CASE 
                        WHEN ii.base_quantity > 0 
                        THEN (ii.free_quantity::NUMERIC / ii.base_quantity::NUMERIC * 100)::NUMERIC(5,2)
                        ELSE 0 
                    END as free_percentage
                FROM sales.invoice_items ii
            """))
            
            # 8. Add to other tables
            logger.info("Adding columns to related tables...")
            
            # GRN items
            await conn.execute(text("""
                ALTER TABLE inventory.grn_items 
                ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
                ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0
            """))
            
            # Order items
            await conn.execute(text("""
                ALTER TABLE sales.order_items 
                ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
                ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0
            """))
            
            # Quotation items
            await conn.execute(text("""
                ALTER TABLE sales.quotation_items 
                ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
                ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0
            """))
            
            # 9. Create validation function
            logger.info("Creating validation function...")
            await conn.execute(text("""
                CREATE OR REPLACE FUNCTION sales.validate_quantity_integrity()
                RETURNS TRIGGER AS $$
                BEGIN
                    -- Ensure total quantity equals base + free
                    IF NEW.quantity != (COALESCE(NEW.base_quantity, 0) + COALESCE(NEW.free_quantity, 0)) THEN
                        RAISE EXCEPTION 'Quantity mismatch: total quantity (%) must equal base_quantity (%) + free_quantity (%)',
                            NEW.quantity, NEW.base_quantity, NEW.free_quantity;
                    END IF;
                    
                    -- Ensure line_total is calculated on base_quantity only
                    NEW.line_total := NEW.base_quantity * NEW.unit_price * (1 - COALESCE(NEW.discount_percent, 0)/100);
                    
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
            """))
            
            # 10. Create trigger
            await conn.execute(text("""
                DROP TRIGGER IF EXISTS trg_validate_invoice_items_quantity ON sales.invoice_items
            """))
            await conn.execute(text("""
                CREATE TRIGGER trg_validate_invoice_items_quantity
                BEFORE INSERT OR UPDATE ON sales.invoice_items
                FOR EACH ROW
                EXECUTE FUNCTION sales.validate_quantity_integrity()
            """))
            
            logger.info("✅ Migration completed successfully!")
            
            # Verify the changes
            result = await conn.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'sales' 
                AND table_name = 'invoice_items'
                AND column_name IN ('quantity', 'base_quantity', 'free_quantity')
                ORDER BY column_name
            """))
            
            columns = result.fetchall()
            logger.info("Verified columns:")
            for col in columns:
                logger.info(f"  - {col[0]}: {col[1]} (nullable: {col[2]})")
                
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise

async def downgrade():
    """Rollback the migration"""
    
    async with engine.begin() as conn:
        try:
            logger.info("Rolling back quantity tracking migration...")
            
            # Drop trigger
            await conn.execute(text("""
                DROP TRIGGER IF EXISTS trg_validate_invoice_items_quantity ON sales.invoice_items
            """))
            
            # Drop function
            await conn.execute(text("""
                DROP FUNCTION IF EXISTS sales.validate_quantity_integrity()
            """))
            
            # Drop view
            await conn.execute(text("""
                DROP VIEW IF EXISTS sales.v_invoice_items_with_quantities
            """))
            
            # Remove columns
            await conn.execute(text("""
                ALTER TABLE sales.invoice_items 
                DROP COLUMN IF EXISTS base_quantity,
                DROP COLUMN IF EXISTS free_quantity
            """))
            
            await conn.execute(text("""
                ALTER TABLE inventory.grn_items 
                DROP COLUMN IF EXISTS base_quantity,
                DROP COLUMN IF EXISTS free_quantity
            """))
            
            await conn.execute(text("""
                ALTER TABLE sales.order_items 
                DROP COLUMN IF EXISTS base_quantity,
                DROP COLUMN IF EXISTS free_quantity
            """))
            
            await conn.execute(text("""
                ALTER TABLE sales.quotation_items 
                DROP COLUMN IF EXISTS base_quantity,
                DROP COLUMN IF EXISTS free_quantity
            """))
            
            logger.info("✅ Rollback completed successfully!")
            
        except Exception as e:
            logger.error(f"Rollback failed: {e}")
            raise

if __name__ == "__main__":
    # Run the migration
    asyncio.run(upgrade())
    
    # To rollback, uncomment:
    # asyncio.run(downgrade())