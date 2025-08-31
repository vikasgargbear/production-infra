-- Create default branch for organization
-- This ensures the branch_id=1 exists for the org

-- First, check if branch exists
SELECT * FROM master.org_branches WHERE org_id = 'e78d6777-35f6-4b19-994f-caaede2f021a';

-- Insert default branch if it doesn't exist
INSERT INTO master.org_branches (
    branch_id,
    org_id,
    branch_name,
    branch_code,
    branch_type,
    address,
    city,
    state,
    pincode,
    phone,
    email,
    gstin,
    drug_license_number,
    is_active,
    created_at,
    updated_at
) VALUES (
    1,
    'e78d6777-35f6-4b19-994f-caaede2f021a',
    'Main Branch',
    'MAIN',
    'head_office',
    'Main Office',
    'Mumbai',
    'Maharashtra',
    '400001',
    '1234567890',
    'main@pharma.com',
    NULL,
    NULL,
    true,
    NOW(),
    NOW()
) ON CONFLICT (branch_id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    is_active = true,
    updated_at = NOW();

-- Verify the branch was created
SELECT * FROM master.org_branches WHERE branch_id = 1;