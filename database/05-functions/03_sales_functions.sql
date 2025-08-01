-- =============================================
-- SALES BUSINESS FUNCTIONS
-- =============================================
-- Advanced sales operations including order management,
-- invoice generation, scheme calculation, and returns
-- =============================================

-- =============================================
-- 1. CREATE SALES ORDER WITH VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION create_sales_order(
    p_org_id INTEGER,
    p_branch_id INTEGER,
    p_customer_id INTEGER,
    p_order_items JSONB,
    p_delivery_date DATE DEFAULT NULL,
    p_payment_terms TEXT DEFAULT 'credit',
    p_special_instructions TEXT DEFAULT NULL,
    p_created_by INTEGER DEFAULT 0
)
RETURNS TABLE (
    order_id INTEGER,
    order_number TEXT,
    order_status TEXT,
    total_amount NUMERIC,
    applicable_schemes JSONB,
    credit_check_result JSONB
) AS $$
DECLARE
    v_order_id INTEGER;
    v_order_number TEXT;
    v_customer_info RECORD;
    v_item JSONB;
    v_product_info RECORD;
    v_total_amount NUMERIC := 0;
    v_scheme_benefits JSONB := '[]'::JSONB;
    v_credit_available NUMERIC;
    v_batch_allocations JSONB;
BEGIN
    -- Validate customer and get info
    SELECT 
        c.*,
        (c.credit_info->>'credit_limit')::NUMERIC as credit_limit,
        (c.credit_info->>'credit_utilized')::NUMERIC as credit_utilized
    INTO v_customer_info
    FROM parties.customers c
    WHERE c.customer_id = p_customer_id
    AND c.is_active = TRUE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found or inactive';
    END IF;
    
    -- Generate order number
    v_order_number := 'SO-' || p_branch_id || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                      LPAD(NEXTVAL('sales.order_number_seq')::TEXT, 6, '0');
    
    -- Create order header
    INSERT INTO sales.orders (
        org_id,
        branch_id,
        order_number,
        order_date,
        customer_id,
        delivery_date,
        payment_terms,
        order_status,
        special_instructions,
        created_by,
        created_at
    ) VALUES (
        p_org_id,
        p_branch_id,
        v_order_number,
        CURRENT_DATE,
        p_customer_id,
        COALESCE(p_delivery_date, CURRENT_DATE + INTERVAL '1 day'),
        p_payment_terms,
        'draft',
        p_special_instructions,
        p_created_by,
        CURRENT_TIMESTAMP
    ) RETURNING orders.order_id INTO v_order_id;
    
    -- Process order items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
    LOOP
        -- Get product info with pricing
        SELECT 
            p.product_id,
            p.product_name,
            p.hsn_code,
            p.gst_percentage,
            COALESCE(pli.base_unit_price, p.default_sale_price) as unit_price,
            p.pack_configurations
        INTO v_product_info
        FROM inventory.products p
        LEFT JOIN sales.price_list_items pli ON 
            p.product_id = pli.product_id 
            AND pli.customer_category_id = v_customer_info.category_id
            AND pli.is_active = TRUE
        WHERE p.product_id = (v_item->>'product_id')::INTEGER
        AND p.is_active = TRUE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_item->>'product_id';
        END IF;
        
        -- Calculate item amount
        DECLARE
            v_quantity NUMERIC := (v_item->>'quantity')::NUMERIC;
            v_item_amount NUMERIC;
            v_gst_amount NUMERIC;
        BEGIN
            v_item_amount := v_quantity * v_product_info.unit_price;
            v_gst_amount := v_item_amount * v_product_info.gst_percentage / 100;
            
            -- Insert order item
            INSERT INTO sales.order_items (
                order_id,
                product_id,
                product_name,
                hsn_code,
                quantity,
                pack_unit,
                pack_size,
                unit_price,
                base_amount,
                gst_percentage,
                gst_amount,
                total_amount,
                created_at
            ) VALUES (
                v_order_id,
                v_product_info.product_id,
                v_product_info.product_name,
                v_product_info.hsn_code,
                v_quantity,
                COALESCE(v_item->>'pack_unit', 'units'),
                COALESCE((v_item->>'pack_size')::INTEGER, 1),
                v_product_info.unit_price,
                v_item_amount,
                v_product_info.gst_percentage,
                v_gst_amount,
                v_item_amount + v_gst_amount,
                CURRENT_TIMESTAMP
            );
            
            v_total_amount := v_total_amount + v_item_amount + v_gst_amount;
        END;
    END LOOP;
    
    -- Apply applicable schemes
    v_scheme_benefits := calculate_order_schemes(v_order_id);
    
    -- Update order totals
    UPDATE sales.orders
    SET 
        base_amount = v_total_amount - (SELECT SUM((value->>'gst_amount')::NUMERIC) 
                                        FROM jsonb_array_elements(p_order_items) AS value),
        total_gst = (SELECT SUM((oi.gst_amount)) FROM sales.order_items oi WHERE oi.order_id = v_order_id),
        scheme_discount = COALESCE((v_scheme_benefits->>'total_discount')::NUMERIC, 0),
        final_amount = v_total_amount - COALESCE((v_scheme_benefits->>'total_discount')::NUMERIC, 0),
        applicable_schemes = v_scheme_benefits->>'schemes',
        updated_at = CURRENT_TIMESTAMP
    WHERE orders.order_id = v_order_id;
    
    -- Check credit limit if payment terms are credit
    IF p_payment_terms = 'credit' THEN
        v_credit_available := COALESCE(v_customer_info.credit_limit, 0) - 
                             COALESCE(v_customer_info.credit_utilized, 0);
        
        IF v_credit_available < v_total_amount THEN
            -- Update order status to credit_hold
            UPDATE sales.orders
            SET order_status = 'credit_hold',
                credit_check_status = 'failed',
                credit_check_notes = format('Required: ₹%s, Available: ₹%s', 
                                          v_total_amount, v_credit_available)
            WHERE orders.order_id = v_order_id;
        END IF;
    END IF;
    
    -- Return order summary
    RETURN QUERY
    SELECT 
        o.order_id,
        o.order_number,
        o.order_status,
        o.final_amount,
        o.applicable_schemes,
        jsonb_build_object(
            'credit_limit', v_customer_info.credit_limit,
            'credit_utilized', v_customer_info.credit_utilized,
            'credit_available', v_credit_available,
            'order_amount', v_total_amount,
            'credit_check_passed', CASE 
                WHEN p_payment_terms != 'credit' THEN TRUE
                WHEN v_credit_available >= v_total_amount THEN TRUE
                ELSE FALSE
            END
        ) as credit_check_result
    FROM sales.orders o
    WHERE o.order_id = v_order_id;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Rollback by deleting the order
        DELETE FROM sales.orders WHERE orders.order_id = v_order_id;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. CALCULATE AND APPLY SCHEMES
-- =============================================
CREATE OR REPLACE FUNCTION calculate_order_schemes(
    p_order_id INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_applicable_schemes JSONB := '[]'::JSONB;
    v_total_discount NUMERIC := 0;
    v_scheme RECORD;
    v_scheme_benefit JSONB;
    v_product_quantities JSONB;
BEGIN
    -- Get order details
    SELECT 
        o.*,
        c.customer_name,
        c.category_id
    INTO v_order
    FROM sales.orders o
    JOIN parties.customers c ON o.customer_id = c.customer_id
    WHERE o.order_id = p_order_id;
    
    -- Get product quantities
    SELECT jsonb_object_agg(
        oi.product_id::TEXT,
        jsonb_build_object(
            'quantity', oi.quantity,
            'amount', oi.total_amount,
            'product_name', oi.product_name
        )
    )
    INTO v_product_quantities
    FROM sales.order_items oi
    WHERE oi.order_id = p_order_id;
    
    -- Check each active scheme
    FOR v_scheme IN
        SELECT *
        FROM sales.sales_schemes
        WHERE is_active = TRUE
        AND CURRENT_DATE BETWEEN valid_from AND valid_to
        AND (customer_categories IS NULL OR 
             v_order.category_id = ANY(customer_categories))
        AND (branches IS NULL OR 
             v_order.branch_id = ANY(branches))
        ORDER BY priority
    LOOP
        -- Check if products qualify
        IF v_scheme.applicable_products IS NOT NULL THEN
            -- Check if any order product is in scheme products
            IF NOT EXISTS (
                SELECT 1
                FROM jsonb_object_keys(v_product_quantities) AS product_id
                WHERE product_id::INTEGER = ANY(v_scheme.applicable_products)
            ) THEN
                CONTINUE;
            END IF;
        END IF;
        
        -- Calculate scheme benefit
        v_scheme_benefit := calculate_scheme_benefit(
            v_scheme.scheme_id,
            v_scheme.scheme_rules,
            v_product_quantities,
            v_order.base_amount
        );
        
        IF (v_scheme_benefit->>'applicable')::BOOLEAN THEN
            v_applicable_schemes := v_applicable_schemes || jsonb_build_array(
                jsonb_build_object(
                    'scheme_id', v_scheme.scheme_id,
                    'scheme_name', v_scheme.scheme_name,
                    'benefit_type', v_scheme_benefit->>'benefit_type',
                    'benefit_value', v_scheme_benefit->>'benefit_value',
                    'discount_amount', v_scheme_benefit->>'discount_amount'
                )
            );
            
            v_total_discount := v_total_discount + 
                               COALESCE((v_scheme_benefit->>'discount_amount')::NUMERIC, 0);
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'schemes', v_applicable_schemes,
        'total_discount', v_total_discount,
        'calculation_timestamp', CURRENT_TIMESTAMP
    );
END;
$$ LANGUAGE plpgsql;

-- Helper function for scheme calculation
CREATE OR REPLACE FUNCTION calculate_scheme_benefit(
    p_scheme_id INTEGER,
    p_scheme_rules JSONB,
    p_product_quantities JSONB,
    p_order_amount NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_min_quantity NUMERIC;
    v_min_amount NUMERIC;
    v_discount_type TEXT;
    v_discount_value NUMERIC;
    v_discount_amount NUMERIC := 0;
    v_applicable BOOLEAN := FALSE;
BEGIN
    -- Extract scheme rules
    v_min_quantity := (p_scheme_rules->>'min_quantity')::NUMERIC;
    v_min_amount := (p_scheme_rules->>'min_amount')::NUMERIC;
    v_discount_type := p_scheme_rules->>'discount_type';
    v_discount_value := (p_scheme_rules->>'discount_value')::NUMERIC;
    
    -- Check minimum criteria
    IF v_min_amount IS NOT NULL AND p_order_amount < v_min_amount THEN
        RETURN jsonb_build_object('applicable', FALSE);
    END IF;
    
    -- Calculate based on discount type
    IF v_discount_type = 'percentage' THEN
        v_discount_amount := p_order_amount * v_discount_value / 100;
        v_applicable := TRUE;
    ELSIF v_discount_type = 'fixed' THEN
        v_discount_amount := v_discount_value;
        v_applicable := TRUE;
    ELSIF v_discount_type = 'free_goods' THEN
        -- Handle free goods logic
        v_applicable := TRUE;
        -- Free goods don't have direct discount
        v_discount_amount := 0;
    END IF;
    
    RETURN jsonb_build_object(
        'applicable', v_applicable,
        'benefit_type', v_discount_type,
        'benefit_value', v_discount_value,
        'discount_amount', v_discount_amount
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. GENERATE INVOICE FROM ORDER
-- =============================================
CREATE OR REPLACE FUNCTION generate_invoice_from_order(
    p_order_id INTEGER,
    p_invoice_date DATE DEFAULT CURRENT_DATE,
    p_due_date DATE DEFAULT NULL,
    p_created_by INTEGER DEFAULT 0
)
RETURNS TABLE (
    invoice_id INTEGER,
    invoice_number TEXT,
    invoice_status TEXT,
    total_amount NUMERIC,
    batch_allocation_status TEXT
) AS $$
DECLARE
    v_order RECORD;
    v_invoice_id INTEGER;
    v_invoice_number TEXT;
    v_order_item RECORD;
    v_batch_allocation JSONB;
    v_allocation_success BOOLEAN := TRUE;
BEGIN
    -- Get order details
    SELECT * INTO v_order
    FROM sales.orders
    WHERE order_id = p_order_id
    AND order_status IN ('confirmed', 'partial');
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or not in valid status for invoicing';
    END IF;
    
    -- Generate invoice number
    v_invoice_number := 'INV-' || v_order.branch_id || '-' || 
                       TO_CHAR(p_invoice_date, 'YYYYMMDD') || '-' || 
                       LPAD(NEXTVAL('sales.invoice_number_seq')::TEXT, 6, '0');
    
    -- Create invoice header
    INSERT INTO sales.invoices (
        org_id,
        branch_id,
        invoice_number,
        invoice_date,
        customer_id,
        order_id,
        payment_terms,
        due_date,
        base_amount,
        total_gst,
        scheme_discount,
        final_amount,
        invoice_status,
        created_by,
        created_at
    ) VALUES (
        v_order.org_id,
        v_order.branch_id,
        v_invoice_number,
        p_invoice_date,
        v_order.customer_id,
        p_order_id,
        v_order.payment_terms,
        COALESCE(p_due_date, p_invoice_date + 
            CASE v_order.payment_terms
                WHEN 'cash' THEN INTERVAL '0 days'
                WHEN '7days' THEN INTERVAL '7 days'
                WHEN '15days' THEN INTERVAL '15 days'
                WHEN '30days' THEN INTERVAL '30 days'
                ELSE INTERVAL '30 days'
            END),
        v_order.base_amount,
        v_order.total_gst,
        v_order.scheme_discount,
        v_order.final_amount,
        'draft',
        p_created_by,
        CURRENT_TIMESTAMP
    ) RETURNING invoices.invoice_id INTO v_invoice_id;
    
    -- Process each order item
    FOR v_order_item IN
        SELECT * FROM sales.order_items
        WHERE order_id = p_order_id
        AND delivered_quantity < quantity
    LOOP
        -- Allocate batches using FEFO
        v_batch_allocation := allocate_stock_for_sale(
            v_order_item.product_id,
            v_order_item.quantity - v_order_item.delivered_quantity,
            v_order.branch_id
        );
        
        IF v_batch_allocation IS NULL OR 
           jsonb_array_length(v_batch_allocation) = 0 THEN
            v_allocation_success := FALSE;
            CONTINUE;
        END IF;
        
        -- Create invoice item
        INSERT INTO sales.invoice_items (
            invoice_id,
            order_item_id,
            product_id,
            product_name,
            hsn_code,
            quantity,
            pack_unit,
            pack_size,
            batch_allocation,
            unit_price,
            base_amount,
            gst_percentage,
            gst_amount,
            total_amount,
            created_at
        ) VALUES (
            v_invoice_id,
            v_order_item.order_item_id,
            v_order_item.product_id,
            v_order_item.product_name,
            v_order_item.hsn_code,
            v_order_item.quantity - v_order_item.delivered_quantity,
            v_order_item.pack_unit,
            v_order_item.pack_size,
            v_batch_allocation,
            v_order_item.unit_price,
            v_order_item.base_amount,
            v_order_item.gst_percentage,
            v_order_item.gst_amount,
            v_order_item.total_amount,
            CURRENT_TIMESTAMP
        );
    END LOOP;
    
    -- Update invoice status based on allocation
    IF NOT v_allocation_success THEN
        UPDATE sales.invoices
        SET invoice_status = 'stock_pending',
            notes = 'Some items could not be allocated due to insufficient stock'
        WHERE invoices.invoice_id = v_invoice_id;
    END IF;
    
    -- Return invoice details
    RETURN QUERY
    SELECT 
        i.invoice_id,
        i.invoice_number,
        i.invoice_status,
        i.final_amount,
        CASE 
            WHEN v_allocation_success THEN 'complete'
            ELSE 'partial'
        END as batch_allocation_status
    FROM sales.invoices i
    WHERE i.invoice_id = v_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. ALLOCATE STOCK FOR SALE (FEFO)
-- =============================================
CREATE OR REPLACE FUNCTION allocate_stock_for_sale(
    p_product_id INTEGER,
    p_quantity NUMERIC,
    p_branch_id INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_remaining_quantity NUMERIC := p_quantity;
    v_batch RECORD;
    v_allocations JSONB := '[]'::JSONB;
    v_allocation_quantity NUMERIC;
BEGIN
    -- Get available batches using FEFO (First Expiry First Out)
    FOR v_batch IN
        SELECT 
            b.batch_id,
            b.batch_number,
            b.expiry_date,
            b.mrp_per_unit,
            lws.quantity_available - COALESCE(lws.quantity_reserved, 0) as available_quantity,
            lws.location_id
        FROM inventory.batches b
        JOIN inventory.location_wise_stock lws ON b.batch_id = lws.batch_id
        JOIN inventory.storage_locations sl ON lws.location_id = sl.location_id
        WHERE b.product_id = p_product_id
        AND b.batch_status = 'active'
        AND lws.quantity_available > COALESCE(lws.quantity_reserved, 0)
        AND sl.branch_id = p_branch_id
        AND sl.is_sales_location = TRUE
        ORDER BY b.expiry_date, b.batch_id
    LOOP
        EXIT WHEN v_remaining_quantity <= 0;
        
        v_allocation_quantity := LEAST(v_remaining_quantity, v_batch.available_quantity);
        
        -- Add to allocations
        v_allocations := v_allocations || jsonb_build_array(
            jsonb_build_object(
                'batch_id', v_batch.batch_id,
                'batch_number', v_batch.batch_number,
                'quantity', v_allocation_quantity,
                'mrp', v_batch.mrp_per_unit,
                'expiry_date', v_batch.expiry_date,
                'location_id', v_batch.location_id
            )
        );
        
        -- Create reservation
        INSERT INTO inventory.stock_reservations (
            org_id,
            product_id,
            batch_id,
            location_id,
            reserved_quantity,
            reservation_type,
            reference_type,
            reference_number,
            expires_at,
            created_at
        )
        SELECT 
            sl.org_id,
            p_product_id,
            v_batch.batch_id,
            v_batch.location_id,
            v_allocation_quantity,
            'sales',
            'invoice_draft',
            'TEMP-' || p_product_id || '-' || CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP + INTERVAL '24 hours',
            CURRENT_TIMESTAMP
        FROM inventory.storage_locations sl
        WHERE sl.location_id = v_batch.location_id;
        
        v_remaining_quantity := v_remaining_quantity - v_allocation_quantity;
    END LOOP;
    
    -- Return allocations or NULL if couldn't allocate full quantity
    IF v_remaining_quantity > 0 THEN
        -- Partial allocation
        RETURN jsonb_build_object(
            'status', 'partial',
            'requested_quantity', p_quantity,
            'allocated_quantity', p_quantity - v_remaining_quantity,
            'allocations', v_allocations
        );
    ELSE
        RETURN jsonb_build_object(
            'status', 'complete',
            'requested_quantity', p_quantity,
            'allocated_quantity', p_quantity,
            'allocations', v_allocations
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. PROCESS SALES RETURN
-- =============================================
CREATE OR REPLACE FUNCTION process_sales_return(
    p_invoice_id INTEGER,
    p_return_items JSONB,
    p_return_reason TEXT,
    p_created_by INTEGER DEFAULT 0
)
RETURNS TABLE (
    return_id INTEGER,
    return_number TEXT,
    credit_note_number TEXT,
    total_return_amount NUMERIC,
    credit_note_status TEXT
) AS $$
DECLARE
    v_invoice RECORD;
    v_return_id INTEGER;
    v_return_number TEXT;
    v_credit_note_number TEXT;
    v_return_item JSONB;
    v_invoice_item RECORD;
    v_total_amount NUMERIC := 0;
    v_saleable_value NUMERIC := 0;
BEGIN
    -- Get invoice details
    SELECT * INTO v_invoice
    FROM sales.invoices
    WHERE invoice_id = p_invoice_id
    AND invoice_status = 'posted';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found or not posted';
    END IF;
    
    -- Generate return number
    v_return_number := 'RET-' || v_invoice.branch_id || '-' || 
                      TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                      LPAD(NEXTVAL('sales.return_number_seq')::TEXT, 6, '0');
    
    -- Create return header
    INSERT INTO sales.sales_returns (
        org_id,
        branch_id,
        return_number,
        return_date,
        invoice_id,
        customer_id,
        return_reason,
        return_status,
        approval_status,
        created_by,
        created_at
    ) VALUES (
        v_invoice.org_id,
        v_invoice.branch_id,
        v_return_number,
        CURRENT_DATE,
        p_invoice_id,
        v_invoice.customer_id,
        p_return_reason,
        'pending',
        'pending',
        p_created_by,
        CURRENT_TIMESTAMP
    ) RETURNING sales_returns.return_id INTO v_return_id;
    
    -- Process return items
    FOR v_return_item IN SELECT * FROM jsonb_array_elements(p_return_items)
    LOOP
        -- Get invoice item details
        SELECT * INTO v_invoice_item
        FROM sales.invoice_items
        WHERE invoice_item_id = (v_return_item->>'invoice_item_id')::INTEGER
        AND invoice_id = p_invoice_id;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice item not found';
        END IF;
        
        -- Validate return quantity
        IF (v_return_item->>'total_quantity')::NUMERIC > v_invoice_item.quantity THEN
            RAISE EXCEPTION 'Return quantity exceeds invoiced quantity';
        END IF;
        
        -- Calculate return value
        DECLARE
            v_return_value NUMERIC;
            v_gst_value NUMERIC;
        BEGIN
            v_return_value := (v_return_item->>'total_quantity')::NUMERIC * 
                             v_invoice_item.unit_price;
            v_gst_value := v_return_value * v_invoice_item.gst_percentage / 100;
            
            -- Insert return item
            INSERT INTO sales.sales_return_items (
                return_id,
                invoice_item_id,
                product_id,
                batch_id,
                total_quantity,
                saleable_quantity,
                damaged_quantity,
                expired_quantity,
                unit_price,
                base_amount,
                gst_amount,
                total_amount,
                damage_reason,
                created_at
            ) VALUES (
                v_return_id,
                v_invoice_item.invoice_item_id,
                v_invoice_item.product_id,
                (v_return_item->>'batch_id')::INTEGER,
                (v_return_item->>'total_quantity')::NUMERIC,
                COALESCE((v_return_item->>'saleable_quantity')::NUMERIC, 0),
                COALESCE((v_return_item->>'damaged_quantity')::NUMERIC, 0),
                COALESCE((v_return_item->>'expired_quantity')::NUMERIC, 0),
                v_invoice_item.unit_price,
                v_return_value,
                v_gst_value,
                v_return_value + v_gst_value,
                v_return_item->>'damage_reason',
                CURRENT_TIMESTAMP
            );
            
            v_total_amount := v_total_amount + v_return_value + v_gst_value;
            v_saleable_value := v_saleable_value + 
                               (COALESCE((v_return_item->>'saleable_quantity')::NUMERIC, 0) * 
                                v_invoice_item.unit_price * 
                                (1 + v_invoice_item.gst_percentage / 100));
        END;
    END LOOP;
    
    -- Update return totals
    UPDATE sales.sales_returns
    SET 
        total_amount = v_total_amount,
        credit_note_amount = v_saleable_value,
        updated_at = CURRENT_TIMESTAMP
    WHERE sales_returns.return_id = v_return_id;
    
    -- Auto-approve if configured
    IF EXISTS (
        SELECT 1 FROM system_config.system_settings
        WHERE org_id = v_invoice.org_id
        AND setting_key = 'auto_approve_returns'
        AND setting_value = 'true'
    ) THEN
        -- Generate credit note number
        v_credit_note_number := 'CN-' || v_invoice.branch_id || '-' || 
                               TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                               LPAD(v_return_id::TEXT, 6, '0');
        
        UPDATE sales.sales_returns
        SET 
            approval_status = 'approved',
            approved_by = p_created_by,
            approved_at = CURRENT_TIMESTAMP,
            credit_note_number = v_credit_note_number,
            credit_note_date = CURRENT_DATE,
            credit_note_status = 'issued'
        WHERE sales_returns.return_id = v_return_id;
    END IF;
    
    -- Return summary
    RETURN QUERY
    SELECT 
        sr.return_id,
        sr.return_number,
        sr.credit_note_number,
        sr.total_amount,
        sr.credit_note_status
    FROM sales.sales_returns sr
    WHERE sr.return_id = v_return_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 6. CUSTOMER SALES ANALYTICS
-- =============================================
CREATE OR REPLACE FUNCTION get_customer_sales_analytics(
    p_customer_id INTEGER,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 year',
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_orders INTEGER,
    total_invoices INTEGER,
    total_sales_value NUMERIC,
    average_order_value NUMERIC,
    total_returns INTEGER,
    return_percentage NUMERIC,
    payment_performance JSONB,
    product_preferences JSONB,
    monthly_trend JSONB,
    scheme_benefits NUMERIC
) AS $$
DECLARE
    v_payment_stats JSONB;
    v_product_prefs JSONB;
    v_monthly_trend JSONB;
BEGIN
    -- Payment performance
    SELECT jsonb_build_object(
        'on_time_payments', COUNT(*) FILTER (WHERE p.payment_date <= i.due_date),
        'late_payments', COUNT(*) FILTER (WHERE p.payment_date > i.due_date),
        'average_payment_days', AVG(p.payment_date - i.invoice_date),
        'outstanding_amount', SUM(i.final_amount) FILTER (WHERE p.payment_id IS NULL)
    )
    INTO v_payment_stats
    FROM sales.invoices i
    LEFT JOIN financial.payments p ON 
        p.reference_type = 'invoice' AND 
        p.reference_id = i.invoice_id AND
        p.payment_status = 'cleared'
    WHERE i.customer_id = p_customer_id
    AND i.invoice_date BETWEEN p_from_date AND p_to_date;
    
    -- Product preferences
    SELECT jsonb_agg(
        jsonb_build_object(
            'product_id', product_id,
            'product_name', product_name,
            'total_quantity', total_quantity,
            'total_value', total_value,
            'order_frequency', order_count
        ) ORDER BY total_value DESC
    )
    INTO v_product_prefs
    FROM (
        SELECT 
            ii.product_id,
            ii.product_name,
            SUM(ii.quantity) as total_quantity,
            SUM(ii.total_amount) as total_value,
            COUNT(DISTINCT i.invoice_id) as order_count
        FROM sales.invoice_items ii
        JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
        WHERE i.customer_id = p_customer_id
        AND i.invoice_date BETWEEN p_from_date AND p_to_date
        GROUP BY ii.product_id, ii.product_name
        ORDER BY SUM(ii.total_amount) DESC
        LIMIT 10
    ) product_summary;
    
    -- Monthly trend
    SELECT jsonb_agg(
        jsonb_build_object(
            'month', TO_CHAR(month_date, 'YYYY-MM'),
            'orders', order_count,
            'sales_value', sales_value,
            'avg_order_value', avg_order_value
        ) ORDER BY month_date
    )
    INTO v_monthly_trend
    FROM (
        SELECT 
            DATE_TRUNC('month', o.order_date) as month_date,
            COUNT(*) as order_count,
            SUM(o.final_amount) as sales_value,
            AVG(o.final_amount) as avg_order_value
        FROM sales.orders o
        WHERE o.customer_id = p_customer_id
        AND o.order_date BETWEEN p_from_date AND p_to_date
        AND o.order_status != 'cancelled'
        GROUP BY DATE_TRUNC('month', o.order_date)
    ) monthly_summary;
    
    -- Return analytics
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT o.order_id)::INTEGER as total_orders,
        COUNT(DISTINCT i.invoice_id)::INTEGER as total_invoices,
        COALESCE(SUM(i.final_amount), 0) as total_sales_value,
        COALESCE(AVG(o.final_amount), 0) as average_order_value,
        COUNT(DISTINCT r.return_id)::INTEGER as total_returns,
        CASE 
            WHEN COUNT(DISTINCT i.invoice_id) > 0 
            THEN (COUNT(DISTINCT r.return_id)::NUMERIC / COUNT(DISTINCT i.invoice_id) * 100)
            ELSE 0
        END as return_percentage,
        v_payment_stats as payment_performance,
        v_product_prefs as product_preferences,
        v_monthly_trend as monthly_trend,
        COALESCE(SUM(o.scheme_discount), 0) as scheme_benefits
    FROM sales.orders o
    LEFT JOIN sales.invoices i ON o.order_id = i.order_id
    LEFT JOIN sales.sales_returns r ON i.invoice_id = r.invoice_id
    WHERE o.customer_id = p_customer_id
    AND o.order_date BETWEEN p_from_date AND p_to_date
    AND o.order_status != 'cancelled';
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 7. SALES TARGET TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_sales_targets(
    p_branch_id INTEGER,
    p_period_type TEXT DEFAULT 'monthly', -- monthly, quarterly, yearly
    p_period_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    target_period TEXT,
    sales_target NUMERIC,
    achieved_sales NUMERIC,
    achievement_percentage NUMERIC,
    days_remaining INTEGER,
    required_daily_sales NUMERIC,
    top_performers JSONB,
    category_performance JSONB
) AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
    v_target_amount NUMERIC;
    v_achieved_amount NUMERIC;
    v_top_performers JSONB;
    v_category_perf JSONB;
BEGIN
    -- Calculate period boundaries
    CASE p_period_type
        WHEN 'monthly' THEN
            v_period_start := DATE_TRUNC('month', p_period_date);
            v_period_end := DATE_TRUNC('month', p_period_date) + INTERVAL '1 month' - INTERVAL '1 day';
        WHEN 'quarterly' THEN
            v_period_start := DATE_TRUNC('quarter', p_period_date);
            v_period_end := DATE_TRUNC('quarter', p_period_date) + INTERVAL '3 months' - INTERVAL '1 day';
        WHEN 'yearly' THEN
            v_period_start := DATE_TRUNC('year', p_period_date);
            v_period_end := DATE_TRUNC('year', p_period_date) + INTERVAL '1 year' - INTERVAL '1 day';
    END CASE;
    
    -- Get target amount
    SELECT target_value
    INTO v_target_amount
    FROM analytics.branch_targets
    WHERE branch_id = p_branch_id
    AND target_type = 'sales_value'
    AND period_type = p_period_type
    AND v_period_start BETWEEN period_start AND period_end;
    
    -- Calculate achieved sales
    SELECT COALESCE(SUM(i.final_amount), 0)
    INTO v_achieved_amount
    FROM sales.invoices i
    WHERE i.branch_id = p_branch_id
    AND i.invoice_date BETWEEN v_period_start AND v_period_end
    AND i.invoice_status = 'posted';
    
    -- Get top performers
    SELECT jsonb_agg(
        jsonb_build_object(
            'salesperson_id', salesperson_id,
            'salesperson_name', salesperson_name,
            'sales_value', sales_value,
            'order_count', order_count,
            'avg_order_value', avg_order_value
        ) ORDER BY sales_value DESC
    )
    INTO v_top_performers
    FROM (
        SELECT 
            o.salesperson_id,
            u.full_name as salesperson_name,
            SUM(i.final_amount) as sales_value,
            COUNT(DISTINCT i.invoice_id) as order_count,
            AVG(i.final_amount) as avg_order_value
        FROM sales.invoices i
        JOIN sales.orders o ON i.order_id = o.order_id
        JOIN master.org_users u ON o.salesperson_id = u.user_id
        WHERE i.branch_id = p_branch_id
        AND i.invoice_date BETWEEN v_period_start AND v_period_end
        AND i.invoice_status = 'posted'
        GROUP BY o.salesperson_id, u.full_name
        ORDER BY SUM(i.final_amount) DESC
        LIMIT 5
    ) salesperson_summary;
    
    -- Category performance
    SELECT jsonb_agg(
        jsonb_build_object(
            'category_name', category_name,
            'sales_value', sales_value,
            'percentage_of_total', 
                CASE WHEN v_achieved_amount > 0 
                THEN ROUND(sales_value / v_achieved_amount * 100, 2)
                ELSE 0 END
        ) ORDER BY sales_value DESC
    )
    INTO v_category_perf
    FROM (
        SELECT 
            pc.category_name,
            SUM(ii.total_amount) as sales_value
        FROM sales.invoice_items ii
        JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        JOIN master.product_categories pc ON p.category_id = pc.category_id
        WHERE i.branch_id = p_branch_id
        AND i.invoice_date BETWEEN v_period_start AND v_period_end
        AND i.invoice_status = 'posted'
        GROUP BY pc.category_name
    ) category_summary;
    
    -- Return results
    RETURN QUERY
    SELECT 
        TO_CHAR(v_period_start, 'Mon YYYY') || ' - ' || 
            TO_CHAR(v_period_end, 'Mon YYYY') as target_period,
        COALESCE(v_target_amount, 0) as sales_target,
        v_achieved_amount as achieved_sales,
        CASE 
            WHEN COALESCE(v_target_amount, 0) > 0 
            THEN ROUND(v_achieved_amount / v_target_amount * 100, 2)
            ELSE 0
        END as achievement_percentage,
        (v_period_end - CURRENT_DATE + 1)::INTEGER as days_remaining,
        CASE 
            WHEN (v_period_end - CURRENT_DATE + 1) > 0 AND v_target_amount > v_achieved_amount
            THEN ROUND((v_target_amount - v_achieved_amount) / (v_period_end - CURRENT_DATE + 1), 2)
            ELSE 0
        END as required_daily_sales,
        v_top_performers as top_performers,
        v_category_perf as category_performance;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_orders_customer_date ON sales.orders(customer_id, order_date);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_date ON sales.invoices(branch_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON sales.invoice_items(product_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_schemes_active ON sales.sales_schemes(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON sales.sales_returns(invoice_id, approval_status);

-- =============================================
-- GRANTS
-- =============================================
-- GRANT EXECUTE ON FUNCTION create_sales_order TO sales_user; -- Function doesn't exist
-- GRANT EXECUTE ON FUNCTION generate_invoice_from_order TO sales_user; -- Function doesn't exist
-- GRANT EXECUTE ON FUNCTION process_sales_return TO sales_user; -- Function doesn't exist
-- GRANT EXECUTE ON FUNCTION get_customer_sales_analytics TO sales_user, analytics_user; -- Function doesn't exist
-- GRANT EXECUTE ON FUNCTION track_sales_targets TO sales_manager, analytics_user; -- Function doesn't exist

-- =============================================
-- COMMENTS
-- =============================================
-- COMMENT ON FUNCTION create_sales_order IS 'Creates sales order with validation, credit check, and scheme calculation'; -- Function doesn't exist
-- COMMENT ON FUNCTION calculate_order_schemes IS 'Calculates applicable schemes and discounts for an order'; -- Function doesn't exist
-- COMMENT ON FUNCTION generate_invoice_from_order IS 'Generates invoice from order with batch allocation'; -- Function doesn't exist
-- COMMENT ON FUNCTION allocate_stock_for_sale IS 'Allocates stock using FEFO strategy with reservations'; -- Function doesn't exist
-- COMMENT ON FUNCTION process_sales_return IS 'Processes sales returns with quality segregation and credit notes'; -- Function doesn't exist
-- COMMENT ON FUNCTION get_customer_sales_analytics IS 'Provides comprehensive customer sales analytics'; -- Function doesn't exist
-- COMMENT ON FUNCTION track_sales_targets IS 'Tracks sales targets and performance metrics'; -- Function doesn't exist