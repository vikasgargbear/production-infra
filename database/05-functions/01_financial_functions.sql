-- =============================================
-- FINANCIAL BUSINESS FUNCTIONS
-- =============================================
-- Complex financial operations and calculations
-- =============================================

-- =============================================
-- 1. AUTOMATED JOURNAL ENTRY CREATION
-- =============================================
CREATE OR REPLACE FUNCTION create_journal_entry(
    p_org_id INTEGER,
    p_branch_id INTEGER,
    p_journal_type TEXT,
    p_reference_type TEXT,
    p_reference_id INTEGER,
    p_narration TEXT,
    p_lines JSONB,
    p_created_by INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_journal_id INTEGER;
    v_journal_number TEXT;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_line JSONB;
    v_fiscal_year TEXT;
BEGIN
    -- Validate lines
    IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Journal entry must have at least 2 lines';
    END IF;
    
    -- Calculate totals
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;
    
    -- Check if balanced
    IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
        RAISE EXCEPTION 'Journal entry not balanced. Debit: %, Credit: %', v_total_debit, v_total_credit;
    END IF;
    
    -- Get fiscal year
    v_fiscal_year := CASE 
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4 THEN 
            EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::TEXT
        ELSE 
            (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::TEXT || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
    END;
    
    -- Generate journal number
    SELECT 'JV-' || v_fiscal_year || '-' || 
           LPAD(COALESCE(MAX(REGEXP_REPLACE(journal_number, '^JV-\d{4}-\d{4}-', '')::INTEGER), 0) + 1::TEXT, 6, '0')
    INTO v_journal_number
    FROM financial.journal_entries
    WHERE org_id = p_org_id
    AND journal_number LIKE 'JV-' || v_fiscal_year || '-%';
    
    -- Create journal entry
    INSERT INTO financial.journal_entries (
        org_id,
        branch_id,
        journal_number,
        journal_date,
        journal_type,
        reference_type,
        reference_id,
        narration,
        entry_status,
        created_by
    ) VALUES (
        p_org_id,
        p_branch_id,
        v_journal_number,
        CURRENT_DATE,
        p_journal_type,
        p_reference_type,
        p_reference_id,
        p_narration,
        'draft',
        p_created_by
    ) RETURNING journal_id INTO v_journal_id;
    
    -- Create journal lines
    INSERT INTO financial.journal_entry_lines (
        journal_id,
        line_number,
        account_code,
        account_name,
        debit_amount,
        credit_amount,
        cost_center_id,
        party_type,
        party_id,
        line_narration
    )
    SELECT 
        v_journal_id,
        (row_number() OVER ())::INTEGER,
        v_line->>'account_code',
        v_line->>'account_name',
        (v_line->>'debit_amount')::NUMERIC,
        (v_line->>'credit_amount')::NUMERIC,
        (v_line->>'cost_center_id')::INTEGER,
        v_line->>'party_type',
        (v_line->>'party_id')::INTEGER,
        v_line->>'narration'
    FROM jsonb_array_elements(p_lines) AS v_line;
    
    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. PAYMENT RECONCILIATION
-- =============================================
CREATE OR REPLACE FUNCTION reconcile_payment_batch(
    p_org_id INTEGER,
    p_payment_ids INTEGER[],
    p_outstanding_ids INTEGER[],
    p_reconciled_by INTEGER
) RETURNS JSONB AS $$
DECLARE
    v_payment RECORD;
    v_outstanding RECORD;
    v_allocation_amount NUMERIC;
    v_total_allocated NUMERIC := 0;
    v_allocations JSONB := '[]'::JSONB;
    v_unallocated_payments JSONB := '[]'::JSONB;
BEGIN
    -- Process each payment
    FOR v_payment IN 
        SELECT * FROM financial.payments
        WHERE payment_id = ANY(p_payment_ids)
        AND org_id = p_org_id
        AND payment_status = 'cleared'
        AND unallocated_amount > 0
        ORDER BY payment_date
    LOOP
        -- Process each outstanding
        FOR v_outstanding IN
            SELECT * FROM financial.customer_outstanding
            WHERE outstanding_id = ANY(p_outstanding_ids)
            AND customer_id = v_payment.party_id
            AND status IN ('open', 'partial')
            AND outstanding_amount > 0
            ORDER BY due_date, document_date
        LOOP
            -- Calculate allocation amount
            v_allocation_amount := LEAST(
                v_payment.unallocated_amount,
                v_outstanding.outstanding_amount
            );
            
            IF v_allocation_amount > 0 THEN
                -- Create allocation
                INSERT INTO financial.payment_allocations (
                    payment_id,
                    reference_type,
                    reference_id,
                    reference_number,
                    allocated_amount,
                    allocation_status,
                    allocated_by,
                    allocated_at
                ) VALUES (
                    v_payment.payment_id,
                    v_outstanding.document_type,
                    v_outstanding.document_id,
                    v_outstanding.document_number,
                    v_allocation_amount,
                    'active',
                    p_reconciled_by,
                    CURRENT_TIMESTAMP
                );
                
                -- Update outstanding
                UPDATE financial.customer_outstanding
                SET 
                    paid_amount = paid_amount + v_allocation_amount,
                    outstanding_amount = outstanding_amount - v_allocation_amount,
                    status = CASE 
                        WHEN outstanding_amount - v_allocation_amount <= 0 THEN 'paid'
                        ELSE 'partial'
                    END,
                    last_payment_date = v_payment.payment_date,
                    updated_at = CURRENT_TIMESTAMP
                WHERE outstanding_id = v_outstanding.outstanding_id;
                
                -- Update payment
                UPDATE financial.payments
                SET 
                    allocated_amount = allocated_amount + v_allocation_amount,
                    unallocated_amount = unallocated_amount - v_allocation_amount,
                    allocation_status = CASE
                        WHEN unallocated_amount - v_allocation_amount <= 0 THEN 'full'
                        ELSE 'partial'
                    END
                WHERE payment_id = v_payment.payment_id;
                
                -- Track allocation
                v_allocations := v_allocations || jsonb_build_object(
                    'payment_id', v_payment.payment_id,
                    'payment_number', v_payment.reference_number,
                    'outstanding_id', v_outstanding.outstanding_id,
                    'document_number', v_outstanding.document_number,
                    'allocated_amount', v_allocation_amount
                );
                
                v_total_allocated := v_total_allocated + v_allocation_amount;
                
                -- Update payment record for next iteration
                v_payment.unallocated_amount := v_payment.unallocated_amount - v_allocation_amount;
                
                EXIT WHEN v_payment.unallocated_amount <= 0;
            END IF;
        END LOOP;
        
        -- Track unallocated payments
        IF v_payment.unallocated_amount > 0 THEN
            v_unallocated_payments := v_unallocated_payments || jsonb_build_object(
                'payment_id', v_payment.payment_id,
                'payment_number', v_payment.reference_number,
                'unallocated_amount', v_payment.unallocated_amount
            );
        END IF;
    END LOOP;
    
    -- Return reconciliation summary
    RETURN jsonb_build_object(
        'success', TRUE,
        'total_allocated', v_total_allocated,
        'allocations', v_allocations,
        'allocation_count', jsonb_array_length(v_allocations),
        'unallocated_payments', v_unallocated_payments,
        'reconciled_at', CURRENT_TIMESTAMP,
        'reconciled_by', p_reconciled_by
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. AGING ANALYSIS SNAPSHOT
-- =============================================
CREATE OR REPLACE FUNCTION generate_aging_analysis(
    p_org_id INTEGER,
    p_as_of_date DATE DEFAULT CURRENT_DATE,
    p_customer_id INTEGER DEFAULT NULL
) RETURNS TABLE (
    customer_id INTEGER,
    customer_name TEXT,
    customer_category TEXT,
    total_outstanding NUMERIC,
    current_amount NUMERIC,
    overdue_1_30 NUMERIC,
    overdue_31_60 NUMERIC,
    overdue_61_90 NUMERIC,
    overdue_91_120 NUMERIC,
    overdue_above_120 NUMERIC,
    average_days_overdue NUMERIC,
    oldest_invoice_date DATE,
    credit_limit NUMERIC,
    credit_available NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH aging_data AS (
        SELECT 
            co.customer_id,
            c.customer_name,
            c.customer_category,
            co.outstanding_amount,
            co.due_date,
            GREATEST(0, (p_as_of_date - co.due_date)::INTEGER) as days_overdue,
            co.document_date
        FROM financial.customer_outstanding co
        JOIN parties.customers c ON co.customer_id = c.customer_id
        WHERE co.org_id = p_org_id
        AND co.status IN ('open', 'partial')
        AND co.document_date <= p_as_of_date
        AND (p_customer_id IS NULL OR co.customer_id = p_customer_id)
    )
    SELECT 
        ad.customer_id,
        ad.customer_name,
        ad.customer_category,
        SUM(ad.outstanding_amount) as total_outstanding,
        SUM(CASE WHEN ad.days_overdue = 0 THEN ad.outstanding_amount ELSE 0 END) as current_amount,
        SUM(CASE WHEN ad.days_overdue BETWEEN 1 AND 30 THEN ad.outstanding_amount ELSE 0 END) as overdue_1_30,
        SUM(CASE WHEN ad.days_overdue BETWEEN 31 AND 60 THEN ad.outstanding_amount ELSE 0 END) as overdue_31_60,
        SUM(CASE WHEN ad.days_overdue BETWEEN 61 AND 90 THEN ad.outstanding_amount ELSE 0 END) as overdue_61_90,
        SUM(CASE WHEN ad.days_overdue BETWEEN 91 AND 120 THEN ad.outstanding_amount ELSE 0 END) as overdue_91_120,
        SUM(CASE WHEN ad.days_overdue > 120 THEN ad.outstanding_amount ELSE 0 END) as overdue_above_120,
        CASE 
            WHEN SUM(CASE WHEN ad.days_overdue > 0 THEN ad.outstanding_amount ELSE 0 END) > 0
            THEN SUM(ad.days_overdue * ad.outstanding_amount) / 
                 SUM(CASE WHEN ad.days_overdue > 0 THEN ad.outstanding_amount ELSE 0 END)
            ELSE 0
        END as average_days_overdue,
        MIN(ad.document_date) as oldest_invoice_date,
        MAX(c2.credit_limit) as credit_limit,
        MAX(c2.credit_limit) - SUM(ad.outstanding_amount) as credit_available
    FROM aging_data ad
    LEFT JOIN (
        SELECT 
            customer_id,
            (credit_info->>'credit_limit')::NUMERIC as credit_limit
        FROM parties.customers
    ) c2 ON ad.customer_id = c2.customer_id
    GROUP BY ad.customer_id, ad.customer_name, ad.customer_category
    ORDER BY SUM(ad.outstanding_amount) DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. CASH FLOW PROJECTION
-- =============================================
CREATE OR REPLACE FUNCTION project_cash_flow(
    p_org_id INTEGER,
    p_start_date DATE,
    p_end_date DATE,
    p_include_probable BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
    flow_date DATE,
    opening_balance NUMERIC,
    expected_collections NUMERIC,
    probable_collections NUMERIC,
    confirmed_payments NUMERIC,
    probable_payments NUMERIC,
    net_flow NUMERIC,
    closing_balance NUMERIC,
    minimum_balance NUMERIC,
    cash_gap NUMERIC
) AS $$
DECLARE
    v_current_balance NUMERIC;
    v_date DATE;
BEGIN
    -- Get current cash balance
    SELECT COALESCE(SUM(
        CASE 
            WHEN account_type = 'cash' THEN current_balance
            ELSE 0
        END
    ), 0)
    INTO v_current_balance
    FROM financial.bank_accounts
    WHERE org_id = p_org_id
    AND is_active = TRUE;
    
    -- Generate daily cash flow
    FOR v_date IN SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date
    LOOP
        flow_date := v_date;
        opening_balance := v_current_balance;
        
        -- Expected collections (confirmed invoices)
        SELECT COALESCE(SUM(outstanding_amount), 0)
        INTO expected_collections
        FROM financial.customer_outstanding
        WHERE org_id = p_org_id
        AND due_date = v_date
        AND status IN ('open', 'partial');
        
        -- Probable collections (orders not yet invoiced)
        IF p_include_probable THEN
            SELECT COALESCE(SUM(final_amount), 0) * 0.8 -- 80% probability
            INTO probable_collections
            FROM sales.orders
            WHERE org_id = p_org_id
            AND expected_delivery_date = v_date
            AND order_status = 'confirmed'
            AND invoice_id IS NULL;
        ELSE
            probable_collections := 0;
        END IF;
        
        -- Confirmed payments (approved POs)
        SELECT COALESCE(SUM(total_amount), 0)
        INTO confirmed_payments
        FROM procurement.purchase_orders
        WHERE org_id = p_org_id
        AND due_date = v_date
        AND po_status = 'approved';
        
        -- Probable payments (pending POs)
        IF p_include_probable THEN
            SELECT COALESCE(SUM(total_amount), 0) * 0.7 -- 70% probability
            INTO probable_payments
            FROM procurement.purchase_orders
            WHERE org_id = p_org_id
            AND expected_delivery_date = v_date
            AND po_status IN ('draft', 'pending_approval');
        ELSE
            probable_payments := 0;
        END IF;
        
        -- Calculate net flow
        net_flow := (expected_collections + probable_collections) - 
                   (confirmed_payments + probable_payments);
        
        -- Calculate closing balance
        closing_balance := opening_balance + net_flow;
        v_current_balance := closing_balance;
        
        -- Get minimum balance requirement
        SELECT COALESCE((setting_value::JSONB->>'minimum_cash_balance')::NUMERIC, 100000)
        INTO minimum_balance
        FROM system_config.system_settings
        WHERE org_id = p_org_id
        AND setting_key = 'cash_management';
        
        -- Calculate cash gap
        cash_gap := CASE 
            WHEN closing_balance < minimum_balance 
            THEN minimum_balance - closing_balance
            ELSE 0
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. PROFITABILITY ANALYSIS
-- =============================================
CREATE OR REPLACE FUNCTION calculate_profitability(
    p_org_id INTEGER,
    p_start_date DATE,
    p_end_date DATE,
    p_analysis_type TEXT DEFAULT 'product', -- product, customer, category
    p_entity_id INTEGER DEFAULT NULL
) RETURNS TABLE (
    entity_id INTEGER,
    entity_name TEXT,
    entity_type TEXT,
    revenue NUMERIC,
    cost_of_goods NUMERIC,
    gross_profit NUMERIC,
    gross_margin_percent NUMERIC,
    operating_expenses NUMERIC,
    net_profit NUMERIC,
    net_margin_percent NUMERIC,
    units_sold NUMERIC,
    transaction_count INTEGER,
    avg_transaction_value NUMERIC,
    rank_by_profit INTEGER
) AS $$
BEGIN
    IF p_analysis_type = 'product' THEN
        RETURN QUERY
        WITH product_sales AS (
            SELECT 
                ii.product_id,
                p.product_name,
                SUM(ii.line_total) as revenue,
                SUM(ii.quantity * COALESCE(b.cost_per_unit, p.last_purchase_price, 0)) as cogs,
                SUM(ii.quantity) as units,
                COUNT(DISTINCT i.invoice_id) as transactions
            FROM sales.invoice_items ii
            JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
            JOIN inventory.products p ON ii.product_id = p.product_id
            LEFT JOIN inventory.batches b ON ii.batch_id = b.batch_id
            WHERE i.org_id = p_org_id
            AND i.invoice_date BETWEEN p_start_date AND p_end_date
            AND i.invoice_status = 'posted'
            AND (p_entity_id IS NULL OR ii.product_id = p_entity_id)
            GROUP BY ii.product_id, p.product_name
        )
        SELECT 
            ps.product_id::INTEGER as entity_id,
            ps.product_name as entity_name,
            'product' as entity_type,
            ps.revenue,
            ps.cogs as cost_of_goods,
            ps.revenue - ps.cogs as gross_profit,
            CASE 
                WHEN ps.revenue > 0 THEN ((ps.revenue - ps.cogs) / ps.revenue * 100)
                ELSE 0
            END as gross_margin_percent,
            0::NUMERIC as operating_expenses, -- Can be enhanced with expense allocation
            ps.revenue - ps.cogs as net_profit,
            CASE 
                WHEN ps.revenue > 0 THEN ((ps.revenue - ps.cogs) / ps.revenue * 100)
                ELSE 0
            END as net_margin_percent,
            ps.units as units_sold,
            ps.transactions as transaction_count,
            CASE 
                WHEN ps.transactions > 0 THEN ps.revenue / ps.transactions
                ELSE 0
            END as avg_transaction_value,
            ROW_NUMBER() OVER (ORDER BY ps.revenue - ps.cogs DESC) as rank_by_profit
        FROM product_sales ps
        ORDER BY gross_profit DESC;
        
    ELSIF p_analysis_type = 'customer' THEN
        RETURN QUERY
        WITH customer_sales AS (
            SELECT 
                i.customer_id,
                c.customer_name,
                SUM(i.final_amount) as revenue,
                SUM(ii.quantity * COALESCE(b.cost_per_unit, p.last_purchase_price, 0)) as cogs,
                SUM(ii.quantity) as units,
                COUNT(DISTINCT i.invoice_id) as transactions
            FROM sales.invoices i
            JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
            JOIN parties.customers c ON i.customer_id = c.customer_id
            JOIN inventory.products p ON ii.product_id = p.product_id
            LEFT JOIN inventory.batches b ON ii.batch_id = b.batch_id
            WHERE i.org_id = p_org_id
            AND i.invoice_date BETWEEN p_start_date AND p_end_date
            AND i.invoice_status = 'posted'
            AND (p_entity_id IS NULL OR i.customer_id = p_entity_id)
            GROUP BY i.customer_id, c.customer_name
        )
        SELECT 
            cs.customer_id::INTEGER as entity_id,
            cs.customer_name as entity_name,
            'customer' as entity_type,
            cs.revenue,
            cs.cogs as cost_of_goods,
            cs.revenue - cs.cogs as gross_profit,
            CASE 
                WHEN cs.revenue > 0 THEN ((cs.revenue - cs.cogs) / cs.revenue * 100)
                ELSE 0
            END as gross_margin_percent,
            0::NUMERIC as operating_expenses,
            cs.revenue - cs.cogs as net_profit,
            CASE 
                WHEN cs.revenue > 0 THEN ((cs.revenue - cs.cogs) / cs.revenue * 100)
                ELSE 0
            END as net_margin_percent,
            cs.units as units_sold,
            cs.transactions as transaction_count,
            CASE 
                WHEN cs.transactions > 0 THEN cs.revenue / cs.transactions
                ELSE 0
            END as avg_transaction_value,
            ROW_NUMBER() OVER (ORDER BY cs.revenue - cs.cogs DESC) as rank_by_profit
        FROM customer_sales cs
        ORDER BY gross_profit DESC;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 6. BANK RECONCILIATION AUTOMATION
-- =============================================
CREATE OR REPLACE FUNCTION auto_reconcile_bank_statement(
    p_org_id INTEGER,
    p_bank_account_id INTEGER,
    p_statement_date DATE,
    p_statement_balance NUMERIC,
    p_transactions JSONB,
    p_reconciled_by INTEGER
) RETURNS JSONB AS $$
DECLARE
    v_book_balance NUMERIC;
    v_reconciliation_id INTEGER;
    v_matched_count INTEGER := 0;
    v_unmatched_count INTEGER := 0;
    v_transaction JSONB;
    v_match RECORD;
    v_tolerance NUMERIC := 0.01;
BEGIN
    -- Get book balance
    SELECT 
        COALESCE(SUM(
            CASE 
                WHEN p.payment_type = 'receipt' THEN p.payment_amount
                ELSE -p.payment_amount
            END
        ), 0) + ba.opening_balance
    INTO v_book_balance
    FROM financial.payments p
    JOIN financial.bank_accounts ba ON p.bank_account_id = ba.account_id
    WHERE p.bank_account_id = p_bank_account_id
    AND p.payment_date <= p_statement_date
    AND p.payment_status IN ('processed', 'cleared')
    AND ba.account_id = p_bank_account_id
    GROUP BY ba.opening_balance;
    
    -- Create reconciliation record
    INSERT INTO financial.bank_reconciliations (
        org_id,
        bank_account_id,
        statement_date,
        statement_balance,
        book_balance,
        reconciliation_status,
        created_by
    ) VALUES (
        p_org_id,
        p_bank_account_id,
        p_statement_date,
        p_statement_balance,
        v_book_balance,
        'in_progress',
        p_reconciled_by
    ) RETURNING reconciliation_id INTO v_reconciliation_id;
    
    -- Process each bank transaction
    FOR v_transaction IN SELECT * FROM jsonb_array_elements(p_transactions)
    LOOP
        -- Try to match with book entries
        SELECT 
            p.payment_id,
            p.reference_number,
            p.payment_amount
        INTO v_match
        FROM financial.payments p
        WHERE p.bank_account_id = p_bank_account_id
        AND ABS(p.payment_amount - (v_transaction->>'amount')::NUMERIC) <= v_tolerance
        AND p.payment_date BETWEEN (v_transaction->>'date')::DATE - INTERVAL '3 days' 
                                AND (v_transaction->>'date')::DATE + INTERVAL '3 days'
        AND p.payment_status IN ('processed', 'cleared')
        AND NOT EXISTS (
            SELECT 1 FROM financial.bank_reconciliation_items bri
            WHERE bri.transaction_id = p.payment_id::TEXT
            AND bri.is_reconciled = TRUE
        )
        ORDER BY ABS(p.payment_date - (v_transaction->>'date')::DATE)
        LIMIT 1;
        
        IF FOUND THEN
            -- Create matched item
            INSERT INTO financial.bank_reconciliation_items (
                reconciliation_id,
                transaction_type,
                transaction_id,
                transaction_date,
                transaction_amount,
                bank_reference,
                bank_description,
                is_reconciled,
                reconciled_amount,
                match_confidence
            ) VALUES (
                v_reconciliation_id,
                'payment',
                v_match.payment_id::TEXT,
                (v_transaction->>'date')::DATE,
                v_match.payment_amount,
                v_transaction->>'reference',
                v_transaction->>'description',
                TRUE,
                (v_transaction->>'amount')::NUMERIC,
                CASE 
                    WHEN v_transaction->>'reference' = v_match.reference_number THEN 100
                    ELSE 90
                END
            );
            
            v_matched_count := v_matched_count + 1;
            
            -- Update payment status
            UPDATE financial.payments
            SET 
                payment_status = 'cleared',
                clearance_date = (v_transaction->>'date')::DATE
            WHERE payment_id = v_match.payment_id
            AND payment_status = 'processed';
        ELSE
            -- Create unmatched item
            INSERT INTO financial.bank_reconciliation_items (
                reconciliation_id,
                transaction_type,
                transaction_date,
                transaction_amount,
                bank_reference,
                bank_description,
                is_reconciled,
                requires_investigation
            ) VALUES (
                v_reconciliation_id,
                'bank_only',
                (v_transaction->>'date')::DATE,
                (v_transaction->>'amount')::NUMERIC,
                v_transaction->>'reference',
                v_transaction->>'description',
                FALSE,
                TRUE
            );
            
            v_unmatched_count := v_unmatched_count + 1;
        END IF;
    END LOOP;
    
    -- Update reconciliation status
    UPDATE financial.bank_reconciliations
    SET 
        reconciliation_status = CASE 
            WHEN v_unmatched_count = 0 THEN 'completed'
            ELSE 'partial'
        END,
        matched_count = v_matched_count,
        unmatched_count = v_unmatched_count,
        difference_amount = p_statement_balance - v_book_balance,
        completed_at = CASE 
            WHEN v_unmatched_count = 0 THEN CURRENT_TIMESTAMP
            ELSE NULL
        END
    WHERE reconciliation_id = v_reconciliation_id;
    
    RETURN jsonb_build_object(
        'reconciliation_id', v_reconciliation_id,
        'matched_count', v_matched_count,
        'unmatched_count', v_unmatched_count,
        'book_balance', v_book_balance,
        'statement_balance', p_statement_balance,
        'difference', p_statement_balance - v_book_balance,
        'status', CASE 
            WHEN v_unmatched_count = 0 THEN 'completed'
            ELSE 'partial'
        END
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 7. TAX CALCULATION ENGINE
-- =============================================
CREATE OR REPLACE FUNCTION calculate_taxes(
    p_org_id INTEGER,
    p_transaction_type TEXT, -- 'sale' or 'purchase'
    p_items JSONB,
    p_from_state TEXT,
    p_to_state TEXT,
    p_is_export BOOLEAN DEFAULT FALSE,
    p_is_sez BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_item JSONB;
    v_hsn_tax RECORD;
    v_is_interstate BOOLEAN;
    v_tax_lines JSONB := '[]'::JSONB;
    v_item_taxes JSONB;
    v_total_taxable NUMERIC := 0;
    v_total_igst NUMERIC := 0;
    v_total_cgst NUMERIC := 0;
    v_total_sgst NUMERIC := 0;
    v_total_cess NUMERIC := 0;
BEGIN
    -- Determine interstate transaction
    v_is_interstate := (p_from_state != p_to_state);
    
    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Get HSN tax rates
        SELECT 
            hsn_code,
            gst_percentage,
            cess_percentage,
            is_exempt
        INTO v_hsn_tax
        FROM gst.hsn_sac_codes
        WHERE hsn_code = v_item->>'hsn_code'
        AND is_active = TRUE;
        
        -- Calculate taxes for item
        IF p_is_export OR p_is_sez OR v_hsn_tax.is_exempt THEN
            -- Zero-rated supply
            v_item_taxes := jsonb_build_object(
                'taxable_amount', (v_item->>'taxable_amount')::NUMERIC,
                'igst_rate', 0,
                'igst_amount', 0,
                'cgst_rate', 0,
                'cgst_amount', 0,
                'sgst_rate', 0,
                'sgst_amount', 0,
                'cess_rate', 0,
                'cess_amount', 0,
                'total_tax', 0
            );
        ELSIF v_is_interstate THEN
            -- Interstate - IGST only
            v_item_taxes := jsonb_build_object(
                'taxable_amount', (v_item->>'taxable_amount')::NUMERIC,
                'igst_rate', v_hsn_tax.gst_percentage,
                'igst_amount', ROUND((v_item->>'taxable_amount')::NUMERIC * v_hsn_tax.gst_percentage / 100, 2),
                'cgst_rate', 0,
                'cgst_amount', 0,
                'sgst_rate', 0,
                'sgst_amount', 0,
                'cess_rate', v_hsn_tax.cess_percentage,
                'cess_amount', ROUND((v_item->>'taxable_amount')::NUMERIC * v_hsn_tax.cess_percentage / 100, 2),
                'total_tax', ROUND((v_item->>'taxable_amount')::NUMERIC * 
                    (v_hsn_tax.gst_percentage + v_hsn_tax.cess_percentage) / 100, 2)
            );
            
            v_total_igst := v_total_igst + (v_item_taxes->>'igst_amount')::NUMERIC;
        ELSE
            -- Intrastate - CGST + SGST
            v_item_taxes := jsonb_build_object(
                'taxable_amount', (v_item->>'taxable_amount')::NUMERIC,
                'igst_rate', 0,
                'igst_amount', 0,
                'cgst_rate', v_hsn_tax.gst_percentage / 2,
                'cgst_amount', ROUND((v_item->>'taxable_amount')::NUMERIC * v_hsn_tax.gst_percentage / 200, 2),
                'sgst_rate', v_hsn_tax.gst_percentage / 2,
                'sgst_amount', ROUND((v_item->>'taxable_amount')::NUMERIC * v_hsn_tax.gst_percentage / 200, 2),
                'cess_rate', v_hsn_tax.cess_percentage,
                'cess_amount', ROUND((v_item->>'taxable_amount')::NUMERIC * v_hsn_tax.cess_percentage / 100, 2),
                'total_tax', ROUND((v_item->>'taxable_amount')::NUMERIC * 
                    (v_hsn_tax.gst_percentage + v_hsn_tax.cess_percentage) / 100, 2)
            );
            
            v_total_cgst := v_total_cgst + (v_item_taxes->>'cgst_amount')::NUMERIC;
            v_total_sgst := v_total_sgst + (v_item_taxes->>'sgst_amount')::NUMERIC;
        END IF;
        
        v_total_taxable := v_total_taxable + (v_item->>'taxable_amount')::NUMERIC;
        v_total_cess := v_total_cess + (v_item_taxes->>'cess_amount')::NUMERIC;
        
        -- Add to tax lines
        v_tax_lines := v_tax_lines || (v_item || v_item_taxes);
    END LOOP;
    
    -- Return tax calculation
    RETURN jsonb_build_object(
        'transaction_type', p_transaction_type,
        'is_interstate', v_is_interstate,
        'is_export', p_is_export,
        'is_sez', p_is_sez,
        'from_state', p_from_state,
        'to_state', p_to_state,
        'total_taxable_value', v_total_taxable,
        'total_igst', v_total_igst,
        'total_cgst', v_total_cgst,
        'total_sgst', v_total_sgst,
        'total_cess', v_total_cess,
        'total_tax', v_total_igst + v_total_cgst + v_total_sgst + v_total_cess,
        'grand_total', v_total_taxable + v_total_igst + v_total_cgst + v_total_sgst + v_total_cess,
        'tax_lines', v_tax_lines
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SUPPORTING FUNCTIONS
-- =============================================

-- Get customer statement
CREATE OR REPLACE FUNCTION get_customer_statement(
    p_customer_id INTEGER,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    transaction_date DATE,
    document_type TEXT,
    document_number TEXT,
    narration TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    running_balance NUMERIC
) AS $$
DECLARE
    v_opening_balance NUMERIC;
    v_running_balance NUMERIC;
BEGIN
    -- Get opening balance
    SELECT COALESCE(SUM(
        CASE 
            WHEN document_type = 'invoice' THEN original_amount
            WHEN document_type = 'debit_note' THEN original_amount
            WHEN document_type = 'credit_note' THEN -original_amount
            ELSE 0
        END
    ), 0)
    INTO v_opening_balance
    FROM financial.customer_outstanding
    WHERE customer_id = p_customer_id
    AND document_date < p_start_date;
    
    v_running_balance := v_opening_balance;
    
    -- Opening balance row
    RETURN QUERY
    SELECT 
        p_start_date - INTERVAL '1 day',
        'opening_balance'::TEXT,
        ''::TEXT,
        'Opening Balance'::TEXT,
        CASE WHEN v_opening_balance > 0 THEN v_opening_balance ELSE 0 END,
        CASE WHEN v_opening_balance < 0 THEN ABS(v_opening_balance) ELSE 0 END,
        v_opening_balance;
    
    -- Transaction details
    RETURN QUERY
    WITH transactions AS (
        -- Invoices
        SELECT 
            i.invoice_date as trans_date,
            'invoice' as doc_type,
            i.invoice_number as doc_number,
            'Sales Invoice' as narration,
            i.final_amount as debit,
            0::NUMERIC as credit
        FROM sales.invoices i
        WHERE i.customer_id = p_customer_id
        AND i.invoice_date BETWEEN p_start_date AND p_end_date
        AND i.invoice_status = 'posted'
        
        UNION ALL
        
        -- Payments
        SELECT 
            p.payment_date,
            'payment',
            p.reference_number,
            'Payment Received',
            0,
            p.payment_amount
        FROM financial.payments p
        WHERE p.party_id = p_customer_id
        AND p.party_type = 'customer'
        AND p.payment_date BETWEEN p_start_date AND p_end_date
        AND p.payment_status IN ('processed', 'cleared')
        
        UNION ALL
        
        -- Credit Notes
        SELECT 
            sr.credit_note_date,
            'credit_note',
            sr.credit_note_number,
            'Sales Return',
            0,
            sr.total_amount
        FROM sales.sales_returns sr
        WHERE sr.customer_id = p_customer_id
        AND sr.credit_note_date BETWEEN p_start_date AND p_end_date
        AND sr.credit_note_status = 'issued'
        
        ORDER BY trans_date, doc_type
    )
    SELECT 
        t.trans_date,
        t.doc_type,
        t.doc_number,
        t.narration,
        t.debit,
        t.credit,
        v_running_balance + SUM(t.debit - t.credit) OVER (ORDER BY t.trans_date, t.doc_type)
    FROM transactions t;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Format currency
CREATE OR REPLACE FUNCTION format_currency(
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'INR'
) RETURNS TEXT AS $$
BEGIN
    IF p_currency = 'INR' THEN
        RETURN '₹' || TO_CHAR(p_amount, 'FM99,99,99,999.00');
    ELSE
        RETURN p_currency || ' ' || TO_CHAR(p_amount, 'FM999,999,999.00');
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate due date
CREATE OR REPLACE FUNCTION calculate_due_date(
    p_invoice_date DATE,
    p_payment_terms TEXT
) RETURNS DATE AS $$
DECLARE
    v_days INTEGER;
BEGIN
    -- Extract days from payment terms
    v_days := CASE p_payment_terms
        WHEN 'immediate' THEN 0
        WHEN 'net_7' THEN 7
        WHEN 'net_15' THEN 15
        WHEN 'net_30' THEN 30
        WHEN 'net_45' THEN 45
        WHEN 'net_60' THEN 60
        WHEN 'net_90' THEN 90
        ELSE COALESCE(
            NULLIF(REGEXP_REPLACE(p_payment_terms, '[^0-9]', '', 'g'), '')::INTEGER,
            30
        )
    END;
    
    RETURN p_invoice_date + (v_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================
-- INDEXES FOR FUNCTIONS
-- =============================================
CREATE INDEX idx_journal_entries_lookup ON financial.journal_entries(org_id, journal_number);
CREATE INDEX idx_payments_reconciliation ON financial.payments(org_id, party_id, payment_status);
CREATE INDEX idx_outstanding_aging ON financial.customer_outstanding(org_id, customer_id, due_date);
CREATE INDEX idx_invoices_profitability ON sales.invoices(org_id, invoice_date, invoice_status);

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON FUNCTION create_journal_entry IS 'Creates balanced journal entries with automatic numbering';
COMMENT ON FUNCTION reconcile_payment_batch IS 'Batch reconciliation of payments with outstanding invoices';
COMMENT ON FUNCTION generate_aging_analysis IS 'Generates customer aging analysis with buckets';
COMMENT ON FUNCTION project_cash_flow IS 'Projects daily cash flow with collections and payments';
COMMENT ON FUNCTION calculate_profitability IS 'Calculates profitability by product, customer, or category';
COMMENT ON FUNCTION auto_reconcile_bank_statement IS 'Automated bank reconciliation with intelligent matching';
COMMENT ON FUNCTION calculate_taxes IS 'GST calculation engine with interstate/intrastate logic';