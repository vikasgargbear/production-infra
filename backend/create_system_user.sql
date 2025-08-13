-- CRITICAL: Create a user for API operations
-- Without this, NO POST/PUT/DELETE operations will work!

-- First, create user with ID = 1 (since many APIs expect this)
INSERT INTO master.org_users (
    user_id,  -- Force ID to be 1
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
    1,  -- Force user_id = 1
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
) ON CONFLICT (user_id) DO NOTHING;  -- Skip if already exists

-- Get the system user ID for reference
SELECT user_id, username, email 
FROM master.org_users 
WHERE username = 'system' 
AND org_id = 'ad808530-1ddb-4377-ab20-67bef145d80d';