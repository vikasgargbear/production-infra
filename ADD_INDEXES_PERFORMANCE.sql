-- ========================================
-- CRITICAL PERFORMANCE FIX
-- Add org_id indexes to master schema tables
-- Run this on Railway database immediately
-- ========================================

-- employees table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_org_id ON master.employees(org_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_org_active ON master.employees(org_id, employment_status) WHERE employment_status = 'active';

-- departments table  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_org_id ON master.departments(org_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_org_active ON master.departments(org_id, is_active) WHERE is_active = true;

-- org_branches table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_branches_org_id ON master.org_branches(org_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_branches_org_active ON master.org_branches(org_id, is_active) WHERE is_active = true;

-- ANALYZE for query planner
ANALYZE master.employees;
ANALYZE master.departments;
ANALYZE master.org_branches;
