-- =============================================
-- INVENTORY MODULE APIS
-- =============================================
-- Global API functions for inventory management
-- =============================================

-- =============================================
-- STOCK AVAILABILITY API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_stock_availability(
    p_product_id INTEGER DEFAULT NULL,
    p_branch_id INTEGER DEFAULT NULL,
    p_location_id INTEGER DEFAULT NULL,
    p_include_reserved BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'stock_summary', jsonb_build_object(
            'total_available', SUM(ls.quantity_available),
            'total_reserved', SUM(ls.quantity_reserved),
            'total_quarantine', SUM(ls.quantity_quarantine),
            'net_available', SUM(ls.quantity_available - CASE WHEN p_include_reserved THEN 0 ELSE ls.quantity_reserved END)
        ),
        'location_details', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'product_id', ls.product_id,
                    'product_name', p.product_name,
                    'product_code', p.product_code,
                    'location_id', ls.location_id,
                    'location_name', sl.location_name,
                    'branch_name', b.branch_name,
                    'quantity_available', ls.quantity_available,
                    'quantity_reserved', ls.quantity_reserved,
                    'quantity_quarantine', ls.quantity_quarantine,
                    'batch_details', batch_info.batches
                ) ORDER BY b.branch_name, sl.location_name
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM inventory.location_wise_stock ls
    JOIN inventory.products p ON ls.product_id = p.product_id
    JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
    JOIN master.branches b ON sl.branch_id = b.branch_id
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'batch_id', bat.batch_id,
                'batch_number', bat.batch_number,
                'expiry_date', bat.expiry_date,
                'quantity', bat.quantity_available,
                'days_to_expiry', bat.expiry_date - CURRENT_DATE
            ) ORDER BY bat.expiry_date
        ) as batches
        FROM inventory.batches bat
        WHERE bat.product_id = ls.product_id
        AND bat.batch_id = ls.batch_id
        AND bat.batch_status = 'active'
    ) batch_info ON true
    WHERE ls.stock_status = 'available'
    AND (p_product_id IS NULL OR ls.product_id = p_product_id)
    AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id)
    AND (p_location_id IS NULL OR ls.location_id = p_location_id)
    AND p.is_active = TRUE
    GROUP BY ls.product_id, p.product_name, p.product_code, ls.location_id, 
             sl.location_name, b.branch_name, batch_info.batches;
    
    RETURN COALESCE(v_result, jsonb_build_object('stock_summary', '{}', 'location_details', '[]'));
END;
$$;

-- =============================================
-- BATCH INFORMATION API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_batch_information(
    p_batch_id INTEGER DEFAULT NULL,
    p_product_id INTEGER DEFAULT NULL,
    p_expiry_days INTEGER DEFAULT NULL,
    p_include_expired BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'batches', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'batch_id', b.batch_id,
                    'batch_number', b.batch_number,
                    'product_id', b.product_id,
                    'product_name', p.product_name,
                    'manufacturing_date', b.manufacturing_date,
                    'expiry_date', b.expiry_date,
                    'days_to_expiry', b.expiry_date - CURRENT_DATE,
                    'supplier_name', s.supplier_name,
                    'quantity_received', b.quantity_received,
                    'quantity_available', b.quantity_available,
                    'quantity_allocated', b.quantity_allocated,
                    'quantity_sold', b.quantity_sold,
                    'mrp_per_unit', b.mrp_per_unit,
                    'sale_price_per_unit', b.sale_price_per_unit,
                    'batch_status', b.batch_status,
                    'is_narcotic', p.is_narcotic,
                    'narcotic_balance', b.narcotic_balance,
                    'location_distribution', loc_dist.locations
                ) ORDER BY b.expiry_date, b.batch_number
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM inventory.batches b
    JOIN inventory.products p ON b.product_id = p.product_id
    LEFT JOIN parties.suppliers s ON b.supplier_id = s.supplier_id
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'location_id', ls.location_id,
                'location_name', sl.location_name,
                'branch_name', br.branch_name,
                'quantity', ls.quantity_available
            ) ORDER BY br.branch_name
        ) as locations
        FROM inventory.location_wise_stock ls
        JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
        JOIN master.branches br ON sl.branch_id = br.branch_id
        WHERE ls.batch_id = b.batch_id
        AND ls.quantity_available > 0
    ) loc_dist ON true
    WHERE (p_batch_id IS NULL OR b.batch_id = p_batch_id)
    AND (p_product_id IS NULL OR b.product_id = p_product_id)
    AND (p_expiry_days IS NULL OR b.expiry_date <= CURRENT_DATE + p_expiry_days * INTERVAL '1 day')
    AND (p_include_expired OR b.expiry_date > CURRENT_DATE)
    AND b.batch_status != 'expired';
    
    RETURN v_result;
END;
$$;

-- =============================================
-- INVENTORY MOVEMENT API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_inventory_movements(
    p_product_id INTEGER DEFAULT NULL,
    p_batch_id INTEGER DEFAULT NULL,
    p_location_id INTEGER DEFAULT NULL,
    p_movement_type TEXT DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_to_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'movements', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'movement_id', im.movement_id,
                    'movement_date', im.movement_date,
                    'movement_type', im.movement_type,
                    'product_name', p.product_name,
                    'batch_number', b.batch_number,
                    'location_name', sl.location_name,
                    'quantity', im.quantity,
                    'unit_cost', im.unit_cost,
                    'total_value', im.quantity * im.unit_cost,
                    'reference_type', im.reference_type,
                    'reference_number', CASE 
                        WHEN im.reference_type = 'invoice' THEN inv.invoice_number
                        WHEN im.reference_type = 'grn' THEN grn.grn_number
                        WHEN im.reference_type = 'adjustment' THEN adj.adjustment_number
                        ELSE im.reference_id::TEXT
                    END,
                    'narration', im.narration,
                    'created_by', u.full_name
                ) ORDER BY im.movement_date DESC, im.movement_id DESC
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM inventory.inventory_movements im
    JOIN inventory.products p ON im.product_id = p.product_id
    LEFT JOIN inventory.batches b ON im.batch_id = b.batch_id
    LEFT JOIN inventory.storage_locations sl ON im.location_id = sl.location_id
    LEFT JOIN sales.invoices inv ON im.reference_type = 'invoice' AND im.reference_id = inv.invoice_id
    LEFT JOIN procurement.goods_receipt_notes grn ON im.reference_type = 'grn' AND im.reference_id = grn.grn_id
    LEFT JOIN inventory.stock_adjustments adj ON im.reference_type = 'adjustment' AND im.reference_id = adj.adjustment_id
    LEFT JOIN system_config.users u ON im.created_by = u.user_id
    WHERE (p_product_id IS NULL OR im.product_id = p_product_id)
    AND (p_batch_id IS NULL OR im.batch_id = p_batch_id)
    AND (p_location_id IS NULL OR im.location_id = p_location_id)
    AND (p_movement_type IS NULL OR im.movement_type = p_movement_type)
    AND im.movement_date BETWEEN p_from_date AND p_to_date
    LIMIT p_limit;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- REORDER ALERT API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_reorder_alerts(
    p_branch_id INTEGER DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH stock_levels AS (
        SELECT 
            p.product_id,
            p.product_name,
            p.product_code,
            p.reorder_level,
            p.reorder_quantity,
            p.lead_time_days,
            pc.category_name,
            SUM(ls.quantity_available) as current_stock,
            SUM(ls.quantity_reserved) as reserved_stock,
            SUM(ls.quantity_available - ls.quantity_reserved) as available_stock
        FROM inventory.products p
        JOIN master.product_categories pc ON p.category_id = pc.category_id
        LEFT JOIN inventory.location_wise_stock ls ON p.product_id = ls.product_id
        LEFT JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
        WHERE p.is_active = TRUE
        AND p.reorder_level IS NOT NULL
        AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        GROUP BY p.product_id, pc.category_name
    ),
    consumption_rates AS (
        SELECT 
            im.product_id,
            AVG(daily_consumption) as avg_daily_consumption
        FROM (
            SELECT 
                product_id,
                movement_date,
                SUM(CASE WHEN movement_type = 'sale' THEN quantity ELSE 0 END) as daily_consumption
            FROM inventory.inventory_movements
            WHERE movement_type = 'sale'
            AND movement_date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY product_id, movement_date
        ) im
        GROUP BY im.product_id
    )
    SELECT jsonb_build_object(
        'reorder_alerts', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'product_id', sl.product_id,
                    'product_name', sl.product_name,
                    'product_code', sl.product_code,
                    'category', sl.category_name,
                    'current_stock', sl.current_stock,
                    'available_stock', sl.available_stock,
                    'reorder_level', sl.reorder_level,
                    'reorder_quantity', sl.reorder_quantity,
                    'lead_time_days', sl.lead_time_days,
                    'avg_daily_consumption', COALESCE(cr.avg_daily_consumption, 0),
                    'days_of_stock', CASE 
                        WHEN COALESCE(cr.avg_daily_consumption, 0) > 0 
                        THEN sl.available_stock / cr.avg_daily_consumption
                        ELSE NULL 
                    END,
                    'urgency', CASE
                        WHEN sl.available_stock <= sl.reorder_level * 0.5 THEN 'critical'
                        WHEN sl.available_stock <= sl.reorder_level THEN 'high'
                        WHEN sl.available_stock <= sl.reorder_level * 1.5 THEN 'medium'
                        ELSE 'low'
                    END
                ) ORDER BY 
                    CASE
                        WHEN sl.available_stock <= sl.reorder_level * 0.5 THEN 1
                        WHEN sl.available_stock <= sl.reorder_level THEN 2
                        WHEN sl.available_stock <= sl.reorder_level * 1.5 THEN 3
                        ELSE 4
                    END,
                    sl.product_name
            ) FILTER (WHERE sl.available_stock <= sl.reorder_level * 1.5), 
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'critical_count', COUNT(*) FILTER (WHERE sl.available_stock <= sl.reorder_level * 0.5),
            'high_count', COUNT(*) FILTER (WHERE sl.available_stock <= sl.reorder_level AND sl.available_stock > sl.reorder_level * 0.5),
            'medium_count', COUNT(*) FILTER (WHERE sl.available_stock <= sl.reorder_level * 1.5 AND sl.available_stock > sl.reorder_level)
        )
    ) INTO v_result
    FROM stock_levels sl
    LEFT JOIN consumption_rates cr ON sl.product_id = cr.product_id;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- EXPIRY ALERT API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_expiry_alerts(
    p_days_ahead INTEGER DEFAULT 90,
    p_branch_id INTEGER DEFAULT NULL,
    p_include_expired BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'expiry_alerts', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'batch_id', b.batch_id,
                    'batch_number', b.batch_number,
                    'product_id', b.product_id,
                    'product_name', p.product_name,
                    'product_code', p.product_code,
                    'expiry_date', b.expiry_date,
                    'days_to_expiry', b.expiry_date - CURRENT_DATE,
                    'quantity_available', b.quantity_available,
                    'mrp_per_unit', b.mrp_per_unit,
                    'stock_value', b.quantity_available * b.mrp_per_unit,
                    'locations', loc_info.locations,
                    'status', CASE
                        WHEN b.expiry_date < CURRENT_DATE THEN 'expired'
                        WHEN b.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
                        WHEN b.expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'warning'
                        ELSE 'approaching'
                    END
                ) ORDER BY b.expiry_date, p.product_name
            ), 
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'expired_count', COUNT(*) FILTER (WHERE b.expiry_date < CURRENT_DATE),
            'critical_count', COUNT(*) FILTER (WHERE b.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'),
            'warning_count', COUNT(*) FILTER (WHERE b.expiry_date BETWEEN CURRENT_DATE + INTERVAL '31 days' AND CURRENT_DATE + INTERVAL '60 days'),
            'approaching_count', COUNT(*) FILTER (WHERE b.expiry_date BETWEEN CURRENT_DATE + INTERVAL '61 days' AND CURRENT_DATE + p_days_ahead * INTERVAL '1 day'),
            'total_value_at_risk', SUM(b.quantity_available * b.mrp_per_unit) FILTER (WHERE b.expiry_date <= CURRENT_DATE + p_days_ahead * INTERVAL '1 day')
        )
    ) INTO v_result
    FROM inventory.batches b
    JOIN inventory.products p ON b.product_id = p.product_id
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'branch_name', br.branch_name,
                'location_name', sl.location_name,
                'quantity', ls.quantity_available
            )
        ) as locations
        FROM inventory.location_wise_stock ls
        JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
        JOIN master.branches br ON sl.branch_id = br.branch_id
        WHERE ls.batch_id = b.batch_id
        AND ls.quantity_available > 0
        AND (p_branch_id IS NULL OR br.branch_id = p_branch_id)
    ) loc_info ON true
    WHERE b.batch_status = 'active'
    AND b.quantity_available > 0
    AND ((p_include_expired AND b.expiry_date <= CURRENT_DATE + p_days_ahead * INTERVAL '1 day') 
         OR (NOT p_include_expired AND b.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead * INTERVAL '1 day'));
    
    RETURN v_result;
END;
$$;

-- =============================================
-- STOCK VALUATION API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_stock_valuation(
    p_branch_id INTEGER DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL,
    p_valuation_method TEXT DEFAULT 'weighted_average' -- 'fifo', 'weighted_average', 'mrp'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH stock_valuation AS (
        SELECT 
            p.product_id,
            p.product_name,
            p.product_code,
            pc.category_name,
            b.branch_name,
            SUM(ls.quantity_available) as total_quantity,
            CASE p_valuation_method
                WHEN 'mrp' THEN AVG(bat.mrp_per_unit)
                WHEN 'fifo' THEN MIN(bat.cost_per_unit)
                ELSE SUM(ls.quantity_available * bat.cost_per_unit) / NULLIF(SUM(ls.quantity_available), 0)
            END as unit_value,
            SUM(ls.quantity_available * 
                CASE p_valuation_method
                    WHEN 'mrp' THEN bat.mrp_per_unit
                    ELSE bat.cost_per_unit
                END
            ) as total_value
        FROM inventory.location_wise_stock ls
        JOIN inventory.products p ON ls.product_id = p.product_id
        JOIN master.product_categories pc ON p.category_id = pc.category_id
        JOIN inventory.batches bat ON ls.batch_id = bat.batch_id
        JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
        JOIN master.branches b ON sl.branch_id = b.branch_id
        WHERE ls.quantity_available > 0
        AND ls.stock_status = 'available'
        AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        GROUP BY p.product_id, p.product_name, p.product_code, pc.category_name, b.branch_name
    )
    SELECT jsonb_build_object(
        'valuation_method', p_valuation_method,
        'valuation_date', CURRENT_DATE,
        'stock_valuation', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'product_id', sv.product_id,
                    'product_name', sv.product_name,
                    'product_code', sv.product_code,
                    'category', sv.category_name,
                    'branch', sv.branch_name,
                    'quantity', sv.total_quantity,
                    'unit_value', ROUND(sv.unit_value, 2),
                    'total_value', ROUND(sv.total_value, 2)
                ) ORDER BY sv.total_value DESC
            ), 
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'total_products', COUNT(DISTINCT sv.product_id),
            'total_quantity', SUM(sv.total_quantity),
            'total_value', ROUND(SUM(sv.total_value), 2),
            'by_category', (
                SELECT jsonb_object_agg(
                    category_name,
                    jsonb_build_object(
                        'quantity', total_qty,
                        'value', ROUND(total_val, 2)
                    )
                )
                FROM (
                    SELECT 
                        category_name,
                        SUM(total_quantity) as total_qty,
                        SUM(total_value) as total_val
                    FROM stock_valuation
                    GROUP BY category_name
                ) cat_summary
            )
        )
    ) INTO v_result
    FROM stock_valuation sv;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.get_stock_availability TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_batch_information TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_inventory_movements TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_reorder_alerts TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_expiry_alerts TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_stock_valuation TO authenticated_user;

COMMENT ON FUNCTION api.get_stock_availability IS 'Get real-time stock availability across locations';
COMMENT ON FUNCTION api.get_batch_information IS 'Get batch details with expiry and location info';
COMMENT ON FUNCTION api.get_inventory_movements IS 'Get inventory movement history with filters';
COMMENT ON FUNCTION api.get_reorder_alerts IS 'Get products requiring reorder with urgency levels';
COMMENT ON FUNCTION api.get_expiry_alerts IS 'Get batches approaching expiry with risk assessment';
COMMENT ON FUNCTION api.get_stock_valuation IS 'Get stock valuation using different methods';