-- Create system user for API operations
-- Run this in your production database

-- Check if user exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.org_users 
        WHERE org_id = 'ad808530-1ddb-4377-ab20-67bef145d80d' 
        AND username = 'system'
    ) THEN
        INSERT INTO master.org_users (
            org_id, 
            employee_code, 
            username, 
            email, 
            password_hash, 
            first_name, 
            last_name, 
            roles, 
            is_active,
            branch_id
        ) VALUES (
            'ad808530-1ddb-4377-ab20-67bef145d80d',
            'SYSTEM',
            'system',
            'system@api.local',
            '$2b$12$DUMMY.HASH.NO.LOGIN.POSSIBLE',  -- Cannot login
            'System',
            'API',
            ARRAY['api_user'],
            true,
            1  -- Default branch
        );
        
        RAISE NOTICE 'System user created successfully';
    ELSE
        RAISE NOTICE 'System user already exists';
    END IF;
END $$;

-- Get the system user ID for reference
SELECT user_id, username, email 
FROM master.org_users 
WHERE username = 'system' 
AND org_id = 'ad808530-1ddb-4377-ab20-67bef145d80d';