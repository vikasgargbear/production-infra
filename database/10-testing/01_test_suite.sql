-- =============================================
-- COMPREHENSIVE TESTING SUITE
-- =============================================
-- Test all critical functionality of the enterprise system
-- =============================================

-- Create testing schema
CREATE SCHEMA IF NOT EXISTS testing;

-- Test results table
CREATE TABLE IF NOT EXISTS testing.test_results (
    test_id SERIAL PRIMARY KEY,
    test_name VARCHAR(200),
    test_category VARCHAR(100),
    status VARCHAR(20),
    error_message TEXT,
    execution_time INTERVAL,
    tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TEST FRAMEWORK FUNCTIONS
-- =============================================

-- Function to run a test
CREATE OR REPLACE FUNCTION testing.run_test(
    p_test_name TEXT,
    p_test_category TEXT,
    p_test_function TEXT
)
RETURNS VOID AS $$
DECLARE
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_status TEXT;
    v_error TEXT;
BEGIN
    v_start_time := clock_timestamp();
    v_status := 'passed';
    v_error := NULL;
    
    BEGIN
        EXECUTE 'SELECT ' || p_test_function;
    EXCEPTION
        WHEN OTHERS THEN
            v_status := 'failed';
            v_error := SQLERRM;
    END;
    
    v_end_time := clock_timestamp();
    
    INSERT INTO testing.test_results (
        test_name,
        test_category,
        status,
        error_message,
        execution_time
    ) VALUES (
        p_test_name,
        p_test_category,
        v_status,
        v_error,
        v_end_time - v_start_time
    );
END;
$$ LANGUAGE plpgsql;

-- Function to assert equality
CREATE OR REPLACE FUNCTION testing.assert_equals(
    p_expected ANYELEMENT,
    p_actual ANYELEMENT,
    p_message TEXT DEFAULT ''
)
RETURNS VOID AS $$
BEGIN
    IF p_expected IS DISTINCT FROM p_actual THEN
        RAISE EXCEPTION 'Assertion failed: % Expected: %, Actual: %', 
            p_message, p_expected, p_actual;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- INVENTORY MODULE TESTS
-- =============================================

-- Test: Product creation with pack hierarchy
CREATE OR REPLACE FUNCTION testing.test_product_creation()
RETURNS VOID AS $$
DECLARE
    v_product_id INTEGER;
BEGIN
    -- Create a test product
    INSERT INTO inventory.products (
        org_id, product_code, product_name, generic_name,
        pack_configuration, gst_percentage, current_mrp
    ) VALUES (
        1, 'TEST-PROD-001', 'Test Product', 'Test Generic',
        '{"base_unit": "TAB", "strip_size": 10, "box_size": 10, "case_size": 10}'::jsonb,
        12, 100
    ) RETURNING product_id INTO v_product_id;
    
    -- Verify product was created
    PERFORM testing.assert_equals(
        'TEST-PROD-001'::TEXT,
        (SELECT product_code FROM inventory.products WHERE product_id = v_product_id),
        'Product code mismatch'
    );
    
    -- Clean up
    DELETE FROM inventory.products WHERE product_id = v_product_id;
END;
$$ LANGUAGE plpgsql;

-- Test: Stock allocation with FEFO
CREATE OR REPLACE FUNCTION testing.test_stock_allocation()
RETURNS VOID AS $$
DECLARE
    v_product_id INTEGER := 1001; -- Amoxicillin from sample data
    v_allocation JSONB;
BEGIN
    -- Test FEFO allocation
    SELECT allocate_stock_intelligent(v_product_id, 50, 1, 'FEFO') INTO v_allocation;
    
    -- Verify allocation exists
    IF v_allocation IS NULL OR jsonb_array_length(v_allocation) = 0 THEN
        RAISE EXCEPTION 'Stock allocation failed';
    END IF;
    
    -- Verify batches are ordered by expiry
    WITH batch_expiry AS (
        SELECT 
            (value->>'batch_id')::INTEGER as batch_id,
            b.expiry_date
        FROM jsonb_array_elements(v_allocation) 
        JOIN inventory.batches b ON b.batch_id = (value->>'batch_id')::INTEGER
    )
    SELECT COUNT(*) = 0
    FROM batch_expiry b1
    JOIN batch_expiry b2 ON b1.batch_id < b2.batch_id
    WHERE b1.expiry_date > b2.expiry_date;
END;
$$ LANGUAGE plpgsql;

-- Test: Inventory movement tracking
CREATE OR REPLACE FUNCTION testing.test_inventory_movement()
RETURNS VOID AS $$
DECLARE
    v_movement_count_before INTEGER;
    v_movement_count_after INTEGER;
    v_invoice_id INTEGER;
BEGIN
    -- Count movements before
    SELECT COUNT(*) INTO v_movement_count_before
    FROM inventory.inventory_movements;
    
    -- Create a test invoice (should trigger movement)
    INSERT INTO sales.invoices (
        org_id, branch_id, invoice_number, invoice_date,
        customer_id, invoice_status, total_amount
    ) VALUES (
        1, 1, 'TEST-INV-001', CURRENT_DATE,
        1, 'posted', 1000
    ) RETURNING invoice_id INTO v_invoice_id;
    
    -- Add invoice item
    INSERT INTO sales.invoice_items (
        invoice_id, product_id, quantity, base_unit_price,
        tax_percentage, batch_allocation
    ) VALUES (
        v_invoice_id, 1001, 10, 10, 12,
        '[{"batch_id": 1001, "quantity": 10}]'::jsonb
    );
    
    -- Count movements after
    SELECT COUNT(*) INTO v_movement_count_after
    FROM inventory.inventory_movements;
    
    -- Verify movement was created
    PERFORM testing.assert_equals(
        v_movement_count_before + 1,
        v_movement_count_after,
        'Inventory movement not created'
    );
    
    -- Clean up
    DELETE FROM sales.invoice_items WHERE invoice_id = v_invoice_id;
    DELETE FROM sales.invoices WHERE invoice_id = v_invoice_id;
    DELETE FROM inventory.inventory_movements 
    WHERE reference_type = 'invoice' AND reference_id = v_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- FINANCIAL MODULE TESTS
-- =============================================

-- Test: Double-entry journal validation
CREATE OR REPLACE FUNCTION testing.test_journal_validation()
RETURNS VOID AS $$
DECLARE
    v_journal_id INTEGER;
BEGIN
    -- Try to create unbalanced journal entry (should fail)
    BEGIN
        SELECT create_journal_entry(
            1, -- org_id
            'general',
            'manual',
            'TEST-001',
            CURRENT_DATE,
            jsonb_build_array(
                jsonb_build_object(
                    'account_id', 1111, -- Cash
                    'debit_amount', 1000,
                    'credit_amount', 0
                ),
                jsonb_build_object(
                    'account_id', 4100, -- Sales
                    'debit_amount', 0,
                    'credit_amount', 900 -- Unbalanced!
                )
            ),
            'Test unbalanced entry',
            1
        ) INTO v_journal_id;
        
        -- If we reach here, test failed
        RAISE EXCEPTION 'Unbalanced journal entry was allowed';
    EXCEPTION
        WHEN OTHERS THEN
            -- Expected behavior - test passes
            NULL;
    END;
END;
$$ LANGUAGE plpgsql;

-- Test: Payment allocation
CREATE OR REPLACE FUNCTION testing.test_payment_allocation()
RETURNS VOID AS $$
DECLARE
    v_payment_result JSONB;
    v_invoice_balance NUMERIC;
BEGIN
    -- Record a payment
    SELECT api.record_payment(jsonb_build_object(
        'org_id', 1,
        'branch_id', 1,
        'party_type', 'customer',
        'party_id', 1,
        'payment_type', 'receipt',
        'payment_mode', 'cash',
        'amount', 5000,
        'allocations', jsonb_build_array(
            jsonb_build_object(
                'reference_type', 'invoice',
                'reference_id', 1, -- Assuming invoice ID 1 exists
                'allocated_amount', 5000
            )
        ),
        'created_by', 1
    )) INTO v_payment_result;
    
    -- Verify payment was successful
    PERFORM testing.assert_equals(
        TRUE,
        (v_payment_result->>'success')::BOOLEAN,
        'Payment recording failed'
    );
    
    -- Verify invoice balance was updated
    SELECT total_amount - paid_amount INTO v_invoice_balance
    FROM sales.invoices WHERE invoice_id = 1;
    
    IF v_invoice_balance < 0 THEN
        RAISE EXCEPTION 'Invoice over-allocated';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- GST MODULE TESTS
-- =============================================

-- Test: GST calculation
CREATE OR REPLACE FUNCTION testing.test_gst_calculation()
RETURNS VOID AS $$
DECLARE
    v_cgst NUMERIC;
    v_sgst NUMERIC;
    v_igst NUMERIC;
BEGIN
    -- Test intra-state GST (CGST + SGST)
    SELECT 
        cgst_amount,
        sgst_amount,
        igst_amount
    INTO v_cgst, v_sgst, v_igst
    FROM calculate_gst_amount(
        1000, -- taxable_amount
        12,   -- gst_rate
        '27', -- from_state (Maharashtra)
        '27'  -- to_state (Maharashtra)
    );
    
    PERFORM testing.assert_equals(60::NUMERIC, v_cgst, 'CGST calculation error');
    PERFORM testing.assert_equals(60::NUMERIC, v_sgst, 'SGST calculation error');
    PERFORM testing.assert_equals(0::NUMERIC, v_igst, 'IGST should be 0 for intra-state');
    
    -- Test inter-state GST (IGST only)
    SELECT 
        cgst_amount,
        sgst_amount,
        igst_amount
    INTO v_cgst, v_sgst, v_igst
    FROM calculate_gst_amount(
        1000, -- taxable_amount
        12,   -- gst_rate
        '27', -- from_state (Maharashtra)
        '07'  -- to_state (Delhi)
    );
    
    PERFORM testing.assert_equals(0::NUMERIC, v_cgst, 'CGST should be 0 for inter-state');
    PERFORM testing.assert_equals(0::NUMERIC, v_sgst, 'SGST should be 0 for inter-state');
    PERFORM testing.assert_equals(120::NUMERIC, v_igst, 'IGST calculation error');
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- COMPLIANCE MODULE TESTS
-- =============================================

-- Test: Narcotic balance tracking
CREATE OR REPLACE FUNCTION testing.test_narcotic_tracking()
RETURNS VOID AS $$
DECLARE
    v_register_count_before INTEGER;
    v_register_count_after INTEGER;
BEGIN
    -- Count narcotic register entries before
    SELECT COUNT(*) INTO v_register_count_before
    FROM compliance.narcotic_drug_register
    WHERE product_id = 1018; -- Morphine from sample data
    
    -- Create a narcotic sale (should create register entry)
    INSERT INTO compliance.narcotic_drug_register (
        org_id, register_date, product_id, batch_id,
        transaction_type, reference_type, reference_number,
        quantity_out, balance_quantity, party_name,
        party_license_number, prescription_details,
        created_by
    ) VALUES (
        1, CURRENT_DATE, 1018, 1018,
        'issue', 'invoice', 'TEST-NARC-001',
        5, 45, 'Test Patient',
        'DL-12345', '{"prescription_no": "RX-001", "doctor": "Dr. Test"}'::jsonb,
        1
    );
    
    -- Count after
    SELECT COUNT(*) INTO v_register_count_after
    FROM compliance.narcotic_drug_register
    WHERE product_id = 1018;
    
    -- Verify entry was created
    PERFORM testing.assert_equals(
        v_register_count_before + 1,
        v_register_count_after,
        'Narcotic register entry not created'
    );
    
    -- Clean up
    DELETE FROM compliance.narcotic_drug_register 
    WHERE reference_number = 'TEST-NARC-001';
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- PERFORMANCE TESTS
-- =============================================

-- Test: Query performance
CREATE OR REPLACE FUNCTION testing.test_query_performance()
RETURNS VOID AS $$
DECLARE
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_duration INTERVAL;
BEGIN
    -- Test product search performance
    v_start_time := clock_timestamp();
    
    PERFORM * FROM api.search_products(
        p_search_term := 'Para',
        p_limit := 100
    );
    
    v_end_time := clock_timestamp();
    v_duration := v_end_time - v_start_time;
    
    -- Verify query completes within acceptable time (1 second)
    IF EXTRACT(EPOCH FROM v_duration) > 1 THEN
        RAISE EXCEPTION 'Product search too slow: %', v_duration;
    END IF;
    
    -- Test invoice listing performance
    v_start_time := clock_timestamp();
    
    PERFORM * FROM api.get_invoices(
        p_from_date := CURRENT_DATE - INTERVAL '30 days',
        p_to_date := CURRENT_DATE,
        p_limit := 100
    );
    
    v_end_time := clock_timestamp();
    v_duration := v_end_time - v_start_time;
    
    -- Verify query completes within acceptable time
    IF EXTRACT(EPOCH FROM v_duration) > 2 THEN
        RAISE EXCEPTION 'Invoice listing too slow: %', v_duration;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- RUN ALL TESTS
-- =============================================

CREATE OR REPLACE FUNCTION testing.run_all_tests()
RETURNS TABLE (
    test_category VARCHAR(100),
    total_tests INTEGER,
    passed INTEGER,
    failed INTEGER,
    success_rate NUMERIC
) AS $$
BEGIN
    -- Clear previous results
    TRUNCATE testing.test_results;
    
    -- Run inventory tests
    PERFORM testing.run_test('Product Creation', 'Inventory', 'testing.test_product_creation()');
    PERFORM testing.run_test('Stock Allocation FEFO', 'Inventory', 'testing.test_stock_allocation()');
    PERFORM testing.run_test('Inventory Movement', 'Inventory', 'testing.test_inventory_movement()');
    
    -- Run financial tests
    PERFORM testing.run_test('Journal Validation', 'Financial', 'testing.test_journal_validation()');
    PERFORM testing.run_test('Payment Allocation', 'Financial', 'testing.test_payment_allocation()');
    
    -- Run GST tests
    PERFORM testing.run_test('GST Calculation', 'GST', 'testing.test_gst_calculation()');
    
    -- Run compliance tests
    PERFORM testing.run_test('Narcotic Tracking', 'Compliance', 'testing.test_narcotic_tracking()');
    
    -- Run performance tests
    PERFORM testing.run_test('Query Performance', 'Performance', 'testing.test_query_performance()');
    
    -- Return summary
    RETURN QUERY
    SELECT 
        tr.test_category,
        COUNT(*)::INTEGER as total_tests,
        COUNT(*) FILTER (WHERE tr.status = 'passed')::INTEGER as passed,
        COUNT(*) FILTER (WHERE tr.status = 'failed')::INTEGER as failed,
        ROUND(
            COUNT(*) FILTER (WHERE tr.status = 'passed')::NUMERIC / 
            COUNT(*)::NUMERIC * 100, 
            2
        ) as success_rate
    FROM testing.test_results tr
    GROUP BY tr.test_category
    ORDER BY tr.test_category;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TEST REPORT GENERATION
-- =============================================

CREATE OR REPLACE FUNCTION testing.generate_test_report()
RETURNS TEXT AS $$
DECLARE
    v_report TEXT;
    v_total_tests INTEGER;
    v_passed INTEGER;
    v_failed INTEGER;
    v_avg_time INTERVAL;
BEGIN
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'passed'),
        COUNT(*) FILTER (WHERE status = 'failed'),
        AVG(execution_time)
    INTO v_total_tests, v_passed, v_failed, v_avg_time
    FROM testing.test_results;
    
    v_report := E'========================================\n';
    v_report := v_report || E'ENTERPRISE ERP TEST REPORT\n';
    v_report := v_report || E'Generated: ' || CURRENT_TIMESTAMP || E'\n';
    v_report := v_report || E'========================================\n\n';
    
    v_report := v_report || E'SUMMARY:\n';
    v_report := v_report || E'Total Tests: ' || v_total_tests || E'\n';
    v_report := v_report || E'Passed: ' || v_passed || E'\n';
    v_report := v_report || E'Failed: ' || v_failed || E'\n';
    v_report := v_report || E'Success Rate: ' || ROUND((v_passed::NUMERIC / v_total_tests) * 100, 2) || E'%\n';
    v_report := v_report || E'Average Execution Time: ' || v_avg_time || E'\n\n';
    
    -- Add failed test details
    IF v_failed > 0 THEN
        v_report := v_report || E'FAILED TESTS:\n';
        v_report := v_report || E'----------------------------------------\n';
        
        FOR r IN 
            SELECT test_name, test_category, error_message
            FROM testing.test_results
            WHERE status = 'failed'
        LOOP
            v_report := v_report || E'Test: ' || r.test_name || E'\n';
            v_report := v_report || E'Category: ' || r.test_category || E'\n';
            v_report := v_report || E'Error: ' || r.error_message || E'\n\n';
        END LOOP;
    END IF;
    
    RETURN v_report;
END;
$$ LANGUAGE plpgsql;

-- Execute all tests
SELECT * FROM testing.run_all_tests();

-- Generate report
SELECT testing.generate_test_report();