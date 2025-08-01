-- =============================================
-- ANALYTICS & REPORTING MODULE APIS
-- =============================================
-- Global API functions for analytics and reporting
-- =============================================

-- =============================================
-- EXECUTIVE DASHBOARD API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_executive_dashboard(
    p_org_id INTEGER,
    p_date_range TEXT DEFAULT 'current_month', -- 'today', 'current_week', 'current_month', 'current_quarter', 'current_year'
    p_comparison BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_from_date DATE;
    v_to_date DATE;
    v_prev_from_date DATE;
    v_prev_to_date DATE;
BEGIN
    -- Determine date ranges
    CASE p_date_range
        WHEN 'today' THEN
            v_from_date := CURRENT_DATE;
            v_to_date := CURRENT_DATE;
            v_prev_from_date := CURRENT_DATE - 1;
            v_prev_to_date := CURRENT_DATE - 1;
        WHEN 'current_week' THEN
            v_from_date := DATE_TRUNC('week', CURRENT_DATE);
            v_to_date := CURRENT_DATE;
            v_prev_from_date := DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week');
            v_prev_to_date := CURRENT_DATE - INTERVAL '1 week';
        WHEN 'current_month' THEN
            v_from_date := DATE_TRUNC('month', CURRENT_DATE);
            v_to_date := CURRENT_DATE;
            v_prev_from_date := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
            v_prev_to_date := CURRENT_DATE - INTERVAL '1 month';
        WHEN 'current_quarter' THEN
            v_from_date := DATE_TRUNC('quarter', CURRENT_DATE);
            v_to_date := CURRENT_DATE;
            v_prev_from_date := DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months');
            v_prev_to_date := CURRENT_DATE - INTERVAL '3 months';
        WHEN 'current_year' THEN
            v_from_date := DATE_TRUNC('year', CURRENT_DATE);
            v_to_date := CURRENT_DATE;
            v_prev_from_date := DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year');
            v_prev_to_date := CURRENT_DATE - INTERVAL '1 year';
        ELSE
            v_from_date := DATE_TRUNC('month', CURRENT_DATE);
            v_to_date := CURRENT_DATE;
    END CASE;
    
    WITH current_metrics AS (
        SELECT 
            -- Sales metrics
            COUNT(DISTINCT i.invoice_id) FILTER (WHERE i.invoice_date BETWEEN v_from_date AND v_to_date) as total_invoices,
            SUM(i.total_amount) FILTER (WHERE i.invoice_date BETWEEN v_from_date AND v_to_date) as total_sales,
            AVG(i.total_amount) FILTER (WHERE i.invoice_date BETWEEN v_from_date AND v_to_date) as avg_invoice_value,
            COUNT(DISTINCT i.customer_id) FILTER (WHERE i.invoice_date BETWEEN v_from_date AND v_to_date) as active_customers,
            
            -- Purchase metrics
            COUNT(DISTINCT po.po_id) FILTER (WHERE po.po_date BETWEEN v_from_date AND v_to_date) as total_purchases,
            SUM(po.total_amount) FILTER (WHERE po.po_date BETWEEN v_from_date AND v_to_date) as purchase_value,
            
            -- Inventory metrics
            (SELECT COUNT(*) FROM inventory.products WHERE is_active = TRUE) as total_products,
            (SELECT COUNT(*) FROM inventory.batches WHERE batch_status = 'active' AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90) as expiring_batches,
            
            -- Financial metrics
            SUM(i.total_amount - i.paid_amount) FILTER (WHERE i.invoice_status = 'posted' AND i.payment_status != 'paid') as total_receivables,
            (SELECT SUM(si.total_amount - si.paid_amount) FROM procurement.supplier_invoices si WHERE si.invoice_status = 'posted' AND si.payment_status != 'paid') as total_payables
            
        FROM sales.invoices i
        CROSS JOIN procurement.purchase_orders po
        WHERE i.org_id = p_org_id
        AND po.org_id = p_org_id
    ),
    previous_metrics AS (
        SELECT 
            COUNT(DISTINCT i.invoice_id) FILTER (WHERE i.invoice_date BETWEEN v_prev_from_date AND v_prev_to_date) as prev_invoices,
            SUM(i.total_amount) FILTER (WHERE i.invoice_date BETWEEN v_prev_from_date AND v_prev_to_date) as prev_sales,
            COUNT(DISTINCT po.po_id) FILTER (WHERE po.po_date BETWEEN v_prev_from_date AND v_prev_to_date) as prev_purchases,
            SUM(po.total_amount) FILTER (WHERE po.po_date BETWEEN v_prev_from_date AND v_prev_to_date) as prev_purchase_value
        FROM sales.invoices i
        CROSS JOIN procurement.purchase_orders po
        WHERE i.org_id = p_org_id
        AND po.org_id = p_org_id
        AND p_comparison = TRUE
    ),
    top_selling_products AS (
        SELECT 
            p.product_name,
            p.product_code,
            SUM(ii.quantity) as quantity_sold,
            SUM(ii.line_total) as revenue
        FROM sales.invoice_items ii
        JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN v_from_date AND v_to_date
        AND i.invoice_status = 'posted'
        GROUP BY p.product_id, p.product_name, p.product_code
        ORDER BY revenue DESC
        LIMIT 5
    ),
    branch_performance AS (
        SELECT 
            b.branch_name,
            COUNT(DISTINCT i.invoice_id) as invoices,
            SUM(i.total_amount) as sales,
            COUNT(DISTINCT i.customer_id) as customers
        FROM master.branches b
        LEFT JOIN sales.invoices i ON b.branch_id = i.branch_id
            AND i.invoice_date BETWEEN v_from_date AND v_to_date
            AND i.invoice_status = 'posted'
        WHERE b.org_id = p_org_id
        AND b.is_active = TRUE
        GROUP BY b.branch_id, b.branch_name
        ORDER BY sales DESC NULLS LAST
    )
    SELECT jsonb_build_object(
        'period', jsonb_build_object(
            'range', p_date_range,
            'from_date', v_from_date,
            'to_date', v_to_date,
            'days', v_to_date - v_from_date + 1
        ),
        'key_metrics', jsonb_build_object(
            'sales', jsonb_build_object(
                'total_revenue', COALESCE(cm.total_sales, 0),
                'invoice_count', COALESCE(cm.total_invoices, 0),
                'avg_invoice_value', ROUND(COALESCE(cm.avg_invoice_value, 0), 2),
                'active_customers', COALESCE(cm.active_customers, 0),
                'growth', CASE 
                    WHEN p_comparison AND pm.prev_sales > 0 
                    THEN ROUND(((cm.total_sales - pm.prev_sales) / pm.prev_sales) * 100, 2)
                    ELSE NULL
                END
            ),
            'purchases', jsonb_build_object(
                'total_value', COALESCE(cm.purchase_value, 0),
                'order_count', COALESCE(cm.total_purchases, 0),
                'growth', CASE 
                    WHEN p_comparison AND pm.prev_purchase_value > 0 
                    THEN ROUND(((cm.purchase_value - pm.prev_purchase_value) / pm.prev_purchase_value) * 100, 2)
                    ELSE NULL
                END
            ),
            'inventory', jsonb_build_object(
                'total_products', cm.total_products,
                'expiring_soon', cm.expiring_batches,
                'stock_value', (
                    SELECT ROUND(SUM(ls.quantity_available * b.cost_per_unit), 2)
                    FROM inventory.location_wise_stock ls
                    JOIN inventory.batches b ON ls.batch_id = b.batch_id
                    WHERE ls.stock_status = 'available'
                )
            ),
            'financials', jsonb_build_object(
                'receivables', ROUND(COALESCE(cm.total_receivables, 0), 2),
                'payables', ROUND(COALESCE(cm.total_payables, 0), 2),
                'cash_position', (
                    SELECT ROUND(SUM(
                        CASE 
                            WHEN account_id IN (1111, 1112) 
                            THEN debit_amount - credit_amount 
                            ELSE 0 
                        END
                    ), 2)
                    FROM financial.journal_entry_lines jel
                    JOIN financial.journal_entries je ON jel.entry_id = je.entry_id
                    WHERE je.posting_status = 'posted'
                    AND je.org_id = p_org_id
                )
            )
        ),
        'top_products', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'product_name', tsp.product_name,
                    'product_code', tsp.product_code,
                    'quantity', tsp.quantity_sold,
                    'revenue', ROUND(tsp.revenue, 2)
                ) ORDER BY tsp.revenue DESC
            ) FILTER (WHERE tsp.product_name IS NOT NULL),
            '[]'::jsonb
        ),
        'branch_performance', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'branch', bp.branch_name,
                    'sales', ROUND(COALESCE(bp.sales, 0), 2),
                    'invoices', COALESCE(bp.invoices, 0),
                    'customers', COALESCE(bp.customers, 0)
                ) ORDER BY bp.sales DESC NULLS LAST
            ) FILTER (WHERE bp.branch_name IS NOT NULL),
            '[]'::jsonb
        ),
        'alerts', jsonb_build_object(
            'low_stock_products', (
                SELECT COUNT(*)
                FROM inventory.products p
                LEFT JOIN inventory.location_wise_stock ls ON p.product_id = ls.product_id
                WHERE p.is_active = TRUE
                AND p.reorder_level IS NOT NULL
                GROUP BY p.product_id
                HAVING SUM(COALESCE(ls.quantity_available, 0)) <= p.reorder_level
            ),
            'pending_orders', (
                SELECT COUNT(*)
                FROM sales.orders
                WHERE org_id = p_org_id
                AND order_status = 'confirmed'
                AND fulfillment_status != 'fulfilled'
            ),
            'overdue_invoices', (
                SELECT COUNT(*)
                FROM sales.invoices
                WHERE org_id = p_org_id
                AND invoice_status = 'posted'
                AND payment_status != 'paid'
                AND due_date < CURRENT_DATE
            ),
            'expiring_licenses', (
                SELECT COUNT(*)
                FROM compliance.business_licenses
                WHERE org_id = p_org_id
                AND is_active = TRUE
                AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
            )
        )
    ) INTO v_result
    FROM current_metrics cm
    CROSS JOIN previous_metrics pm
    CROSS JOIN top_selling_products tsp
    CROSS JOIN branch_performance bp
    LIMIT 1;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- SALES ANALYTICS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_sales_analytics(
    p_org_id INTEGER,
    p_from_date DATE,
    p_to_date DATE,
    p_group_by TEXT DEFAULT 'day', -- 'day', 'week', 'month', 'quarter'
    p_branch_id INTEGER DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_date_format TEXT;
BEGIN
    -- Determine date format based on grouping
    CASE p_group_by
        WHEN 'day' THEN v_date_format := 'YYYY-MM-DD';
        WHEN 'week' THEN v_date_format := 'IYYY-IW';
        WHEN 'month' THEN v_date_format := 'YYYY-MM';
        WHEN 'quarter' THEN v_date_format := 'YYYY-Q';
        ELSE v_date_format := 'YYYY-MM-DD';
    END CASE;
    
    WITH sales_data AS (
        SELECT 
            TO_CHAR(i.invoice_date, v_date_format) as period,
            COUNT(DISTINCT i.invoice_id) as invoice_count,
            COUNT(DISTINCT i.customer_id) as unique_customers,
            SUM(i.subtotal) as gross_sales,
            SUM(i.discount_amount) as total_discount,
            SUM(i.tax_amount) as total_tax,
            SUM(i.total_amount) as net_sales,
            SUM(ii.quantity) as total_quantity,
            COUNT(DISTINCT ii.product_id) as products_sold,
            AVG(i.total_amount) as avg_invoice_value
        FROM sales.invoices i
        JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
        LEFT JOIN inventory.products p ON ii.product_id = p.product_id
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        GROUP BY TO_CHAR(i.invoice_date, v_date_format)
    ),
    category_breakdown AS (
        SELECT 
            pc.category_name,
            SUM(ii.quantity) as quantity,
            SUM(ii.line_total) as revenue,
            COUNT(DISTINCT i.invoice_id) as transactions
        FROM sales.invoice_items ii
        JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        JOIN master.product_categories pc ON p.category_id = pc.category_id
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY pc.category_id, pc.category_name
        ORDER BY revenue DESC
    ),
    customer_segments AS (
        SELECT 
            CASE 
                WHEN COUNT(DISTINCT i.invoice_id) >= 10 THEN 'High Frequency'
                WHEN COUNT(DISTINCT i.invoice_id) >= 5 THEN 'Medium Frequency'
                ELSE 'Low Frequency'
            END as segment,
            COUNT(DISTINCT c.customer_id) as customer_count,
            SUM(i.total_amount) as segment_revenue,
            AVG(i.total_amount) as avg_transaction_value
        FROM parties.customers c
        JOIN sales.invoices i ON c.customer_id = i.customer_id
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY c.customer_id
    ),
    payment_analysis AS (
        SELECT 
            i.payment_terms,
            COUNT(DISTINCT i.invoice_id) as invoice_count,
            SUM(i.total_amount) as total_value,
            SUM(i.paid_amount) as paid_amount,
            AVG(
                CASE 
                    WHEN i.payment_status = 'paid' 
                    THEN EXTRACT(DAY FROM i.updated_at - i.invoice_date)
                    ELSE NULL
                END
            ) as avg_payment_days
        FROM sales.invoices i
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY i.payment_terms
    )
    SELECT jsonb_build_object(
        'period', jsonb_build_object(
            'from_date', p_from_date,
            'to_date', p_to_date,
            'group_by', p_group_by
        ),
        'trends', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'period', sd.period,
                    'invoice_count', sd.invoice_count,
                    'unique_customers', sd.unique_customers,
                    'gross_sales', ROUND(sd.gross_sales, 2),
                    'discounts', ROUND(sd.total_discount, 2),
                    'tax', ROUND(sd.total_tax, 2),
                    'net_sales', ROUND(sd.net_sales, 2),
                    'quantity', sd.total_quantity,
                    'avg_invoice_value', ROUND(sd.avg_invoice_value, 2)
                ) ORDER BY sd.period
            ) FILTER (WHERE sd.period IS NOT NULL),
            '[]'::jsonb
        ),
        'category_performance', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'category', cb.category_name,
                    'quantity', cb.quantity,
                    'revenue', ROUND(cb.revenue, 2),
                    'transactions', cb.transactions,
                    'revenue_share', ROUND(
                        (cb.revenue / NULLIF(SUM(cb.revenue) OVER(), 0)) * 100, 
                        2
                    )
                ) ORDER BY cb.revenue DESC
            ) FILTER (WHERE cb.category_name IS NOT NULL),
            '[]'::jsonb
        ),
        'customer_segments', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'segment', segment,
                    'customers', SUM(customer_count),
                    'revenue', ROUND(SUM(segment_revenue), 2),
                    'avg_value', ROUND(AVG(avg_transaction_value), 2)
                ) ORDER BY SUM(segment_revenue) DESC
            )
            FROM customer_segments
            GROUP BY segment
        ),
        'payment_analysis', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'payment_terms', pa.payment_terms,
                    'invoices', pa.invoice_count,
                    'total_value', ROUND(pa.total_value, 2),
                    'collected', ROUND(pa.paid_amount, 2),
                    'collection_rate', ROUND(
                        (pa.paid_amount / NULLIF(pa.total_value, 0)) * 100,
                        2
                    ),
                    'avg_payment_days', ROUND(pa.avg_payment_days, 1)
                ) ORDER BY pa.total_value DESC
            ) FILTER (WHERE pa.payment_terms IS NOT NULL),
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'total_revenue', (SELECT ROUND(SUM(net_sales), 2) FROM sales_data),
            'total_invoices', (SELECT SUM(invoice_count) FROM sales_data),
            'unique_customers', (SELECT COUNT(DISTINCT customer_id) FROM sales.invoices WHERE org_id = p_org_id AND invoice_date BETWEEN p_from_date AND p_to_date AND invoice_status = 'posted'),
            'avg_daily_sales', (SELECT ROUND(SUM(net_sales) / (p_to_date - p_from_date + 1), 2) FROM sales_data)
        )
    ) INTO v_result
    FROM sales_data sd
    FULL OUTER JOIN category_breakdown cb ON false
    FULL OUTER JOIN payment_analysis pa ON false
    LIMIT 1;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- INVENTORY ANALYTICS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_inventory_analytics(
    p_org_id INTEGER,
    p_analysis_type TEXT DEFAULT 'overview', -- 'overview', 'movement', 'aging', 'abc'
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
    CASE p_analysis_type
        WHEN 'overview' THEN
            WITH stock_overview AS (
                SELECT 
                    COUNT(DISTINCT p.product_id) as total_skus,
                    COUNT(DISTINCT CASE WHEN ls.quantity_available > 0 THEN p.product_id END) as in_stock_skus,
                    COUNT(DISTINCT CASE WHEN ls.quantity_available = 0 THEN p.product_id END) as out_of_stock_skus,
                    COUNT(DISTINCT CASE WHEN ls.quantity_available <= p.reorder_level THEN p.product_id END) as below_reorder_skus,
                    SUM(ls.quantity_available * b.cost_per_unit) as total_stock_value,
                    SUM(ls.quantity_available * b.mrp_per_unit) as total_mrp_value,
                    COUNT(DISTINCT b.batch_id) as total_batches,
                    COUNT(DISTINCT CASE WHEN b.expiry_date <= CURRENT_DATE + 90 THEN b.batch_id END) as expiring_batches
                FROM inventory.products p
                LEFT JOIN inventory.location_wise_stock ls ON p.product_id = ls.product_id
                LEFT JOIN inventory.batches b ON ls.batch_id = b.batch_id
                LEFT JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
                WHERE p.org_id = p_org_id
                AND p.is_active = TRUE
                AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id)
                AND (p_category_id IS NULL OR p.category_id = p_category_id)
            ),
            location_distribution AS (
                SELECT 
                    sl.location_name,
                    b.branch_name,
                    COUNT(DISTINCT ls.product_id) as products,
                    SUM(ls.quantity_available * bat.cost_per_unit) as stock_value
                FROM inventory.location_wise_stock ls
                JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
                JOIN master.branches b ON sl.branch_id = b.branch_id
                JOIN inventory.batches bat ON ls.batch_id = bat.batch_id
                JOIN inventory.products p ON ls.product_id = p.product_id
                WHERE p.org_id = p_org_id
                AND ls.quantity_available > 0
                AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
                AND (p_category_id IS NULL OR p.category_id = p_category_id)
                GROUP BY sl.location_id, sl.location_name, b.branch_name
            )
            SELECT jsonb_build_object(
                'summary', row_to_json(so),
                'location_distribution', COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'location', ld.location_name,
                            'branch', ld.branch_name,
                            'products', ld.products,
                            'value', ROUND(ld.stock_value, 2)
                        ) ORDER BY ld.stock_value DESC
                    ) FILTER (WHERE ld.location_name IS NOT NULL),
                    '[]'::jsonb
                ),
                'stock_health', jsonb_build_object(
                    'healthy_stock_percentage', ROUND(
                        (so.in_stock_skus::NUMERIC / NULLIF(so.total_skus, 0)) * 100,
                        2
                    ),
                    'stockout_rate', ROUND(
                        (so.out_of_stock_skus::NUMERIC / NULLIF(so.total_skus, 0)) * 100,
                        2
                    ),
                    'reorder_alert_rate', ROUND(
                        (so.below_reorder_skus::NUMERIC / NULLIF(so.total_skus, 0)) * 100,
                        2
                    )
                )
            ) INTO v_result
            FROM stock_overview so
            CROSS JOIN location_distribution ld;
            
        WHEN 'movement' THEN
            WITH movement_analysis AS (
                SELECT 
                    p.product_id,
                    p.product_name,
                    p.product_code,
                    -- Last 30 days movement
                    SUM(CASE WHEN im.movement_type = 'purchase' AND im.movement_date >= CURRENT_DATE - 30 THEN im.quantity ELSE 0 END) as purchases_30d,
                    SUM(CASE WHEN im.movement_type = 'sale' AND im.movement_date >= CURRENT_DATE - 30 THEN im.quantity ELSE 0 END) as sales_30d,
                    -- Last 90 days movement
                    SUM(CASE WHEN im.movement_type = 'sale' AND im.movement_date >= CURRENT_DATE - 90 THEN im.quantity ELSE 0 END) as sales_90d,
                    -- Current stock
                    SUM(ls.quantity_available) as current_stock,
                    -- Turnover calculation
                    CASE 
                        WHEN SUM(ls.quantity_available) > 0 AND SUM(CASE WHEN im.movement_type = 'sale' AND im.movement_date >= CURRENT_DATE - 365 THEN im.quantity ELSE 0 END) > 0
                        THEN (SUM(CASE WHEN im.movement_type = 'sale' AND im.movement_date >= CURRENT_DATE - 365 THEN im.quantity ELSE 0 END) * 365.0) / 
                             (SUM(ls.quantity_available) * 30.0)
                        ELSE 0
                    END as turnover_ratio,
                    -- Days of stock
                    CASE 
                        WHEN SUM(CASE WHEN im.movement_type = 'sale' AND im.movement_date >= CURRENT_DATE - 30 THEN im.quantity ELSE 0 END) > 0
                        THEN SUM(ls.quantity_available) / (SUM(CASE WHEN im.movement_type = 'sale' AND im.movement_date >= CURRENT_DATE - 30 THEN im.quantity ELSE 0 END) / 30.0)
                        ELSE NULL
                    END as days_of_stock
                FROM inventory.products p
                LEFT JOIN inventory.inventory_movements im ON p.product_id = im.product_id
                LEFT JOIN inventory.location_wise_stock ls ON p.product_id = ls.product_id
                LEFT JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
                WHERE p.org_id = p_org_id
                AND p.is_active = TRUE
                AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id)
                AND (p_category_id IS NULL OR p.category_id = p_category_id)
                GROUP BY p.product_id, p.product_name, p.product_code
                HAVING SUM(ls.quantity_available) > 0 OR SUM(CASE WHEN im.movement_type = 'sale' AND im.movement_date >= CURRENT_DATE - 30 THEN im.quantity ELSE 0 END) > 0
            )
            SELECT jsonb_build_object(
                'movement_analysis', COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'product_name', ma.product_name,
                            'product_code', ma.product_code,
                            'current_stock', ma.current_stock,
                            'sales_30d', ma.sales_30d,
                            'sales_90d', ma.sales_90d,
                            'purchases_30d', ma.purchases_30d,
                            'turnover_ratio', ROUND(ma.turnover_ratio, 2),
                            'days_of_stock', ROUND(ma.days_of_stock, 0),
                            'movement_category', CASE
                                WHEN ma.turnover_ratio >= 12 THEN 'Fast Moving'
                                WHEN ma.turnover_ratio >= 4 THEN 'Medium Moving'
                                WHEN ma.turnover_ratio > 0 THEN 'Slow Moving'
                                ELSE 'Non-Moving'
                            END
                        ) ORDER BY ma.sales_30d DESC
                    ),
                    '[]'::jsonb
                ),
                'summary', jsonb_build_object(
                    'fast_moving_count', COUNT(*) FILTER (WHERE ma.turnover_ratio >= 12),
                    'medium_moving_count', COUNT(*) FILTER (WHERE ma.turnover_ratio >= 4 AND ma.turnover_ratio < 12),
                    'slow_moving_count', COUNT(*) FILTER (WHERE ma.turnover_ratio > 0 AND ma.turnover_ratio < 4),
                    'non_moving_count', COUNT(*) FILTER (WHERE ma.turnover_ratio = 0)
                )
            ) INTO v_result
            FROM movement_analysis ma;
            
        WHEN 'abc' THEN
            WITH product_values AS (
                SELECT 
                    p.product_id,
                    p.product_name,
                    p.product_code,
                    SUM(ii.line_total) as revenue_contribution,
                    SUM(ii.quantity) as quantity_sold,
                    AVG(b.cost_per_unit) as avg_cost,
                    SUM(ls.quantity_available) as current_stock,
                    SUM(ls.quantity_available * b.cost_per_unit) as stock_value
                FROM inventory.products p
                LEFT JOIN sales.invoice_items ii ON p.product_id = ii.product_id
                LEFT JOIN sales.invoices i ON ii.invoice_id = i.invoice_id 
                    AND i.invoice_date >= CURRENT_DATE - 365
                    AND i.invoice_status = 'posted'
                LEFT JOIN inventory.location_wise_stock ls ON p.product_id = ls.product_id
                LEFT JOIN inventory.batches b ON ls.batch_id = b.batch_id
                WHERE p.org_id = p_org_id
                AND p.is_active = TRUE
                AND (p_category_id IS NULL OR p.category_id = p_category_id)
                GROUP BY p.product_id, p.product_name, p.product_code
            ),
            abc_classification AS (
                SELECT 
                    *,
                    SUM(revenue_contribution) OVER (ORDER BY revenue_contribution DESC) as cumulative_revenue,
                    SUM(revenue_contribution) OVER () as total_revenue,
                    CASE 
                        WHEN SUM(revenue_contribution) OVER (ORDER BY revenue_contribution DESC) <= SUM(revenue_contribution) OVER () * 0.8 THEN 'A'
                        WHEN SUM(revenue_contribution) OVER (ORDER BY revenue_contribution DESC) <= SUM(revenue_contribution) OVER () * 0.95 THEN 'B'
                        ELSE 'C'
                    END as abc_category
                FROM product_values
            )
            SELECT jsonb_build_object(
                'abc_analysis', COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'product_name', ac.product_name,
                            'product_code', ac.product_code,
                            'revenue_contribution', ROUND(ac.revenue_contribution, 2),
                            'revenue_percentage', ROUND((ac.revenue_contribution / NULLIF(ac.total_revenue, 0)) * 100, 2),
                            'quantity_sold', ac.quantity_sold,
                            'current_stock', ac.current_stock,
                            'stock_value', ROUND(ac.stock_value, 2),
                            'abc_category', ac.abc_category
                        ) ORDER BY ac.revenue_contribution DESC
                    ),
                    '[]'::jsonb
                ),
                'category_summary', (
                    SELECT jsonb_object_agg(
                        abc_category,
                        jsonb_build_object(
                            'product_count', product_count,
                            'revenue_share', ROUND(revenue_share, 2),
                            'stock_value', ROUND(stock_value, 2)
                        )
                    )
                    FROM (
                        SELECT 
                            abc_category,
                            COUNT(*) as product_count,
                            (SUM(revenue_contribution) / NULLIF(MAX(total_revenue), 0)) * 100 as revenue_share,
                            SUM(stock_value) as stock_value
                        FROM abc_classification
                        GROUP BY abc_category
                    ) category_summary
                )
            ) INTO v_result
            FROM abc_classification ac;
            
        ELSE -- Default to overview
            SELECT api.get_inventory_analytics(p_org_id, 'overview', p_branch_id, p_category_id) INTO v_result;
    END CASE;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- CUSTOMER ANALYTICS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_customer_analytics(
    p_org_id INTEGER,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '365 days',
    p_to_date DATE DEFAULT CURRENT_DATE,
    p_customer_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH customer_metrics AS (
        SELECT 
            c.customer_id,
            c.customer_name,
            c.customer_code,
            c.customer_type,
            cat.category_name,
            COUNT(DISTINCT i.invoice_id) as purchase_frequency,
            SUM(i.total_amount) as total_purchases,
            AVG(i.total_amount) as avg_order_value,
            MAX(i.invoice_date) as last_purchase_date,
            MIN(i.invoice_date) as first_purchase_date,
            CURRENT_DATE - MAX(i.invoice_date) as days_since_last_purchase,
            COUNT(DISTINCT DATE_TRUNC('month', i.invoice_date)) as active_months
        FROM parties.customers c
        LEFT JOIN parties.customer_categories cat ON c.category_id = cat.category_id
        LEFT JOIN sales.invoices i ON c.customer_id = i.customer_id
            AND i.invoice_date BETWEEN p_from_date AND p_to_date
            AND i.invoice_status = 'posted'
        WHERE c.org_id = p_org_id
        AND c.is_active = TRUE
        AND (p_customer_id IS NULL OR c.customer_id = p_customer_id)
        GROUP BY c.customer_id, c.customer_name, c.customer_code, c.customer_type, cat.category_name
    ),
    rfm_analysis AS (
        SELECT 
            *,
            NTILE(5) OVER (ORDER BY days_since_last_purchase DESC) as recency_score,
            NTILE(5) OVER (ORDER BY purchase_frequency) as frequency_score,
            NTILE(5) OVER (ORDER BY total_purchases) as monetary_score,
            CASE 
                WHEN NTILE(5) OVER (ORDER BY days_since_last_purchase DESC) >= 4 AND 
                     NTILE(5) OVER (ORDER BY purchase_frequency) >= 4 AND
                     NTILE(5) OVER (ORDER BY total_purchases) >= 4 THEN 'Champions'
                WHEN NTILE(5) OVER (ORDER BY days_since_last_purchase DESC) >= 3 AND 
                     NTILE(5) OVER (ORDER BY purchase_frequency) >= 3 THEN 'Loyal Customers'
                WHEN NTILE(5) OVER (ORDER BY days_since_last_purchase DESC) >= 3 AND 
                     NTILE(5) OVER (ORDER BY purchase_frequency) <= 2 THEN 'Potential Loyalists'
                WHEN NTILE(5) OVER (ORDER BY days_since_last_purchase DESC) <= 2 AND 
                     NTILE(5) OVER (ORDER BY purchase_frequency) >= 3 THEN 'At Risk'
                WHEN NTILE(5) OVER (ORDER BY days_since_last_purchase DESC) <= 2 AND 
                     NTILE(5) OVER (ORDER BY purchase_frequency) <= 2 THEN 'Lost'
                ELSE 'New Customers'
            END as customer_segment
        FROM customer_metrics
    ),
    product_preferences AS (
        SELECT 
            c.customer_id,
            jsonb_agg(
                jsonb_build_object(
                    'product_name', p.product_name,
                    'quantity', SUM(ii.quantity),
                    'revenue', SUM(ii.line_total)
                ) ORDER BY SUM(ii.line_total) DESC
            ) FILTER (WHERE p.product_name IS NOT NULL) as top_products
        FROM parties.customers c
        JOIN sales.invoices i ON c.customer_id = i.customer_id
        JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        WHERE c.org_id = p_org_id
        AND i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_customer_id IS NULL OR c.customer_id = p_customer_id)
        GROUP BY c.customer_id
        LIMIT 5
    )
    SELECT jsonb_build_object(
        'period', jsonb_build_object(
            'from_date', p_from_date,
            'to_date', p_to_date
        ),
        'customers', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'customer_id', rfm.customer_id,
                    'customer_name', rfm.customer_name,
                    'customer_code', rfm.customer_code,
                    'customer_type', rfm.customer_type,
                    'category', rfm.category_name,
                    'metrics', jsonb_build_object(
                        'total_purchases', ROUND(rfm.total_purchases, 2),
                        'purchase_frequency', rfm.purchase_frequency,
                        'avg_order_value', ROUND(rfm.avg_order_value, 2),
                        'last_purchase_date', rfm.last_purchase_date,
                        'days_since_purchase', rfm.days_since_last_purchase,
                        'lifetime_months', rfm.active_months
                    ),
                    'rfm_scores', jsonb_build_object(
                        'recency', rfm.recency_score,
                        'frequency', rfm.frequency_score,
                        'monetary', rfm.monetary_score,
                        'segment', rfm.customer_segment
                    ),
                    'top_products', COALESCE(pp.top_products, '[]'::jsonb)
                ) ORDER BY rfm.total_purchases DESC
            ) FILTER (WHERE rfm.customer_id IS NOT NULL),
            '[]'::jsonb
        ),
        'segment_summary', (
            SELECT jsonb_object_agg(
                customer_segment,
                jsonb_build_object(
                    'count', segment_count,
                    'revenue', ROUND(segment_revenue, 2),
                    'avg_value', ROUND(avg_value, 2)
                )
            )
            FROM (
                SELECT 
                    customer_segment,
                    COUNT(*) as segment_count,
                    SUM(total_purchases) as segment_revenue,
                    AVG(total_purchases) as avg_value
                FROM rfm_analysis
                GROUP BY customer_segment
            ) segment_stats
        ),
        'overall_metrics', jsonb_build_object(
            'total_customers', COUNT(DISTINCT rfm.customer_id),
            'active_customers', COUNT(DISTINCT rfm.customer_id) FILTER (WHERE rfm.days_since_last_purchase <= 90),
            'new_customers', COUNT(DISTINCT rfm.customer_id) FILTER (WHERE rfm.first_purchase_date >= p_from_date),
            'avg_customer_value', ROUND(AVG(rfm.total_purchases), 2),
            'customer_retention_rate', ROUND(
                (COUNT(DISTINCT rfm.customer_id) FILTER (WHERE rfm.purchase_frequency > 1)::NUMERIC / 
                 NULLIF(COUNT(DISTINCT rfm.customer_id), 0)) * 100,
                2
            )
        )
    ) INTO v_result
    FROM rfm_analysis rfm
    LEFT JOIN product_preferences pp ON rfm.customer_id = pp.customer_id;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.get_executive_dashboard TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_sales_analytics TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_inventory_analytics TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_customer_analytics TO authenticated_user;

COMMENT ON FUNCTION api.get_executive_dashboard IS 'Get executive dashboard with key metrics and alerts';
COMMENT ON FUNCTION api.get_sales_analytics IS 'Get detailed sales analytics with trends and breakdowns';
COMMENT ON FUNCTION api.get_inventory_analytics IS 'Get inventory analytics including ABC analysis and movement';
COMMENT ON FUNCTION api.get_customer_analytics IS 'Get customer analytics with RFM segmentation';