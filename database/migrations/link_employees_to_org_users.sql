-- Migration: Link Employees to Org Users
-- Purpose: Create org_user records for employees who don't have one,
--          then link them via employees.user_id
-- This ensures salesperson_id (→ org_users.user_id) works correctly
-- Date: 2026-01-11

-- Step 1: Create org_user records for employees without user_id
-- Uses employee data to populate org_user fields
INSERT INTO master.org_users (
    org_id,
    username,
    email,
    mobile_number,
    employee_code,
    first_name,
    last_name,
    is_active,
    created_at,
    updated_at
)
SELECT 
    e.org_id,
    -- Generate username from employee_code (lowercase, no spaces)
    LOWER(REPLACE(e.employee_code, ' ', '_')),
    -- Generate email placeholder (can be updated later)
    COALESCE(e.personal_email, LOWER(e.employee_code) || '@placeholder.local'),
    e.personal_mobile,
    e.employee_code,
    e.first_name,
    e.last_name,
    e.employment_status = 'active',
    e.created_at,
    CURRENT_TIMESTAMP
FROM master.employees e
WHERE e.user_id IS NULL
ON CONFLICT (org_id, username) DO NOTHING;

-- Step 2: Link employees to their newly created org_users
UPDATE master.employees e
SET user_id = u.user_id,
    updated_at = CURRENT_TIMESTAMP
FROM master.org_users u
WHERE e.org_id = u.org_id
  AND e.employee_code = u.employee_code
  AND e.user_id IS NULL;

-- Step 3: Verify the linkage
DO $$
DECLARE
    unlinked_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO unlinked_count
    FROM master.employees
    WHERE user_id IS NULL;
    
    IF unlinked_count > 0 THEN
        RAISE NOTICE 'Warning: % employees still have no linked org_user', unlinked_count;
    ELSE
        RAISE NOTICE 'Success: All employees are now linked to org_users';
    END IF;
END $$;

-- Step 4: Add helpful comment
COMMENT ON COLUMN master.employees.user_id IS 
    'Links to master.org_users - every employee should have an org_user record for system access';

-- =============================================
-- FUTURE AUTOMATION: Trigger to auto-create org_user for new employees
-- =============================================

-- Function to auto-create org_user when employee is inserted without user_id
CREATE OR REPLACE FUNCTION master.auto_create_org_user_for_employee()
RETURNS TRIGGER AS $$
DECLARE
    new_user_id INTEGER;
BEGIN
    -- Only create if user_id is not provided
    IF NEW.user_id IS NULL THEN
        -- Create org_user record
        INSERT INTO master.org_users (
            org_id,
            username,
            email,
            mobile_number,
            employee_code,
            first_name,
            last_name,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            NEW.org_id,
            LOWER(REPLACE(NEW.employee_code, ' ', '_')),
            COALESCE(NEW.personal_email, LOWER(NEW.employee_code) || '@placeholder.local'),
            NEW.personal_mobile,
            NEW.employee_code,
            NEW.first_name,
            NEW.last_name,
            NEW.employment_status = 'active',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (org_id, username) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING user_id INTO new_user_id;
        
        -- Link the employee to the new/existing org_user
        NEW.user_id := new_user_id;
        
        RAISE NOTICE 'Auto-created org_user (id: %) for employee %', new_user_id, NEW.employee_code;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on employee insert
DROP TRIGGER IF EXISTS trg_auto_create_org_user ON master.employees;
CREATE TRIGGER trg_auto_create_org_user
    BEFORE INSERT ON master.employees
    FOR EACH ROW
    EXECUTE FUNCTION master.auto_create_org_user_for_employee();

-- Add comment explaining the automation
COMMENT ON FUNCTION master.auto_create_org_user_for_employee() IS 
    'Automatically creates an org_user record when an employee is added without user_id';
