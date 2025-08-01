-- =============================================
-- SAMPLE PRODUCT DATA
-- =============================================
-- Sample pharmaceutical products for testing
-- =============================================

-- =============================================
-- SAMPLE PRODUCTS
-- =============================================
INSERT INTO inventory.products (
    product_id,
    org_id,
    product_code,
    product_name,
    generic_name,
    category_id,
    manufacturer,
    hsn_code,
    product_type,
    dosage_form,
    strength,
    pack_configuration,
    gst_percentage,
    is_prescription_required,
    is_narcotic,
    reorder_level,
    reorder_quantity,
    default_sale_price,
    current_mrp,
    lead_time_days,
    is_active,
    created_at
) VALUES 
-- Antibiotics
(
    1001,
    1,
    'MED-AMOX-500',
    'Amoxicillin 500mg',
    'Amoxicillin',
    31, -- Antibiotics
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Tablet',
    '500mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 10
    ),
    12,
    TRUE,
    FALSE,
    1000,
    5000,
    8.50,
    10.00,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    1002,
    1,
    'MED-AZITH-500',
    'Azithromycin 500mg',
    'Azithromycin',
    31, -- Antibiotics
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Tablet',
    '500mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 3,
        'box_size', 10,
        'case_size', 20
    ),
    12,
    TRUE,
    FALSE,
    500,
    2000,
    65.00,
    75.00,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Analgesics
(
    1003,
    1,
    'MED-PARA-500',
    'Paracetamol 500mg',
    'Paracetamol',
    32, -- Analgesics
    'Demo Pharma Ltd',
    '3004',
    'otc',
    'Tablet',
    '500mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 20
    ),
    12,
    FALSE,
    FALSE,
    2000,
    10000,
    1.20,
    1.50,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    1004,
    1,
    'MED-DICLO-50',
    'Diclofenac Sodium 50mg',
    'Diclofenac Sodium',
    32, -- Analgesics
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Tablet',
    '50mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 10
    ),
    12,
    TRUE,
    FALSE,
    1000,
    5000,
    3.50,
    4.00,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Antacids
(
    1005,
    1,
    'MED-RANT-150',
    'Ranitidine 150mg',
    'Ranitidine',
    33, -- Antacids
    'Demo Pharma Ltd',
    '3004',
    'otc',
    'Tablet',
    '150mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 20
    ),
    12,
    FALSE,
    FALSE,
    1500,
    5000,
    2.80,
    3.50,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    1006,
    1,
    'MED-OMEP-20',
    'Omeprazole 20mg',
    'Omeprazole',
    33, -- Antacids
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Capsule',
    '20mg',
    jsonb_build_object(
        'base_unit', 'CAP',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 10
    ),
    12,
    TRUE,
    FALSE,
    1000,
    5000,
    6.50,
    8.00,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Vitamins
(
    1007,
    1,
    'MED-MVIT-CAP',
    'Multivitamin Capsules',
    'Multivitamin',
    34, -- Vitamins
    'Demo Pharma Ltd',
    '3004',
    'otc',
    'Capsule',
    'Standard',
    jsonb_build_object(
        'base_unit', 'CAP',
        'strip_size', 10,
        'box_size', 3,
        'case_size', 20
    ),
    12,
    FALSE,
    FALSE,
    500,
    2000,
    4.50,
    5.50,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    1008,
    1,
    'MED-VITC-500',
    'Vitamin C 500mg',
    'Ascorbic Acid',
    34, -- Vitamins
    'Demo Pharma Ltd',
    '3004',
    'otc',
    'Tablet',
    '500mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 10
    ),
    12,
    FALSE,
    FALSE,
    1000,
    5000,
    2.00,
    2.50,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Cardiac
(
    1009,
    1,
    'MED-ATEN-50',
    'Atenolol 50mg',
    'Atenolol',
    35, -- Cardiac
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Tablet',
    '50mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 14,
        'box_size', 10,
        'case_size', 10
    ),
    12,
    TRUE,
    FALSE,
    1000,
    5000,
    3.20,
    4.00,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    1010,
    1,
    'MED-AMLO-5',
    'Amlodipine 5mg',
    'Amlodipine',
    35, -- Cardiac
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Tablet',
    '5mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 10
    ),
    12,
    TRUE,
    FALSE,
    1500,
    7000,
    2.80,
    3.50,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Diabetic
(
    1011,
    1,
    'MED-METF-500',
    'Metformin 500mg',
    'Metformin',
    36, -- Diabetic
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Tablet',
    '500mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 20
    ),
    12,
    TRUE,
    FALSE,
    2000,
    10000,
    2.50,
    3.00,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    1012,
    1,
    'MED-GLIM-2',
    'Glimepiride 2mg',
    'Glimepiride',
    36, -- Diabetic
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Tablet',
    '2mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 10
    ),
    12,
    TRUE,
    FALSE,
    1000,
    5000,
    4.50,
    5.50,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Syrups
(
    1013,
    1,
    'MED-CFSYR-100',
    'Cough Syrup 100ml',
    'Dextromethorphan',
    13, -- Syrups
    'Demo Pharma Ltd',
    '3004',
    'otc',
    'Syrup',
    '10mg/5ml',
    jsonb_build_object(
        'base_unit', 'ML',
        'bottle_size', 100,
        'box_size', 30,
        'case_size', 5
    ),
    12,
    FALSE,
    FALSE,
    200,
    1000,
    45.00,
    55.00,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    1014,
    1,
    'MED-PARSYR-60',
    'Paracetamol Syrup 60ml',
    'Paracetamol',
    13, -- Syrups
    'Demo Pharma Ltd',
    '3004',
    'otc',
    'Syrup',
    '125mg/5ml',
    jsonb_build_object(
        'base_unit', 'ML',
        'bottle_size', 60,
        'box_size', 50,
        'case_size', 4
    ),
    12,
    FALSE,
    FALSE,
    300,
    1500,
    25.00,
    30.00,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Injections
(
    1015,
    1,
    'MED-CEFT-1G',
    'Ceftriaxone 1g Injection',
    'Ceftriaxone',
    14, -- Injections
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Injection',
    '1g',
    jsonb_build_object(
        'base_unit', 'VIAL',
        'box_size', 10,
        'case_size', 10
    ),
    12,
    TRUE,
    FALSE,
    100,
    500,
    85.00,
    100.00,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Ointments
(
    1016,
    1,
    'MED-DICGEL-30',
    'Diclofenac Gel 30g',
    'Diclofenac',
    15, -- Ointments
    'Demo Pharma Ltd',
    '3004',
    'otc',
    'Gel',
    '1% w/w',
    jsonb_build_object(
        'base_unit', 'TUBE',
        'box_size', 20,
        'case_size', 10
    ),
    12,
    FALSE,
    FALSE,
    200,
    1000,
    55.00,
    65.00,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Eye/Ear Drops
(
    1017,
    1,
    'MED-CIPEY-10',
    'Ciprofloxacin Eye Drops 10ml',
    'Ciprofloxacin',
    16, -- Drops
    'Demo Pharma Ltd',
    '3004',
    'ethical',
    'Eye Drops',
    '0.3% w/v',
    jsonb_build_object(
        'base_unit', 'BOTTLE',
        'box_size', 20,
        'case_size', 10
    ),
    12,
    TRUE,
    FALSE,
    100,
    500,
    35.00,
    42.00,
    7,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Narcotic (Schedule X)
(
    1018,
    1,
    'MED-MORPH-10',
    'Morphine Sulphate 10mg',
    'Morphine Sulphate',
    23, -- Schedule X
    'Demo Pharma Ltd',
    '3004',
    'narcotic',
    'Tablet',
    '10mg',
    jsonb_build_object(
        'base_unit', 'TAB',
        'strip_size', 10,
        'box_size', 10,
        'case_size', 10
    ),
    12,
    TRUE,
    TRUE,
    50,
    100,
    15.00,
    18.00,
    15,
    TRUE,
    CURRENT_TIMESTAMP
),

-- Surgical Items
(
    2001,
    1,
    'SUR-GLOVE-L',
    'Surgical Gloves Large',
    'Latex Gloves',
    2, -- Surgical
    'MediSafe Industries',
    '9018',
    'general',
    'Gloves',
    'Large',
    jsonb_build_object(
        'base_unit', 'PAIR',
        'box_size', 100,
        'case_size', 10
    ),
    12,
    FALSE,
    FALSE,
    200,
    1000,
    8.00,
    10.00,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    2002,
    1,
    'SUR-MASK-3P',
    '3 Ply Surgical Mask',
    'Face Mask',
    2, -- Surgical
    'MediSafe Industries',
    '9018',
    'general',
    'Mask',
    '3 Ply',
    jsonb_build_object(
        'base_unit', 'PIECE',
        'box_size', 50,
        'case_size', 20
    ),
    12,
    FALSE,
    FALSE,
    500,
    5000,
    2.00,
    3.00,
    5,
    TRUE,
    CURRENT_TIMESTAMP
),

-- General Items
(
    3001,
    1,
    'GEN-BAND-10',
    'Adhesive Bandage 10s',
    'Band Aid',
    3, -- General
    'FirstAid Corp',
    '3005',
    'general',
    'Bandage',
    'Standard',
    jsonb_build_object(
        'base_unit', 'STRIP',
        'box_size', 100,
        'case_size', 10
    ),
    12,
    FALSE,
    FALSE,
    200,
    1000,
    15.00,
    20.00,
    5,
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (product_id) DO NOTHING;

-- =============================================
-- SAMPLE SUPPLIERS
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
    created_at
) VALUES 
(
    1,
    1,
    'SUP-001',
    'MediSupply Distributors Pvt Ltd',
    'distributor',
    '27AABCM1234E1ZX',
    'Rajesh Kumar',
    '9876543210',
    'rajesh@medisupply.com',
    jsonb_build_object(
        'address_line1', '456 Pharma Hub',
        'address_line2', 'Industrial Area',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400002'
    ),
    jsonb_build_object(
        'payment_days', 30,
        'payment_method', 'bank_transfer'
    ),
    1000000,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    2,
    1,
    'SUP-002',
    'Generic Pharma Wholesalers',
    'wholesaler',
    '27AABCG5678F1ZX',
    'Priya Sharma',
    '9876543211',
    'priya@genericpharma.com',
    jsonb_build_object(
        'address_line1', '789 Medicine Market',
        'address_line2', 'Crawford Market',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400003'
    ),
    jsonb_build_object(
        'payment_days', 45,
        'payment_method', 'cheque'
    ),
    500000,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    3,
    1,
    'SUP-003',
    'Direct Pharma Manufacturing Co',
    'manufacturer',
    '27AABCD9876G1ZX',
    'Dr. Amit Patel',
    '9876543212',
    'amit@directpharma.com',
    jsonb_build_object(
        'address_line1', '123 Factory Road',
        'address_line2', 'MIDC Phase 3',
        'city', 'Pune',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '411018'
    ),
    jsonb_build_object(
        'payment_days', 60,
        'payment_method', 'bank_transfer'
    ),
    2000000,
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (supplier_id) DO NOTHING;

-- =============================================
-- SUPPLIER PRODUCTS MAPPING
-- =============================================
INSERT INTO procurement.supplier_products (
    supplier_id,
    product_id,
    supplier_product_code,
    last_supply_price,
    last_supply_date,
    minimum_order_quantity,
    lead_time_days,
    is_preferred,
    is_active,
    created_at
)
SELECT 
    s.supplier_id,
    p.product_id,
    'SP-' || s.supplier_id || '-' || p.product_id,
    p.default_sale_price * 0.7, -- 30% margin
    CURRENT_DATE - INTERVAL '30 days',
    CASE 
        WHEN p.product_type = 'narcotic' THEN 10
        WHEN p.product_type = 'ethical' THEN 50
        ELSE 100
    END,
    CASE 
        WHEN s.supplier_category = 'manufacturer' THEN 7
        WHEN s.supplier_category = 'distributor' THEN 3
        ELSE 5
    END,
    s.supplier_id = 1, -- First supplier is preferred
    TRUE,
    CURRENT_TIMESTAMP
FROM parties.suppliers s
CROSS JOIN inventory.products p
WHERE s.is_active = TRUE 
AND p.is_active = TRUE
AND p.product_id BETWEEN 1001 AND 1018 -- Only medicines
ON CONFLICT (supplier_id, product_id) DO NOTHING;

-- =============================================
-- SAMPLE CUSTOMERS
-- =============================================
INSERT INTO parties.customers (
    customer_id,
    org_id,
    customer_code,
    customer_name,
    customer_type,
    category_id,
    gstin,
    contact_person,
    primary_phone,
    email,
    address,
    credit_info,
    is_active,
    created_at
) VALUES 
(
    1,
    1,
    'CUST-001',
    'City Hospital',
    'hospital',
    3, -- Hospital category
    '27AABCH1234F1ZX',
    'Dr. Suresh Mehta',
    '9876543220',
    'purchase@cityhospital.com',
    jsonb_build_object(
        'address_line1', '100 Hospital Road',
        'address_line2', 'Andheri East',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400069'
    ),
    jsonb_build_object(
        'credit_limit', 500000,
        'credit_utilized', 0,
        'payment_terms', '45days'
    ),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    2,
    1,
    'CUST-002',
    'Green Cross Pharmacy',
    'pharmacy',
    4, -- Pharmacy Chain
    '27AABCG1234P1ZX',
    'Ramesh Gupta',
    '9876543221',
    'ramesh@greencross.com',
    jsonb_build_object(
        'address_line1', '50 Main Street',
        'address_line2', 'Dadar West',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400028'
    ),
    jsonb_build_object(
        'credit_limit', 300000,
        'credit_utilized', 0,
        'payment_terms', '30days'
    ),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    3,
    1,
    'CUST-003',
    'MediCare Clinic',
    'clinic',
    1, -- Retail
    NULL, -- No GST
    'Dr. Priya Nair',
    '9876543222',
    'priya@medicareclinic.com',
    jsonb_build_object(
        'address_line1', '25 Palm Road',
        'address_line2', 'Bandra West',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400050'
    ),
    jsonb_build_object(
        'credit_limit', 50000,
        'credit_utilized', 0,
        'payment_terms', '7days'
    ),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    4,
    1,
    'CUST-004',
    'QuickMed Wholesale',
    'wholesaler',
    2, -- Wholesale
    '27AABCQ1234W1ZX',
    'Anil Desai',
    '9876543223',
    'anil@quickmed.com',
    jsonb_build_object(
        'address_line1', '200 Wholesale Market',
        'address_line2', 'Fort',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400001'
    ),
    jsonb_build_object(
        'credit_limit', 200000,
        'credit_utilized', 0,
        'payment_terms', '30days'
    ),
    TRUE,
    CURRENT_TIMESTAMP
),
(
    5,
    1,
    'CUST-005',
    'Walk-in Customer',
    'retail',
    6, -- Walk-in
    NULL,
    NULL,
    '0000000000',
    NULL,
    jsonb_build_object(
        'address_line1', 'Counter Sale',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400001'
    ),
    jsonb_build_object(
        'credit_limit', 0,
        'credit_utilized', 0,
        'payment_terms', 'cash'
    ),
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (customer_id) DO NOTHING;

-- =============================================
-- SAMPLE INITIAL STOCK (BATCHES)
-- =============================================
-- Create batches for each product from supplier 1
INSERT INTO inventory.batches (
    batch_id,
    org_id,
    product_id,
    batch_number,
    manufacturing_date,
    expiry_date,
    supplier_id,
    quantity_received,
    quantity_available,
    quantity_allocated,
    quantity_sold,
    cost_per_unit,
    mrp_per_unit,
    sale_price_per_unit,
    batch_status,
    created_at
)
SELECT 
    1000 + row_number() OVER (ORDER BY p.product_id),
    1,
    p.product_id,
    'BAT-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD((1000 + row_number() OVER (ORDER BY p.product_id))::TEXT, 4, '0'),
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE + INTERVAL '2 years' - (random() * INTERVAL '180 days'),
    1, -- From supplier 1
    p.reorder_quantity,
    p.reorder_quantity * 0.8, -- 80% available
    0,
    p.reorder_quantity * 0.2, -- 20% sold
    p.default_sale_price * 0.7, -- Cost
    p.current_mrp,
    p.default_sale_price,
    'active',
    CURRENT_TIMESTAMP
FROM inventory.products p
WHERE p.is_active = TRUE
ON CONFLICT (batch_id) DO NOTHING;

-- =============================================
-- LOCATION-WISE STOCK
-- =============================================
-- Distribute stock across locations
INSERT INTO inventory.location_wise_stock (
    product_id,
    batch_id,
    location_id,
    org_id,
    quantity_available,
    quantity_reserved,
    quantity_quarantine,
    stock_in_date,
    stock_status,
    unit_cost,
    created_at
)
SELECT 
    b.product_id,
    b.batch_id,
    CASE 
        WHEN p.is_narcotic THEN 4 -- Narcotic storage
        WHEN p.product_type = 'ethical' AND row_number() OVER (PARTITION BY b.product_id ORDER BY b.batch_id) % 2 = 0 THEN 2 -- Warehouse
        WHEN p.product_type = 'ethical' THEN 6 -- Retail dispensary
        ELSE 7 -- OTC section
    END as location_id,
    b.org_id,
    b.quantity_available,
    0,
    0,
    b.created_at::DATE,
    'available',
    b.cost_per_unit,
    CURRENT_TIMESTAMP
FROM inventory.batches b
JOIN inventory.products p ON b.product_id = p.product_id
WHERE b.batch_status = 'active'
ON CONFLICT (product_id, batch_id, location_id) DO NOTHING;

-- =============================================
-- SAMPLE PRICE LISTS
-- =============================================
INSERT INTO sales.price_lists (
    price_list_id,
    org_id,
    price_list_name,
    price_list_type,
    valid_from,
    valid_to,
    is_active,
    created_at
) VALUES 
(1, 1, 'Standard Retail Price List', 'standard', CURRENT_DATE, '2025-12-31', TRUE, CURRENT_TIMESTAMP),
(2, 1, 'Hospital Special Rates', 'customer_specific', CURRENT_DATE, '2025-12-31', TRUE, CURRENT_TIMESTAMP),
(3, 1, 'Wholesale Price List', 'customer_category', CURRENT_DATE, '2025-12-31', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (price_list_id) DO NOTHING;

-- Price list items
INSERT INTO sales.price_list_items (
    price_list_id,
    product_id,
    customer_category_id,
    base_unit_price,
    is_active,
    created_at
)
SELECT 
    1, -- Standard retail
    p.product_id,
    NULL,
    p.default_sale_price,
    TRUE,
    CURRENT_TIMESTAMP
FROM inventory.products p
WHERE p.is_active = TRUE
UNION ALL
SELECT 
    2, -- Hospital rates (15% discount)
    p.product_id,
    3, -- Hospital category
    p.default_sale_price * 0.85,
    TRUE,
    CURRENT_TIMESTAMP
FROM inventory.products p
WHERE p.is_active = TRUE
UNION ALL
SELECT 
    3, -- Wholesale rates (10% discount)
    p.product_id,
    2, -- Wholesale category
    p.default_sale_price * 0.90,
    TRUE,
    CURRENT_TIMESTAMP
FROM inventory.products p
WHERE p.is_active = TRUE
ON CONFLICT (price_list_id, product_id, customer_category_id) DO NOTHING;

-- =============================================
-- SAMPLE BUSINESS LICENSES
-- =============================================
INSERT INTO compliance.business_licenses (
    license_id,
    org_id,
    license_type,
    license_number,
    license_name,
    issuing_authority,
    issue_date,
    expiry_date,
    renewal_status,
    applicable_branches,
    responsible_person,
    is_active,
    created_at
) VALUES 
(
    1,
    1,
    'drug_license',
    'MH-12345-2024',
    'Retail Drug License',
    'FDA Maharashtra',
    '2024-01-01',
    '2025-12-31',
    'active',
    ARRAY[1, 3], -- HO and Retail
    'Compliance Officer',
    TRUE,
    CURRENT_TIMESTAMP
),
(
    2,
    1,
    'drug_license',
    'MH-12346-2024',
    'Wholesale Drug License',
    'FDA Maharashtra',
    '2024-01-01',
    '2025-12-31',
    'active',
    ARRAY[2], -- Warehouse
    'Compliance Officer',
    TRUE,
    CURRENT_TIMESTAMP
),
(
    3,
    1,
    'gst_registration',
    '27AABCD1234E1ZX',
    'GST Registration Certificate',
    'GST Department',
    '2017-07-01',
    '2099-12-31', -- No expiry
    'active',
    ARRAY[1, 2, 3], -- All branches
    'Finance Head',
    TRUE,
    CURRENT_TIMESTAMP
),
(
    4,
    1,
    'narcotic_license',
    'NRC-MH-001-2024',
    'Narcotic Drug License',
    'Narcotics Control Bureau',
    '2024-01-01',
    '2024-12-31',
    'active',
    ARRAY[1], -- Only HO
    'Chief Pharmacist',
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (license_id) DO NOTHING;

-- =============================================
-- RESET SEQUENCES
-- =============================================
SELECT setval('inventory.products_product_id_seq', 4000, false);
SELECT setval('inventory.batches_batch_id_seq', 2000, false);
SELECT setval('parties.customers_customer_id_seq', 1000, false);
SELECT setval('parties.suppliers_supplier_id_seq', 100, false);
SELECT setval('sales.price_lists_price_list_id_seq', 10, false);
SELECT setval('compliance.business_licenses_license_id_seq', 10, false);

-- =============================================
-- VERIFICATION
-- =============================================
DO $$
DECLARE
    v_product_count INTEGER;
    v_batch_count INTEGER;
    v_stock_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_product_count FROM inventory.products WHERE is_active = TRUE;
    SELECT COUNT(*) INTO v_batch_count FROM inventory.batches WHERE batch_status = 'active';
    SELECT COUNT(*) INTO v_stock_count FROM inventory.location_wise_stock WHERE stock_status = 'available';
    
    RAISE NOTICE 'Sample Data Created:';
    RAISE NOTICE 'Products: %', v_product_count;
    RAISE NOTICE 'Active Batches: %', v_batch_count;
    RAISE NOTICE 'Stock Entries: %', v_stock_count;
    
    IF v_product_count = 0 THEN
        RAISE EXCEPTION 'Sample product data creation failed';
    END IF;
END $$;