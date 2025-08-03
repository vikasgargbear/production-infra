-- Fix Vikas customer org_id to match the default organization
UPDATE parties.customers 
SET org_id = 'ad808530-1ddb-4377-ab20-67bef145d80d'
WHERE customer_name = 'Vikas' 
AND customer_id = 16;

-- Verify the update
SELECT customer_id, customer_name, org_id 
FROM parties.customers 
WHERE customer_name ILIKE '%vikas%';