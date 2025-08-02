-- Create the organization that Railway backend expects
INSERT INTO master.organizations (
    org_id,
    org_code,
    org_name,
    legal_name,
    business_type,
    establishment_date,
    gst_number,
    pan_number,
    registered_address,
    contact_numbers,
    email_addresses,
    is_active,
    created_at,
    updated_at
) VALUES (
    '12de5e22-eee7-4d25-b3a7-d16d01c6170f'::uuid,
    'PHARMA001',
    'Demo Pharmacy',
    'Demo Pharmacy Pvt Ltd',
    'pharmaceutical_distributor',
    '2024-01-01'::date,
    '27AABCD1234E1ZF',
    'AABCD1234E',
    jsonb_build_object(
        'address_line1', '123 Main Street',
        'address_line2', '',
        'city', 'Mumbai',
        'state', 'Maharashtra',
        'country', 'India',
        'pincode', '400001'
    ),
    jsonb_build_object(
        'primary', '9999999999',
        'secondary', '8888888888'
    ),
    jsonb_build_object(
        'primary', 'admin@demopharmacy.com',
        'support', 'support@demopharmacy.com'
    ),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (org_id) DO NOTHING;

-- Verify it was created
SELECT org_id, org_code, org_name, is_active 
FROM master.organizations 
WHERE org_id = '12de5e22-eee7-4d25-b3a7-d16d01c6170f'::uuid;