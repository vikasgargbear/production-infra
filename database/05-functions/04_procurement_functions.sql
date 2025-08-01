-- =============================================
-- PROCUREMENT BUSINESS FUNCTIONS
-- =============================================
-- Advanced procurement operations including purchase orders,
-- GRN processing, supplier management, and payment tracking
-- =============================================

-- =============================================
-- 1. CREATE PURCHASE ORDER WITH VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION create_purchase_order(
    p_org_id INTEGER,
    p_branch_id INTEGER,
    p_supplier_id INTEGER,
    p_po_items JSONB,
    p_delivery_date DATE DEFAULT NULL,
    p_payment_terms TEXT DEFAULT '30days',
    p_special_terms TEXT DEFAULT NULL,
    p_created_by INTEGER DEFAULT 0
)
RETURNS TABLE (
    po_id INTEGER,
    po_number TEXT,
    po_status TEXT,
    total_amount NUMERIC,
    budget_check_result JSONB,
    price_analysis JSONB
) AS $$
DECLARE
    v_po_id INTEGER;
    v_po_number TEXT;
    v_supplier_info RECORD;
    v_item JSONB;
    v_product_info RECORD;
    v_total_amount NUMERIC := 0;
    v_price_analysis JSONB := '[]'::JSONB;
    v_budget_available BOOLEAN := TRUE;
BEGIN
    -- Validate supplier
    SELECT * INTO v_supplier_info
    FROM parties.suppliers
    WHERE supplier_id = p_supplier_id
    AND is_active = TRUE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supplier not found or inactive';
    END IF;
    
    -- Generate PO number
    v_po_number := 'PO-' || p_branch_id || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                   LPAD(NEXTVAL('procurement.po_number_seq')::TEXT, 6, '0');
    
    -- Create PO header
    INSERT INTO procurement.purchase_orders (
        org_id,
        branch_id,
        po_number,
        po_date,
        supplier_id,
        expected_delivery,
        payment_terms,
        special_terms,
        po_status,
        created_by,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        v_po_number,
        CURRENT_DATE,
        p_supplier_id,
        COALESCE(p_delivery_date, CURRENT_DATE + INTERVAL '7 days'),
        p_payment_terms,
        p_special_terms,
        'draft',
        p_created_by,
        CURRENT_TIMESTAMP
    ) RETURNING purchase_orders.po_id INTO v_po_id;
    
    -- Process PO items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_po_items)
    LOOP
        -- Get product info
        SELECT 
            p.*,
            sp.last_supply_price,
            sp.last_supply_date
        INTO v_product_info
        FROM inventory.products p
        LEFT JOIN procurement.supplier_products sp ON 
            p.product_id = sp.product_id AND 
            sp.supplier_id = p_supplier_id
        WHERE p.product_id = (v_item->>'product_id')::INTEGER
        AND p.is_active = TRUE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_item->>'product_id';
        END IF;
        
        -- Analyze price
        DECLARE
            v_quantity NUMERIC := (v_item->>'quantity')::NUMERIC;
            v_unit_price NUMERIC := (v_item->>'unit_price')::NUMERIC;
            v_item_amount NUMERIC;
            v_price_variance NUMERIC := 0;
        BEGIN
            -- Calculate price variance if historical price exists
            IF v_product_info.last_supply_price IS NOT NULL THEN
                v_price_variance := ((v_unit_price - v_product_info.last_supply_price) / 
                                    v_product_info.last_supply_price) * 100;
            END IF;
            
            v_item_amount := v_quantity * v_unit_price;
            
            -- Insert PO item
            INSERT INTO procurement.purchase_order_items (
                po_id,
                product_id,
                product_name,
                quantity_ordered,
                pack_unit,
                pack_size,
                unit_price,
                mrp,
                ptr,
                item_amount,
                free_quantity,
                scheme_discount,
                net_amount,
                price_variance_percent,
                created_at
            ) VALUES (
                v_po_id,
                v_product_info.product_id,
                v_product_info.product_name,
                v_quantity,
                COALESCE(v_item->>'pack_unit', 'units'),
                COALESCE((v_item->>'pack_size')::INTEGER, 1),
                v_unit_price,
                (v_item->>'mrp')::NUMERIC,
                (v_item->>'ptr')::NUMERIC,
                v_item_amount,
                COALESCE((v_item->>'free_quantity')::NUMERIC, 0),
                COALESCE((v_item->>'scheme_discount')::NUMERIC, 0),
                v_item_amount - COALESCE((v_item->>'scheme_discount')::NUMERIC, 0),
                v_price_variance,
                CURRENT_TIMESTAMP
            );
            
            v_total_amount := v_total_amount + v_item_amount - 
                             COALESCE((v_item->>'scheme_discount')::NUMERIC, 0);
            
            -- Add to price analysis
            v_price_analysis := v_price_analysis || jsonb_build_array(
                jsonb_build_object(
                    'product_id', v_product_info.product_id,
                    'product_name', v_product_info.product_name,
                    'current_price', v_unit_price,
                    'last_price', v_product_info.last_supply_price,
                    'price_variance', v_price_variance,
                    'last_supply_date', v_product_info.last_supply_date
                )
            );
        END;
    END LOOP;
    
    -- Update PO totals
    UPDATE procurement.purchase_orders
    SET 
        total_amount = v_total_amount,
        price_analysis = v_price_analysis,
        updated_at = CURRENT_TIMESTAMP
    WHERE purchase_orders.po_id = v_po_id;
    
    -- Check budget if configured
    DECLARE
        v_budget_result JSONB;
    BEGIN
        SELECT check_procurement_budget(
            p_branch_id,
            v_total_amount,
            EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER,
            EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
        ) INTO v_budget_result;
        
        IF NOT (v_budget_result->>'budget_available')::BOOLEAN THEN
            UPDATE procurement.purchase_orders
            SET po_status = 'budget_hold',
                budget_check_notes = v_budget_result->>'message'
            WHERE purchase_orders.po_id = v_po_id;
            
            v_budget_available := FALSE;
        END IF;
    END;
    
    -- Return PO summary
    RETURN QUERY
    SELECT 
        po.po_id,
        po.po_number,
        po.po_status,
        po.total_amount,
        CASE 
            WHEN v_budget_available THEN 
                jsonb_build_object('budget_available', TRUE)
            ELSE 
                jsonb_build_object(
                    'budget_available', FALSE,
                    'message', po.budget_check_notes
                )
        END as budget_check_result,
        po.price_analysis
    FROM procurement.purchase_orders po
    WHERE po.po_id = v_po_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. PROCESS GOODS RECEIPT NOTE (GRN)
-- =============================================
CREATE OR REPLACE FUNCTION process_goods_receipt(
    p_po_id INTEGER,
    p_grn_items JSONB,
    p_invoice_number TEXT,
    p_invoice_date DATE,
    p_received_by INTEGER DEFAULT 0
)
RETURNS TABLE (
    grn_id INTEGER,
    grn_number TEXT,
    grn_status TEXT,
    total_accepted NUMERIC,
    total_rejected NUMERIC,
    batch_creation_status JSONB
) AS $$
DECLARE
    v_po RECORD;
    v_grn_id INTEGER;
    v_grn_number TEXT;
    v_grn_item JSONB;
    v_po_item RECORD;
    v_batch_results JSONB := '[]'::JSONB;
    v_total_accepted_value NUMERIC := 0;
    v_total_rejected_value NUMERIC := 0;
BEGIN
    -- Validate PO
    SELECT * INTO v_po
    FROM procurement.purchase_orders
    WHERE po_id = p_po_id
    AND po_status IN ('approved', 'partial_received');
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PO not found or not in valid status for receiving';
    END IF;
    
    -- Generate GRN number
    v_grn_number := 'GRN-' || v_po.branch_id || '-' || 
                    TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                    LPAD(NEXTVAL('procurement.grn_number_seq')::TEXT, 6, '0');
    
    -- Create GRN header
    INSERT INTO procurement.goods_receipt_notes (
        org_id,
        branch_id,
        grn_number,
        grn_date,
        po_id,
        supplier_id,
        supplier_invoice_number,
        supplier_invoice_date,
        grn_status,
        received_by,
        created_at
    ) VALUES (
        v_po.org_id,
        v_po.branch_id,
        v_grn_number,
        CURRENT_DATE,
        p_po_id,
        v_po.supplier_id,
        p_invoice_number,
        p_invoice_date,
        'draft',
        p_received_by,
        CURRENT_TIMESTAMP
    ) RETURNING goods_receipt_notes.grn_id INTO v_grn_id;
    
    -- Process GRN items
    FOR v_grn_item IN SELECT * FROM jsonb_array_elements(p_grn_items)
    LOOP
        -- Get PO item details
        SELECT * INTO v_po_item
        FROM procurement.purchase_order_items
        WHERE po_item_id = (v_grn_item->>'po_item_id')::INTEGER
        AND po_id = p_po_id;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'PO item not found';
        END IF;
        
        -- Create or update batch
        DECLARE
            v_batch_id INTEGER;
            v_batch_number TEXT := v_grn_item->>'batch_number';
            v_expiry_date DATE := (v_grn_item->>'expiry_date')::DATE;
            v_accepted_qty NUMERIC := (v_grn_item->>'accepted_quantity')::NUMERIC;
            v_rejected_qty NUMERIC := COALESCE((v_grn_item->>'rejected_quantity')::NUMERIC, 0);
        BEGIN
            -- Check if batch exists
            SELECT batch_id INTO v_batch_id
            FROM inventory.batches
            WHERE product_id = v_po_item.product_id
            AND batch_number = v_batch_number
            AND supplier_id = v_po.supplier_id;
            
            IF v_batch_id IS NULL THEN
                -- Create new batch
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
                    trade_price_per_unit,
                    batch_status,
                    created_by,
                    created_at
                ) VALUES (
                    v_po.org_id,
                    v_po_item.product_id,
                    v_batch_number,
                    (v_grn_item->>'manufacturing_date')::DATE,
                    v_expiry_date,
                    v_po.supplier_id,
                    v_accepted_qty,
                    v_accepted_qty,
                    v_po_item.unit_price,
                    v_po_item.mrp,
                    v_po_item.ptr,
                    v_po_item.ptr * 0.95, -- 5% margin from PTR
                    'active',
                    p_received_by,
                    CURRENT_TIMESTAMP
                ) RETURNING batch_id INTO v_batch_id;
            ELSE
                -- Update existing batch
                UPDATE inventory.batches
                SET 
                    quantity_received = quantity_received + v_accepted_qty,
                    quantity_available = quantity_available + v_accepted_qty,
                    cost_per_unit = ((quantity_received * cost_per_unit + 
                                     v_accepted_qty * v_po_item.unit_price) / 
                                    (quantity_received + v_accepted_qty)),
                    updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = v_batch_id;
            END IF;
            
            -- Insert GRN item
            INSERT INTO procurement.grn_items (
                grn_id,
                po_item_id,
                product_id,
                batch_number,
                manufacturing_date,
                expiry_date,
                received_quantity,
                accepted_quantity,
                rejected_quantity,
                rejection_reason,
                unit_price,
                mrp,
                ptr,
                item_amount,
                qc_status,
                qc_notes,
                storage_location_id,
                created_at
            ) VALUES (
                v_grn_id,
                v_po_item.po_item_id,
                v_po_item.product_id,
                v_batch_number,
                (v_grn_item->>'manufacturing_date')::DATE,
                v_expiry_date,
                v_accepted_qty + v_rejected_qty,
                v_accepted_qty,
                v_rejected_qty,
                v_grn_item->>'rejection_reason',
                v_po_item.unit_price,
                v_po_item.mrp,
                v_po_item.ptr,
                v_accepted_qty * v_po_item.unit_price,
                COALESCE(v_grn_item->>'qc_status', 'passed'),
                v_grn_item->>'qc_notes',
                (v_grn_item->>'storage_location_id')::INTEGER,
                CURRENT_TIMESTAMP
            );
            
            -- Add to batch results
            v_batch_results := v_batch_results || jsonb_build_array(
                jsonb_build_object(
                    'batch_id', v_batch_id,
                    'batch_number', v_batch_number,
                    'product_id', v_po_item.product_id,
                    'quantity_added', v_accepted_qty,
                    'status', 'created'
                )
            );
            
            v_total_accepted_value := v_total_accepted_value + (v_accepted_qty * v_po_item.unit_price);
            v_total_rejected_value := v_total_rejected_value + (v_rejected_qty * v_po_item.unit_price);
            
            -- Update PO item received quantity
            UPDATE procurement.purchase_order_items
            SET 
                quantity_received = COALESCE(quantity_received, 0) + v_accepted_qty + v_rejected_qty,
                quantity_accepted = COALESCE(quantity_accepted, 0) + v_accepted_qty,
                updated_at = CURRENT_TIMESTAMP
            WHERE po_item_id = v_po_item.po_item_id;
        END;
    END LOOP;
    
    -- Update GRN totals
    UPDATE procurement.goods_receipt_notes
    SET 
        total_amount = v_total_accepted_value,
        rejected_amount = v_total_rejected_value,
        grn_status = 'pending_approval',
        updated_at = CURRENT_TIMESTAMP
    WHERE grn_id = v_grn_id;
    
    -- Check if PO is fully received
    UPDATE procurement.purchase_orders
    SET po_status = CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM procurement.purchase_order_items
            WHERE po_id = p_po_id
            AND quantity_ordered > COALESCE(quantity_received, 0)
        ) THEN 'received'
        ELSE 'partial_received'
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE po_id = p_po_id;
    
    -- Return GRN summary
    RETURN QUERY
    SELECT 
        g.grn_id,
        g.grn_number,
        g.grn_status,
        g.total_amount as total_accepted,
        g.rejected_amount as total_rejected,
        v_batch_results as batch_creation_status
    FROM procurement.goods_receipt_notes g
    WHERE g.grn_id = v_grn_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. SUPPLIER PERFORMANCE ANALYTICS
-- =============================================
CREATE OR REPLACE FUNCTION analyze_supplier_performance(
    p_supplier_id INTEGER,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 year',
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_orders INTEGER,
    total_order_value NUMERIC,
    average_order_value NUMERIC,
    on_time_delivery_rate NUMERIC,
    quality_acceptance_rate NUMERIC,
    price_stability_score NUMERIC,
    payment_terms_compliance NUMERIC,
    product_performance JSONB,
    monthly_trend JSONB,
    quality_issues JSONB
) AS $$
DECLARE
    v_product_perf JSONB;
    v_monthly_trend JSONB;
    v_quality_issues JSONB;
BEGIN
    -- Product performance
    SELECT jsonb_agg(
        jsonb_build_object(
            'product_id', product_id,
            'product_name', product_name,
            'total_quantity', total_quantity,
            'total_value', total_value,
            'avg_price', avg_price,
            'price_variance', price_variance,
            'quality_rate', quality_rate
        ) ORDER BY total_value DESC
    )
    INTO v_product_perf
    FROM (
        SELECT 
            poi.product_id,
            poi.product_name,
            SUM(gi.accepted_quantity) as total_quantity,
            SUM(gi.item_amount) as total_value,
            AVG(gi.unit_price) as avg_price,
            STDDEV(gi.unit_price) / NULLIF(AVG(gi.unit_price), 0) * 100 as price_variance,
            SUM(gi.accepted_quantity) * 100.0 / 
                NULLIF(SUM(gi.received_quantity), 0) as quality_rate
        FROM procurement.grn_items gi
        JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
        JOIN procurement.purchase_order_items poi ON gi.po_item_id = poi.po_item_id
        WHERE g.supplier_id = p_supplier_id
        AND g.grn_date BETWEEN p_from_date AND p_to_date
        AND g.grn_status = 'approved'
        GROUP BY poi.product_id, poi.product_name
    ) product_summary;
    
    -- Monthly trend
    SELECT jsonb_agg(
        jsonb_build_object(
            'month', TO_CHAR(month_date, 'YYYY-MM'),
            'order_count', order_count,
            'order_value', order_value,
            'on_time_rate', on_time_rate,
            'quality_rate', quality_rate
        ) ORDER BY month_date
    )
    INTO v_monthly_trend
    FROM (
        SELECT 
            DATE_TRUNC('month', po.po_date) as month_date,
            COUNT(DISTINCT po.po_id) as order_count,
            SUM(po.total_amount) as order_value,
            AVG(CASE 
                WHEN g.grn_date <= po.expected_delivery THEN 100
                ELSE 0
            END) as on_time_rate,
            AVG(gi.accepted_quantity * 100.0 / NULLIF(gi.received_quantity, 0)) as quality_rate
        FROM procurement.purchase_orders po
        LEFT JOIN procurement.goods_receipt_notes g ON po.po_id = g.po_id
        LEFT JOIN procurement.grn_items gi ON g.grn_id = gi.grn_id
        WHERE po.supplier_id = p_supplier_id
        AND po.po_date BETWEEN p_from_date AND p_to_date
        GROUP BY DATE_TRUNC('month', po.po_date)
    ) monthly_summary;
    
    -- Quality issues
    SELECT jsonb_agg(
        jsonb_build_object(
            'grn_number', grn_number,
            'grn_date', grn_date,
            'product_name', product_name,
            'rejected_quantity', rejected_quantity,
            'rejection_reason', rejection_reason,
            'value_impact', value_impact
        ) ORDER BY grn_date DESC
    )
    INTO v_quality_issues
    FROM (
        SELECT 
            g.grn_number,
            g.grn_date,
            poi.product_name,
            gi.rejected_quantity,
            gi.rejection_reason,
            gi.rejected_quantity * gi.unit_price as value_impact
        FROM procurement.grn_items gi
        JOIN procurement.goods_receipt_notes g ON gi.grn_id = g.grn_id
        JOIN procurement.purchase_order_items poi ON gi.po_item_id = poi.po_item_id
        WHERE g.supplier_id = p_supplier_id
        AND g.grn_date BETWEEN p_from_date AND p_to_date
        AND gi.rejected_quantity > 0
        ORDER BY g.grn_date DESC
        LIMIT 20
    ) quality_summary;
    
    -- Return analytics
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT po.po_id)::INTEGER as total_orders,
        COALESCE(SUM(po.total_amount), 0) as total_order_value,
        COALESCE(AVG(po.total_amount), 0) as average_order_value,
        -- On-time delivery rate
        COALESCE(AVG(CASE 
            WHEN g.grn_date IS NOT NULL AND g.grn_date <= po.expected_delivery THEN 100
            WHEN g.grn_date IS NOT NULL THEN 0
            ELSE NULL
        END), 0) as on_time_delivery_rate,
        -- Quality acceptance rate
        COALESCE(SUM(gi.accepted_quantity) * 100.0 / 
            NULLIF(SUM(gi.received_quantity), 0), 100) as quality_acceptance_rate,
        -- Price stability (lower is better)
        COALESCE(100 - AVG(ABS(poi.price_variance_percent)), 100) as price_stability_score,
        -- Payment terms compliance
        COALESCE(AVG(CASE
            WHEN p.payment_date <= si.due_date THEN 100
            ELSE 0
        END), 0) as payment_terms_compliance,
        v_product_perf as product_performance,
        v_monthly_trend as monthly_trend,
        v_quality_issues as quality_issues
    FROM procurement.purchase_orders po
    LEFT JOIN procurement.goods_receipt_notes g ON po.po_id = g.po_id
    LEFT JOIN procurement.grn_items gi ON g.grn_id = gi.grn_id
    LEFT JOIN procurement.purchase_order_items poi ON po.po_id = poi.po_id
    LEFT JOIN procurement.supplier_invoices si ON g.grn_id = si.grn_id
    LEFT JOIN financial.payments p ON 
        p.reference_type = 'supplier_invoice' AND 
        p.reference_id = si.invoice_id
    WHERE po.supplier_id = p_supplier_id
    AND po.po_date BETWEEN p_from_date AND p_to_date;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. AUTOMATIC REORDER GENERATION
-- =============================================
CREATE OR REPLACE FUNCTION generate_automatic_reorders(
    p_branch_id INTEGER,
    p_created_by INTEGER DEFAULT 0
)
RETURNS TABLE (
    requisition_count INTEGER,
    total_items INTEGER,
    estimated_value NUMERIC,
    critical_items JSONB
) AS $$
DECLARE
    v_requisition_id INTEGER;
    v_requisition_count INTEGER := 0;
    v_total_items INTEGER := 0;
    v_estimated_value NUMERIC := 0;
    v_critical_items JSONB := '[]'::JSONB;
    v_product RECORD;
BEGIN
    -- Find products below reorder level
    FOR v_product IN
        SELECT 
            p.product_id,
            p.product_name,
            p.reorder_level,
            p.reorder_quantity,
            p.default_supplier_id,
            COALESCE(SUM(lws.quantity_available), 0) as current_stock,
            COALESCE(AVG(b.cost_per_unit), p.last_purchase_price) as estimated_cost
        FROM inventory.products p
        LEFT JOIN inventory.location_wise_stock lws ON 
            p.product_id = lws.product_id AND
            EXISTS (SELECT 1 FROM inventory.storage_locations sl 
                   WHERE sl.location_id = lws.location_id 
                   AND sl.branch_id = p_branch_id)
        LEFT JOIN inventory.batches b ON 
            p.product_id = b.product_id AND
            b.batch_status = 'active'
        WHERE p.is_active = TRUE
        AND p.reorder_level IS NOT NULL
        AND p.reorder_level > 0
        GROUP BY p.product_id
        HAVING COALESCE(SUM(lws.quantity_available), 0) <= p.reorder_level
    LOOP
        -- Check if requisition already exists
        IF NOT EXISTS (
            SELECT 1 FROM procurement.purchase_requisitions pr
            JOIN procurement.requisition_items ri ON pr.requisition_id = ri.requisition_id
            WHERE pr.branch_id = p_branch_id
            AND pr.requisition_status IN ('draft', 'pending_approval')
            AND ri.product_id = v_product.product_id
            AND pr.created_at > CURRENT_DATE - INTERVAL '7 days'
        ) THEN
            -- Create or get requisition
            IF v_requisition_id IS NULL THEN
                INSERT INTO procurement.purchase_requisitions (
                    org_id,
                    branch_id,
                    requisition_number,
                    requisition_date,
                    requisition_type,
                    requisition_status,
                    priority,
                    notes,
                    created_by,
                    created_at
                )
                SELECT 
                    sl.org_id,
                    p_branch_id,
                    'REQ-' || p_branch_id || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-AUTO',
                    CURRENT_DATE,
                    'automatic_reorder',
                    'draft',
                    'normal',
                    'Automatic reorder based on stock levels',
                    p_created_by,
                    CURRENT_TIMESTAMP
                FROM inventory.storage_locations sl
                WHERE sl.branch_id = p_branch_id
                LIMIT 1
                RETURNING requisition_id INTO v_requisition_id;
                
                v_requisition_count := v_requisition_count + 1;
            END IF;
            
            -- Add requisition item
            INSERT INTO procurement.requisition_items (
                requisition_id,
                product_id,
                product_name,
                current_stock,
                reorder_level,
                requested_quantity,
                suggested_supplier_id,
                estimated_cost,
                justification,
                created_at
            ) VALUES (
                v_requisition_id,
                v_product.product_id,
                v_product.product_name,
                v_product.current_stock,
                v_product.reorder_level,
                COALESCE(v_product.reorder_quantity, v_product.reorder_level * 2),
                v_product.default_supplier_id,
                v_product.estimated_cost,
                format('Stock level (%s) below reorder point (%s)', 
                       v_product.current_stock, v_product.reorder_level),
                CURRENT_TIMESTAMP
            );
            
            v_total_items := v_total_items + 1;
            v_estimated_value := v_estimated_value + 
                (COALESCE(v_product.reorder_quantity, v_product.reorder_level * 2) * 
                 v_product.estimated_cost);
            
            -- Add to critical items if stock is very low
            IF v_product.current_stock <= v_product.reorder_level * 0.25 THEN
                v_critical_items := v_critical_items || jsonb_build_array(
                    jsonb_build_object(
                        'product_id', v_product.product_id,
                        'product_name', v_product.product_name,
                        'current_stock', v_product.current_stock,
                        'reorder_level', v_product.reorder_level,
                        'days_of_stock', CASE 
                            WHEN v_product.current_stock > 0 THEN
                                ROUND(v_product.current_stock / 
                                      (SELECT AVG(daily_consumption) 
                                       FROM analytics.product_consumption_stats 
                                       WHERE product_id = v_product.product_id), 1)
                            ELSE 0
                        END
                    )
                );
            END IF;
        END IF;
    END LOOP;
    
    -- Return summary
    RETURN QUERY
    SELECT 
        v_requisition_count as requisition_count,
        v_total_items as total_items,
        v_estimated_value as estimated_value,
        v_critical_items as critical_items;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. PURCHASE BUDGET MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION check_procurement_budget(
    p_branch_id INTEGER,
    p_amount NUMERIC,
    p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER,
    p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_budget_limit NUMERIC;
    v_utilized_amount NUMERIC;
    v_available_amount NUMERIC;
BEGIN
    -- Get budget limit
    SELECT budget_amount
    INTO v_budget_limit
    FROM procurement.branch_budgets
    WHERE branch_id = p_branch_id
    AND budget_month = p_month
    AND budget_year = p_year
    AND is_active = TRUE;
    
    IF v_budget_limit IS NULL THEN
        -- No budget set, allow all
        RETURN jsonb_build_object(
            'budget_available', TRUE,
            'budget_limit', NULL,
            'message', 'No budget limit set'
        );
    END IF;
    
    -- Calculate utilized amount
    SELECT COALESCE(SUM(po.total_amount), 0)
    INTO v_utilized_amount
    FROM procurement.purchase_orders po
    WHERE po.branch_id = p_branch_id
    AND EXTRACT(MONTH FROM po.po_date) = p_month
    AND EXTRACT(YEAR FROM po.po_date) = p_year
    AND po.po_status NOT IN ('cancelled', 'rejected');
    
    v_available_amount := v_budget_limit - v_utilized_amount;
    
    RETURN jsonb_build_object(
        'budget_available', v_available_amount >= p_amount,
        'budget_limit', v_budget_limit,
        'utilized_amount', v_utilized_amount,
        'available_amount', v_available_amount,
        'requested_amount', p_amount,
        'utilization_percent', ROUND(v_utilized_amount / v_budget_limit * 100, 2),
        'message', CASE 
            WHEN v_available_amount >= p_amount THEN 'Budget available'
            ELSE format('Budget exceeded by ₹%s', p_amount - v_available_amount)
        END
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 6. SUPPLIER PAYMENT TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_supplier_payments(
    p_supplier_id INTEGER,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_outstanding NUMERIC,
    overdue_amount NUMERIC,
    current_amount NUMERIC,
    payment_performance JSONB,
    aging_analysis JSONB,
    pending_invoices JSONB
) AS $$
DECLARE
    v_payment_perf JSONB;
    v_aging JSONB;
    v_pending JSONB;
BEGIN
    -- Payment performance
    SELECT jsonb_build_object(
        'total_invoices', COUNT(*),
        'paid_on_time', COUNT(*) FILTER (WHERE p.payment_date <= si.due_date),
        'paid_late', COUNT(*) FILTER (WHERE p.payment_date > si.due_date),
        'average_payment_days', AVG(p.payment_date - si.invoice_date),
        'total_paid', SUM(p.payment_amount)
    )
    INTO v_payment_perf
    FROM procurement.supplier_invoices si
    LEFT JOIN financial.payments p ON 
        p.reference_type = 'supplier_invoice' AND 
        p.reference_id = si.invoice_id AND
        p.payment_status = 'cleared'
    WHERE si.supplier_id = p_supplier_id
    AND si.invoice_status = 'posted'
    AND p.payment_id IS NOT NULL;
    
    -- Aging analysis
    SELECT jsonb_build_object(
        '0-30_days', SUM(CASE WHEN days_overdue BETWEEN 0 AND 30 THEN outstanding_amount ELSE 0 END),
        '31-60_days', SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN outstanding_amount ELSE 0 END),
        '61-90_days', SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN outstanding_amount ELSE 0 END),
        'over_90_days', SUM(CASE WHEN days_overdue > 90 THEN outstanding_amount ELSE 0 END)
    )
    INTO v_aging
    FROM (
        SELECT 
            si.invoice_id,
            si.total_amount - COALESCE(SUM(p.payment_amount), 0) as outstanding_amount,
            GREATEST(0, p_as_of_date - si.due_date) as days_overdue
        FROM procurement.supplier_invoices si
        LEFT JOIN financial.payments p ON 
            p.reference_type = 'supplier_invoice' AND 
            p.reference_id = si.invoice_id AND
            p.payment_status = 'cleared'
        WHERE si.supplier_id = p_supplier_id
        AND si.invoice_status = 'posted'
        GROUP BY si.invoice_id, si.total_amount, si.due_date
        HAVING si.total_amount > COALESCE(SUM(p.payment_amount), 0)
    ) outstanding;
    
    -- Pending invoices
    SELECT jsonb_agg(
        jsonb_build_object(
            'invoice_id', invoice_id,
            'invoice_number', invoice_number,
            'invoice_date', invoice_date,
            'due_date', due_date,
            'total_amount', total_amount,
            'paid_amount', paid_amount,
            'outstanding_amount', outstanding_amount,
            'days_overdue', days_overdue,
            'grn_number', grn_number
        ) ORDER BY due_date
    )
    INTO v_pending
    FROM (
        SELECT 
            si.invoice_id,
            si.invoice_number,
            si.invoice_date,
            si.due_date,
            si.total_amount,
            COALESCE(SUM(p.payment_amount), 0) as paid_amount,
            si.total_amount - COALESCE(SUM(p.payment_amount), 0) as outstanding_amount,
            GREATEST(0, p_as_of_date - si.due_date) as days_overdue,
            g.grn_number
        FROM procurement.supplier_invoices si
        JOIN procurement.goods_receipt_notes g ON si.grn_id = g.grn_id
        LEFT JOIN financial.payments p ON 
            p.reference_type = 'supplier_invoice' AND 
            p.reference_id = si.invoice_id AND
            p.payment_status = 'cleared'
        WHERE si.supplier_id = p_supplier_id
        AND si.invoice_status = 'posted'
        GROUP BY si.invoice_id, si.invoice_number, si.invoice_date, 
                 si.due_date, si.total_amount, g.grn_number
        HAVING si.total_amount > COALESCE(SUM(p.payment_amount), 0)
        LIMIT 50
    ) pending_list;
    
    -- Return summary
    RETURN QUERY
    SELECT 
        COALESCE(SUM(si.total_amount - COALESCE(paid.paid_amount, 0)), 0) as total_outstanding,
        COALESCE(SUM(CASE 
            WHEN si.due_date < p_as_of_date 
            THEN si.total_amount - COALESCE(paid.paid_amount, 0) 
            ELSE 0 
        END), 0) as overdue_amount,
        COALESCE(SUM(CASE 
            WHEN si.due_date >= p_as_of_date 
            THEN si.total_amount - COALESCE(paid.paid_amount, 0) 
            ELSE 0 
        END), 0) as current_amount,
        v_payment_perf as payment_performance,
        v_aging as aging_analysis,
        v_pending as pending_invoices
    FROM procurement.supplier_invoices si
    LEFT JOIN (
        SELECT 
            reference_id,
            SUM(payment_amount) as paid_amount
        FROM financial.payments
        WHERE reference_type = 'supplier_invoice'
        AND payment_status = 'cleared'
        GROUP BY reference_id
    ) paid ON si.invoice_id = paid.reference_id
    WHERE si.supplier_id = p_supplier_id
    AND si.invoice_status = 'posted';
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SUPPORTING TABLES
-- =============================================

-- Branch budgets
CREATE TABLE IF NOT EXISTS procurement.branch_budgets (
    budget_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    budget_month INTEGER NOT NULL CHECK (budget_month BETWEEN 1 AND 12),
    budget_year INTEGER NOT NULL,
    budget_amount NUMERIC(15,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, budget_month, budget_year)
);

-- Product consumption stats
CREATE TABLE IF NOT EXISTS analytics.product_consumption_stats (
    stat_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    product_id INTEGER REFERENCES inventory.products(product_id),
    branch_id INTEGER,
    calculation_date DATE NOT NULL,
    daily_consumption NUMERIC(12,3),
    weekly_consumption NUMERIC(12,3),
    monthly_consumption NUMERIC(12,3),
    trend_direction TEXT CHECK (trend_direction IN ('increasing', 'stable', 'decreasing')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for consumption patterns
CREATE INDEX IF NOT EXISTS idx_consumption_product_date ON analytics.product_consumption_stats(product_id, calculation_date);

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX idx_po_supplier_date ON procurement.purchase_orders(supplier_id, po_date);
CREATE INDEX idx_grn_supplier_date ON procurement.goods_receipt_notes(supplier_id, grn_date);
CREATE INDEX idx_supplier_invoices_due ON procurement.supplier_invoices(supplier_id, due_date);
CREATE INDEX idx_requisitions_branch_status ON procurement.purchase_requisitions(branch_id, requisition_status);

-- =============================================
-- GRANTS
-- =============================================
GRANT EXECUTE ON FUNCTION create_purchase_order TO procurement_user;
GRANT EXECUTE ON FUNCTION process_goods_receipt TO warehouse_user;
GRANT EXECUTE ON FUNCTION analyze_supplier_performance TO procurement_manager, analytics_user;
GRANT EXECUTE ON FUNCTION generate_automatic_reorders TO system, procurement_user;
GRANT EXECUTE ON FUNCTION track_supplier_payments TO finance_user, procurement_manager;

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON FUNCTION create_purchase_order IS 'Creates purchase order with validation and budget check';
COMMENT ON FUNCTION process_goods_receipt IS 'Processes GRN with batch creation and quality check';
COMMENT ON FUNCTION analyze_supplier_performance IS 'Comprehensive supplier performance analytics';
COMMENT ON FUNCTION generate_automatic_reorders IS 'Generates purchase requisitions based on reorder levels';
COMMENT ON FUNCTION check_procurement_budget IS 'Validates purchase against monthly budget';
COMMENT ON FUNCTION track_supplier_payments IS 'Tracks supplier payment status and aging';