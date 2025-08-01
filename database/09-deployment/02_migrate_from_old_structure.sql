-- =============================================
-- MIGRATION SCRIPT FROM OLD TO NEW STRUCTURE
-- =============================================
-- Safely migrate data from existing tables to new structure
-- =============================================

-- Create migration schema for tracking
CREATE SCHEMA IF NOT EXISTS migration;

-- Migration status tracking
CREATE TABLE IF NOT EXISTS migration.migration_status (
    migration_id SERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    records_migrated INTEGER,
    status VARCHAR(50),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- =============================================
-- STEP 1: Backup existing data
-- =============================================
CREATE SCHEMA IF NOT EXISTS backup_old;

-- Function to backup a table
CREATE OR REPLACE FUNCTION migration.backup_table(p_table_name TEXT)
RETURNS VOID AS $$
BEGIN
    EXECUTE format('CREATE TABLE backup_old.%I AS SELECT * FROM %I', 
        p_table_name, p_table_name);
    
    INSERT INTO migration.migration_status (table_name, status)
    VALUES (p_table_name, 'backed_up');
END;
$$ LANGUAGE plpgsql;

-- Backup all existing tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'products', 'customers', 'suppliers', 'invoices', 
            'invoice_items', 'purchase_orders', 'users', 'roles'
        )
    LOOP
        PERFORM migration.backup_table(r.tablename);
    END LOOP;
END $$;

-- =============================================
-- STEP 2: Migrate Organizations
-- =============================================
INSERT INTO master.organizations (
    org_id,
    company_name,
    legal_name,
    company_type,
    gstin,
    registered_address,
    is_active,
    created_at
)
SELECT DISTINCT
    1, -- Single org for now
    'Migrated Organization',
    'Migrated Organization Legal Name',
    'pharmaceutical_retailer',
    NULL, -- Add from settings if available
    jsonb_build_object(
        'address_line1', 'Migrated Address',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400001'
    ),
    TRUE,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM master.organizations WHERE org_id = 1);

-- =============================================
-- STEP 3: Migrate Products
-- =============================================
INSERT INTO inventory.products (
    product_id,
    org_id,
    product_code,
    product_name,
    generic_name,
    manufacturer,
    hsn_code,
    product_type,
    pack_configuration,
    gst_percentage,
    current_mrp,
    is_active,
    created_at,
    created_by
)
SELECT 
    p.id,
    1, -- org_id
    COALESCE(p.item_code, 'PROD-' || p.id),
    p.name,
    p.salt_name,
    p.manufacturer,
    p.hsn_sac_code,
    CASE 
        WHEN p.item_type = 'Medicine' THEN 'ethical'
        WHEN p.item_type = 'Generic' THEN 'generic'
        ELSE 'general'
    END,
    jsonb_build_object(
        'base_unit', COALESCE(p.base_unit, 'TAB'),
        'strip_size', COALESCE(p.strip_size, 10),
        'box_size', COALESCE(p.box_size, 10),
        'case_size', COALESCE(p.case_size, 10)
    ),
    COALESCE(p.gst_percent, 12),
    COALESCE(p.mrp, 0),
    COALESCE(p.active, TRUE),
    COALESCE(p.created_at, CURRENT_TIMESTAMP),
    1
FROM public.products p
ON CONFLICT (product_id) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    updated_at = CURRENT_TIMESTAMP;

-- Update migration status
INSERT INTO migration.migration_status (table_name, records_migrated, status, completed_at)
SELECT 'products', COUNT(*), 'completed', CURRENT_TIMESTAMP
FROM public.products;

-- =============================================
-- STEP 4: Migrate Customers
-- =============================================
INSERT INTO parties.customers (
    customer_id,
    org_id,
    customer_code,
    customer_name,
    customer_type,
    gstin,
    contact_person,
    primary_phone,
    email,
    address,
    credit_info,
    is_active,
    created_at,
    created_by
)
SELECT 
    c.id,
    1, -- org_id
    COALESCE(c.code, 'CUST-' || c.id),
    c.name,
    CASE 
        WHEN c.customer_type IN ('Hospital', 'Clinic') THEN 'hospital'
        WHEN c.customer_type = 'Pharmacy' THEN 'pharmacy'
        WHEN c.customer_type = 'Wholesale' THEN 'wholesaler'
        ELSE 'retail'
    END,
    c.gstin,
    c.contact_person,
    c.phone,
    c.email,
    jsonb_build_object(
        'address_line1', COALESCE(c.address, ''),
        'city', COALESCE(c.city, 'Mumbai'),
        'state', COALESCE(c.state, 'Maharashtra'),
        'country', 'India',
        'pincode', COALESCE(c.pincode, '400001')
    ),
    jsonb_build_object(
        'credit_limit', COALESCE(c.credit_limit, 0),
        'credit_utilized', 0,
        'payment_terms', COALESCE(c.payment_terms, 'cash')
    ),
    COALESCE(c.active, TRUE),
    COALESCE(c.created_at, CURRENT_TIMESTAMP),
    1
FROM public.customers c
ON CONFLICT (customer_id) DO UPDATE SET
    customer_name = EXCLUDED.customer_name,
    updated_at = CURRENT_TIMESTAMP;

-- Update migration status
INSERT INTO migration.migration_status (table_name, records_migrated, status, completed_at)
SELECT 'customers', COUNT(*), 'completed', CURRENT_TIMESTAMP
FROM public.customers;

-- =============================================
-- STEP 5: Migrate Suppliers
-- =============================================
INSERT INTO parties.suppliers (
    supplier_id,
    org_id,
    supplier_code,
    supplier_name,
    supplier_category,
    gstin,
    contact_person,
    primary_phone,
    email,
    address,
    payment_terms,
    credit_limit,
    is_active,
    created_at,
    created_by
)
SELECT 
    s.id,
    1, -- org_id
    COALESCE(s.code, 'SUPP-' || s.id),
    s.name,
    CASE 
        WHEN s.supplier_type = 'Manufacturer' THEN 'manufacturer'
        WHEN s.supplier_type = 'Distributor' THEN 'distributor'
        ELSE 'wholesaler'
    END,
    s.gstin,
    s.contact_person,
    s.phone,
    s.email,
    jsonb_build_object(
        'address_line1', COALESCE(s.address, ''),
        'city', COALESCE(s.city, 'Mumbai'),
        'state', COALESCE(s.state, 'Maharashtra'),
        'country', 'India',
        'pincode', COALESCE(s.pincode, '400001')
    ),
    jsonb_build_object(
        'payment_days', COALESCE(s.payment_days, 30),
        'payment_method', 'bank_transfer'
    ),
    COALESCE(s.credit_limit, 100000),
    COALESCE(s.active, TRUE),
    COALESCE(s.created_at, CURRENT_TIMESTAMP),
    1
FROM public.suppliers s
ON CONFLICT (supplier_id) DO UPDATE SET
    supplier_name = EXCLUDED.supplier_name,
    updated_at = CURRENT_TIMESTAMP;

-- Update migration status
INSERT INTO migration.migration_status (table_name, records_migrated, status, completed_at)
SELECT 'suppliers', COUNT(*), 'completed', CURRENT_TIMESTAMP
FROM public.suppliers;

-- =============================================
-- STEP 6: Migrate Invoices
-- =============================================

-- First create default branch
INSERT INTO master.branches (branch_id, org_id, branch_code, branch_name, branch_type, is_head_office)
VALUES (1, 1, 'HO', 'Head Office', 'head_office', TRUE)
ON CONFLICT (branch_id) DO NOTHING;

-- Migrate invoices
INSERT INTO sales.invoices (
    invoice_id,
    org_id,
    branch_id,
    invoice_number,
    invoice_date,
    invoice_type,
    customer_id,
    subtotal,
    tax_amount,
    discount_amount,
    total_amount,
    paid_amount,
    invoice_status,
    payment_status,
    created_at,
    created_by
)
SELECT 
    i.id,
    1, -- org_id
    1, -- default branch
    COALESCE(i.invoice_number, 'INV-MIG-' || i.id),
    COALESCE(i.invoice_date, i.created_at::DATE),
    'tax_invoice',
    i.customer_id,
    COALESCE(i.subtotal, i.total_amount / 1.12), -- Assuming 12% GST
    COALESCE(i.tax_amount, i.total_amount * 0.12 / 1.12),
    COALESCE(i.discount_amount, 0),
    COALESCE(i.total_amount, 0),
    COALESCE(i.paid_amount, 0),
    CASE 
        WHEN i.status = 'draft' THEN 'draft'
        WHEN i.status = 'cancelled' THEN 'cancelled'
        ELSE 'posted'
    END,
    CASE 
        WHEN i.payment_status = 'paid' THEN 'paid'
        WHEN i.payment_status = 'partial' THEN 'partial'
        ELSE 'pending'
    END,
    COALESCE(i.created_at, CURRENT_TIMESTAMP),
    COALESCE(i.created_by, 1)
FROM public.invoices i
WHERE i.customer_id IN (SELECT customer_id FROM parties.customers)
ON CONFLICT (invoice_id) DO UPDATE SET
    total_amount = EXCLUDED.total_amount,
    updated_at = CURRENT_TIMESTAMP;

-- =============================================
-- STEP 7: Migrate Invoice Items
-- =============================================
INSERT INTO sales.invoice_items (
    invoice_id,
    product_id,
    quantity,
    unit_of_sale,
    base_unit_price,
    discount_percentage,
    discount_amount,
    tax_percentage,
    tax_amount,
    taxable_amount,
    line_total,
    created_at
)
SELECT 
    ii.invoice_id,
    ii.product_id,
    COALESCE(ii.quantity, 0),
    COALESCE(ii.unit_of_sale, 'TAB'),
    COALESCE(ii.price, 0),
    COALESCE(ii.discount_percentage, 0),
    COALESCE(ii.discount_amount, 0),
    COALESCE(ii.gst_percent, 12),
    COALESCE(ii.gst_amount, ii.total_price * 0.12 / 1.12),
    COALESCE(ii.total_price / 1.12, ii.total_price),
    COALESCE(ii.total_price, 0),
    CURRENT_TIMESTAMP
FROM public.invoice_items ii
WHERE ii.invoice_id IN (SELECT invoice_id FROM sales.invoices)
AND ii.product_id IN (SELECT product_id FROM inventory.products)
ON CONFLICT DO NOTHING;

-- Update migration status
INSERT INTO migration.migration_status (table_name, records_migrated, status, completed_at)
SELECT 'invoices', COUNT(*), 'completed', CURRENT_TIMESTAMP
FROM public.invoices;

-- =============================================
-- STEP 8: Create Initial Stock
-- =============================================

-- Create default storage location
INSERT INTO inventory.storage_locations (
    location_id, branch_id, location_code, location_name, 
    location_type, is_sales_location, is_active
)
VALUES (1, 1, 'MAIN', 'Main Store', 'dispensary', TRUE, TRUE)
ON CONFLICT (location_id) DO NOTHING;

-- Create batches from current stock
INSERT INTO inventory.batches (
    org_id,
    product_id,
    batch_number,
    manufacturing_date,
    expiry_date,
    quantity_received,
    quantity_available,
    cost_per_unit,
    mrp_per_unit,
    sale_price_per_unit,
    batch_status
)
SELECT 
    1, -- org_id
    p.id,
    'BATCH-MIG-' || p.id,
    CURRENT_DATE - INTERVAL '6 months',
    CURRENT_DATE + INTERVAL '18 months',
    COALESCE(s.quantity, 0),
    COALESCE(s.quantity, 0),
    COALESCE(p.cost_price, p.mrp * 0.7),
    COALESCE(p.mrp, 0),
    COALESCE(p.sale_price, p.mrp * 0.9),
    'active'
FROM public.products p
LEFT JOIN (
    SELECT product_id, SUM(quantity) as quantity
    FROM public.stock
    GROUP BY product_id
) s ON p.id = s.product_id
WHERE p.active = TRUE
ON CONFLICT DO NOTHING;

-- Create location wise stock
INSERT INTO inventory.location_wise_stock (
    product_id,
    batch_id,
    location_id,
    org_id,
    quantity_available,
    stock_status,
    unit_cost
)
SELECT 
    b.product_id,
    b.batch_id,
    1, -- default location
    b.org_id,
    b.quantity_available,
    'available',
    b.cost_per_unit
FROM inventory.batches b
WHERE b.quantity_available > 0
ON CONFLICT DO NOTHING;

-- =============================================
-- STEP 9: Migrate Users and Roles
-- =============================================

-- Create default roles if not exists
INSERT INTO system_config.roles (role_id, role_name, role_code, is_system_role)
VALUES 
    (1, 'Admin', 'ADMIN', TRUE),
    (2, 'Manager', 'MANAGER', TRUE),
    (3, 'Sales User', 'SALES_USER', TRUE)
ON CONFLICT (role_id) DO NOTHING;

-- Migrate users
INSERT INTO system_config.users (
    user_id,
    username,
    email,
    password_hash,
    full_name,
    user_type,
    is_active,
    created_at
)
SELECT 
    u.id,
    COALESCE(u.username, u.email),
    u.email,
    u.password, -- Already hashed
    COALESCE(u.name, u.username),
    CASE 
        WHEN u.role = 'admin' THEN 'admin'
        WHEN u.role = 'manager' THEN 'manager'
        ELSE 'user'
    END,
    COALESCE(u.active, TRUE),
    COALESCE(u.created_at, CURRENT_TIMESTAMP)
FROM public.users u
ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = CURRENT_TIMESTAMP;

-- Assign roles
INSERT INTO system_config.user_roles (user_id, role_id, assigned_at, assigned_by)
SELECT 
    u.id,
    CASE 
        WHEN u.role = 'admin' THEN 1
        WHEN u.role = 'manager' THEN 2
        ELSE 3
    END,
    CURRENT_TIMESTAMP,
    1
FROM public.users u
ON CONFLICT (user_id, role_id) DO NOTHING;

-- =============================================
-- STEP 10: Verify Migration
-- =============================================
DO $$
DECLARE
    v_old_products INTEGER;
    v_new_products INTEGER;
    v_old_customers INTEGER;
    v_new_customers INTEGER;
    v_old_invoices INTEGER;
    v_new_invoices INTEGER;
BEGIN
    -- Count old records
    SELECT COUNT(*) INTO v_old_products FROM public.products WHERE active = TRUE;
    SELECT COUNT(*) INTO v_old_customers FROM public.customers WHERE active = TRUE;
    SELECT COUNT(*) INTO v_old_invoices FROM public.invoices;
    
    -- Count new records
    SELECT COUNT(*) INTO v_new_products FROM inventory.products WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v_new_customers FROM parties.customers WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v_new_invoices FROM sales.invoices;
    
    RAISE NOTICE 'Migration Summary:';
    RAISE NOTICE 'Products - Old: %, New: %', v_old_products, v_new_products;
    RAISE NOTICE 'Customers - Old: %, New: %', v_old_customers, v_new_customers;
    RAISE NOTICE 'Invoices - Old: %, New: %', v_old_invoices, v_new_invoices;
    
    -- Update final status
    INSERT INTO migration.migration_status (table_name, status, completed_at)
    VALUES ('MIGRATION_COMPLETE', 'success', CURRENT_TIMESTAMP);
END $$;

-- =============================================
-- STEP 11: Create Migration Report
-- =============================================
CREATE OR REPLACE FUNCTION migration.get_migration_report()
RETURNS TABLE (
    table_name VARCHAR(100),
    records_migrated INTEGER,
    status VARCHAR(50),
    duration INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ms.table_name,
        ms.records_migrated,
        ms.status,
        ms.completed_at - ms.started_at as duration
    FROM migration.migration_status ms
    ORDER BY ms.migration_id;
END;
$$ LANGUAGE plpgsql;

-- Show migration report
SELECT * FROM migration.get_migration_report();