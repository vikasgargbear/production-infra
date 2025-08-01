-- =============================================
-- FINANCIAL MODULE APIS
-- =============================================
-- Global API functions for financial management
-- =============================================

-- =============================================
-- PAYMENT RECORDING API
-- =============================================
CREATE OR REPLACE FUNCTION api.record_payment(
    p_payment_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment_id INTEGER;
    v_payment_number VARCHAR(50);
    v_allocation JSONB;
    v_result JSONB;
    v_journal_entry_id INTEGER;
BEGIN
    -- Generate payment number
    SELECT 'PAY-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
           LPAD((COALESCE(MAX(SUBSTRING(payment_number FROM '[0-9]+$')::INTEGER), 0) + 1)::TEXT, 5, '0')
    INTO v_payment_number
    FROM financial.payments
    WHERE payment_number LIKE 'PAY-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '%';
    
    -- Create payment record
    INSERT INTO financial.payments (
        org_id,
        branch_id,
        payment_number,
        payment_date,
        party_type,
        party_id,
        payment_type,
        payment_mode,
        amount,
        bank_reference,
        cheque_details,
        payment_status,
        allocation_status,
        created_by
    )
    VALUES (
        (p_payment_data->>'org_id')::INTEGER,
        (p_payment_data->>'branch_id')::INTEGER,
        v_payment_number,
        COALESCE((p_payment_data->>'payment_date')::DATE, CURRENT_DATE),
        p_payment_data->>'party_type',
        (p_payment_data->>'party_id')::INTEGER,
        p_payment_data->>'payment_type',
        p_payment_data->>'payment_mode',
        (p_payment_data->>'amount')::NUMERIC,
        p_payment_data->>'bank_reference',
        p_payment_data->'cheque_details',
        CASE 
            WHEN p_payment_data->>'payment_mode' = 'cheque' THEN 'pending'
            ELSE 'cleared'
        END,
        'pending',
        (p_payment_data->>'created_by')::INTEGER
    )
    RETURNING payment_id INTO v_payment_id;
    
    -- Process allocations if provided
    IF p_payment_data->'allocations' IS NOT NULL THEN
        FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_payment_data->'allocations')
        LOOP
            INSERT INTO financial.payment_allocations (
                payment_id,
                reference_type,
                reference_id,
                allocated_amount
            )
            VALUES (
                v_payment_id,
                v_allocation->>'reference_type',
                (v_allocation->>'reference_id')::INTEGER,
                (v_allocation->>'allocated_amount')::NUMERIC
            );
            
            -- Update invoice if allocation is for invoice
            IF v_allocation->>'reference_type' = 'invoice' THEN
                UPDATE sales.invoices
                SET paid_amount = paid_amount + (v_allocation->>'allocated_amount')::NUMERIC,
                    payment_status = CASE 
                        WHEN paid_amount + (v_allocation->>'allocated_amount')::NUMERIC >= total_amount THEN 'paid'
                        ELSE 'partial'
                    END
                WHERE invoice_id = (v_allocation->>'reference_id')::INTEGER;
            END IF;
        END LOOP;
        
        -- Update payment allocation status
        UPDATE financial.payments
        SET allocation_status = 'full',
            allocated_amount = amount
        WHERE payment_id = v_payment_id;
    END IF;
    
    -- Create journal entry
    SELECT create_journal_entry(
        p_payment_data->>'org_id',
        CASE 
            WHEN p_payment_data->>'payment_type' = 'receipt' THEN 'receipt'
            ELSE 'payment'
        END,
        'payment',
        v_payment_id::TEXT,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object(
                'account_id', CASE 
                    WHEN p_payment_data->>'payment_mode' = 'cash' THEN 1111  -- Cash account
                    ELSE 1112  -- Bank account
                END,
                'debit_amount', CASE 
                    WHEN p_payment_data->>'payment_type' = 'receipt' THEN (p_payment_data->>'amount')::NUMERIC
                    ELSE 0
                END,
                'credit_amount', CASE 
                    WHEN p_payment_data->>'payment_type' = 'payment' THEN (p_payment_data->>'amount')::NUMERIC
                    ELSE 0
                END
            ),
            jsonb_build_object(
                'account_id', CASE 
                    WHEN p_payment_data->>'party_type' = 'customer' THEN 1200  -- AR account
                    ELSE 2110  -- AP account
                END,
                'debit_amount', CASE 
                    WHEN p_payment_data->>'payment_type' = 'payment' THEN (p_payment_data->>'amount')::NUMERIC
                    ELSE 0
                END,
                'credit_amount', CASE 
                    WHEN p_payment_data->>'payment_type' = 'receipt' THEN (p_payment_data->>'amount')::NUMERIC
                    ELSE 0
                END
            )
        ),
        'Payment ' || v_payment_number,
        (p_payment_data->>'created_by')::INTEGER
    ) INTO v_journal_entry_id;
    
    -- Return result
    SELECT jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'payment_number', v_payment_number,
        'journal_entry_id', v_journal_entry_id,
        'message', 'Payment recorded successfully'
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
-- CUSTOMER OUTSTANDING API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_customer_outstanding(
    p_customer_id INTEGER DEFAULT NULL,
    p_as_on_date DATE DEFAULT CURRENT_DATE,
    p_aging_buckets BOOLEAN DEFAULT TRUE,
    p_include_pdc BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH outstanding_details AS (
        SELECT 
            c.customer_id,
            c.customer_name,
            c.customer_code,
            c.credit_info->>'credit_limit' as credit_limit,
            SUM(i.total_amount - i.paid_amount) as total_outstanding,
            SUM(CASE WHEN CURRENT_DATE - i.due_date <= 0 THEN i.total_amount - i.paid_amount ELSE 0 END) as current_due,
            SUM(CASE WHEN CURRENT_DATE - i.due_date BETWEEN 1 AND 30 THEN i.total_amount - i.paid_amount ELSE 0 END) as overdue_0_30,
            SUM(CASE WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60 THEN i.total_amount - i.paid_amount ELSE 0 END) as overdue_31_60,
            SUM(CASE WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90 THEN i.total_amount - i.paid_amount ELSE 0 END) as overdue_61_90,
            SUM(CASE WHEN CURRENT_DATE - i.due_date > 90 THEN i.total_amount - i.paid_amount ELSE 0 END) as overdue_above_90,
            MAX(CURRENT_DATE - i.due_date) as max_days_overdue,
            COUNT(DISTINCT i.invoice_id) as outstanding_invoices
        FROM parties.customers c
        JOIN sales.invoices i ON c.customer_id = i.customer_id
        WHERE i.invoice_status = 'posted'
        AND i.total_amount > i.paid_amount
        AND i.invoice_date <= p_as_on_date
        AND (p_customer_id IS NULL OR c.customer_id = p_customer_id)
        GROUP BY c.customer_id, c.customer_name, c.customer_code, c.credit_info
    ),
    pdc_details AS (
        SELECT 
            party_id as customer_id,
            SUM(amount) as pdc_amount,
            COUNT(*) as pdc_count,
            MIN(maturity_date) as next_pdc_date
        FROM financial.pdc_management
        WHERE party_type = 'customer'
        AND pdc_status = 'pending'
        AND maturity_date > p_as_on_date
        AND (p_customer_id IS NULL OR party_id = p_customer_id)
        GROUP BY party_id
    ),
    invoice_list AS (
        SELECT 
            i.customer_id,
            jsonb_agg(
                jsonb_build_object(
                    'invoice_id', i.invoice_id,
                    'invoice_number', i.invoice_number,
                    'invoice_date', i.invoice_date,
                    'due_date', i.due_date,
                    'total_amount', i.total_amount,
                    'paid_amount', i.paid_amount,
                    'balance_amount', i.total_amount - i.paid_amount,
                    'days_overdue', GREATEST(0, CURRENT_DATE - i.due_date),
                    'aging_bucket', CASE
                        WHEN CURRENT_DATE - i.due_date <= 0 THEN 'current'
                        WHEN CURRENT_DATE - i.due_date <= 30 THEN '0-30 days'
                        WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60 days'
                        WHEN CURRENT_DATE - i.due_date <= 90 THEN '61-90 days'
                        ELSE 'Above 90 days'
                    END
                ) ORDER BY i.due_date
            ) as invoices
        FROM sales.invoices i
        WHERE i.invoice_status = 'posted'
        AND i.total_amount > i.paid_amount
        AND i.invoice_date <= p_as_on_date
        AND (p_customer_id IS NULL OR i.customer_id = p_customer_id)
        GROUP BY i.customer_id
    )
    SELECT jsonb_build_object(
        'as_on_date', p_as_on_date,
        'customers', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'customer_id', od.customer_id,
                    'customer_name', od.customer_name,
                    'customer_code', od.customer_code,
                    'credit_limit', od.credit_limit::NUMERIC,
                    'total_outstanding', od.total_outstanding,
                    'outstanding_invoices', od.outstanding_invoices,
                    'max_days_overdue', od.max_days_overdue,
                    'aging_summary', CASE 
                        WHEN p_aging_buckets THEN jsonb_build_object(
                            'current', od.current_due,
                            '0_30_days', od.overdue_0_30,
                            '31_60_days', od.overdue_31_60,
                            '61_90_days', od.overdue_61_90,
                            'above_90_days', od.overdue_above_90
                        )
                        ELSE NULL
                    END,
                    'pdc_info', CASE 
                        WHEN p_include_pdc THEN jsonb_build_object(
                            'pdc_amount', COALESCE(pd.pdc_amount, 0),
                            'pdc_count', COALESCE(pd.pdc_count, 0),
                            'next_pdc_date', pd.next_pdc_date
                        )
                        ELSE NULL
                    END,
                    'net_outstanding', od.total_outstanding - COALESCE(pd.pdc_amount, 0),
                    'credit_utilization', ROUND(
                        (od.total_outstanding / NULLIF(od.credit_limit::NUMERIC, 0)) * 100, 
                        2
                    ),
                    'invoices', il.invoices
                ) ORDER BY od.total_outstanding DESC
            ), 
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'total_customers', COUNT(DISTINCT od.customer_id),
            'total_outstanding', SUM(od.total_outstanding),
            'total_pdc', SUM(COALESCE(pd.pdc_amount, 0)),
            'net_outstanding', SUM(od.total_outstanding - COALESCE(pd.pdc_amount, 0)),
            'aging_summary', jsonb_build_object(
                'current', SUM(od.current_due),
                '0_30_days', SUM(od.overdue_0_30),
                '31_60_days', SUM(od.overdue_31_60),
                '61_90_days', SUM(od.overdue_61_90),
                'above_90_days', SUM(od.overdue_above_90)
            )
        )
    ) INTO v_result
    FROM outstanding_details od
    LEFT JOIN pdc_details pd ON od.customer_id = pd.customer_id
    LEFT JOIN invoice_list il ON od.customer_id = il.customer_id;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- CASH FLOW API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_cash_flow_forecast(
    p_from_date DATE DEFAULT CURRENT_DATE,
    p_to_date DATE DEFAULT CURRENT_DATE + INTERVAL '30 days',
    p_branch_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH date_series AS (
        SELECT generate_series(p_from_date, p_to_date, '1 day'::interval)::date as forecast_date
    ),
    expected_receipts AS (
        SELECT 
            due_date as transaction_date,
            'customer_receipts' as transaction_type,
            SUM(total_amount - paid_amount) as amount
        FROM sales.invoices
        WHERE invoice_status = 'posted'
        AND payment_status != 'paid'
        AND due_date BETWEEN p_from_date AND p_to_date
        AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        GROUP BY due_date
    ),
    expected_payments AS (
        SELECT 
            si.due_date as transaction_date,
            'supplier_payments' as transaction_type,
            -SUM(si.total_amount - si.paid_amount) as amount
        FROM procurement.supplier_invoices si
        WHERE si.invoice_status = 'posted'
        AND si.payment_status != 'paid'
        AND si.due_date BETWEEN p_from_date AND p_to_date
        AND (p_branch_id IS NULL OR si.branch_id = p_branch_id)
        GROUP BY si.due_date
    ),
    pdc_inflows AS (
        SELECT 
            maturity_date as transaction_date,
            'pdc_receipts' as transaction_type,
            SUM(amount) as amount
        FROM financial.pdc_management
        WHERE party_type = 'customer'
        AND pdc_status = 'pending'
        AND maturity_date BETWEEN p_from_date AND p_to_date
        AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        GROUP BY maturity_date
    ),
    pdc_outflows AS (
        SELECT 
            maturity_date as transaction_date,
            'pdc_payments' as transaction_type,
            -SUM(amount) as amount
        FROM financial.pdc_management
        WHERE party_type = 'supplier'
        AND pdc_status = 'pending'
        AND maturity_date BETWEEN p_from_date AND p_to_date
        AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        GROUP BY maturity_date
    ),
    all_transactions AS (
        SELECT * FROM expected_receipts
        UNION ALL
        SELECT * FROM expected_payments
        UNION ALL
        SELECT * FROM pdc_inflows
        UNION ALL
        SELECT * FROM pdc_outflows
    ),
    daily_forecast AS (
        SELECT 
            ds.forecast_date,
            COALESCE(SUM(at.amount) FILTER (WHERE at.transaction_type IN ('customer_receipts', 'pdc_receipts')), 0) as expected_inflows,
            COALESCE(ABS(SUM(at.amount) FILTER (WHERE at.transaction_type IN ('supplier_payments', 'pdc_payments'))), 0) as expected_outflows,
            COALESCE(SUM(at.amount), 0) as net_flow
        FROM date_series ds
        LEFT JOIN all_transactions at ON ds.forecast_date = at.transaction_date
        GROUP BY ds.forecast_date
    )
    SELECT jsonb_build_object(
        'forecast_period', jsonb_build_object(
            'from_date', p_from_date,
            'to_date', p_to_date
        ),
        'current_balance', (
            SELECT SUM(CASE 
                WHEN je.account_id IN (1111, 1112) THEN jel.debit_amount - jel.credit_amount 
                ELSE 0 
            END)
            FROM financial.journal_entry_lines jel
            JOIN financial.journal_entries je ON jel.entry_id = je.entry_id
            WHERE je.posting_status = 'posted'
            AND je.entry_date <= CURRENT_DATE
            AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
        ),
        'daily_forecast', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'date', df.forecast_date,
                    'day_of_week', TO_CHAR(df.forecast_date, 'Day'),
                    'expected_inflows', df.expected_inflows,
                    'expected_outflows', df.expected_outflows,
                    'net_flow', df.net_flow,
                    'cumulative_balance', SUM(df.net_flow) OVER (ORDER BY df.forecast_date)
                ) ORDER BY df.forecast_date
            ), 
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'total_expected_inflows', SUM(df.expected_inflows),
            'total_expected_outflows', SUM(df.expected_outflows),
            'net_change', SUM(df.net_flow),
            'lowest_balance_date', (
                SELECT forecast_date 
                FROM daily_forecast 
                ORDER BY SUM(net_flow) OVER (ORDER BY forecast_date) 
                LIMIT 1
            ),
            'highest_balance_date', (
                SELECT forecast_date 
                FROM daily_forecast 
                ORDER BY SUM(net_flow) OVER (ORDER BY forecast_date) DESC 
                LIMIT 1
            )
        )
    ) INTO v_result
    FROM daily_forecast df;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- PROFIT & LOSS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_profit_loss_statement(
    p_from_date DATE,
    p_to_date DATE,
    p_branch_id INTEGER DEFAULT NULL,
    p_comparison_period BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_prev_from_date DATE;
    v_prev_to_date DATE;
BEGIN
    -- Calculate previous period dates for comparison
    IF p_comparison_period THEN
        v_prev_from_date := p_from_date - (p_to_date - p_from_date + 1);
        v_prev_to_date := p_from_date - 1;
    END IF;
    
    WITH current_period AS (
        SELECT 
            coa.account_type,
            coa.account_category,
            coa.account_name,
            coa.account_code,
            SUM(CASE 
                WHEN coa.account_type = 'revenue' THEN jel.credit_amount - jel.debit_amount
                WHEN coa.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount
                ELSE 0
            END) as amount
        FROM financial.journal_entry_lines jel
        JOIN financial.journal_entries je ON jel.entry_id = je.entry_id
        JOIN financial.chart_of_accounts coa ON jel.account_id = coa.account_id
        WHERE je.posting_status = 'posted'
        AND je.entry_date BETWEEN p_from_date AND p_to_date
        AND coa.account_type IN ('revenue', 'expense')
        AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
        GROUP BY coa.account_type, coa.account_category, coa.account_name, coa.account_code
    ),
    previous_period AS (
        SELECT 
            coa.account_type,
            coa.account_category,
            coa.account_name,
            coa.account_code,
            SUM(CASE 
                WHEN coa.account_type = 'revenue' THEN jel.credit_amount - jel.debit_amount
                WHEN coa.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount
                ELSE 0
            END) as amount
        FROM financial.journal_entry_lines jel
        JOIN financial.journal_entries je ON jel.entry_id = je.entry_id
        JOIN financial.chart_of_accounts coa ON jel.account_id = coa.account_id
        WHERE je.posting_status = 'posted'
        AND je.entry_date BETWEEN v_prev_from_date AND v_prev_to_date
        AND coa.account_type IN ('revenue', 'expense')
        AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
        AND p_comparison_period = TRUE
        GROUP BY coa.account_type, coa.account_category, coa.account_name, coa.account_code
    )
    SELECT jsonb_build_object(
        'period', jsonb_build_object(
            'from_date', p_from_date,
            'to_date', p_to_date
        ),
        'revenue', jsonb_build_object(
            'total', COALESCE(SUM(cp.amount) FILTER (WHERE cp.account_type = 'revenue'), 0),
            'previous_period', CASE 
                WHEN p_comparison_period 
                THEN COALESCE(SUM(pp.amount) FILTER (WHERE pp.account_type = 'revenue'), 0)
                ELSE NULL
            END,
            'accounts', COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'account_code', cp.account_code,
                        'account_name', cp.account_name,
                        'amount', cp.amount,
                        'previous_amount', pp.amount,
                        'variance', CASE 
                            WHEN p_comparison_period AND pp.amount IS NOT NULL 
                            THEN cp.amount - pp.amount
                            ELSE NULL
                        END
                    ) ORDER BY cp.amount DESC
                ) FILTER (WHERE cp.account_type = 'revenue'), 
                '[]'::jsonb
            )
        ),
        'expenses', jsonb_build_object(
            'total', COALESCE(SUM(cp.amount) FILTER (WHERE cp.account_type = 'expense'), 0),
            'previous_period', CASE 
                WHEN p_comparison_period 
                THEN COALESCE(SUM(pp.amount) FILTER (WHERE pp.account_type = 'expense'), 0)
                ELSE NULL
            END,
            'by_category', (
                SELECT jsonb_object_agg(
                    account_category,
                    jsonb_build_object(
                        'total', category_total,
                        'accounts', accounts
                    )
                )
                FROM (
                    SELECT 
                        cp2.account_category,
                        SUM(cp2.amount) as category_total,
                        jsonb_agg(
                            jsonb_build_object(
                                'account_code', cp2.account_code,
                                'account_name', cp2.account_name,
                                'amount', cp2.amount
                            ) ORDER BY cp2.amount DESC
                        ) as accounts
                    FROM current_period cp2
                    WHERE cp2.account_type = 'expense'
                    GROUP BY cp2.account_category
                ) expense_categories
            )
        ),
        'profit_loss', jsonb_build_object(
            'gross_profit', COALESCE(
                SUM(cp.amount) FILTER (WHERE cp.account_type = 'revenue'), 0
            ) - COALESCE(
                SUM(cp.amount) FILTER (WHERE cp.account_type = 'expense' AND cp.account_category = 'detail' AND cp.account_code LIKE '51%'), 0
            ),
            'net_profit', COALESCE(
                SUM(cp.amount) FILTER (WHERE cp.account_type = 'revenue'), 0
            ) - COALESCE(
                SUM(cp.amount) FILTER (WHERE cp.account_type = 'expense'), 0
            ),
            'profit_margin', CASE 
                WHEN SUM(cp.amount) FILTER (WHERE cp.account_type = 'revenue') > 0
                THEN ROUND(
                    ((SUM(cp.amount) FILTER (WHERE cp.account_type = 'revenue') - 
                      SUM(cp.amount) FILTER (WHERE cp.account_type = 'expense')) / 
                     SUM(cp.amount) FILTER (WHERE cp.account_type = 'revenue')) * 100,
                    2
                )
                ELSE 0
            END
        )
    ) INTO v_result
    FROM current_period cp
    LEFT JOIN previous_period pp ON cp.account_code = pp.account_code;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- BALANCE SHEET API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_balance_sheet(
    p_as_on_date DATE DEFAULT CURRENT_DATE,
    p_branch_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH account_balances AS (
        SELECT 
            coa.account_type,
            coa.account_category,
            coa.account_id,
            coa.account_code,
            coa.account_name,
            coa.parent_account_id,
            SUM(CASE 
                WHEN coa.account_type IN ('asset', 'expense') THEN jel.debit_amount - jel.credit_amount
                WHEN coa.account_type IN ('liability', 'equity', 'revenue') THEN jel.credit_amount - jel.debit_amount
                ELSE 0
            END) as balance
        FROM financial.chart_of_accounts coa
        LEFT JOIN financial.journal_entry_lines jel ON coa.account_id = jel.account_id
        LEFT JOIN financial.journal_entries je ON jel.entry_id = je.entry_id 
            AND je.posting_status = 'posted'
            AND je.entry_date <= p_as_on_date
            AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
        WHERE coa.account_type IN ('asset', 'liability', 'equity')
        AND coa.is_active = TRUE
        GROUP BY coa.account_type, coa.account_category, coa.account_id, 
                 coa.account_code, coa.account_name, coa.parent_account_id
    )
    SELECT jsonb_build_object(
        'as_on_date', p_as_on_date,
        'assets', jsonb_build_object(
            'current_assets', COALESCE(
                SUM(ab.balance) FILTER (WHERE ab.account_type = 'asset' AND ab.parent_account_id = 1100),
                0
            ),
            'fixed_assets', COALESCE(
                SUM(ab.balance) FILTER (WHERE ab.account_type = 'asset' AND ab.parent_account_id != 1100),
                0
            ),
            'total', COALESCE(
                SUM(ab.balance) FILTER (WHERE ab.account_type = 'asset'),
                0
            ),
            'accounts', COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'account_code', ab.account_code,
                        'account_name', ab.account_name,
                        'balance', ab.balance
                    ) ORDER BY ab.account_code
                ) FILTER (WHERE ab.account_type = 'asset' AND ab.balance != 0),
                '[]'::jsonb
            )
        ),
        'liabilities', jsonb_build_object(
            'current_liabilities', COALESCE(
                SUM(ab.balance) FILTER (WHERE ab.account_type = 'liability' AND ab.parent_account_id = 2100),
                0
            ),
            'long_term_liabilities', COALESCE(
                SUM(ab.balance) FILTER (WHERE ab.account_type = 'liability' AND ab.parent_account_id != 2100),
                0
            ),
            'total', COALESCE(
                SUM(ab.balance) FILTER (WHERE ab.account_type = 'liability'),
                0
            ),
            'accounts', COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'account_code', ab.account_code,
                        'account_name', ab.account_name,
                        'balance', ab.balance
                    ) ORDER BY ab.account_code
                ) FILTER (WHERE ab.account_type = 'liability' AND ab.balance != 0),
                '[]'::jsonb
            )
        ),
        'equity', jsonb_build_object(
            'total', COALESCE(
                SUM(ab.balance) FILTER (WHERE ab.account_type = 'equity'),
                0
            ) + (
                -- Add current year profit/loss
                SELECT COALESCE(
                    SUM(CASE 
                        WHEN coa2.account_type = 'revenue' THEN jel2.credit_amount - jel2.debit_amount
                        WHEN coa2.account_type = 'expense' THEN jel2.debit_amount - jel2.credit_amount
                        ELSE 0
                    END), 0
                )
                FROM financial.journal_entry_lines jel2
                JOIN financial.journal_entries je2 ON jel2.entry_id = je2.entry_id
                JOIN financial.chart_of_accounts coa2 ON jel2.account_id = coa2.account_id
                WHERE je2.posting_status = 'posted'
                AND je2.entry_date <= p_as_on_date
                AND EXTRACT(YEAR FROM je2.entry_date) = EXTRACT(YEAR FROM p_as_on_date)
                AND coa2.account_type IN ('revenue', 'expense')
                AND (p_branch_id IS NULL OR je2.branch_id = p_branch_id)
            ),
            'accounts', COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'account_code', ab.account_code,
                        'account_name', ab.account_name,
                        'balance', ab.balance
                    ) ORDER BY ab.account_code
                ) FILTER (WHERE ab.account_type = 'equity' AND ab.balance != 0),
                '[]'::jsonb
            )
        ),
        'validation', jsonb_build_object(
            'is_balanced', ABS(
                COALESCE(SUM(ab.balance) FILTER (WHERE ab.account_type = 'asset'), 0) -
                (COALESCE(SUM(ab.balance) FILTER (WHERE ab.account_type = 'liability'), 0) +
                 COALESCE(SUM(ab.balance) FILTER (WHERE ab.account_type = 'equity'), 0))
            ) < 0.01
        )
    ) INTO v_result
    FROM account_balances ab;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.record_payment TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_customer_outstanding TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_cash_flow_forecast TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_profit_loss_statement TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_balance_sheet TO authenticated_user;

COMMENT ON FUNCTION api.record_payment IS 'Record payment with automatic journal entry creation';
COMMENT ON FUNCTION api.get_customer_outstanding IS 'Get customer outstanding with aging analysis';
COMMENT ON FUNCTION api.get_cash_flow_forecast IS 'Get cash flow forecast based on receivables and payables';
COMMENT ON FUNCTION api.get_profit_loss_statement IS 'Get profit & loss statement with comparison';
COMMENT ON FUNCTION api.get_balance_sheet IS 'Get balance sheet as on specific date';