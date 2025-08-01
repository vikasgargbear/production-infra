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
    company_name,
    legal_name,
    company_type,
    gstin,
    pan_number,
    drug_license_number,
    registered_address,
    is_active,
    created_at
) VALUES (
    1,
    'Demo Pharma Pvt Ltd',
    'Demo Pharmaceutical Private Limited',
    'pharmaceutical_manufacturer',
    '27AABCD1234E1ZX',
    'AABCD1234E',
    'MH-12345-2024',
    jsonb_build_object(
        'address_line1', '123 Industrial Area',
        'address_line2', 'Phase II',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400001'
    ),
    TRUE,
    CURRENT_TIMESTAMP
) ON CONFLICT (org_id) DO NOTHING;

-- =============================================
-- 2. DEFAULT BRANCHES
-- =============================================
INSERT INTO master.branches (
    branch_id,
    org_id,
    branch_code,
    branch_name,
    branch_type,
    gstin,
    address,
    is_head_office,
    is_active,
    created_at
) VALUES 
(
    1,
    1,
    'HO',
    'Head Office - Mumbai',
    'head_office',
    '27AABCD1234E1ZX',
    jsonb_build_object(
        'address_line1', '123 Industrial Area',
        'address_line2', 'Phase II',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400001'
    ),
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    2,
    1,
    'WH-MUM',
    'Mumbai Warehouse',
    'warehouse',
    '27AABCD1234E2ZX',
    jsonb_build_object(
        'address_line1', '456 Logistics Park',
        'address_line2', 'MIDC',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400002'
    ),
    FALSE,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    3,
    1,
    'RT-MUM',
    'Mumbai Retail Store',
    'retail_store',
    '27AABCD1234E3ZX',
    jsonb_build_object(
        'address_line1', '789 Main Street',
        'address_line2', 'Bandra West',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400050'
    ),
    FALSE,
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (branch_id) DO NOTHING;

-- =============================================
-- 3. PRODUCT CATEGORIES
-- =============================================
INSERT INTO master.product_categories (
    category_id,
    category_name,
    category_code,
    parent_category_id,
    category_type,
    requires_prescription,
    requires_narcotic_license,
    is_active,
    created_at
) VALUES 
-- Main Categories
(1, 'Medicines', 'MED', NULL, 'primary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(2, 'Surgical', 'SUR', NULL, 'primary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(3, 'General', 'GEN', NULL, 'primary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(4, 'Ayurvedic', 'AYU', NULL, 'primary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),

-- Medicine Subcategories
(11, 'Tablets', 'TAB', 1, 'secondary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(12, 'Capsules', 'CAP', 1, 'secondary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(13, 'Syrups', 'SYR', 1, 'secondary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(14, 'Injections', 'INJ', 1, 'secondary', TRUE, FALSE, TRUE, CURRENT_TIMESTAMP),
(15, 'Ointments', 'OIN', 1, 'secondary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(16, 'Drops', 'DRP', 1, 'secondary', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),

-- Prescription Categories
(21, 'Schedule H', 'SCH-H', 1, 'regulatory', TRUE, FALSE, TRUE, CURRENT_TIMESTAMP),
(22, 'Schedule H1', 'SCH-H1', 1, 'regulatory', TRUE, FALSE, TRUE, CURRENT_TIMESTAMP),
(23, 'Schedule X', 'SCH-X', 1, 'regulatory', TRUE, TRUE, TRUE, CURRENT_TIMESTAMP),
(24, 'OTC', 'OTC', 1, 'regulatory', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),

-- Therapeutic Categories
(31, 'Antibiotics', 'ANTI', 1, 'therapeutic', TRUE, FALSE, TRUE, CURRENT_TIMESTAMP),
(32, 'Analgesics', 'ANAL', 1, 'therapeutic', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(33, 'Antacids', 'ANTA', 1, 'therapeutic', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(34, 'Vitamins', 'VIT', 1, 'therapeutic', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(35, 'Cardiac', 'CARD', 1, 'therapeutic', TRUE, FALSE, TRUE, CURRENT_TIMESTAMP),
(36, 'Diabetic', 'DIAB', 1, 'therapeutic', TRUE, FALSE, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (category_id) DO NOTHING;

-- =============================================
-- 4. UNITS OF MEASUREMENT
-- =============================================
INSERT INTO master.units_of_measurement (
    uom_id,
    uom_code,
    uom_name,
    uom_type,
    conversion_factor,
    base_uom_id,
    is_active,
    created_at
) VALUES 
-- Base Units
(1, 'TAB', 'Tablet', 'count', 1, NULL, TRUE, CURRENT_TIMESTAMP),
(2, 'CAP', 'Capsule', 'count', 1, NULL, TRUE, CURRENT_TIMESTAMP),
(3, 'ML', 'Milliliter', 'volume', 1, NULL, TRUE, CURRENT_TIMESTAMP),
(4, 'GM', 'Gram', 'weight', 1, NULL, TRUE, CURRENT_TIMESTAMP),
(5, 'VIAL', 'Vial', 'count', 1, NULL, TRUE, CURRENT_TIMESTAMP),
(6, 'AMP', 'Ampoule', 'count', 1, NULL, TRUE, CURRENT_TIMESTAMP),
(7, 'TUBE', 'Tube', 'count', 1, NULL, TRUE, CURRENT_TIMESTAMP),
(8, 'BOTTLE', 'Bottle', 'count', 1, NULL, TRUE, CURRENT_TIMESTAMP),

-- Volume Units
(11, 'LTR', 'Liter', 'volume', 1000, 3, TRUE, CURRENT_TIMESTAMP),

-- Weight Units
(12, 'KG', 'Kilogram', 'weight', 1000, 4, TRUE, CURRENT_TIMESTAMP),
(13, 'MG', 'Milligram', 'weight', 0.001, 4, TRUE, CURRENT_TIMESTAMP),

-- Pack Units
(21, 'STRIP', 'Strip', 'pack', 10, 1, TRUE, CURRENT_TIMESTAMP),
(22, 'BOX', 'Box', 'pack', 100, 1, TRUE, CURRENT_TIMESTAMP),
(23, 'CASE', 'Case', 'pack', 1000, 1, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (uom_id) DO NOTHING;

-- =============================================
-- 5. PACK CONFIGURATIONS
-- =============================================
INSERT INTO master.pack_configurations (
    config_id,
    config_name,
    base_unit,
    pack_hierarchy,
    is_active,
    created_at
) VALUES 
(
    1,
    'Standard Tablet Pack',
    'TAB',
    jsonb_build_array(
        jsonb_build_object('level', 1, 'unit', 'TAB', 'quantity', 1, 'name', 'Tablet'),
        jsonb_build_object('level', 2, 'unit', 'STRIP', 'quantity', 10, 'name', 'Strip'),
        jsonb_build_object('level', 3, 'unit', 'BOX', 'quantity', 10, 'name', 'Box'),
        jsonb_build_object('level', 4, 'unit', 'CASE', 'quantity', 10, 'name', 'Case')
    ),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    2,
    'Standard Capsule Pack',
    'CAP',
    jsonb_build_array(
        jsonb_build_object('level', 1, 'unit', 'CAP', 'quantity', 1, 'name', 'Capsule'),
        jsonb_build_object('level', 2, 'unit', 'STRIP', 'quantity', 10, 'name', 'Strip'),
        jsonb_build_object('level', 3, 'unit', 'BOX', 'quantity', 10, 'name', 'Box'),
        jsonb_build_object('level', 4, 'unit', 'CASE', 'quantity', 10, 'name', 'Case')
    ),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    3,
    'Syrup Bottle Pack',
    'ML',
    jsonb_build_array(
        jsonb_build_object('level', 1, 'unit', 'ML', 'quantity', 1, 'name', 'ML'),
        jsonb_build_object('level', 2, 'unit', 'BOTTLE', 'quantity', 100, 'name', 'Bottle 100ml'),
        jsonb_build_object('level', 3, 'unit', 'BOX', 'quantity', 10, 'name', 'Box'),
        jsonb_build_object('level', 4, 'unit', 'CASE', 'quantity', 5, 'name', 'Case')
    ),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    4,
    'Injection Vial Pack',
    'ML',
    jsonb_build_array(
        jsonb_build_object('level', 1, 'unit', 'ML', 'quantity', 1, 'name', 'ML'),
        jsonb_build_object('level', 2, 'unit', 'VIAL', 'quantity', 10, 'name', 'Vial 10ml'),
        jsonb_build_object('level', 3, 'unit', 'BOX', 'quantity', 10, 'name', 'Box'),
        jsonb_build_object('level', 4, 'unit', 'CASE', 'quantity', 10, 'name', 'Case')
    ),
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (config_id) DO NOTHING;

-- =============================================
-- 6. CHART OF ACCOUNTS
-- =============================================
INSERT INTO financial.chart_of_accounts (
    account_id,
    account_code,
    account_name,
    account_type,
    account_category,
    parent_account_id,
    is_active,
    created_at
) VALUES 
-- Assets
(1000, '1000', 'Assets', 'asset', 'parent', NULL, TRUE, CURRENT_TIMESTAMP),
(1100, '1100', 'Current Assets', 'asset', 'parent', 1000, TRUE, CURRENT_TIMESTAMP),
(1110, '1110', 'Cash and Bank', 'asset', 'parent', 1100, TRUE, CURRENT_TIMESTAMP),
(1111, '1111', 'Cash in Hand', 'asset', 'detail', 1110, TRUE, CURRENT_TIMESTAMP),
(1112, '1112', 'Bank Accounts', 'asset', 'detail', 1110, TRUE, CURRENT_TIMESTAMP),
(1200, '1200', 'Accounts Receivable', 'asset', 'detail', 1100, TRUE, CURRENT_TIMESTAMP),
(1300, '1300', 'Inventory', 'asset', 'detail', 1100, TRUE, CURRENT_TIMESTAMP),

-- Liabilities
(2000, '2000', 'Liabilities', 'liability', 'parent', NULL, TRUE, CURRENT_TIMESTAMP),
(2100, '2100', 'Current Liabilities', 'liability', 'parent', 2000, TRUE, CURRENT_TIMESTAMP),
(2110, '2110', 'Accounts Payable', 'liability', 'detail', 2100, TRUE, CURRENT_TIMESTAMP),
(2120, '2120', 'GST Payable', 'liability', 'detail', 2100, TRUE, CURRENT_TIMESTAMP),

-- Equity
(3000, '3000', 'Equity', 'equity', 'parent', NULL, TRUE, CURRENT_TIMESTAMP),
(3100, '3100', 'Share Capital', 'equity', 'detail', 3000, TRUE, CURRENT_TIMESTAMP),
(3200, '3200', 'Retained Earnings', 'equity', 'detail', 3000, TRUE, CURRENT_TIMESTAMP),

-- Revenue
(4000, '4000', 'Revenue', 'revenue', 'parent', NULL, TRUE, CURRENT_TIMESTAMP),
(4100, '4100', 'Sales Revenue', 'revenue', 'detail', 4000, TRUE, CURRENT_TIMESTAMP),
(4200, '4200', 'Other Income', 'revenue', 'detail', 4000, TRUE, CURRENT_TIMESTAMP),

-- Expenses
(5000, '5000', 'Expenses', 'expense', 'parent', NULL, TRUE, CURRENT_TIMESTAMP),
(5100, '5100', 'Cost of Goods Sold', 'expense', 'detail', 5000, TRUE, CURRENT_TIMESTAMP),
(5200, '5200', 'Operating Expenses', 'expense', 'parent', 5000, TRUE, CURRENT_TIMESTAMP),
(5210, '5210', 'Salary and Wages', 'expense', 'detail', 5200, TRUE, CURRENT_TIMESTAMP),
(5220, '5220', 'Rent', 'expense', 'detail', 5200, TRUE, CURRENT_TIMESTAMP),
(5230, '5230', 'Utilities', 'expense', 'detail', 5200, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (account_id) DO NOTHING;

-- =============================================
-- 7. CUSTOMER CATEGORIES
-- =============================================
INSERT INTO parties.customer_categories (
    category_id,
    category_name,
    category_code,
    discount_percentage,
    credit_limit_default,
    payment_terms_default,
    is_active,
    created_at
) VALUES 
(1, 'Retail', 'RET', 5, 50000, '7days', TRUE, CURRENT_TIMESTAMP),
(2, 'Wholesale', 'WHL', 10, 200000, '30days', TRUE, CURRENT_TIMESTAMP),
(3, 'Hospital', 'HOS', 15, 500000, '45days', TRUE, CURRENT_TIMESTAMP),
(4, 'Pharmacy Chain', 'PHC', 12, 300000, '30days', TRUE, CURRENT_TIMESTAMP),
(5, 'Government', 'GOV', 8, 1000000, '60days', TRUE, CURRENT_TIMESTAMP),
(6, 'Walk-in', 'WIN', 0, 0, 'cash', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (category_id) DO NOTHING;

-- =============================================
-- 8. STORAGE LOCATIONS
-- =============================================
INSERT INTO inventory.storage_locations (
    location_id,
    branch_id,
    location_code,
    location_name,
    location_type,
    storage_class,
    temperature_range,
    is_sales_location,
    is_receiving_location,
    is_returns_location,
    is_active,
    created_at
) VALUES 
-- Head Office Locations
(1, 1, 'HO-DISP', 'Head Office Dispensary', 'dispensary', 'general', '15-25°C', TRUE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),

-- Warehouse Locations
(2, 2, 'WH-GEN-01', 'General Storage Area 1', 'warehouse', 'general', '15-25°C', FALSE, TRUE, FALSE, TRUE, CURRENT_TIMESTAMP),
(3, 2, 'WH-COLD-01', 'Cold Storage Area 1', 'warehouse', 'cold_storage', '2-8°C', FALSE, TRUE, FALSE, TRUE, CURRENT_TIMESTAMP),
(4, 2, 'WH-NAR-01', 'Narcotic Storage', 'warehouse', 'narcotic', '15-25°C', FALSE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(5, 2, 'WH-QRN-01', 'Quarantine Area', 'warehouse', 'quarantine', '15-25°C', FALSE, FALSE, TRUE, TRUE, CURRENT_TIMESTAMP),

-- Retail Store Locations
(6, 3, 'RT-DISP-01', 'Retail Dispensary', 'dispensary', 'general', '15-25°C', TRUE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(7, 3, 'RT-DISP-02', 'OTC Section', 'dispensary', 'general', '15-25°C', TRUE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP),
(8, 3, 'RT-COLD-01', 'Retail Cold Storage', 'dispensary', 'cold_storage', '2-8°C', TRUE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (location_id) DO NOTHING;

-- =============================================
-- 9. SYSTEM SETTINGS DEFINITIONS
-- =============================================
INSERT INTO system_config.setting_definitions (
    setting_key,
    setting_category,
    setting_type,
    default_value,
    description,
    is_required,
    is_encrypted,
    validation_rules,
    is_active
) VALUES 
-- General Settings
('company_financial_year_start', 'general', 'string', '"04-01"', 'Financial year start date (MM-DD)', TRUE, FALSE, '{"pattern": "^\\d{2}-\\d{2}$"}', TRUE),
('currency', 'general', 'string', '"INR"', 'Default currency', TRUE, FALSE, '{"enum": ["INR", "USD", "EUR"]}', TRUE),
('date_format', 'general', 'string', '"DD/MM/YYYY"', 'Date display format', TRUE, FALSE, '{"enum": ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]}', TRUE),

-- Inventory Settings
('enable_batch_tracking', 'inventory', 'boolean', 'true', 'Enable batch-wise inventory tracking', TRUE, FALSE, NULL, TRUE),
('enable_expiry_tracking', 'inventory', 'boolean', 'true', 'Enable expiry date tracking', TRUE, FALSE, NULL, TRUE),
('low_stock_alert_days', 'inventory', 'number', '15', 'Days of stock for low stock alert', TRUE, FALSE, '{"min": 1, "max": 90}', TRUE),
('enable_negative_stock', 'inventory', 'boolean', 'false', 'Allow negative stock', TRUE, FALSE, NULL, TRUE),

-- Sales Settings
('enable_credit_limit', 'sales', 'boolean', 'true', 'Enable customer credit limit checking', TRUE, FALSE, NULL, TRUE),
('default_payment_terms', 'sales', 'string', '"30days"', 'Default payment terms', TRUE, FALSE, '{"enum": ["cash", "7days", "15days", "30days", "45days", "60days"]}', TRUE),
('enable_sales_schemes', 'sales', 'boolean', 'true', 'Enable sales schemes and discounts', TRUE, FALSE, NULL, TRUE),
('invoice_prefix', 'sales', 'string', '"INV"', 'Invoice number prefix', TRUE, FALSE, '{"maxLength": 5}', TRUE),

-- GST Settings
('gst_enabled', 'gst', 'boolean', 'true', 'Enable GST calculations', TRUE, FALSE, NULL, TRUE),
('enable_eway_bill', 'gst', 'boolean', 'true', 'Enable e-way bill generation', TRUE, FALSE, NULL, TRUE),
('eway_bill_threshold', 'gst', 'number', '50000', 'E-way bill value threshold', TRUE, FALSE, '{"min": 0}', TRUE),

-- Compliance Settings
('narcotic_license_number', 'compliance', 'string', 'null', 'Narcotic license number', FALSE, FALSE, NULL, TRUE),
('enable_quality_checks', 'compliance', 'boolean', 'true', 'Enable quality check workflows', TRUE, FALSE, NULL, TRUE),
('password_expiry_days', 'compliance', 'number', '90', 'Password expiry in days', TRUE, FALSE, '{"min": 30, "max": 365}', TRUE),

-- Notification Settings
('enable_email_notifications', 'notifications', 'boolean', 'true', 'Enable email notifications', TRUE, FALSE, NULL, TRUE),
('enable_sms_notifications', 'notifications', 'boolean', 'false', 'Enable SMS notifications', TRUE, FALSE, NULL, TRUE),
('notification_email', 'notifications', 'string', 'null', 'Default notification email', FALSE, FALSE, '{"format": "email"}', TRUE)
ON CONFLICT (setting_key) DO NOTHING;

-- =============================================
-- 10. DEFAULT SYSTEM ROLES
-- =============================================
INSERT INTO system_config.roles (
    role_id,
    role_name,
    role_code,
    description,
    is_system_role,
    is_active,
    created_at
) VALUES 
(1, 'Super Admin', 'SUPER_ADMIN', 'Full system access', TRUE, TRUE, CURRENT_TIMESTAMP),
(2, 'Admin', 'ADMIN', 'Organization admin access', TRUE, TRUE, CURRENT_TIMESTAMP),
(3, 'Manager', 'MANAGER', 'Branch manager access', TRUE, TRUE, CURRENT_TIMESTAMP),
(4, 'Sales User', 'SALES_USER', 'Sales module access', TRUE, TRUE, CURRENT_TIMESTAMP),
(5, 'Purchase User', 'PURCHASE_USER', 'Purchase module access', TRUE, TRUE, CURRENT_TIMESTAMP),
(6, 'Inventory User', 'INVENTORY_USER', 'Inventory module access', TRUE, TRUE, CURRENT_TIMESTAMP),
(7, 'Accounts User', 'ACCOUNTS_USER', 'Finance module access', TRUE, TRUE, CURRENT_TIMESTAMP),
(8, 'Pharmacist', 'PHARMACIST', 'Dispensing and narcotic access', TRUE, TRUE, CURRENT_TIMESTAMP),
(9, 'Auditor', 'AUDITOR', 'Read-only audit access', TRUE, TRUE, CURRENT_TIMESTAMP),
(10, 'Report Viewer', 'REPORT_VIEWER', 'Reports and analytics access', TRUE, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (role_id) DO NOTHING;

-- =============================================
-- 11. DEFAULT PERMISSIONS
-- =============================================
INSERT INTO system_config.permissions (
    permission_id,
    permission_key,
    permission_name,
    module,
    description,
    is_active,
    created_at
) VALUES 
-- System Permissions
(1, 'system.manage_users', 'Manage Users', 'system', 'Create, update, delete users', TRUE, CURRENT_TIMESTAMP),
(2, 'system.manage_roles', 'Manage Roles', 'system', 'Create, update, delete roles', TRUE, CURRENT_TIMESTAMP),
(3, 'system.manage_settings', 'Manage Settings', 'system', 'Update system settings', TRUE, CURRENT_TIMESTAMP),
(4, 'system.view_audit_log', 'View Audit Log', 'system', 'View system audit logs', TRUE, CURRENT_TIMESTAMP),

-- Inventory Permissions
(11, 'inventory.view_products', 'View Products', 'inventory', 'View product catalog', TRUE, CURRENT_TIMESTAMP),
(12, 'inventory.manage_products', 'Manage Products', 'inventory', 'Create, update products', TRUE, CURRENT_TIMESTAMP),
(13, 'inventory.view_stock', 'View Stock', 'inventory', 'View stock levels', TRUE, CURRENT_TIMESTAMP),
(14, 'inventory.adjust_stock', 'Adjust Stock', 'inventory', 'Make stock adjustments', TRUE, CURRENT_TIMESTAMP),
(15, 'inventory.transfer_stock', 'Transfer Stock', 'inventory', 'Transfer between locations', TRUE, CURRENT_TIMESTAMP),

-- Sales Permissions
(21, 'sales.view_orders', 'View Orders', 'sales', 'View sales orders', TRUE, CURRENT_TIMESTAMP),
(22, 'sales.create_orders', 'Create Orders', 'sales', 'Create sales orders', TRUE, CURRENT_TIMESTAMP),
(23, 'sales.manage_invoices', 'Manage Invoices', 'sales', 'Create, edit invoices', TRUE, CURRENT_TIMESTAMP),
(24, 'sales.manage_returns', 'Manage Returns', 'sales', 'Process sales returns', TRUE, CURRENT_TIMESTAMP),
(25, 'sales.manage_schemes', 'Manage Schemes', 'sales', 'Create, update schemes', TRUE, CURRENT_TIMESTAMP),

-- Purchase Permissions
(31, 'purchase.view_orders', 'View Purchase Orders', 'purchase', 'View purchase orders', TRUE, CURRENT_TIMESTAMP),
(32, 'purchase.create_orders', 'Create Purchase Orders', 'purchase', 'Create purchase orders', TRUE, CURRENT_TIMESTAMP),
(33, 'purchase.approve_orders', 'Approve Purchase Orders', 'purchase', 'Approve purchase orders', TRUE, CURRENT_TIMESTAMP),
(34, 'purchase.manage_grn', 'Manage GRN', 'purchase', 'Create, approve GRN', TRUE, CURRENT_TIMESTAMP),

-- Finance Permissions
(41, 'finance.view_accounts', 'View Accounts', 'finance', 'View financial accounts', TRUE, CURRENT_TIMESTAMP),
(42, 'finance.manage_payments', 'Manage Payments', 'finance', 'Record payments', TRUE, CURRENT_TIMESTAMP),
(43, 'finance.manage_journals', 'Manage Journals', 'finance', 'Create journal entries', TRUE, CURRENT_TIMESTAMP),
(44, 'finance.view_reports', 'View Financial Reports', 'finance', 'View financial reports', TRUE, CURRENT_TIMESTAMP),

-- Compliance Permissions
(51, 'compliance.manage_licenses', 'Manage Licenses', 'compliance', 'Manage business licenses', TRUE, CURRENT_TIMESTAMP),
(52, 'compliance.manage_narcotics', 'Manage Narcotics', 'compliance', 'Narcotic register access', TRUE, CURRENT_TIMESTAMP),
(53, 'compliance.manage_quality', 'Manage Quality', 'compliance', 'Quality management', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (permission_id) DO NOTHING;

-- =============================================
-- 12. ROLE PERMISSIONS MAPPING
-- =============================================
-- Super Admin gets all permissions
INSERT INTO system_config.role_permissions (role_id, permission_id)
SELECT 1, permission_id FROM system_config.permissions
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Admin gets most permissions except system
INSERT INTO system_config.role_permissions (role_id, permission_id)
SELECT 2, permission_id FROM system_config.permissions
WHERE module != 'system' OR permission_key = 'system.view_audit_log'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Sales User permissions
INSERT INTO system_config.role_permissions (role_id, permission_id)
VALUES 
(4, 11), (4, 13), (4, 21), (4, 22), (4, 23), (4, 24)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Pharmacist permissions
INSERT INTO system_config.role_permissions (role_id, permission_id)
VALUES 
(8, 11), (8, 13), (8, 14), (8, 21), (8, 22), (8, 23), (8, 24), (8, 52)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================
-- 13. DEFAULT ADMIN USER
-- =============================================
INSERT INTO system_config.users (
    user_id,
    username,
    email,
    password_hash,
    full_name,
    user_type,
    is_active,
    created_at
) VALUES (
    1,
    'admin',
    'admin@demopharma.com',
    -- Password: Admin@123 (use proper hashing in production)
    encode(digest('Admin@123', 'sha256'), 'hex'),
    'System Administrator',
    'admin',
    TRUE,
    CURRENT_TIMESTAMP
) ON CONFLICT (user_id) DO NOTHING;

-- Assign Super Admin role
INSERT INTO system_config.user_roles (user_id, role_id, assigned_at, assigned_by)
VALUES (1, 1, CURRENT_TIMESTAMP, 0)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- =============================================
-- 14. DEFAULT TAX RATES
-- =============================================
INSERT INTO master.tax_rates (
    tax_rate_id,
    hsn_code,
    gst_percentage,
    igst_rate,
    cgst_rate,
    sgst_rate,
    effective_from,
    is_active,
    created_at
) VALUES 
(1, '3004', 12, 12, 6, 6, '2017-07-01', TRUE, CURRENT_TIMESTAMP),
(2, '3003', 12, 12, 6, 6, '2017-07-01', TRUE, CURRENT_TIMESTAMP),
(3, '3002', 5, 5, 2.5, 2.5, '2017-07-01', TRUE, CURRENT_TIMESTAMP),
(4, '9018', 12, 12, 6, 6, '2017-07-01', TRUE, CURRENT_TIMESTAMP),
(5, '3005', 12, 12, 6, 6, '2017-07-01', TRUE, CURRENT_TIMESTAMP),
(6, '3006', 12, 12, 6, 6, '2017-07-01', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (tax_rate_id) DO NOTHING;

-- =============================================
-- 15. SAMPLE NOTIFICATION TEMPLATES
-- =============================================
INSERT INTO system_config.notification_templates (
    template_id,
    template_name,
    template_type,
    subject,
    body,
    variables,
    is_active,
    created_at
) VALUES 
(
    1,
    'Low Stock Alert',
    'email',
    'Low Stock Alert - {{product_name}}',
    'Product: {{product_name}} ({{product_code}}) is running low on stock.\n\nCurrent Stock: {{current_stock}} {{unit}}\nReorder Level: {{reorder_level}} {{unit}}\n\nPlease initiate purchase order.',
    jsonb_build_array('product_name', 'product_code', 'current_stock', 'reorder_level', 'unit'),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    2,
    'License Expiry Alert',
    'email',
    'License Expiry Alert - {{license_type}}',
    'Your {{license_type}} (License No: {{license_number}}) is expiring on {{expiry_date}}.\n\nPlease initiate renewal process immediately.\n\nDays to expiry: {{days_to_expiry}}',
    jsonb_build_array('license_type', 'license_number', 'expiry_date', 'days_to_expiry'),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    3,
    'Order Confirmation',
    'email',
    'Order Confirmation - {{order_number}}',
    'Dear {{customer_name}},\n\nYour order {{order_number}} dated {{order_date}} has been confirmed.\n\nOrder Value: ₹{{order_value}}\nExpected Delivery: {{delivery_date}}\n\nThank you for your business!',
    jsonb_build_array('customer_name', 'order_number', 'order_date', 'order_value', 'delivery_date'),
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (template_id) DO NOTHING;

-- =============================================
-- SEQUENCE RESETS
-- =============================================
-- Reset sequences to ensure proper ID generation
SELECT setval('master.organizations_org_id_seq', 100, false);
SELECT setval('master.branches_branch_id_seq', 100, false);
SELECT setval('master.product_categories_category_id_seq', 100, false);
SELECT setval('inventory.products_product_id_seq', 1000, false);
SELECT setval('parties.customers_customer_id_seq', 1000, false);
SELECT setval('parties.suppliers_supplier_id_seq', 1000, false);
SELECT setval('sales.orders_order_id_seq', 1000, false);
SELECT setval('sales.invoices_invoice_id_seq', 1000, false);

-- =============================================
-- VERIFICATION
-- =============================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Verify critical data
    SELECT COUNT(*) INTO v_count FROM master.organizations WHERE is_active = TRUE;
    RAISE NOTICE 'Active Organizations: %', v_count;
    
    SELECT COUNT(*) INTO v_count FROM master.branches WHERE is_active = TRUE;
    RAISE NOTICE 'Active Branches: %', v_count;
    
    SELECT COUNT(*) INTO v_count FROM master.product_categories WHERE is_active = TRUE;
    RAISE NOTICE 'Product Categories: %', v_count;
    
    SELECT COUNT(*) INTO v_count FROM system_config.users WHERE is_active = TRUE;
    RAISE NOTICE 'Active Users: %', v_count;
    
    SELECT COUNT(*) INTO v_count FROM system_config.roles WHERE is_active = TRUE;
    RAISE NOTICE 'Active Roles: %', v_count;
    
    IF v_count = 0 THEN
        RAISE EXCEPTION 'Initial data setup failed - no active roles found';
    END IF;
END $$;