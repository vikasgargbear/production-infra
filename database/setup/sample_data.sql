-- Sample supplier invoices for GST testing
-- These are sample purchase invoices to demonstrate input tax credit calculation

-- First ensure we have a supplier
INSERT INTO parties.suppliers (
    org_id, supplier_name, supplier_code, contact_person,
    phone, email, gst_number, pan_number,
    address_line_1, city, state_id, pincode,
    credit_period_days, credit_limit, supplier_status,
    created_by
) VALUES (
    '39217550-4f0f-4e5e-b831-821fd8a3c96e',
    'ABC Pharmaceuticals Pvt Ltd',
    'SUPP001',
    'Mr. Rajesh Kumar',
    '9876543210',
    'rajesh@abcpharma.com',
    '29AABCA1234B1Z5',
    'AABCA1234B',
    '123, Industrial Area',
    'Bangalore',
    19,
    '560001',
    30,
    500000.00,
    'active',
    1
) ON CONFLICT (org_id, supplier_code) DO UPDATE
SET supplier_name = EXCLUDED.supplier_name,
    gst_number = EXCLUDED.gst_number;

-- Get the supplier ID
DO $$
DECLARE
    v_supplier_id INTEGER;
    v_branch_id INTEGER := 1;
    v_org_id UUID := '39217550-4f0f-4e5e-b831-821fd8a3c96e';
BEGIN
    -- Get supplier ID
    SELECT supplier_id INTO v_supplier_id
    FROM parties.suppliers
    WHERE org_id = v_org_id AND supplier_code = 'SUPP001';

    -- Insert sample supplier invoices for September 2025
    INSERT INTO procurement.supplier_invoices (
        org_id, branch_id, supplier_invoice_number, invoice_date,
        supplier_id, subtotal_amount, discount_amount, taxable_amount,
        cgst_amount, sgst_amount, igst_amount, cess_amount,
        tax_amount, invoice_total, payment_status, paid_amount,
        itc_eligible, gstr2a_matched, invoice_status, created_by
    ) VALUES
    -- Invoice 1: CGST + SGST (Same state)
    (
        v_org_id, v_branch_id, 'INV-2025-001', '2025-09-05',
        v_supplier_id, 100000.00, 0, 100000.00,
        9000.00, 9000.00, 0, 0,
        18000.00, 118000.00, 'paid', 118000.00,
        true, false, 'approved', 1
    ),
    -- Invoice 2: IGST (Inter-state)
    (
        v_org_id, v_branch_id, 'INV-2025-002', '2025-09-10',
        v_supplier_id, 50000.00, 0, 50000.00,
        0, 0, 9000.00, 0,
        9000.00, 59000.00, 'paid', 59000.00,
        true, false, 'approved', 1
    ),
    -- Invoice 3: Mixed GST rates
    (
        v_org_id, v_branch_id, 'INV-2025-003', '2025-09-15',
        v_supplier_id, 75000.00, 0, 75000.00,
        6750.00, 6750.00, 0, 0,
        13500.00, 88500.00, 'partial', 50000.00,
        true, false, 'approved', 1
    ),
    -- Invoice 4: With discount
    (
        v_org_id, v_branch_id, 'INV-2025-004', '2025-09-18',
        v_supplier_id, 120000.00, 5000.00, 115000.00,
        10350.00, 10350.00, 0, 0,
        20700.00, 135700.00, 'pending', 0,
        true, false, 'approved', 1
    ),
    -- Invoice 5: August invoice
    (
        v_org_id, v_branch_id, 'INV-2025-005', '2025-08-25',
        v_supplier_id, 80000.00, 0, 80000.00,
        7200.00, 7200.00, 0, 0,
        14400.00, 94400.00, 'paid', 94400.00,
        true, true, 'approved', 1
    ),
    -- Invoice 6: Not ITC eligible
    (
        v_org_id, v_branch_id, 'INV-2025-006', '2025-09-20',
        v_supplier_id, 30000.00, 0, 30000.00,
        2700.00, 2700.00, 0, 0,
        5400.00, 35400.00, 'paid', 35400.00,
        false, false, 'approved', 1
    );

    RAISE NOTICE 'Sample supplier invoices inserted successfully';
END $$;

-- Verify the data
SELECT
    supplier_invoice_number as "Invoice No",
    invoice_date as "Date",
    taxable_amount as "Taxable",
    cgst_amount as "CGST",
    sgst_amount as "SGST",
    igst_amount as "IGST",
    tax_amount as "Total Tax",
    invoice_total as "Total",
    itc_eligible as "ITC Eligible"
FROM procurement.supplier_invoices
WHERE org_id = '39217550-4f0f-4e5e-b831-821fd8a3c96e'
ORDER BY invoice_date DESC;