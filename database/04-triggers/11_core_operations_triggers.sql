-- =============================================
-- CORE OPERATIONS TRIGGERS
-- =============================================
-- Essential business operations that must work correctly
-- =============================================

-- =============================================
-- 1. INVENTORY UPDATE ON SALES
-- =============================================
CREATE OR REPLACE FUNCTION update_inventory_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_batch_allocation JSONB;
    v_batch RECORD;
    v_total_allocated NUMERIC := 0;
BEGIN
    -- For invoice items being created/delivered
    IF TG_TABLE_NAME = 'invoice_items' AND TG_OP = 'INSERT' THEN
        -- Reduce inventory for each allocated batch
        IF NEW.batch_allocation IS NOT NULL THEN
            FOR v_batch IN SELECT * FROM jsonb_array_elements(NEW.batch_allocation)
            LOOP
                -- Update batch quantity
                UPDATE inventory.batches
                SET 
                    quantity_available = quantity_available - (v_batch->>'quantity')::NUMERIC,
                    quantity_sold = COALESCE(quantity_sold, 0) + (v_batch->>'quantity')::NUMERIC,
                    last_movement_date = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = (v_batch->>'batch_id')::INTEGER
                AND quantity_available >= (v_batch->>'quantity')::NUMERIC;
                
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Insufficient stock in batch % for product %',
                        v_batch->>'batch_number', NEW.product_name;
                END IF;
                
                -- Update location-wise stock
                UPDATE inventory.location_wise_stock
                SET 
                    quantity_available = quantity_available - (v_batch->>'quantity')::NUMERIC,
                    last_movement_date = CURRENT_TIMESTAMP,
                    last_updated = CURRENT_TIMESTAMP
                WHERE batch_id = (v_batch->>'batch_id')::INTEGER
                AND quantity_available >= (v_batch->>'quantity')::NUMERIC;
                
                -- Create inventory movement
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
                    reference_type,
                    reference_id,
                    reference_number,
                    unit_cost,
                    total_cost,
                    created_by
                )
                SELECT 
                    i.org_id,
                    'sale',
                    CURRENT_DATE,
                    'out',
                    NEW.product_id,
                    (v_batch->>'batch_id')::INTEGER,
                    (v_batch->>'quantity')::NUMERIC,
                    (v_batch->>'quantity')::NUMERIC * COALESCE(NEW.pack_size, 1),
                    lws.location_id,
                    'invoice',
                    NEW.invoice_id,
                    i.invoice_number,
                    b.cost_per_unit,
                    (v_batch->>'quantity')::NUMERIC * b.cost_per_unit,
                    i.created_by
                FROM sales.invoices i
                JOIN inventory.batches b ON b.batch_id = (v_batch->>'batch_id')::INTEGER
                JOIN inventory.location_wise_stock lws ON lws.batch_id = b.batch_id
                WHERE i.invoice_id = NEW.invoice_id
                LIMIT 1;
                
                v_total_allocated := v_total_allocated + (v_batch->>'quantity')::NUMERIC;
            END LOOP;
            
            -- Verify total allocation matches quantity
            IF v_total_allocated != NEW.quantity THEN
                RAISE EXCEPTION 'Batch allocation mismatch. Expected: %, Allocated: %',
                    NEW.quantity, v_total_allocated;
            END IF;
        END IF;
        
    -- Handle invoice cancellation
    ELSIF TG_TABLE_NAME = 'invoices' AND NEW.invoice_status = 'cancelled' AND OLD.invoice_status != 'cancelled' THEN
        -- Reverse all inventory movements
        FOR v_batch IN
            SELECT 
                ii.product_id,
                ii.quantity,
                ii.batch_allocation
            FROM sales.invoice_items ii
            WHERE ii.invoice_id = NEW.invoice_id
        LOOP
            -- Reverse each batch allocation
            IF v_batch.batch_allocation IS NOT NULL THEN
                FOR v_batch_allocation IN SELECT * FROM jsonb_array_elements(v_batch.batch_allocation)
                LOOP
                    -- Return stock to batch
                    UPDATE inventory.batches
                    SET 
                        quantity_available = quantity_available + (v_batch_allocation->>'quantity')::NUMERIC,
                        quantity_sold = GREATEST(0, COALESCE(quantity_sold, 0) - (v_batch_allocation->>'quantity')::NUMERIC),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = (v_batch_allocation->>'batch_id')::INTEGER;
                    
                    -- Return stock to location
                    UPDATE inventory.location_wise_stock
                    SET 
                        quantity_available = quantity_available + (v_batch_allocation->>'quantity')::NUMERIC,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE batch_id = (v_batch_allocation->>'batch_id')::INTEGER;
                END LOOP;
            END IF;
        END LOOP;
        
        -- Create reversal movement
        INSERT INTO inventory.inventory_movements (
            org_id,
            movement_type,
            movement_date,
            movement_direction,
            product_id,
            batch_id,
            quantity,
            reference_type,
            reference_id,
            reference_number,
            reason,
            created_by
        )
        SELECT 
            NEW.org_id,
            'reversal',
            CURRENT_DATE,
            'in',
            ii.product_id,
            (batch_elem->>'batch_id')::INTEGER,
            (batch_elem->>'quantity')::NUMERIC,
            'invoice_cancellation',
            NEW.invoice_id,
            NEW.invoice_number,
            'Invoice cancelled',
            NEW.updated_by
        FROM sales.invoice_items ii,
        LATERAL jsonb_array_elements(ii.batch_allocation) AS batch_elem
        WHERE ii.invoice_id = NEW.invoice_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventory_update_on_sale
    AFTER INSERT ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_sale();

CREATE TRIGGER trigger_inventory_update_on_cancellation
    AFTER UPDATE OF invoice_status ON sales.invoices
    FOR EACH ROW
    WHEN (NEW.invoice_status = 'cancelled')
    EXECUTE FUNCTION update_inventory_on_sale();

-- =============================================
-- 2. INVENTORY UPDATE ON PURCHASE
-- =============================================
CREATE OR REPLACE FUNCTION update_inventory_on_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_location_id INTEGER;
BEGIN
    -- GRN approval adds stock
    IF NEW.grn_status = 'approved' AND OLD.grn_status != 'approved' THEN
        -- Get default receiving location
        SELECT location_id
        INTO v_location_id
        FROM inventory.storage_locations
        WHERE branch_id = NEW.branch_id
        AND location_type = 'warehouse'
        AND is_receiving_location = TRUE
        AND is_active = TRUE
        LIMIT 1;
        
        IF v_location_id IS NULL THEN
            RAISE EXCEPTION 'No receiving location configured for branch';
        END IF;
        
        -- Process each GRN item
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
            unit_cost,
            total_cost,
            reference_type,
            reference_id,
            reference_number,
            party_id,
            created_by
        )
        SELECT 
            NEW.org_id,
            'purchase',
            NEW.grn_date,
            'in',
            gi.product_id,
            b.batch_id,
            gi.accepted_quantity,
            gi.accepted_quantity * COALESCE(gi.pack_size, 1),
            COALESCE(gi.storage_location_id, v_location_id),
            gi.unit_price,
            gi.accepted_quantity * gi.unit_price,
            'grn',
            NEW.grn_id,
            NEW.grn_number,
            NEW.supplier_id,
            NEW.received_by
        FROM procurement.grn_items gi
        JOIN inventory.batches b ON b.product_id = gi.product_id 
            AND b.batch_number = gi.batch_number
        WHERE gi.grn_id = NEW.grn_id
        AND gi.qc_status IN ('passed', 'conditional');
        
        -- Update product last purchase info
        UPDATE inventory.products p
        SET 
            last_purchase_date = NEW.grn_date,
            last_purchase_price = gi.unit_price,
            last_supplier_id = NEW.supplier_id,
            updated_at = CURRENT_TIMESTAMP
        FROM procurement.grn_items gi
        WHERE gi.grn_id = NEW.grn_id
        AND p.product_id = gi.product_id;
        
    -- GRN rejection
    ELSIF NEW.grn_status = 'rejected' AND OLD.grn_status = 'approved' THEN
        -- Reverse inventory if already added
        UPDATE inventory.batches b
        SET 
            quantity_available = GREATEST(0, quantity_available - gi.accepted_quantity),
            updated_at = CURRENT_TIMESTAMP
        FROM procurement.grn_items gi
        WHERE gi.grn_id = NEW.grn_id
        AND b.product_id = gi.product_id
        AND b.batch_number = gi.batch_number;
        
        -- Create reversal movement
        INSERT INTO inventory.inventory_movements (
            org_id,
            movement_type,
            movement_date,
            movement_direction,
            product_id,
            batch_id,
            quantity,
            reference_type,
            reference_id,
            reference_number,
            reason,
            created_by
        )
        SELECT 
            NEW.org_id,
            'reversal',
            CURRENT_DATE,
            'out',
            gi.product_id,
            b.batch_id,
            gi.accepted_quantity,
            'grn_rejection',
            NEW.grn_id,
            NEW.grn_number,
            'GRN rejected: ' || NEW.rejection_reason,
            NEW.updated_by
        FROM procurement.grn_items gi
        JOIN inventory.batches b ON b.product_id = gi.product_id 
            AND b.batch_number = gi.batch_number
        WHERE gi.grn_id = NEW.grn_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventory_update_on_purchase
    AFTER UPDATE OF grn_status ON procurement.goods_receipt_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_purchase();

-- =============================================
-- 3. CREDIT LIMIT UPDATE ON TRANSACTIONS
-- =============================================
CREATE OR REPLACE FUNCTION update_credit_on_transactions()
RETURNS TRIGGER AS $$
DECLARE
    v_credit_info RECORD;
    v_current_outstanding NUMERIC;
    v_available_credit NUMERIC;
BEGIN
    -- Get customer credit info from parties table
    SELECT 
        credit_limit,
        current_outstanding as credit_utilized
    INTO v_credit_info
    FROM parties.customers
    WHERE customer_id = NEW.customer_id;
    
    IF v_credit_info.credit_limit IS NOT NULL AND v_credit_info.credit_limit > 0 THEN
        
        -- On invoice posting - increase outstanding
        IF TG_TABLE_NAME = 'invoices' AND NEW.invoice_status = 'posted' AND OLD.invoice_status != 'posted' THEN
            -- Update current outstanding
            UPDATE parties.customers
            SET 
                current_outstanding = current_outstanding + NEW.final_amount,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = NEW.customer_id;
            
            -- Check if credit limit exceeded
            v_available_credit := v_credit_info.credit_limit - (COALESCE(v_credit_info.credit_utilized, 0) + NEW.final_amount);
            
            IF v_available_credit < 0 THEN
                -- Send credit limit exceeded notification
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
                    'credit',
                    'Credit Limit Exceeded',
                    format('Customer has exceeded credit limit by ₹%s',
                        TO_CHAR(ABS(v_available_credit), 'FM99,99,999')),
                    'urgent',
                    jsonb_build_object(
                        'customer_id', NEW.customer_id,
                        'credit_limit', v_credit_info.credit_limit,
                        'credit_utilized', COALESCE(v_credit_info.credit_utilized, 0) + NEW.final_amount,
                        'exceeded_by', ABS(v_available_credit)
                    )
                );
            END IF;
            
        -- On payment receipt - handled by auto_allocate_payment trigger
        ELSIF TG_TABLE_NAME = 'payments' AND NEW.payment_status = 'cleared' AND OLD.payment_status != 'cleared' THEN
            -- Payment allocation is handled by the auto_allocate_payment trigger
            NULL;
            
        -- On credit note - reduce outstanding
        ELSIF TG_TABLE_NAME = 'sales_returns' AND NEW.credit_note_status = 'issued' AND OLD.credit_note_status != 'issued' THEN
            -- Update current outstanding
            UPDATE parties.customers
            SET 
                current_outstanding = GREATEST(0, current_outstanding - NEW.total_amount),
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = NEW.customer_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_credit_update_on_invoice
    AFTER UPDATE OF invoice_status ON sales.invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_on_transactions();

CREATE TRIGGER trigger_credit_update_on_payment
    AFTER UPDATE OF payment_status ON financial.payments
    FOR EACH ROW
    WHEN (NEW.party_type = 'customer')
    EXECUTE FUNCTION update_credit_on_transactions();

CREATE TRIGGER trigger_credit_update_on_return
    AFTER UPDATE OF credit_note_status ON sales.sales_returns
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_on_transactions();

-- =============================================
-- 4. STOCK RETURN ON SALES RETURN
-- =============================================
CREATE OR REPLACE FUNCTION process_stock_return()
RETURNS TRIGGER AS $$
DECLARE
    v_return_item RECORD;
    v_location_id INTEGER;
BEGIN
    -- Process approved returns
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Get return location
        SELECT location_id
        INTO v_location_id
        FROM inventory.storage_locations
        WHERE branch_id = NEW.branch_id
        AND location_type = 'warehouse'
        AND is_returns_location = TRUE
        AND is_active = TRUE
        LIMIT 1;
        
        IF v_location_id IS NULL THEN
            -- Use default warehouse
            SELECT location_id
            INTO v_location_id
            FROM inventory.storage_locations
            WHERE branch_id = NEW.branch_id
            AND location_type = 'warehouse'
            AND is_active = TRUE
            LIMIT 1;
        END IF;
        
        -- Process each return item
        FOR v_return_item IN
            SELECT * FROM sales.sales_return_items
            WHERE return_id = NEW.return_id
        LOOP
            -- Add saleable quantity back to stock
            IF v_return_item.saleable_quantity > 0 THEN
                -- Update batch
                UPDATE inventory.batches
                SET 
                    quantity_available = quantity_available + v_return_item.saleable_quantity,
                    quantity_returned = COALESCE(quantity_returned, 0) + v_return_item.saleable_quantity,
                    updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = v_return_item.batch_id;
                
                -- Update location stock
                INSERT INTO inventory.location_wise_stock (
                    product_id,
                    batch_id,
                    location_id,
                    org_id,
                    quantity_available,
                    stock_in_date,
                    stock_status,
                    unit_cost
                )
                SELECT 
                    v_return_item.product_id,
                    v_return_item.batch_id,
                    v_location_id,
                    NEW.org_id,
                    v_return_item.saleable_quantity,
                    CURRENT_DATE,
                    'available',
                    b.cost_per_unit
                FROM inventory.batches b
                WHERE b.batch_id = v_return_item.batch_id
                ON CONFLICT (product_id, batch_id, location_id)
                DO UPDATE SET
                    quantity_available = inventory.location_wise_stock.quantity_available + v_return_item.saleable_quantity,
                    last_updated = CURRENT_TIMESTAMP;
                
                -- Create inventory movement
                INSERT INTO inventory.inventory_movements (
                    org_id,
                    movement_type,
                    movement_date,
                    movement_direction,
                    product_id,
                    batch_id,
                    quantity,
                    location_id,
                    reference_type,
                    reference_id,
                    reference_number,
                    reason,
                    created_by
                ) VALUES (
                    NEW.org_id,
                    'sales_return',
                    NEW.return_date,
                    'in',
                    v_return_item.product_id,
                    v_return_item.batch_id,
                    v_return_item.saleable_quantity,
                    v_location_id,
                    'return',
                    NEW.return_id,
                    NEW.return_number,
                    'Saleable stock returned - ' || NEW.return_reason,
                    NEW.approved_by
                );
            END IF;
            
            -- Handle damaged quantity
            IF v_return_item.damaged_quantity > 0 THEN
                -- Add to quarantine location
                INSERT INTO inventory.location_wise_stock (
                    product_id,
                    batch_id,
                    location_id,
                    org_id,
                    quantity_quarantine,
                    stock_in_date,
                    stock_status,
                    quarantine_reason
                )
                SELECT 
                    v_return_item.product_id,
                    v_return_item.batch_id,
                    sl.location_id,
                    NEW.org_id,
                    v_return_item.damaged_quantity,
                    CURRENT_DATE,
                    'quarantine',
                    'Damaged return - ' || v_return_item.damage_reason
                FROM inventory.storage_locations sl
                WHERE sl.branch_id = NEW.branch_id
                AND sl.storage_class = 'quarantine'
                AND sl.is_active = TRUE
                LIMIT 1
                ON CONFLICT (product_id, batch_id, location_id)
                DO UPDATE SET
                    quantity_quarantine = inventory.location_wise_stock.quantity_quarantine + v_return_item.damaged_quantity,
                    last_updated = CURRENT_TIMESTAMP;
                
                -- Update batch damaged quantity
                UPDATE inventory.batches
                SET 
                    quantity_damaged = COALESCE(quantity_damaged, 0) + v_return_item.damaged_quantity,
                    updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = v_return_item.batch_id;
            END IF;
            
            -- Handle expired quantity
            IF v_return_item.expired_quantity > 0 THEN
                -- Mark as expired
                UPDATE inventory.batches
                SET 
                    quantity_expired = COALESCE(quantity_expired, 0) + v_return_item.expired_quantity,
                    batch_status = CASE 
                        WHEN expiry_date < CURRENT_DATE THEN 'expired'
                        ELSE batch_status
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = v_return_item.batch_id;
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_process_stock_return
    AFTER UPDATE OF approval_status ON sales.sales_returns
    FOR EACH ROW
    EXECUTE FUNCTION process_stock_return();

-- =============================================
-- 5. STOCK RESERVATION RELEASE
-- =============================================
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS TRIGGER AS $$
BEGIN
    -- Release expired reservations
    IF NEW.expires_at < CURRENT_TIMESTAMP AND 
       NEW.reservation_status = 'active' THEN
        
        -- Update reservation status
        NEW.reservation_status := 'expired';
        NEW.released_at := CURRENT_TIMESTAMP;
        NEW.release_reason := 'Reservation expired';
        
        -- Release the reserved stock
        UPDATE inventory.location_wise_stock
        SET 
            quantity_reserved = GREATEST(0, 
                COALESCE(quantity_reserved, 0) - (NEW.reserved_quantity - COALESCE(NEW.fulfilled_quantity, 0))),
            last_updated = CURRENT_TIMESTAMP
        WHERE product_id = NEW.product_id
        AND location_id = NEW.location_id
        AND (NEW.batch_id IS NULL OR batch_id = NEW.batch_id);
        
        -- Log the release
        INSERT INTO inventory.inventory_movements (
            org_id,
            movement_type,
            movement_date,
            movement_direction,
            product_id,
            batch_id,
            quantity,
            location_id,
            reference_type,
            reference_id,
            reference_number,
            reason,
            created_by
        ) VALUES (
            NEW.org_id,
            'reservation_release',
            CURRENT_DATE,
            'none', -- No physical movement
            NEW.product_id,
            NEW.batch_id,
            NEW.reserved_quantity - COALESCE(NEW.fulfilled_quantity, 0),
            NEW.location_id,
            'reservation_expiry',
            NEW.reservation_id,
            NEW.reservation_id::TEXT,
            'Reservation expired',
            0 -- System
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_release_expired_reservations
    BEFORE UPDATE ON inventory.stock_reservations
    FOR EACH ROW
    EXECUTE FUNCTION release_expired_reservations();

-- =============================================
-- 6. ORDER TO INVOICE STATUS SYNC
-- =============================================
CREATE OR REPLACE FUNCTION sync_order_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
    v_order_items_count INTEGER;
    v_invoiced_items_count INTEGER;
    v_delivered_quantity NUMERIC;
    v_invoiced_quantity NUMERIC;
BEGIN
    -- Update order status based on invoice
    IF TG_TABLE_NAME = 'invoices' THEN
        -- Get order fulfillment status
        SELECT 
            COUNT(DISTINCT oi.order_item_id) as total_items,
            COUNT(DISTINCT ii.order_item_id) as invoiced_items,
            SUM(oi.quantity) as order_quantity,
            SUM(ii.quantity) as invoiced_quantity
        INTO v_order_items_count, v_invoiced_items_count, v_delivered_quantity, v_invoiced_quantity
        FROM sales.order_items oi
        LEFT JOIN sales.invoice_items ii ON oi.order_item_id = ii.order_item_id
        WHERE oi.order_id = NEW.order_id;
        
        -- Update order fulfillment status
        UPDATE sales.orders
        SET 
            fulfillment_status = CASE
                WHEN v_invoiced_quantity >= v_delivered_quantity THEN 'fulfilled'
                WHEN v_invoiced_quantity > 0 THEN 'partial'
                ELSE 'pending'
            END,
            invoice_id = NEW.invoice_id,
            invoiced_amount = NEW.final_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE order_id = NEW.order_id;
        
        -- Update order items delivery status
        UPDATE sales.order_items oi
        SET 
            delivered_quantity = ii.quantity,
            delivery_status = CASE
                WHEN ii.quantity >= oi.quantity THEN 'delivered'
                WHEN ii.quantity > 0 THEN 'partial'
                ELSE 'pending'
            END,
            updated_at = CURRENT_TIMESTAMP
        FROM sales.invoice_items ii
        WHERE oi.order_item_id = ii.order_item_id
        AND ii.invoice_id = NEW.invoice_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_order_invoice_status
    AFTER INSERT OR UPDATE ON sales.invoices
    FOR EACH ROW
    WHEN (NEW.order_id IS NOT NULL)
    EXECUTE FUNCTION sync_order_invoice_status();

-- =============================================
-- 7. AUTO PAYMENT ALLOCATION
-- =============================================
CREATE OR REPLACE FUNCTION auto_allocate_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_outstanding NUMERIC;
    v_allocation_amount NUMERIC;
BEGIN
    -- Only for cleared customer receipts
    IF NEW.payment_status = 'cleared' AND 
       NEW.payment_type = 'receipt' AND
       NEW.party_type = 'customer' THEN
        
        -- Get current outstanding
        SELECT current_outstanding
        INTO v_customer_outstanding
        FROM parties.customers
        WHERE customer_id = NEW.party_id;
        
        -- Calculate how much to allocate
        v_allocation_amount := LEAST(NEW.payment_amount, COALESCE(v_customer_outstanding, 0));
        
        -- Reduce current outstanding
        UPDATE parties.customers
        SET 
            current_outstanding = GREATEST(0, current_outstanding - v_allocation_amount),
            updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = NEW.party_id;
        
        -- Update payment allocation status
        UPDATE financial.payments
        SET 
            allocated_amount = v_allocation_amount,
            unallocated_amount = NEW.payment_amount - v_allocation_amount,
            allocation_status = CASE
                WHEN v_allocation_amount = NEW.payment_amount THEN 'full'
                WHEN v_allocation_amount > 0 THEN 'partial'
                ELSE 'unallocated'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE payment_id = NEW.payment_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_allocate_payment
    AFTER UPDATE OF payment_status ON financial.payments
    FOR EACH ROW
    WHEN (NEW.payment_status = 'cleared')
    EXECUTE FUNCTION auto_allocate_payment();

-- =============================================
-- 8. BATCH EXPIRY STATUS UPDATE
-- =============================================
CREATE OR REPLACE FUNCTION update_batch_on_expiry()
RETURNS TRIGGER AS $$
DECLARE
    v_expired_batches CURSOR FOR
        SELECT 
            b.batch_id,
            b.product_id,
            b.batch_number,
            b.quantity_available,
            p.product_name
        FROM inventory.batches b
        JOIN inventory.products p ON b.product_id = p.product_id
        WHERE b.expiry_date <= CURRENT_DATE
        AND b.batch_status = 'active'
        AND b.quantity_available > 0;
    v_batch RECORD;
BEGIN
    -- Process expired batches
    FOR v_batch IN v_expired_batches LOOP
        -- Update batch status
        UPDATE inventory.batches
        SET 
            batch_status = 'expired',
            expiry_status = 'expired',
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = v_batch.batch_id;
        
        -- Move stock to quarantine
        UPDATE inventory.location_wise_stock
        SET 
            quantity_quarantine = quantity_available,
            quantity_available = 0,
            stock_status = 'quarantine',
            quarantine_reason = 'Batch expired',
            last_updated = CURRENT_TIMESTAMP
        WHERE batch_id = v_batch.batch_id
        AND quantity_available > 0;
        
        -- Create movement record
        INSERT INTO inventory.inventory_movements (
            org_id,
            movement_type,
            movement_date,
            movement_direction,
            product_id,
            batch_id,
            quantity,
            reference_type,
            reference_id,
            reference_number,
            reason,
            created_by
        )
        SELECT DISTINCT
            lws.org_id,
            'expiry',
            CURRENT_DATE,
            'quarantine',
            v_batch.product_id,
            v_batch.batch_id,
            SUM(lws.quantity_available),
            'batch_expiry',
            v_batch.batch_id,
            v_batch.batch_number,
            'Batch expired - moved to quarantine',
            0 -- System
        FROM inventory.location_wise_stock lws
        WHERE lws.batch_id = v_batch.batch_id
        GROUP BY lws.org_id;
        
        -- Create critical notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            requires_acknowledgment,
            notification_data
        )
        SELECT DISTINCT
            b.org_id,
            'error',
            'inventory',
            'Batch Expired',
            format('Batch %s of %s has expired. Quantity: %s units moved to quarantine.',
                v_batch.batch_number,
                v_batch.product_name,
                v_batch.quantity_available),
            'critical',
            TRUE,
            jsonb_build_object(
                'batch_id', v_batch.batch_id,
                'product_id', v_batch.product_id,
                'batch_number', v_batch.batch_number,
                'quantity_expired', v_batch.quantity_available
            )
        FROM inventory.batches b
        WHERE b.batch_id = v_batch.batch_id;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- This would typically be called by a scheduled job daily
CREATE TRIGGER trigger_batch_expiry_check
    AFTER INSERT ON system_config.system_health_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_on_expiry();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
-- CREATE INDEX idx_invoice_items_batch_alloc ON sales.invoice_items USING GIN(batch_allocation); -- Column doesn't exist
CREATE INDEX idx_orders_fulfillment ON sales.orders(order_id, fulfillment_status);
-- Credit utilization tracking (current outstanding in parties table)
CREATE INDEX idx_customer_credit_utilization ON parties.customers(customer_id, current_outstanding) WHERE current_outstanding > 0;
CREATE INDEX idx_batches_expiry_active ON inventory.batches(expiry_date) WHERE batch_status = 'active';
CREATE INDEX idx_reservations_expiry ON inventory.stock_reservations(expires_at, reservation_status) WHERE reservation_status = 'active';

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON FUNCTION update_inventory_on_sale() IS 'Updates inventory on sales transactions and reversals';
COMMENT ON FUNCTION update_inventory_on_purchase() IS 'Updates inventory on purchase receipts';
COMMENT ON FUNCTION update_credit_on_transactions() IS 'Manages credit limit utilization';
COMMENT ON FUNCTION process_stock_return() IS 'Handles stock returns including saleable and damaged items';
COMMENT ON FUNCTION release_expired_reservations() IS 'Automatically releases expired stock reservations';
COMMENT ON FUNCTION sync_order_invoice_status() IS 'Synchronizes order fulfillment status with invoicing';
COMMENT ON FUNCTION auto_allocate_payment() IS 'Automatically allocates payments to outstanding invoices';
COMMENT ON FUNCTION update_batch_on_expiry() IS 'Handles batch expiry and quarantine';