-- =============================================
-- SALES MODULE APIS
-- =============================================
-- Global API functions for sales management
-- =============================================

-- =============================================
-- CUSTOMER SEARCH API
-- =============================================
CREATE OR REPLACE FUNCTION api.search_customers(
    p_search_term TEXT DEFAULT NULL,
    p_customer_type TEXT DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_total_count INTEGER;
BEGIN
    -- Get total count
    SELECT COUNT(*)
    INTO v_total_count
    FROM parties.customers c
    WHERE c.is_active = TRUE
    AND (p_search_term IS NULL OR 
         c.customer_name ILIKE '%' || p_search_term || '%' OR
         c.customer_code ILIKE '%' || p_search_term || '%' OR
         c.primary_phone ILIKE '%' || p_search_term || '%' OR
         c.gstin ILIKE '%' || p_search_term || '%')
    AND (p_customer_type IS NULL OR c.customer_type = p_customer_type)
    AND (p_category_id IS NULL OR c.category_id = p_category_id);
    
    -- Get paginated results
    SELECT jsonb_build_object(
        'total_count', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'customers', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'customer_id', c.customer_id,
                    'customer_code', c.customer_code,
                    'customer_name', c.customer_name,
                    'customer_type', c.customer_type,
                    'category', cat.category_name,
                    'gstin', c.gstin,
                    'contact_person', c.contact_person,
                    'primary_phone', c.primary_phone,
                    'email', c.email,
                    'address', c.address,
                    'credit_limit', (c.credit_info->>'credit_limit')::NUMERIC,
                    'credit_utilized', (c.credit_info->>'credit_utilized')::NUMERIC,
                    'credit_available', (c.credit_info->>'credit_limit')::NUMERIC - (c.credit_info->>'credit_utilized')::NUMERIC,
                    'outstanding', COALESCE(o.total_outstanding, 0)
                ) ORDER BY c.customer_name
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM parties.customers c
    LEFT JOIN parties.customer_categories cat ON c.category_id = cat.category_id
    LEFT JOIN LATERAL (
        SELECT SUM(co.outstanding_amount) as total_outstanding
        FROM parties.customer_outstanding co
        WHERE co.customer_id = c.customer_id
        AND co.status IN ('open', 'partial')
    ) o ON true
    WHERE c.is_active = TRUE
    AND (p_search_term IS NULL OR 
         c.customer_name ILIKE '%' || p_search_term || '%' OR
         c.customer_code ILIKE '%' || p_search_term || '%' OR
         c.primary_phone ILIKE '%' || p_search_term || '%' OR
         c.gstin ILIKE '%' || p_search_term || '%')
    AND (p_customer_type IS NULL OR c.customer_type = p_customer_type)
    AND (p_category_id IS NULL OR c.category_id = p_category_id)
    LIMIT p_limit
    OFFSET p_offset;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- CREATE SALES ORDER API
-- =============================================
CREATE OR REPLACE FUNCTION api.create_sales_order(
    p_order_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id INTEGER;
    v_order_number VARCHAR(50);
    v_item JSONB;
    v_result JSONB;
BEGIN
    -- Validate required fields
    IF p_order_data->>'customer_id' IS NULL THEN
        RAISE EXCEPTION 'Customer ID is required';
    END IF;
    
    -- Generate order number
    SELECT 'SO-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
           LPAD((COALESCE(MAX(SUBSTRING(order_number FROM '[0-9]+$')::INTEGER), 0) + 1)::TEXT, 5, '0')
    INTO v_order_number
    FROM sales.orders
    WHERE order_number LIKE 'SO-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '%';
    
    -- Create order
    INSERT INTO sales.orders (
        org_id,
        branch_id,
        order_number,
        order_date,
        customer_id,
        order_type,
        price_list_id,
        salesperson_id,
        delivery_date,
        delivery_address,
        payment_terms,
        special_instructions,
        order_status,
        fulfillment_status,
        created_by
    )
    VALUES (
        (p_order_data->>'org_id')::INTEGER,
        (p_order_data->>'branch_id')::INTEGER,
        v_order_number,
        COALESCE((p_order_data->>'order_date')::DATE, CURRENT_DATE),
        (p_order_data->>'customer_id')::INTEGER,
        COALESCE(p_order_data->>'order_type', 'regular'),
        (p_order_data->>'price_list_id')::INTEGER,
        (p_order_data->>'salesperson_id')::INTEGER,
        (p_order_data->>'delivery_date')::DATE,
        p_order_data->'delivery_address',
        p_order_data->>'payment_terms',
        p_order_data->>'special_instructions',
        'draft',
        'pending',
        (p_order_data->>'created_by')::INTEGER
    )
    RETURNING order_id INTO v_order_id;
    
    -- Add order items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_data->'items')
    LOOP
        INSERT INTO sales.order_items (
            order_id,
            product_id,
            ordered_quantity,
            unit_of_sale,
            base_unit_price,
            discount_percentage,
            discount_amount,
            tax_percentage,
            delivery_status
        )
        VALUES (
            v_order_id,
            (v_item->>'product_id')::INTEGER,
            (v_item->>'quantity')::NUMERIC,
            v_item->>'unit_of_sale',
            (v_item->>'base_unit_price')::NUMERIC,
            COALESCE((v_item->>'discount_percentage')::NUMERIC, 0),
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
            (v_item->>'tax_percentage')::NUMERIC,
            'pending'
        );
    END LOOP;
    
    -- Recalculate totals
    UPDATE sales.orders o
    SET subtotal = i.subtotal,
        tax_amount = i.tax_amount,
        discount_amount = i.discount_amount,
        total_amount = i.total_amount
    FROM (
        SELECT 
            order_id,
            SUM(taxable_amount) as subtotal,
            SUM(tax_amount) as tax_amount,
            SUM(discount_amount) as discount_amount,
            SUM(line_total) as total_amount
        FROM sales.order_items
        WHERE order_id = v_order_id
        GROUP BY order_id
    ) i
    WHERE o.order_id = v_order_id;
    
    -- Return created order
    SELECT jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'message', 'Order created successfully'
    ) INTO v_result;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- =============================================
-- GET SALES ORDERS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_sales_orders(
    p_order_id INTEGER DEFAULT NULL,
    p_customer_id INTEGER DEFAULT NULL,
    p_order_status TEXT DEFAULT NULL,
    p_from_date DATE DEFAULT NULL,
    p_to_date DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'orders', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'order_id', o.order_id,
                    'order_number', o.order_number,
                    'order_date', o.order_date,
                    'customer_name', c.customer_name,
                    'customer_code', c.customer_code,
                    'order_type', o.order_type,
                    'order_status', o.order_status,
                    'fulfillment_status', o.fulfillment_status,
                    'delivery_date', o.delivery_date,
                    'subtotal', o.subtotal,
                    'tax_amount', o.tax_amount,
                    'discount_amount', o.discount_amount,
                    'total_amount', o.total_amount,
                    'items', COALESCE(items.item_list, '[]'::jsonb),
                    'item_count', COALESCE(items.item_count, 0),
                    'total_quantity', COALESCE(items.total_quantity, 0)
                ) ORDER BY o.order_date DESC, o.order_id DESC
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM sales.orders o
    JOIN parties.customers c ON o.customer_id = c.customer_id
    LEFT JOIN LATERAL (
        SELECT 
            COUNT(*) as item_count,
            SUM(oi.ordered_quantity) as total_quantity,
            jsonb_agg(
                jsonb_build_object(
                    'item_id', oi.item_id,
                    'product_id', oi.product_id,
                    'product_name', p.product_name,
                    'quantity', oi.ordered_quantity,
                    'unit_price', oi.base_unit_price,
                    'discount', oi.discount_amount,
                    'tax', oi.tax_amount,
                    'total', oi.line_total,
                    'delivery_status', oi.delivery_status
                ) ORDER BY oi.item_id
            ) as item_list
        FROM sales.order_items oi
        JOIN inventory.products p ON oi.product_id = p.product_id
        WHERE oi.order_id = o.order_id
    ) items ON true
    WHERE (p_order_id IS NULL OR o.order_id = p_order_id)
    AND (p_customer_id IS NULL OR o.customer_id = p_customer_id)
    AND (p_order_status IS NULL OR o.order_status = p_order_status)
    AND (p_from_date IS NULL OR o.order_date >= p_from_date)
    AND (p_to_date IS NULL OR o.order_date <= p_to_date)
    LIMIT p_limit
    OFFSET p_offset;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- CREATE INVOICE API
-- =============================================
CREATE OR REPLACE FUNCTION api.create_invoice(
    p_invoice_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_id INTEGER;
    v_invoice_number VARCHAR(50);
    v_item JSONB;
    v_result JSONB;
    v_customer_credit JSONB;
BEGIN
    -- Check customer credit limit
    SELECT jsonb_build_object(
        'credit_limit', (c.credit_info->>'credit_limit')::NUMERIC,
        'credit_utilized', (c.credit_info->>'credit_utilized')::NUMERIC,
        'credit_available', (c.credit_info->>'credit_limit')::NUMERIC - (c.credit_info->>'credit_utilized')::NUMERIC
    ) INTO v_customer_credit
    FROM parties.customers c
    WHERE c.customer_id = (p_invoice_data->>'customer_id')::INTEGER;
    
    -- Generate invoice number
    SELECT 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
           LPAD((COALESCE(MAX(SUBSTRING(invoice_number FROM '[0-9]+$')::INTEGER), 0) + 1)::TEXT, 5, '0')
    INTO v_invoice_number
    FROM sales.invoices
    WHERE invoice_number LIKE 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '%';
    
    -- Create invoice
    INSERT INTO sales.invoices (
        org_id,
        branch_id,
        invoice_number,
        invoice_date,
        invoice_type,
        order_id,
        customer_id,
        billing_address,
        shipping_address,
        payment_terms,
        due_date,
        salesperson_id,
        price_list_id,
        invoice_status,
        created_by
    )
    VALUES (
        (p_invoice_data->>'org_id')::INTEGER,
        (p_invoice_data->>'branch_id')::INTEGER,
        v_invoice_number,
        COALESCE((p_invoice_data->>'invoice_date')::DATE, CURRENT_DATE),
        COALESCE(p_invoice_data->>'invoice_type', 'tax_invoice'),
        (p_invoice_data->>'order_id')::INTEGER,
        (p_invoice_data->>'customer_id')::INTEGER,
        p_invoice_data->'billing_address',
        p_invoice_data->'shipping_address',
        p_invoice_data->>'payment_terms',
        CASE 
            WHEN p_invoice_data->>'payment_terms' = 'cash' THEN CURRENT_DATE
            WHEN p_invoice_data->>'payment_terms' = '7days' THEN CURRENT_DATE + 7
            WHEN p_invoice_data->>'payment_terms' = '30days' THEN CURRENT_DATE + 30
            WHEN p_invoice_data->>'payment_terms' = '45days' THEN CURRENT_DATE + 45
            ELSE CURRENT_DATE + 30
        END,
        (p_invoice_data->>'salesperson_id')::INTEGER,
        (p_invoice_data->>'price_list_id')::INTEGER,
        'draft',
        (p_invoice_data->>'created_by')::INTEGER
    )
    RETURNING invoice_id INTO v_invoice_id;
    
    -- Add invoice items with batch allocation
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_invoice_data->'items')
    LOOP
        INSERT INTO sales.invoice_items (
            invoice_id,
            product_id,
            quantity,
            unit_of_sale,
            base_unit_price,
            discount_percentage,
            discount_amount,
            tax_percentage,
            batch_allocation
        )
        VALUES (
            v_invoice_id,
            (v_item->>'product_id')::INTEGER,
            (v_item->>'quantity')::NUMERIC,
            v_item->>'unit_of_sale',
            (v_item->>'base_unit_price')::NUMERIC,
            COALESCE((v_item->>'discount_percentage')::NUMERIC, 0),
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
            (v_item->>'tax_percentage')::NUMERIC,
            -- Auto-allocate batches using FEFO
            (SELECT allocate_stock_intelligent(
                (v_item->>'product_id')::INTEGER,
                (v_item->>'quantity')::NUMERIC,
                (p_invoice_data->>'branch_id')::INTEGER,
                'FEFO'
            ))
        );
    END LOOP;
    
    -- Recalculate totals
    UPDATE sales.invoices i
    SET subtotal = items.subtotal,
        tax_amount = items.tax_amount,
        discount_amount = items.discount_amount,
        total_amount = items.total_amount,
        total_quantity = items.total_quantity
    FROM (
        SELECT 
            invoice_id,
            SUM(taxable_amount) as subtotal,
            SUM(tax_amount) as tax_amount,
            SUM(discount_amount) as discount_amount,
            SUM(line_total) as total_amount,
            SUM(quantity) as total_quantity
        FROM sales.invoice_items
        WHERE invoice_id = v_invoice_id
        GROUP BY invoice_id
    ) items
    WHERE i.invoice_id = v_invoice_id;
    
    -- Return created invoice
    SELECT jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'credit_info', v_customer_credit,
        'message', 'Invoice created successfully'
    ) INTO v_result;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- =============================================
-- GET INVOICES API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_invoices(
    p_invoice_id INTEGER DEFAULT NULL,
    p_customer_id INTEGER DEFAULT NULL,
    p_invoice_status TEXT DEFAULT NULL,
    p_from_date DATE DEFAULT NULL,
    p_to_date DATE DEFAULT NULL,
    p_include_items BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'invoices', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'invoice_id', i.invoice_id,
                    'invoice_number', i.invoice_number,
                    'invoice_date', i.invoice_date,
                    'invoice_type', i.invoice_type,
                    'customer_name', c.customer_name,
                    'customer_code', c.customer_code,
                    'invoice_status', i.invoice_status,
                    'payment_status', i.payment_status,
                    'due_date', i.due_date,
                    'days_overdue', GREATEST(0, CURRENT_DATE - i.due_date),
                    'subtotal', i.subtotal,
                    'tax_amount', i.tax_amount,
                    'discount_amount', i.discount_amount,
                    'total_amount', i.total_amount,
                    'paid_amount', i.paid_amount,
                    'balance_amount', i.total_amount - i.paid_amount,
                    'items', CASE 
                        WHEN p_include_items THEN COALESCE(items.item_list, '[]'::jsonb)
                        ELSE NULL
                    END,
                    'item_count', COALESCE(items.item_count, 0),
                    'total_quantity', i.total_quantity
                ) ORDER BY i.invoice_date DESC, i.invoice_id DESC
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM sales.invoices i
    JOIN parties.customers c ON i.customer_id = c.customer_id
    LEFT JOIN LATERAL (
        SELECT 
            COUNT(*) as item_count,
            jsonb_agg(
                jsonb_build_object(
                    'item_id', ii.item_id,
                    'product_name', p.product_name,
                    'quantity', ii.quantity,
                    'unit_price', ii.base_unit_price,
                    'discount', ii.discount_amount,
                    'tax', ii.tax_amount,
                    'total', ii.line_total,
                    'batch_allocation', ii.batch_allocation
                ) ORDER BY ii.item_id
            ) as item_list
        FROM sales.invoice_items ii
        JOIN inventory.products p ON ii.product_id = p.product_id
        WHERE ii.invoice_id = i.invoice_id
    ) items ON true
    WHERE (p_invoice_id IS NULL OR i.invoice_id = p_invoice_id)
    AND (p_customer_id IS NULL OR i.customer_id = p_customer_id)
    AND (p_invoice_status IS NULL OR i.invoice_status = p_invoice_status)
    AND (p_from_date IS NULL OR i.invoice_date >= p_from_date)
    AND (p_to_date IS NULL OR i.invoice_date <= p_to_date)
    LIMIT p_limit
    OFFSET p_offset;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- SALES DASHBOARD API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_sales_dashboard(
    p_branch_id INTEGER DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH sales_summary AS (
        SELECT 
            COUNT(DISTINCT i.invoice_id) as total_invoices,
            COUNT(DISTINCT i.customer_id) as unique_customers,
            SUM(i.total_amount) as total_sales,
            SUM(i.tax_amount) as total_tax,
            SUM(i.discount_amount) as total_discount,
            SUM(i.paid_amount) as total_collected,
            SUM(i.total_amount - i.paid_amount) as total_outstanding,
            AVG(i.total_amount) as avg_invoice_value
        FROM sales.invoices i
        WHERE i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    ),
    daily_sales AS (
        SELECT 
            i.invoice_date,
            COUNT(*) as invoice_count,
            SUM(i.total_amount) as daily_total
        FROM sales.invoices i
        WHERE i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY i.invoice_date
    ),
    top_products AS (
        SELECT 
            p.product_name,
            p.product_code,
            SUM(ii.quantity) as total_quantity,
            SUM(ii.line_total) as total_revenue
        FROM sales.invoice_items ii
        JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        WHERE i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY p.product_id, p.product_name, p.product_code
        ORDER BY total_revenue DESC
        LIMIT 10
    ),
    top_customers AS (
        SELECT 
            c.customer_name,
            c.customer_code,
            COUNT(i.invoice_id) as invoice_count,
            SUM(i.total_amount) as total_purchases
        FROM sales.invoices i
        JOIN parties.customers c ON i.customer_id = c.customer_id
        WHERE i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY c.customer_id, c.customer_name, c.customer_code
        ORDER BY total_purchases DESC
        LIMIT 10
    )
    SELECT jsonb_build_object(
        'period', jsonb_build_object(
            'from_date', p_from_date,
            'to_date', p_to_date,
            'days', p_to_date - p_from_date + 1
        ),
        'summary', row_to_json(sales_summary),
        'daily_sales', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'date', ds.invoice_date,
                    'invoice_count', ds.invoice_count,
                    'amount', ds.daily_total
                ) ORDER BY ds.invoice_date
            ) FILTER (WHERE ds.invoice_date IS NOT NULL), 
            '[]'::jsonb
        ),
        'top_products', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'product_name', tp.product_name,
                    'product_code', tp.product_code,
                    'quantity', tp.total_quantity,
                    'revenue', tp.total_revenue
                ) ORDER BY tp.total_revenue DESC
            ) FILTER (WHERE tp.product_name IS NOT NULL), 
            '[]'::jsonb
        ),
        'top_customers', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'customer_name', tc.customer_name,
                    'customer_code', tc.customer_code,
                    'invoice_count', tc.invoice_count,
                    'total_purchases', tc.total_purchases
                ) ORDER BY tc.total_purchases DESC
            ) FILTER (WHERE tc.customer_name IS NOT NULL), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM sales_summary
    CROSS JOIN daily_sales ds
    CROSS JOIN top_products tp
    CROSS JOIN top_customers tc;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.search_customers TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.create_sales_order TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_sales_orders TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.create_invoice TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_invoices TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_sales_dashboard TO authenticated_user;

COMMENT ON FUNCTION api.search_customers IS 'Search customers with credit and outstanding info';
COMMENT ON FUNCTION api.create_sales_order IS 'Create a new sales order with items';
COMMENT ON FUNCTION api.get_sales_orders IS 'Get sales orders with filters';
COMMENT ON FUNCTION api.create_invoice IS 'Create invoice with automatic batch allocation';
COMMENT ON FUNCTION api.get_invoices IS 'Get invoices with optional item details';
COMMENT ON FUNCTION api.get_sales_dashboard IS 'Get comprehensive sales analytics dashboard';