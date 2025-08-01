-- =============================================
-- GST (GOODS AND SERVICES TAX) TRIGGERS
-- =============================================
-- Schema: gst
-- Automatic tax calculation and return preparation
-- =============================================

-- =============================================
-- 1. AUTOMATIC GST CALCULATION
-- =============================================
CREATE OR REPLACE FUNCTION calculate_gst_on_invoice_item()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_state TEXT;
    v_branch_state TEXT;
    v_hsn_details RECORD;
    v_is_interstate BOOLEAN;
    v_gst_rate NUMERIC;
    v_cess_rate NUMERIC;
BEGIN
    -- Get states for customer and branch
    SELECT 
        SUBSTRING(c.gst_number FROM 1 FOR 2) as customer_state,
        SUBSTRING(b.gst_number FROM 1 FOR 2) as branch_state
    INTO v_customer_state, v_branch_state
    FROM sales.invoices i
    JOIN parties.customers c ON i.customer_id = c.customer_id
    JOIN master.branches b ON i.branch_id = b.branch_id
    WHERE i.invoice_id = NEW.invoice_id;
    
    -- Determine if interstate
    v_is_interstate := (v_customer_state != v_branch_state);
    
    -- Get GST rates from HSN code
    SELECT 
        h.hsn_code,
        h.gst_percentage,
        h.cess_percentage,
        h.description
    INTO v_hsn_details
    FROM gst.hsn_sac_codes h
    WHERE h.hsn_code = NEW.hsn_code
    AND h.is_active = TRUE;
    
    IF NOT FOUND THEN
        -- Try to get from product if HSN not found
        SELECT 
            p.hsn_code,
            COALESCE(p.gst_percentage, 18) as gst_percentage,
            COALESCE(p.cess_percentage, 0) as cess_percentage
        INTO v_hsn_details
        FROM inventory.products p
        WHERE p.product_id = NEW.product_id;
    END IF;
    
    v_gst_rate := COALESCE(v_hsn_details.gst_percentage, 18);
    v_cess_rate := COALESCE(v_hsn_details.cess_percentage, 0);
    
    -- Calculate GST based on interstate/intrastate
    IF v_is_interstate THEN
        -- Interstate - IGST only
        NEW.igst_rate := v_gst_rate;
        NEW.cgst_rate := 0;
        NEW.sgst_rate := 0;
        NEW.igst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 100, 2);
        NEW.cgst_amount := 0;
        NEW.sgst_amount := 0;
    ELSE
        -- Intrastate - CGST + SGST
        NEW.igst_rate := 0;
        NEW.cgst_rate := v_gst_rate / 2;
        NEW.sgst_rate := v_gst_rate / 2;
        NEW.igst_amount := 0;
        NEW.cgst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 200, 2);
        NEW.sgst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 200, 2);
    END IF;
    
    -- Calculate CESS if applicable
    NEW.cess_rate := v_cess_rate;
    NEW.cess_amount := ROUND(NEW.taxable_amount * v_cess_rate / 100, 2);
    
    -- Total tax
    NEW.total_tax_amount := NEW.igst_amount + NEW.cgst_amount + NEW.sgst_amount + NEW.cess_amount;
    
    -- Calculate line total
    NEW.line_total := NEW.taxable_amount + NEW.total_tax_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_gst_invoice
    BEFORE INSERT OR UPDATE OF taxable_amount ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_gst_on_invoice_item();

-- =============================================
-- 2. GSTR-1 AUTO-POPULATION
-- =============================================
CREATE OR REPLACE FUNCTION populate_gstr1_on_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_return_period TEXT;
    v_gstr1_header_id INTEGER;
    v_customer RECORD;
    v_invoice_type TEXT;
    v_supply_type TEXT;
    v_item RECORD;
BEGIN
    -- Only for posted invoices
    IF NEW.invoice_status != 'posted' OR OLD.invoice_status = 'posted' THEN
        RETURN NEW;
    END IF;
    
    -- Determine return period
    v_return_period := TO_CHAR(NEW.invoice_date, 'MMYYYY');
    
    -- Get or create GSTR-1 header
    INSERT INTO gst.gstr1_data (
        org_id,
        branch_id,
        return_period,
        return_status,
        created_by
    ) VALUES (
        NEW.org_id,
        NEW.branch_id,
        v_return_period,
        'draft',
        NEW.created_by
    )
    ON CONFLICT (org_id, branch_id, return_period) 
    DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    RETURNING gstr1_header_id INTO v_gstr1_header_id;
    
    -- Get customer details
    SELECT 
        c.*,
        SUBSTRING(c.gst_number FROM 1 FOR 2) as state_code,
        CASE 
            WHEN c.gst_number IS NULL OR c.gst_number = '' THEN FALSE
            ELSE TRUE
        END as is_registered
    INTO v_customer
    FROM parties.customers c
    WHERE c.customer_id = NEW.customer_id;
    
    -- Determine invoice type and supply type
    IF v_customer.is_registered THEN
        v_invoice_type := 'b2b';
        v_supply_type := 'regular';
    ELSE
        IF NEW.final_amount >= 250000 THEN
            v_invoice_type := 'b2cl';
        ELSE
            v_invoice_type := 'b2cs';
        END IF;
        v_supply_type := 'regular';
    END IF;
    
    -- Handle export invoices
    IF v_customer.country_code != 'IN' THEN
        v_invoice_type := 'exp';
        v_supply_type := 'export';
    END IF;
    
    -- Insert B2B invoices
    IF v_invoice_type = 'b2b' THEN
        INSERT INTO gst.gstr1_data (
            gstr1_header_id,
            invoice_id,
            invoice_number,
            invoice_date,
            customer_gstn,
            customer_name,
            place_of_supply,
            reverse_charge,
            invoice_type,
            taxable_value,
            igst_amount,
            cgst_amount,
            sgst_amount,
            cess_amount,
            total_value
        ) VALUES (
            v_gstr1_header_id,
            NEW.invoice_id,
            NEW.invoice_number,
            NEW.invoice_date,
            v_customer.gst_number,
            v_customer.customer_name,
            v_customer.state_code,
            FALSE,
            CASE 
                WHEN NEW.invoice_type = 'tax_invoice' THEN 'Regular'
                WHEN NEW.invoice_type = 'debit_note' THEN 'Debit Note'
                WHEN NEW.invoice_type = 'credit_note' THEN 'Credit Note'
                ELSE 'Regular'
            END,
            NEW.taxable_amount,
            NEW.igst_amount,
            NEW.cgst_amount,
            NEW.sgst_amount,
            NEW.cess_amount,
            NEW.final_amount
        );
        
        -- Insert item details
        FOR v_item IN
            SELECT * FROM sales.invoice_items
            WHERE invoice_id = NEW.invoice_id
        LOOP
            INSERT INTO gst.gstr1_data_items (
                b2b_id,
                hsn_code,
                description,
                quantity,
                unit,
                taxable_value,
                gst_rate,
                igst_amount,
                cgst_amount,
                sgst_amount,
                cess_amount
            )
            SELECT 
                b.b2b_id,
                v_item.hsn_code,
                v_item.product_description,
                v_item.quantity,
                v_item.uom,
                v_item.taxable_amount,
                GREATEST(v_item.igst_rate, v_item.cgst_rate * 2),
                v_item.igst_amount,
                v_item.cgst_amount,
                v_item.sgst_amount,
                v_item.cess_amount
            FROM gst.gstr1_data b
            WHERE b.invoice_id = NEW.invoice_id;
        END LOOP;
        
    -- Handle B2C Large invoices
    ELSIF v_invoice_type = 'b2cl' THEN
        INSERT INTO gst.gstr_1_b2cl (
            gstr1_header_id,
            invoice_id,
            invoice_number,
            invoice_date,
            place_of_supply,
            taxable_value,
            igst_amount,
            cess_amount,
            total_value
        ) VALUES (
            v_gstr1_header_id,
            NEW.invoice_id,
            NEW.invoice_number,
            NEW.invoice_date,
            v_customer.state_code,
            NEW.taxable_amount,
            NEW.igst_amount,
            NEW.cess_amount,
            NEW.final_amount
        );
        
    -- Handle B2C Small (summary)
    ELSIF v_invoice_type = 'b2cs' THEN
        INSERT INTO gst.gstr_1_b2cs (
            gstr1_header_id,
            place_of_supply,
            supply_type,
            taxable_value,
            igst_amount,
            cgst_amount,
            sgst_amount,
            cess_amount
        ) VALUES (
            v_gstr1_header_id,
            v_customer.state_code,
            'OE', -- Other than E-commerce
            NEW.taxable_amount,
            NEW.igst_amount,
            NEW.cgst_amount,
            NEW.sgst_amount,
            NEW.cess_amount
        )
        ON CONFLICT (gstr1_header_id, place_of_supply, supply_type, gst_rate)
        DO UPDATE SET
            taxable_value = gst.gstr_1_b2cs.taxable_value + NEW.taxable_amount,
            igst_amount = gst.gstr_1_b2cs.igst_amount + NEW.igst_amount,
            cgst_amount = gst.gstr_1_b2cs.cgst_amount + NEW.cgst_amount,
            sgst_amount = gst.gstr_1_b2cs.sgst_amount + NEW.sgst_amount,
            cess_amount = gst.gstr_1_b2cs.cess_amount + NEW.cess_amount;
    END IF;
    
    -- Update header totals
    UPDATE gst.gstr1_data
    SET 
        total_taxable_value = total_taxable_value + NEW.taxable_amount,
        total_igst = total_igst + NEW.igst_amount,
        total_cgst = total_cgst + NEW.cgst_amount,
        total_sgst = total_sgst + NEW.sgst_amount,
        total_cess = total_cess + NEW.cess_amount,
        total_value = total_value + NEW.final_amount,
        total_invoices = total_invoices + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE gstr1_header_id = v_gstr1_header_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_populate_gstr1
    AFTER UPDATE OF invoice_status ON sales.invoices
    FOR EACH ROW
    WHEN (NEW.invoice_status = 'posted')
    EXECUTE FUNCTION populate_gstr1_on_invoice();

-- =============================================
-- 3. GSTR-2A RECONCILIATION
-- =============================================
CREATE OR REPLACE FUNCTION reconcile_gstr2a_with_purchases()
RETURNS TRIGGER AS $$
DECLARE
    v_matched_invoice RECORD;
    v_tolerance NUMERIC := 10; -- Rs 10 tolerance
    v_mismatch_type TEXT;
BEGIN
    -- Try to match with supplier invoices
    FOR v_matched_invoice IN
        SELECT 
            si.supplier_invoice_id,
            si.supplier_invoice_number,
            si.invoice_total,
            si.taxable_amount,
            si.igst_amount + si.cgst_amount + si.sgst_amount as total_gst,
            s.gst_number
        FROM procurement.supplier_invoices si
        JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
        WHERE si.org_id = NEW.org_id
        AND s.gst_number = NEW.supplier_gstn
        AND si.invoice_date BETWEEN NEW.invoice_date - INTERVAL '30 days' 
                                 AND NEW.invoice_date + INTERVAL '30 days'
        AND ABS(si.invoice_total - NEW.total_value) <= v_tolerance
        AND si.gstr2a_matched = FALSE
    LOOP
        -- Check for mismatches
        v_mismatch_type := NULL;
        
        IF ABS(v_matched_invoice.taxable_amount - NEW.taxable_value) > v_tolerance THEN
            v_mismatch_type := 'taxable_value_mismatch';
        ELSIF ABS(v_matched_invoice.total_gst - (NEW.igst_amount + NEW.cgst_amount + NEW.sgst_amount)) > v_tolerance THEN
            v_mismatch_type := 'gst_amount_mismatch';
        END IF;
        
        -- Update reconciliation status
        NEW.reconciliation_status := CASE 
            WHEN v_mismatch_type IS NULL THEN 'matched'
            ELSE 'mismatched'
        END;
        NEW.matched_invoice_id := v_matched_invoice.supplier_invoice_id;
        NEW.mismatch_reason := v_mismatch_type;
        
        -- Update supplier invoice
        UPDATE procurement.supplier_invoices
        SET 
            gstr2a_matched = TRUE,
            gstr2a_reference_id = NEW.gstr2a_id,
            gstr2a_match_status = NEW.reconciliation_status,
            updated_at = CURRENT_TIMESTAMP
        WHERE supplier_invoice_id = v_matched_invoice.supplier_invoice_id;
        
        -- Create notification for mismatches
        IF v_mismatch_type IS NOT NULL THEN
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
                'GSTR-2A Mismatch',
                format('Invoice %s from %s has %s. Portal: ₹%s, Books: ₹%s',
                    v_matched_invoice.supplier_invoice_number,
                    NEW.supplier_name,
                    REPLACE(v_mismatch_type, '_', ' '),
                    NEW.total_value,
                    v_matched_invoice.invoice_total),
                'high',
                jsonb_build_object(
                    'gstr2a_id', NEW.gstr2a_id,
                    'invoice_id', v_matched_invoice.supplier_invoice_id,
                    'mismatch_type', v_mismatch_type,
                    'portal_value', NEW.total_value,
                    'book_value', v_matched_invoice.invoice_total
                )
            );
        END IF;
        
        EXIT; -- Match only once
    END LOOP;
    
    -- If no match found
    IF NEW.matched_invoice_id IS NULL THEN
        NEW.reconciliation_status := 'unmatched';
        
        -- Create alert for unmatched invoice
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
            'error',
            'gst',
            'Unmatched GSTR-2A Entry',
            format('Invoice %s from %s (₹%s) not found in purchase records',
                NEW.invoice_number,
                NEW.supplier_name,
                NEW.total_value),
            'high',
            jsonb_build_object(
                'gstr2a_id', NEW.gstr2a_id,
                'supplier_gstn', NEW.supplier_gstn,
                'invoice_number', NEW.invoice_number,
                'invoice_date', NEW.invoice_date,
                'amount', NEW.total_value
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reconcile_gstr2a
    BEFORE INSERT OR UPDATE ON gst.gstr2a_data
    FOR EACH ROW
    EXECUTE FUNCTION reconcile_gstr2a_with_purchases();

-- =============================================
-- 4. E-WAY BILL GENERATION
-- =============================================
CREATE OR REPLACE FUNCTION generate_eway_bill_on_dispatch()
RETURNS TRIGGER AS $$
DECLARE
    v_distance NUMERIC;
    v_validity_days INTEGER;
    v_hsn_summary JSONB;
    v_total_value NUMERIC;
    v_vehicle RECORD;
BEGIN
    -- Check if e-way bill required (>50,000 value)
    SELECT final_amount INTO v_total_value
    FROM sales.invoices
    WHERE invoice_id = NEW.invoice_id;
    
    IF v_total_value < 50000 THEN
        RETURN NEW;
    END IF;
    
    -- Get distance from pincode master
    SELECT 
        pm.distance_km
    INTO v_distance
    FROM parties.customers c
    JOIN master.addresses a ON a.entity_id = c.customer_id AND a.entity_type = 'customer'
    JOIN gst.pincode_master pm ON pm.pincode = a.pincode
    WHERE c.customer_id = (SELECT customer_id FROM sales.invoices WHERE invoice_id = NEW.invoice_id)
    AND a.address_type = 'shipping'
    AND a.is_default = TRUE;
    
    -- Default distance if not found
    v_distance := COALESCE(v_distance, 100);
    
    -- Calculate validity (1 day per 100km)
    v_validity_days := GREATEST(1, CEIL(v_distance / 100.0));
    
    -- Get HSN summary
    SELECT jsonb_agg(
        jsonb_build_object(
            'hsn_code', hsn_code,
            'description', product_description,
            'quantity', SUM(quantity),
            'taxable_value', SUM(taxable_amount)
        )
    )
    INTO v_hsn_summary
    FROM sales.invoice_items
    WHERE invoice_id = NEW.invoice_id
    GROUP BY hsn_code, product_description;
    
    -- Get vehicle details
    SELECT * INTO v_vehicle
    FROM master.vehicles
    WHERE vehicle_id = NEW.vehicle_id;
    
    -- Create e-way bill
    INSERT INTO gst.eway_bills (
        org_id,
        branch_id,
        reference_type,
        reference_id,
        supply_type,
        sub_type,
        document_type,
        document_number,
        document_date,
        from_gstin,
        from_name,
        from_address,
        from_pincode,
        from_state_code,
        to_gstin,
        to_name,
        to_address,
        to_pincode,
        to_state_code,
        hsn_details,
        total_value,
        taxable_value,
        igst_amount,
        cgst_amount,
        sgst_amount,
        cess_amount,
        transport_mode,
        transport_distance,
        vehicle_number,
        vehicle_type,
        transporter_id,
        transporter_name,
        valid_from,
        valid_until,
        created_by
    )
    SELECT 
        i.org_id,
        i.branch_id,
        'invoice',
        i.invoice_id,
        'outward',
        'supply',
        'INV',
        i.invoice_number,
        i.invoice_date,
        b.gst_number,
        o.organization_name,
        b.address,
        b.pincode,
        SUBSTRING(b.gst_number FROM 1 FOR 2),
        c.gst_number,
        c.customer_name,
        ca.address_line_1 || ', ' || ca.city || ', ' || ca.state,
        ca.pincode,
        SUBSTRING(COALESCE(c.gst_number, ca.state_code) FROM 1 FOR 2),
        v_hsn_summary,
        i.final_amount,
        i.taxable_amount,
        i.igst_amount,
        i.cgst_amount,
        i.sgst_amount,
        i.cess_amount,
        CASE 
            WHEN v_vehicle.vehicle_id IS NOT NULL THEN 'road'
            ELSE 'road'
        END,
        v_distance,
        v_vehicle.registration_number,
        v_vehicle.vehicle_type,
        NEW.transporter_id,
        t.transporter_name,
        NEW.dispatch_date,
        NEW.dispatch_date + (v_validity_days || ' days')::INTERVAL,
        NEW.dispatched_by
    FROM sales.invoices i
    JOIN master.branches b ON i.branch_id = b.branch_id
    JOIN master.organizations o ON i.org_id = o.org_id
    JOIN parties.customers c ON i.customer_id = c.customer_id
    JOIN master.addresses ca ON ca.entity_id = c.customer_id 
        AND ca.entity_type = 'customer' 
        AND ca.address_type = 'shipping'
        AND ca.is_default = TRUE
    LEFT JOIN parties.transporters t ON t.transporter_id = NEW.transporter_id
    WHERE i.invoice_id = NEW.invoice_id;
    
    -- Generate e-way bill number (simulation - actual would call API)
    UPDATE gst.eway_bills
    SET 
        eway_bill_number = 'EWB' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || 
            LPAD(nextval('gst.eway_bill_sequence')::TEXT, 8, '0'),
        generation_status = 'generated',
        generated_at = CURRENT_TIMESTAMP
    WHERE reference_id = NEW.invoice_id
    AND reference_type = 'invoice'
    AND generation_status = 'draft';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_eway_bill
    AFTER UPDATE OF challan_status ON sales.delivery_challans
    FOR EACH ROW
    WHEN (NEW.challan_status = 'dispatched')
    EXECUTE FUNCTION generate_eway_bill_on_dispatch();

-- =============================================
-- 5. GST RATE CHANGE TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_gst_rate_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_old_rate NUMERIC;
    v_products_affected INTEGER;
BEGIN
    v_old_rate := OLD.gst_percentage;
    
    -- Count affected products
    SELECT COUNT(*)
    INTO v_products_affected
    FROM inventory.products
    WHERE hsn_code = NEW.hsn_code;
    
    -- Log rate change
    INSERT INTO gst.rate_change_history (
        hsn_code,
        old_rate,
        new_rate,
        effective_from,
        notification_number,
        products_affected,
        created_by
    ) VALUES (
        NEW.hsn_code,
        v_old_rate,
        NEW.gst_percentage,
        NEW.effective_from,
        NEW.notification_reference,
        v_products_affected,
        NEW.updated_by
    );
    
    -- Update products with new rate
    UPDATE inventory.products
    SET 
        gst_percentage = NEW.gst_percentage,
        updated_at = CURRENT_TIMESTAMP
    WHERE hsn_code = NEW.hsn_code;
    
    -- Create notification for rate change
    IF v_products_affected > 0 THEN
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            requires_acknowledgment,
            notification_data
        ) VALUES (
            1, -- System-wide notification
            'warning',
            'gst',
            'GST Rate Change Alert',
            format('GST rate for HSN %s changed from %s%% to %s%%. %s products affected.',
                NEW.hsn_code,
                v_old_rate,
                NEW.gst_percentage,
                v_products_affected),
            'urgent',
            TRUE,
            jsonb_build_object(
                'hsn_code', NEW.hsn_code,
                'old_rate', v_old_rate,
                'new_rate', NEW.gst_percentage,
                'products_affected', v_products_affected,
                'effective_from', NEW.effective_from
            )
        );
        
        -- Update pending orders
        UPDATE sales.order_items oi
        SET 
            needs_repricing = TRUE,
            updated_at = CURRENT_TIMESTAMP
        FROM inventory.products p
        WHERE oi.product_id = p.product_id
        AND p.hsn_code = NEW.hsn_code
        AND oi.item_status = 'pending';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_gst_rate_changes
    AFTER UPDATE OF igst_rate, cgst_rate, sgst_rate ON gst.hsn_sac_codes
    FOR EACH ROW
    WHEN (NEW.igst_rate != OLD.igst_rate OR NEW.cgst_rate != OLD.cgst_rate OR NEW.sgst_rate != OLD.sgst_rate)
    EXECUTE FUNCTION track_gst_rate_changes();

-- =============================================
-- 6. GSTR-3B AUTO-COMPUTATION
-- =============================================
CREATE OR REPLACE FUNCTION compute_gstr3b_summary()
RETURNS TRIGGER AS $$
DECLARE
    v_outward_supplies RECORD;
    v_inward_supplies RECORD;
    v_itc_summary RECORD;
BEGIN
    -- Calculate outward supplies
    SELECT 
        SUM(CASE WHEN igst_amount > 0 THEN taxable_amount ELSE 0 END) as interstate_taxable,
        SUM(CASE WHEN cgst_amount > 0 THEN taxable_amount ELSE 0 END) as intrastate_taxable,
        SUM(igst_amount) as total_igst,
        SUM(cgst_amount) as total_cgst,
        SUM(sgst_amount) as total_sgst,
        SUM(cess_amount) as total_cess
    INTO v_outward_supplies
    FROM sales.invoices
    WHERE org_id = NEW.org_id
    AND branch_id = NEW.branch_id
    AND invoice_status = 'posted'
    AND TO_CHAR(invoice_date, 'MMYYYY') = NEW.return_period;
    
    -- Calculate ITC
    SELECT 
        SUM(CASE WHEN itc_eligibility = 'eligible' THEN igst_amount ELSE 0 END) as eligible_igst,
        SUM(CASE WHEN itc_eligibility = 'eligible' THEN cgst_amount ELSE 0 END) as eligible_cgst,
        SUM(CASE WHEN itc_eligibility = 'eligible' THEN sgst_amount ELSE 0 END) as eligible_sgst,
        SUM(CASE WHEN itc_eligibility = 'ineligible' THEN 
            igst_amount + cgst_amount + sgst_amount ELSE 0 END) as ineligible_itc
    INTO v_itc_summary
    FROM procurement.supplier_invoices
    WHERE org_id = NEW.org_id
    AND TO_CHAR(invoice_date, 'MMYYYY') = NEW.return_period
    AND invoice_status = 'approved';
    
    -- Update GSTR-3B summary
    UPDATE gst.gstr3b_data
    SET 
        -- 3.1 Outward supplies
        outward_taxable_supplies = v_outward_supplies.interstate_taxable + 
                                   v_outward_supplies.intrastate_taxable,
        outward_taxable_zero_rated = 0, -- Exports
        outward_taxable_exempted = 0,
        outward_taxable_reverse_charge = 0,
        
        -- Tax payable
        igst_payable = v_outward_supplies.total_igst,
        cgst_payable = v_outward_supplies.total_cgst,
        sgst_payable = v_outward_supplies.total_sgst,
        cess_payable = v_outward_supplies.total_cess,
        
        -- 4. ITC
        itc_igst = v_itc_summary.eligible_igst,
        itc_cgst = v_itc_summary.eligible_cgst,
        itc_sgst = v_itc_summary.eligible_sgst,
        itc_cess = 0,
        
        -- Net liability
        igst_liability = GREATEST(0, v_outward_supplies.total_igst - v_itc_summary.eligible_igst),
        cgst_liability = GREATEST(0, v_outward_supplies.total_cgst - v_itc_summary.eligible_cgst),
        sgst_liability = GREATEST(0, v_outward_supplies.total_sgst - v_itc_summary.eligible_sgst),
        
        computation_status = 'computed',
        computed_at = CURRENT_TIMESTAMP
    WHERE gstr3b_header_id = NEW.gstr3b_header_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_compute_gstr3b
    AFTER UPDATE OF filing_status ON gst.gstr3b_data
    FOR EACH ROW
    WHEN (NEW.filing_status = 'computing')
    EXECUTE FUNCTION compute_gstr3b_summary();

-- =============================================
-- 7. TDS COMPLIANCE TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION calculate_tds_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_tds_rate NUMERIC;
    v_tds_section TEXT;
    v_pan_number TEXT;
    v_threshold_limit NUMERIC;
    v_yearly_payments NUMERIC;
BEGIN
    -- Only for supplier payments
    IF NEW.payment_type != 'payment' OR NEW.party_type != 'supplier' THEN
        RETURN NEW;
    END IF;
    
    -- Get supplier TDS details
    SELECT 
        s.pan_number,
        tc.tds_rate,
        tc.section_code,
        tc.threshold_limit
    INTO v_pan_number, v_tds_rate, v_tds_section, v_threshold_limit
    FROM parties.suppliers s
    LEFT JOIN gst.tds_categories tc ON s.tds_category_id = tc.category_id
    WHERE s.supplier_id = NEW.party_id;
    
    -- Check if PAN available
    IF v_pan_number IS NULL OR v_pan_number = '' THEN
        v_tds_rate := COALESCE(v_tds_rate, 0) * 2; -- Double rate for no PAN
        
        -- Create alert
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
            'compliance',
            'Missing PAN - Higher TDS',
            format('TDS deducted at %s%% due to missing PAN for supplier payment ₹%s',
                v_tds_rate,
                NEW.payment_amount),
            'high',
            jsonb_build_object(
                'payment_id', NEW.payment_id,
                'supplier_id', NEW.party_id,
                'payment_amount', NEW.payment_amount,
                'tds_rate', v_tds_rate
            )
        );
    END IF;
    
    -- Check threshold limit
    SELECT COALESCE(SUM(payment_amount), 0)
    INTO v_yearly_payments
    FROM financial.payments
    WHERE party_id = NEW.party_id
    AND party_type = 'supplier'
    AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM NEW.payment_date)
    AND payment_status IN ('processed', 'cleared');
    
    -- Apply TDS if threshold crossed
    IF v_yearly_payments + NEW.payment_amount > COALESCE(v_threshold_limit, 0) THEN
        NEW.tds_amount := ROUND(NEW.payment_amount * v_tds_rate / 100, 0);
        NEW.tds_section := v_tds_section;
        NEW.net_payment_amount := NEW.payment_amount - NEW.tds_amount;
        
        -- Create TDS entry
        INSERT INTO gst.gst_liability (
            org_id,
            payment_id,
            party_type,
            party_id,
            pan_number,
            section_code,
            payment_date,
            gross_amount,
            tds_rate,
            tds_amount,
            net_amount,
            created_by
        ) VALUES (
            NEW.org_id,
            NEW.payment_id,
            'supplier',
            NEW.party_id,
            v_pan_number,
            v_tds_section,
            NEW.payment_date,
            NEW.payment_amount,
            v_tds_rate,
            NEW.tds_amount,
            NEW.net_payment_amount,
            NEW.created_by
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_tds
    BEFORE INSERT OR UPDATE OF payment_amount ON financial.payments
    FOR EACH ROW
    WHEN (NEW.payment_status = 'approved')
    EXECUTE FUNCTION calculate_tds_on_payment();

-- =============================================
-- 8. GST AUDIT TRAIL
-- =============================================
CREATE OR REPLACE FUNCTION maintain_gst_audit_trail()
RETURNS TRIGGER AS $$
BEGIN
    -- Log all changes to GST-related tables
    INSERT INTO gst.gst_audit_trail (
        org_id,
        table_name,
        operation_type,
        record_id,
        old_values,
        new_values,
        changed_by,
        change_timestamp,
        ip_address,
        user_agent
    ) VALUES (
        COALESCE(NEW.org_id, OLD.org_id),
        TG_TABLE_NAME,
        TG_OP,
        COALESCE(NEW.invoice_id, OLD.invoice_id, 
                 NEW.gstr1_header_id, OLD.gstr1_header_id,
                 NEW.gstr3b_header_id, OLD.gstr3b_header_id),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        COALESCE(NEW.created_by, NEW.updated_by, OLD.created_by),
        CURRENT_TIMESTAMP,
        current_setting('request.headers')::json->>'x-forwarded-for',
        current_setting('request.headers')::json->>'user-agent'
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to critical GST tables
CREATE TRIGGER trigger_audit_gstr1
    AFTER INSERT OR UPDATE OR DELETE ON gst.gstr1_data
    FOR EACH ROW
    EXECUTE FUNCTION maintain_gst_audit_trail();

CREATE TRIGGER trigger_audit_gstr3b
    AFTER INSERT OR UPDATE OR DELETE ON gst.gstr3b_data
    FOR EACH ROW
    EXECUTE FUNCTION maintain_gst_audit_trail();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_hsn_codes_active ON gst.hsn_sac_codes(code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_gstr1_period ON gst.gstr1_data(return_period, org_id);
CREATE INDEX IF NOT EXISTS idx_gstr2a_reconciliation ON gst.gstr2a_data(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_eway_bills_reference ON gst.eway_bills(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_gst_liability_period ON gst.gst_liability(tax_period, org_id);
CREATE INDEX IF NOT EXISTS idx_gst_audit_trail_activity ON gst.gst_audit_trail(activity_date, activity_type);

-- Add comments
COMMENT ON FUNCTION calculate_gst_on_invoice_item() IS 'Calculates GST based on interstate/intrastate rules';
COMMENT ON FUNCTION populate_gstr1_on_invoice() IS 'Auto-populates GSTR-1 return from invoices';
COMMENT ON FUNCTION reconcile_gstr2a_with_purchases() IS 'Matches GSTR-2A data with purchase invoices';
COMMENT ON FUNCTION generate_eway_bill_on_dispatch() IS 'Generates e-way bill for dispatched goods';
COMMENT ON FUNCTION compute_gstr3b_summary() IS 'Computes GSTR-3B summary from transactions';