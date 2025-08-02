-- Check existing organizations
SELECT org_id, org_name, org_code 
FROM master.organizations
ORDER BY created_at;

-- If needed, insert the missing organization
-- Uncomment the following lines if you want to create the organization with the Railway org_id
/*
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
    'Your Pharmacy Name',
    'Your Pharmacy Legal Name Pvt Ltd',
    'retail_pharmacy',
    2024,
    '1234567890',
    'admin@yourpharmacy.com',
    'Your Address',
    'Your City',
    'Your State',
    'India',
    '123456',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
*/

-- Alternative: Update config.py or Railway env to use an existing org_id
-- First, check what org_id exists:
-- Then update DEFAULT_ORG_ID in Railway to match