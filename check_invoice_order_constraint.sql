-- Check if order_id is required in sales.invoices
SELECT 
    column_name,
    is_nullable,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_schema = 'sales'
AND table_name = 'invoices'
AND column_name = 'order_id';

-- Check foreign key constraint
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'sales'
AND tc.table_name = 'invoices'
AND kcu.column_name = 'order_id';

-- Check if we can create invoice without order_id
-- If order_id is nullable, we can skip order creation