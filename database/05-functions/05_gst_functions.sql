-- =============================================
-- GST BUSINESS FUNCTIONS
-- =============================================
-- Complex GST operations including return filing,
-- reconciliation, e-way bill generation, and compliance
-- =============================================

-- =============================================
-- 1. GENERATE GSTR-1 RETURN DATA
-- =============================================
CREATE OR REPLACE FUNCTION generate_gstr1_data(
    p_org_id INTEGER,
    p_return_period TEXT, -- Format: 'MM-YYYY'
    p_branch_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    return_summary JSONB,
    b2b_invoices JSONB,
    b2c_summary JSONB,
    credit_notes JSONB,
    export_invoices JSONB,
    advance_receipts JSONB,
    hsn_summary JSONB
) AS $$
DECLARE
    v_month INTEGER;
    v_year INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_b2b_data JSONB;
    v_b2c_data JSONB;
    v_cdn_data JSONB;
    v_exp_data JSONB;
    v_at_data JSONB;
    v_hsn_data JSONB;
    v_summary JSONB;
BEGIN
    -- Parse period
    v_month := SUBSTRING(p_return_period FROM 1 FOR 2)::INTEGER;
    v_year := SUBSTRING(p_return_period FROM 4 FOR 4)::INTEGER;
    v_start_date := DATE(v_year || '-' || v_month || '-01');
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- B2B Invoices (Business to Business)
    SELECT jsonb_agg(
        jsonb_build_object(
            'gstin', c.gstin,
            'receiver_name', c.customer_name,
            'invoices', invoices
        ) ORDER BY c.customer_name
    )
    INTO v_b2b_data
    FROM (
        SELECT 
            i.customer_id,
            jsonb_agg(
                jsonb_build_object(
                    'invoice_number', i.invoice_number,
                    'invoice_date', i.invoice_date,
                    'invoice_value', i.final_amount,
                    'place_of_supply', i.place_of_supply,
                    'reverse_charge', COALESCE(i.is_reverse_charge, FALSE),
                    'invoice_type', i.invoice_type,
                    'items', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'hsn_code', ii.hsn_code,
                                'taxable_value', ii.base_amount,
                                'igst_rate', CASE WHEN i.supply_type = 'interstate' 
                                           THEN ii.gst_percentage ELSE 0 END,
                                'igst_amount', ii.igst_amount,
                                'cgst_rate', CASE WHEN i.supply_type = 'intrastate' 
                                           THEN ii.gst_percentage/2 ELSE 0 END,
                                'cgst_amount', ii.cgst_amount,
                                'sgst_rate', CASE WHEN i.supply_type = 'intrastate' 
                                           THEN ii.gst_percentage/2 ELSE 0 END,
                                'sgst_amount', ii.sgst_amount,
                                'cess_amount', COALESCE(ii.cess_amount, 0)
                            )
                        )
                        FROM sales.invoice_items ii
                        WHERE ii.invoice_id = i.invoice_id
                    )
                ) ORDER BY i.invoice_date
            ) as invoices
        FROM sales.invoices i
        WHERE i.org_id = p_org_id
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        AND i.invoice_date BETWEEN v_start_date AND v_end_date
        AND i.invoice_status = 'posted'
        AND EXISTS (
            SELECT 1 FROM parties.customers c 
            WHERE c.customer_id = i.customer_id 
            AND c.gstin IS NOT NULL
        )
        GROUP BY i.customer_id
    ) inv_data
    JOIN parties.customers c ON c.customer_id = inv_data.customer_id;
    
    -- B2C Summary (Business to Consumer)
    SELECT jsonb_agg(
        jsonb_build_object(
            'state_code', state_code,
            'place_of_supply', place_of_supply,
            'rate_wise_summary', rate_summary
        ) ORDER BY state_code
    )
    INTO v_b2c_data
    FROM (
        SELECT 
            SUBSTRING(i.place_of_supply FROM 1 FOR 2) as state_code,
            i.place_of_supply,
            jsonb_agg(
                jsonb_build_object(
                    'tax_rate', tax_rate,
                    'taxable_value', SUM(taxable_value),
                    'cess_amount', SUM(cess_amount),
                    'invoice_count', COUNT(DISTINCT invoice_id)
                ) ORDER BY tax_rate
            ) as rate_summary
        FROM (
            SELECT 
                i.invoice_id,
                i.place_of_supply,
                ii.gst_percentage as tax_rate,
                SUM(ii.base_amount) as taxable_value,
                SUM(COALESCE(ii.cess_amount, 0)) as cess_amount
            FROM sales.invoices i
            JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
            WHERE i.org_id = p_org_id
            AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
            AND i.invoice_date BETWEEN v_start_date AND v_end_date
            AND i.invoice_status = 'posted'
            AND NOT EXISTS (
                SELECT 1 FROM parties.customers c 
                WHERE c.customer_id = i.customer_id 
                AND c.gstin IS NOT NULL
            )
            GROUP BY i.invoice_id, i.place_of_supply, ii.gst_percentage
        ) b2c_details
        GROUP BY state_code, place_of_supply
    ) b2c_summary;
    
    -- Credit/Debit Notes
    SELECT jsonb_agg(
        jsonb_build_object(
            'gstin', c.gstin,
            'receiver_name', c.customer_name,
            'notes', notes
        ) ORDER BY c.customer_name
    )
    INTO v_cdn_data
    FROM (
        SELECT 
            sr.customer_id,
            jsonb_agg(
                jsonb_build_object(
                    'note_type', 'credit',
                    'note_number', sr.credit_note_number,
                    'note_date', sr.credit_note_date,
                    'original_invoice_number', i.invoice_number,
                    'original_invoice_date', i.invoice_date,
                    'note_value', sr.credit_note_amount,
                    'taxable_value', sr.total_amount - 
                        (sr.total_amount * i.total_gst / (i.base_amount + i.total_gst)),
                    'tax_rate', AVG(ii.gst_percentage),
                    'reason', sr.return_reason
                ) ORDER BY sr.credit_note_date
            ) as notes
        FROM sales.sales_returns sr
        JOIN sales.invoices i ON sr.invoice_id = i.invoice_id
        JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
        WHERE sr.credit_note_status = 'issued'
        AND sr.credit_note_date BETWEEN v_start_date AND v_end_date
        AND i.org_id = p_org_id
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY sr.customer_id
    ) cdn_data
    JOIN parties.customers c ON c.customer_id = cdn_data.customer_id
    WHERE c.gstin IS NOT NULL;
    
    -- Export Invoices
    SELECT jsonb_agg(
        jsonb_build_object(
            'export_type', export_type,
            'invoices', invoices
        ) ORDER BY export_type
    )
    INTO v_exp_data
    FROM (
        SELECT 
            CASE 
                WHEN i.port_code IS NOT NULL THEN 'WGST' -- With GST
                ELSE 'WOGST' -- Without GST
            END as export_type,
            jsonb_agg(
                jsonb_build_object(
                    'invoice_number', i.invoice_number,
                    'invoice_date', i.invoice_date,
                    'invoice_value', i.final_amount,
                    'port_code', i.port_code,
                    'shipping_bill_number', i.shipping_bill_number,
                    'shipping_bill_date', i.shipping_bill_date,
                    'taxable_value', i.base_amount,
                    'tax_rate', CASE WHEN i.port_code IS NOT NULL 
                               THEN AVG(ii.gst_percentage) ELSE 0 END
                ) ORDER BY i.invoice_date
            ) as invoices
        FROM sales.invoices i
        JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
        WHERE i.org_id = p_org_id
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        AND i.invoice_date BETWEEN v_start_date AND v_end_date
        AND i.invoice_status = 'posted'
        AND i.invoice_type = 'export'
        GROUP BY CASE WHEN i.port_code IS NOT NULL THEN 'WGST' ELSE 'WOGST' END
    ) exp_summary;
    
    -- Advance Receipts
    SELECT jsonb_agg(
        jsonb_build_object(
            'place_of_supply', place_of_supply,
            'rate_wise_advances', advances
        ) ORDER BY place_of_supply
    )
    INTO v_at_data
    FROM (
        SELECT 
            ar.place_of_supply,
            jsonb_agg(
                jsonb_build_object(
                    'tax_rate', ar.gst_rate,
                    'advance_amount', SUM(ar.advance_amount),
                    'cess_amount', SUM(COALESCE(ar.cess_amount, 0))
                ) ORDER BY ar.gst_rate
            ) as advances
        FROM gst.advance_receipts ar
        WHERE ar.org_id = p_org_id
        AND (p_branch_id IS NULL OR ar.branch_id = p_branch_id)
        AND ar.receipt_date BETWEEN v_start_date AND v_end_date
        AND ar.adjustment_status != 'fully_adjusted'
        GROUP BY ar.place_of_supply
    ) at_summary;
    
    -- HSN Summary
    SELECT jsonb_agg(
        jsonb_build_object(
            'hsn_code', hsn_code,
            'description', description,
            'uqc', uqc,
            'total_quantity', total_quantity,
            'total_value', total_value,
            'taxable_value', taxable_value,
            'igst_amount', igst_amount,
            'cgst_amount', cgst_amount,
            'sgst_amount', sgst_amount,
            'cess_amount', cess_amount
        ) ORDER BY total_value DESC
    )
    INTO v_hsn_data
    FROM (
        SELECT 
            ii.hsn_code,
            MAX(p.product_name) as description,
            'NOS' as uqc, -- Unit of Quantity Code
            SUM(ii.quantity) as total_quantity,
            SUM(ii.total_amount) as total_value,
            SUM(ii.base_amount) as taxable_value,
            SUM(ii.igst_amount) as igst_amount,
            SUM(ii.cgst_amount) as cgst_amount,
            SUM(ii.sgst_amount) as sgst_amount,
            SUM(COALESCE(ii.cess_amount, 0)) as cess_amount
        FROM sales.invoice_items ii
        JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        WHERE i.org_id = p_org_id
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        AND i.invoice_date BETWEEN v_start_date AND v_end_date
        AND i.invoice_status = 'posted'
        GROUP BY ii.hsn_code
        HAVING SUM(ii.total_amount) >= 200000 -- HSN reporting threshold
    ) hsn_summary;
    
    -- Return Summary
    SELECT jsonb_build_object(
        'gstin', o.gstin,
        'legal_name', o.company_name,
        'return_period', p_return_period,
        'total_invoices', COUNT(DISTINCT i.invoice_id),
        'total_taxable_value', SUM(i.base_amount),
        'total_tax_amount', SUM(i.total_gst),
        'total_invoice_value', SUM(i.final_amount)
    )
    INTO v_summary
    FROM sales.invoices i
    JOIN master.organizations o ON i.org_id = o.org_id
    WHERE i.org_id = p_org_id
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND i.invoice_date BETWEEN v_start_date AND v_end_date
    AND i.invoice_status = 'posted'
    GROUP BY o.gstin, o.company_name;
    
    -- Return all data
    RETURN QUERY
    SELECT 
        v_summary as return_summary,
        COALESCE(v_b2b_data, '[]'::JSONB) as b2b_invoices,
        COALESCE(v_b2c_data, '[]'::JSONB) as b2c_summary,
        COALESCE(v_cdn_data, '[]'::JSONB) as credit_notes,
        COALESCE(v_exp_data, '[]'::JSONB) as export_invoices,
        COALESCE(v_at_data, '[]'::JSONB) as advance_receipts,
        COALESCE(v_hsn_data, '[]'::JSONB) as hsn_summary;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. RECONCILE GSTR-2A WITH PURCHASES
-- =============================================
CREATE OR REPLACE FUNCTION reconcile_gstr2a(
    p_org_id INTEGER,
    p_return_period TEXT,
    p_gstr2a_data JSONB
)
RETURNS TABLE (
    matched_count INTEGER,
    unmatched_in_books INTEGER,
    unmatched_in_gstr2a INTEGER,
    mismatch_count INTEGER,
    reconciliation_details JSONB,
    action_items JSONB
) AS $$
DECLARE
    v_month INTEGER;
    v_year INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_matched JSONB := '[]'::JSONB;
    v_unmatched_books JSONB := '[]'::JSONB;
    v_unmatched_gstr2a JSONB := '[]'::JSONB;
    v_mismatches JSONB := '[]'::JSONB;
    v_actions JSONB := '[]'::JSONB;
    v_gstr2a_invoice JSONB;
    v_book_invoice RECORD;
BEGIN
    -- Parse period
    v_month := SUBSTRING(p_return_period FROM 1 FOR 2)::INTEGER;
    v_year := SUBSTRING(p_return_period FROM 4 FOR 4)::INTEGER;
    v_start_date := DATE(v_year || '-' || v_month || '-01');
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Create temp table for GSTR-2A data
    CREATE TEMP TABLE temp_gstr2a_invoices (
        supplier_gstin TEXT,
        invoice_number TEXT,
        invoice_date DATE,
        invoice_value NUMERIC,
        taxable_value NUMERIC,
        tax_amount NUMERIC,
        matched BOOLEAN DEFAULT FALSE
    );
    
    -- Load GSTR-2A data
    INSERT INTO temp_gstr2a_invoices (
        supplier_gstin,
        invoice_number,
        invoice_date,
        invoice_value,
        taxable_value,
        tax_amount
    )
    SELECT 
        (inv->>'supplier_gstin')::TEXT,
        (inv->>'invoice_number')::TEXT,
        (inv->>'invoice_date')::DATE,
        (inv->>'invoice_value')::NUMERIC,
        (inv->>'taxable_value')::NUMERIC,
        (inv->>'tax_amount')::NUMERIC
    FROM jsonb_array_elements(p_gstr2a_data) AS inv;
    
    -- Match invoices
    FOR v_book_invoice IN
        SELECT 
            si.invoice_id,
            si.invoice_number,
            si.invoice_date,
            si.total_amount,
            si.taxable_amount,
            si.gst_amount,
            s.gstin as supplier_gstin,
            s.supplier_name
        FROM procurement.supplier_invoices si
        JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
        WHERE si.org_id = p_org_id
        AND si.invoice_date BETWEEN v_start_date AND v_end_date
        AND si.invoice_status = 'posted'
    LOOP
        -- Try to find match in GSTR-2A
        SELECT *
        INTO v_gstr2a_invoice
        FROM temp_gstr2a_invoices
        WHERE supplier_gstin = v_book_invoice.supplier_gstin
        AND invoice_number = v_book_invoice.invoice_number
        AND NOT matched
        LIMIT 1;
        
        IF FOUND THEN
            -- Check for mismatches
            IF ABS(v_book_invoice.total_amount - (v_gstr2a_invoice->>'invoice_value')::NUMERIC) > 1 OR
               ABS(v_book_invoice.gst_amount - (v_gstr2a_invoice->>'tax_amount')::NUMERIC) > 1 THEN
                -- Mismatch found
                v_mismatches := v_mismatches || jsonb_build_array(
                    jsonb_build_object(
                        'invoice_number', v_book_invoice.invoice_number,
                        'supplier_name', v_book_invoice.supplier_name,
                        'book_value', v_book_invoice.total_amount,
                        'gstr2a_value', (v_gstr2a_invoice->>'invoice_value')::NUMERIC,
                        'value_difference', v_book_invoice.total_amount - (v_gstr2a_invoice->>'invoice_value')::NUMERIC,
                        'book_tax', v_book_invoice.gst_amount,
                        'gstr2a_tax', (v_gstr2a_invoice->>'tax_amount')::NUMERIC,
                        'tax_difference', v_book_invoice.gst_amount - (v_gstr2a_invoice->>'tax_amount')::NUMERIC
                    )
                );
                
                -- Add action item
                v_actions := v_actions || jsonb_build_array(
                    jsonb_build_object(
                        'action_type', 'verify_invoice',
                        'priority', 'high',
                        'invoice_number', v_book_invoice.invoice_number,
                        'supplier_name', v_book_invoice.supplier_name,
                        'description', 'Verify invoice amount and tax with supplier'
                    )
                );
            ELSE
                -- Perfect match
                v_matched := v_matched || jsonb_build_array(
                    jsonb_build_object(
                        'invoice_number', v_book_invoice.invoice_number,
                        'supplier_name', v_book_invoice.supplier_name,
                        'invoice_value', v_book_invoice.total_amount,
                        'tax_amount', v_book_invoice.gst_amount
                    )
                );
            END IF;
            
            -- Mark as matched in temp table
            UPDATE temp_gstr2a_invoices
            SET matched = TRUE
            WHERE supplier_gstin = v_book_invoice.supplier_gstin
            AND invoice_number = v_book_invoice.invoice_number;
        ELSE
            -- Not found in GSTR-2A
            v_unmatched_books := v_unmatched_books || jsonb_build_array(
                jsonb_build_object(
                    'invoice_number', v_book_invoice.invoice_number,
                    'invoice_date', v_book_invoice.invoice_date,
                    'supplier_name', v_book_invoice.supplier_name,
                    'invoice_value', v_book_invoice.total_amount,
                    'tax_amount', v_book_invoice.gst_amount
                )
            );
            
            -- Add action item
            v_actions := v_actions || jsonb_build_array(
                jsonb_build_object(
                    'action_type', 'follow_up_supplier',
                    'priority', 'high',
                    'invoice_number', v_book_invoice.invoice_number,
                    'supplier_name', v_book_invoice.supplier_name,
                    'description', 'Follow up with supplier for GSTR-1 filing'
                )
            );
        END IF;
    END LOOP;
    
    -- Find unmatched in GSTR-2A
    INSERT INTO v_unmatched_gstr2a
    SELECT jsonb_agg(
        jsonb_build_object(
            'supplier_gstin', supplier_gstin,
            'invoice_number', invoice_number,
            'invoice_date', invoice_date,
            'invoice_value', invoice_value,
            'tax_amount', tax_amount
        )
    )
    FROM temp_gstr2a_invoices
    WHERE NOT matched;
    
    -- Add action items for unmatched GSTR-2A
    FOR v_gstr2a_invoice IN
        SELECT * FROM temp_gstr2a_invoices WHERE NOT matched
    LOOP
        v_actions := v_actions || jsonb_build_array(
            jsonb_build_object(
                'action_type', 'verify_missing_invoice',
                'priority', 'medium',
                'invoice_number', v_gstr2a_invoice.invoice_number,
                'supplier_gstin', v_gstr2a_invoice.supplier_gstin,
                'description', 'Verify if invoice received and recorded in books'
            )
        );
    END LOOP;
    
    -- Drop temp table
    DROP TABLE temp_gstr2a_invoices;
    
    -- Return results
    RETURN QUERY
    SELECT 
        jsonb_array_length(v_matched)::INTEGER as matched_count,
        jsonb_array_length(v_unmatched_books)::INTEGER as unmatched_in_books,
        jsonb_array_length(v_unmatched_gstr2a)::INTEGER as unmatched_in_gstr2a,
        jsonb_array_length(v_mismatches)::INTEGER as mismatch_count,
        jsonb_build_object(
            'matched', v_matched,
            'unmatched_in_books', v_unmatched_books,
            'unmatched_in_gstr2a', v_unmatched_gstr2a,
            'mismatches', v_mismatches
        ) as reconciliation_details,
        v_actions as action_items;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. GENERATE E-WAY BILL DATA
-- =============================================
CREATE OR REPLACE FUNCTION generate_eway_bill(
    p_invoice_id INTEGER,
    p_transport_mode TEXT DEFAULT 'road',
    p_vehicle_number TEXT DEFAULT NULL,
    p_transporter_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_from_address JSONB;
    v_to_address JSONB;
    v_items JSONB;
    v_total_value NUMERIC;
    v_distance INTEGER;
BEGIN
    -- Get invoice details
    SELECT 
        i.*,
        c.customer_name,
        c.gstin as customer_gstin,
        c.address as customer_address,
        b.branch_name,
        b.address as branch_address,
        o.gstin as supplier_gstin
    INTO v_invoice
    FROM sales.invoices i
    JOIN parties.customers c ON i.customer_id = c.customer_id
    JOIN master.branches b ON i.branch_id = b.branch_id
    JOIN master.organizations o ON i.org_id = o.org_id
    WHERE i.invoice_id = p_invoice_id
    AND i.invoice_status = 'posted';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found or not posted';
    END IF;
    
    -- Check if e-way bill required (value > 50000)
    IF v_invoice.final_amount <= 50000 THEN
        RETURN jsonb_build_object(
            'required', FALSE,
            'reason', 'Invoice value below threshold'
        );
    END IF;
    
    -- Prepare from address
    v_from_address := jsonb_build_object(
        'gstin', v_invoice.supplier_gstin,
        'legal_name', v_invoice.branch_name,
        'address1', v_invoice.branch_address->>'address_line1',
        'address2', v_invoice.branch_address->>'address_line2',
        'place', v_invoice.branch_address->>'city',
        'pincode', v_invoice.branch_address->>'pincode',
        'state_code', SUBSTRING(v_invoice.supplier_gstin FROM 1 FOR 2)
    );
    
    -- Prepare to address
    v_to_address := jsonb_build_object(
        'gstin', v_invoice.customer_gstin,
        'legal_name', v_invoice.customer_name,
        'address1', v_invoice.customer_address->>'address_line1',
        'address2', v_invoice.customer_address->>'address_line2',
        'place', v_invoice.customer_address->>'city',
        'pincode', v_invoice.customer_address->>'pincode',
        'state_code', SUBSTRING(COALESCE(v_invoice.customer_gstin, v_invoice.place_of_supply) FROM 1 FOR 2)
    );
    
    -- Prepare items
    SELECT jsonb_agg(
        jsonb_build_object(
            'product_name', ii.product_name,
            'hsn_code', ii.hsn_code,
            'quantity', ii.quantity,
            'unit', 'NOS',
            'taxable_amount', ii.base_amount,
            'cgst_rate', CASE WHEN i.supply_type = 'intrastate' 
                        THEN ii.gst_percentage/2 ELSE 0 END,
            'sgst_rate', CASE WHEN i.supply_type = 'intrastate' 
                        THEN ii.gst_percentage/2 ELSE 0 END,
            'igst_rate', CASE WHEN i.supply_type = 'interstate' 
                        THEN ii.gst_percentage ELSE 0 END,
            'cess_rate', 0,
            'cess_non_advol', 0
        ) ORDER BY ii.invoice_item_id
    )
    INTO v_items
    FROM sales.invoice_items ii
    JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
    WHERE ii.invoice_id = p_invoice_id;
    
    -- Calculate distance (simplified - would use actual distance API)
    v_distance := CASE 
        WHEN v_from_address->>'state_code' = v_to_address->>'state_code' 
        THEN 100  -- Intrastate default
        ELSE 500  -- Interstate default
    END;
    
    -- Generate e-way bill JSON
    RETURN jsonb_build_object(
        'required', TRUE,
        'eway_bill_data', jsonb_build_object(
            'supply_type', 'outward',
            'sub_supply_type', 'supply',
            'document_type', 'tax_invoice',
            'document_number', v_invoice.invoice_number,
            'document_date', TO_CHAR(v_invoice.invoice_date, 'DD/MM/YYYY'),
            'from_gstin', v_invoice.supplier_gstin,
            'from_address', v_from_address,
            'to_gstin', v_invoice.customer_gstin,
            'to_address', v_to_address,
            'total_value', v_invoice.final_amount,
            'total_taxable_value', v_invoice.base_amount,
            'cgst_value', v_invoice.cgst_amount,
            'sgst_value', v_invoice.sgst_amount,
            'igst_value', v_invoice.igst_amount,
            'cess_value', 0,
            'transport_mode', p_transport_mode,
            'transport_distance', v_distance,
            'transporter_id', p_transporter_id,
            'vehicle_number', p_vehicle_number,
            'vehicle_type', CASE p_transport_mode 
                           WHEN 'road' THEN 'regular'
                           ELSE 'other'
                           END,
            'items', v_items
        ),
        'validation_errors', CASE 
            WHEN p_transport_mode = 'road' AND p_vehicle_number IS NULL 
            THEN jsonb_build_array('Vehicle number required for road transport')
            ELSE '[]'::JSONB
        END
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. CALCULATE GSTR-3B SUMMARY
-- =============================================
CREATE OR REPLACE FUNCTION calculate_gstr3b_summary(
    p_org_id INTEGER,
    p_return_period TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_month INTEGER;
    v_year INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_outward_supplies JSONB;
    v_inward_supplies JSONB;
    v_itc_available JSONB;
    v_tax_payable JSONB;
BEGIN
    -- Parse period
    v_month := SUBSTRING(p_return_period FROM 1 FOR 2)::INTEGER;
    v_year := SUBSTRING(p_return_period FROM 4 FOR 4)::INTEGER;
    v_start_date := DATE(v_year || '-' || v_month || '-01');
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Section 3.1 - Outward supplies
    WITH outward_data AS (
        SELECT 
            SUM(CASE WHEN i.supply_type = 'outward_taxable' 
                THEN i.base_amount ELSE 0 END) as taxable_value,
            SUM(CASE WHEN i.supply_type = 'outward_taxable' 
                THEN i.igst_amount ELSE 0 END) as igst,
            SUM(CASE WHEN i.supply_type = 'outward_taxable' 
                THEN i.cgst_amount ELSE 0 END) as cgst,
            SUM(CASE WHEN i.supply_type = 'outward_taxable' 
                THEN i.sgst_amount ELSE 0 END) as sgst,
            SUM(CASE WHEN i.supply_type = 'zero_rated' 
                THEN i.base_amount ELSE 0 END) as zero_rated,
            SUM(CASE WHEN i.supply_type = 'nil_rated' 
                THEN i.base_amount ELSE 0 END) as nil_rated,
            SUM(CASE WHEN i.supply_type = 'exempted' 
                THEN i.base_amount ELSE 0 END) as exempted
        FROM sales.invoices i
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN v_start_date AND v_end_date
        AND i.invoice_status = 'posted'
    )
    SELECT jsonb_build_object(
        'outward_taxable_supplies', jsonb_build_object(
            'taxable_value', COALESCE(taxable_value, 0),
            'integrated_tax', COALESCE(igst, 0),
            'central_tax', COALESCE(cgst, 0),
            'state_tax', COALESCE(sgst, 0),
            'cess', 0
        ),
        'outward_taxable_zero_rated', jsonb_build_object(
            'taxable_value', COALESCE(zero_rated, 0),
            'integrated_tax', 0,
            'central_tax', 0,
            'state_tax', 0,
            'cess', 0
        ),
        'other_outward_zero_rated', jsonb_build_object(
            'taxable_value', COALESCE(nil_rated + exempted, 0),
            'integrated_tax', 0,
            'central_tax', 0,
            'state_tax', 0,
            'cess', 0
        ),
        'inward_supplies_liable', jsonb_build_object(
            'taxable_value', 0,
            'integrated_tax', 0,
            'central_tax', 0,
            'state_tax', 0,
            'cess', 0
        )
    ) INTO v_outward_supplies
    FROM outward_data;
    
    -- Section 3.2 - Inward supplies
    WITH inward_data AS (
        SELECT 
            SUM(si.taxable_amount) as interstate_supplies,
            SUM(CASE WHEN si.supply_type = 'import' 
                THEN si.taxable_amount ELSE 0 END) as imports
        FROM procurement.supplier_invoices si
        WHERE si.org_id = p_org_id
        AND si.invoice_date BETWEEN v_start_date AND v_end_date
        AND si.invoice_status = 'posted'
    )
    SELECT jsonb_build_object(
        'supplies_from_unregistered', 0,
        'supplies_from_composition', 0,
        'supplies_from_uin', 0,
        'interstate_supplies', COALESCE(interstate_supplies, 0),
        'imports', COALESCE(imports, 0)
    ) INTO v_inward_supplies
    FROM inward_data;
    
    -- Section 4 - ITC Available
    WITH itc_data AS (
        SELECT 
            SUM(si.igst_amount) as igst,
            SUM(si.cgst_amount) as cgst,
            SUM(si.sgst_amount) as sgst,
            SUM(CASE WHEN si.supply_type = 'import_goods' 
                THEN si.igst_amount ELSE 0 END) as import_goods,
            SUM(CASE WHEN si.supply_type = 'import_services' 
                THEN si.igst_amount ELSE 0 END) as import_services
        FROM procurement.supplier_invoices si
        WHERE si.org_id = p_org_id
        AND si.invoice_date BETWEEN v_start_date AND v_end_date
        AND si.invoice_status = 'posted'
        AND si.itc_eligibility = 'eligible'
    )
    SELECT jsonb_build_object(
        'itc_available_import_goods', jsonb_build_object(
            'integrated_tax', COALESCE(import_goods, 0),
            'central_tax', 0,
            'state_tax', 0,
            'cess', 0
        ),
        'itc_available_import_services', jsonb_build_object(
            'integrated_tax', COALESCE(import_services, 0),
            'central_tax', 0,
            'state_tax', 0,
            'cess', 0
        ),
        'itc_available_others', jsonb_build_object(
            'integrated_tax', COALESCE(igst - import_goods - import_services, 0),
            'central_tax', COALESCE(cgst, 0),
            'state_tax', COALESCE(sgst, 0),
            'cess', 0
        ),
        'itc_reversed', jsonb_build_object(
            'integrated_tax', 0,
            'central_tax', 0,
            'state_tax', 0,
            'cess', 0
        )
    ) INTO v_itc_available
    FROM itc_data;
    
    -- Section 5 - Tax payable
    -- This would be calculated based on outward supplies - ITC available
    v_tax_payable := jsonb_build_object(
        'integrated_tax', GREATEST(0, 
            (v_outward_supplies->'outward_taxable_supplies'->>'integrated_tax')::NUMERIC -
            (v_itc_available->'itc_available_others'->>'integrated_tax')::NUMERIC),
        'central_tax', GREATEST(0,
            (v_outward_supplies->'outward_taxable_supplies'->>'central_tax')::NUMERIC -
            (v_itc_available->'itc_available_others'->>'central_tax')::NUMERIC),
        'state_tax', GREATEST(0,
            (v_outward_supplies->'outward_taxable_supplies'->>'state_tax')::NUMERIC -
            (v_itc_available->'itc_available_others'->>'state_tax')::NUMERIC),
        'cess', 0,
        'interest', 0,
        'late_fee', 0
    );
    
    -- Return complete GSTR-3B data
    RETURN jsonb_build_object(
        'gstin', (SELECT gstin FROM master.organizations WHERE org_id = p_org_id),
        'return_period', p_return_period,
        'section_3_1', v_outward_supplies,
        'section_3_2', v_inward_supplies,
        'section_4', v_itc_available,
        'section_5', v_tax_payable,
        'generated_at', CURRENT_TIMESTAMP
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. GST COMPLIANCE DASHBOARD
-- =============================================
CREATE OR REPLACE FUNCTION get_gst_compliance_status(
    p_org_id INTEGER,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '6 months',
    p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    filing_status JSONB,
    reconciliation_status JSONB,
    compliance_score NUMERIC,
    pending_actions JSONB,
    tax_summary JSONB
) AS $$
DECLARE
    v_filing_status JSONB;
    v_recon_status JSONB;
    v_pending_actions JSONB;
    v_tax_summary JSONB;
    v_compliance_score NUMERIC;
BEGIN
    -- Filing Status
    SELECT jsonb_agg(
        jsonb_build_object(
            'return_type', return_type,
            'return_period', return_period,
            'due_date', due_date,
            'filing_date', filing_date,
            'status', filing_status,
            'days_delayed', CASE 
                WHEN filing_date > due_date THEN filing_date - due_date
                WHEN filing_status = 'pending' AND CURRENT_DATE > due_date 
                THEN CURRENT_DATE - due_date
                ELSE 0
            END
        ) ORDER BY due_date DESC
    )
    INTO v_filing_status
    FROM gst.return_filing_status
    WHERE org_id = p_org_id
    AND due_date BETWEEN p_from_date AND p_to_date;
    
    -- Reconciliation Status
    SELECT jsonb_build_object(
        'gstr1_2a_matched', matched_count,
        'gstr1_2a_unmatched', unmatched_count,
        'pending_verifications', pending_count,
        'last_reconciliation', MAX(reconciliation_date)
    )
    INTO v_recon_status
    FROM (
        SELECT 
            COUNT(*) FILTER (WHERE match_status = 'matched') as matched_count,
            COUNT(*) FILTER (WHERE match_status = 'unmatched') as unmatched_count,
            COUNT(*) FILTER (WHERE match_status = 'pending') as pending_count,
            MAX(created_at) as reconciliation_date
        FROM gst.purchase_reconciliation
        WHERE org_id = p_org_id
        AND created_at BETWEEN p_from_date AND p_to_date
    ) recon_summary;
    
    -- Pending Actions
    SELECT jsonb_agg(
        jsonb_build_object(
            'action_type', action_type,
            'description', description,
            'due_date', due_date,
            'priority', priority,
            'reference', reference_details
        ) ORDER BY due_date, priority DESC
    )
    INTO v_pending_actions
    FROM (
        -- Pending returns
        SELECT 
            'file_return' as action_type,
            format('File %s for %s', return_type, return_period) as description,
            due_date,
            'high' as priority,
            jsonb_build_object(
                'return_type', return_type,
                'return_period', return_period
            ) as reference_details
        FROM gst.return_filing_status
        WHERE org_id = p_org_id
        AND filing_status = 'pending'
        AND due_date <= CURRENT_DATE + INTERVAL '7 days'
        
        UNION ALL
        
        -- Unmatched invoices
        SELECT 
            'reconcile_invoice' as action_type,
            format('Reconcile %s invoices from %s', 
                   COUNT(*), TO_CHAR(DATE_TRUNC('month', invoice_date), 'Mon YYYY')) as description,
            DATE_TRUNC('month', invoice_date) + INTERVAL '1 month' + INTERVAL '10 days' as due_date,
            'medium' as priority,
            jsonb_build_object(
                'month', TO_CHAR(DATE_TRUNC('month', invoice_date), 'MM-YYYY'),
                'count', COUNT(*)
            ) as reference_details
        FROM gst.purchase_reconciliation
        WHERE org_id = p_org_id
        AND match_status = 'unmatched'
        GROUP BY DATE_TRUNC('month', invoice_date)
    ) actions;
    
    -- Tax Summary
    SELECT jsonb_build_object(
        'output_tax', jsonb_build_object(
            'igst', SUM(igst_amount),
            'cgst', SUM(cgst_amount),
            'sgst', SUM(sgst_amount),
            'total', SUM(total_gst)
        ),
        'input_tax', jsonb_build_object(
            'igst', SUM(input_igst),
            'cgst', SUM(input_cgst),
            'sgst', SUM(input_sgst),
            'total', SUM(input_igst + input_cgst + input_sgst)
        ),
        'tax_payable', jsonb_build_object(
            'igst', GREATEST(0, SUM(igst_amount - input_igst)),
            'cgst', GREATEST(0, SUM(cgst_amount - input_cgst)),
            'sgst', GREATEST(0, SUM(sgst_amount - input_sgst)),
            'total', GREATEST(0, SUM(total_gst - (input_igst + input_cgst + input_sgst)))
        )
    )
    INTO v_tax_summary
    FROM (
        SELECT 
            COALESCE(SUM(i.igst_amount), 0) as igst_amount,
            COALESCE(SUM(i.cgst_amount), 0) as cgst_amount,
            COALESCE(SUM(i.sgst_amount), 0) as sgst_amount,
            COALESCE(SUM(i.total_gst), 0) as total_gst,
            0 as input_igst,
            0 as input_cgst,
            0 as input_sgst
        FROM sales.invoices i
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN p_from_date AND p_to_date
        AND i.invoice_status = 'posted'
        
        UNION ALL
        
        SELECT 
            0 as igst_amount,
            0 as cgst_amount,
            0 as sgst_amount,
            0 as total_gst,
            COALESCE(SUM(si.igst_amount), 0) as input_igst,
            COALESCE(SUM(si.cgst_amount), 0) as input_cgst,
            COALESCE(SUM(si.sgst_amount), 0) as input_sgst
        FROM procurement.supplier_invoices si
        WHERE si.org_id = p_org_id
        AND si.invoice_date BETWEEN p_from_date AND p_to_date
        AND si.invoice_status = 'posted'
        AND si.itc_eligibility = 'eligible'
    ) tax_data;
    
    -- Calculate compliance score
    SELECT 
        CASE 
            WHEN return_count = 0 THEN 100
            ELSE ROUND(
                (filed_on_time::NUMERIC / return_count * 70) + -- 70% weight for timely filing
                (CASE WHEN unmatched_percent < 5 THEN 20 
                      WHEN unmatched_percent < 10 THEN 15
                      WHEN unmatched_percent < 20 THEN 10
                      ELSE 5 END) + -- 20% weight for reconciliation
                (CASE WHEN pending_actions_count = 0 THEN 10
                      WHEN pending_actions_count < 5 THEN 7
                      WHEN pending_actions_count < 10 THEN 5
                      ELSE 0 END) -- 10% weight for pending actions
            , 2)
        END
    INTO v_compliance_score
    FROM (
        SELECT 
            COUNT(*) as return_count,
            COUNT(*) FILTER (WHERE filing_date <= due_date) as filed_on_time,
            COALESCE((v_recon_status->>'gstr1_2a_unmatched')::NUMERIC / 
                    NULLIF((v_recon_status->>'gstr1_2a_matched')::NUMERIC + 
                           (v_recon_status->>'gstr1_2a_unmatched')::NUMERIC, 0) * 100, 0) as unmatched_percent,
            jsonb_array_length(v_pending_actions) as pending_actions_count
        FROM gst.return_filing_status
        WHERE org_id = p_org_id
        AND due_date BETWEEN p_from_date AND p_to_date
    ) score_data;
    
    -- Return results
    RETURN QUERY
    SELECT 
        v_filing_status as filing_status,
        v_recon_status as reconciliation_status,
        v_compliance_score as compliance_score,
        v_pending_actions as pending_actions,
        v_tax_summary as tax_summary;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SUPPORTING TABLES
-- =============================================

-- Return filing status
CREATE TABLE IF NOT EXISTS gst.return_filing_status (
    filing_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    return_type TEXT NOT NULL CHECK (return_type IN ('GSTR-1', 'GSTR-3B', 'GSTR-9')),
    return_period TEXT NOT NULL,
    due_date DATE NOT NULL,
    filing_date DATE,
    filing_status TEXT CHECK (filing_status IN ('pending', 'filed', 'delayed')),
    acknowledgment_number TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, return_type, return_period)
);

-- Purchase reconciliation
CREATE TABLE IF NOT EXISTS gst.purchase_reconciliation (
    reconciliation_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    supplier_gstin TEXT,
    invoice_number TEXT,
    invoice_date DATE,
    invoice_value NUMERIC(15,2),
    match_status TEXT CHECK (match_status IN ('matched', 'unmatched', 'pending')),
    mismatch_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Advance receipts
CREATE TABLE IF NOT EXISTS gst.advance_receipts (
    advance_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    branch_id INTEGER,
    customer_id INTEGER,
    receipt_date DATE,
    advance_amount NUMERIC(15,2),
    place_of_supply TEXT,
    gst_rate NUMERIC(5,2),
    igst_amount NUMERIC(15,2),
    cgst_amount NUMERIC(15,2),
    sgst_amount NUMERIC(15,2),
    cess_amount NUMERIC(15,2),
    adjustment_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX idx_invoices_gst_period ON sales.invoices(org_id, invoice_date, invoice_status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_gst ON procurement.supplier_invoices(org_id, invoice_date);
CREATE INDEX idx_return_filing_status ON gst.return_filing_status(org_id, return_type, due_date);
CREATE INDEX idx_purchase_reconciliation ON gst.purchase_reconciliation(org_id, match_status, invoice_date);

-- =============================================
-- GRANTS
-- =============================================
GRANT EXECUTE ON FUNCTION generate_gstr1_data TO gst_user, finance_user;
GRANT EXECUTE ON FUNCTION reconcile_gstr2a TO gst_user, finance_user;
GRANT EXECUTE ON FUNCTION generate_eway_bill TO sales_user, logistics_user;
GRANT EXECUTE ON FUNCTION calculate_gstr3b_summary TO gst_user, finance_user;
GRANT EXECUTE ON FUNCTION get_gst_compliance_status TO gst_user, finance_manager, compliance_officer;

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON FUNCTION generate_gstr1_data IS 'Generates GSTR-1 return data in required format';
COMMENT ON FUNCTION reconcile_gstr2a IS 'Reconciles GSTR-2A data with purchase records';
COMMENT ON FUNCTION generate_eway_bill IS 'Generates e-way bill data for invoices above threshold';
COMMENT ON FUNCTION calculate_gstr3b_summary IS 'Calculates GSTR-3B summary for filing';
COMMENT ON FUNCTION get_gst_compliance_status IS 'Provides comprehensive GST compliance dashboard';