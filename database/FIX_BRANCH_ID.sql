-- Fix for branch_id foreign key constraint error
-- The error occurs because purchase_orders is trying to insert branch_id=1 
-- but this doesn't exist in org_branches table

-- Option 1: Insert a default branch if it doesn't exist
INSERT INTO public.org_branches (
    branch_id,
    org_id,
    branch_name,
    branch_code,
    is_active,
    created_at
) VALUES (
    1,
    'e78d6777-35f6-4b19-994f-caaede2f021a', -- Your org_id
    'Main Branch',
    'MAIN',
    true,
    NOW()
) ON CONFLICT (branch_id) DO NOTHING;

-- Option 2: Make branch_id nullable in purchase_orders (if branches are optional)
-- ALTER TABLE procurement.purchase_orders 
-- ALTER COLUMN branch_id DROP NOT NULL;

-- Option 3: Update the backend to not hardcode branch_id=1
-- This requires updating the Python backend code to either:
-- a) Get the correct branch_id from the request context
-- b) Use NULL if no branch is specified
-- c) Get the default branch for the organization

-- To check current branches:
SELECT * FROM public.org_branches WHERE org_id = 'e78d6777-35f6-4b19-994f-caaede2f021a';

-- To check if branch_id constraint exists:
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name='purchase_orders'
    AND kcu.column_name = 'branch_id';