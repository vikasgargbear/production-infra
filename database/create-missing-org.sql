-- Create the missing organization that Railway is configured to use
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
    gst_number,
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
    '27AABCD1234E1ZF',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (org_id) DO NOTHING;