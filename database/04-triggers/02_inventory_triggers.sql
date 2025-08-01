-- =============================================
-- INVENTORY MANAGEMENT TRIGGERS
-- =============================================
-- Schema: inventory
-- Critical for stock accuracy and pack hierarchy
-- =============================================

-- =============================================
-- 1. MULTI-LOCATION STOCK SYNCHRONIZATION
-- =============================================
CREATE OR REPLACE FUNCTION sync_location_stock_with_batch()
RETURNS TRIGGER AS $$
DECLARE
    v_total_available NUMERIC;
    v_total_reserved NUMERIC;
    v_total_quarantine NUMERIC;
BEGIN
    -- Calculate totals across all locations for this batch
    SELECT 
        COALESCE(SUM(quantity_available), 0),
        COALESCE(SUM(quantity_reserved), 0),
        COALESCE(SUM(quantity_quarantine), 0)
    INTO v_total_available, v_total_reserved, v_total_quarantine
    FROM inventory.location_wise_stock
    WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id)
    AND stock_status != 'damaged';
    
    -- Update batch totals
    UPDATE inventory.batches
    SET 
        quantity_available = v_total_available,
        quantity_reserved = v_total_reserved,
        quantity_quarantine = v_total_quarantine,
        location_count = (
            SELECT COUNT(DISTINCT location_id)
            FROM inventory.location_wise_stock
            WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id)
            AND quantity_available > 0
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_batch_stock
    AFTER INSERT OR UPDATE OR DELETE ON inventory.location_wise_stock
    FOR EACH ROW
    EXECUTE FUNCTION sync_location_stock_with_batch();

-- =============================================
-- 2. PACK HIERARCHY CALCULATION
-- =============================================
CREATE OR REPLACE FUNCTION calculate_pack_quantities()
RETURNS TRIGGER AS $$
DECLARE
    v_pack_config RECORD;
    v_base_quantity NUMERIC;
BEGIN
    -- Get pack configuration
    SELECT * INTO v_pack_config
    FROM inventory.product_pack_configurations
    WHERE product_id = NEW.product_id
    AND is_default = TRUE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No default pack configuration found for product %', NEW.product_id;
    END IF;
    
    -- Calculate base quantity based on pack type
    CASE NEW.pack_type
        WHEN 'base' THEN
            v_base_quantity := NEW.quantity;
            
        WHEN 'pack' THEN
            v_base_quantity := NEW.quantity * v_pack_config.base_units_per_pack;
            
        WHEN 'box' THEN
            v_base_quantity := NEW.quantity * 
                              v_pack_config.base_units_per_pack * 
                              COALESCE(v_pack_config.packs_per_box, 1);
            
        WHEN 'case' THEN
            v_base_quantity := NEW.quantity * 
                              v_pack_config.base_units_per_pack * 
                              COALESCE(v_pack_config.packs_per_box, 1) * 
                              COALESCE(v_pack_config.boxes_per_case, 1);
        ELSE
            RAISE EXCEPTION 'Invalid pack type: %', NEW.pack_type;
    END CASE;
    
    NEW.base_quantity := v_base_quantity;
    
    -- Store pack display data for invoices
    NEW.pack_display_data := jsonb_build_object(
        'display_quantity', NEW.quantity,
        'display_unit', NEW.pack_type,
        'pack_size', CASE NEW.pack_type
            WHEN 'pack' THEN v_pack_config.base_units_per_pack
            WHEN 'box' THEN v_pack_config.base_units_per_pack * v_pack_config.packs_per_box
            WHEN 'case' THEN v_pack_config.base_units_per_pack * 
                            v_pack_config.packs_per_box * v_pack_config.boxes_per_case
            ELSE 1
        END,
        'pack_label', v_pack_config.pack_label_format
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_pack_qty_movements
    BEFORE INSERT OR UPDATE ON inventory.inventory_movements
    FOR EACH ROW
    WHEN (NEW.pack_type IS NOT NULL)
    EXECUTE FUNCTION calculate_pack_quantities();

CREATE TRIGGER trigger_calculate_pack_qty_order_items
    BEFORE INSERT OR UPDATE ON sales.order_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_pack_quantities();

-- =============================================
-- 3. STOCK RESERVATION MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_stock_reservation()
RETURNS TRIGGER AS $$
DECLARE
    v_available_stock NUMERIC;
    v_location RECORD;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Check available stock
        SELECT SUM(quantity_available - COALESCE(quantity_reserved, 0))
        INTO v_available_stock
        FROM inventory.location_wise_stock
        WHERE product_id = NEW.product_id
        AND (NEW.batch_id IS NULL OR batch_id = NEW.batch_id)
        AND stock_status = 'available';
        
        IF v_available_stock < NEW.reserved_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for reservation. Available: %, Requested: %',
                v_available_stock, NEW.reserved_quantity;
        END IF;
        
        -- Reserve stock using FIFO
        FOR v_location IN
            SELECT 
                stock_id,
                location_id,
                batch_id,
                quantity_available - COALESCE(quantity_reserved, 0) as available_qty
            FROM inventory.location_wise_stock
            WHERE product_id = NEW.product_id
            AND (NEW.batch_id IS NULL OR batch_id = NEW.batch_id)
            AND quantity_available > COALESCE(quantity_reserved, 0)
            AND stock_status = 'available'
            ORDER BY stock_in_date, stock_id
        LOOP
            -- Update location stock
            UPDATE inventory.location_wise_stock
            SET 
                quantity_reserved = COALESCE(quantity_reserved, 0) + 
                    LEAST(v_location.available_qty, NEW.reserved_quantity),
                last_updated = CURRENT_TIMESTAMP
            WHERE stock_id = v_location.stock_id;
            
            NEW.reserved_quantity := NEW.reserved_quantity - 
                LEAST(v_location.available_qty, NEW.reserved_quantity);
            
            EXIT WHEN NEW.reserved_quantity <= 0;
        END LOOP;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.reservation_status = 'cancelled' AND OLD.reservation_status != 'cancelled' THEN
            -- Release reserved stock
            UPDATE inventory.location_wise_stock lws
            SET 
                quantity_reserved = GREATEST(0, 
                    COALESCE(quantity_reserved, 0) - 
                    (OLD.reserved_quantity - COALESCE(OLD.fulfilled_quantity, 0))),
                last_updated = CURRENT_TIMESTAMP
            WHERE lws.product_id = OLD.product_id
            AND lws.location_id = OLD.location_id
            AND (OLD.batch_id IS NULL OR lws.batch_id = OLD.batch_id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_stock_reservation
    BEFORE INSERT OR UPDATE ON inventory.stock_reservations
    FOR EACH ROW
    EXECUTE FUNCTION manage_stock_reservation();

-- =============================================
-- 4. BATCH EXPIRY STATUS UPDATE
-- =============================================
CREATE OR REPLACE FUNCTION update_batch_expiry_status()
RETURNS TRIGGER AS $$
DECLARE
    v_days_to_expiry INTEGER;
    v_shelf_life_days INTEGER;
    v_expiry_alert_days INTEGER;
BEGIN
    -- Calculate days to expiry
    v_days_to_expiry := (NEW.expiry_date - CURRENT_DATE)::INTEGER;
    
    -- Get product expiry alert settings
    SELECT 
        COALESCE(
            (SELECT (setting_value)::INTEGER 
             FROM system_config.system_settings 
             WHERE setting_key = 'batch_expiry_alert_days' 
             AND org_id = NEW.org_id),
            90
        ) INTO v_expiry_alert_days;
    
    -- Calculate shelf life
    IF NEW.manufacturing_date IS NOT NULL THEN
        v_shelf_life_days := (NEW.expiry_date - NEW.manufacturing_date)::INTEGER;
    END IF;
    
    -- Update expiry status
    NEW.expiry_status := CASE
        WHEN v_days_to_expiry <= 0 THEN 'expired'
        WHEN v_days_to_expiry <= 30 THEN 'critical'
        WHEN v_days_to_expiry <= 90 THEN 'warning'
        WHEN v_days_to_expiry <= 180 THEN 'caution'
        ELSE 'normal'
    END;
    
    -- Update batch status
    IF v_days_to_expiry <= 0 THEN
        NEW.batch_status := 'expired';
        NEW.qc_status := 'failed';
        
        -- Move to quarantine
        UPDATE inventory.location_wise_stock
        SET 
            quantity_quarantine = quantity_available,
            quantity_available = 0,
            stock_status = 'quarantine',
            last_updated = CURRENT_TIMESTAMP
        WHERE batch_id = NEW.batch_id;
        
        -- Create notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        ) VALUES (
            NEW.org_id,
            'error',
            'inventory',
            'Batch Expired',
            format('Batch %s of %s has expired. Quantity: %s',
                NEW.batch_number,
                (SELECT product_name FROM inventory.products WHERE product_id = NEW.product_id),
                NEW.quantity_available),
            'urgent',
            jsonb_build_object(
                'batch_id', NEW.batch_id,
                'batch_number', NEW.batch_number,
                'product_id', NEW.product_id,
                'expiry_date', NEW.expiry_date,
                'quantity', NEW.quantity_available
            )
        );
    END IF;
    
    -- Create expiry alerts
    IF v_days_to_expiry > 0 AND v_days_to_expiry <= v_expiry_alert_days THEN
        IF NOT EXISTS (
            SELECT 1 FROM system_config.system_notifications
            WHERE notification_data->>'batch_id' = NEW.batch_id::TEXT
            AND notification_category = 'inventory'
            AND title LIKE 'Batch Expiring%'
            AND created_at > CURRENT_DATE - INTERVAL '7 days'
        ) THEN
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                notification_data
            ) VALUES (
                NEW.org_id,
                CASE 
                    WHEN v_days_to_expiry <= 30 THEN 'warning'
                    ELSE 'info'
                END,
                'inventory',
                format('Batch Expiring in %s days', v_days_to_expiry),
                format('Batch %s of %s will expire on %s. Available quantity: %s',
                    NEW.batch_number,
                    (SELECT product_name FROM inventory.products WHERE product_id = NEW.product_id),
                    TO_CHAR(NEW.expiry_date, 'DD/MM/YYYY'),
                    NEW.quantity_available),
                CASE 
                    WHEN v_days_to_expiry <= 30 THEN 'high'
                    ELSE 'medium'
                END,
                jsonb_build_object(
                    'batch_id', NEW.batch_id,
                    'batch_number', NEW.batch_number,
                    'product_id', NEW.product_id,
                    'expiry_date', NEW.expiry_date,
                    'days_to_expiry', v_days_to_expiry,
                    'quantity', NEW.quantity_available
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_batch_expiry_status
    BEFORE INSERT OR UPDATE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_expiry_status();

-- =============================================
-- 5. INVENTORY MOVEMENT TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_inventory_movement()
RETURNS TRIGGER AS $$
DECLARE
    v_current_stock RECORD;
    v_cost_details JSONB;
BEGIN
    -- Validate movement
    IF NEW.movement_direction = 'out' THEN
        -- Check stock availability
        SELECT 
            SUM(quantity_available - COALESCE(quantity_reserved, 0)) as available,
            AVG(unit_cost) as avg_cost
        INTO v_current_stock
        FROM inventory.location_wise_stock
        WHERE product_id = NEW.product_id
        AND location_id = NEW.location_id
        AND (NEW.batch_id IS NULL OR batch_id = NEW.batch_id);
        
        IF v_current_stock.available < NEW.base_quantity THEN
            RAISE EXCEPTION 'Insufficient stock. Available: %, Required: %',
                v_current_stock.available, NEW.base_quantity;
        END IF;
        
        -- Calculate cost
        NEW.unit_cost := COALESCE(NEW.unit_cost, v_current_stock.avg_cost);
        NEW.total_cost := NEW.base_quantity * NEW.unit_cost;
    END IF;
    
    -- Create cost tracking details
    v_cost_details := jsonb_build_object(
        'movement_type', NEW.movement_type,
        'unit_cost', NEW.unit_cost,
        'total_cost', NEW.total_cost,
        'cost_calculation_method', CASE 
            WHEN NEW.movement_type = 'purchase' THEN 'actual'
            ELSE 'weighted_average'
        END
    );
    
    NEW.cost_details := v_cost_details;
    
    -- Update location stock
    IF NEW.movement_direction = 'in' THEN
        INSERT INTO inventory.location_wise_stock (
            product_id,
            batch_id,
            location_id,
            org_id,
            quantity_available,
            unit_cost,
            stock_in_date
        ) VALUES (
            NEW.product_id,
            NEW.batch_id,
            NEW.location_id,
            NEW.org_id,
            NEW.base_quantity,
            NEW.unit_cost,
            CURRENT_DATE
        )
        ON CONFLICT (product_id, batch_id, location_id) DO UPDATE
        SET 
            quantity_available = inventory.location_wise_stock.quantity_available + NEW.base_quantity,
            unit_cost = (
                (inventory.location_wise_stock.quantity_available * inventory.location_wise_stock.unit_cost) +
                (NEW.base_quantity * NEW.unit_cost)
            ) / (inventory.location_wise_stock.quantity_available + NEW.base_quantity),
            last_updated = CURRENT_TIMESTAMP;
            
    ELSIF NEW.movement_direction = 'out' THEN
        -- Deduct stock using FIFO
        WITH stock_deduction AS (
            UPDATE inventory.location_wise_stock lws
            SET 
                quantity_available = GREATEST(0, 
                    quantity_available - NEW.base_quantity),
                last_movement_date = CURRENT_TIMESTAMP,
                last_updated = CURRENT_TIMESTAMP
            WHERE lws.product_id = NEW.product_id
            AND lws.location_id = NEW.location_id
            AND (NEW.batch_id IS NULL OR lws.batch_id = NEW.batch_id)
            AND lws.quantity_available > 0
            RETURNING lws.*
        )
        SELECT COUNT(*) INTO v_current_stock
        FROM stock_deduction;
        
        IF v_current_stock IS NULL OR v_current_stock = 0 THEN
            RAISE EXCEPTION 'No stock found for deduction';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventory_movement
    BEFORE INSERT ON inventory.inventory_movements
    FOR EACH ROW
    EXECUTE FUNCTION track_inventory_movement();

-- =============================================
-- 6. REORDER LEVEL MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION check_reorder_levels()
RETURNS TRIGGER AS $$
DECLARE
    v_product RECORD;
    v_total_stock NUMERIC;
    v_consumption_rate NUMERIC;
    v_lead_time_days INTEGER;
BEGIN
    -- Get product reorder settings
    SELECT 
        p.product_id,
        p.product_name,
        p.reorder_level,
        p.min_stock_quantity,
        p.reorder_quantity,
        p.critical_stock_level
    INTO v_product
    FROM inventory.products p
    WHERE p.product_id = COALESCE(NEW.product_id, OLD.product_id);
    
    -- Skip if no reorder level set
    IF v_product.reorder_level IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Calculate total stock across all locations
    SELECT SUM(quantity_available - COALESCE(quantity_reserved, 0))
    INTO v_total_stock
    FROM inventory.location_wise_stock
    WHERE product_id = v_product.product_id;
    
    -- Check if below reorder level
    IF v_total_stock <= v_product.reorder_level THEN
        -- Calculate consumption rate (last 30 days)
        SELECT 
            COALESCE(SUM(base_quantity) / 30.0, 0)
        INTO v_consumption_rate
        FROM inventory.inventory_movements
        WHERE product_id = v_product.product_id
        AND movement_direction = 'out'
        AND movement_date >= CURRENT_DATE - INTERVAL '30 days';
        
        -- Get average lead time
        SELECT 
            COALESCE(AVG(EXTRACT(EPOCH FROM (g.grn_date - po.po_date)) / 86400)::INTEGER, 7)
        INTO v_lead_time_days
        FROM procurement.grn_items gi
        JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
        JOIN procurement.purchase_orders po ON g.purchase_order_id = po.purchase_order_id
        WHERE gi.product_id = v_product.product_id
        AND g.grn_date >= CURRENT_DATE - INTERVAL '6 months';
        
        -- Create or update reorder suggestion
        INSERT INTO inventory.reorder_suggestions (
            org_id,
            product_id,
            current_stock,
            available_stock,
            reorder_level,
            min_stock_level,
            suggested_quantity,
            average_daily_consumption,
            lead_time_days,
            urgency,
            suggested_order_date
        ) VALUES (
            NEW.org_id,
            v_product.product_id,
            v_total_stock,
            v_total_stock,
            v_product.reorder_level,
            v_product.min_stock_quantity,
            GREATEST(v_product.reorder_quantity, 
                    v_consumption_rate * v_lead_time_days * 1.5), -- 50% safety stock
            v_consumption_rate,
            v_lead_time_days,
            CASE
                WHEN v_total_stock <= v_product.critical_stock_level THEN 'critical'
                WHEN v_total_stock <= v_product.min_stock_quantity THEN 'high'
                ELSE 'normal'
            END,
            CASE
                WHEN v_total_stock <= v_product.critical_stock_level THEN CURRENT_DATE
                ELSE CURRENT_DATE + INTERVAL '3 days'
            END
        )
        ON CONFLICT (product_id) WHERE suggestion_status = 'pending'
        DO UPDATE SET
            current_stock = v_total_stock,
            available_stock = v_total_stock,
            average_daily_consumption = v_consumption_rate,
            urgency = CASE
                WHEN v_total_stock <= v_product.critical_stock_level THEN 'critical'
                WHEN v_total_stock <= v_product.min_stock_quantity THEN 'high'
                ELSE 'normal'
            END,
            updated_at = CURRENT_TIMESTAMP;
        
        -- Create notification for critical stock
        IF v_total_stock <= v_product.critical_stock_level THEN
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                notification_data
            ) VALUES (
                NEW.org_id,
                'error',
                'inventory',
                'Critical Stock Level',
                format('URGENT: %s has reached critical stock level. Current: %s, Critical: %s',
                    v_product.product_name,
                    v_total_stock,
                    v_product.critical_stock_level),
                'urgent',
                jsonb_build_object(
                    'product_id', v_product.product_id,
                    'product_name', v_product.product_name,
                    'current_stock', v_total_stock,
                    'critical_level', v_product.critical_stock_level,
                    'consumption_rate', v_consumption_rate
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_reorder_levels
    AFTER INSERT OR UPDATE OR DELETE ON inventory.location_wise_stock
    FOR EACH ROW
    EXECUTE FUNCTION check_reorder_levels();

-- =============================================
-- 7. STOCK TRANSFER VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION validate_stock_transfer()
RETURNS TRIGGER AS $$
DECLARE
    v_item RECORD;
    v_available_stock NUMERIC;
BEGIN
    -- Validate on dispatch
    IF NEW.transfer_status = 'dispatched' AND OLD.transfer_status != 'dispatched' THEN
        -- Check stock for each item
        FOR v_item IN
            SELECT 
                sti.product_id,
                sti.batch_id,
                sti.dispatched_quantity,
                p.product_name
            FROM inventory.stock_transfer_items sti
            JOIN inventory.products p ON sti.product_id = p.product_id
            WHERE sti.transfer_id = NEW.transfer_id
        LOOP
            -- Get available stock at source
            SELECT SUM(quantity_available - COALESCE(quantity_reserved, 0))
            INTO v_available_stock
            FROM inventory.location_wise_stock
            WHERE product_id = v_item.product_id
            AND location_id = NEW.from_location_id
            AND (v_item.batch_id IS NULL OR batch_id = v_item.batch_id);
            
            IF v_available_stock < v_item.dispatched_quantity THEN
                RAISE EXCEPTION 'Insufficient stock for % at source location. Available: %, Required: %',
                    v_item.product_name, v_available_stock, v_item.dispatched_quantity;
            END IF;
        END LOOP;
        
        -- Create inventory movements
        INSERT INTO inventory.inventory_movements (
            org_id,
            movement_type,
            movement_date,
            movement_direction,
            product_id,
            batch_id,
            quantity,
            base_quantity,
            location_id,
            from_location_id,
            to_location_id,
            reference_type,
            reference_id,
            reference_number,
            transfer_type,
            created_by
        )
        SELECT 
            NEW.org_id,
            'transfer',
            NEW.dispatch_date,
            'out',
            sti.product_id,
            sti.batch_id,
            sti.dispatched_quantity,
            sti.dispatched_quantity, -- Assuming base units
            NEW.from_location_id,
            NEW.from_location_id,
            NEW.to_location_id,
            'transfer',
            NEW.transfer_id,
            NEW.transfer_number,
            'out',
            NEW.created_by
        FROM inventory.stock_transfer_items sti
        WHERE sti.transfer_id = NEW.transfer_id;
        
        NEW.actual_dispatch_date := CURRENT_DATE;
    END IF;
    
    -- Handle receipt
    IF NEW.transfer_status = 'received' AND OLD.transfer_status != 'received' THEN
        -- Create inventory movements for receipt
        INSERT INTO inventory.inventory_movements (
            org_id,
            movement_type,
            movement_date,
            movement_direction,
            product_id,
            batch_id,
            quantity,
            base_quantity,
            location_id,
            from_location_id,
            to_location_id,
            reference_type,
            reference_id,
            reference_number,
            transfer_type,
            transfer_pair_id,
            created_by
        )
        SELECT 
            NEW.org_id,
            'transfer',
            NEW.received_at::DATE,
            'in',
            sti.product_id,
            sti.batch_id,
            sti.received_quantity,
            sti.received_quantity,
            NEW.to_location_id,
            NEW.from_location_id,
            NEW.to_location_id,
            'transfer',
            NEW.transfer_id,
            NEW.transfer_number,
            'in',
            im.movement_id, -- Link to out movement
            NEW.received_by
        FROM inventory.stock_transfer_items sti
        LEFT JOIN inventory.inventory_movements im ON 
            im.reference_id = NEW.transfer_id 
            AND im.reference_type = 'transfer'
            AND im.product_id = sti.product_id
            AND im.movement_direction = 'out'
        WHERE sti.transfer_id = NEW.transfer_id;
        
        NEW.actual_delivery_date := CURRENT_DATE;
        NEW.delivery_status := 'delivered';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_stock_transfer
    BEFORE UPDATE OF transfer_status ON inventory.stock_transfers
    FOR EACH ROW
    EXECUTE FUNCTION validate_stock_transfer();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX idx_location_stock_batch ON inventory.location_wise_stock(batch_id);
CREATE INDEX idx_location_stock_product ON inventory.location_wise_stock(product_id, location_id);
CREATE INDEX idx_stock_reservations_product ON inventory.stock_reservations(product_id, reservation_status);
CREATE INDEX idx_batch_expiry ON inventory.batches(expiry_date) WHERE batch_status = 'active';
CREATE INDEX idx_movements_product_date ON inventory.inventory_movements(product_id, movement_date);
-- Index for reorder_suggestions moved to table creation script

-- Add comments
COMMENT ON FUNCTION sync_location_stock_with_batch() IS 'Synchronizes location-wise stock with batch totals';
COMMENT ON FUNCTION calculate_pack_quantities() IS 'Calculates base quantities from pack hierarchy';
COMMENT ON FUNCTION update_batch_expiry_status() IS 'Monitors batch expiry and creates alerts';
COMMENT ON FUNCTION check_reorder_levels() IS 'Monitors stock levels and creates reorder suggestions';