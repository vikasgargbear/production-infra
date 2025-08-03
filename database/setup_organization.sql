-- PRODUCTION DATABASE SETUP - Organization Configuration
-- Run this once to ensure your organization is properly configured
-- This replaces all temporary org fix files

-- Check if the required organization exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.organizations 
        WHERE org_id = 'ad808530-1ddb-4377-ab20-67bef145d80d'
    ) THEN
        -- Create the organization used by the application
        INSERT INTO master.organizations (
            org_id,
            org_code,
            org_name,
            business_type,
            is_active,
            created_at
        ) VALUES (
            'ad808530-1ddb-4377-ab20-67bef145d80d',
            'AASO001',
            'AASO Pharma',
            'pharmacy',
            true,
            CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE '✅ Created organization: AASO Pharma';
    ELSE
        RAISE NOTICE 'ℹ️ Organization already exists';
    END IF;
END $$;

-- Verify the organization is set up correctly
SELECT 
    org_id,
    org_code,
    org_name,
    business_type,
    is_active,
    created_at
FROM master.organizations
WHERE org_id = 'ad808530-1ddb-4377-ab20-67bef145d80d';

-- This is the org_id used throughout the application
-- Make sure backend/.env has: DEFAULT_ORG_ID=ad808530-1ddb-4377-ab20-67bef145d80d