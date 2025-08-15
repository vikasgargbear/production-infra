-- Check if ANY users exist in the system
SELECT COUNT(*) as user_count FROM master.org_users;

-- List any existing users
SELECT user_id, username, email, first_name, last_name, is_active 
FROM master.org_users 
LIMIT 5;

-- Check what created_by values are in use
SELECT DISTINCT created_by 
FROM parties.customers 
WHERE created_by IS NOT NULL;

-- This explains the issue:
-- created_by in ALL tables refers to master.org_users.user_id
-- If no users exist, you cannot create/update any records!