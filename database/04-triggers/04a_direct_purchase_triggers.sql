-- =============================================
-- DIRECT PURCHASE ENTRY TRIGGERS
-- =============================================
-- Handles batch creation and inventory updates when
-- purchases are created directly (without GRN)
-- =============================================

-- =============================================
-- 1. CREATE/UPDATE BATCHES ON PURCHASE ITEM INSERT
-- =============================================
CREATE OR REPLACE FUNCTION process_purchase_batch_and_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_batch_id INTEGER;
    v_existing_batch RECORD;
    v_org_id INTEGER;
    v_branch_id INTEGER;
    v_supplier_id INTEGER;
BEGIN
    -- Only process if the purchase is approved/completed
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.item_status = 'received') THEN
        
        -- Get org_id and branch_id from purchase order
        SELECT org_id, branch_id, supplier_id 
        INTO v_org_id, v_branch_id, v_supplier_id
        FROM procurement.purchase_orders 
        WHERE purchase_order_id = NEW.purchase_order_id;
        
        -- Check if batch already exists
        SELECT * INTO v_existing_batch
        FROM inventory.batches
        WHERE org_id = v_org_id
        AND product_id = NEW.product_id
        AND batch_number = COALESCE(NEW.batch_number, 'DEFAULT-' || NEW.product_id || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD'));
        
        IF v_existing_batch.batch_id IS NOT NULL THEN
            -- Update existing batch
            UPDATE inventory.batches
            SET 
                quantity_available = quantity_available + NEW.ordered_quantity,
                -- Update cost using weighted average
                cost_per_unit = CASE 
                    WHEN quantity_available + NEW.ordered_quantity > 0 THEN
                        ((quantity_available * cost_per_unit) + (NEW.ordered_quantity * NEW.unit_price)) 
                        / (quantity_available + NEW.ordered_quantity)
                    ELSE NEW.unit_price
                END,
                purchase_price = NEW.unit_price,
                selling_price = COALESCE(NEW.selling_price, selling_price),
                mrp_per_unit = COALESCE(NEW.mrp, mrp_per_unit),
                updated_at = CURRENT_TIMESTAMP
            WHERE batch_id = v_existing_batch.batch_id;
            
            v_batch_id := v_existing_batch.batch_id;
        ELSE
            -- Create new batch
            INSERT INTO inventory.batches (
                org_id,
                branch_id,
                product_id,
                batch_number,
                expiry_date,
                initial_quantity,
                quantity_available,
                quantity_reserved,
                cost_per_unit,
                purchase_price,
                selling_price,
                mrp_per_unit,
                supplier_id,
                batch_status,
                created_at,
                updated_at
            ) VALUES (
                v_org_id,
                v_branch_id,
                NEW.product_id,
                COALESCE(NEW.batch_number, 'DEFAULT-' || NEW.product_id || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD')),
                COALESCE(NEW.expiry_date, CURRENT_DATE + INTERVAL '2 years'),
                NEW.ordered_quantity,
                NEW.ordered_quantity,
                0,
                NEW.unit_price,
                NEW.unit_price,
                COALESCE(NEW.selling_price, NEW.unit_price * 1.2), -- Default 20% markup
                COALESCE(NEW.mrp, NEW.unit_price * 1.5), -- Default 50% markup for MRP
                v_supplier_id,
                'active',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            ) RETURNING batch_id INTO v_batch_id;
        END IF;
        
        -- Update or create stock level
        INSERT INTO inventory.stock_levels (
            org_id,
            branch_id,
            product_id,
            quantity_in_stock,
            quantity_reserved,
            quantity_available,
            last_purchase_date,
            last_purchase_price,
            updated_at
        ) VALUES (
            v_org_id,
            v_branch_id,
            NEW.product_id,
            NEW.ordered_quantity,
            0,
            NEW.ordered_quantity,
            CURRENT_DATE,
            NEW.unit_price,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (org_id, branch_id, product_id) DO UPDATE
        SET 
            quantity_in_stock = stock_levels.quantity_in_stock + NEW.ordered_quantity,
            quantity_available = stock_levels.quantity_available + NEW.ordered_quantity,
            last_purchase_date = CURRENT_DATE,
            last_purchase_price = NEW.unit_price,
            updated_at = CURRENT_TIMESTAMP;
        
        -- Create stock movement record
        INSERT INTO inventory.stock_movements (
            org_id,
            branch_id,
            product_id,
            batch_id,
            movement_type,
            movement_date,
            quantity,
            reference_type,
            reference_id,
            unit_cost,
            total_cost,
            notes,
            created_by,
            created_at
        ) VALUES (
            v_org_id,
            v_branch_id,
            NEW.product_id,
            v_batch_id,
            'purchase',
            CURRENT_DATE,
            NEW.ordered_quantity,
            'purchase_order',
            NEW.purchase_order_id,
            NEW.unit_price,
            NEW.ordered_quantity * NEW.unit_price,
            'Direct purchase entry - PO Item #' || NEW.po_item_id,
            'system',
            CURRENT_TIMESTAMP
        );
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for purchase order items
DROP TRIGGER IF EXISTS trigger_process_purchase_batch ON procurement.purchase_order_items;
CREATE TRIGGER trigger_process_purchase_batch
    AFTER INSERT OR UPDATE ON procurement.purchase_order_items
    FOR EACH ROW
    WHEN (NEW.item_status IS NULL OR NEW.item_status IN ('pending', 'received', 'completed'))
    EXECUTE FUNCTION process_purchase_batch_and_inventory();

-- =============================================
-- 2. UPDATE PRODUCT PRICING ON PURCHASE
-- =============================================
CREATE OR REPLACE FUNCTION update_product_pricing_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
    -- Update product's last purchase price and potentially the default selling price
    UPDATE inventory.products
    SET 
        last_purchase_price = NEW.unit_price,
        last_purchase_date = CURRENT_DATE,
        -- Update average cost using weighted average
        average_cost = CASE 
            WHEN COALESCE(current_stock, 0) + NEW.ordered_quantity > 0 THEN
                ((COALESCE(current_stock, 0) * COALESCE(average_cost, 0)) + 
                 (NEW.ordered_quantity * NEW.unit_price)) / 
                (COALESCE(current_stock, 0) + NEW.ordered_quantity)
            ELSE NEW.unit_price
        END,
        -- Update selling price if provided
        selling_price = COALESCE(NEW.selling_price, selling_price),
        mrp = COALESCE(NEW.mrp, mrp),
        updated_at = CURRENT_TIMESTAMP
    WHERE product_id = NEW.product_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_pricing ON procurement.purchase_order_items;
CREATE TRIGGER trigger_update_product_pricing
    AFTER INSERT OR UPDATE ON procurement.purchase_order_items
    FOR EACH ROW
    WHEN (NEW.item_status IS NULL OR NEW.item_status IN ('pending', 'received', 'completed'))
    EXECUTE FUNCTION update_product_pricing_on_purchase();

-- =============================================
-- 3. VALIDATE PURCHASE ITEMS
-- =============================================
CREATE OR REPLACE FUNCTION validate_purchase_item()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure quantity is positive
    IF NEW.ordered_quantity <= 0 THEN
        RAISE EXCEPTION 'Ordered quantity must be positive';
    END IF;
    
    -- Ensure unit price is not negative
    IF NEW.unit_price < 0 THEN
        RAISE EXCEPTION 'Unit price cannot be negative';
    END IF;
    
    -- Auto-generate batch number if not provided
    IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
        NEW.batch_number := 'PO-' || NEW.purchase_order_id || '-' || NEW.product_id || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    END IF;
    
    -- Set default expiry date if not provided (2 years from now)
    IF NEW.expiry_date IS NULL THEN
        NEW.expiry_date := CURRENT_DATE + INTERVAL '2 years';
    END IF;
    
    -- Calculate line totals if not provided
    IF NEW.line_total IS NULL OR NEW.line_total = 0 THEN
        NEW.line_total := (NEW.ordered_quantity * NEW.unit_price) 
                         - COALESCE(NEW.discount_amount, 0) 
                         + COALESCE(NEW.tax_amount, 0);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_purchase_item ON procurement.purchase_order_items;
CREATE TRIGGER trigger_validate_purchase_item
    BEFORE INSERT OR UPDATE ON procurement.purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION validate_purchase_item();

-- =============================================
-- 4. HANDLE PURCHASE CANCELLATION
-- =============================================
CREATE OR REPLACE FUNCTION handle_purchase_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id INTEGER;
    v_branch_id INTEGER;
BEGIN
    -- Only process if status changed to cancelled
    IF NEW.po_status = 'cancelled' AND OLD.po_status != 'cancelled' THEN
        v_org_id := NEW.org_id;
        v_branch_id := NEW.branch_id;
        
        -- Reverse all inventory updates for this PO
        UPDATE inventory.stock_levels sl
        SET 
            quantity_in_stock = quantity_in_stock - poi.ordered_quantity,
            quantity_available = quantity_available - poi.ordered_quantity,
            updated_at = CURRENT_TIMESTAMP
        FROM procurement.purchase_order_items poi
        WHERE poi.purchase_order_id = NEW.purchase_order_id
        AND sl.product_id = poi.product_id
        AND sl.org_id = v_org_id
        AND sl.branch_id = v_branch_id;
        
        -- Mark all items as cancelled
        UPDATE procurement.purchase_order_items
        SET 
            item_status = 'cancelled',
            updated_at = CURRENT_TIMESTAMP
        WHERE purchase_order_id = NEW.purchase_order_id;
        
        -- Create reversal stock movements
        INSERT INTO inventory.stock_movements (
            org_id, branch_id, product_id, movement_type, movement_date,
            quantity, reference_type, reference_id, notes, created_at
        )
        SELECT 
            v_org_id, v_branch_id, product_id, 'purchase_return', CURRENT_DATE,
            -ordered_quantity, 'purchase_order', purchase_order_id,
            'Purchase order cancelled - PO #' || NEW.po_number,
            CURRENT_TIMESTAMP
        FROM procurement.purchase_order_items
        WHERE purchase_order_id = NEW.purchase_order_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_handle_purchase_cancellation ON procurement.purchase_orders;
CREATE TRIGGER trigger_handle_purchase_cancellation
    AFTER UPDATE ON procurement.purchase_orders
    FOR EACH ROW
    WHEN (NEW.po_status = 'cancelled' AND OLD.po_status != 'cancelled')
    EXECUTE FUNCTION handle_purchase_cancellation();

-- =============================================
-- Add necessary columns to purchase_order_items if missing
-- =============================================
DO $$
BEGIN
    -- Add batch_number if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'procurement' 
                   AND table_name = 'purchase_order_items' 
                   AND column_name = 'batch_number') THEN
        ALTER TABLE procurement.purchase_order_items 
        ADD COLUMN batch_number VARCHAR(100);
    END IF;
    
    -- Add expiry_date if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'procurement' 
                   AND table_name = 'purchase_order_items' 
                   AND column_name = 'expiry_date') THEN
        ALTER TABLE procurement.purchase_order_items 
        ADD COLUMN expiry_date DATE;
    END IF;
    
    -- Add selling_price if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'procurement' 
                   AND table_name = 'purchase_order_items' 
                   AND column_name = 'selling_price') THEN
        ALTER TABLE procurement.purchase_order_items 
        ADD COLUMN selling_price DECIMAL(15,2);
    END IF;
    
    -- Add mrp if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'procurement' 
                   AND table_name = 'purchase_order_items' 
                   AND column_name = 'mrp') THEN
        ALTER TABLE procurement.purchase_order_items 
        ADD COLUMN mrp DECIMAL(15,2);
    END IF;
    
    -- Add free_quantity if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'procurement' 
                   AND table_name = 'purchase_order_items' 
                   AND column_name = 'free_quantity') THEN
        ALTER TABLE procurement.purchase_order_items 
        ADD COLUMN free_quantity INTEGER DEFAULT 0;
    END IF;
END $$;