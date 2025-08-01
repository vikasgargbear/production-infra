-- =============================================
-- GST & COMPLIANCE MODULE APIS
-- =============================================
-- Global API functions for GST and compliance management
-- =============================================

-- =============================================
-- GSTR-1 GENERATION API
-- =============================================
CREATE OR REPLACE FUNCTION api.generate_gstr1_data(
    p_org_id INTEGER,
    p_return_period VARCHAR(6), -- MMYYYY format
    p_branch_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_from_date DATE;
    v_to_date DATE;
BEGIN
    -- Parse return period
    v_from_date := TO_DATE(p_return_period, 'MMYYYY');
    v_to_date := (v_from_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Generate GSTR-1 data
    WITH b2b_invoices AS (
        SELECT 
            c.gstin as customer_gstin,
            c.customer_name,
            i.invoice_number,
            i.invoice_date,
            i.total_amount as invoice_value,
            b.state_code as pos,
            CASE 
                WHEN b.state_code = (SELECT state_code FROM master.branches WHERE branch_id = i.branch_id) 
                THEN 'Regular'
                ELSE 'Inter-State'
            END as supply_type,
            SUM(CASE WHEN p.gst_percentage = 0 THEN ii.taxable_amount ELSE 0 END) as nil_rated,
            SUM(CASE WHEN p.gst_percentage = 0 THEN 0 ELSE ii.taxable_amount END) as taxable_value,
            SUM(CASE 
                WHEN b.state_code = (SELECT state_code FROM master.branches WHERE branch_id = i.branch_id)
                THEN ii.cgst_amount ELSE 0 
            END) as cgst_amount,
            SUM(CASE 
                WHEN b.state_code = (SELECT state_code FROM master.branches WHERE branch_id = i.branch_id)
                THEN ii.sgst_amount ELSE 0 
            END) as sgst_amount,
            SUM(CASE 
                WHEN b.state_code != (SELECT state_code FROM master.branches WHERE branch_id = i.branch_id)
                THEN ii.igst_amount ELSE 0 
            END) as igst_amount,
            SUM(ii.cess_amount) as cess_amount
        FROM sales.invoices i
        JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        JOIN parties.customers c ON i.customer_id = c.customer_id
        JOIN master.branches b ON i.branch_id = b.branch_id
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN v_from_date AND v_to_date
        AND i.invoice_status = 'posted'
        AND c.gstin IS NOT NULL
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY c.gstin, c.customer_name, i.invoice_number, i.invoice_date, 
                 i.total_amount, b.state_code, i.branch_id
    ),
    b2c_summary AS (
        SELECT 
            b.state_code as pos,
            p.gst_percentage as rate,
            SUM(ii.taxable_amount) as taxable_value,
            SUM(ii.cgst_amount) as cgst_amount,
            SUM(ii.sgst_amount) as sgst_amount,
            SUM(ii.igst_amount) as igst_amount,
            SUM(ii.cess_amount) as cess_amount
        FROM sales.invoices i
        JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        JOIN parties.customers c ON i.customer_id = c.customer_id
        JOIN master.branches b ON i.branch_id = b.branch_id
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN v_from_date AND v_to_date
        AND i.invoice_status = 'posted'
        AND (c.gstin IS NULL OR i.total_amount <= 250000)  -- B2C criteria
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY b.state_code, p.gst_percentage
    ),
    hsn_summary AS (
        SELECT 
            p.hsn_code,
            p.product_description,
            u.uom_code,
            SUM(ii.quantity) as total_quantity,
            SUM(ii.taxable_amount) as taxable_value,
            SUM(ii.igst_amount) as igst_amount,
            SUM(ii.cgst_amount) as cgst_amount,
            SUM(ii.sgst_amount) as sgst_amount,
            SUM(ii.cess_amount) as cess_amount
        FROM sales.invoices i
        JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
        JOIN inventory.products p ON ii.product_id = p.product_id
        JOIN master.units_of_measurement u ON p.base_uom_id = u.uom_id
        WHERE i.org_id = p_org_id
        AND i.invoice_date BETWEEN v_from_date AND v_to_date
        AND i.invoice_status = 'posted'
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
        GROUP BY p.hsn_code, p.product_description, u.uom_code
    )
    SELECT jsonb_build_object(
        'return_period', p_return_period,
        'org_id', p_org_id,
        'generation_date', CURRENT_TIMESTAMP,
        'b2b', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'ctin', b2b.customer_gstin,
                    'customer_name', b2b.customer_name,
                    'invoice_number', b2b.invoice_number,
                    'invoice_date', b2b.invoice_date,
                    'invoice_value', b2b.invoice_value,
                    'pos', b2b.pos,
                    'supply_type', b2b.supply_type,
                    'taxable_value', b2b.taxable_value,
                    'cgst', b2b.cgst_amount,
                    'sgst', b2b.sgst_amount,
                    'igst', b2b.igst_amount,
                    'cess', b2b.cess_amount
                ) ORDER BY b2b.invoice_date, b2b.invoice_number
            ) FILTER (WHERE b2b.customer_gstin IS NOT NULL),
            '[]'::jsonb
        ),
        'b2c_large', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'pos', b2c.pos,
                    'rate', b2c.rate,
                    'taxable_value', b2c.taxable_value,
                    'cgst', b2c.cgst_amount,
                    'sgst', b2c.sgst_amount,
                    'igst', b2c.igst_amount,
                    'cess', b2c.cess_amount
                ) ORDER BY b2c.pos, b2c.rate
            ) FILTER (WHERE b2c.taxable_value IS NOT NULL),
            '[]'::jsonb
        ),
        'hsn', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'hsn_sc', hsn.hsn_code,
                    'description', hsn.product_description,
                    'uqc', hsn.uom_code,
                    'total_quantity', hsn.total_quantity,
                    'taxable_value', hsn.taxable_value,
                    'igst', hsn.igst_amount,
                    'cgst', hsn.cgst_amount,
                    'sgst', hsn.sgst_amount,
                    'cess', hsn.cess_amount
                ) ORDER BY hsn.hsn_code
            ) FILTER (WHERE hsn.hsn_code IS NOT NULL),
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'total_invoices', (SELECT COUNT(*) FROM sales.invoices WHERE org_id = p_org_id AND invoice_date BETWEEN v_from_date AND v_to_date AND invoice_status = 'posted'),
            'total_taxable_value', (SELECT SUM(subtotal) FROM sales.invoices WHERE org_id = p_org_id AND invoice_date BETWEEN v_from_date AND v_to_date AND invoice_status = 'posted'),
            'total_tax', (SELECT SUM(tax_amount) FROM sales.invoices WHERE org_id = p_org_id AND invoice_date BETWEEN v_from_date AND v_to_date AND invoice_status = 'posted'),
            'total_invoice_value', (SELECT SUM(total_amount) FROM sales.invoices WHERE org_id = p_org_id AND invoice_date BETWEEN v_from_date AND v_to_date AND invoice_status = 'posted')
        )
    ) INTO v_result
    FROM b2b_invoices b2b
    FULL OUTER JOIN b2c_summary b2c ON false
    FULL OUTER JOIN hsn_summary hsn ON false
    LIMIT 1;
    
    -- Store GSTR-1 data
    INSERT INTO gst.gstr1_data (
        org_id,
        return_period,
        gstr1_data,
        generation_date,
        filing_status
    )
    VALUES (
        p_org_id,
        p_return_period,
        v_result,
        CURRENT_TIMESTAMP,
        'draft'
    )
    ON CONFLICT (org_id, return_period) 
    DO UPDATE SET 
        gstr1_data = v_result,
        generation_date = CURRENT_TIMESTAMP,
        filing_status = 'draft';
    
    RETURN v_result;
END;
$$;

-- =============================================
-- E-WAY BILL GENERATION API
-- =============================================
CREATE OR REPLACE FUNCTION api.generate_eway_bill(
    p_invoice_id INTEGER,
    p_transport_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_eway_bill_id INTEGER;
    v_eway_bill_number VARCHAR(50);
    v_invoice_data RECORD;
    v_result JSONB;
BEGIN
    -- Get invoice details
    SELECT 
        i.*,
        c.customer_name,
        c.gstin as customer_gstin,
        c.address as customer_address,
        b.gstin as supplier_gstin,
        b.address as supplier_address,
        b.state_code as from_state,
        (c.address->>'state_code')::VARCHAR as to_state
    INTO v_invoice_data
    FROM sales.invoices i
    JOIN parties.customers c ON i.customer_id = c.customer_id
    JOIN master.branches b ON i.branch_id = b.branch_id
    WHERE i.invoice_id = p_invoice_id;
    
    -- Check if e-way bill is required
    IF v_invoice_data.total_amount < 50000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'E-way bill not required for invoice value less than Rs. 50,000'
        );
    END IF;
    
    -- Generate e-way bill number (mock)
    v_eway_bill_number := 'EWB' || LPAD(FLOOR(RANDOM() * 1000000000)::TEXT, 12, '0');
    
    -- Create e-way bill record
    INSERT INTO gst.eway_bills (
        org_id,
        eway_bill_number,
        invoice_id,
        supply_type,
        sub_supply_type,
        document_type,
        document_number,
        document_date,
        from_gstin,
        from_address,
        to_gstin,
        to_address,
        total_value,
        hsn_details,
        transport_mode,
        transport_details,
        generation_date,
        valid_until,
        eway_bill_status,
        created_by
    )
    VALUES (
        v_invoice_data.org_id,
        v_eway_bill_number,
        p_invoice_id,
        CASE 
            WHEN v_invoice_data.from_state = v_invoice_data.to_state THEN 'Inward'
            ELSE 'Outward'
        END,
        'Supply',
        'Tax Invoice',
        v_invoice_data.invoice_number,
        v_invoice_data.invoice_date,
        v_invoice_data.supplier_gstin,
        v_invoice_data.supplier_address,
        v_invoice_data.customer_gstin,
        v_invoice_data.customer_address,
        v_invoice_data.total_amount,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'hsn_code', p.hsn_code,
                    'product_name', p.product_name,
                    'quantity', ii.quantity,
                    'taxable_value', ii.taxable_amount
                )
            )
            FROM sales.invoice_items ii
            JOIN inventory.products p ON ii.product_id = p.product_id
            WHERE ii.invoice_id = p_invoice_id
        ),
        p_transport_details->>'transport_mode',
        p_transport_details,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + INTERVAL '1 day' * 
            CASE 
                WHEN v_invoice_data.from_state != v_invoice_data.to_state THEN 3
                ELSE 1
            END,
        'active',
        v_invoice_data.created_by
    )
    RETURNING eway_bill_id INTO v_eway_bill_id;
    
    -- Update invoice
    UPDATE sales.invoices
    SET eway_bill_number = v_eway_bill_number,
        eway_bill_date = CURRENT_DATE
    WHERE invoice_id = p_invoice_id;
    
    -- Return result
    SELECT jsonb_build_object(
        'success', true,
        'eway_bill_id', v_eway_bill_id,
        'eway_bill_number', v_eway_bill_number,
        'valid_until', CURRENT_TIMESTAMP + INTERVAL '1 day' * 
            CASE 
                WHEN v_invoice_data.from_state != v_invoice_data.to_state THEN 3
                ELSE 1
            END,
        'message', 'E-way bill generated successfully'
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- LICENSE EXPIRY ALERTS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_license_expiry_alerts(
    p_org_id INTEGER,
    p_days_ahead INTEGER DEFAULT 90,
    p_license_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'licenses', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'license_id', l.license_id,
                    'license_type', l.license_type,
                    'license_number', l.license_number,
                    'license_name', l.license_name,
                    'issuing_authority', l.issuing_authority,
                    'issue_date', l.issue_date,
                    'expiry_date', l.expiry_date,
                    'days_to_expiry', l.expiry_date - CURRENT_DATE,
                    'renewal_status', l.renewal_status,
                    'applicable_branches', (
                        SELECT jsonb_agg(b.branch_name ORDER BY b.branch_id)
                        FROM master.branches b
                        WHERE b.branch_id = ANY(l.applicable_branches)
                    ),
                    'responsible_person', l.responsible_person,
                    'urgency', CASE
                        WHEN l.expiry_date < CURRENT_DATE THEN 'expired'
                        WHEN l.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
                        WHEN l.expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'high'
                        WHEN l.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'medium'
                        ELSE 'low'
                    END,
                    'renewal_documents', l.renewal_documents
                ) ORDER BY l.expiry_date
            ),
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'total_licenses', COUNT(*),
            'expired_count', COUNT(*) FILTER (WHERE l.expiry_date < CURRENT_DATE),
            'critical_count', COUNT(*) FILTER (WHERE l.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'),
            'high_count', COUNT(*) FILTER (WHERE l.expiry_date BETWEEN CURRENT_DATE + INTERVAL '31 days' AND CURRENT_DATE + INTERVAL '60 days'),
            'medium_count', COUNT(*) FILTER (WHERE l.expiry_date BETWEEN CURRENT_DATE + INTERVAL '61 days' AND CURRENT_DATE + INTERVAL '90 days'),
            'by_type', (
                SELECT jsonb_object_agg(
                    license_type,
                    jsonb_build_object(
                        'count', type_count,
                        'next_expiry', next_expiry
                    )
                )
                FROM (
                    SELECT 
                        license_type,
                        COUNT(*) as type_count,
                        MIN(expiry_date) as next_expiry
                    FROM compliance.business_licenses
                    WHERE org_id = p_org_id
                    AND is_active = TRUE
                    AND expiry_date <= CURRENT_DATE + p_days_ahead * INTERVAL '1 day'
                    GROUP BY license_type
                ) type_summary
            )
        )
    ) INTO v_result
    FROM compliance.business_licenses l
    WHERE l.org_id = p_org_id
    AND l.is_active = TRUE
    AND l.expiry_date <= CURRENT_DATE + p_days_ahead * INTERVAL '1 day'
    AND (p_license_type IS NULL OR l.license_type = p_license_type);
    
    RETURN v_result;
END;
$$;

-- =============================================
-- NARCOTIC REGISTER API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_narcotic_register(
    p_product_id INTEGER DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_to_date DATE DEFAULT CURRENT_DATE,
    p_include_balance_check BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH narcotic_entries AS (
        SELECT 
            ndr.register_id,
            ndr.register_date,
            ndr.product_id,
            p.product_name,
            p.product_code,
            ndr.batch_id,
            b.batch_number,
            ndr.transaction_type,
            ndr.reference_type,
            ndr.reference_number,
            ndr.quantity_in,
            ndr.quantity_out,
            ndr.balance_quantity,
            ndr.party_name,
            ndr.party_license_number,
            ndr.prescription_details,
            ndr.verification_status,
            ndr.verified_by,
            u.full_name as verified_by_name,
            ndr.narration
        FROM compliance.narcotic_drug_register ndr
        JOIN inventory.products p ON ndr.product_id = p.product_id
        JOIN inventory.batches b ON ndr.batch_id = b.batch_id
        LEFT JOIN system_config.users u ON ndr.verified_by = u.user_id
        WHERE ndr.register_date BETWEEN p_from_date AND p_to_date
        AND (p_product_id IS NULL OR ndr.product_id = p_product_id)
        ORDER BY ndr.register_date DESC, ndr.register_id DESC
    ),
    balance_verification AS (
        SELECT 
            product_id,
            batch_id,
            SUM(quantity_in - quantity_out) as calculated_balance,
            MAX(balance_quantity) as recorded_balance,
            ABS(SUM(quantity_in - quantity_out) - MAX(balance_quantity)) > 0.01 as has_discrepancy
        FROM compliance.narcotic_drug_register
        WHERE register_date <= p_to_date
        AND (p_product_id IS NULL OR product_id = p_product_id)
        GROUP BY product_id, batch_id
    )
    SELECT jsonb_build_object(
        'period', jsonb_build_object(
            'from_date', p_from_date,
            'to_date', p_to_date
        ),
        'entries', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'register_id', ne.register_id,
                    'date', ne.register_date,
                    'product_name', ne.product_name,
                    'product_code', ne.product_code,
                    'batch_number', ne.batch_number,
                    'transaction_type', ne.transaction_type,
                    'reference', jsonb_build_object(
                        'type', ne.reference_type,
                        'number', ne.reference_number
                    ),
                    'quantity_in', ne.quantity_in,
                    'quantity_out', ne.quantity_out,
                    'balance', ne.balance_quantity,
                    'party_details', CASE 
                        WHEN ne.party_name IS NOT NULL THEN jsonb_build_object(
                            'name', ne.party_name,
                            'license', ne.party_license_number
                        )
                        ELSE NULL
                    END,
                    'prescription', ne.prescription_details,
                    'verification', jsonb_build_object(
                        'status', ne.verification_status,
                        'verified_by', ne.verified_by_name
                    ),
                    'remarks', ne.narration
                ) ORDER BY ne.register_date DESC, ne.register_id DESC
            ),
            '[]'::jsonb
        ),
        'balance_verification', CASE 
            WHEN p_include_balance_check THEN (
                SELECT jsonb_build_object(
                    'products_checked', COUNT(DISTINCT product_id),
                    'batches_checked', COUNT(*),
                    'discrepancies_found', COUNT(*) FILTER (WHERE has_discrepancy),
                    'discrepancy_details', COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'product_id', bv.product_id,
                                'batch_id', bv.batch_id,
                                'calculated_balance', bv.calculated_balance,
                                'recorded_balance', bv.recorded_balance,
                                'difference', ABS(bv.calculated_balance - bv.recorded_balance)
                            ) ORDER BY bv.product_id, bv.batch_id
                        ) FILTER (WHERE bv.has_discrepancy),
                        '[]'::jsonb
                    )
                )
                FROM balance_verification bv
            )
            ELSE NULL
        END,
        'summary', jsonb_build_object(
            'total_entries', COUNT(*),
            'receipts', COUNT(*) FILTER (WHERE ne.transaction_type = 'receipt'),
            'issues', COUNT(*) FILTER (WHERE ne.transaction_type = 'issue'),
            'pending_verification', COUNT(*) FILTER (WHERE ne.verification_status = 'pending_verification'),
            'by_product', (
                SELECT jsonb_object_agg(
                    product_name,
                    jsonb_build_object(
                        'entries', product_entries,
                        'quantity_in', total_in,
                        'quantity_out', total_out,
                        'net_movement', total_in - total_out
                    )
                )
                FROM (
                    SELECT 
                        product_name,
                        COUNT(*) as product_entries,
                        SUM(quantity_in) as total_in,
                        SUM(quantity_out) as total_out
                    FROM narcotic_entries
                    GROUP BY product_name
                ) product_summary
            )
        )
    ) INTO v_result
    FROM narcotic_entries ne;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- REGULATORY INSPECTION API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_regulatory_inspections(
    p_org_id INTEGER,
    p_inspection_status TEXT DEFAULT NULL,
    p_from_date DATE DEFAULT NULL,
    p_include_findings BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'inspections', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'inspection_id', ri.inspection_id,
                    'inspection_date', ri.inspection_date,
                    'inspection_type', ri.inspection_type,
                    'regulatory_body', ri.regulatory_body,
                    'inspector_details', ri.inspector_details,
                    'branches_inspected', (
                        SELECT jsonb_agg(b.branch_name)
                        FROM master.branches b
                        WHERE b.branch_id = ANY(ri.branches_inspected)
                    ),
                    'inspection_status', ri.inspection_status,
                    'overall_rating', ri.overall_rating,
                    'findings', CASE 
                        WHEN p_include_findings THEN (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'finding_id', f.finding_id,
                                    'finding_category', f.finding_category,
                                    'severity', f.severity,
                                    'description', f.description,
                                    'corrective_action', f.corrective_action_required,
                                    'target_date', f.target_closure_date,
                                    'status', f.status,
                                    'closure_evidence', f.closure_evidence
                                ) ORDER BY 
                                    CASE f.severity 
                                        WHEN 'critical' THEN 1
                                        WHEN 'major' THEN 2
                                        WHEN 'minor' THEN 3
                                        ELSE 4
                                    END,
                                    f.target_closure_date
                            )
                            FROM compliance.inspection_findings f
                            WHERE f.inspection_id = ri.inspection_id
                        )
                        ELSE NULL
                    END,
                    'next_inspection_date', ri.next_inspection_date,
                    'inspection_report', ri.inspection_report
                ) ORDER BY ri.inspection_date DESC
            ),
            '[]'::jsonb
        ),
        'summary', jsonb_build_object(
            'total_inspections', COUNT(*),
            'by_status', (
                SELECT jsonb_object_agg(
                    inspection_status,
                    status_count
                )
                FROM (
                    SELECT 
                        inspection_status,
                        COUNT(*) as status_count
                    FROM compliance.regulatory_inspections
                    WHERE org_id = p_org_id
                    AND (p_from_date IS NULL OR inspection_date >= p_from_date)
                    GROUP BY inspection_status
                ) status_summary
            ),
            'findings_summary', (
                SELECT jsonb_build_object(
                    'total_findings', COUNT(*),
                    'open_findings', COUNT(*) FILTER (WHERE f.status != 'closed'),
                    'overdue_findings', COUNT(*) FILTER (WHERE f.target_closure_date < CURRENT_DATE AND f.status != 'closed'),
                    'by_severity', jsonb_build_object(
                        'critical', COUNT(*) FILTER (WHERE f.severity = 'critical'),
                        'major', COUNT(*) FILTER (WHERE f.severity = 'major'),
                        'minor', COUNT(*) FILTER (WHERE f.severity = 'minor')
                    )
                )
                FROM compliance.inspection_findings f
                JOIN compliance.regulatory_inspections ri2 ON f.inspection_id = ri2.inspection_id
                WHERE ri2.org_id = p_org_id
                AND (p_from_date IS NULL OR ri2.inspection_date >= p_from_date)
            ),
            'next_scheduled', (
                SELECT MIN(next_inspection_date)
                FROM compliance.regulatory_inspections
                WHERE org_id = p_org_id
                AND next_inspection_date > CURRENT_DATE
            )
        )
    ) INTO v_result
    FROM compliance.regulatory_inspections ri
    WHERE ri.org_id = p_org_id
    AND (p_inspection_status IS NULL OR ri.inspection_status = p_inspection_status)
    AND (p_from_date IS NULL OR ri.inspection_date >= p_from_date);
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.generate_gstr1_data TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.generate_eway_bill TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_license_expiry_alerts TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_narcotic_register TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_regulatory_inspections TO authenticated_user;

COMMENT ON FUNCTION api.generate_gstr1_data IS 'Generate GSTR-1 data for GST filing';
COMMENT ON FUNCTION api.generate_eway_bill IS 'Generate e-way bill for eligible invoices';
COMMENT ON FUNCTION api.get_license_expiry_alerts IS 'Get business license expiry alerts';
COMMENT ON FUNCTION api.get_narcotic_register IS 'Get narcotic drug register with balance verification';
COMMENT ON FUNCTION api.get_regulatory_inspections IS 'Get regulatory inspection history and findings';