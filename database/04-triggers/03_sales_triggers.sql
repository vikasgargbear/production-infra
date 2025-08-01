-- =============================================
-- SALES OPERATIONS TRIGGERS
-- =============================================
-- Schema: sales
-- Order processing, pricing, and scheme management
-- =============================================

-- =============================================
-- 1. ORDER TOTAL CALCULATION
-- =============================================
CREATE OR REPLACE FUNCTION calculate_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_totals RECORD;
    v_gst_summary JSONB;
BEGIN
    -- Calculate totals from order items
    SELECT 
        COUNT(*) as item_count,
        COALESCE(SUM((quantity * unit_price)), 0) as subtotal,
        COALESCE(SUM(discount_amount + scheme_discount_amount), 0) as total_discount,
        COALESCE(SUM(taxable_amount), 0) as taxable,
        COALESCE(SUM(line_total - taxable_amount), 0) as tax,
        COALESCE(SUM(line_total), 0) as total,
        -- GST breakup
        COALESCE(SUM(taxable_amount * igst_percent / 100), 0) as igst,
        COALESCE(SUM(taxable_amount * cgst_percent / 100), 0) as cgst,
        COALESCE(SUM(taxable_amount * sgst_percent / 100), 0) as sgst,
        COALESCE(SUM(taxable_amount * cess_percent / 100), 0) as cess
    INTO v_totals
    FROM sales.order_items
    WHERE order_id = NEW.order_id
    AND item_status != 'cancelled';
    
    -- Update order totals
    UPDATE sales.orders
    SET 
        items_count = v_totals.item_count,
        subtotal_amount = v_totals.subtotal,
        discount_amount = v_totals.total_discount,
        taxable_amount = v_totals.taxable,
        tax_amount = v_totals.tax,
        igst_amount = v_totals.igst,
        cgst_amount = v_totals.cgst,
        sgst_amount = v_totals.sgst,
        cess_amount = v_totals.cess,
        -- Round off
        round_off_amount = ROUND(v_totals.total) - v_totals.total,
        final_amount = ROUND(v_totals.total),
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = NEW.order_id;
    
    -- Store GST summary for reporting
    v_gst_summary := jsonb_build_object(
        'taxable_value', v_totals.taxable,
        'igst', v_totals.igst,
        'cgst', v_totals.cgst,
        'sgst', v_totals.sgst,
        'cess', v_totals.cess,
        'total_tax', v_totals.tax
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_order_totals
    AFTER INSERT OR UPDATE OR DELETE ON sales.order_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_order_totals();

-- =============================================
-- 2. DYNAMIC PRICING CALCULATION
-- =============================================
CREATE OR REPLACE FUNCTION apply_dynamic_pricing()
RETURNS TRIGGER AS $$
DECLARE
    v_price_list RECORD;
    v_customer RECORD;
    v_base_price NUMERIC;
    v_discount_percent NUMERIC := 0;
    v_scheme_discount NUMERIC := 0;
    v_applicable_scheme RECORD;
BEGIN
    -- Get customer details
    SELECT 
        c.customer_id,
        c.customer_category,
        c.customer_grade,
        c.price_list_id,
        c.discount_group_id
    INTO v_customer
    FROM parties.customers c
    JOIN sales.orders o ON c.customer_id = o.customer_id
    WHERE o.order_id = NEW.order_id;
    
    -- Get applicable price
    SELECT 
        pli.base_unit_price,
        pli.pack_unit_price,
        pli.box_unit_price,
        pli.case_unit_price,
        pli.max_discount_percent
    INTO v_price_list
    FROM sales.price_list_items pli
    JOIN sales.price_lists pl ON pli.price_list_id = pl.price_list_id
    WHERE pli.product_id = NEW.product_id
    AND pl.price_list_id = COALESCE(v_customer.price_list_id, 
        (SELECT price_list_id FROM sales.price_lists 
         WHERE is_default = TRUE AND org_id = (
             SELECT org_id FROM sales.orders WHERE order_id = NEW.order_id
         ) LIMIT 1)
    )
    AND pl.is_active = TRUE
    AND CURRENT_DATE BETWEEN pl.effective_from AND COALESCE(pl.effective_until, '9999-12-31');
    
    -- Determine base price based on pack type
    v_base_price := CASE NEW.pack_type
        WHEN 'base' THEN COALESCE(v_price_list.base_unit_price, NEW.unit_price)
        WHEN 'pack' THEN COALESCE(v_price_list.pack_unit_price, NEW.unit_price)
        WHEN 'box' THEN COALESCE(v_price_list.box_unit_price, NEW.unit_price)
        WHEN 'case' THEN COALESCE(v_price_list.case_unit_price, NEW.unit_price)
        ELSE NEW.unit_price
    END;
    
    -- Apply customer group discount
    IF v_customer.discount_group_id IS NOT NULL THEN
        SELECT discount_percentage
        INTO v_discount_percent
        FROM parties.customer_groups
        WHERE group_id = v_customer.discount_group_id
        AND is_active = TRUE;
    END IF;
    
    -- Check for applicable schemes
    SELECT 
        s.scheme_id,
        s.scheme_code,
        s.scheme_rules
    INTO v_applicable_scheme
    FROM sales.sales_schemes s
    WHERE s.is_active = TRUE
    AND CURRENT_DATE BETWEEN s.start_date AND s.end_date
    AND (
        s.applicable_products IS NULL OR 
        NEW.product_id = ANY(s.applicable_products)
    )
    AND (
        s.applicable_customers IS NULL OR
        v_customer.customer_id = ANY(s.applicable_customers)
    )
    AND (
        (s.scheme_rules->>'min_quantity')::NUMERIC <= NEW.quantity OR
        s.scheme_rules->>'min_quantity' IS NULL
    )
    ORDER BY 
        CASE 
            WHEN s.scheme_rules->>'discount_value' IS NOT NULL 
            THEN (s.scheme_rules->>'discount_value')::NUMERIC 
            ELSE 0 
        END DESC
    LIMIT 1;
    
    -- Apply scheme discount
    IF v_applicable_scheme.scheme_id IS NOT NULL THEN
        IF v_applicable_scheme.scheme_rules->>'discount_type' = 'percentage' THEN
            v_scheme_discount := v_base_price * NEW.quantity * 
                (v_applicable_scheme.scheme_rules->>'discount_value')::NUMERIC / 100;
        ELSIF v_applicable_scheme.scheme_rules->>'discount_type' = 'fixed' THEN
            v_scheme_discount := (v_applicable_scheme.scheme_rules->>'discount_value')::NUMERIC;
        END IF;
        
        NEW.scheme_code := v_applicable_scheme.scheme_code;
        NEW.scheme_discount_percent := CASE 
            WHEN v_base_price * NEW.quantity > 0 
            THEN (v_scheme_discount / (v_base_price * NEW.quantity)) * 100
            ELSE 0
        END;
        NEW.scheme_discount_amount := v_scheme_discount;
        
        -- Handle free goods
        IF v_applicable_scheme.scheme_rules->'free_goods' IS NOT NULL THEN
            NEW.free_quantity := (v_applicable_scheme.scheme_rules->'free_goods'->>'quantity')::NUMERIC;
        END IF;
    END IF;
    
    -- Update pricing
    NEW.unit_price := v_base_price;
    NEW.discount_percent := LEAST(v_discount_percent, COALESCE(v_price_list.max_discount_percent, 100));
    NEW.discount_amount := (v_base_price * NEW.quantity * NEW.discount_percent / 100);
    
    -- Calculate taxable amount
    NEW.taxable_amount := (v_base_price * NEW.quantity) - 
                         NEW.discount_amount - 
                         NEW.scheme_discount_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_apply_dynamic_pricing
    BEFORE INSERT OR UPDATE OF quantity, pack_type ON sales.order_items
    FOR EACH ROW
    EXECUTE FUNCTION apply_dynamic_pricing();

-- =============================================
-- 3. BATCH ALLOCATION (FEFO)
-- =============================================
CREATE OR REPLACE FUNCTION allocate_batches_fefo()
RETURNS TRIGGER AS $$
DECLARE
    v_batch RECORD;
    v_remaining_qty NUMERIC;
    v_allocation JSONB := '[]'::JSONB;
    v_allocated_qty NUMERIC;
BEGIN
    -- Only allocate for confirmed items
    IF NEW.item_status != 'confirmed' OR NEW.batch_allocation IS NOT NULL THEN
        RETURN NEW;
    END IF;
    
    v_remaining_qty := NEW.base_quantity;
    
    -- Get batches using FEFO (First Expiry First Out)
    FOR v_batch IN
        SELECT 
            b.batch_id,
            b.batch_number,
            b.expiry_date,
            b.mrp_per_unit,
            SUM(lws.quantity_available - COALESCE(lws.quantity_reserved, 0)) as available_qty
        FROM inventory.batches b
        JOIN inventory.location_wise_stock lws ON b.batch_id = lws.batch_id
        WHERE b.product_id = NEW.product_id
        AND b.batch_status = 'active'
        AND b.expiry_date > CURRENT_DATE + INTERVAL '30 days' -- Min 30 days shelf life
        AND lws.quantity_available > COALESCE(lws.quantity_reserved, 0)
        GROUP BY b.batch_id, b.batch_number, b.expiry_date, b.mrp_per_unit
        HAVING SUM(lws.quantity_available - COALESCE(lws.quantity_reserved, 0)) > 0
        ORDER BY b.expiry_date, b.batch_id
    LOOP
        v_allocated_qty := LEAST(v_batch.available_qty, v_remaining_qty);
        
        -- Add to allocation
        v_allocation := v_allocation || jsonb_build_object(
            'batch_id', v_batch.batch_id,
            'batch_number', v_batch.batch_number,
            'quantity', v_allocated_qty,
            'expiry_date', v_batch.expiry_date,
            'mrp', v_batch.mrp_per_unit
        );
        
        -- Create reservation
        INSERT INTO inventory.stock_reservations (
            org_id,
            product_id,
            batch_id,
            location_id,
            reserved_quantity,
            reference_type,
            reference_id,
            priority,
            expires_at,
            reserved_by
        )
        SELECT 
            o.org_id,
            NEW.product_id,
            v_batch.batch_id,
            lws.location_id,
            LEAST(v_allocated_qty, 
                  lws.quantity_available - COALESCE(lws.quantity_reserved, 0)),
            'order',
            NEW.order_id,
            CASE 
                WHEN o.order_type = 'urgent' THEN 1
                ELSE 5
            END,
            CURRENT_TIMESTAMP + INTERVAL '24 hours',
            o.created_by
        FROM inventory.location_wise_stock lws
        JOIN sales.orders o ON o.order_id = NEW.order_id
        WHERE lws.batch_id = v_batch.batch_id
        AND lws.quantity_available > COALESCE(lws.quantity_reserved, 0)
        ORDER BY lws.stock_in_date
        LIMIT 1;
        
        v_remaining_qty := v_remaining_qty - v_allocated_qty;
        
        EXIT WHEN v_remaining_qty <= 0;
    END LOOP;
    
    -- Check if fully allocated
    IF v_remaining_qty > 0 THEN
        NEW.item_status := 'partial';
        NEW.pending_quantity := v_remaining_qty;
        
        -- Create backorder notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        )
        SELECT 
            o.org_id,
            'warning',
            'inventory',
            'Partial Stock Allocation',
            format('Order %s: Only %s of %s allocated for %s',
                o.order_number,
                NEW.base_quantity - v_remaining_qty,
                NEW.base_quantity,
                p.product_name),
            'high',
            jsonb_build_object(
                'order_id', NEW.order_id,
                'order_item_id', NEW.order_item_id,
                'product_id', NEW.product_id,
                'requested_qty', NEW.base_quantity,
                'allocated_qty', NEW.base_quantity - v_remaining_qty,
                'pending_qty', v_remaining_qty
            )
        FROM sales.orders o
        JOIN inventory.products p ON p.product_id = NEW.product_id
        WHERE o.order_id = NEW.order_id;
    ELSE
        NEW.item_status := 'allocated';
        NEW.pending_quantity := 0;
    END IF;
    
    NEW.batch_allocation := v_allocation;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_batch_allocation
    BEFORE UPDATE OF item_status ON sales.order_items
    FOR EACH ROW
    WHEN (NEW.item_status = 'confirmed')
    EXECUTE FUNCTION allocate_batches_fefo();

-- =============================================
-- 4. INVOICE GENERATION FROM ORDER
-- =============================================
CREATE OR REPLACE FUNCTION generate_invoice_from_order()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id INTEGER;
    v_invoice_number TEXT;
    v_fin_year TEXT;
BEGIN
    -- Only for delivered orders without invoice
    IF NEW.order_status != 'delivered' OR OLD.order_status = 'delivered' THEN
        RETURN NEW;
    END IF;
    
    -- Check if invoice already exists
    IF EXISTS (SELECT 1 FROM sales.invoices WHERE order_id = NEW.order_id) THEN
        RETURN NEW;
    END IF;
    
    -- Generate invoice number
    v_fin_year := CASE 
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4 THEN
            EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || 
            (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::TEXT
        ELSE
            (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::TEXT || '-' || 
            EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
    END;
    
    SELECT 
        COALESCE(MAX(REGEXP_REPLACE(invoice_number, '^[A-Z]+-', '')::INTEGER), 0) + 1
    INTO v_invoice_number
    FROM sales.invoices
    WHERE org_id = NEW.org_id
    AND invoice_number LIKE 'INV-' || v_fin_year || '-%';
    
    v_invoice_number := 'INV-' || v_fin_year || '-' || LPAD(v_invoice_number::TEXT, 6, '0');
    
    -- Create invoice
    INSERT INTO sales.invoices (
        org_id,
        branch_id,
        invoice_number,
        invoice_date,
        invoice_type,
        order_id,
        customer_id,
        customer_name,
        billing_address_id,
        shipping_address_id,
        subtotal_amount,
        discount_amount,
        scheme_discount,
        taxable_amount,
        igst_amount,
        cgst_amount,
        sgst_amount,
        cess_amount,
        total_tax_amount,
        round_off_amount,
        final_amount,
        payment_terms,
        due_date,
        created_by
    )
    SELECT 
        o.org_id,
        o.branch_id,
        v_invoice_number,
        CURRENT_DATE,
        'tax_invoice',
        o.order_id,
        o.customer_id,
        c.customer_name,
        ca_bill.address_id,
        ca_ship.address_id,
        o.subtotal_amount,
        o.discount_amount,
        o.scheme_discount,
        o.taxable_amount,
        o.igst_amount,
        o.cgst_amount,
        o.sgst_amount,
        o.cess_amount,
        o.tax_amount,
        o.round_off_amount,
        o.final_amount,
        o.payment_terms,
        CASE 
            WHEN c.credit_info->>'credit_days' IS NOT NULL 
            THEN CURRENT_DATE + ((c.credit_info->>'credit_days')::INTEGER || ' days')::INTERVAL
            ELSE CURRENT_DATE
        END,
        o.created_by
    FROM sales.orders o
    JOIN parties.customers c ON o.customer_id = c.customer_id
    LEFT JOIN master.addresses ca_bill ON ca_bill.entity_type = 'customer' 
        AND ca_bill.entity_id = c.customer_id 
        AND ca_bill.address_type = 'billing' 
        AND ca_bill.is_default = TRUE
    LEFT JOIN master.addresses ca_ship ON ca_ship.entity_type = 'customer' 
        AND ca_ship.entity_id = c.customer_id 
        AND ca_ship.address_type = 'shipping' 
        AND ca_ship.is_default = TRUE
    WHERE o.order_id = NEW.order_id
    RETURNING invoice_id INTO v_invoice_id;
    
    -- Copy order items to invoice items
    INSERT INTO sales.invoice_items (
        invoice_id,
        order_item_id,
        product_id,
        product_name,
        product_description,
        hsn_code,
        batch_id,
        batch_number,
        manufacturing_date,
        expiry_date,
        quantity,
        uom,
        pack_type,
        pack_size,
        base_quantity,
        mrp,
        unit_price,
        discount_percent,
        discount_amount,
        taxable_amount,
        igst_rate,
        igst_amount,
        cgst_rate,
        cgst_amount,
        sgst_rate,
        sgst_amount,
        cess_rate,
        cess_amount,
        total_tax_amount,
        line_total,
        is_free_item,
        display_order
    )
    SELECT 
        v_invoice_id,
        oi.order_item_id,
        oi.product_id,
        oi.product_name,
        p.composition::TEXT,
        oi.hsn_code,
        (oi.batch_allocation->0->>'batch_id')::INTEGER,
        oi.batch_allocation->0->>'batch_number',
        b.manufacturing_date,
        b.expiry_date,
        oi.delivered_quantity,
        oi.uom,
        oi.pack_type,
        oi.pack_size,
        oi.delivered_quantity * COALESCE(oi.pack_size, 1),
        oi.mrp,
        oi.unit_price,
        oi.discount_percent,
        oi.discount_amount,
        oi.taxable_amount,
        oi.igst_percent,
        oi.taxable_amount * oi.igst_percent / 100,
        oi.cgst_percent,
        oi.taxable_amount * oi.cgst_percent / 100,
        oi.sgst_percent,
        oi.taxable_amount * oi.sgst_percent / 100,
        oi.cess_percent,
        oi.taxable_amount * oi.cess_percent / 100,
        oi.tax_amount,
        oi.line_total,
        oi.free_quantity > 0,
        oi.display_order
    FROM sales.order_items oi
    JOIN inventory.products p ON oi.product_id = p.product_id
    LEFT JOIN inventory.batches b ON b.batch_id = (oi.batch_allocation->0->>'batch_id')::INTEGER
    WHERE oi.order_id = NEW.order_id
    AND oi.delivered_quantity > 0;
    
    -- Create outstanding entry
    INSERT INTO financial.customer_outstanding (
        org_id,
        customer_id,
        document_type,
        document_id,
        document_number,
        document_date,
        original_amount,
        outstanding_amount,
        due_date
    )
    SELECT 
        i.org_id,
        i.customer_id,
        'invoice',
        i.invoice_id,
        i.invoice_number,
        i.invoice_date,
        i.final_amount,
        i.final_amount,
        i.due_date
    FROM sales.invoices i
    WHERE i.invoice_id = v_invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_invoice
    AFTER UPDATE OF order_status ON sales.orders
    FOR EACH ROW
    WHEN (NEW.order_status = 'delivered')
    EXECUTE FUNCTION generate_invoice_from_order();

-- =============================================
-- 5. SALES TARGET TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION update_sales_target_achievement()
RETURNS TRIGGER AS $$
DECLARE
    v_user_target RECORD;
    v_territory_target RECORD;
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- Only track posted invoices
    IF NEW.invoice_status != 'posted' OR OLD.invoice_status = 'posted' THEN
        RETURN NEW;
    END IF;
    
    -- Determine period
    v_period_start := DATE_TRUNC('month', NEW.invoice_date);
    v_period_end := v_period_start + INTERVAL '1 month' - INTERVAL '1 day';
    
    -- Update user targets
    UPDATE sales.sales_targets
    SET 
        revenue_achieved = revenue_achieved + NEW.final_amount,
        revenue_achievement_percent = 
            (revenue_achieved + NEW.final_amount) * 100.0 / NULLIF(revenue_target, 0),
        updated_at = CURRENT_TIMESTAMP
    WHERE target_type = 'user'
    AND target_entity_id = NEW.created_by
    AND target_year = EXTRACT(YEAR FROM NEW.invoice_date)
    AND (target_month = EXTRACT(MONTH FROM NEW.invoice_date) OR target_month IS NULL)
    AND (SELECT org_id FROM sales.orders WHERE order_id = NEW.order_id) = org_id;
    
    -- Update territory targets
    UPDATE sales.sales_targets st
    SET 
        revenue_achieved = st.revenue_achieved + NEW.final_amount,
        revenue_achievement_percent = 
            (st.revenue_achieved + NEW.final_amount) * 100.0 / NULLIF(st.revenue_target, 0),
        updated_at = CURRENT_TIMESTAMP
    FROM sales.orders o
    WHERE st.target_type = 'territory'
    AND st.target_entity_id = o.territory_id
    AND st.target_year = EXTRACT(YEAR FROM NEW.invoice_date)
    AND (st.target_month = EXTRACT(MONTH FROM NEW.invoice_date) OR st.target_month IS NULL)
    AND o.order_id = NEW.order_id;
    
    -- Check for achievement milestones and create notifications
    FOR v_user_target IN
        SELECT 
            st.*,
            u.full_name as user_name
        FROM sales.sales_targets st
        JOIN master.org_users u ON st.target_entity_id = u.user_id
        WHERE st.target_type = 'user'
        AND st.target_entity_id = NEW.created_by
        AND st.target_year = EXTRACT(YEAR FROM NEW.invoice_date)
        AND st.target_month = EXTRACT(MONTH FROM NEW.invoice_date)
    LOOP
        IF v_user_target.revenue_achievement_percent >= 100 
           AND v_user_target.revenue_achievement_percent - 
               (NEW.final_amount * 100.0 / NULLIF(v_user_target.revenue_target, 0)) < 100 THEN
            -- Target achieved notification
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                target_users
            ) VALUES (
                (SELECT org_id FROM sales.orders WHERE order_id = NEW.order_id),
                'success',
                'sales',
                'Sales Target Achieved!',
                format('Congratulations! %s has achieved %s%% of the monthly target',
                    v_user_target.user_name,
                    ROUND(v_user_target.revenue_achievement_percent, 1)),
                'high',
                ARRAY[v_user_target.target_entity_id]
            );
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sales_target_tracking
    AFTER UPDATE OF invoice_status ON sales.invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_sales_target_achievement();

-- =============================================
-- 6. RETURN PROCESSING
-- =============================================
CREATE OR REPLACE FUNCTION process_sales_return()
RETURNS TRIGGER AS $$
DECLARE
    v_credit_note_number TEXT;
    v_item RECORD;
BEGIN
    -- Generate credit note on approval
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Generate credit note number
        SELECT 'CN-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
               LPAD(COALESCE(MAX(REGEXP_REPLACE(credit_note_number, '^CN-[0-9]{6}-', '')::INTEGER), 0) + 1::TEXT, 6, '0')
        INTO v_credit_note_number
        FROM sales.sales_returns
        WHERE org_id = NEW.org_id
        AND credit_note_number LIKE 'CN-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-%';
        
        NEW.credit_note_number := v_credit_note_number;
        NEW.credit_note_date := CURRENT_DATE;
        NEW.credit_note_status := 'issued';
        
        -- Process each return item
        FOR v_item IN
            SELECT * FROM sales.sales_return_items
            WHERE return_id = NEW.return_id
        LOOP
            -- Return stock to inventory
            IF v_item.saleable_quantity > 0 THEN
                INSERT INTO inventory.inventory_movements (
                    org_id,
                    movement_type,
                    movement_direction,
                    product_id,
                    batch_id,
                    quantity,
                    base_quantity,
                    location_id,
                    reference_type,
                    reference_id,
                    reference_number,
                    reason,
                    created_by
                )
                SELECT 
                    NEW.org_id,
                    'return',
                    'in',
                    v_item.product_id,
                    v_item.batch_id,
                    v_item.saleable_quantity,
                    v_item.saleable_quantity,
                    sl.location_id,
                    'sales_return',
                    NEW.return_id,
                    NEW.return_number,
                    NEW.return_reason,
                    NEW.created_by
                FROM inventory.storage_locations sl
                WHERE sl.branch_id = NEW.branch_id
                AND sl.location_type = 'warehouse'
                AND sl.is_active = TRUE
                LIMIT 1;
            END IF;
            
            -- Handle damaged quantity
            IF v_item.damaged_quantity > 0 THEN
                INSERT INTO inventory.inventory_movements (
                    org_id,
                    movement_type,
                    movement_direction,
                    product_id,
                    batch_id,
                    quantity,
                    base_quantity,
                    location_id,
                    reference_type,
                    reference_id,
                    reference_number,
                    reason,
                    created_by
                )
                SELECT 
                    NEW.org_id,
                    'damage',
                    'out',
                    v_item.product_id,
                    v_item.batch_id,
                    v_item.damaged_quantity,
                    v_item.damaged_quantity,
                    sl.location_id,
                    'sales_return',
                    NEW.return_id,
                    NEW.return_number,
                    'Damaged goods from return',
                    NEW.created_by
                FROM inventory.storage_locations sl
                WHERE sl.branch_id = NEW.branch_id
                AND sl.location_type = 'warehouse'
                AND sl.storage_class = 'quarantine'
                LIMIT 1;
            END IF;
        END LOOP;
        
        -- Create credit note in outstanding
        INSERT INTO financial.customer_outstanding (
            org_id,
            customer_id,
            document_type,
            document_id,
            document_number,
            document_date,
            original_amount,
            outstanding_amount,
            status
        ) VALUES (
            NEW.org_id,
            NEW.customer_id,
            'credit_note',
            NEW.return_id,
            NEW.credit_note_number,
            NEW.credit_note_date,
            -NEW.total_amount, -- Negative for credit
            -NEW.total_amount,
            'open'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_process_sales_return
    BEFORE UPDATE OF approval_status ON sales.sales_returns
    FOR EACH ROW
    EXECUTE FUNCTION process_sales_return();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
-- Note: Most indexes are created in 02-tables files or 06-indexes/01_performance_indexes.sql
-- Only create trigger-specific indexes here
CREATE INDEX IF NOT EXISTS idx_order_items_order ON sales.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON sales.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_entity ON sales.sales_targets(target_type, target_entity_id);

-- Add comments
COMMENT ON FUNCTION calculate_order_totals() IS 'Calculates order totals from line items';
COMMENT ON FUNCTION apply_dynamic_pricing() IS 'Applies customer-specific pricing and schemes';
COMMENT ON FUNCTION allocate_batches_fefo() IS 'Allocates batches using First Expiry First Out';
COMMENT ON FUNCTION update_sales_target_achievement() IS 'Tracks sales target achievement in real-time';