-- Check if test users exist and have password hashes
SELECT user_id, email, username, 
       CASE WHEN password_hash IS NULL THEN 'NO PASSWORD' ELSE 'HAS PASSWORD' END as pwd_status,
       is_active, org_id, org_name
FROM master.org_users u
JOIN master.organizations o ON u.org_id = o.org_id
ORDER BY created_at DESC
LIMIT 10;
