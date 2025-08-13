-- EMERGENCY FIX: Create a system user so APIs can work
-- Run this in Railway's database console

-- First check if any users exist
SELECT COUNT(*) as existing_users FROM master.org_users;

-- Create a system user with ID=1 (many APIs expect this)
INSERT INTO master.org_users (
    user_id,
    org_id,
    employee_code,
    username,
    email,
    password_hash,
    first_name,
    last_name,
    roles,
    is_active
) VALUES (
    1,
    'ad808530-1ddb-4377-ab20-67bef145d80d',
    'SYSTEM',
    'system',
    'system@pharma.local',
    'no-login-hash',
    'System',
    'User',
    ARRAY['admin'],
    true
) ON CONFLICT (user_id) DO NOTHING;

-- Verify it worked
SELECT user_id, username, email FROM master.org_users WHERE user_id = 1;