-- =============================================
-- INVENTORY BUSINESS FUNCTIONS
-- =============================================
-- Complex inventory operations and calculations
-- =============================================

-- =============================================
-- 1. INTELLIGENT BATCH ALLOCATION
-- =============================================
CREATE OR REPLACE FUNCTION allocate_stock_intelligent(
    p_org_id INTEGER,
    p_product_id INTEGER,
    p_required_quantity NUMERIC,
    p_location_id INTEGER DEFAULT NULL,
    p_allocation_method TEXT DEFAULT 'FEFO', -- FEFO, FIFO, LIFO, MANUAL
    p_exclude_batches INTEGER[] DEFAULT NULL,
    p_min_shelf_life_days INTEGER DEFAULT 30
) RETURNS TABLE (
    batch_id INTEGER,
    batch_number TEXT,
    allocated_quantity NUMERIC,
    unit_cost NUMERIC,
    mrp NUMERIC,
    expiry_date DATE,
    location_id INTEGER,
    location_name TEXT,
    days_to_expiry INTEGER
) AS $$
DECLARE
    v_remaining_qty NUMERIC;
    v_total_allocated NUMERIC := 0;
BEGIN
    v_remaining_qty := p_required_quantity;
    
    RETURN QUERY
    WITH available_stock AS (
        SELECT 
            b.batch_id,
            b.batch_number,
            b.expiry_date,
            b.cost_per_unit,
            b.mrp_per_unit,
            lws.location_id,
            sl.location_name,
            lws.quantity_available - COALESCE(lws.quantity_reserved, 0) as available_qty,
            (b.expiry_date - CURRENT_DATE)::INTEGER as days_to_expiry,
            lws.stock_in_date
        FROM inventory.batches b
        JOIN inventory.location_wise_stock lws ON b.batch_id = lws.batch_id
        JOIN inventory.storage_locations sl ON lws.location_id = sl.location_id
        WHERE b.product_id = p_product_id
        AND b.batch_status = 'active'
        AND lws.stock_status = 'available'
        AND lws.quantity_available > COALESCE(lws.quantity_reserved, 0)
        AND (p_location_id IS NULL OR lws.location_id = p_location_id)
        AND (p_exclude_batches IS NULL OR b.batch_id != ALL(p_exclude_batches))
        AND (b.expiry_date - CURRENT_DATE) >= p_min_shelf_life_days
    ),
    ordered_stock AS (
        SELECT 
            *,
            CASE p_allocation_method
                WHEN 'FEFO' THEN ROW_NUMBER() OVER (ORDER BY expiry_date, batch_id)
                WHEN 'FIFO' THEN ROW_NUMBER() OVER (ORDER BY stock_in_date, batch_id)
                WHEN 'LIFO' THEN ROW_NUMBER() OVER (ORDER BY stock_in_date DESC, batch_id)
                ELSE ROW_NUMBER() OVER (ORDER BY batch_id)
            END as allocation_order
        FROM available_stock
    ),
    allocations AS (
        SELECT 
            os.batch_id,
            os.batch_number,
            LEAST(
                os.available_qty,
                v_remaining_qty - COALESCE(
                    SUM(os.available_qty) OVER (
                        ORDER BY allocation_order 
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                    ), 0
                )
            ) as allocated_qty,
            os.cost_per_unit,
            os.mrp_per_unit,
            os.expiry_date,
            os.location_id,
            os.location_name,
            os.days_to_expiry
        FROM ordered_stock os
        WHERE COALESCE(
            SUM(os.available_qty) OVER (
                ORDER BY allocation_order 
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ), 0
        ) < v_remaining_qty
    )
    SELECT 
        a.batch_id,
        a.batch_number,
        a.allocated_qty as allocated_quantity,
        a.cost_per_unit as unit_cost,
        a.mrp_per_unit as mrp,
        a.expiry_date,
        a.location_id,
        a.location_name,
        a.days_to_expiry
    FROM allocations a
    WHERE a.allocated_qty > 0;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. STOCK VALUATION
-- =============================================
CREATE OR REPLACE FUNCTION calculate_stock_valuation(
    p_org_id INTEGER,
    p_as_of_date DATE DEFAULT CURRENT_DATE,
    p_valuation_method TEXT DEFAULT 'weighted_average', -- weighted_average, fifo, lifo, standard
    p_location_id INTEGER DEFAULT NULL,
    p_product_id INTEGER DEFAULT NULL
) RETURNS TABLE (
    product_id INTEGER,
    product_name TEXT,
    product_code TEXT,
    category_name TEXT,
    total_quantity NUMERIC,
    unit_cost NUMERIC,
    total_value NUMERIC,
    mrp_value NUMERIC,
    potential_profit NUMERIC,
    location_count INTEGER,
    batch_count INTEGER,
    expiring_quantity NUMERIC,
    expiring_value NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH stock_data AS (
        SELECT 
            p.product_id,
            p.product_name,
            p.product_code,
            pc.category_name,
            SUM(lws.quantity_available) as total_qty,
            COUNT(DISTINCT lws.location_id) as locations,
            COUNT(DISTINCT b.batch_id) as batches,
            SUM(CASE 
                WHEN b.expiry_date <= p_as_of_date + INTERVAL '90 days' 
                THEN lws.quantity_available 
                ELSE 0 
            END) as exp_qty,
            -- Valuation based on method
            CASE p_valuation_method
                WHEN 'weighted_average' THEN 
                    SUM(lws.quantity_available * b.cost_per_unit) / NULLIF(SUM(lws.quantity_available), 0)
                WHEN 'standard' THEN 
                    p.standard_cost
                ELSE 
                    AVG(b.cost_per_unit)
            END as unit_cost_calc,
            SUM(lws.quantity_available * b.mrp_per_unit) as mrp_val,
            SUM(CASE 
                WHEN b.expiry_date <= p_as_of_date + INTERVAL '90 days' 
                THEN lws.quantity_available * b.cost_per_unit
                ELSE 0 
            END) as exp_val
        FROM inventory.products p
        JOIN inventory.product_categories pc ON p.category_id = pc.category_id
        JOIN inventory.batches b ON p.product_id = b.product_id
        JOIN inventory.location_wise_stock lws ON b.batch_id = lws.batch_id
        WHERE p.org_id = p_org_id
        AND lws.stock_in_date <= p_as_of_date
        AND lws.quantity_available > 0
        AND (p_location_id IS NULL OR lws.location_id = p_location_id)
        AND (p_product_id IS NULL OR p.product_id = p_product_id)
        GROUP BY p.product_id, p.product_name, p.product_code, 
                 pc.category_name, p.standard_cost
    )
    SELECT 
        sd.product_id,
        sd.product_name,
        sd.product_code,
        sd.category_name,
        sd.total_qty as total_quantity,
        sd.unit_cost_calc as unit_cost,
        sd.total_qty * sd.unit_cost_calc as total_value,
        sd.mrp_val as mrp_value,
        sd.mrp_val - (sd.total_qty * sd.unit_cost_calc) as potential_profit,
        sd.locations as location_count,
        sd.batches as batch_count,
        sd.exp_qty as expiring_quantity,
        sd.exp_val as expiring_value
    FROM stock_data sd
    ORDER BY sd.total_qty * sd.unit_cost_calc DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. REORDER POINT CALCULATION
-- =============================================
CREATE OR REPLACE FUNCTION calculate_reorder_points(
    p_org_id INTEGER,
    p_analysis_period_days INTEGER DEFAULT 90,
    p_service_level NUMERIC DEFAULT 95, -- percentage
    p_category_id INTEGER DEFAULT NULL
) RETURNS TABLE (
    product_id INTEGER,
    product_name TEXT,
    avg_daily_consumption NUMERIC,
    consumption_std_dev NUMERIC,
    lead_time_days INTEGER,
    safety_stock NUMERIC,
    reorder_point NUMERIC,
    reorder_quantity NUMERIC,
    current_stock NUMERIC,
    stock_status TEXT,
    days_of_stock NUMERIC
) AS $$
DECLARE
    v_z_score NUMERIC;
BEGIN
    -- Z-score for service level (simplified)
    v_z_score := CASE 
        WHEN p_service_level >= 99 THEN 2.33
        WHEN p_service_level >= 95 THEN 1.65
        WHEN p_service_level >= 90 THEN 1.28
        ELSE 1.0
    END;
    
    RETURN QUERY
    WITH consumption_data AS (
        -- Calculate daily consumption statistics
        SELECT 
            im.product_id,
            DATE(im.movement_date) as movement_date,
            SUM(im.base_quantity) as daily_consumption
        FROM inventory.inventory_movements im
        WHERE im.org_id = p_org_id
        AND im.movement_type IN ('sale', 'consumption')
        AND im.movement_direction = 'out'
        AND im.movement_date >= CURRENT_DATE - (p_analysis_period_days || ' days')::INTERVAL
        GROUP BY im.product_id, DATE(im.movement_date)
    ),
    product_stats AS (
        SELECT 
            cd.product_id,
            AVG(cd.daily_consumption) as avg_daily,
            STDDEV(cd.daily_consumption) as std_dev,
            COUNT(DISTINCT cd.movement_date) as active_days
        FROM consumption_data cd
        GROUP BY cd.product_id
        HAVING COUNT(DISTINCT cd.movement_date) >= 10 -- Minimum data points
    ),
    lead_times AS (
        -- Calculate average lead time from purchase orders
        SELECT 
            poi.product_id,
            AVG(EXTRACT(EPOCH FROM (g.grn_date - po.po_date)) / 86400)::INTEGER as avg_lead_time
        FROM procurement.purchase_order_items poi
        JOIN procurement.purchase_orders po ON poi.purchase_order_id = po.purchase_order_id
        JOIN procurement.goods_receipt_notes g ON po.purchase_order_id = g.purchase_order_id
        WHERE po.org_id = p_org_id
        AND g.grn_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY poi.product_id
    ),
    current_stock AS (
        SELECT 
            p.product_id,
            SUM(lws.quantity_available - COALESCE(lws.quantity_reserved, 0)) as available_stock
        FROM inventory.products p
        LEFT JOIN inventory.location_wise_stock lws ON p.product_id = lws.product_id
        WHERE p.org_id = p_org_id
        GROUP BY p.product_id
    )
    SELECT 
        p.product_id,
        p.product_name,
        COALESCE(ps.avg_daily, 0) as avg_daily_consumption,
        COALESCE(ps.std_dev, 0) as consumption_std_dev,
        COALESCE(lt.avg_lead_time, 7) as lead_time_days, -- Default 7 days
        -- Safety stock = Z-score * sqrt(lead_time) * std_dev
        GREATEST(
            v_z_score * SQRT(COALESCE(lt.avg_lead_time, 7)) * COALESCE(ps.std_dev, ps.avg_daily * 0.3),
            COALESCE(ps.avg_daily, 0) * 3 -- Minimum 3 days safety stock
        ) as safety_stock,
        -- Reorder point = (avg_daily * lead_time) + safety_stock
        (COALESCE(ps.avg_daily, 0) * COALESCE(lt.avg_lead_time, 7)) + 
        GREATEST(
            v_z_score * SQRT(COALESCE(lt.avg_lead_time, 7)) * COALESCE(ps.std_dev, ps.avg_daily * 0.3),
            COALESCE(ps.avg_daily, 0) * 3
        ) as reorder_point,
        -- Economic order quantity (simplified)
        GREATEST(
            SQRT(2 * COALESCE(ps.avg_daily, 0) * 365 * 50 / (p.standard_cost * 0.25)), -- EOQ formula
            COALESCE(ps.avg_daily, 0) * 30 -- Minimum 30 days order
        ) as reorder_quantity,
        COALESCE(cs.available_stock, 0) as current_stock,
        CASE 
            WHEN cs.available_stock <= 0 THEN 'out_of_stock'
            WHEN cs.available_stock <= p.critical_stock_level THEN 'critical'
            WHEN cs.available_stock <= 
                (COALESCE(ps.avg_daily, 0) * COALESCE(lt.avg_lead_time, 7)) + 
                GREATEST(
                    v_z_score * SQRT(COALESCE(lt.avg_lead_time, 7)) * COALESCE(ps.std_dev, ps.avg_daily * 0.3),
                    COALESCE(ps.avg_daily, 0) * 3
                ) THEN 'reorder_required'
            ELSE 'adequate'
        END as stock_status,
        CASE 
            WHEN COALESCE(ps.avg_daily, 0) > 0 
            THEN cs.available_stock / ps.avg_daily
            ELSE NULL
        END as days_of_stock
    FROM inventory.products p
    LEFT JOIN product_stats ps ON p.product_id = ps.product_id
    LEFT JOIN lead_times lt ON p.product_id = lt.product_id
    LEFT JOIN current_stock cs ON p.product_id = cs.product_id
    WHERE p.org_id = p_org_id
    AND p.is_active = TRUE
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    ORDER BY 
        CASE 
            WHEN cs.available_stock <= 0 THEN 1
            WHEN cs.available_stock <= p.critical_stock_level THEN 2
            WHEN cs.available_stock <= 
                (COALESCE(ps.avg_daily, 0) * COALESCE(lt.avg_lead_time, 7)) + 
                GREATEST(
                    v_z_score * SQRT(COALESCE(lt.avg_lead_time, 7)) * COALESCE(ps.std_dev, ps.avg_daily * 0.3),
                    COALESCE(ps.avg_daily, 0) * 3
                ) THEN 3
            ELSE 4
        END,
        ps.avg_daily DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. STOCK MOVEMENT ANALYSIS
-- =============================================
CREATE OR REPLACE FUNCTION analyze_stock_movements(
    p_org_id INTEGER,
    p_product_id INTEGER,
    p_start_date DATE,
    p_end_date DATE,
    p_group_by TEXT DEFAULT 'daily' -- daily, weekly, monthly
) RETURNS TABLE (
    period_date DATE,
    opening_stock NUMERIC,
    receipts NUMERIC,
    sales NUMERIC,
    adjustments NUMERIC,
    returns NUMERIC,
    transfers_in NUMERIC,
    transfers_out NUMERIC,
    closing_stock NUMERIC,
    stock_value NUMERIC,
    turnover_ratio NUMERIC
) AS $$
DECLARE
    v_opening_stock NUMERIC;
    v_running_stock NUMERIC;
BEGIN
    -- Get opening stock
    SELECT COALESCE(SUM(
        CASE 
            WHEN movement_direction = 'in' THEN base_quantity
            ELSE -base_quantity
        END
    ), 0)
    INTO v_opening_stock
    FROM inventory.inventory_movements
    WHERE org_id = p_org_id
    AND product_id = p_product_id
    AND movement_date < p_start_date;
    
    v_running_stock := v_opening_stock;
    
    RETURN QUERY
    WITH date_series AS (
        SELECT 
            CASE p_group_by
                WHEN 'daily' THEN date_trunc('day', d)::date
                WHEN 'weekly' THEN date_trunc('week', d)::date
                WHEN 'monthly' THEN date_trunc('month', d)::date
            END as period
        FROM generate_series(p_start_date, p_end_date, '1 day'::interval) d
        GROUP BY 1
    ),
    movements AS (
        SELECT 
            CASE p_group_by
                WHEN 'daily' THEN date_trunc('day', im.movement_date)::date
                WHEN 'weekly' THEN date_trunc('week', im.movement_date)::date
                WHEN 'monthly' THEN date_trunc('month', im.movement_date)::date
            END as period,
            SUM(CASE WHEN im.movement_type = 'purchase' AND im.movement_direction = 'in' 
                THEN im.base_quantity ELSE 0 END) as receipts,
            SUM(CASE WHEN im.movement_type = 'sale' AND im.movement_direction = 'out' 
                THEN im.base_quantity ELSE 0 END) as sales,
            SUM(CASE WHEN im.movement_type = 'adjustment' 
                THEN CASE WHEN im.movement_direction = 'in' 
                    THEN im.base_quantity ELSE -im.base_quantity END 
                ELSE 0 END) as adjustments,
            SUM(CASE WHEN im.movement_type IN ('sales_return', 'purchase_return')
                THEN CASE WHEN im.movement_direction = 'in' 
                    THEN im.base_quantity ELSE -im.base_quantity END 
                ELSE 0 END) as returns,
            SUM(CASE WHEN im.movement_type = 'transfer' AND im.movement_direction = 'in' 
                THEN im.base_quantity ELSE 0 END) as transfers_in,
            SUM(CASE WHEN im.movement_type = 'transfer' AND im.movement_direction = 'out' 
                THEN im.base_quantity ELSE 0 END) as transfers_out,
            AVG(im.unit_cost) as avg_cost
        FROM inventory.inventory_movements im
        WHERE im.org_id = p_org_id
        AND im.product_id = p_product_id
        AND im.movement_date BETWEEN p_start_date AND p_end_date
        GROUP BY 1
    )
    SELECT 
        ds.period as period_date,
        v_running_stock as opening_stock,
        COALESCE(m.receipts, 0) as receipts,
        COALESCE(m.sales, 0) as sales,
        COALESCE(m.adjustments, 0) as adjustments,
        COALESCE(m.returns, 0) as returns,
        COALESCE(m.transfers_in, 0) as transfers_in,
        COALESCE(m.transfers_out, 0) as transfers_out,
        v_running_stock + 
            COALESCE(m.receipts, 0) - 
            COALESCE(m.sales, 0) + 
            COALESCE(m.adjustments, 0) + 
            COALESCE(m.returns, 0) + 
            COALESCE(m.transfers_in, 0) - 
            COALESCE(m.transfers_out, 0) as closing_stock,
        (v_running_stock + 
            COALESCE(m.receipts, 0) - 
            COALESCE(m.sales, 0) + 
            COALESCE(m.adjustments, 0) + 
            COALESCE(m.returns, 0) + 
            COALESCE(m.transfers_in, 0) - 
            COALESCE(m.transfers_out, 0)) * COALESCE(m.avg_cost, 0) as stock_value,
        CASE 
            WHEN v_running_stock > 0 AND COALESCE(m.sales, 0) > 0
            THEN (COALESCE(m.sales, 0) * 
                CASE p_group_by
                    WHEN 'daily' THEN 365
                    WHEN 'weekly' THEN 52
                    WHEN 'monthly' THEN 12
                END) / v_running_stock
            ELSE 0
        END as turnover_ratio
    FROM date_series ds
    LEFT JOIN movements m ON ds.period = m.period
    ORDER BY ds.period;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. BATCH TRACKING AND TRACEABILITY
-- =============================================
CREATE OR REPLACE FUNCTION trace_batch_movement(
    p_batch_id INTEGER,
    p_trace_direction TEXT DEFAULT 'forward' -- forward (where did it go), backward (where did it come from)
) RETURNS TABLE (
    level INTEGER,
    movement_id INTEGER,
    movement_date DATE,
    movement_type TEXT,
    movement_direction TEXT,
    quantity NUMERIC,
    reference_type TEXT,
    reference_number TEXT,
    party_name TEXT,
    location_name TEXT,
    user_name TEXT,
    notes TEXT
) AS $$
BEGIN
    IF p_trace_direction = 'forward' THEN
        -- Trace where the batch went (sales, transfers out, etc.)
        RETURN QUERY
        WITH RECURSIVE batch_trace AS (
            -- Initial movements
            SELECT 
                1 as lvl,
                im.movement_id,
                im.movement_date,
                im.movement_type,
                im.movement_direction,
                im.quantity,
                im.reference_type,
                im.reference_number,
                CASE 
                    WHEN im.party_id IS NOT NULL AND im.movement_type = 'sale' 
                        THEN c.customer_name
                    WHEN im.party_id IS NOT NULL AND im.movement_type = 'purchase' 
                        THEN s.supplier_name
                    ELSE NULL
                END as party,
                sl.location_name,
                u.full_name as user_name,
                im.reason as notes
            FROM inventory.inventory_movements im
            LEFT JOIN parties.customers c ON im.party_id = c.customer_id AND im.movement_type = 'sale'
            LEFT JOIN parties.suppliers s ON im.party_id = s.supplier_id AND im.movement_type = 'purchase'
            LEFT JOIN inventory.storage_locations sl ON im.location_id = sl.location_id
            LEFT JOIN master.org_users u ON im.created_by = u.user_id
            WHERE im.batch_id = p_batch_id
            AND im.movement_direction = 'out'
            
            UNION ALL
            
            -- Follow transfers
            SELECT 
                bt.lvl + 1,
                im.movement_id,
                im.movement_date,
                im.movement_type,
                im.movement_direction,
                im.quantity,
                im.reference_type,
                im.reference_number,
                NULL as party,
                sl.location_name,
                u.full_name,
                im.reason
            FROM batch_trace bt
            JOIN inventory.inventory_movements im ON im.transfer_pair_id = bt.movement_id
            LEFT JOIN inventory.storage_locations sl ON im.location_id = sl.location_id
            LEFT JOIN master.org_users u ON im.created_by = u.user_id
            WHERE bt.movement_type = 'transfer'
            AND bt.lvl < 10 -- Prevent infinite recursion
        )
        SELECT * FROM batch_trace
        ORDER BY movement_date, movement_id;
        
    ELSE -- backward trace
        -- Trace where the batch came from
        RETURN QUERY
        SELECT 
            1 as level,
            im.movement_id,
            im.movement_date,
            im.movement_type,
            im.movement_direction,
            im.quantity,
            im.reference_type,
            im.reference_number,
            CASE 
                WHEN im.party_id IS NOT NULL AND im.movement_type = 'purchase' 
                    THEN s.supplier_name
                ELSE NULL
            END as party_name,
            sl.location_name,
            u.full_name as user_name,
            im.reason as notes
        FROM inventory.inventory_movements im
        LEFT JOIN parties.suppliers s ON im.party_id = s.supplier_id
        LEFT JOIN inventory.storage_locations sl ON im.location_id = sl.location_id
        LEFT JOIN master.org_users u ON im.created_by = u.user_id
        WHERE im.batch_id = p_batch_id
        AND im.movement_direction = 'in'
        AND im.movement_type IN ('purchase', 'production', 'opening_stock')
        ORDER BY im.movement_date
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 6. EXPIRY MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_expiring_stock(
    p_org_id INTEGER,
    p_days_before_expiry INTEGER DEFAULT 90,
    p_action TEXT DEFAULT 'report' -- report, quarantine, alert
) RETURNS TABLE (
    batch_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    batch_number TEXT,
    expiry_date DATE,
    days_to_expiry INTEGER,
    quantity_available NUMERIC,
    stock_value NUMERIC,
    locations TEXT[],
    suggested_action TEXT,
    action_taken TEXT
) AS $$
DECLARE
    v_batch RECORD;
    v_action_taken TEXT;
BEGIN
    FOR v_batch IN
        SELECT 
            b.batch_id,
            b.product_id,
            p.product_name,
            b.batch_number,
            b.expiry_date,
            (b.expiry_date - CURRENT_DATE)::INTEGER as days_remaining,
            SUM(lws.quantity_available) as total_quantity,
            SUM(lws.quantity_available * b.cost_per_unit) as total_value,
            ARRAY_AGG(DISTINCT sl.location_name) as location_names
        FROM inventory.batches b
        JOIN inventory.products p ON b.product_id = p.product_id
        JOIN inventory.location_wise_stock lws ON b.batch_id = lws.batch_id
        JOIN inventory.storage_locations sl ON lws.location_id = sl.location_id
        WHERE b.org_id = p_org_id
        AND b.batch_status = 'active'
        AND b.expiry_date <= CURRENT_DATE + (p_days_before_expiry || ' days')::INTERVAL
        AND lws.quantity_available > 0
        GROUP BY b.batch_id, b.product_id, p.product_name, b.batch_number, b.expiry_date
    LOOP
        -- Determine suggested action
        v_batch.suggested_action := CASE
            WHEN v_batch.days_remaining <= 0 THEN 'destroy'
            WHEN v_batch.days_remaining <= 30 THEN 'immediate_clearance'
            WHEN v_batch.days_remaining <= 60 THEN 'promotional_sale'
            ELSE 'monitor'
        END;
        
        -- Take action if requested
        IF p_action != 'report' THEN
            IF p_action = 'quarantine' AND v_batch.days_remaining <= 30 THEN
                -- Move to quarantine
                UPDATE inventory.location_wise_stock
                SET 
                    stock_status = 'quarantine',
                    quantity_quarantine = quantity_available,
                    quantity_available = 0,
                    quarantine_reason = 'Near expiry - ' || v_batch.days_remaining || ' days',
                    last_updated = CURRENT_TIMESTAMP
                WHERE batch_id = v_batch.batch_id;
                
                v_action_taken := 'moved_to_quarantine';
                
            ELSIF p_action = 'alert' THEN
                -- Create alert
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
                    p_org_id,
                    CASE 
                        WHEN v_batch.days_remaining <= 0 THEN 'error'
                        WHEN v_batch.days_remaining <= 30 THEN 'warning'
                        ELSE 'info'
                    END,
                    'inventory',
                    CASE 
                        WHEN v_batch.days_remaining <= 0 THEN 'Batch Expired'
                        ELSE 'Batch Expiring Soon'
                    END,
                    format('%s (Batch: %s) expires in %s days. Quantity: %s worth ₹%s',
                        v_batch.product_name,
                        v_batch.batch_number,
                        v_batch.days_remaining,
                        v_batch.total_quantity,
                        TO_CHAR(v_batch.total_value, 'FM99,99,999')),
                    CASE 
                        WHEN v_batch.days_remaining <= 0 THEN 'critical'
                        WHEN v_batch.days_remaining <= 30 THEN 'urgent'
                        ELSE 'high'
                    END,
                    jsonb_build_object(
                        'batch_id', v_batch.batch_id,
                        'product_id', v_batch.product_id,
                        'days_to_expiry', v_batch.days_remaining,
                        'quantity', v_batch.total_quantity,
                        'value', v_batch.total_value
                    )
                WHERE NOT EXISTS (
                    SELECT 1 FROM system_config.system_notifications
                    WHERE org_id = p_org_id
                    AND notification_data->>'batch_id' = v_batch.batch_id::TEXT
                    AND created_at > CURRENT_DATE - INTERVAL '7 days'
                );
                
                v_action_taken := 'alert_created';
            END IF;
        ELSE
            v_action_taken := 'none';
        END IF;
        
        batch_id := v_batch.batch_id;
        product_id := v_batch.product_id;
        product_name := v_batch.product_name;
        batch_number := v_batch.batch_number;
        expiry_date := v_batch.expiry_date;
        days_to_expiry := v_batch.days_remaining;
        quantity_available := v_batch.total_quantity;
        stock_value := v_batch.total_value;
        locations := v_batch.location_names;
        suggested_action := v_batch.suggested_action;
        action_taken := v_action_taken;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 7. ABC ANALYSIS
-- =============================================
CREATE OR REPLACE FUNCTION perform_abc_analysis(
    p_org_id INTEGER,
    p_analysis_period_days INTEGER DEFAULT 365,
    p_a_percentage NUMERIC DEFAULT 70,
    p_b_percentage NUMERIC DEFAULT 20
) RETURNS TABLE (
    product_id INTEGER,
    product_name TEXT,
    product_code TEXT,
    annual_consumption_value NUMERIC,
    consumption_percentage NUMERIC,
    cumulative_percentage NUMERIC,
    abc_category CHAR(1),
    current_stock_value NUMERIC,
    stock_months NUMERIC,
    optimization_suggestion TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH consumption_data AS (
        SELECT 
            p.product_id,
            p.product_name,
            p.product_code,
            COALESCE(SUM(im.base_quantity * im.unit_cost), 0) as consumption_value
        FROM inventory.products p
        LEFT JOIN inventory.inventory_movements im ON p.product_id = im.product_id
            AND im.movement_type = 'sale'
            AND im.movement_direction = 'out'
            AND im.movement_date >= CURRENT_DATE - (p_analysis_period_days || ' days')::INTERVAL
        WHERE p.org_id = p_org_id
        AND p.is_active = TRUE
        GROUP BY p.product_id, p.product_name, p.product_code
    ),
    ranked_products AS (
        SELECT 
            *,
            consumption_value * (365.0 / p_analysis_period_days) as annual_value,
            consumption_value / NULLIF(SUM(consumption_value) OVER (), 0) * 100 as pct,
            SUM(consumption_value) OVER (ORDER BY consumption_value DESC) / 
                NULLIF(SUM(consumption_value) OVER (), 0) * 100 as cum_pct
        FROM consumption_data
    ),
    categorized AS (
        SELECT 
            *,
            CASE 
                WHEN cum_pct <= p_a_percentage THEN 'A'
                WHEN cum_pct <= p_a_percentage + p_b_percentage THEN 'B'
                ELSE 'C'
            END as category
        FROM ranked_products
    ),
    current_stock AS (
        SELECT 
            p.product_id,
            SUM(lws.quantity_available * b.cost_per_unit) as stock_value,
            SUM(lws.quantity_available) as stock_quantity
        FROM inventory.products p
        LEFT JOIN inventory.batches b ON p.product_id = b.product_id
        LEFT JOIN inventory.location_wise_stock lws ON b.batch_id = lws.batch_id
        WHERE p.org_id = p_org_id
        GROUP BY p.product_id
    )
    SELECT 
        c.product_id,
        c.product_name,
        c.product_code,
        c.annual_value as annual_consumption_value,
        c.pct as consumption_percentage,
        c.cum_pct as cumulative_percentage,
        c.category as abc_category,
        COALESCE(cs.stock_value, 0) as current_stock_value,
        CASE 
            WHEN c.annual_value > 0 
            THEN (COALESCE(cs.stock_value, 0) / (c.annual_value / 12))
            ELSE NULL
        END as stock_months,
        CASE c.category
            WHEN 'A' THEN 
                CASE 
                    WHEN COALESCE(cs.stock_value, 0) / NULLIF(c.annual_value / 12, 0) > 2 
                    THEN 'Reduce stock - High value item with excess inventory'
                    ELSE 'Maintain tight control - High value item'
                END
            WHEN 'B' THEN 'Moderate control - Balance stock levels'
            ELSE 
                CASE 
                    WHEN c.annual_value = 0 
                    THEN 'Consider discontinuation - No movement'
                    ELSE 'Relaxed control - Low value item'
                END
        END as optimization_suggestion
    FROM categorized c
    LEFT JOIN current_stock cs ON c.product_id = cs.product_id
    ORDER BY c.annual_value DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Check stock availability
CREATE OR REPLACE FUNCTION check_stock_availability(
    p_product_id INTEGER,
    p_required_quantity NUMERIC,
    p_location_id INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_available_qty NUMERIC;
    v_reserved_qty NUMERIC;
    v_locations JSONB;
BEGIN
    -- Get total available quantity
    SELECT 
        COALESCE(SUM(lws.quantity_available), 0),
        COALESCE(SUM(lws.quantity_reserved), 0),
        jsonb_agg(
            jsonb_build_object(
                'location_id', lws.location_id,
                'location_name', sl.location_name,
                'available', lws.quantity_available,
                'reserved', COALESCE(lws.quantity_reserved, 0)
            )
        )
    INTO v_available_qty, v_reserved_qty, v_locations
    FROM inventory.location_wise_stock lws
    JOIN inventory.storage_locations sl ON lws.location_id = sl.location_id
    WHERE lws.product_id = p_product_id
    AND (p_location_id IS NULL OR lws.location_id = p_location_id)
    AND lws.stock_status = 'available'
    GROUP BY lws.product_id;
    
    RETURN jsonb_build_object(
        'is_available', (v_available_qty - v_reserved_qty) >= p_required_quantity,
        'available_quantity', v_available_qty,
        'reserved_quantity', v_reserved_qty,
        'net_available', v_available_qty - v_reserved_qty,
        'required_quantity', p_required_quantity,
        'shortage', GREATEST(0, p_required_quantity - (v_available_qty - v_reserved_qty)),
        'locations', COALESCE(v_locations, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql;

-- Get product movement history
CREATE OR REPLACE FUNCTION get_product_movement_history(
    p_product_id INTEGER,
    p_days_back INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 100
) RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'movement_date', movement_date,
                'movement_type', movement_type,
                'direction', movement_direction,
                'quantity', quantity,
                'batch_number', b.batch_number,
                'reference_type', reference_type,
                'reference_number', reference_number,
                'location', sl.location_name,
                'created_by', u.full_name
            ) ORDER BY movement_date DESC, movement_id DESC
        )
        FROM inventory.inventory_movements im
        LEFT JOIN inventory.batches b ON im.batch_id = b.batch_id
        LEFT JOIN inventory.storage_locations sl ON im.location_id = sl.location_id
        LEFT JOIN master.org_users u ON im.created_by = u.user_id
        WHERE im.product_id = p_product_id
        AND im.movement_date >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL
        LIMIT p_limit
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- INDEXES FOR FUNCTIONS
-- =============================================
CREATE INDEX IF NOT EXISTS idx_movements_product_date ON inventory.inventory_movements(product_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_location_stock_available ON inventory.location_wise_stock(product_id, location_id) 
    WHERE quantity_available > 0;
CREATE INDEX IF NOT EXISTS idx_batches_expiry_active ON inventory.batches(expiry_date, batch_status) 
    WHERE batch_status = 'active';

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON FUNCTION allocate_stock_intelligent IS 'Intelligent stock allocation with FEFO/FIFO/LIFO support';
COMMENT ON FUNCTION calculate_stock_valuation IS 'Calculate inventory valuation using various methods';
COMMENT ON FUNCTION calculate_reorder_points IS 'Statistical reorder point calculation with safety stock';
COMMENT ON FUNCTION analyze_stock_movements IS 'Detailed stock movement analysis with turnover';
COMMENT ON FUNCTION trace_batch_movement IS 'Complete batch traceability - forward and backward';
COMMENT ON FUNCTION manage_expiring_stock IS 'Proactive expiry management with actions';
COMMENT ON FUNCTION perform_abc_analysis IS 'ABC analysis for inventory optimization';