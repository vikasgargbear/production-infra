-- =============================================
-- INITIAL MASTER DATA SETUP
-- =============================================
-- Essential master data for system initialization
-- =============================================

-- =============================================
-- 1. DEFAULT ORGANIZATION
-- =============================================
INSERT INTO master.organizations (
    org_id,
    org_code,
    org_name,
    legal_name,
    business_type,
    gst_number,
    pan_number,
    drug_license_number,
    drug_license_validity,
    registered_address,
    contact_numbers,
    email_addresses,
    is_active,
    created_at
) VALUES (
    gen_random_uuid(),
    'DEMO001',
    'Demo Pharma Pvt Ltd',
    'Demo Pharmaceutical Private Limited',
    'pharmaceutical_distributor',
    '27AABCD1234E1ZX',
    'AABCD1234E',
    'MH-12345-2024',
    '2026-12-31',
    jsonb_build_object(
        'line1', '123 Industrial Area',
        'line2', 'Phase II',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pin', '400001'
    ),
    jsonb_build_object(
        'primary', '+91-22-12345678',
        'secondary', '+91-22-12345679'
    ),
    jsonb_build_object(
        'primary', 'info@demopharma.com',
        'sales', 'sales@demopharma.com'
    ),
    TRUE,
    CURRENT_TIMESTAMP
) ON CONFLICT (org_code) DO NOTHING;

-- =============================================
-- 2. DEFAULT BRANCHES
-- =============================================
INSERT INTO master.org_branches (
    org_id,
    branch_code,
    branch_name,
    branch_type,
    branch_gst_number,
    drug_license_number,
    drug_license_validity,
    address,
    branch_phone,
    branch_email,
    is_active,
    created_at
) VALUES 
(
    (SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'),
    'HO',
    'Head Office',
    'warehouse',
    '27AABCD1234E1ZX',
    'MH-12345-2024',
    '2026-12-31',
    jsonb_build_object(
        'line1', '123 Industrial Area',
        'line2', 'Phase II',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'pin', '400001',
        'country', 'India'
    ),
    '+91-22-12345678',
    'headoffice@demopharma.com',
    TRUE,
    CURRENT_TIMESTAMP
),
(
    (SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'),
    'WH001',
    'Main Warehouse',
    'warehouse',
    '27AABCD1234E1ZX',
    'MH-12346-2024',
    '2026-12-31',
    jsonb_build_object(
        'line1', '456 Logistics Park',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'pin', '400002',
        'country', 'India'
    ),
    '+91-22-87654321',
    'warehouse@demopharma.com',
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (org_id, branch_code) DO NOTHING;

-- =============================================
-- 3. CHART OF ACCOUNTS
-- =============================================
-- First insert parent accounts
INSERT INTO financial.chart_of_accounts (
    org_id,
    account_code,
    account_name,
    account_type,
    parent_account_id,
    normal_balance,
    is_active
) VALUES
-- Root accounts with normal_balance
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '1000', 'Assets', 'asset', NULL, 'debit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '2000', 'Liabilities', 'liability', NULL, 'credit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '3000', 'Income', 'revenue', NULL, 'credit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '4000', 'Expenses', 'expense', NULL, 'debit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '5000', 'Equity', 'equity', NULL, 'credit', TRUE)
ON CONFLICT (org_id, account_code) DO NOTHING;

-- Then insert child accounts
INSERT INTO financial.chart_of_accounts (
    org_id,
    account_code,
    account_name,
    account_type,
    parent_account_id,
    normal_balance,
    is_active
) VALUES
-- Current Assets
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '1100', 'Current Assets', 'asset', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '1000'), 'debit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '1110', 'Cash & Bank', 'asset', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '1100'), 'debit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '1120', 'Accounts Receivable', 'asset', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '1100'), 'debit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '1130', 'Inventory', 'asset', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '1100'), 'debit', TRUE),
-- Current Liabilities
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '2100', 'Current Liabilities', 'liability', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '2000'), 'credit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '2110', 'Accounts Payable', 'liability', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '2100'), 'credit', TRUE),
-- Income accounts
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '3100', 'Sales Revenue', 'revenue', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '3000'), 'credit', TRUE),
-- Expense accounts
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '4100', 'Cost of Goods Sold', 'expense', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '4000'), 'debit', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), '4200', 'Operating Expenses', 'expense', 
 (SELECT account_id FROM financial.chart_of_accounts WHERE account_code = '4000'), 'debit', TRUE)
ON CONFLICT (org_id, account_code) DO NOTHING;

-- =============================================
-- 4. STORAGE LOCATIONS
-- =============================================
INSERT INTO inventory.storage_locations (
    org_id,
    branch_id,
    location_code,
    location_name,
    location_type,
    parent_location_id,
    storage_class,
    temperature_controlled,
    is_active
) VALUES
-- Head Office Locations
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 
 (SELECT branch_id FROM master.org_branches WHERE branch_code = 'HO' AND org_id = (SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001')),
 'HO-GEN', 'General Storage', 'warehouse', NULL, 'general', FALSE, TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 
 (SELECT branch_id FROM master.org_branches WHERE branch_code = 'HO' AND org_id = (SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001')),
 'HO-COLD', 'Cold Storage', 'warehouse', NULL, 'cold', TRUE, TRUE),
-- Warehouse Locations  
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 
 (SELECT branch_id FROM master.org_branches WHERE branch_code = 'WH001' AND org_id = (SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001')),
 'WH-GEN', 'General Storage', 'warehouse', NULL, 'general', FALSE, TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 
 (SELECT branch_id FROM master.org_branches WHERE branch_code = 'WH001' AND org_id = (SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001')),
 'WH-COLD', 'Cold Storage', 'warehouse', NULL, 'cold', TRUE, TRUE)
ON CONFLICT (org_id, location_code) DO NOTHING;

-- =============================================
-- 5. GST HSN CODES (Common pharmaceutical)
-- =============================================
-- Note: We set IGST = total GST rate, CGST = SGST = half of total
-- The new gst_rate computed column will show the overall rate
INSERT INTO gst.hsn_sac_codes (
    code,
    code_type,
    description,
    igst_rate,
    cgst_rate,
    sgst_rate,
    is_active
) VALUES
('3004', 'hsn', 'Medicaments in measured doses', 12.00, 6.00, 6.00, TRUE),
('3003', 'hsn', 'Medicaments not in measured doses', 12.00, 6.00, 6.00, TRUE),
('3005', 'hsn', 'Wadding, gauze, bandages', 12.00, 6.00, 6.00, TRUE),
('3006', 'hsn', 'Pharmaceutical goods', 12.00, 6.00, 6.00, TRUE),
('3002', 'hsn', 'Blood, vaccines, toxins', 5.00, 2.50, 2.50, TRUE),
('2106', 'hsn', 'Food supplements', 18.00, 9.00, 9.00, TRUE),
('3307', 'hsn', 'Personal hygiene products', 18.00, 9.00, 9.00, TRUE)
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 6. SYSTEM SETTINGS
-- =============================================
INSERT INTO system_config.system_settings (
    org_id,
    setting_category,
    setting_key,
    setting_name,
    setting_value,
    setting_type,
    setting_scope,
    description
) VALUES
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'numbering', 'invoice.prefix', 'Invoice Prefix', 'INV', 'string', 'organization', 'Invoice number prefix'),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'numbering', 'order.prefix', 'Order Prefix', 'SO', 'string', 'organization', 'Sales order prefix'),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'numbering', 'po.prefix', 'PO Prefix', 'PO', 'string', 'organization', 'Purchase order prefix'),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'numbering', 'grn.prefix', 'GRN Prefix', 'GRN', 'string', 'organization', 'GRN number prefix'),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'inventory', 'inventory.valuation', 'Valuation Method', 'FIFO', 'string', 'organization', 'Inventory valuation method'),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'financial', 'financial.year.start', 'FY Start', '04-01', 'string', 'organization', 'Financial year start month-day')
ON CONFLICT (org_id, setting_category, setting_key, setting_scope) DO NOTHING;

-- =============================================
-- 7. NUMBER SERIES
-- =============================================
INSERT INTO master.number_series (
    org_id,
    document_type,
    series_code,
    prefix,
    current_number,
    suffix,
    is_active
) VALUES
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'invoice', 'INV-DEFAULT', 'INV', 1, '/24-25', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'sales_order', 'SO-DEFAULT', 'SO', 1, '/24-25', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'purchase_order', 'PO-DEFAULT', 'PO', 1, '/24-25', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'grn', 'GRN-DEFAULT', 'GRN', 1, '/24-25', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'payment', 'PMT-DEFAULT', 'PMT', 1, '/24-25', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'receipt', 'RCT-DEFAULT', 'RCT', 1, '/24-25', TRUE)
ON CONFLICT (org_id, document_type, series_code) DO NOTHING;

-- =============================================
-- 8. DEPARTMENTS
-- =============================================
INSERT INTO master.departments (
    org_id,
    department_code,
    department_name,
    is_active
) VALUES
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'SALES', 'Sales Department', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'PURCH', 'Purchase Department', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'FIN', 'Finance Department', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'WH', 'Warehouse Department', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'QA', 'Quality Assurance', TRUE)
ON CONFLICT (org_id, department_code) DO NOTHING;

-- =============================================
-- 9. ROLES
-- =============================================
INSERT INTO master.roles (
    org_id,
    role_code,
    role_name,
    is_active
) VALUES
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'ADMIN', 'Administrator', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'MGR', 'Manager', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'SALES', 'Sales Executive', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'PURCH', 'Purchase Executive', TRUE),
((SELECT org_id FROM master.organizations WHERE org_code = 'DEMO001'), 'WH', 'Warehouse Staff', TRUE)
ON CONFLICT (org_id, role_code) DO NOTHING;

-- =============================================
-- 10. FINAL STATUS CHECK
-- =============================================
DO $$
DECLARE
    v_org_count INTEGER;
    v_branch_count INTEGER;
    v_coa_count INTEGER;
    v_location_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_org_count FROM master.organizations WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v_branch_count FROM master.org_branches WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v_coa_count FROM financial.chart_of_accounts WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v_location_count FROM inventory.storage_locations WHERE is_active = TRUE;
    
    RAISE NOTICE 'Active Organizations: %', v_org_count;
    RAISE NOTICE 'Active Branches: %', v_branch_count;
    RAISE NOTICE 'Active Chart of Accounts: %', v_coa_count;
    RAISE NOTICE 'Active Storage Locations: %', v_location_count;
    
    IF v_org_count = 0 THEN
        RAISE WARNING 'No active organizations found!';
    END IF;
    
    IF v_branch_count = 0 THEN
        RAISE WARNING 'No active branches found!';
    END IF;
END;
$$;

-- Display summary
SELECT 'Master Data Load Complete' as status;
SELECT 'Organizations' as entity, COUNT(*) as count FROM master.organizations WHERE is_active = TRUE
UNION ALL
SELECT 'Branches', COUNT(*) FROM master.org_branches WHERE is_active = TRUE
UNION ALL
SELECT 'Departments', COUNT(*) FROM master.departments WHERE is_active = TRUE
UNION ALL
SELECT 'Roles', COUNT(*) FROM master.roles WHERE is_active = TRUE
UNION ALL
SELECT 'Storage Locations', COUNT(*) FROM inventory.storage_locations WHERE is_active = TRUE
UNION ALL
SELECT 'Chart of Accounts', COUNT(*) FROM financial.chart_of_accounts WHERE is_active = TRUE
UNION ALL
SELECT 'HSN Codes', COUNT(*) FROM gst.hsn_sac_codes WHERE is_active = TRUE
UNION ALL
SELECT 'System Settings', COUNT(*) FROM system_config.system_settings
ORDER BY entity;