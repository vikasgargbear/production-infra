-- =============================================
-- GST & TAX MANAGEMENT TRIGGERS
-- =============================================
-- Schema: gst
-- Critical for Indian pharmaceutical compliance
-- Handles all GST calculations and return generation
-- =============================================

-- =============================================
-- 1. AUTO-CALCULATE GST ON INVOICE ITEMS
-- =============================================
CREATE OR REPLACE FUNCTION calculate_gst_on_invoice_item()
RETURNS TRIGGER AS $$
DECLARE
    v_hsn_code TEXT;
    v_gst_rates RECORD;
    v_customer_state TEXT;
    v_org_state TEXT;
    v_is_interstate BOOLEAN;
    v_taxable_amount NUMERIC;
BEGIN
    -- Get HSN code for the product
    SELECT hsn_code INTO v_hsn_code
    FROM inventory.products
    WHERE product_id = NEW.product_id;
    
    -- Get applicable GST rates
    SELECT 
        igst_rate,
        cgst_rate,
        sgst_rate,
        cess_rate
    INTO v_gst_rates
    FROM gst.gst_rates
    WHERE product_id = NEW.product_id
    AND org_id = NEW.org_id
    AND CURRENT_DATE BETWEEN effective_from AND COALESCE(effective_until, CURRENT_DATE + INTERVAL '1 day')
    ORDER BY effective_from DESC
    LIMIT 1;
    
    -- If no product-specific rate, get HSN-based rate
    IF v_gst_rates IS NULL AND v_hsn_code IS NOT NULL THEN
        SELECT 
            igst_rate,
            cgst_rate,
            sgst_rate,
            cess_rate
        INTO v_gst_rates
        FROM gst.hsn_sac_codes
        WHERE code = v_hsn_code
        AND CURRENT_DATE BETWEEN effective_from AND COALESCE(effective_until, CURRENT_DATE + INTERVAL '1 day');
    END IF;
    
    -- Get customer and org states for interstate check
    SELECT 
        c.state_code,
        o.state_code
    INTO v_customer_state, v_org_state
    FROM sales.invoices i
    JOIN parties.customers c ON i.customer_id = c.customer_id
    JOIN master.organizations o ON i.org_id = o.org_id
    WHERE i.invoice_id = NEW.invoice_id;
    
    v_is_interstate := (v_customer_state != v_org_state);
    
    -- Calculate taxable amount
    v_taxable_amount := (NEW.quantity * NEW.unit_price) - COALESCE(NEW.discount_amount, 0);
    
    -- Set GST values
    NEW.hsn_code := v_hsn_code;
    NEW.taxable_amount := v_taxable_amount;
    
    IF v_is_interstate THEN
        -- Interstate supply - IGST only
        NEW.igst_rate := COALESCE(v_gst_rates.igst_rate, 0);
        NEW.cgst_rate := 0;
        NEW.sgst_rate := 0;
        NEW.igst_amount := ROUND(v_taxable_amount * NEW.igst_rate / 100, 2);
        NEW.cgst_amount := 0;
        NEW.sgst_amount := 0;
    ELSE
        -- Intrastate supply - CGST + SGST
        NEW.igst_rate := 0;
        NEW.cgst_rate := COALESCE(v_gst_rates.cgst_rate, 0);
        NEW.sgst_rate := COALESCE(v_gst_rates.sgst_rate, 0);
        NEW.igst_amount := 0;
        NEW.cgst_amount := ROUND(v_taxable_amount * NEW.cgst_rate / 100, 2);
        NEW.sgst_amount := ROUND(v_taxable_amount * NEW.sgst_rate / 100, 2);
    END IF;
    
    -- Cess if applicable
    NEW.cess_rate := COALESCE(v_gst_rates.cess_rate, 0);
    NEW.cess_amount := ROUND(v_taxable_amount * NEW.cess_rate / 100, 2);
    
    -- Total tax
    NEW.total_tax_amount := NEW.igst_amount + NEW.cgst_amount + NEW.sgst_amount + NEW.cess_amount;
    
    -- Line total
    NEW.line_total := v_taxable_amount + NEW.total_tax_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_gst_invoice_item
    BEFORE INSERT OR UPDATE OF quantity, unit_price, discount_amount 
    ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_gst_on_invoice_item();

-- =============================================
-- 2. AUTO-POPULATE GSTR-1 DATA
-- =============================================
CREATE OR REPLACE FUNCTION populate_gstr1_on_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_return_period TEXT;
    v_customer_record RECORD;
    v_invoice_items JSONB;
    v_is_b2b BOOLEAN;
    v_is_export BOOLEAN;
BEGIN
    -- Only process posted invoices
    IF NEW.invoice_status != 'posted' OR OLD.invoice_status = 'posted' THEN
        RETURN NEW;
    END IF;
    
    -- Calculate return period (MMYYYY format)
    v_return_period := TO_CHAR(NEW.invoice_date, 'MMYYYY');
    
    -- Get customer details
    SELECT 
        c.customer_type,
        c.gst_number,
        c.country,
        c.state_code
    INTO v_customer_record
    FROM parties.customers c
    WHERE c.customer_id = NEW.customer_id;
    
    -- Determine invoice type
    v_is_b2b := (v_customer_record.gst_number IS NOT NULL);
    v_is_export := (v_customer_record.country != 'India');
    
    -- Get invoice items with GST details
    SELECT jsonb_agg(
        jsonb_build_object(
            'hsn_code', ii.hsn_code,
            'product_name', p.product_name,
            'quantity', ii.quantity,
            'unit', ii.uom,
            'taxable_value', ii.taxable_amount,
            'igst_rate', ii.igst_rate,
            'igst_amount', ii.igst_amount,
            'cgst_rate', ii.cgst_rate,
            'cgst_amount', ii.cgst_amount,
            'sgst_rate', ii.sgst_rate,
            'sgst_amount', ii.sgst_amount,
            'cess_rate', ii.cess_rate,
            'cess_amount', ii.cess_amount,
            'total', ii.line_total
        )
    ) INTO v_invoice_items
    FROM sales.invoice_items ii
    JOIN inventory.products p ON ii.product_id = p.product_id
    WHERE ii.invoice_id = NEW.invoice_id;
    
    -- Create or update GSTR-1 entry
    INSERT INTO gst.gstr1_data (
        org_id,
        return_period,
        financial_year
    ) VALUES (
        NEW.org_id,
        v_return_period,
        CASE 
            WHEN EXTRACT(MONTH FROM NEW.invoice_date) >= 4 THEN
                EXTRACT(YEAR FROM NEW.invoice_date)::TEXT || '-' || 
                (EXTRACT(YEAR FROM NEW.invoice_date) + 1)::TEXT
            ELSE
                (EXTRACT(YEAR FROM NEW.invoice_date) - 1)::TEXT || '-' || 
                EXTRACT(YEAR FROM NEW.invoice_date)::TEXT
        END
    )
    ON CONFLICT (org_id, return_period) DO NOTHING;
    
    -- Add invoice to appropriate section
    IF v_is_export THEN
        -- Export invoices
        UPDATE gst.gstr1_data
        SET 
            exp_supplies = COALESCE(exp_supplies, '[]'::jsonb) || 
                jsonb_build_object(
                    'invoice_number', NEW.invoice_number,
                    'invoice_date', NEW.invoice_date,
                    'port_code', v_customer_record.port_code,
                    'shipping_bill_number', NEW.shipping_bill_number,
                    'shipping_bill_date', NEW.shipping_bill_date,
                    'taxable_value', NEW.taxable_amount,
                    'items', v_invoice_items
                ),
            exp_taxable_value = COALESCE(exp_taxable_value, 0) + NEW.taxable_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE org_id = NEW.org_id
        AND return_period = v_return_period;
        
    ELSIF v_is_b2b THEN
        -- B2B invoices
        UPDATE gst.gstr1_data
        SET 
            b2b_supplies = COALESCE(b2b_supplies, '[]'::jsonb) || 
                jsonb_build_object(
                    'gstin', v_customer_record.gst_number,
                    'invoice_number', NEW.invoice_number,
                    'invoice_date', NEW.invoice_date,
                    'invoice_value', NEW.final_amount,
                    'place_of_supply', v_customer_record.state_code,
                    'reverse_charge', NEW.reverse_charge,
                    'invoice_type', NEW.invoice_type,
                    'items', v_invoice_items
                ),
            b2b_invoice_count = COALESCE(b2b_invoice_count, 0) + 1,
            b2b_taxable_value = COALESCE(b2b_taxable_value, 0) + NEW.taxable_amount,
            b2b_tax_amount = COALESCE(b2b_tax_amount, 0) + NEW.total_tax_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE org_id = NEW.org_id
        AND return_period = v_return_period;
        
    ELSIF NEW.final_amount > 250000 THEN
        -- B2C Large (>2.5 lakh)
        UPDATE gst.gstr1_data
        SET 
            b2cl_supplies = COALESCE(b2cl_supplies, '[]'::jsonb) || 
                jsonb_build_object(
                    'invoice_number', NEW.invoice_number,
                    'invoice_date', NEW.invoice_date,
                    'invoice_value', NEW.final_amount,
                    'place_of_supply', v_customer_record.state_code,
                    'items', v_invoice_items
                ),
            b2cl_invoice_count = COALESCE(b2cl_invoice_count, 0) + 1,
            b2cl_taxable_value = COALESCE(b2cl_taxable_value, 0) + NEW.taxable_amount,
            b2cl_tax_amount = COALESCE(b2cl_tax_amount, 0) + NEW.total_tax_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE org_id = NEW.org_id
        AND return_period = v_return_period;
        
    ELSE
        -- B2C Small (<=2.5 lakh) - Summary only
        UPDATE gst.gstr1_data
        SET 
            b2cs_taxable_value = COALESCE(b2cs_taxable_value, 0) + NEW.taxable_amount,
            b2cs_tax_amount = COALESCE(b2cs_tax_amount, 0) + NEW.total_tax_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE org_id = NEW.org_id
        AND return_period = v_return_period;
    END IF;
    
    -- Update totals
    UPDATE gst.gstr1_data
    SET 
        total_taxable_value = COALESCE(b2b_taxable_value, 0) + 
                             COALESCE(b2cl_taxable_value, 0) + 
                             COALESCE(b2cs_taxable_value, 0) + 
                             COALESCE(exp_taxable_value, 0),
        total_tax_amount = COALESCE(b2b_tax_amount, 0) + 
                          COALESCE(b2cl_tax_amount, 0) + 
                          COALESCE(b2cs_tax_amount, 0)
    WHERE org_id = NEW.org_id
    AND return_period = v_return_period;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_populate_gstr1
    AFTER UPDATE OF invoice_status ON sales.invoices
    FOR EACH ROW
    WHEN (NEW.invoice_status = 'posted' AND OLD.invoice_status != 'posted')
    EXECUTE FUNCTION populate_gstr1_on_invoice();

-- =============================================
-- 3. AUTO-RECONCILE GSTR-2A WITH PURCHASES
-- =============================================
CREATE OR REPLACE FUNCTION reconcile_gstr2a_with_purchases()
RETURNS TRIGGER AS $$
DECLARE
    v_matched_invoice RECORD;
    v_tolerance_amount NUMERIC := 1.00; -- ₹1 tolerance
BEGIN
    -- Try to match with purchase invoices
    FOR v_matched_invoice IN 
        SELECT 
            si.supplier_invoice_id,
            si.supplier_invoice_number,
            si.invoice_total,
            si.tax_amount
        FROM procurement.supplier_invoices si
        JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
        WHERE s.gst_number = (NEW.b2b_invoices->0->>'gstin')::TEXT
        AND si.supplier_invoice_number = (NEW.b2b_invoices->0->>'invoice_number')::TEXT
        AND si.org_id = NEW.org_id
        AND si.invoice_status != 'cancelled'
    LOOP
        -- Check if amounts match within tolerance
        IF ABS(v_matched_invoice.invoice_total - 
               (NEW.b2b_invoices->0->>'invoice_value')::NUMERIC) <= v_tolerance_amount THEN
            
            -- Update supplier invoice with GSTR-2A match
            UPDATE procurement.supplier_invoices
            SET 
                gstr2a_matched = TRUE,
                gstr2a_match_date = CURRENT_DATE,
                matching_status = 'matched',
                itc_eligible = TRUE
            WHERE supplier_invoice_id = v_matched_invoice.supplier_invoice_id;
            
            -- Update reconciliation status
            NEW.reconciliation_status := 'matched';
            NEW.matched_invoices := COALESCE(NEW.matched_invoices, 0) + 1;
            
        ELSE
            -- Amount mismatch
            INSERT INTO gst.gst_reconciliation (
                org_id,
                reconciliation_type,
                period,
                books_data,
                gst_return_data,
                taxable_value_variance,
                tax_variance,
                reconciliation_status
            ) VALUES (
                NEW.org_id,
                'gstr2a_vs_books',
                NEW.return_period,
                jsonb_build_object(
                    'invoice_number', v_matched_invoice.supplier_invoice_number,
                    'invoice_amount', v_matched_invoice.invoice_total,
                    'tax_amount', v_matched_invoice.tax_amount
                ),
                NEW.b2b_invoices->0,
                ABS(v_matched_invoice.invoice_total - (NEW.b2b_invoices->0->>'invoice_value')::NUMERIC),
                ABS(v_matched_invoice.tax_amount - (NEW.b2b_invoices->0->>'tax_amount')::NUMERIC),
                'variance'
            );
            
            NEW.reconciliation_status := 'mismatched';
            NEW.unmatched_invoices := COALESCE(NEW.unmatched_invoices, 0) + 1;
        END IF;
    END LOOP;
    
    -- If no match found
    IF NOT FOUND THEN
        NEW.reconciliation_status := 'pending';
        NEW.unmatched_invoices := COALESCE(NEW.unmatched_invoices, 0) + 1;
        
        -- Create alert for missing invoice
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        ) VALUES (
            NEW.org_id,
            'warning',
            'gst',
            'GSTR-2A Invoice Not in Books',
            format('Invoice %s from GSTIN %s not found in purchase records',
                NEW.b2b_invoices->0->>'invoice_number',
                NEW.b2b_invoices->0->>'gstin'),
            'high',
            jsonb_build_object(
                'gstr2a_id', NEW.gstr2a_id,
                'invoice_details', NEW.b2b_invoices->0
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reconcile_gstr2a
    BEFORE INSERT OR UPDATE OF b2b_invoices ON gst.gstr2a_data
    FOR EACH ROW
    WHEN (NEW.b2b_invoices IS NOT NULL)
    EXECUTE FUNCTION reconcile_gstr2a_with_purchases();

-- =============================================
-- 4. CALCULATE GST LIABILITY
-- =============================================
CREATE OR REPLACE FUNCTION calculate_monthly_gst_liability()
RETURNS TRIGGER AS $$
DECLARE
    v_output_tax RECORD;
    v_input_tax RECORD;
    v_late_fee NUMERIC := 0;
    v_days_late INTEGER;
BEGIN
    -- Calculate output tax from GSTR-1
    SELECT 
        COALESCE(SUM((item->>'igst_amount')::NUMERIC), 0) as igst,
        COALESCE(SUM((item->>'cgst_amount')::NUMERIC), 0) as cgst,
        COALESCE(SUM((item->>'sgst_amount')::NUMERIC), 0) as sgst,
        COALESCE(SUM((item->>'cess_amount')::NUMERIC), 0) as cess
    INTO v_output_tax
    FROM gst.gstr1_data g1,
         jsonb_array_elements(
             COALESCE(g1.b2b_supplies, '[]'::jsonb) || 
             COALESCE(g1.b2cl_supplies, '[]'::jsonb)
         ) as invoice,
         jsonb_array_elements(invoice->'items') as item
    WHERE g1.org_id = NEW.org_id
    AND g1.return_period = NEW.tax_period;
    
    -- Calculate input tax credit from GSTR-2B
    SELECT 
        COALESCE(igst_itc, 0) as igst,
        COALESCE(cgst_itc, 0) as cgst,
        COALESCE(sgst_itc, 0) as sgst,
        COALESCE(cess_itc, 0) as cess
    INTO v_input_tax
    FROM gst.gstr2b_data
    WHERE org_id = NEW.org_id
    AND return_period = NEW.tax_period;
    
    -- Update liability calculation
    NEW.igst_liability := v_output_tax.igst;
    NEW.cgst_liability := v_output_tax.cgst;
    NEW.sgst_liability := v_output_tax.sgst;
    NEW.cess_liability := v_output_tax.cess;
    
    NEW.igst_itc_utilized := LEAST(v_input_tax.igst, v_output_tax.igst);
    NEW.cgst_itc_utilized := LEAST(v_input_tax.cgst, v_output_tax.cgst);
    NEW.sgst_itc_utilized := LEAST(v_input_tax.sgst, v_output_tax.sgst);
    NEW.cess_itc_utilized := LEAST(v_input_tax.cess, v_output_tax.cess);
    
    NEW.igst_cash_required := GREATEST(0, v_output_tax.igst - v_input_tax.igst);
    NEW.cgst_cash_required := GREATEST(0, v_output_tax.cgst - v_input_tax.cgst);
    NEW.sgst_cash_required := GREATEST(0, v_output_tax.sgst - v_input_tax.sgst);
    NEW.cess_cash_required := GREATEST(0, v_output_tax.cess - v_input_tax.cess);
    
    -- Calculate late fee if applicable
    v_days_late := GREATEST(0, (CURRENT_DATE - NEW.due_date)::INTEGER);
    IF v_days_late > 0 AND NEW.payment_status != 'paid' THEN
        -- GSTR-3B late fee: ₹50/day (₹25 CGST + ₹25 SGST) up to ₹5000
        v_late_fee := LEAST(v_days_late * 50, 5000);
        NEW.late_fee := v_late_fee;
    END IF;
    
    -- Calculate totals
    NEW.total_liability := NEW.igst_liability + NEW.cgst_liability + 
                          NEW.sgst_liability + NEW.cess_liability;
    NEW.balance_payable := NEW.igst_cash_required + NEW.cgst_cash_required + 
                          NEW.sgst_cash_required + NEW.cess_cash_required + 
                          COALESCE(NEW.late_fee, 0);
    
    -- Create alert if payment due
    IF NEW.balance_payable > 0 AND NEW.payment_status = 'pending' 
       AND CURRENT_DATE >= NEW.due_date - INTERVAL '3 days' THEN
        
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        ) VALUES (
            NEW.org_id,
            'warning',
            'gst',
            'GST Payment Due',
            format('GST liability of ₹%s due on %s for period %s',
                TO_CHAR(NEW.balance_payable, 'FM99,99,999.00'),
                TO_CHAR(NEW.due_date, 'DD/MM/YYYY'),
                NEW.tax_period),
            'urgent',
            jsonb_build_object(
                'liability_id', NEW.liability_id,
                'tax_period', NEW.tax_period,
                'amount_due', NEW.balance_payable,
                'due_date', NEW.due_date
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_gst_liability
    BEFORE INSERT OR UPDATE ON gst.gst_liability
    FOR EACH ROW
    EXECUTE FUNCTION calculate_monthly_gst_liability();

-- =============================================
-- 5. ITC ELIGIBILITY CHECK
-- =============================================
CREATE OR REPLACE FUNCTION check_itc_eligibility()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_status TEXT;
    v_invoice_age_days INTEGER;
    v_gstr2a_available BOOLEAN;
BEGIN
    -- Check supplier GST compliance status
    SELECT compliance_rating
    INTO v_supplier_status
    FROM parties.suppliers
    WHERE supplier_id = (
        SELECT supplier_id 
        FROM procurement.supplier_invoices 
        WHERE supplier_invoice_id = NEW.reference_id
    );
    
    -- Check invoice age (ITC time limit - 1 year + filing date)
    v_invoice_age_days := (CURRENT_DATE - NEW.transaction_date)::INTEGER;
    
    -- Check if invoice appears in GSTR-2A
    SELECT EXISTS(
        SELECT 1 
        FROM gst.gstr2a_data g2a,
             jsonb_array_elements(g2a.b2b_invoices) as inv
        WHERE g2a.org_id = NEW.org_id
        AND inv->>'invoice_number' = NEW.reference_number
    ) INTO v_gstr2a_available;
    
    -- Determine ITC eligibility
    IF v_supplier_status = 'blacklisted' THEN
        NEW.transaction_type := 'itc_reversed';
        NEW.description := 'ITC reversed - Supplier blacklisted';
        
    ELSIF v_invoice_age_days > 365 THEN
        NEW.transaction_type := 'itc_lapsed';
        NEW.description := 'ITC lapsed - Time limit exceeded';
        
    ELSIF NOT v_gstr2a_available AND v_invoice_age_days > 60 THEN
        NEW.transaction_type := 'itc_provisional';
        NEW.description := 'Provisional ITC - Not in GSTR-2A';
        
        -- Create alert
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority
        ) VALUES (
            NEW.org_id,
            'warning',
            'gst',
            'Provisional ITC Claimed',
            format('ITC claimed for invoice %s not available in GSTR-2A',
                NEW.reference_number),
            'high'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_itc_eligibility
    BEFORE INSERT ON gst.gst_credit_ledger
    FOR EACH ROW
    WHEN (NEW.transaction_type = 'itc_availed')
    EXECUTE FUNCTION check_itc_eligibility();

-- =============================================
-- 6. E-WAY BILL GENERATION TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION check_eway_bill_requirement()
RETURNS TRIGGER AS $$
DECLARE
    v_distance_km NUMERIC;
    v_consignment_value NUMERIC;
    v_requires_eway_bill BOOLEAN := FALSE;
BEGIN
    -- E-way bill required if value > ₹50,000
    v_consignment_value := NEW.total_amount;
    
    -- Calculate distance between source and destination
    SELECT 
        ST_Distance(
            ST_MakePoint(source.longitude, source.latitude)::geography,
            ST_MakePoint(dest.longitude, dest.latitude)::geography
        ) / 1000 -- Convert to km
    INTO v_distance_km
    FROM master.addresses source, master.addresses dest
    WHERE source.address_id = NEW.dispatch_address_id
    AND dest.address_id = NEW.delivery_address_id;
    
    -- Check e-way bill requirement
    IF v_consignment_value > 50000 THEN
        v_requires_eway_bill := TRUE;
    END IF;
    
    -- Special cases - always required
    IF EXISTS (
        SELECT 1 
        FROM sales.delivery_challan_items dci
        JOIN inventory.products p ON dci.product_id = p.product_id
        WHERE dci.challan_id = NEW.challan_id
        AND p.product_category IN ('Narcotics', 'Psychotropics')
    ) THEN
        v_requires_eway_bill := TRUE;
    END IF;
    
    IF v_requires_eway_bill THEN
        NEW.eway_bill_required := TRUE;
        NEW.eway_bill_validity_days := CASE
            WHEN v_distance_km < 100 THEN 1
            WHEN v_distance_km < 300 THEN 3
            WHEN v_distance_km < 500 THEN 5
            WHEN v_distance_km < 1000 THEN 10
            ELSE 15
        END;
        
        -- Auto-generate e-way bill data
        NEW.eway_bill_data := jsonb_build_object(
            'supply_type', 'outward',
            'sub_type', 'supply',
            'document_type', 'tax_invoice',
            'document_number', NEW.invoice_number,
            'document_date', NEW.invoice_date,
            'from_gstin', (SELECT gst_number FROM master.organizations WHERE org_id = NEW.org_id),
            'to_gstin', (SELECT gst_number FROM parties.customers WHERE customer_id = NEW.customer_id),
            'consignment_value', v_consignment_value,
            'distance', ROUND(v_distance_km),
            'transport_mode', NEW.transport_mode,
            'vehicle_number', NEW.vehicle_number,
            'validity_days', NEW.eway_bill_validity_days
        );
        
        -- Create notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority
        ) VALUES (
            NEW.org_id,
            'info',
            'gst',
            'E-Way Bill Required',
            format('E-way bill required for challan %s (₹%s, %s km)',
                NEW.challan_number,
                TO_CHAR(v_consignment_value, 'FM99,99,999'),
                ROUND(v_distance_km)),
            'high'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_eway_bill
    BEFORE INSERT OR UPDATE ON sales.delivery_challans
    FOR EACH ROW
    EXECUTE FUNCTION check_eway_bill_requirement();

-- =============================================
-- 7. GST RETURN FILING REMINDER
-- =============================================
CREATE OR REPLACE FUNCTION create_gst_filing_reminders()
RETURNS TRIGGER AS $$
DECLARE
    v_filing_date DATE;
    v_return_type TEXT;
BEGIN
    -- Determine filing due date based on return type
    CASE NEW.return_period
        WHEN 'GSTR-1' THEN
            v_filing_date := DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + INTERVAL '10 days';
            v_return_type := 'GSTR-1 (Outward Supplies)';
        WHEN 'GSTR-3B' THEN
            v_filing_date := DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + INTERVAL '19 days';
            v_return_type := 'GSTR-3B (Summary Return)';
        ELSE
            RETURN NEW;
    END CASE;
    
    -- Create reminder notifications at different intervals
    -- 7 days before
    INSERT INTO system_config.scheduled_notifications (
        org_id,
        scheduled_for,
        notification_type,
        notification_category,
        title,
        message,
        priority
    ) VALUES (
        NEW.org_id,
        v_filing_date - INTERVAL '7 days',
        'info',
        'gst',
        format('%s Filing Due', v_return_type),
        format('%s for period %s is due on %s',
            v_return_type,
            NEW.return_period,
            TO_CHAR(v_filing_date, 'DD/MM/YYYY')),
        'medium'
    );
    
    -- 3 days before
    INSERT INTO system_config.scheduled_notifications (
        org_id,
        scheduled_for,
        notification_type,
        notification_category,
        title,
        message,
        priority
    ) VALUES (
        NEW.org_id,
        v_filing_date - INTERVAL '3 days',
        'warning',
        'gst',
        format('%s Filing Reminder', v_return_type),
        format('Only 3 days left to file %s for period %s',
            v_return_type,
            NEW.return_period),
        'high'
    );
    
    -- On due date
    INSERT INTO system_config.scheduled_notifications (
        org_id,
        scheduled_for,
        notification_type,
        notification_category,
        title,
        message,
        priority
    ) VALUES (
        NEW.org_id,
        v_filing_date,
        'error',
        'gst',
        format('%s Filing Due Today!', v_return_type),
        format('Today is the last date to file %s for period %s. Late fee will apply from tomorrow.',
            v_return_type,
            NEW.return_period),
        'urgent'
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_gst_filing_reminders
    AFTER INSERT ON gst.gstr1_data
    FOR EACH ROW
    EXECUTE FUNCTION create_gst_filing_reminders();

-- =============================================
-- 8. HSN CODE VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION validate_hsn_code()
RETURNS TRIGGER AS $$
DECLARE
    v_hsn_valid BOOLEAN;
    v_min_digits INTEGER;
BEGIN
    -- Skip if no HSN code
    IF NEW.hsn_code IS NULL OR NEW.hsn_code = '' THEN
        RETURN NEW;
    END IF;
    
    -- Check if HSN exists in master
    SELECT EXISTS(
        SELECT 1 
        FROM gst.hsn_sac_codes
        WHERE code = NEW.hsn_code
        AND is_active = TRUE
    ) INTO v_hsn_valid;
    
    IF NOT v_hsn_valid THEN
        RAISE WARNING 'HSN code % not found in master. Please verify.', NEW.hsn_code;
    END IF;
    
    -- Validate HSN digits based on turnover
    -- (In practice, you'd check organization's turnover)
    v_min_digits := 4; -- Default for pharma
    
    IF LENGTH(NEW.hsn_code) < v_min_digits THEN
        RAISE EXCEPTION 'HSN code must be at least % digits', v_min_digits;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_hsn_products
    BEFORE INSERT OR UPDATE OF hsn_code ON inventory.products
    FOR EACH ROW
    EXECUTE FUNCTION validate_hsn_code();

-- =============================================
-- SUPPORTING INDEXES FOR GST TRIGGERS
-- =============================================
CREATE INDEX idx_gst_rates_lookup ON gst.gst_rates(org_id, product_id, effective_from);
CREATE INDEX idx_gstr1_period ON gst.gstr1_data(org_id, return_period);
CREATE INDEX idx_gstr2a_period ON gst.gstr2a_data(org_id, return_period);
CREATE INDEX idx_gst_liability_period ON gst.gst_liability(org_id, tax_period);
CREATE INDEX idx_supplier_invoices_gst ON procurement.supplier_invoices(supplier_id, supplier_invoice_number);

-- Comments
COMMENT ON FUNCTION calculate_gst_on_invoice_item() IS 'Automatically calculates GST based on customer location and applicable rates';
COMMENT ON FUNCTION populate_gstr1_on_invoice() IS 'Populates GSTR-1 return data when invoices are posted';
COMMENT ON FUNCTION reconcile_gstr2a_with_purchases() IS 'Matches GSTR-2A data with purchase records for ITC reconciliation';