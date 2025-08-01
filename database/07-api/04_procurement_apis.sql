-- =============================================
-- PROCUREMENT MODULE APIS
-- =============================================
-- Global API functions for procurement management
-- =============================================

-- =============================================
-- SUPPLIER SEARCH API
-- =============================================
CREATE OR REPLACE FUNCTION api.search_suppliers(
    p_search_term TEXT DEFAULT NULL,
    p_supplier_category TEXT DEFAULT NULL,
    p_product_id INTEGER DEFAULT NULL,
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
    SELECT COUNT(DISTINCT s.supplier_id)
    INTO v_total_count
    FROM parties.suppliers s
    LEFT JOIN procurement.supplier_products sp ON s.supplier_id = sp.supplier_id
    WHERE s.is_active = TRUE
    AND (p_search_term IS NULL OR 
         s.supplier_name ILIKE '%' || p_search_term || '%' OR
         s.supplier_code ILIKE '%' || p_search_term || '%' OR
         s.gstin ILIKE '%' || p_search_term || '%')
    AND (p_supplier_category IS NULL OR s.supplier_category = p_supplier_category)
    AND (p_product_id IS NULL OR sp.product_id = p_product_id);
    
    -- Get paginated results
    SELECT jsonb_build_object(
        'total_count', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'suppliers', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'supplier_id', s.supplier_id,
                    'supplier_code', s.supplier_code,
                    'supplier_name', s.supplier_name,
                    'supplier_category', s.supplier_category,
                    'gstin', s.gstin,
                    'contact_person', s.contact_person,
                    'primary_phone', s.primary_phone,
                    'email', s.email,
                    'address', s.address,
                    'payment_terms', s.payment_terms,
                    'credit_limit', s.credit_limit,
                    'credit_utilized', s.credit_utilized,
                    'credit_available', s.credit_limit - s.credit_utilized,
                    'product_count', COALESCE(sp.product_count, 0),
                    'outstanding', COALESCE(o.total_outstanding, 0)
                ) ORDER BY s.supplier_name
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM parties.suppliers s
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as product_count
        FROM procurement.supplier_products sp
        WHERE sp.supplier_id = s.supplier_id
        AND sp.is_active = TRUE
    ) sp ON true
    LEFT JOIN LATERAL (
        SELECT SUM(so.outstanding_amount) as total_outstanding
        FROM financial.supplier_outstanding so
        WHERE so.supplier_id = s.supplier_id
        AND so.status IN ('open', 'partial')
    ) o ON true
    WHERE s.is_active = TRUE
    AND (p_search_term IS NULL OR 
         s.supplier_name ILIKE '%' || p_search_term || '%' OR
         s.supplier_code ILIKE '%' || p_search_term || '%' OR
         s.gstin ILIKE '%' || p_search_term || '%')
    AND (p_supplier_category IS NULL OR s.supplier_category = p_supplier_category)
    AND (p_product_id IS NULL OR EXISTS (
        SELECT 1 FROM procurement.supplier_products sp2
        WHERE sp2.supplier_id = s.supplier_id
        AND sp2.product_id = p_product_id
        AND sp2.is_active = TRUE
    ))
    LIMIT p_limit
    OFFSET p_offset;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- CREATE PURCHASE ORDER API
-- =============================================
CREATE OR REPLACE FUNCTION api.create_purchase_order(
    p_po_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_po_id INTEGER;
    v_po_number VARCHAR(50);
    v_item JSONB;
    v_result JSONB;
    v_supplier_credit JSONB;
BEGIN
    -- Check supplier credit limit
    SELECT jsonb_build_object(
        'credit_limit', s.credit_limit,
        'credit_utilized', s.credit_utilized,
        'credit_available', s.credit_limit - s.credit_utilized
    ) INTO v_supplier_credit
    FROM parties.suppliers s
    WHERE s.supplier_id = (p_po_data->>'supplier_id')::INTEGER;
    
    -- Generate PO number
    SELECT 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
           LPAD((COALESCE(MAX(SUBSTRING(po_number FROM '[0-9]+$')::INTEGER), 0) + 1)::TEXT, 5, '0')
    INTO v_po_number
    FROM procurement.purchase_orders
    WHERE po_number LIKE 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '%';
    
    -- Create purchase order
    INSERT INTO procurement.purchase_orders (
        org_id,
        branch_id,
        po_number,
        po_date,
        supplier_id,
        po_type,
        delivery_date,
        delivery_location_id,
        payment_terms,
        special_instructions,
        po_status,
        created_by
    )
    VALUES (
        (p_po_data->>'org_id')::INTEGER,
        (p_po_data->>'branch_id')::INTEGER,
        v_po_number,
        COALESCE((p_po_data->>'po_date')::DATE, CURRENT_DATE),
        (p_po_data->>'supplier_id')::INTEGER,
        COALESCE(p_po_data->>'po_type', 'regular'),
        (p_po_data->>'delivery_date')::DATE,
        (p_po_data->>'delivery_location_id')::INTEGER,
        p_po_data->'payment_terms',
        p_po_data->>'special_instructions',
        'draft',
        (p_po_data->>'created_by')::INTEGER
    )
    RETURNING po_id INTO v_po_id;
    
    -- Add PO items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_po_data->'items')
    LOOP
        INSERT INTO procurement.purchase_order_items (
            po_id,
            product_id,
            quantity_ordered,
            unit_of_purchase,
            rate_per_unit,
            discount_percentage,
            discount_amount,
            tax_percentage
        )
        VALUES (
            v_po_id,
            (v_item->>'product_id')::INTEGER,
            (v_item->>'quantity')::NUMERIC,
            v_item->>'unit_of_purchase',
            (v_item->>'rate_per_unit')::NUMERIC,
            COALESCE((v_item->>'discount_percentage')::NUMERIC, 0),
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
            (v_item->>'tax_percentage')::NUMERIC
        );
    END LOOP;
    
    -- Recalculate totals
    UPDATE procurement.purchase_orders po
    SET subtotal = items.subtotal,
        tax_amount = items.tax_amount,
        discount_amount = items.discount_amount,
        total_amount = items.total_amount
    FROM (
        SELECT 
            po_id,
            SUM(taxable_amount) as subtotal,
            SUM(tax_amount) as tax_amount,
            SUM(discount_amount) as discount_amount,
            SUM(line_total) as total_amount
        FROM procurement.purchase_order_items
        WHERE po_id = v_po_id
        GROUP BY po_id
    ) items
    WHERE po.po_id = v_po_id;
    
    -- Return created PO
    SELECT jsonb_build_object(
        'success', true,
        'po_id', v_po_id,
        'po_number', v_po_number,
        'supplier_credit', v_supplier_credit,
        'message', 'Purchase order created successfully'
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
-- GET PURCHASE ORDERS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_purchase_orders(
    p_po_id INTEGER DEFAULT NULL,
    p_supplier_id INTEGER DEFAULT NULL,
    p_po_status TEXT DEFAULT NULL,
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
        'purchase_orders', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'po_id', po.po_id,
                    'po_number', po.po_number,
                    'po_date', po.po_date,
                    'supplier_name', s.supplier_name,
                    'supplier_code', s.supplier_code,
                    'po_type', po.po_type,
                    'po_status', po.po_status,
                    'approval_status', po.approval_status,
                    'delivery_date', po.delivery_date,
                    'subtotal', po.subtotal,
                    'tax_amount', po.tax_amount,
                    'discount_amount', po.discount_amount,
                    'total_amount', po.total_amount,
                    'received_status', CASE
                        WHEN COALESCE(items.total_received, 0) = 0 THEN 'pending'
                        WHEN items.total_ordered > items.total_received THEN 'partial'
                        ELSE 'complete'
                    END,
                    'items', items.item_details
                ) ORDER BY po.po_date DESC, po.po_id DESC
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM procurement.purchase_orders po
    JOIN parties.suppliers s ON po.supplier_id = s.supplier_id
    LEFT JOIN LATERAL (
        SELECT 
            SUM(poi.quantity_ordered) as total_ordered,
            SUM(COALESCE(poi.quantity_received, 0)) as total_received,
            jsonb_agg(
                jsonb_build_object(
                    'item_id', poi.item_id,
                    'product_name', p.product_name,
                    'quantity_ordered', poi.quantity_ordered,
                    'quantity_received', COALESCE(poi.quantity_received, 0),
                    'rate', poi.rate_per_unit,
                    'tax', poi.tax_amount,
                    'total', poi.line_total
                ) ORDER BY poi.item_id
            ) as item_details
        FROM procurement.purchase_order_items poi
        JOIN inventory.products p ON poi.product_id = p.product_id
        WHERE poi.po_id = po.po_id
    ) items ON true
    WHERE (p_po_id IS NULL OR po.po_id = p_po_id)
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    AND (p_po_status IS NULL OR po.po_status = p_po_status)
    AND (p_from_date IS NULL OR po.po_date >= p_from_date)
    AND (p_to_date IS NULL OR po.po_date <= p_to_date)
    LIMIT p_limit
    OFFSET p_offset;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- CREATE GRN API
-- =============================================
CREATE OR REPLACE FUNCTION api.create_grn(
    p_grn_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_grn_id INTEGER;
    v_grn_number VARCHAR(50);
    v_item JSONB;
    v_batch_id INTEGER;
    v_result JSONB;
BEGIN
    -- Generate GRN number
    SELECT 'GRN-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
           LPAD((COALESCE(MAX(SUBSTRING(grn_number FROM '[0-9]+$')::INTEGER), 0) + 1)::TEXT, 5, '0')
    INTO v_grn_number
    FROM procurement.goods_receipt_notes
    WHERE grn_number LIKE 'GRN-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '%';
    
    -- Create GRN
    INSERT INTO procurement.goods_receipt_notes (
        org_id,
        branch_id,
        grn_number,
        grn_date,
        po_id,
        supplier_id,
        invoice_number,
        invoice_date,
        delivery_challan_number,
        delivery_challan_date,
        received_by,
        grn_status,
        created_by
    )
    VALUES (
        (p_grn_data->>'org_id')::INTEGER,
        (p_grn_data->>'branch_id')::INTEGER,
        v_grn_number,
        COALESCE((p_grn_data->>'grn_date')::DATE, CURRENT_DATE),
        (p_grn_data->>'po_id')::INTEGER,
        (p_grn_data->>'supplier_id')::INTEGER,
        p_grn_data->>'invoice_number',
        (p_grn_data->>'invoice_date')::DATE,
        p_grn_data->>'delivery_challan_number',
        (p_grn_data->>'delivery_challan_date')::DATE,
        (p_grn_data->>'received_by')::INTEGER,
        'pending_approval',
        (p_grn_data->>'created_by')::INTEGER
    )
    RETURNING grn_id INTO v_grn_id;
    
    -- Add GRN items and create batches
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_grn_data->'items')
    LOOP
        -- Create batch
        INSERT INTO inventory.batches (
            org_id,
            product_id,
            batch_number,
            manufacturing_date,
            expiry_date,
            supplier_id,
            quantity_received,
            quantity_available,
            cost_per_unit,
            mrp_per_unit,
            sale_price_per_unit,
            batch_status
        )
        VALUES (
            (p_grn_data->>'org_id')::INTEGER,
            (v_item->>'product_id')::INTEGER,
            v_item->>'batch_number',
            (v_item->>'manufacturing_date')::DATE,
            (v_item->>'expiry_date')::DATE,
            (p_grn_data->>'supplier_id')::INTEGER,
            (v_item->>'quantity_received')::NUMERIC,
            (v_item->>'quantity_accepted')::NUMERIC,
            (v_item->>'rate_per_unit')::NUMERIC,
            (v_item->>'mrp')::NUMERIC,
            (v_item->>'sale_price')::NUMERIC,
            'active'
        )
        RETURNING batch_id INTO v_batch_id;
        
        -- Add GRN item
        INSERT INTO procurement.grn_items (
            grn_id,
            po_item_id,
            product_id,
            batch_number,
            batch_id,
            manufacturing_date,
            expiry_date,
            quantity_received,
            quantity_accepted,
            quantity_rejected,
            free_quantity,
            rate_per_unit,
            mrp,
            discount_percentage,
            discount_amount,
            tax_percentage
        )
        VALUES (
            v_grn_id,
            (v_item->>'po_item_id')::INTEGER,
            (v_item->>'product_id')::INTEGER,
            v_item->>'batch_number',
            v_batch_id,
            (v_item->>'manufacturing_date')::DATE,
            (v_item->>'expiry_date')::DATE,
            (v_item->>'quantity_received')::NUMERIC,
            (v_item->>'quantity_accepted')::NUMERIC,
            COALESCE((v_item->>'quantity_rejected')::NUMERIC, 0),
            COALESCE((v_item->>'free_quantity')::NUMERIC, 0),
            (v_item->>'rate_per_unit')::NUMERIC,
            (v_item->>'mrp')::NUMERIC,
            COALESCE((v_item->>'discount_percentage')::NUMERIC, 0),
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
            (v_item->>'tax_percentage')::NUMERIC
        );
        
        -- Update PO item received quantity
        IF v_item->>'po_item_id' IS NOT NULL THEN
            UPDATE procurement.purchase_order_items
            SET quantity_received = COALESCE(quantity_received, 0) + (v_item->>'quantity_accepted')::NUMERIC
            WHERE item_id = (v_item->>'po_item_id')::INTEGER;
        END IF;
    END LOOP;
    
    -- Recalculate totals
    UPDATE procurement.goods_receipt_notes grn
    SET subtotal = items.subtotal,
        tax_amount = items.tax_amount,
        discount_amount = items.discount_amount,
        total_amount = items.total_amount,
        total_quantity = items.total_quantity
    FROM (
        SELECT 
            grn_id,
            SUM(taxable_amount) as subtotal,
            SUM(tax_amount) as tax_amount,
            SUM(discount_amount) as discount_amount,
            SUM(line_total) as total_amount,
            SUM(quantity_accepted + COALESCE(free_quantity, 0)) as total_quantity
        FROM procurement.grn_items
        WHERE grn_id = v_grn_id
        GROUP BY grn_id
    ) items
    WHERE grn.grn_id = v_grn_id;
    
    -- Return created GRN
    SELECT jsonb_build_object(
        'success', true,
        'grn_id', v_grn_id,
        'grn_number', v_grn_number,
        'message', 'GRN created successfully. Pending quality approval.'
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
-- PENDING DELIVERIES API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_pending_deliveries(
    p_supplier_id INTEGER DEFAULT NULL,
    p_branch_id INTEGER DEFAULT NULL,
    p_days_overdue INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH pending_items AS (
        SELECT 
            po.po_id,
            po.po_number,
            po.po_date,
            po.delivery_date,
            s.supplier_name,
            p.product_name,
            p.product_code,
            poi.quantity_ordered,
            COALESCE(poi.quantity_received, 0) as quantity_received,
            poi.quantity_ordered - COALESCE(poi.quantity_received, 0) as pending_quantity,
            poi.rate_per_unit,
            (poi.quantity_ordered - COALESCE(poi.quantity_received, 0)) * poi.rate_per_unit as pending_value,
            CURRENT_DATE - po.delivery_date as days_overdue
        FROM procurement.purchase_order_items poi
        JOIN procurement.purchase_orders po ON poi.po_id = po.po_id
        JOIN parties.suppliers s ON po.supplier_id = s.supplier_id
        JOIN inventory.products p ON poi.product_id = p.product_id
        WHERE po.po_status = 'approved'
        AND poi.quantity_ordered > COALESCE(poi.quantity_received, 0)
        AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
        AND (p_branch_id IS NULL OR po.branch_id = p_branch_id)
        AND (p_days_overdue IS NULL OR CURRENT_DATE - po.delivery_date >= p_days_overdue)
    )
    SELECT jsonb_build_object(
        'pending_deliveries', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'po_number', pi.po_number,
                    'po_date', pi.po_date,
                    'delivery_date', pi.delivery_date,
                    'days_overdue', pi.days_overdue,
                    'supplier_name', pi.supplier_name,
                    'product_name', pi.product_name,
                    'product_code', pi.product_code,
                    'ordered_quantity', pi.quantity_ordered,
                    'received_quantity', pi.quantity_received,
                    'pending_quantity', pi.pending_quantity,
                    'pending_value', pi.pending_value,
                    'status', CASE
                        WHEN pi.days_overdue > 7 THEN 'critical'
                        WHEN pi.days_overdue > 0 THEN 'overdue'
                        WHEN pi.days_overdue > -3 THEN 'due_soon'
                        ELSE 'on_track'
                    END
                ) ORDER BY pi.days_overdue DESC, pi.po_date
            ), 
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'total_pending_orders', COUNT(DISTINCT pi.po_id),
            'total_pending_items', COUNT(*),
            'total_pending_value', SUM(pi.pending_value),
            'critical_count', COUNT(*) FILTER (WHERE pi.days_overdue > 7),
            'overdue_count', COUNT(*) FILTER (WHERE pi.days_overdue > 0),
            'by_supplier', (
                SELECT jsonb_object_agg(
                    supplier_name,
                    jsonb_build_object(
                        'pending_items', item_count,
                        'pending_value', pending_val
                    )
                )
                FROM (
                    SELECT 
                        supplier_name,
                        COUNT(*) as item_count,
                        SUM(pending_value) as pending_val
                    FROM pending_items
                    GROUP BY supplier_name
                ) supplier_summary
            )
        )
    ) INTO v_result
    FROM pending_items pi;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- SUPPLIER PERFORMANCE API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_supplier_performance(
    p_supplier_id INTEGER DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '90 days',
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH supplier_metrics AS (
        SELECT 
            s.supplier_id,
            s.supplier_name,
            s.supplier_code,
            COUNT(DISTINCT po.po_id) as total_orders,
            COUNT(DISTINCT grn.grn_id) as total_deliveries,
            SUM(po.total_amount) as total_purchase_value,
            AVG(grn.grn_date - po.po_date) as avg_delivery_time,
            SUM(CASE WHEN grn.grn_date <= po.delivery_date THEN 1 ELSE 0 END)::NUMERIC / 
                NULLIF(COUNT(DISTINCT grn.grn_id), 0) * 100 as on_time_delivery_rate,
            AVG(CASE 
                WHEN gi.quantity_received > 0 
                THEN (gi.quantity_accepted::NUMERIC / gi.quantity_received) * 100 
                ELSE NULL 
            END) as quality_acceptance_rate,
            COUNT(DISTINCT sr.return_id) as return_count,
            SUM(COALESCE(sr_items.return_value, 0)) as total_return_value
        FROM parties.suppliers s
        LEFT JOIN procurement.purchase_orders po ON s.supplier_id = po.supplier_id
            AND po.po_date BETWEEN p_from_date AND p_to_date
            AND po.po_status != 'cancelled'
        LEFT JOIN procurement.goods_receipt_notes grn ON po.po_id = grn.po_id
            AND grn.grn_status = 'approved'
        LEFT JOIN procurement.grn_items gi ON grn.grn_id = gi.grn_id
        LEFT JOIN procurement.supplier_returns sr ON s.supplier_id = sr.supplier_id
            AND sr.return_date BETWEEN p_from_date AND p_to_date
        LEFT JOIN LATERAL (
            SELECT SUM(sri.return_quantity * sri.rate_per_unit) as return_value
            FROM procurement.supplier_return_items sri
            WHERE sri.return_id = sr.return_id
        ) sr_items ON true
        WHERE (p_supplier_id IS NULL OR s.supplier_id = p_supplier_id)
        AND s.is_active = TRUE
        GROUP BY s.supplier_id, s.supplier_name, s.supplier_code
    )
    SELECT jsonb_build_object(
        'suppliers', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'supplier_id', sm.supplier_id,
                    'supplier_name', sm.supplier_name,
                    'supplier_code', sm.supplier_code,
                    'total_orders', sm.total_orders,
                    'total_deliveries', sm.total_deliveries,
                    'total_purchase_value', ROUND(sm.total_purchase_value, 2),
                    'avg_delivery_days', ROUND(sm.avg_delivery_time, 1),
                    'on_time_delivery_rate', ROUND(sm.on_time_delivery_rate, 2),
                    'quality_acceptance_rate', ROUND(sm.quality_acceptance_rate, 2),
                    'return_count', sm.return_count,
                    'return_value', ROUND(sm.total_return_value, 2),
                    'return_rate', CASE 
                        WHEN sm.total_purchase_value > 0 
                        THEN ROUND((sm.total_return_value / sm.total_purchase_value) * 100, 2)
                        ELSE 0 
                    END,
                    'performance_score', ROUND(
                        (COALESCE(sm.on_time_delivery_rate, 0) * 0.4 +
                         COALESCE(sm.quality_acceptance_rate, 0) * 0.4 +
                         (100 - LEAST(100, COALESCE(sm.total_return_value / NULLIF(sm.total_purchase_value, 0) * 100, 0))) * 0.2),
                        2
                    )
                ) ORDER BY sm.total_purchase_value DESC
            ), 
            '[]'::jsonb
        ),
        'period', jsonb_build_object(
            'from_date', p_from_date,
            'to_date', p_to_date
        )
    ) INTO v_result
    FROM supplier_metrics sm;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.search_suppliers TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.create_purchase_order TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_purchase_orders TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.create_grn TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_pending_deliveries TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_supplier_performance TO authenticated_user;

COMMENT ON FUNCTION api.search_suppliers IS 'Search suppliers with product mapping and credit info';
COMMENT ON FUNCTION api.create_purchase_order IS 'Create a new purchase order with items';
COMMENT ON FUNCTION api.get_purchase_orders IS 'Get purchase orders with filters and receiving status';
COMMENT ON FUNCTION api.create_grn IS 'Create GRN with batch creation and inventory update';
COMMENT ON FUNCTION api.get_pending_deliveries IS 'Get pending deliveries with overdue analysis';
COMMENT ON FUNCTION api.get_supplier_performance IS 'Get supplier performance metrics and scoring';