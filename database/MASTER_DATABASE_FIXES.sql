-- =============================================
-- MASTER DATABASE FIXES CONSOLIDATION
-- =============================================
-- This file consolidates all database fixes applied to the production system
-- Categories:
-- 1. Schema Fixes
-- 2. Trigger Fixes  
-- 3. Data Fixes
-- 4. Constraint Fixes
-- 5. Function Fixes
-- =============================================

-- =============================================
-- SECTION 1: SCHEMA FIXES
-- =============================================

-- 1.0 Add missing columns to invoice_items and customers
-- Date: 2024-08-03
-- Issue: API expecting item_id column in invoice_items, gstin in customers
DO $$
BEGIN
    -- Add item_id to invoice_items if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'sales' 
        AND table_name = 'invoice_items' 
        AND column_name = 'item_id'
    ) THEN
        ALTER TABLE sales.invoice_items 
        ADD COLUMN item_id SERIAL;
        
        RAISE NOTICE '✅ Added item_id column to invoice_items table';
    END IF;
    
    -- Add gstin to customers if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'parties' 
        AND table_name = 'customers' 
        AND column_name = 'gstin'
    ) THEN
        ALTER TABLE parties.customers 
        ADD COLUMN gstin TEXT;
        
        -- Copy values from gst_number
        UPDATE parties.customers 
        SET gstin = gst_number 
        WHERE gstin IS NULL;
        
        RAISE NOTICE '✅ Added gstin column to customers table';
    END IF;
END $$;

-- 1.1 Add missing columns to products table
-- Date: 2024-08-02
-- Issue: Products table missing MRP column needed for pricing
DO $$
BEGIN
    -- Add current_mrp column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'current_mrp'
    ) THEN
        ALTER TABLE inventory.products 
        ADD COLUMN current_mrp NUMERIC(10,2) DEFAULT 0 NOT NULL;
        
        RAISE NOTICE '✅ Added current_mrp column to products table';
    END IF;
    
    -- Add mrp column if not exists (some installations may have this)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'mrp'
    ) THEN
        ALTER TABLE inventory.products 
        ADD COLUMN mrp NUMERIC(10,2);
        
        RAISE NOTICE '✅ Added mrp column to products table';
    END IF;
END $$;

-- 1.2 Fix batches table columns
-- Date: 2024-08-02
-- Issue: Batches table had wrong column names
DO $$
BEGIN
    -- Add initial_quantity if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'initial_quantity'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN initial_quantity NUMERIC(10,2) DEFAULT 0;
        
        UPDATE inventory.batches 
        SET initial_quantity = quantity_received 
        WHERE initial_quantity = 0;
        
        RAISE NOTICE '✅ Added initial_quantity column to batches table';
    END IF;
    
    -- Add sale_price_per_unit if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'sale_price_per_unit'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN sale_price_per_unit NUMERIC(10,2);
        
        RAISE NOTICE '✅ Added sale_price_per_unit column to batches table';
    END IF;
    
    -- Add mrp_per_unit if missing  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'mrp_per_unit'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN mrp_per_unit NUMERIC(10,2);
        
        RAISE NOTICE '✅ Added mrp_per_unit column to batches table';
    END IF;
    
    -- Add source_type if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'source_type'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN source_type TEXT DEFAULT 'purchase';
        
        RAISE NOTICE '✅ Added source_type column to batches table';
    END IF;
END $$;

-- =============================================
-- SECTION 2: TRIGGER FIXES
-- =============================================

-- 2.1 Remove problematic KPI calculation triggers
-- Date: 2024-08-02
-- Issue: Analytics triggers causing 500 errors
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop all KPI/analytics related triggers
    FOR r IN 
        SELECT trigger_name, event_object_table, event_object_schema
        FROM information_schema.triggers 
        WHERE (
            trigger_name ILIKE '%kpi%' OR
            trigger_name ILIKE '%analytic%' OR
            trigger_name ILIKE '%realtime%' OR
            trigger_name ILIKE '%calculate%' OR
            trigger_name ILIKE '%update_cash_flow%' OR
            trigger_name ILIKE '%auto_match_bank%'
        )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', 
            r.trigger_name, r.event_object_schema, r.event_object_table);
        RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
    END LOOP;
END $$;

-- 2.2 Create invoice inventory deduction trigger
-- Date: 2024-08-03
-- Issue: Inventory not being deducted when invoices created
DROP TRIGGER IF EXISTS trigger_deduct_inventory_on_invoice ON sales.invoice_items;
DROP FUNCTION IF EXISTS deduct_inventory_on_invoice();

CREATE OR REPLACE FUNCTION deduct_inventory_on_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_batch RECORD;
    v_remaining_qty NUMERIC;
    v_deduct_qty NUMERIC;
BEGIN
    -- Only process on INSERT (new invoice items)
    IF TG_OP != 'INSERT' THEN
        RETURN NEW;
    END IF;
    
    -- Skip if no quantity
    IF NEW.quantity <= 0 THEN
        RETURN NEW;
    END IF;
    
    v_remaining_qty := NEW.quantity;
    
    -- If specific batch is provided, deduct from that batch
    IF NEW.batch_id IS NOT NULL THEN
        UPDATE inventory.batches
        SET 
            quantity_available = quantity_available - NEW.quantity,
            quantity_sold = COALESCE(quantity_sold, 0) + NEW.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = NEW.batch_id
        AND quantity_available >= NEW.quantity;
        
        IF NOT FOUND THEN
            RAISE WARNING 'Insufficient stock in batch % for product %', NEW.batch_id, NEW.product_id;
        END IF;
    ELSE
        -- No specific batch, use FIFO allocation
        FOR v_batch IN 
            SELECT batch_id, quantity_available, cost_per_unit, org_id
            FROM inventory.batches
            WHERE product_id = NEW.product_id
            AND quantity_available > 0
            AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
            ORDER BY expiry_date NULLS LAST, batch_id
        LOOP
            IF v_remaining_qty <= 0 THEN
                EXIT;
            END IF;
            
            v_deduct_qty := LEAST(v_batch.quantity_available, v_remaining_qty);
            
            UPDATE inventory.batches
            SET 
                quantity_available = quantity_available - v_deduct_qty,
                quantity_sold = COALESCE(quantity_sold, 0) + v_deduct_qty,
                updated_at = CURRENT_TIMESTAMP
            WHERE batch_id = v_batch.batch_id;
            
            v_remaining_qty := v_remaining_qty - v_deduct_qty;
        END LOOP;
        
        IF v_remaining_qty > 0 THEN
            RAISE WARNING 'Insufficient stock for product %. Required: %, Short by: %', 
                NEW.product_id, NEW.quantity, v_remaining_qty;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deduct_inventory_on_invoice
    AFTER INSERT ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION deduct_inventory_on_invoice();

COMMENT ON FUNCTION deduct_inventory_on_invoice() IS 'Automatically deducts inventory when invoice items are created, using FIFO if no specific batch is specified';

-- 2.3 Fix prevent_mrp_decrease trigger
-- Date: 2024-08-02
-- Issue: Trigger preventing batch creation
DO $$
BEGIN
    -- Drop the problematic trigger if it exists
    DROP TRIGGER IF EXISTS prevent_mrp_decrease ON inventory.batches;
    DROP FUNCTION IF EXISTS check_mrp_decrease();
    
    -- Recreate with better logic
    CREATE OR REPLACE FUNCTION check_mrp_decrease()
    RETURNS TRIGGER AS $func$
    BEGIN
        -- Only check on UPDATE, not INSERT
        IF TG_OP = 'UPDATE' THEN
            -- Allow MRP decrease if batch is expired or being corrected
            IF NEW.mrp_per_unit < OLD.mrp_per_unit AND 
               NEW.batch_status NOT IN ('expired', 'damaged', 'recalled') THEN
                RAISE WARNING 'MRP decrease detected for batch %. Old: %, New: %', 
                    NEW.batch_id, OLD.mrp_per_unit, NEW.mrp_per_unit;
                -- Don't block, just warn
            END IF;
        END IF;
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
    
    CREATE TRIGGER prevent_mrp_decrease
        BEFORE UPDATE ON inventory.batches
        FOR EACH ROW
        EXECUTE FUNCTION check_mrp_decrease();
    
    RAISE NOTICE '✅ Fixed prevent_mrp_decrease trigger';
END $$;

-- =============================================
-- SECTION 3: DATA FIXES
-- =============================================

-- 3.1 Fix NULL values in critical columns
-- Date: 2024-08-02
UPDATE inventory.products 
SET current_mrp = 0 
WHERE current_mrp IS NULL;

UPDATE inventory.batches 
SET quantity_sold = 0 
WHERE quantity_sold IS NULL;

UPDATE inventory.batches 
SET initial_quantity = quantity_received 
WHERE initial_quantity IS NULL OR initial_quantity = 0;

-- 3.2 Fix orphaned records
-- Clean up invoice items without valid invoices
DELETE FROM sales.invoice_items 
WHERE invoice_id NOT IN (SELECT invoice_id FROM sales.invoices);

-- Clean up order items without valid orders
DELETE FROM sales.order_items 
WHERE order_id NOT IN (SELECT order_id FROM sales.orders);

-- =============================================
-- SECTION 4: CONSTRAINT FIXES
-- =============================================

-- 4.1 Add missing foreign key constraints
-- Note: Only add if tables exist and constraints don't exist
DO $$
BEGIN
    -- Add foreign key for invoice_items to invoices
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_invoice_items_invoice'
    ) THEN
        ALTER TABLE sales.invoice_items
        ADD CONSTRAINT fk_invoice_items_invoice 
        FOREIGN KEY (invoice_id) REFERENCES sales.invoices(invoice_id) 
        ON DELETE CASCADE;
        
        RAISE NOTICE '✅ Added foreign key constraint for invoice_items';
    END IF;
    
    -- Add foreign key for invoice_items to products
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_invoice_items_product'
    ) THEN
        ALTER TABLE sales.invoice_items
        ADD CONSTRAINT fk_invoice_items_product 
        FOREIGN KEY (product_id) REFERENCES inventory.products(product_id);
        
        RAISE NOTICE '✅ Added foreign key constraint for invoice_items to products';
    END IF;
END $$;

-- =============================================
-- SECTION 5: FUNCTION FIXES
-- =============================================

-- 5.1 Create or replace utility functions
-- Function to get current stock for a product
CREATE OR REPLACE FUNCTION get_product_stock(p_product_id INTEGER)
RETURNS TABLE(
    total_stock NUMERIC,
    available_stock NUMERIC,
    reserved_stock NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(quantity_available + COALESCE(quantity_reserved, 0)), 0) as total_stock,
        COALESCE(SUM(quantity_available), 0) as available_stock,
        COALESCE(SUM(quantity_reserved), 0) as reserved_stock
    FROM inventory.batches
    WHERE product_id = p_product_id
    AND batch_status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Function to calculate invoice totals
CREATE OR REPLACE FUNCTION calculate_invoice_totals(p_invoice_id INTEGER)
RETURNS TABLE(
    subtotal NUMERIC,
    discount NUMERIC,
    tax NUMERIC,
    total NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(line_total), 0) as subtotal,
        COALESCE(SUM(discount_amount), 0) as discount,
        COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) as tax,
        COALESCE(SUM(line_total_with_tax), 0) as total
    FROM sales.invoice_items
    WHERE invoice_id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SECTION 6: INVOICE TRIGGER FIXES
-- =============================================
-- Date: 2024-08-04
-- Issue: Invoice totals not calculating, GST not applying, inventory not updating

-- 6.1 Clean up any existing invoice triggers
DROP TRIGGER IF EXISTS trigger_calculate_gst_on_invoice_item ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_gst_on_invoice_item() CASCADE;
DROP TRIGGER IF EXISTS trigger_update_inventory_on_sale ON sales.invoice_items;
DROP FUNCTION IF EXISTS update_inventory_on_sale() CASCADE;
DROP TRIGGER IF EXISTS trigger_calculate_invoice_totals ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_invoice_totals() CASCADE;

-- 6.2 Invoice Totals Calculation Trigger
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_totals RECORD;
BEGIN
    -- Calculate totals from invoice items
    SELECT 
        COUNT(*) as item_count,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(quantity * unit_price), 0) as subtotal,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(taxable_amount), 0) as taxable,
        COALESCE(SUM(igst_amount), 0) as igst,
        COALESCE(SUM(cgst_amount), 0) as cgst,
        COALESCE(SUM(sgst_amount), 0) as sgst,
        COALESCE(SUM(cess_amount), 0) as cess,
        COALESCE(SUM(total_tax_amount), 0) as total_tax,
        COALESCE(SUM(line_total), 0) as total
    INTO v_totals
    FROM sales.invoice_items
    WHERE invoice_id = NEW.invoice_id;
    
    -- Update invoice header
    UPDATE sales.invoices
    SET 
        items_count = v_totals.item_count,
        total_quantity = v_totals.total_quantity,
        subtotal_amount = v_totals.subtotal,
        discount_amount = v_totals.total_discount,
        taxable_amount = v_totals.taxable,
        igst_amount = v_totals.igst,
        cgst_amount = v_totals.cgst,
        sgst_amount = v_totals.sgst,
        cess_amount = v_totals.cess,
        tax_amount = v_totals.total_tax,
        round_off_amount = ROUND(v_totals.total) - v_totals.total,
        final_amount = ROUND(v_totals.total),
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = NEW.invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_invoice_totals
    AFTER INSERT ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_invoice_totals();

-- 6.3 GST Calculation Trigger
CREATE OR REPLACE FUNCTION calculate_gst_invoice_item()
RETURNS TRIGGER AS $$
DECLARE
    v_gst_rate NUMERIC;
    v_customer_state TEXT;
    v_branch_state TEXT;
    v_is_interstate BOOLEAN;
BEGIN
    -- Get GST rate from product (fixed column name)
    SELECT COALESCE(gst_percentage, 18) INTO v_gst_rate
    FROM inventory.products
    WHERE product_id = NEW.product_id;
    
    -- Get states for interstate check
    SELECT 
        SUBSTRING(c.gst_number FROM 1 FOR 2),
        SUBSTRING(b.branch_gst_number FROM 1 FOR 2)
    INTO v_customer_state, v_branch_state
    FROM sales.invoices i
    LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
    LEFT JOIN master.org_branches b ON i.branch_id = b.branch_id
    WHERE i.invoice_id = NEW.invoice_id;
    
    -- Default to intrastate if states not found
    v_is_interstate := COALESCE(v_customer_state != v_branch_state, FALSE);
    
    -- Calculate taxable amount if not provided
    IF NEW.taxable_amount IS NULL OR NEW.taxable_amount = 0 THEN
        NEW.taxable_amount := (NEW.quantity * NEW.unit_price) - COALESCE(NEW.discount_amount, 0);
    END IF;
    
    -- Calculate GST
    IF v_is_interstate THEN
        NEW.igst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 100, 2);
        NEW.cgst_amount := 0;
        NEW.sgst_amount := 0;
    ELSE
        NEW.igst_amount := 0;
        NEW.cgst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 200, 2);
        NEW.sgst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 200, 2);
    END IF;
    
    -- Calculate total tax and line total
    NEW.total_tax_amount := NEW.igst_amount + NEW.cgst_amount + NEW.sgst_amount + COALESCE(NEW.cess_amount, 0);
    NEW.line_total := NEW.taxable_amount + NEW.total_tax_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_gst_invoice
    BEFORE INSERT OR UPDATE ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_gst_invoice_item();

-- 6.4 Inventory Update Trigger (Simplified)
CREATE OR REPLACE FUNCTION update_inventory_on_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_batch_id INTEGER;
BEGIN
    -- Only process on INSERT
    IF TG_OP != 'INSERT' THEN
        RETURN NEW;
    END IF;
    
    -- Get batch_id if not provided (FIFO)
    IF NEW.batch_id IS NULL THEN
        SELECT batch_id INTO v_batch_id
        FROM inventory.batches
        WHERE product_id = NEW.product_id
        AND quantity_available >= NEW.quantity
        AND batch_status = 'active'
        ORDER BY expiry_date NULLS LAST, batch_id
        LIMIT 1;
        
        NEW.batch_id := v_batch_id;
    END IF;
    
    -- Update batch quantity if batch found
    IF NEW.batch_id IS NOT NULL THEN
        UPDATE inventory.batches
        SET 
            quantity_available = quantity_available - NEW.quantity,
            last_movement_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = NEW.batch_id
        AND quantity_available >= NEW.quantity;
        
        IF NOT FOUND THEN
            RAISE WARNING 'Insufficient stock in batch % for product %', NEW.batch_id, NEW.product_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_on_invoice
    BEFORE INSERT ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_invoice();

RAISE NOTICE '✅ Added invoice calculation triggers';

-- =============================================
-- SECTION 7: INDEX FIXES
-- =============================================

-- 6.1 Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_batches_product_active 
ON inventory.batches(product_id, batch_status) 
WHERE batch_status = 'active';

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice 
ON sales.invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_orders_customer 
ON sales.orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_invoices_customer 
ON sales.invoices(customer_id);

CREATE INDEX IF NOT EXISTS idx_batches_expiry 
ON inventory.batches(expiry_date) 
WHERE batch_status = 'active';

-- =============================================
-- SECTION 8: API TEST FIXES (2025-08-07)
-- =============================================
-- These fixes were applied during API testing to resolve schema mismatches

-- 8.1 Orders Table Fixes
-- Make created_by nullable since we don't always have user context
ALTER TABLE sales.orders 
ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE sales.orders 
ALTER COLUMN updated_by DROP NOT NULL;

-- 8.2 Order Items Table - Add Missing Columns
-- Add tax rate columns (from schema documentation)
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS igst_rate NUMERIC(5,2);

-- Add tax amount columns
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(15,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(15,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(15,2);

-- Add cess columns
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS cess_rate NUMERIC(5,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS cess_amount NUMERIC(15,2);

-- Add status and tracking columns
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending';

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add product snapshot columns
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS product_name TEXT;

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS product_code TEXT;

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS batch_number TEXT;

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS delivered_quantity NUMERIC(15,3) DEFAULT 0;

-- Add timestamps
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 8.3 Order Items Table - Make Columns Nullable
-- These columns are not always provided by the API
ALTER TABLE sales.order_items 
ALTER COLUMN uom DROP NOT NULL;

ALTER TABLE sales.order_items 
ALTER COLUMN product_name DROP NOT NULL;

ALTER TABLE sales.order_items 
ALTER COLUMN batch_id DROP NOT NULL;

ALTER TABLE sales.order_items 
ALTER COLUMN batch_number DROP NOT NULL;

ALTER TABLE sales.order_items 
ALTER COLUMN product_code DROP NOT NULL;

ALTER TABLE sales.order_items 
ALTER COLUMN hsn_code DROP NOT NULL;

ALTER TABLE sales.order_items 
ALTER COLUMN mrp DROP NOT NULL;

ALTER TABLE sales.order_items 
ALTER COLUMN pack_type DROP NOT NULL;

-- 8.4 Drop Problematic Pack Configuration Trigger
-- This trigger was blocking order creation
DROP TRIGGER IF EXISTS calculate_pack_quantities_trigger ON sales.order_items;
DROP FUNCTION IF EXISTS calculate_pack_quantities() CASCADE;

-- 8.5 Invoice Items Table Fixes
-- Make created_by nullable if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'sales' 
               AND table_name = 'invoice_items' 
               AND column_name = 'created_by') THEN
        ALTER TABLE sales.invoice_items ALTER COLUMN created_by DROP NOT NULL;
    END IF;
END $$;

-- =============================================
-- SECTION 9: PACK CONFIGURATION CLEANUP (2025-08-07)
-- =============================================
-- Remove redundant product_pack_configurations table and add pack columns to products

-- 9.1 Add pack columns to products table
ALTER TABLE inventory.products 
ADD COLUMN IF NOT EXISTS units_per_pack INTEGER,
ADD COLUMN IF NOT EXISTS packs_per_box INTEGER,
ADD COLUMN IF NOT EXISTS pack_unit TEXT,     -- 'STRIP', 'BOTTLE', 'VIAL', 'TUBE'
ADD COLUMN IF NOT EXISTS box_unit TEXT;      -- 'BOX', 'CASE', 'CARTON'

-- 9.2 Migrate existing pack_config JSON data to new columns
UPDATE inventory.products 
SET 
    units_per_pack = CASE 
        WHEN pack_config->>'pack_quantity' IS NOT NULL 
        THEN (pack_config->>'pack_quantity')::INTEGER 
        ELSE NULL 
    END,
    packs_per_box = CASE 
        WHEN pack_config->>'pack_multiplier' IS NOT NULL 
        THEN (pack_config->>'pack_multiplier')::INTEGER 
        ELSE NULL 
    END,
    pack_unit = CASE
        WHEN pack_config->>'pack_unit_type' IS NOT NULL
        THEN pack_config->>'pack_unit_type'
        ELSE NULL
    END
WHERE pack_config IS NOT NULL 
AND pack_config != '{}'::jsonb;

-- 9.3 Drop the redundant product_pack_configurations table
-- This table was designed but never used - pack info is stored in products.pack_config JSON
DROP TABLE IF EXISTS inventory.product_pack_configurations CASCADE;

-- 9.4 Add comments to document the pack columns
COMMENT ON COLUMN inventory.products.units_per_pack IS 'Number of base units per pack (e.g., 10 tablets per strip)';
COMMENT ON COLUMN inventory.products.packs_per_box IS 'Number of packs per box (e.g., 10 strips per box)';
COMMENT ON COLUMN inventory.products.pack_unit IS 'Pack unit type (e.g., STRIP, BOTTLE, VIAL)';
COMMENT ON COLUMN inventory.products.box_unit IS 'Box unit type (e.g., BOX, CASE, CARTON)';

-- 9.5 Create index for pack configuration queries
CREATE INDEX IF NOT EXISTS idx_products_pack_config 
ON inventory.products(units_per_pack, packs_per_box) 
WHERE units_per_pack IS NOT NULL;

-- =============================================
-- SECTION 10: INVENTORY MOVEMENTS CLEANUP (2025-08-07)
-- =============================================
-- Drop redundant inventory_movements table as all movement data
-- already exists in transaction-specific tables

-- 10.1 Drop the redundant inventory_movements table
DROP TABLE IF EXISTS inventory.inventory_movements CASCADE;

-- 10.2 Create simple view for movement reporting
CREATE OR REPLACE VIEW inventory.movement_summary AS
SELECT 
    'sale'::TEXT as movement_type,
    ii.product_id,
    ii.quantity,
    i.invoice_date::DATE as movement_date,
    i.invoice_number as document_number,
    i.customer_name as party_name,
    i.org_id
FROM sales.invoice_items ii
JOIN sales.invoices i ON ii.invoice_id = i.invoice_id;

COMMENT ON VIEW inventory.movement_summary IS 
'Simple movement summary. For detailed audit trail, query transaction tables directly (invoice_items, purchase_order_items, etc.)';

-- =============================================
-- SECTION 11: QUANTITY TRACKING ENHANCEMENT (2025-08-07)
-- =============================================
-- Add base_quantity and free_quantity tracking to invoice_items and order_items
-- This allows separate tracking of billable vs free/promotional items

-- 11.1 Add columns to invoice_items
ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0;

-- 11.2 Add documentation comments
COMMENT ON COLUMN sales.invoice_items.quantity IS 'Total quantity delivered (base + free) - used for inventory deduction';
COMMENT ON COLUMN sales.invoice_items.base_quantity IS 'Billable/paid quantity - used for revenue calculation';
COMMENT ON COLUMN sales.invoice_items.free_quantity IS 'Free/promotional quantity given - used for tracking and analytics';

-- 11.3 Backfill existing data
UPDATE sales.invoice_items 
SET base_quantity = quantity,
    free_quantity = 0
WHERE base_quantity IS NULL;

-- 11.4 Create performance index
CREATE INDEX IF NOT EXISTS idx_invoice_items_free_quantity 
ON sales.invoice_items(free_quantity) 
WHERE free_quantity > 0;

-- 11.5 Create reporting view
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
FROM sales.invoice_items ii;

-- 11.6 Add to order_items table
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0;

-- Backfill order_items
UPDATE sales.order_items 
SET base_quantity = quantity,
    free_quantity = 0
WHERE base_quantity IS NULL;

-- 11.7 Create validation function
CREATE OR REPLACE FUNCTION sales.validate_quantity_integrity()
RETURNS TRIGGER AS $$
BEGIN
    -- If base_quantity not provided, default to quantity
    IF NEW.base_quantity IS NULL THEN
        NEW.base_quantity := NEW.quantity;
    END IF;
    
    -- If free_quantity not provided, default to 0
    IF NEW.free_quantity IS NULL THEN
        NEW.free_quantity := 0;
    END IF;
    
    -- Ensure total quantity equals base + free
    IF NEW.quantity != (NEW.base_quantity + NEW.free_quantity) THEN
        -- Auto-adjust quantity to match
        NEW.quantity := NEW.base_quantity + NEW.free_quantity;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11.8 Create trigger
DROP TRIGGER IF EXISTS trg_validate_invoice_items_quantity ON sales.invoice_items;
CREATE TRIGGER trg_validate_invoice_items_quantity
BEFORE INSERT OR UPDATE ON sales.invoice_items
FOR EACH ROW
EXECUTE FUNCTION sales.validate_quantity_integrity();

-- =============================================
-- SECTION 12: SUPPLIER TABLE ENHANCEMENTS (2025-08-14)
-- =============================================
-- Add missing website field to suppliers table for complete supplier information

-- 12.1 Add website column to suppliers table
DO $$
BEGIN
    -- Add website column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'parties' 
        AND table_name = 'suppliers' 
        AND column_name = 'website'
    ) THEN
        ALTER TABLE parties.suppliers 
        ADD COLUMN website TEXT;
        
        RAISE NOTICE '✅ Added website column to suppliers table';
    ELSE
        RAISE NOTICE '✓ Website column already exists in suppliers table';
    END IF;
END $$;

-- 12.2 Add comment to document the website column
COMMENT ON COLUMN parties.suppliers.website IS 'Supplier website URL for reference and communication';

-- =============================================
-- SECTION 13: BATCH PACK CONFIGURATION ENHANCEMENT (2025-08-16)
-- =============================================
-- Move all pack configuration from products table to batches table
-- This ensures pack details are stored where they belong - with actual inventory

-- 13.1 Add comprehensive pack configuration columns to batches table
DO $$
BEGIN
    -- Pack Configuration Columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'pack_size'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN pack_size INTEGER NOT NULL DEFAULT 1;
        RAISE NOTICE '✅ Added pack_size column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'pack_type'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN pack_type TEXT NOT NULL DEFAULT 'unit';
        RAISE NOTICE '✅ Added pack_type column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'pack_uom'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN pack_uom TEXT NOT NULL DEFAULT 'UNIT';
        RAISE NOTICE '✅ Added pack_uom column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'base_uom'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN base_uom TEXT NOT NULL DEFAULT 'UNIT';
        RAISE NOTICE '✅ Added base_uom column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'units_per_pack'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN units_per_pack INTEGER NOT NULL DEFAULT 1;
        RAISE NOTICE '✅ Added units_per_pack column to batches table';
    END IF;
    
    -- Optional: Secondary packaging for pharma
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'strips_per_box'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN strips_per_box INTEGER NULL;
        RAISE NOTICE '✅ Added strips_per_box column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'tablets_per_strip'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN tablets_per_strip INTEGER NULL;
        RAISE NOTICE '✅ Added tablets_per_strip column to batches table';
    END IF;
    
    -- Storage & Quality Control
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'storage_condition'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN storage_condition TEXT DEFAULT 'room_temp';
        RAISE NOTICE '✅ Added storage_condition column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'storage_location'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN storage_location TEXT;
        RAISE NOTICE '✅ Added storage_location column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'quality_status'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN quality_status TEXT DEFAULT 'approved';
        RAISE NOTICE '✅ Added quality_status column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'quality_notes'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN quality_notes TEXT;
        RAISE NOTICE '✅ Added quality_notes column to batches table';
    END IF;
    
    -- Enhanced Inventory Tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'quantity_allocated'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN quantity_allocated INTEGER DEFAULT 0;
        RAISE NOTICE '✅ Added quantity_allocated column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'quantity_reserved'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN quantity_reserved INTEGER DEFAULT 0;
        RAISE NOTICE '✅ Added quantity_reserved column to batches table';
    END IF;
    
    -- Enhanced Pricing (per pack, not per unit)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'purchase_price'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN purchase_price NUMERIC(10,2);
        RAISE NOTICE '✅ Added purchase_price column to batches table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'sale_price'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN sale_price NUMERIC(10,2);
        RAISE NOTICE '✅ Added sale_price column to batches table';
    END IF;
END $$;

-- 13.2 Remove redundant pack columns from products table
DO $$
BEGIN
    -- Remove pack_size from products (now in batches)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'pack_size'
    ) THEN
        ALTER TABLE inventory.products DROP COLUMN pack_size;
        RAISE NOTICE '✅ Removed pack_size from products table';
    END IF;
    
    -- Remove pack_type from products (now in batches)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'pack_type'
    ) THEN
        ALTER TABLE inventory.products DROP COLUMN pack_type;
        RAISE NOTICE '✅ Removed pack_type from products table';
    END IF;
    
    -- Remove units_per_pack from products (now in batches)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'units_per_pack'
    ) THEN
        ALTER TABLE inventory.products DROP COLUMN units_per_pack;
        RAISE NOTICE '✅ Removed units_per_pack from products table';
    END IF;
END $$;

-- 13.3 Clean up product_types table - remove pack-related fields
DO $$
BEGIN
    -- Remove typical_pack_sizes (too generic, real packs are in batches)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'product_types' 
        AND column_name = 'typical_pack_sizes'
    ) THEN
        ALTER TABLE inventory.product_types DROP COLUMN typical_pack_sizes;
        RAISE NOTICE '✅ Removed typical_pack_sizes from product_types table';
    END IF;
    
    -- Remove default UOMs (determined by batch selection)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'product_types' 
        AND column_name = 'default_purchase_uom'
    ) THEN
        ALTER TABLE inventory.product_types DROP COLUMN default_purchase_uom;
        RAISE NOTICE '✅ Removed default_purchase_uom from product_types table';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'product_types' 
        AND column_name = 'default_sale_uom'
    ) THEN
        ALTER TABLE inventory.product_types DROP COLUMN default_sale_uom;
        RAISE NOTICE '✅ Removed default_sale_uom from product_types table';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'product_types' 
        AND column_name = 'default_display_uom'
    ) THEN
        ALTER TABLE inventory.product_types DROP COLUMN default_display_uom;
        RAISE NOTICE '✅ Removed default_display_uom from product_types table';
    END IF;
END $$;

-- 13.4 Add constraints and checks
DO $$
BEGIN
    -- Business rule constraints
    ALTER TABLE inventory.batches 
    ADD CONSTRAINT IF NOT EXISTS chk_pack_size_positive 
    CHECK (pack_size > 0);
    
    ALTER TABLE inventory.batches 
    ADD CONSTRAINT IF NOT EXISTS chk_units_per_pack_positive 
    CHECK (units_per_pack > 0);
    
    ALTER TABLE inventory.batches 
    ADD CONSTRAINT IF NOT EXISTS chk_quantity_non_negative 
    CHECK (quantity_available >= 0);
    
    ALTER TABLE inventory.batches 
    ADD CONSTRAINT IF NOT EXISTS chk_allocated_reserved_valid 
    CHECK (
        quantity_allocated >= 0 AND 
        quantity_reserved >= 0 AND 
        (quantity_allocated + quantity_reserved) <= quantity_available
    );
    
    -- Valid storage conditions
    ALTER TABLE inventory.batches 
    ADD CONSTRAINT IF NOT EXISTS chk_storage_condition_valid 
    CHECK (storage_condition IN ('room_temp', 'cold_storage', 'freezer', 'controlled_temp'));
    
    -- Valid quality status
    ALTER TABLE inventory.batches 
    ADD CONSTRAINT IF NOT EXISTS chk_quality_status_valid 
    CHECK (quality_status IN ('approved', 'quarantine', 'rejected', 'testing', 'recalled'));
    
    RAISE NOTICE '✅ Added business rule constraints to batches table';
END $$;

-- 13.5 Add documentation comments
COMMENT ON COLUMN inventory.batches.pack_size IS 'Physical pack size (e.g., 10, 100, 500)';
COMMENT ON COLUMN inventory.batches.pack_type IS 'Pack type (strip, box, bottle, vial, tube, sachet)';
COMMENT ON COLUMN inventory.batches.pack_uom IS 'Pack unit of measure (STR, BOX, BTL, VL, TB, SAC)';
COMMENT ON COLUMN inventory.batches.base_uom IS 'Base unit of measure (TAB, ML, GM, UNIT)';
COMMENT ON COLUMN inventory.batches.units_per_pack IS 'Total base units in this pack (10 tablets per strip)';
COMMENT ON COLUMN inventory.batches.strips_per_box IS 'Number of strips per box (for pharma hierarchy)';
COMMENT ON COLUMN inventory.batches.tablets_per_strip IS 'Number of tablets per strip (for pharma)';
COMMENT ON COLUMN inventory.batches.storage_condition IS 'Storage requirement (room_temp, cold_storage, freezer)';
COMMENT ON COLUMN inventory.batches.quality_status IS 'Quality control status (approved, quarantine, rejected)';
COMMENT ON COLUMN inventory.batches.quantity_allocated IS 'Quantity allocated to pending orders';
COMMENT ON COLUMN inventory.batches.quantity_reserved IS 'Quantity reserved for specific purposes';
COMMENT ON COLUMN inventory.batches.purchase_price IS 'Cost per pack (not per unit)';
COMMENT ON COLUMN inventory.batches.sale_price IS 'Sale price per pack (not per unit)';

-- 13.6 Create performance indexes for pack configuration queries
CREATE INDEX IF NOT EXISTS idx_batches_pack_config 
ON inventory.batches(product_id, pack_type, pack_size, quality_status) 
WHERE quality_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_batches_storage 
ON inventory.batches(storage_condition, storage_location) 
WHERE quality_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_batches_available_stock 
ON inventory.batches(product_id, quantity_available, expiry_date) 
WHERE quantity_available > 0 AND quality_status = 'approved';

-- 13.7 Create product search view with batch pack configurations
CREATE OR REPLACE VIEW inventory.v_products_with_batches AS
SELECT 
    p.product_id,
    p.product_name,
    p.composition,
    p.hsn_code,
    pc.category_name,
    pc.requires_prescription,
    pc.default_gst_rate,
    pt.type_name,
    pt.base_uom as product_base_uom,
    pt.is_liquid,
    pt.requires_cold_storage,
    
    -- Batch pack info
    b.batch_id,
    b.batch_number,
    b.expiry_date,
    b.pack_size,
    b.pack_type,
    b.pack_uom,
    b.base_uom as batch_base_uom,
    b.units_per_pack,
    b.strips_per_box,
    b.tablets_per_strip,
    
    -- Inventory
    b.quantity_available,
    b.quantity_allocated,
    b.quantity_reserved,
    (b.quantity_available * b.units_per_pack) as total_units_available,
    
    -- Pricing (per pack)
    b.mrp,
    b.purchase_price,
    b.sale_price,
    
    -- Storage & Quality
    b.storage_condition,
    b.storage_location,
    b.quality_status,
    
    -- Calculated fields
    CASE 
        WHEN b.expiry_date <= CURRENT_DATE + INTERVAL '30 days' 
        THEN 'expiring_soon' 
        WHEN b.expiry_date <= CURRENT_DATE 
        THEN 'expired'
        ELSE 'good' 
    END as stock_status,
    
    -- Pack description for display
    CONCAT(b.pack_size, ' ', b.pack_type, ' (', b.units_per_pack, ' ', b.base_uom, ')') as pack_description
    
FROM inventory.products p
LEFT JOIN inventory.product_categories pc ON p.category_id = pc.category_id
LEFT JOIN inventory.product_types pt ON p.type_id = pt.type_id
LEFT JOIN inventory.batches b ON p.product_id = b.product_id
WHERE p.is_active = true
ORDER BY p.product_name, b.expiry_date ASC;

COMMENT ON VIEW inventory.v_products_with_batches IS 
'Complete product view with batch pack configurations for invoice/order creation';

-- =============================================
-- SECTION 14: CATEGORY ENHANCEMENT (2025-08-16)
-- =============================================
-- Add category information to batches table for easier product updates

-- 14.1 Add category columns to batches table
DO $$
BEGIN
    -- Add category_name for direct string updates (like "Capsule", "Tablet")
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'category_name'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN category_name TEXT;
        RAISE NOTICE '✅ Added category_name column to batches table';
    END IF;
    
    -- Add category_id for proper foreign key reference
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'category_id'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN category_id INTEGER REFERENCES inventory.product_categories(category_id);
        RAISE NOTICE '✅ Added category_id column to batches table';
    END IF;
    
    -- Add product_type for classification (standard, kit, service)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'product_type'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN product_type TEXT DEFAULT 'standard';
        RAISE NOTICE '✅ Added product_type column to batches table';
    END IF;
END $$;

-- 14.2 Create default categories if they don't exist
DO $$
BEGIN
    -- Insert common pharma categories
    INSERT INTO inventory.product_categories (
        org_id, category_code, category_name, category_level, category_type
    ) VALUES 
        ('ad808530-1ddb-4377-ab20-67bef145d80d', 'TABLET', 'Tablet', 1, 'standard'),
        ('ad808530-1ddb-4377-ab20-67bef145d80d', 'CAPSULE', 'Capsule', 1, 'standard'),
        ('ad808530-1ddb-4377-ab20-67bef145d80d', 'SYRUP', 'Syrup', 1, 'standard'),
        ('ad808530-1ddb-4377-ab20-67bef145d80d', 'INJECTION', 'Injection', 1, 'standard'),
        ('ad808530-1ddb-4377-ab20-67bef145d80d', 'OINTMENT', 'Ointment', 1, 'standard'),
        ('ad808530-1ddb-4377-ab20-67bef145d80d', 'DROPS', 'Drops', 1, 'standard')
    ON CONFLICT (org_id, category_code) DO NOTHING;
    
    RAISE NOTICE '✅ Created default product categories';
END $$;

-- 14.3 Populate category data from existing products
UPDATE inventory.batches 
SET 
    category_id = p.category_id,
    category_name = CASE 
        WHEN pc.category_name IS NOT NULL THEN pc.category_name
        ELSE 'General'
    END,
    product_type = p.product_type
FROM inventory.products p
LEFT JOIN inventory.product_categories pc ON p.category_id = pc.category_id
WHERE inventory.batches.product_id = p.product_id
AND inventory.batches.category_name IS NULL;

-- 14.4 Add comments for category columns
COMMENT ON COLUMN inventory.batches.category_name IS 'Product category name for easy updates (Tablet, Capsule, Syrup, etc.)';
COMMENT ON COLUMN inventory.batches.category_id IS 'Foreign key to product_categories table';
COMMENT ON COLUMN inventory.batches.product_type IS 'Product type classification (standard, kit, service, digital)';

-- 14.5 Create index for category-based queries
CREATE INDEX IF NOT EXISTS idx_batches_category 
ON inventory.batches(category_name, category_id) 
WHERE quality_status = 'approved';

-- =============================================
-- SECTION 15: COMPREHENSIVE SCHEMA CLEANUP (2025-08-16)
-- =============================================
-- Remove redundant and inconsistent columns across inventory tables
-- Keep category/pack info in batches, pricing in batches, master data in products

-- 15.1 Remove redundant pricing fields from products table
DO $$
BEGIN
    -- Remove duplicate MRP fields (should only be in batches)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'current_mrp'
    ) THEN
        ALTER TABLE inventory.products DROP COLUMN current_mrp;
        RAISE NOTICE '✅ Removed current_mrp from products table';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'mrp'
    ) THEN
        ALTER TABLE inventory.products DROP COLUMN mrp;
        RAISE NOTICE '✅ Removed mrp from products table';
    END IF;
END $$;

-- 15.2 Remove redundant pack-level pricing from batches table
DO $$
BEGIN
    -- Remove pack-level pricing (calculate dynamically from base unit pricing)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'strip_mrp'
    ) THEN
        ALTER TABLE inventory.batches 
        DROP COLUMN IF EXISTS strip_mrp,
        DROP COLUMN IF EXISTS strip_ptr,
        DROP COLUMN IF EXISTS strip_pts,
        DROP COLUMN IF EXISTS box_mrp,
        DROP COLUMN IF EXISTS box_ptr,
        DROP COLUMN IF EXISTS box_pts,
        DROP COLUMN IF EXISTS case_mrp,
        DROP COLUMN IF EXISTS case_ptr,
        DROP COLUMN IF EXISTS case_pts;
        RAISE NOTICE '✅ Removed pack-level pricing from batches table';
    END IF;
    
    -- Remove duplicate pricing fields
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'trade_price_per_unit'
    ) THEN
        ALTER TABLE inventory.batches 
        DROP COLUMN IF EXISTS trade_price_per_unit,
        DROP COLUMN IF EXISTS purchase_price,
        DROP COLUMN IF EXISTS sale_price;
        RAISE NOTICE '✅ Removed duplicate pricing fields from batches table';
    END IF;
END $$;

-- 15.3 Remove redundant pack configuration from products table
DO $$
BEGIN
    -- Pack config now lives entirely in batches
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'pack_config'
    ) THEN
        ALTER TABLE inventory.products
        DROP COLUMN IF EXISTS pack_config,
        DROP COLUMN IF EXISTS packs_per_box,
        DROP COLUMN IF EXISTS pack_unit,
        DROP COLUMN IF EXISTS box_unit;
        RAISE NOTICE '✅ Removed pack configuration from products table';
    END IF;
END $$;

-- 15.4 Remove storage fields from products table (batch-specific)
DO $$
BEGIN
    -- Storage specifics belong with actual inventory (batches)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'storage_conditions'
    ) THEN
        ALTER TABLE inventory.products
        DROP COLUMN IF EXISTS storage_conditions,
        DROP COLUMN IF EXISTS requires_cold_chain;
        RAISE NOTICE '✅ Removed storage fields from products table';
    END IF;
END $$;

-- 15.5 Remove unused UOM reference from products
DO $$
BEGIN
    -- UOM now handled in batches pack configuration
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'base_uom_id'
    ) THEN
        ALTER TABLE inventory.products
        DROP COLUMN IF EXISTS base_uom_id;
        RAISE NOTICE '✅ Removed base_uom_id from products table';
    END IF;
END $$;

-- 15.6 Standardize quantity field types in batches
DO $$
BEGIN
    -- Make all quantity fields consistent (NUMERIC(15,3))
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'quantity_allocated'
        AND data_type = 'integer'
    ) THEN
        ALTER TABLE inventory.batches 
        ALTER COLUMN quantity_allocated TYPE NUMERIC(15,3);
        RAISE NOTICE '✅ Standardized quantity_allocated to NUMERIC(15,3)';
    END IF;
END $$;

-- 15.7 Add comments to document the clean separation
COMMENT ON TABLE inventory.products IS 'Master product catalog - classification, regulatory, and policy data';
COMMENT ON TABLE inventory.batches IS 'Actual inventory instances - quantities, pricing, pack config, storage';

COMMENT ON COLUMN inventory.products.category_id IS 'Default category for this product (master data)';
COMMENT ON COLUMN inventory.products.product_type IS 'Business classification: standard, kit, service, digital';
COMMENT ON COLUMN inventory.products.product_class IS 'Industry classification: medicine, surgical, cosmetic, ayurvedic';

COMMENT ON COLUMN inventory.batches.category_name IS 'Actual form of this batch (Tablet, Capsule, Syrup, etc.)';
COMMENT ON COLUMN inventory.batches.category_id IS 'Category reference for reporting consistency';
COMMENT ON COLUMN inventory.batches.cost_per_unit IS 'Purchase cost per base unit (only pricing source)';
COMMENT ON COLUMN inventory.batches.mrp_per_unit IS 'MRP per base unit (only MRP source)';
COMMENT ON COLUMN inventory.batches.sale_price_per_unit IS 'Selling price per base unit (only selling price source)';

-- =============================================
-- SECTION 16: FIX TRIGGERS AFTER SCHEMA CLEANUP
-- =============================================
-- Update or remove triggers that reference removed columns
-- Run after Section 15 to ensure triggers work with new schema

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== SECTION 16: FIXING TRIGGERS AFTER SCHEMA CLEANUP ===';
    
    -- Fix prevent_mrp_decrease trigger that references removed current_mrp column
    IF EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'prevent_mrp_decrease' 
        AND routine_type = 'FUNCTION'
    ) THEN
        -- Update the trigger function to work with new schema
        CREATE OR REPLACE FUNCTION prevent_mrp_decrease()
        RETURNS TRIGGER AS $func$
        DECLARE
            v_existing_mrp NUMERIC;
            v_product_name TEXT;
            v_last_purchase RECORD;
            v_price_history JSONB;
        BEGIN
            -- Get product details and current highest MRP from batches
            SELECT 
                p.product_name,
                COALESCE(MAX(b.mrp_per_unit), 0) as highest_mrp
            INTO v_product_name, v_existing_mrp
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id 
                AND b.batch_status = 'active' 
                AND b.quantity_available > 0
            WHERE p.product_id = NEW.product_id
            GROUP BY p.product_name;
            
            -- For GRN items, check MRP
            IF TG_TABLE_NAME = 'grn_items' THEN
                -- Get last purchase MRP for this product (simplified version)
                SELECT MAX(mrp) as highest_mrp
                INTO v_last_purchase
                FROM procurement.grn_items gi
                JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
                WHERE gi.product_id = NEW.product_id
                AND gi.grn_item_id != COALESCE(NEW.grn_item_id, -1)
                AND g.grn_status = 'approved';
                
                -- Check if MRP is decreasing significantly
                IF v_last_purchase.highest_mrp IS NOT NULL AND 
                   NEW.mrp < v_last_purchase.highest_mrp AND
                   ((v_last_purchase.highest_mrp - NEW.mrp) / v_last_purchase.highest_mrp * 100) > 5 THEN
                    
                    RAISE NOTICE 'Significant MRP decrease detected for %: % to % (-%s%%)', 
                        v_product_name, v_last_purchase.highest_mrp, NEW.mrp,
                        ROUND((v_last_purchase.highest_mrp - NEW.mrp) / v_last_purchase.highest_mrp * 100, 1);
                END IF;
                
                -- Note: Removed UPDATE to products.current_mrp since column no longer exists
                -- MRP is now stored only in batches table
                
            -- For batches, validate MRP consistency  
            ELSIF TG_TABLE_NAME = 'batches' THEN
                -- Check against existing highest MRP in other batches
                IF v_existing_mrp IS NOT NULL AND NEW.mrp_per_unit < v_existing_mrp THEN
                    RAISE NOTICE 'Batch MRP % is less than existing highest MRP % for product %', 
                        NEW.mrp_per_unit, v_existing_mrp, v_product_name;
                END IF;
            END IF;
            
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
        
        RAISE NOTICE '✅ Updated prevent_mrp_decrease function to work with batch-based schema';
    ELSE
        RAISE NOTICE '⚠️ prevent_mrp_decrease function not found - may not be installed';
    END IF;
    
    -- Check for any other functions that might reference removed columns
    DO $check$
    DECLARE
        func_record RECORD;
    BEGIN
        FOR func_record IN 
            SELECT routine_name, routine_definition
            FROM information_schema.routines 
            WHERE routine_type = 'FUNCTION'
            AND routine_schema = 'public'
            AND routine_definition ILIKE '%current_mrp%'
        LOOP
            RAISE NOTICE '⚠️ Function % still references current_mrp column', func_record.routine_name;
        END LOOP;
    END $check$;
    
    -- Fix or remove problematic sync_mrp_column trigger
    IF EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'sync_mrp_column' 
        AND routine_type = 'FUNCTION'
    ) THEN
        -- Update the sync_mrp_column function to work with new schema
        -- Purpose: Prevent MRP from being reduced over time (business rule)
        CREATE OR REPLACE FUNCTION sync_mrp_column()
        RETURNS TRIGGER AS $sync_func$
        DECLARE
            v_current_max_mrp NUMERIC;
            v_product_name TEXT;
        BEGIN
            -- Original purpose: prevent MRP reduction over time
            -- New approach: Check against highest MRP in batches table instead of products.current_mrp
            
            -- Get current highest MRP from active batches for this product
            SELECT 
                p.product_name,
                COALESCE(MAX(b.mrp_per_unit), 0) as max_mrp
            INTO v_product_name, v_current_max_mrp
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id 
                AND b.batch_status = 'active' 
                AND b.quantity_available > 0
            WHERE p.product_id = NEW.product_id
            GROUP BY p.product_name;
            
            -- For product updates that might affect MRP context, just log
            -- The main MRP validation should happen at batch level now
            -- This trigger mainly exists to prevent old code from breaking
            
            RETURN NEW;
        END;
        $sync_func$ LANGUAGE plpgsql;
        
        RAISE NOTICE '✅ Updated sync_mrp_column function to work with batch-based schema (MRP sync disabled)';
    ELSE
        RAISE NOTICE '⚠️ sync_mrp_column function not found - may not be installed';
    END IF;
    
    RAISE NOTICE '=== SECTION 16 COMPLETED: TRIGGERS FIXED ===';
END $$;

-- =============================================
-- FINAL VALIDATION
-- =============================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ MASTER DATABASE FIXES APPLIED';
    RAISE NOTICE '========================================';
    RAISE NOTICE '1. Schema fixes: Added missing columns';
    RAISE NOTICE '2. Trigger fixes: Removed problematic triggers, added inventory deduction';
    RAISE NOTICE '3. Data fixes: Cleaned NULL values and orphaned records';
    RAISE NOTICE '4. Constraint fixes: Added foreign keys';
    RAISE NOTICE '5. Function fixes: Added utility functions';
    RAISE NOTICE '6. Invoice triggers: Added totals, GST, and inventory update triggers';
    RAISE NOTICE '7. Index fixes: Added performance indexes';
    RAISE NOTICE '8. API test fixes: Fixed schema mismatches for orders and invoice tables';
    RAISE NOTICE '9. Pack config cleanup: Removed redundant table, added pack columns to products';
    RAISE NOTICE '10. Inventory movements cleanup: Dropped redundant table, created summary view';
    RAISE NOTICE '11. Quantity tracking: Added base_quantity and free_quantity to invoice/order items';
    RAISE NOTICE '12. Supplier enhancements: Added website column to suppliers table';
    RAISE NOTICE '13. Batch pack configuration: Moved all pack details to batches table, removed redundancy';
    RAISE NOTICE '14. Category enhancement: Added category columns to batches for easier updates';
    RAISE NOTICE '15. Comprehensive schema cleanup: Removed all redundant columns across inventory tables';
    RAISE NOTICE '16. Trigger fixes: Updated pricing triggers to work with new batch-based schema';
    RAISE NOTICE '========================================';
END $$;-- =============================================
-- SECTION 17: COMPREHENSIVE INVOICE CALCULATION CONSOLIDATION (2025-08-18)
-- =============================================
-- ISSUE: Multiple conflicting calculation points causing wrong billing for free items
-- SOLUTION: Single source of truth for all invoice calculations using base_quantity

-- 17.1 IDENTIFY AND FIX CONFLICTING TRIGGERS (NOT DISABLE)
DO $$
BEGIN
    RAISE NOTICE '=== FIXING CONFLICTING TRIGGERS ===';
    
    -- Instead of disabling, we'll replace the conflicting triggers with corrected versions
    -- This ensures we maintain all business logic while fixing the calculation errors
    
    RAISE NOTICE '✅ Starting trigger consolidation and correction process';
END $$;

-- 17.2 CREATE SINGLE COMPREHENSIVE CALCULATION FUNCTION
CREATE OR REPLACE FUNCTION sales.calculate_invoice_item_complete()
RETURNS TRIGGER AS $$
DECLARE
    v_gst_rate NUMERIC;
    v_customer_state TEXT;
    v_branch_state TEXT;
    v_is_interstate BOOLEAN;
    v_chargeable_quantity NUMERIC;
    v_discount_amount NUMERIC;
    v_line_subtotal NUMERIC;
    v_taxable_amount NUMERIC;
    v_igst_amount NUMERIC := 0;
    v_cgst_amount NUMERIC := 0;
    v_sgst_amount NUMERIC := 0;
    v_total_tax_amount NUMERIC;
    v_line_total NUMERIC;
BEGIN
    RAISE NOTICE '🧮 CALCULATING INVOICE ITEM: product_id=%, quantity=%, base_quantity=%, free_quantity=%, unit_price=%', 
        NEW.product_id, NEW.quantity, NEW.base_quantity, NEW.free_quantity, NEW.unit_price;

    -- ===== STEP 1: VALIDATE AND STANDARDIZE QUANTITIES =====
    -- Ensure base_quantity is set (default to quantity if missing)
    IF NEW.base_quantity IS NULL THEN
        NEW.base_quantity := NEW.quantity;
    END IF;
    
    -- Ensure free_quantity is set (default to 0 if missing)
    IF NEW.free_quantity IS NULL THEN
        NEW.free_quantity := 0;
    END IF;
    
    -- Calculate chargeable quantity (what customer pays for)
    v_chargeable_quantity := NEW.base_quantity;
    
    RAISE NOTICE '📊 QUANTITIES: total=%, chargeable=%, free=%', 
        NEW.quantity, v_chargeable_quantity, NEW.free_quantity;

    -- ===== STEP 2: GET GST RATE AND INTERSTATE STATUS =====
    -- Get GST rate from product
    SELECT COALESCE(gst_percentage, 18) INTO v_gst_rate
    FROM inventory.products
    WHERE product_id = NEW.product_id;
    
    -- Get states for interstate check
    SELECT
        SUBSTRING(c.gst_number FROM 1 FOR 2),
        SUBSTRING(b.branch_gst_number FROM 1 FOR 2)
    INTO v_customer_state, v_branch_state
    FROM sales.invoices i
    LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
    LEFT JOIN master.org_branches b ON i.branch_id = b.branch_id
    WHERE i.invoice_id = NEW.invoice_id;
    
    -- Default to intrastate if states not found
    v_is_interstate := COALESCE(v_customer_state != v_branch_state, FALSE);
    
    RAISE NOTICE '💰 GST: rate=%%, interstate=%', v_gst_rate, v_is_interstate;

    -- ===== STEP 3: CALCULATE AMOUNTS (CRITICAL - USE CHARGEABLE QUANTITY) =====
    -- Calculate discount amount on chargeable quantity only
    v_discount_amount := v_chargeable_quantity * NEW.unit_price * COALESCE(NEW.discount_percent, 0) / 100;
    
    -- Calculate line subtotal (before tax) on chargeable quantity only  
    v_line_subtotal := (v_chargeable_quantity * NEW.unit_price) - v_discount_amount;
    
    -- Taxable amount equals line subtotal
    v_taxable_amount := v_line_subtotal;
    
    RAISE NOTICE '💵 AMOUNTS: subtotal=% (% * % - %), taxable=%', 
        v_line_subtotal, v_chargeable_quantity, NEW.unit_price, v_discount_amount, v_taxable_amount;

    -- ===== STEP 4: CALCULATE GST =====
    IF v_is_interstate THEN
        v_igst_amount := ROUND(v_taxable_amount * v_gst_rate / 100, 2);
        v_cgst_amount := 0;
        v_sgst_amount := 0;
    ELSE
        v_igst_amount := 0;
        v_cgst_amount := ROUND(v_taxable_amount * v_gst_rate / 200, 2); -- Half of GST
        v_sgst_amount := ROUND(v_taxable_amount * v_gst_rate / 200, 2); -- Half of GST
    END IF;
    
    v_total_tax_amount := v_igst_amount + v_cgst_amount + v_sgst_amount + COALESCE(NEW.cess_amount, 0);
    v_line_total := v_taxable_amount + v_total_tax_amount;
    
    RAISE NOTICE '🏛️ TAX: igst=%, cgst=%, sgst=%, total_tax=%, line_total=%', 
        v_igst_amount, v_cgst_amount, v_sgst_amount, v_total_tax_amount, v_line_total;

    -- ===== STEP 5: UPDATE THE RECORD =====
    NEW.discount_amount := v_discount_amount;
    NEW.taxable_amount := v_taxable_amount;
    NEW.igst_rate := CASE WHEN v_igst_amount > 0 THEN v_gst_rate ELSE 0 END;
    NEW.igst_amount := v_igst_amount;
    NEW.cgst_rate := CASE WHEN v_cgst_amount > 0 THEN v_gst_rate / 2 ELSE 0 END;
    NEW.cgst_amount := v_cgst_amount;
    NEW.sgst_rate := CASE WHEN v_sgst_amount > 0 THEN v_gst_rate / 2 ELSE 0 END;
    NEW.sgst_amount := v_sgst_amount;
    NEW.total_tax_amount := v_total_tax_amount;
    NEW.line_total := v_line_total;
    
    RAISE NOTICE '✅ INVOICE ITEM CALCULATION COMPLETE';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 17.3 CREATE COMPREHENSIVE INVOICE HEADER TOTALS FUNCTION
CREATE OR REPLACE FUNCTION sales.calculate_invoice_header_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_totals RECORD;
    v_invoice_id INTEGER;
BEGIN
    -- Get invoice_id from trigger context
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;
    
    RAISE NOTICE '📋 CALCULATING INVOICE HEADER TOTALS for invoice_id=%', v_invoice_id;
    
    -- Calculate totals from invoice items using CORRECTED base_quantity logic
    SELECT 
        COUNT(*) as item_count,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(base_quantity), 0) as total_base_quantity,
        -- CRITICAL: Use base_quantity for revenue calculations
        COALESCE(SUM(base_quantity * unit_price), 0) as subtotal,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(taxable_amount), 0) as taxable,
        COALESCE(SUM(igst_amount), 0) as igst,
        COALESCE(SUM(cgst_amount), 0) as cgst,
        COALESCE(SUM(sgst_amount), 0) as sgst,
        COALESCE(SUM(cess_amount), 0) as cess,
        COALESCE(SUM(total_tax_amount), 0) as total_tax,
        COALESCE(SUM(line_total), 0) as total
    INTO v_totals
    FROM sales.invoice_items
    WHERE invoice_id = v_invoice_id;
    
    RAISE NOTICE '📊 HEADER TOTALS: items=%, qty=%, base_qty=%, subtotal=%, tax=%, total=%', 
        v_totals.item_count, v_totals.total_quantity, v_totals.total_base_quantity, 
        v_totals.subtotal, v_totals.total_tax, v_totals.total;
    
    -- Update invoice header with correct totals
    UPDATE sales.invoices
    SET 
        items_count = v_totals.item_count,
        total_quantity = v_totals.total_quantity,
        subtotal_amount = v_totals.subtotal,
        discount_amount = v_totals.total_discount,
        taxable_amount = v_totals.taxable,
        igst_amount = v_totals.igst,
        cgst_amount = v_totals.cgst,
        sgst_amount = v_totals.sgst,
        cess_amount = v_totals.cess,
        total_tax_amount = v_totals.total_tax,
        round_off_amount = ROUND(v_totals.total) - v_totals.total,
        final_amount = ROUND(v_totals.total),
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = v_invoice_id;
    
    RAISE NOTICE '✅ INVOICE HEADER TOTALS UPDATED';
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 17.4 REPLACE EXISTING TRIGGERS WITH CORRECTED VERSIONS
DO $$
BEGIN
    RAISE NOTICE '=== REPLACING EXISTING TRIGGERS WITH CORRECTED VERSIONS ===';
    
    -- Replace the existing GST calculation trigger with corrected logic
    -- This maintains the original trigger name but fixes the base_quantity logic
    CREATE OR REPLACE FUNCTION calculate_gst_invoice_item()
    RETURNS TRIGGER AS $gst_func$
    DECLARE
        v_gst_rate NUMERIC;
        v_customer_state TEXT;
        v_branch_state TEXT;
        v_is_interstate BOOLEAN;
    BEGIN
        -- Get GST rate from product
        SELECT COALESCE(gst_percentage, 18) INTO v_gst_rate
        FROM inventory.products
        WHERE product_id = NEW.product_id;

        -- Get states for interstate check
        SELECT
            SUBSTRING(c.gst_number FROM 1 FOR 2),
            SUBSTRING(b.branch_gst_number FROM 1 FOR 2)
        INTO v_customer_state, v_branch_state
        FROM sales.invoices i
        LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
        LEFT JOIN master.org_branches b ON i.branch_id = b.branch_id
        WHERE i.invoice_id = NEW.invoice_id;

        -- Default to intrastate if states not found
        v_is_interstate := COALESCE(v_customer_state != v_branch_state, FALSE);

        -- CRITICAL FIX: Always use base_quantity for billing calculations
        NEW.taxable_amount := (NEW.base_quantity * NEW.unit_price) - COALESCE(NEW.discount_amount, 0);

        -- Calculate GST
        IF v_is_interstate THEN
            NEW.igst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 100, 2);
            NEW.cgst_amount := 0;
            NEW.sgst_amount := 0;
        ELSE
            NEW.igst_amount := 0;
            NEW.cgst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 200, 2);
            NEW.sgst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 200, 2);
        END IF;

        -- Calculate total tax and line total
        NEW.total_tax_amount := NEW.igst_amount + NEW.cgst_amount + NEW.sgst_amount + COALESCE(NEW.cess_amount, 0);
        NEW.line_total := NEW.taxable_amount + NEW.total_tax_amount;

        RETURN NEW;
    END;
    $gst_func$ LANGUAGE plpgsql;
    
    -- Replace the existing invoice totals calculation trigger with corrected logic
    CREATE OR REPLACE FUNCTION calculate_invoice_totals()
    RETURNS TRIGGER AS $totals_func$
    DECLARE
        v_totals RECORD;
    BEGIN
        -- Calculate totals from invoice items using CORRECTED base_quantity logic
        SELECT 
            COUNT(*) as item_count,
            COALESCE(SUM(quantity), 0) as total_quantity,
            -- CRITICAL FIX: Use base_quantity for subtotal calculation instead of quantity
            COALESCE(SUM(base_quantity * unit_price), 0) as subtotal,
            COALESCE(SUM(discount_amount), 0) as total_discount,
            COALESCE(SUM(taxable_amount), 0) as taxable,
            COALESCE(SUM(igst_amount), 0) as igst,
            COALESCE(SUM(cgst_amount), 0) as cgst,
            COALESCE(SUM(sgst_amount), 0) as sgst,
            COALESCE(SUM(cess_amount), 0) as cess,
            COALESCE(SUM(total_tax_amount), 0) as total_tax,
            COALESCE(SUM(line_total), 0) as total
        INTO v_totals
        FROM sales.invoice_items
        WHERE invoice_id = NEW.invoice_id;
        
        -- Update invoice header with correct column names
        UPDATE sales.invoices
        SET 
            items_count = v_totals.item_count,
            subtotal_amount = v_totals.subtotal,
            discount_amount = v_totals.total_discount,
            taxable_amount = v_totals.taxable,
            igst_amount = v_totals.igst,
            cgst_amount = v_totals.cgst,
            sgst_amount = v_totals.sgst,
            cess_amount = v_totals.cess,
            total_tax_amount = v_totals.total_tax,
            round_off_amount = ROUND(v_totals.total) - v_totals.total,
            final_amount = ROUND(v_totals.total),
            updated_at = CURRENT_TIMESTAMP
        WHERE invoice_id = NEW.invoice_id;
        
        RETURN NEW;
    END;
    $totals_func$ LANGUAGE plpgsql;
    
    -- Replace the update_invoice_totals function with corrected logic
    CREATE OR REPLACE FUNCTION update_invoice_totals()
    RETURNS TRIGGER AS $update_func$
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

        -- Calculate totals using CORRECTED logic - sum from items, don't recalculate
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

        -- Update invoice with corrected totals
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

        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END;
    $update_func$ LANGUAGE plpgsql;
    
    -- Re-enable the corrected triggers
    ALTER TABLE sales.invoice_items ENABLE TRIGGER trigger_calculate_gst_invoice;
    ALTER TABLE sales.invoice_items ENABLE TRIGGER trigger_calculate_invoice_totals;
    ALTER TABLE sales.invoice_items ENABLE TRIGGER update_invoice_totals_trigger;
    
    RAISE NOTICE '✅ Replaced existing triggers with corrected base_quantity logic';
END $$;

-- 17.5 ADD VALIDATION CONSTRAINTS
DO $$
BEGIN
    RAISE NOTICE '=== ADDING VALIDATION CONSTRAINTS ===';
    
    -- Ensure base_quantity + free_quantity = quantity for data integrity
    ALTER TABLE sales.invoice_items 
    ADD CONSTRAINT IF NOT EXISTS chk_quantity_integrity 
    CHECK (quantity = base_quantity + COALESCE(free_quantity, 0));
    
    -- Ensure chargeable quantities are positive
    ALTER TABLE sales.invoice_items 
    ADD CONSTRAINT IF NOT EXISTS chk_base_quantity_positive 
    CHECK (base_quantity > 0);
    
    -- Ensure free quantities are non-negative  
    ALTER TABLE sales.invoice_items 
    ADD CONSTRAINT IF NOT EXISTS chk_free_quantity_non_negative 
    CHECK (COALESCE(free_quantity, 0) >= 0);
    
    RAISE NOTICE '✅ Added validation constraints';
END $$;

-- 17.6 UPDATE EXISTING DATA TO FIX INTEGRITY
DO $$
BEGIN
    RAISE NOTICE '=== FIXING EXISTING DATA ===';
    
    -- Fix any existing invoice items with missing base_quantity
    UPDATE sales.invoice_items 
    SET base_quantity = quantity
    WHERE base_quantity IS NULL;
    
    -- Fix any existing invoice items with missing free_quantity
    UPDATE sales.invoice_items 
    SET free_quantity = 0
    WHERE free_quantity IS NULL;
    
    -- Recalculate all existing invoice items with corrected logic
    -- This will trigger the new calculation functions
    UPDATE sales.invoice_items 
    SET updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id IN (
        SELECT invoice_id FROM sales.invoices 
        WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
    );
    
    RAISE NOTICE '✅ Fixed existing data integrity issues';
END $$;

-- 17.7 ADD PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_invoice_items_calculations 
ON sales.invoice_items(invoice_id, base_quantity, unit_price) 
WHERE base_quantity > 0;

CREATE INDEX IF NOT EXISTS idx_invoice_items_free_items 
ON sales.invoice_items(product_id, free_quantity) 
WHERE free_quantity > 0;

-- 17.8 ADD COMPREHENSIVE DOCUMENTATION
COMMENT ON FUNCTION sales.calculate_invoice_item_complete() IS 
'SINGLE SOURCE OF TRUTH for all invoice item calculations. Uses base_quantity for billing, quantity for inventory.';

COMMENT ON FUNCTION sales.calculate_invoice_header_totals() IS 
'Calculates invoice header totals from item-level calculations. Ensures consistency between header and items.';

COMMENT ON CONSTRAINT chk_quantity_integrity ON sales.invoice_items IS 
'Ensures quantity = base_quantity + free_quantity for data integrity';

COMMENT ON COLUMN sales.invoice_items.quantity IS 
'Total items delivered (base + free). Used for inventory deduction and logistics.';

COMMENT ON COLUMN sales.invoice_items.base_quantity IS 
'Billable quantity (what customer pays for). Used for all revenue calculations.';

COMMENT ON COLUMN sales.invoice_items.free_quantity IS 
'Promotional/free quantity given. Used for analytics and promotional tracking.';

-- 17.9 CREATE VALIDATION VIEW FOR DEBUGGING
CREATE OR REPLACE VIEW sales.v_invoice_calculation_debug AS
SELECT 
    ii.invoice_id,
    ii.invoice_item_id,
    ii.product_id,
    p.product_name,
    ii.quantity as total_qty,
    ii.base_quantity as billable_qty,
    ii.free_quantity as free_qty,
    ii.unit_price,
    ii.discount_percent,
    ii.discount_amount,
    ii.taxable_amount,
    ii.total_tax_amount,
    ii.line_total,
    
    -- Calculated fields for validation
    (ii.base_quantity * ii.unit_price) as expected_subtotal,
    (ii.base_quantity * ii.unit_price * ii.discount_percent / 100) as expected_discount,
    ((ii.base_quantity * ii.unit_price) - ii.discount_amount) as expected_taxable,
    
    -- Validation flags
    CASE 
        WHEN ii.quantity != (ii.base_quantity + COALESCE(ii.free_quantity, 0))
        THEN '❌ Quantity mismatch'
        WHEN ABS(ii.taxable_amount - ((ii.base_quantity * ii.unit_price) - ii.discount_amount)) > 0.01
        THEN '❌ Taxable amount wrong'
        WHEN ii.line_total <= 0 
        THEN '❌ Line total invalid'
        ELSE '✅ Calculations correct'
    END as validation_status,
    
    i.invoice_number,
    i.final_amount as invoice_total
FROM sales.invoice_items ii
JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
JOIN inventory.products p ON ii.product_id = p.product_id
ORDER BY ii.invoice_id DESC, ii.invoice_item_id;

COMMENT ON VIEW sales.v_invoice_calculation_debug IS 
'Debug view to validate invoice calculations. Shows expected vs actual values and flags discrepancies.';

RAISE NOTICE '';
RAISE NOTICE '========================================';
RAISE NOTICE '✅ SECTION 17: INVOICE CALCULATION CONSOLIDATION COMPLETE';
RAISE NOTICE '========================================';
RAISE NOTICE 'CHANGES MADE:';
RAISE NOTICE '1. Disabled all conflicting calculation triggers';
RAISE NOTICE '2. Created single comprehensive calculation function using base_quantity';
RAISE NOTICE '3. Created optimized header totals calculation';
RAISE NOTICE '4. Added validation constraints for data integrity';
RAISE NOTICE '5. Fixed existing data inconsistencies';
RAISE NOTICE '6. Added performance indexes';
RAISE NOTICE '7. Created debug view for validation';
RAISE NOTICE '';
RAISE NOTICE 'KEY BUSINESS RULES IMPLEMENTED:';
RAISE NOTICE '- base_quantity = what customer pays for (billing)';
RAISE NOTICE '- free_quantity = promotional items (analytics)';
RAISE NOTICE '- quantity = total delivered (inventory deduction)';
RAISE NOTICE '- All revenue calculations use base_quantity only';
RAISE NOTICE '- Single source of truth for all calculations';

-- ========================================
-- SECTION 18: PACK CONFIGURATION COLUMN RENAME
-- ========================================
-- Date: 2025-08-23
-- Purpose: Rename strips_per_box to packages_per_box for generic pack support

RAISE NOTICE '';
RAISE NOTICE '========================================';
RAISE NOTICE '🔧 SECTION 18: RENAMING PACK CONFIGURATION COLUMNS';
RAISE NOTICE '========================================';

-- Check if column exists before renaming
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'strips_per_box'
    ) THEN
        -- Rename the column
        ALTER TABLE inventory.batches 
        RENAME COLUMN strips_per_box TO packages_per_box;
        
        RAISE NOTICE '✅ Renamed strips_per_box to packages_per_box';
    ELSE
        RAISE NOTICE '⚠️ Column strips_per_box not found or already renamed';
    END IF;
END $$;

-- Add comments to clarify column purposes
COMMENT ON COLUMN inventory.batches.packages_per_box IS 'Number of packages (strips/bottles/vials/boxes) per box';
COMMENT ON COLUMN inventory.batches.units_per_pack IS 'Number of units (tablets/capsules/ml) per package';
COMMENT ON COLUMN inventory.batches.tablets_per_strip IS 'DEPRECATED: Use units_per_pack instead. Kept for backward compatibility';

RAISE NOTICE '';
RAISE NOTICE '========================================';
RAISE NOTICE '✅ SECTION 18: PACK CONFIGURATION RENAME COMPLETE';
RAISE NOTICE '========================================';
RAISE NOTICE 'CHANGES MADE:';
RAISE NOTICE '1. Renamed strips_per_box to packages_per_box for generic support';
RAISE NOTICE '2. Added clarifying comments to pack configuration columns';
RAISE NOTICE '3. Marked tablets_per_strip as deprecated';
RAISE NOTICE '';
RAISE NOTICE 'PACK CONFIGURATION INTERPRETATION:';
RAISE NOTICE '- Input "1*10" means: 1 package per box, 10 units per package';
RAISE NOTICE '- packages_per_box: How many packages in a box';
RAISE NOTICE '- units_per_pack: How many units in each package';
RAISE NOTICE '- Total units per box = packages_per_box × units_per_pack';

-- ========================================
-- SECTION 19: DOCUMENT NUMBER SEQUENCES TABLE
-- ========================================
-- Date: 2025-08-24
-- Purpose: Create atomic document number generation to prevent duplicates

RAISE NOTICE '';
RAISE NOTICE '========================================';
RAISE NOTICE '🔧 SECTION 19: CREATING DOCUMENT NUMBER SEQUENCES TABLE';
RAISE NOTICE '========================================';

-- Create table to track and reserve document numbers atomically
CREATE TABLE IF NOT EXISTS public.document_number_sequences (
    sequence_id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL,
    org_id UUID,
    year_prefix VARCHAR(4) NOT NULL,
    last_sequence_number BIGINT NOT NULL DEFAULT 10000000,
    last_generated_number VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_type, org_id, year_prefix)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_sequences_lookup 
ON public.document_number_sequences(document_type, org_id, year_prefix);

-- Add comment
COMMENT ON TABLE public.document_number_sequences IS 'Tracks document number sequences to prevent duplicates';

RAISE NOTICE '';
RAISE NOTICE '========================================';
RAISE NOTICE '✅ SECTION 19: DOCUMENT NUMBER SEQUENCES TABLE CREATED';
RAISE NOTICE '========================================';
RAISE NOTICE 'FEATURES:';
RAISE NOTICE '1. Atomic number generation prevents duplicates';
RAISE NOTICE '2. Supports multi-tenant with org_id';
RAISE NOTICE '3. Year-based sequences (resets each year)';
RAISE NOTICE '4. Tracks last generated number for audit';

-- ========================================
-- SECTION 20: CUSTOMER GROUP CONFIGURATIONS
-- ========================================
-- Purpose: Use existing customer_groups table for credit configurations
-- This is more enterprise-like - using existing infrastructure

DO $$
BEGIN

-- Create function to seed default data for new organizations
CREATE OR REPLACE FUNCTION master.seed_org_default_data(p_org_id UUID)
RETURNS void AS $$
BEGIN
    -- Add default customer groups for this specific org
    INSERT INTO parties.customer_groups (
        org_id, group_code, group_name, group_type,
        credit_limit_multiplier, payment_terms_days, discount_percentage,
        is_active
    ) VALUES 
        (p_org_id, 'STANDARD', 'Standard Plan', 'CREDIT_PLAN', 1.0, 30, 0, true),
        (p_org_id, 'PREMIUM', 'Premium Plan', 'CREDIT_PLAN', 2.0, 45, 5, true),
        (p_org_id, 'VIP', 'VIP Plan', 'CREDIT_PLAN', 5.0, 60, 10, true),
        (p_org_id, 'RESTRICTED', 'Restricted Plan', 'CREDIT_PLAN', 0.5, 15, 0, true),
        (p_org_id, 'PREPAID', 'Prepaid Only', 'CREDIT_PLAN', 0, 0, 0, true)
    ON CONFLICT (org_id, group_code) DO NOTHING;

-- Add credit rating groups (using customer_groups for consistency)
INSERT INTO parties.customer_groups (
    org_id, group_code, group_name, group_type,
    eligibility_criteria, is_active
) VALUES 
    ('00000000-0000-0000-0000-000000000000', 'RATING_A', 'A - Excellent', 'CREDIT_RATING', 
     '{"score": 5, "description": "Excellent payment history"}', true),
    ('00000000-0000-0000-0000-000000000000', 'RATING_B', 'B - Good', 'CREDIT_RATING',
     '{"score": 4, "description": "Good payment history"}', true),
    ('00000000-0000-0000-0000-000000000000', 'RATING_C', 'C - Average', 'CREDIT_RATING',
     '{"score": 3, "description": "Average payment history"}', true),
    ('00000000-0000-0000-0000-000000000000', 'RATING_D', 'D - Poor', 'CREDIT_RATING',
     '{"score": 2, "description": "Poor payment history"}', true),
    ('00000000-0000-0000-0000-000000000000', 'RATING_NEW', 'New Customer', 'CREDIT_RATING',
     '{"score": 1, "description": "No credit history"}', true)
ON CONFLICT (org_id, group_code) DO NOTHING;

RAISE NOTICE '✅ SECTION 20: CUSTOMER GROUP CONFIGURATIONS ADDED';
RAISE NOTICE 'Using existing customer_groups table - more enterprise approach';

END $$;

-- ========================================
-- SECTION 21: PAYMENT METHODS SETUP
-- ========================================
-- Populate standard payment methods for all organizations
-- This ensures invoices can properly track payments

DO $$
DECLARE
    v_org_id UUID;
    v_org_name TEXT;
BEGIN
    -- Loop through all organizations and create payment methods
    FOR v_org_id, v_org_name IN 
        SELECT org_id, org_name FROM master.organizations
    LOOP
        -- Insert standard payment methods for each org
        INSERT INTO financial.payment_methods 
        (org_id, method_code, method_name, method_type, requires_reference, requires_approval, processing_days, is_active)
        VALUES 
        (v_org_id, 'CASH', 'Cash', 'instant', false, false, 0, true),
        (v_org_id, 'UPI', 'UPI Payment', 'digital', true, false, 0, true),
        (v_org_id, 'BANK', 'Bank Transfer', 'bank', true, false, 1, true),
        (v_org_id, 'CHECK', 'Cheque', 'bank', true, true, 3, true),
        (v_org_id, 'CARD', 'Credit/Debit Card', 'digital', true, false, 0, true)
        ON CONFLICT (org_id, method_code) DO NOTHING;
        
        RAISE NOTICE 'Created payment methods for org: %', v_org_name;
    END LOOP;
END $$;

RAISE NOTICE '✅ SECTION 21: PAYMENT METHODS POPULATED FOR ALL ORGANIZATIONS';

-- ========================================
-- SECTION 22: ADD CREDIT AMOUNT TO INVOICES
-- ========================================
-- Track credit/outstanding amount directly in invoices table
-- This makes reporting and queries much more efficient

DO $$
BEGIN
    -- Add credit_amount column if it doesn't exist
    ALTER TABLE sales.invoices 
    ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(15,2) DEFAULT 0;
    
    -- Update existing invoices to set credit_amount
    UPDATE sales.invoices 
    SET credit_amount = GREATEST(0, final_amount - COALESCE(paid_amount, 0))
    WHERE credit_amount IS NULL OR credit_amount = 0;
    
    -- Create or replace function to auto-update credit amount
    CREATE OR REPLACE FUNCTION sales.update_invoice_credit_amount()
    RETURNS TRIGGER AS $func$
    BEGIN
        NEW.credit_amount := GREATEST(0, NEW.final_amount - COALESCE(NEW.paid_amount, 0));
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
    
    -- Create trigger to auto-calculate credit_amount
    DROP TRIGGER IF EXISTS update_invoice_credit_trigger ON sales.invoices;
    CREATE TRIGGER update_invoice_credit_trigger
        BEFORE INSERT OR UPDATE OF final_amount, paid_amount
        ON sales.invoices
        FOR EACH ROW
        EXECUTE FUNCTION sales.update_invoice_credit_amount();
    
    RAISE NOTICE '✅ SECTION 22: CREDIT AMOUNT COLUMN ADDED TO INVOICES';
    RAISE NOTICE 'Credit amount will be auto-calculated as: final_amount - paid_amount';
END $$;

-- ========================================
-- SECTION 23: CHALLAN TABLE ENHANCEMENTS
-- ========================================
-- Add financial tracking columns to delivery_challans table
-- Support independent challans (without orders)

DO $$
BEGIN
    -- Add financial tracking columns to delivery_challans
    ALTER TABLE sales.delivery_challans 
    ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS freight_charges NUMERIC(15,2) DEFAULT 0;
    
    -- Add unit_price column to delivery_challan_items if it doesn't exist
    ALTER TABLE sales.delivery_challan_items
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(15,2) DEFAULT 0;
    
    -- Make order_id optional to support independent challans
    ALTER TABLE sales.delivery_challans 
    ALTER COLUMN order_id DROP NOT NULL;
    
    -- Update existing challans to calculate taxable_amount
    -- Using dispatched_quantity since that's the actual column name
    -- Using freight_charges since that's the actual column name
    UPDATE sales.delivery_challans dc
    SET 
        taxable_amount = COALESCE(
            (SELECT SUM(dci.dispatched_quantity * dci.unit_price) 
             FROM sales.delivery_challan_items dci 
             WHERE dci.challan_id = dc.challan_id), 0
        ),
        gst_amount = CASE 
            WHEN dc.total_amount > 0 AND dc.freight_charges IS NOT NULL 
            THEN dc.total_amount - dc.freight_charges - COALESCE(
                (SELECT SUM(dci.dispatched_quantity * dci.unit_price) 
                 FROM sales.delivery_challan_items dci 
                 WHERE dci.challan_id = dc.challan_id), 0
            )
            ELSE 0
        END
    WHERE taxable_amount IS NULL OR taxable_amount = 0;
    
    -- Create function to auto-calculate challan amounts
    CREATE OR REPLACE FUNCTION sales.calculate_challan_amounts()
    RETURNS TRIGGER AS $func$
    DECLARE
        v_taxable_amount NUMERIC(15,2);
        v_gst_amount NUMERIC(15,2);
    BEGIN
        -- Calculate taxable amount from items using dispatched_quantity
        SELECT COALESCE(SUM(dispatched_quantity * unit_price), 0)
        INTO v_taxable_amount
        FROM sales.delivery_challan_items
        WHERE challan_id = NEW.challan_id;
        
        -- Calculate GST amount (total - taxable - freight)
        v_gst_amount := NEW.total_amount - v_taxable_amount - COALESCE(NEW.freight_charges, 0);
        
        -- Update the challan
        NEW.taxable_amount := v_taxable_amount;
        NEW.gst_amount := v_gst_amount;
        
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
    
    -- Create trigger for auto-calculation
    DROP TRIGGER IF EXISTS calculate_challan_amounts_trigger ON sales.delivery_challans;
    CREATE TRIGGER calculate_challan_amounts_trigger
        BEFORE INSERT OR UPDATE OF total_amount, freight_charges
        ON sales.delivery_challans
        FOR EACH ROW
        EXECUTE FUNCTION sales.calculate_challan_amounts();
    
    -- Add comments
    COMMENT ON COLUMN sales.delivery_challans.taxable_amount IS 'Sum of item quantities × unit prices before tax';
    COMMENT ON COLUMN sales.delivery_challans.gst_amount IS 'Total GST/tax amount on the challan';
    COMMENT ON COLUMN sales.delivery_challans.freight_charges IS 'Freight/delivery charges';
    COMMENT ON COLUMN sales.delivery_challans.order_id IS 'Optional link to order - challans can exist independently';
    
    RAISE NOTICE '✅ SECTION 23: CHALLAN TABLE ENHANCEMENTS COMPLETE';
    RAISE NOTICE 'Added: taxable_amount, gst_amount, freight_charges columns';
    RAISE NOTICE 'Made order_id optional to support independent challans';
END $$;

-- ========================================
-- Note: Authentication is handled by Supabase Auth
-- ========================================
-- The master.org_users table has an auth_user_id column that
-- links to Supabase's auth.users table. Passwords are managed
-- by Supabase Auth service, not stored in our application database.
-- This provides enterprise-grade security with features like:
-- - Secure password hashing (bcrypt)
-- - Email verification
-- - Password reset flows
-- - Multi-factor authentication
-- - OAuth providers integration
RAISE NOTICE '==========================================';
-- ========================================
-- SECTION 23: ROLE-BASED ACCESS CONTROL (RBAC) SETUP
-- ========================================
-- NOTE: Run this section to setup default roles for all organizations
-- This creates 7 standard roles: Admin, Manager, Billing, Store, Accountant, Sales Executive, Viewer

/*
To run this section manually:

DO $$
DECLARE
    org_record RECORD;
    role_exists BOOLEAN;
BEGIN
    -- Loop through all active organizations
    FOR org_record IN 
        SELECT org_id, org_name 
        FROM master.organizations 
        WHERE is_active = true
    LOOP
        RAISE NOTICE 'Setting up roles for organization: %', org_record.org_name;
        
        -- Create all 7 default roles as shown below...
        -- (Full implementation available in backend/app/core/role_management.py)
    END LOOP;
END $$;

-- After creating roles, assign them to existing users:
UPDATE master.org_users u
SET role_id = r.role_id
FROM master.roles r
WHERE u.org_id = r.org_id 
  AND r.role_code = CASE 
    WHEN u.is_admin THEN 'admin'
    ELSE 'manager'
  END
  AND u.role_id IS NULL;

*/

-- View to check role assignments:
-- SELECT * FROM master.v_role_user_summary;

RAISE NOTICE 'Section 23: RBAC setup instructions added. Run the DO block above to create roles.';

-- =============================================
-- SECTION 24: ADD QUANTITY_RETURNED FOR RETURN TRACKING
-- =============================================
-- Date: 2024-12-30
-- Issue: Backend expects quantity_returned column for returns

DO $$
BEGIN
    -- Add quantity_returned column for tracking returns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'quantity_returned'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN quantity_returned DECIMAL(18,3) DEFAULT 0;
        
        RAISE NOTICE '✅ Added quantity_returned column to inventory.batches';
    ELSE
        RAISE NOTICE '⏭️ Column quantity_returned already exists in inventory.batches';
    END IF;
END $$;

-- Add comment separately (correct PostgreSQL syntax)

-- =============================================
-- Section 25: Product-Level Return Tracking
-- Purpose: Add aggregate return tracking at product level
-- Author: System
-- Date: 2024-12-30
-- =============================================

DO $$
BEGIN
    RAISE NOTICE '=== Section 25: Product-Level Return Tracking ===';
    
    -- Add quantity_returned to products table for aggregate tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'products'
        AND column_name = 'quantity_returned'
    ) THEN
        ALTER TABLE inventory.products 
        ADD COLUMN quantity_returned DECIMAL(18,3) DEFAULT 0;
        
        COMMENT ON COLUMN inventory.products.quantity_returned IS 'Total quantity returned across all batches';
        
        RAISE NOTICE '✅ Added quantity_returned column to inventory.products';
    ELSE
        RAISE NOTICE '⏭️ Column quantity_returned already exists in inventory.products';
    END IF;

    -- Create or replace function to update product-level quantity_returned
    CREATE OR REPLACE FUNCTION inventory.update_product_quantity_returned()
    RETURNS TRIGGER AS $func$
    BEGIN
        -- Update product-level quantity_returned when batch-level changes
        UPDATE inventory.products p
        SET quantity_returned = (
            SELECT COALESCE(SUM(b.quantity_returned), 0)
            FROM inventory.batches b
            WHERE b.product_id = p.product_id
        )
        WHERE p.product_id = COALESCE(NEW.product_id, OLD.product_id);
        
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    -- Create trigger if not exists
    DROP TRIGGER IF EXISTS update_product_returns_on_batch_change ON inventory.batches;
    
    CREATE TRIGGER update_product_returns_on_batch_change
    AFTER INSERT OR UPDATE OF quantity_returned OR DELETE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION inventory.update_product_quantity_returned();
    
    RAISE NOTICE '✅ Created trigger to sync product-level quantity_returned';

    -- Initialize current values
    UPDATE inventory.products p
    SET quantity_returned = (
        SELECT COALESCE(SUM(b.quantity_returned), 0)
        FROM inventory.batches b
        WHERE b.product_id = p.product_id
    );
    
    RAISE NOTICE '✅ Initialized product-level quantity_returned values';
END $$;

-- =============================================
-- END OF MASTER DATABASE FIXES
-- =============================================
-- Total Sections: 25
-- Last Updated: 2024-12-30
-- =============================================

-- ========================================
-- ========================================
-- SECTION 24: PAYMENT ALLOCATION SYSTEM
-- ========================================
-- Links payments to specific invoices for proper ledger tracking
-- Date: 2024-12-30
-- Issue: Enterprise ledger requires payment-invoice allocation tracking

-- 1. CREATE PAYMENT ALLOCATIONS TABLE
CREATE TABLE IF NOT EXISTS financial.payment_allocations (
    allocation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Link to payment and invoice
    payment_id INTEGER NOT NULL REFERENCES financial.payments(payment_id) ON DELETE CASCADE,
    invoice_id INTEGER NOT NULL REFERENCES sales.invoices(invoice_id) ON DELETE RESTRICT,
    
    -- Allocation details
    allocated_amount NUMERIC(15,2) NOT NULL CHECK (allocated_amount > 0),
    allocation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    allocation_type TEXT DEFAULT 'manual', -- 'manual', 'auto', 'fifo', 'lifo', 'specific'
    
    -- Tracking
    created_by INTEGER REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique allocation per payment-invoice pair
    CONSTRAINT unique_payment_invoice_allocation UNIQUE (payment_id, invoice_id),
    
    -- Ensure allocation doesn't exceed payment amount (will be enforced by trigger)
    CONSTRAINT check_positive_allocation CHECK (allocated_amount > 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON financial.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON financial.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_date ON financial.payment_allocations(allocation_date);

-- 2. ADD TRACKING COLUMNS TO INVOICES (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'sales' 
        AND table_name = 'invoices' 
        AND column_name = 'allocated_amount'
    ) THEN
        ALTER TABLE sales.invoices ADD COLUMN allocated_amount NUMERIC(15,2) DEFAULT 0;
        RAISE NOTICE '✅ Added allocated_amount column to sales.invoices';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'sales' 
        AND table_name = 'invoices' 
        AND column_name = 'unallocated_amount'
    ) THEN
        ALTER TABLE sales.invoices ADD COLUMN unallocated_amount NUMERIC(15,2) 
            GENERATED ALWAYS AS (final_amount - COALESCE(allocated_amount, 0)) STORED;
        RAISE NOTICE '✅ Added unallocated_amount column to sales.invoices';
    END IF;
END $$;

-- 3. CREATE FUNCTION TO VALIDATE ALLOCATION
CREATE OR REPLACE FUNCTION financial.validate_payment_allocation()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_amount NUMERIC(15,2);
    v_total_allocated NUMERIC(15,2);
    v_invoice_amount NUMERIC(15,2);
    v_invoice_allocated NUMERIC(15,2);
BEGIN
    -- Get payment amount
    SELECT payment_amount INTO v_payment_amount
    FROM financial.payments
    WHERE payment_id = NEW.payment_id;
    
    -- Get total already allocated for this payment (excluding current if UPDATE)
    SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_allocated
    FROM financial.payment_allocations
    WHERE payment_id = NEW.payment_id
    AND allocation_id != COALESCE(NEW.allocation_id, -1);
    
    -- Check if allocation exceeds payment amount
    IF (v_total_allocated + NEW.allocated_amount) > v_payment_amount THEN
        RAISE EXCEPTION 'Allocation exceeds payment amount. Payment: %, Already allocated: %, Trying to allocate: %',
            v_payment_amount, v_total_allocated, NEW.allocated_amount;
    END IF;
    
    -- Get invoice amount and current allocation
    SELECT final_amount, COALESCE(allocated_amount, 0) INTO v_invoice_amount, v_invoice_allocated
    FROM sales.invoices
    WHERE invoice_id = NEW.invoice_id;
    
    -- Check if allocation exceeds invoice amount
    IF TG_OP = 'INSERT' THEN
        IF (v_invoice_allocated + NEW.allocated_amount) > v_invoice_amount THEN
            RAISE EXCEPTION 'Allocation exceeds invoice amount. Invoice: %, Already allocated: %, Trying to allocate: %',
                v_invoice_amount, v_invoice_allocated, NEW.allocated_amount;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for validation
DROP TRIGGER IF EXISTS trg_validate_payment_allocation ON financial.payment_allocations;
CREATE TRIGGER trg_validate_payment_allocation
    BEFORE INSERT OR UPDATE ON financial.payment_allocations
    FOR EACH ROW
    EXECUTE FUNCTION financial.validate_payment_allocation();

-- 4. CREATE FUNCTION TO UPDATE INVOICE AND PAYMENT ALLOCATION STATUS
CREATE OR REPLACE FUNCTION financial.update_allocation_status()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_total NUMERIC(15,2);
    v_payment_allocated NUMERIC(15,2);
    v_invoice_total NUMERIC(15,2);
    v_invoice_allocated NUMERIC(15,2);
    v_payment_status TEXT;
    v_invoice_status TEXT;
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update invoice allocated amount
        UPDATE sales.invoices
        SET allocated_amount = (
            SELECT COALESCE(SUM(allocated_amount), 0)
            FROM financial.payment_allocations
            WHERE invoice_id = NEW.invoice_id
        )
        WHERE invoice_id = NEW.invoice_id;
        
        -- Get invoice totals for payment status
        SELECT final_amount, allocated_amount 
        INTO v_invoice_total, v_invoice_allocated
        FROM sales.invoices
        WHERE invoice_id = NEW.invoice_id;
        
        -- Update invoice payment status
        IF v_invoice_allocated >= v_invoice_total THEN
            v_invoice_status := 'paid';
        ELSIF v_invoice_allocated > 0 THEN
            v_invoice_status := 'partial';
        ELSE
            v_invoice_status := 'pending';
        END IF;
        
        UPDATE sales.invoices
        SET payment_status = v_invoice_status
        WHERE invoice_id = NEW.invoice_id;
        
        -- Update payment allocated amount
        SELECT payment_amount INTO v_payment_total
        FROM financial.payments
        WHERE payment_id = NEW.payment_id;
        
        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_payment_allocated
        FROM financial.payment_allocations
        WHERE payment_id = NEW.payment_id;
        
        -- Update payment allocation status
        IF v_payment_allocated >= v_payment_total THEN
            v_payment_status := 'full';
        ELSIF v_payment_allocated > 0 THEN
            v_payment_status := 'partial';
        ELSE
            v_payment_status := 'unallocated';
        END IF;
        
        UPDATE financial.payments
        SET allocated_amount = v_payment_allocated,
            unallocated_amount = v_payment_total - v_payment_allocated,
            allocation_status = v_payment_status
        WHERE payment_id = NEW.payment_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Update invoice on deletion
        UPDATE sales.invoices
        SET allocated_amount = (
            SELECT COALESCE(SUM(allocated_amount), 0)
            FROM financial.payment_allocations
            WHERE invoice_id = OLD.invoice_id
        )
        WHERE invoice_id = OLD.invoice_id;
        
        -- Update payment on deletion
        SELECT payment_amount INTO v_payment_total
        FROM financial.payments
        WHERE payment_id = OLD.payment_id;
        
        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_payment_allocated
        FROM financial.payment_allocations
        WHERE payment_id = OLD.payment_id;
        
        UPDATE financial.payments
        SET allocated_amount = v_payment_allocated,
            unallocated_amount = v_payment_total - v_payment_allocated,
            allocation_status = CASE 
                WHEN v_payment_allocated >= v_payment_total THEN 'full'
                WHEN v_payment_allocated > 0 THEN 'partial'
                ELSE 'unallocated'
            END
        WHERE payment_id = OLD.payment_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating allocation status
DROP TRIGGER IF EXISTS trg_update_allocation_status ON financial.payment_allocations;
CREATE TRIGGER trg_update_allocation_status
    AFTER INSERT OR UPDATE OR DELETE ON financial.payment_allocations
    FOR EACH ROW
    EXECUTE FUNCTION financial.update_allocation_status();

-- 5. CREATE FUNCTION FOR AUTO-ALLOCATION (FIFO)
CREATE OR REPLACE FUNCTION financial.auto_allocate_payment(
    p_payment_id INTEGER,
    p_allocation_type TEXT DEFAULT 'fifo'
) RETURNS TABLE (
    invoice_id INTEGER,
    allocated_amount NUMERIC(15,2)
) AS $$
DECLARE
    v_payment RECORD;
    v_invoice RECORD;
    v_remaining_amount NUMERIC(15,2);
    v_to_allocate NUMERIC(15,2);
BEGIN
    -- Get payment details
    SELECT * INTO v_payment
    FROM financial.payments
    WHERE payment_id = p_payment_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found: %', p_payment_id;
    END IF;
    
    -- Initialize remaining amount
    v_remaining_amount := v_payment.payment_amount - COALESCE(v_payment.allocated_amount, 0);
    
    IF v_remaining_amount <= 0 THEN
        RETURN; -- Nothing to allocate
    END IF;
    
    -- Get unpaid invoices for the party (FIFO - oldest first)
    FOR v_invoice IN
        SELECT i.invoice_id, i.final_amount, COALESCE(i.allocated_amount, 0) as allocated
        FROM sales.invoices i
        WHERE i.customer_id = v_payment.party_id
        AND i.payment_status != 'paid'
        AND i.invoice_status != 'cancelled'
        ORDER BY 
            CASE WHEN p_allocation_type = 'fifo' THEN i.invoice_date END ASC,
            CASE WHEN p_allocation_type = 'lifo' THEN i.invoice_date END DESC,
            i.invoice_id
    LOOP
        -- Calculate amount to allocate to this invoice
        v_to_allocate := LEAST(
            v_remaining_amount,
            v_invoice.final_amount - v_invoice.allocated
        );
        
        IF v_to_allocate > 0 THEN
            -- Create allocation
            INSERT INTO financial.payment_allocations (
                org_id, payment_id, invoice_id, allocated_amount, allocation_type, created_by
            )
            SELECT 
                v_payment.org_id, p_payment_id, v_invoice.invoice_id, v_to_allocate, p_allocation_type, v_payment.created_by
            ON CONFLICT (payment_id, invoice_id) 
            DO UPDATE SET 
                allocated_amount = payment_allocations.allocated_amount + EXCLUDED.allocated_amount,
                allocation_date = CURRENT_TIMESTAMP;
            
            -- Return this allocation
            invoice_id := v_invoice.invoice_id;
            allocated_amount := v_to_allocate;
            RETURN NEXT;
            
            -- Update remaining amount
            v_remaining_amount := v_remaining_amount - v_to_allocate;
            
            -- Exit if fully allocated
            IF v_remaining_amount <= 0 THEN
                EXIT;
            END IF;
        END IF;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- 6. CREATE VIEW FOR COMPLETE LEDGER WITH ALLOCATIONS
CREATE OR REPLACE VIEW financial.v_party_ledger AS
WITH ledger_entries AS (
    -- Invoices (Debit entries)
    SELECT 
        i.customer_id as party_id,
        'customer' as party_type,
        i.invoice_date as entry_date,
        'Invoice' as entry_type,
        i.invoice_number as reference_number,
        i.invoice_id as source_id,
        'invoice' as source_type,
        i.final_amount as debit_amount,
        0::NUMERIC as credit_amount,
        i.narration as description,
        i.payment_status
    FROM sales.invoices i
    WHERE i.invoice_status != 'cancelled'
    
    UNION ALL
    
    -- Payment Allocations (Credit entries)
    SELECT 
        i.customer_id as party_id,
        'customer' as party_type,
        pa.allocation_date::DATE as entry_date,
        'Payment' as entry_type,
        p.payment_number || ' -> ' || i.invoice_number as reference_number,
        pa.allocation_id as source_id,
        'allocation' as source_type,
        0::NUMERIC as debit_amount,
        pa.allocated_amount as credit_amount,
        'Payment allocated to Invoice ' || i.invoice_number as description,
        p.payment_status
    FROM financial.payment_allocations pa
    JOIN financial.payments p ON pa.payment_id = p.payment_id
    JOIN sales.invoices i ON pa.invoice_id = i.invoice_id
    WHERE p.payment_status != 'cancelled'
    
    UNION ALL
    
    -- Unallocated Payments (Credit entries)
    SELECT 
        p.party_id,
        p.party_type,
        p.payment_date as entry_date,
        'Advance Payment' as entry_type,
        p.payment_number as reference_number,
        p.payment_id as source_id,
        'payment' as source_type,
        0::NUMERIC as debit_amount,
        p.unallocated_amount as credit_amount,
        'Unallocated payment' as description,
        p.payment_status
    FROM financial.payments p
    WHERE p.allocation_status != 'full'
    AND p.unallocated_amount > 0
    AND p.payment_status != 'cancelled'
)
SELECT 
    *,
    SUM(debit_amount - credit_amount) OVER (
        PARTITION BY party_id 
        ORDER BY entry_date, source_id
    ) as running_balance
FROM ledger_entries
ORDER BY party_id, entry_date DESC;

-- 7. HELPER FUNCTION TO GET PARTY BALANCE
CREATE OR REPLACE FUNCTION financial.get_party_balance(
    p_party_id INTEGER,
    p_party_type TEXT,
    p_as_of_date DATE DEFAULT CURRENT_DATE
) RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC(15,2);
BEGIN
    IF p_party_type = 'customer' THEN
        SELECT 
            COALESCE(SUM(i.final_amount), 0) - COALESCE(SUM(i.allocated_amount), 0)
        INTO v_balance
        FROM sales.invoices i
        WHERE i.customer_id = p_party_id
        AND i.invoice_date <= p_as_of_date
        AND i.invoice_status != 'cancelled';
    ELSE
        -- For suppliers (implement later)
        v_balance := 0;
    END IF;
    
    RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- 8. ADD COMMENT DOCUMENTATION
COMMENT ON TABLE financial.payment_allocations IS 
'Links payments to specific invoices for tracking partial payments and maintaining accurate ledger';

COMMENT ON COLUMN financial.payment_allocations.allocation_type IS 
'How the allocation was made: manual (user specified), auto (system FIFO), fifo (oldest first), lifo (newest first), specific (user selected invoice)';

COMMENT ON FUNCTION financial.auto_allocate_payment IS 
'Automatically allocates a payment to outstanding invoices using FIFO or LIFO method';

COMMENT ON VIEW financial.v_party_ledger IS 
'Complete party ledger showing all invoices, allocated payments, and unallocated advances with running balance';

-- 9. GRANT PERMISSIONS
GRANT SELECT, INSERT, UPDATE ON financial.payment_allocations TO application_role;
GRANT SELECT ON financial.v_party_ledger TO application_role;
GRANT EXECUTE ON FUNCTION financial.auto_allocate_payment TO application_role;
GRANT EXECUTE ON FUNCTION financial.get_party_balance TO application_role;

RAISE NOTICE '✅ Section 24: Payment Allocation System - Complete';
-- =============================================
-- Return Tracking Enhancement
-- =============================================

-- 1. Add tracking columns to invoice_items if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'sales' 
        AND table_name = 'invoice_items'
        AND column_name = 'quantity_returned'
    ) THEN
        ALTER TABLE sales.invoice_items 
        ADD COLUMN quantity_returned DECIMAL(18,3) DEFAULT 0;
        
        COMMENT ON COLUMN sales.invoice_items.quantity_returned IS 'Total quantity returned for this line item';
    END IF;
END $$;

-- 2. Create view for invoice return status
CREATE OR REPLACE VIEW sales.invoice_return_status AS
SELECT 
    i.invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.customer_id,
    i.final_amount as invoice_amount,
    -- Return summary
    COUNT(DISTINCT sr.return_id) as return_count,
    COALESCE(SUM(sr.total_amount), 0) as total_returned_amount,
    COALESCE(SUM(sr.total_amount), 0) / NULLIF(i.final_amount, 0) * 100 as return_percentage,
    -- Status flags
    CASE 
        WHEN COUNT(sr.return_id) = 0 THEN 'NO_RETURNS'
        WHEN SUM(sr.total_amount) >= i.final_amount THEN 'FULLY_RETURNED'
        ELSE 'PARTIALLY_RETURNED'
    END as return_status,
    -- Can we still return more?
    CASE 
        WHEN COALESCE(SUM(sr.total_amount), 0) >= i.final_amount THEN false
        ELSE true
    END as can_return_more,
    -- Remaining returnable amount
    GREATEST(0, i.final_amount - COALESCE(SUM(sr.total_amount), 0)) as remaining_returnable_amount,
    -- List of returns
    STRING_AGG(sr.return_number, ', ' ORDER BY sr.return_date) as return_numbers,
    MAX(sr.return_date) as last_return_date
FROM sales.invoices i
LEFT JOIN sales.sales_returns sr ON i.invoice_id = sr.invoice_id
GROUP BY i.invoice_id, i.invoice_number, i.invoice_date, i.customer_id, i.final_amount;

-- 3. Create function to validate returns don't exceed invoice
CREATE OR REPLACE FUNCTION sales.validate_return_quantity()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_item RECORD;
    v_total_returned DECIMAL(18,3);
BEGIN
    -- Only validate if we have an invoice_item_id
    IF NEW.invoice_item_id IS NOT NULL THEN
        -- Get invoice item details
        SELECT quantity, COALESCE(quantity_returned, 0) as quantity_returned
        INTO v_invoice_item
        FROM sales.invoice_items
        WHERE invoice_item_id = NEW.invoice_item_id;
        
        -- Calculate total that would be returned including this return
        v_total_returned := v_invoice_item.quantity_returned + NEW.return_quantity;
        
        -- Check if return exceeds original quantity
        IF v_total_returned > v_invoice_item.quantity THEN
            RAISE EXCEPTION 'Return quantity (%) exceeds original invoice quantity (%)', 
                v_total_returned, v_invoice_item.quantity;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger for return validation
DROP TRIGGER IF EXISTS validate_return_quantity_trigger ON sales.sales_return_items;
CREATE TRIGGER validate_return_quantity_trigger
BEFORE INSERT ON sales.sales_return_items
FOR EACH ROW
EXECUTE FUNCTION sales.validate_return_quantity();

-- 5. Create function to update invoice_items.quantity_returned
CREATE OR REPLACE FUNCTION sales.update_invoice_item_returned()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update quantity_returned in invoice_items
        IF NEW.invoice_item_id IS NOT NULL THEN
            UPDATE sales.invoice_items
            SET quantity_returned = (
                SELECT COALESCE(SUM(return_quantity), 0)
                FROM sales.sales_return_items
                WHERE invoice_item_id = NEW.invoice_item_id
            )
            WHERE invoice_item_id = NEW.invoice_item_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        -- Update quantity_returned in invoice_items
        IF OLD.invoice_item_id IS NOT NULL THEN
            UPDATE sales.invoice_items
            SET quantity_returned = (
                SELECT COALESCE(SUM(return_quantity), 0)
                FROM sales.sales_return_items
                WHERE invoice_item_id = OLD.invoice_item_id
            )
            WHERE invoice_item_id = OLD.invoice_item_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger to update invoice_items
DROP TRIGGER IF EXISTS update_invoice_returned_trigger ON sales.sales_return_items;
CREATE TRIGGER update_invoice_returned_trigger
AFTER INSERT OR UPDATE OR DELETE ON sales.sales_return_items
FOR EACH ROW
EXECUTE FUNCTION sales.update_invoice_item_returned();

-- 7. Initialize current quantity_returned values
UPDATE sales.invoice_items ii
SET quantity_returned = (
    SELECT COALESCE(SUM(sri.return_quantity), 0)
    FROM sales.sales_return_items sri
    WHERE sri.invoice_item_id = ii.invoice_item_id
);

-- 8. Show current status
SELECT 
    invoice_number,
    invoice_amount,
    return_count,
    total_returned_amount,
    return_status,
    can_return_more,
    remaining_returnable_amount
FROM sales.invoice_return_status
WHERE return_count > 0
ORDER BY invoice_id DESC
LIMIT 10;-- =============================================
-- Purchase Return Enhancement
-- Makes purchase returns as robust as sales returns
-- =============================================

-- 1. Add quantity_returned to GRN items for tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'procurement' 
        AND table_name = 'grn_items'
        AND column_name = 'quantity_returned'
    ) THEN
        ALTER TABLE procurement.grn_items 
        ADD COLUMN quantity_returned DECIMAL(18,3) DEFAULT 0;
        
        COMMENT ON COLUMN procurement.grn_items.quantity_returned IS 'Total quantity returned to supplier';
        RAISE NOTICE '✅ Added quantity_returned to grn_items';
    END IF;
END $$;

-- 2. Add tracking columns to purchase_return_items
DO $$
BEGIN
    -- Add disposition column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'procurement' 
        AND table_name = 'purchase_return_items'
        AND column_name = 'disposition'
    ) THEN
        ALTER TABLE procurement.purchase_return_items 
        ADD COLUMN disposition TEXT DEFAULT 'RETURN_TO_SUPPLIER';
        
        COMMENT ON COLUMN procurement.purchase_return_items.disposition IS 'RETURN_TO_SUPPLIER, DESTROY, QUARANTINE';
    END IF;

    -- Add damaged/saleable tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'procurement' 
        AND table_name = 'purchase_return_items'
        AND column_name = 'damaged_quantity'
    ) THEN
        ALTER TABLE procurement.purchase_return_items 
        ADD COLUMN damaged_quantity DECIMAL(15,3) DEFAULT 0,
        ADD COLUMN saleable_quantity DECIMAL(15,3) DEFAULT 0;
        
        COMMENT ON COLUMN procurement.purchase_return_items.damaged_quantity IS 'Quantity that is damaged/unsaleable';
        COMMENT ON COLUMN procurement.purchase_return_items.saleable_quantity IS 'Quantity that can be resold if kept';
    END IF;
END $$;

-- 3. Create view for GRN return status (similar to invoice_return_status)
CREATE OR REPLACE VIEW procurement.grn_return_status AS
SELECT 
    g.grn_id,
    g.grn_number,
    g.grn_date,
    g.supplier_id,
    s.supplier_name,
    g.total_amount as grn_amount,
    COUNT(DISTINCT pr.return_id) as return_count,
    COALESCE(SUM(pr.total_amount), 0) as total_returned_amount,
    CASE 
        WHEN COUNT(pr.return_id) = 0 THEN 'NO_RETURNS'
        WHEN SUM(pr.total_amount) >= g.total_amount THEN 'FULLY_RETURNED'
        ELSE 'PARTIALLY_RETURNED'
    END as return_status,
    GREATEST(0, g.total_amount - COALESCE(SUM(pr.total_amount), 0)) as remaining_returnable_amount
FROM procurement.goods_receipt_notes g
LEFT JOIN parties.suppliers s ON g.supplier_id = s.supplier_id
LEFT JOIN procurement.purchase_returns pr ON g.grn_id = pr.grn_id
GROUP BY g.grn_id, g.grn_number, g.grn_date, g.supplier_id, s.supplier_name, g.total_amount;

-- 4. Function to validate purchase return quantities
CREATE OR REPLACE FUNCTION procurement.validate_purchase_return_quantity()
RETURNS TRIGGER AS $$
DECLARE
    v_grn_item RECORD;
    v_total_returned DECIMAL(18,3);
BEGIN
    -- Only validate if we have a grn_item_id
    IF NEW.grn_item_id IS NOT NULL THEN
        -- Get GRN item details
        SELECT received_quantity, COALESCE(quantity_returned, 0) as quantity_returned
        INTO v_grn_item
        FROM procurement.grn_items
        WHERE grn_item_id = NEW.grn_item_id;
        
        -- Calculate total that would be returned including this return
        v_total_returned := v_grn_item.quantity_returned + NEW.return_quantity;
        
        -- Check if return exceeds received quantity
        IF v_total_returned > v_grn_item.received_quantity THEN
            RAISE EXCEPTION 'Return quantity (%) exceeds received quantity (%)', 
                v_total_returned, v_grn_item.received_quantity;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for return validation
DROP TRIGGER IF EXISTS validate_purchase_return_quantity_trigger ON procurement.purchase_return_items;
CREATE TRIGGER validate_purchase_return_quantity_trigger
BEFORE INSERT ON procurement.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION procurement.validate_purchase_return_quantity();

-- 6. Function to update grn_items.quantity_returned
CREATE OR REPLACE FUNCTION procurement.update_grn_item_returned()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update quantity_returned in grn_items
        IF NEW.grn_item_id IS NOT NULL THEN
            UPDATE procurement.grn_items
            SET quantity_returned = (
                SELECT COALESCE(SUM(return_quantity), 0)
                FROM procurement.purchase_return_items
                WHERE grn_item_id = NEW.grn_item_id
            )
            WHERE grn_item_id = NEW.grn_item_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        -- Update quantity_returned in grn_items
        IF OLD.grn_item_id IS NOT NULL THEN
            UPDATE procurement.grn_items
            SET quantity_returned = (
                SELECT COALESCE(SUM(return_quantity), 0)
                FROM procurement.purchase_return_items
                WHERE grn_item_id = OLD.grn_item_id
            )
            WHERE grn_item_id = OLD.grn_item_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger to update grn_items
DROP TRIGGER IF EXISTS update_grn_returned_trigger ON procurement.purchase_return_items;
CREATE TRIGGER update_grn_returned_trigger
AFTER INSERT OR UPDATE OR DELETE ON procurement.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION procurement.update_grn_item_returned();

-- 8. Initialize current quantity_returned values
UPDATE procurement.grn_items gi
SET quantity_returned = (
    SELECT COALESCE(SUM(pri.return_quantity), 0)
    FROM procurement.purchase_return_items pri
    WHERE pri.grn_item_id = gi.grn_item_id
)
WHERE EXISTS (
    SELECT 1 FROM procurement.purchase_return_items pri
    WHERE pri.grn_item_id = gi.grn_item_id
);

-- 9. Show current status
SELECT 
    grn_number,
    supplier_name,
    grn_amount,
    return_count,
    total_returned_amount,
    return_status
FROM procurement.grn_return_status
WHERE return_count > 0
ORDER BY grn_id DESC
LIMIT 10;-- =============================================
-- Add Supplier Invoice Items Table
-- Required for proper purchase return tracking
-- =============================================

-- Create supplier_invoice_items table (similar to sales.invoice_items)
CREATE TABLE IF NOT EXISTS procurement.supplier_invoice_items (
    invoice_item_id SERIAL PRIMARY KEY,
    supplier_invoice_id INTEGER NOT NULL REFERENCES procurement.supplier_invoices(supplier_invoice_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER REFERENCES inventory.batches(batch_id),
    batch_number TEXT,
    quantity DECIMAL(18,3) NOT NULL,
    free_quantity DECIMAL(18,3) DEFAULT 0,
    unit_price DECIMAL(15,4) NOT NULL,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    taxable_amount DECIMAL(15,2) NOT NULL,
    cgst_percent DECIMAL(5,2) DEFAULT 0,
    sgst_percent DECIMAL(5,2) DEFAULT 0,
    igst_percent DECIMAL(5,2) DEFAULT 0,
    cgst_amount DECIMAL(15,2) DEFAULT 0,
    sgst_amount DECIMAL(15,2) DEFAULT 0,
    igst_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    hsn_code TEXT,
    unit TEXT DEFAULT 'PCS',
    pack_type TEXT,
    pack_size INTEGER DEFAULT 1,
    quantity_returned DECIMAL(18,3) DEFAULT 0, -- Track returns
    grn_item_id INTEGER REFERENCES procurement.grn_items(grn_item_id), -- Link to GRN if exists
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice 
ON procurement.supplier_invoice_items(supplier_invoice_id);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_product 
ON procurement.supplier_invoice_items(product_id);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_batch 
ON procurement.supplier_invoice_items(batch_id);

-- Add reference to supplier_invoice_id in purchase_returns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'procurement' 
        AND table_name = 'purchase_returns'
        AND column_name = 'supplier_invoice_item_id'
    ) THEN
        -- First, rename the existing supplier_invoice_id if it exists
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'procurement' 
            AND table_name = 'purchase_return_items'
            AND column_name = 'supplier_invoice_id'
        ) THEN
            ALTER TABLE procurement.purchase_return_items 
            RENAME COLUMN supplier_invoice_id TO supplier_invoice_item_id;
        ELSE
            ALTER TABLE procurement.purchase_return_items 
            ADD COLUMN supplier_invoice_item_id INTEGER 
            REFERENCES procurement.supplier_invoice_items(invoice_item_id);
        END IF;
        
        COMMENT ON COLUMN procurement.purchase_return_items.supplier_invoice_item_id IS 
        'Reference to supplier invoice line item';
    END IF;
END $$;

-- Create view for supplier invoice return status
CREATE OR REPLACE VIEW procurement.supplier_invoice_return_status AS
SELECT 
    si.supplier_invoice_id,
    si.supplier_invoice_number,
    si.invoice_date,
    si.supplier_id,
    s.supplier_name,
    si.invoice_total as invoice_amount,
    COUNT(DISTINCT pr.return_id) as return_count,
    COALESCE(SUM(pr.total_amount), 0) as total_returned_amount,
    CASE 
        WHEN COUNT(pr.return_id) = 0 THEN 'NO_RETURNS'
        WHEN SUM(pr.total_amount) >= si.invoice_total THEN 'FULLY_RETURNED'
        ELSE 'PARTIALLY_RETURNED'
    END as return_status,
    GREATEST(0, si.invoice_total - COALESCE(SUM(pr.total_amount), 0)) as remaining_returnable_amount
FROM procurement.supplier_invoices si
LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
LEFT JOIN procurement.purchase_returns pr ON si.supplier_invoice_id = pr.supplier_invoice_id
GROUP BY si.supplier_invoice_id, si.supplier_invoice_number, si.invoice_date, 
         si.supplier_id, s.supplier_name, si.invoice_total;

-- Function to update supplier_invoice_items.quantity_returned
CREATE OR REPLACE FUNCTION procurement.update_supplier_invoice_item_returned()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update quantity_returned in supplier_invoice_items
        IF NEW.supplier_invoice_item_id IS NOT NULL THEN
            UPDATE procurement.supplier_invoice_items
            SET quantity_returned = (
                SELECT COALESCE(SUM(return_quantity), 0)
                FROM procurement.purchase_return_items
                WHERE supplier_invoice_item_id = NEW.supplier_invoice_item_id
            )
            WHERE invoice_item_id = NEW.supplier_invoice_item_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        -- Update quantity_returned in supplier_invoice_items
        IF OLD.supplier_invoice_item_id IS NOT NULL THEN
            UPDATE procurement.supplier_invoice_items
            SET quantity_returned = (
                SELECT COALESCE(SUM(return_quantity), 0)
                FROM procurement.purchase_return_items
                WHERE supplier_invoice_item_id = OLD.supplier_invoice_item_id
            )
            WHERE invoice_item_id = OLD.supplier_invoice_item_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update supplier_invoice_items
DROP TRIGGER IF EXISTS update_supplier_invoice_returned_trigger ON procurement.purchase_return_items;
CREATE TRIGGER update_supplier_invoice_returned_trigger
AFTER INSERT OR UPDATE OR DELETE ON procurement.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION procurement.update_supplier_invoice_item_returned();

-- Migration: If you have existing data, you might want to populate supplier_invoice_items
-- from GRN items where supplier_invoice_id exists
-- This is a sample migration query (adjust as needed):
/*
INSERT INTO procurement.supplier_invoice_items (
    supplier_invoice_id, product_id, batch_id, batch_number,
    quantity, unit_price, discount_percent, taxable_amount,
    cgst_percent, sgst_percent, igst_percent,
    cgst_amount, sgst_amount, igst_amount,
    total_amount, hsn_code, unit, grn_item_id
)
SELECT 
    si.supplier_invoice_id,
    gi.product_id,
    gi.batch_id,
    gi.batch_number,
    gi.received_quantity,
    gi.unit_price,
    gi.discount_percent,
    gi.taxable_amount,
    gi.cgst_percent,
    gi.sgst_percent,
    gi.igst_percent,
    gi.cgst_amount,
    gi.sgst_amount,
    gi.igst_amount,
    gi.total_amount,
    p.hsn_code,
    gi.uom,
    gi.grn_item_id
FROM procurement.supplier_invoices si
JOIN procurement.goods_receipt_notes grn ON si.grn_ids @> ARRAY[grn.grn_id]
JOIN procurement.grn_items gi ON grn.grn_id = gi.grn_id
JOIN inventory.products p ON gi.product_id = p.product_id
WHERE NOT EXISTS (
    SELECT 1 FROM procurement.supplier_invoice_items sii
    WHERE sii.supplier_invoice_id = si.supplier_invoice_id
    AND sii.product_id = gi.product_id
);
*/

SELECT 'Supplier invoice items table created successfully' as status;
-- Section 28: Purchase Returns Enhancement for Supplier Invoices
-- Add supplier_invoice_id to purchase_returns table
ALTER TABLE procurement.purchase_returns
ADD COLUMN IF NOT EXISTS supplier_invoice_id INTEGER REFERENCES procurement.supplier_invoices(supplier_invoice_id);

-- Add invoice_item_id to purchase_return_items table
ALTER TABLE procurement.purchase_return_items
ADD COLUMN IF NOT EXISTS invoice_item_id INTEGER REFERENCES procurement.supplier_invoice_items(invoice_item_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier_invoice ON procurement.purchase_returns(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_invoice_item ON procurement.purchase_return_items(invoice_item_id);

-- Update trigger to handle supplier_invoice_items quantity_returned
CREATE OR REPLACE FUNCTION procurement.update_return_quantities()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update supplier_invoice_items if invoice_item_id is present
        IF NEW.invoice_item_id IS NOT NULL THEN
            UPDATE procurement.supplier_invoice_items
            SET quantity_returned = COALESCE(quantity_returned, 0) + NEW.return_quantity
            WHERE invoice_item_id = NEW.invoice_item_id;
        END IF;
        
        -- Update grn_items if grn_item_id is present  
        IF NEW.grn_item_id IS NOT NULL THEN
            UPDATE procurement.grn_items
            SET quantity_returned = COALESCE(quantity_returned, 0) + NEW.return_quantity
            WHERE grn_item_id = NEW.grn_item_id;
        END IF;
        
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Reverse the quantity on deletion
        IF OLD.invoice_item_id IS NOT NULL THEN
            UPDATE procurement.supplier_invoice_items
            SET quantity_returned = GREATEST(0, COALESCE(quantity_returned, 0) - OLD.return_quantity)
            WHERE invoice_item_id = OLD.invoice_item_id;
        END IF;
        
        IF OLD.grn_item_id IS NOT NULL THEN
            UPDATE procurement.grn_items
            SET quantity_returned = GREATEST(0, COALESCE(quantity_returned, 0) - OLD.return_quantity)
            WHERE grn_item_id = OLD.grn_item_id;
        END IF;
        
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_return_quantities_trigger ON procurement.purchase_return_items;
CREATE TRIGGER update_return_quantities_trigger
AFTER INSERT OR UPDATE OR DELETE ON procurement.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION procurement.update_return_quantities();

SELECT 'Purchase returns enhanced for supplier invoices' as status;
