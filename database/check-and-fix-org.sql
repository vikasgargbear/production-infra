-- 1. First, check what organizations exist in your database
SELECT org_id, org_name, org_code, created_at 
FROM master.organizations
ORDER BY created_at;

-- 2. If no organizations exist, create the one Railway expects
INSERT INTO master.organizations (
    org_id,
    org_code,
    org_name,
    legal_name,
    business_type,
    establishment_year,
    primary_phone,
    primary_email,
    address_line1,
    city,
    state,
    country,
    pincode,
    is_active,
    created_at,
    updated_at
) VALUES (
    '12de5e22-eee7-4d25-b3a7-d16d01c6170f'::uuid,
    'PHARMA001',
    'Demo Pharmacy',
    'Demo Pharmacy Pvt Ltd',
    'retail_pharmacy',
    2024,
    '9999999999',
    'admin@demopharmacy.com',
    '123 Main Street',
    'Mumbai',
    'Maharashtra',
    'India',
    '400001',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (org_id) DO NOTHING;

-- 3. Verify the organization was created
SELECT org_id, org_name, org_code 
FROM master.organizations
WHERE org_id = '12de5e22-eee7-4d25-b3a7-d16d01c6170f'::uuid;