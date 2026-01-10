-- Migration: Change salesperson_id FK from org_users to employees
-- Reason: Frontend loads employees table and uses employee_id, 
--         but DB FK was pointing to org_users(user_id)
-- Date: 2026-01-10

-- Step 1: Drop existing FK constraint on sales.orders
ALTER TABLE sales.orders 
DROP CONSTRAINT IF EXISTS orders_salesperson_id_fkey;

-- Step 2: Add new FK referencing employees(employee_id)
ALTER TABLE sales.orders
ADD CONSTRAINT orders_salesperson_id_fkey 
    FOREIGN KEY (salesperson_id) 
    REFERENCES master.employees(employee_id)
    ON DELETE SET NULL;

-- Step 3: If salesperson_id exists on sales.invoices, update it too
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'sales' 
        AND table_name = 'invoices' 
        AND column_name = 'salesperson_id'
    ) THEN
        -- Drop existing FK if any
        ALTER TABLE sales.invoices 
        DROP CONSTRAINT IF EXISTS invoices_salesperson_id_fkey;
        
        -- Add new FK referencing employees
        ALTER TABLE sales.invoices
        ADD CONSTRAINT invoices_salesperson_id_fkey 
            FOREIGN KEY (salesperson_id) 
            REFERENCES master.employees(employee_id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- Step 4: Similar for delivery_challans if needed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'sales' 
        AND table_name = 'delivery_challans' 
        AND column_name = 'salesperson_id'
    ) THEN
        ALTER TABLE sales.delivery_challans 
        DROP CONSTRAINT IF EXISTS delivery_challans_salesperson_id_fkey;
        
        ALTER TABLE sales.delivery_challans
        ADD CONSTRAINT delivery_challans_salesperson_id_fkey 
            FOREIGN KEY (salesperson_id) 
            REFERENCES master.employees(employee_id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- Add helpful comment
COMMENT ON COLUMN sales.orders.salesperson_id IS 
    'References master.employees(employee_id) - the Medical Representative for this transaction';
