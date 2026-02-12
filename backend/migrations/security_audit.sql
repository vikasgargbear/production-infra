-- =============================================================================
-- Security Audit Migration
-- Date: 2026-02-08
-- Description: Adds updated_by columns, soft delete pattern, and audit trigger
--
-- Verified table locations:
--   sales.invoices, sales.orders, sales.sales_returns
--   financial.payments, financial.credit_notes, financial.debit_notes, financial.journal_entries
--   inventory.products, inventory.batches
--   master.organizations
--   parties.customers, parties.suppliers
--   procurement.purchase_orders, procurement.supplier_invoices
-- =============================================================================

-- ============================
-- Phase 4.1: Add updated_by to critical tables
-- ============================
DO $$ BEGIN
    -- Sales tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='invoices' AND column_name='updated_by') THEN
        ALTER TABLE sales.invoices ADD COLUMN updated_by INTEGER;
    END IF;
    -- sales.orders already has updated_by (verified)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='sales_returns' AND column_name='updated_by') THEN
        ALTER TABLE sales.sales_returns ADD COLUMN updated_by INTEGER;
    END IF;

    -- Financial tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='financial' AND table_name='payments' AND column_name='updated_by') THEN
        ALTER TABLE financial.payments ADD COLUMN updated_by INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='financial' AND table_name='credit_notes' AND column_name='updated_by') THEN
        ALTER TABLE financial.credit_notes ADD COLUMN updated_by INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='financial' AND table_name='debit_notes' AND column_name='updated_by') THEN
        ALTER TABLE financial.debit_notes ADD COLUMN updated_by INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='financial' AND table_name='journal_entries' AND column_name='updated_by') THEN
        ALTER TABLE financial.journal_entries ADD COLUMN updated_by INTEGER;
    END IF;

    -- Inventory tables (products lives in inventory schema, NOT master)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='inventory' AND table_name='products' AND column_name='updated_by') THEN
        ALTER TABLE inventory.products ADD COLUMN updated_by INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='inventory' AND table_name='batches' AND column_name='updated_by') THEN
        ALTER TABLE inventory.batches ADD COLUMN updated_by INTEGER;
    END IF;

    -- Master tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='master' AND table_name='organizations' AND column_name='updated_by') THEN
        ALTER TABLE master.organizations ADD COLUMN updated_by INTEGER;
    END IF;

    -- Parties tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='parties' AND table_name='customers' AND column_name='updated_by') THEN
        ALTER TABLE parties.customers ADD COLUMN updated_by INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='parties' AND table_name='suppliers' AND column_name='updated_by') THEN
        ALTER TABLE parties.suppliers ADD COLUMN updated_by INTEGER;
    END IF;

    -- Procurement tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='procurement' AND table_name='purchase_orders' AND column_name='updated_by') THEN
        ALTER TABLE procurement.purchase_orders ADD COLUMN updated_by INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='procurement' AND table_name='supplier_invoices' AND column_name='updated_by') THEN
        ALTER TABLE procurement.supplier_invoices ADD COLUMN updated_by INTEGER;
    END IF;
END $$;


-- ============================
-- Phase 4.2: Soft Delete on critical tables
-- ============================
DO $$ BEGIN
    -- Sales invoices
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='invoices' AND column_name='is_deleted') THEN
        ALTER TABLE sales.invoices ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE sales.invoices ADD COLUMN deleted_at TIMESTAMPTZ;
        ALTER TABLE sales.invoices ADD COLUMN deleted_by INTEGER;
    END IF;

    -- Sales orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='orders' AND column_name='is_deleted') THEN
        ALTER TABLE sales.orders ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE sales.orders ADD COLUMN deleted_at TIMESTAMPTZ;
        ALTER TABLE sales.orders ADD COLUMN deleted_by INTEGER;
    END IF;

    -- Payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='financial' AND table_name='payments' AND column_name='is_deleted') THEN
        ALTER TABLE financial.payments ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE financial.payments ADD COLUMN deleted_at TIMESTAMPTZ;
        ALTER TABLE financial.payments ADD COLUMN deleted_by INTEGER;
    END IF;

    -- Products (inventory.products, NOT master.products)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='inventory' AND table_name='products' AND column_name='is_deleted') THEN
        ALTER TABLE inventory.products ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE inventory.products ADD COLUMN deleted_at TIMESTAMPTZ;
        ALTER TABLE inventory.products ADD COLUMN deleted_by INTEGER;
    END IF;

    -- Customers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='parties' AND table_name='customers' AND column_name='is_deleted') THEN
        ALTER TABLE parties.customers ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE parties.customers ADD COLUMN deleted_at TIMESTAMPTZ;
        ALTER TABLE parties.customers ADD COLUMN deleted_by INTEGER;
    END IF;

    -- Suppliers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='parties' AND table_name='suppliers' AND column_name='is_deleted') THEN
        ALTER TABLE parties.suppliers ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE parties.suppliers ADD COLUMN deleted_at TIMESTAMPTZ;
        ALTER TABLE parties.suppliers ADD COLUMN deleted_by INTEGER;
    END IF;

    -- Purchase orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='procurement' AND table_name='purchase_orders' AND column_name='is_deleted') THEN
        ALTER TABLE procurement.purchase_orders ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE procurement.purchase_orders ADD COLUMN deleted_at TIMESTAMPTZ;
        ALTER TABLE procurement.purchase_orders ADD COLUMN deleted_by INTEGER;
    END IF;

    -- Sales returns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='sales' AND table_name='sales_returns' AND column_name='is_deleted') THEN
        ALTER TABLE sales.sales_returns ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE sales.sales_returns ADD COLUMN deleted_at TIMESTAMPTZ;
        ALTER TABLE sales.sales_returns ADD COLUMN deleted_by INTEGER;
    END IF;
END $$;


-- ============================
-- Phase 4.3: Audit Trail Trigger
-- Uses EXISTING system_config.audit_logs table (already has 25 columns).
-- Trigger writes to the existing schema: activity_type, entity_type, entity_id,
-- old_values, new_values, activity_timestamp.
-- ============================

-- Create or replace audit trigger function using existing audit_logs schema
CREATE OR REPLACE FUNCTION system_config.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    record_pk TEXT;
BEGIN
    -- Try to get the primary key value
    IF TG_OP = 'DELETE' THEN
        record_pk := COALESCE(OLD.id::TEXT, '');
    ELSE
        record_pk := COALESCE(NEW.id::TEXT, '');
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO system_config.audit_logs (
            activity_type, entity_type, entity_id, new_values, activity_timestamp, module_name
        ) VALUES (
            'INSERT', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, record_pk,
            row_to_json(NEW)::JSONB, NOW(), TG_TABLE_SCHEMA
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO system_config.audit_logs (
            activity_type, entity_type, entity_id, old_values, new_values, activity_timestamp, module_name
        ) VALUES (
            'UPDATE', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, record_pk,
            row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, NOW(), TG_TABLE_SCHEMA
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO system_config.audit_logs (
            activity_type, entity_type, entity_id, old_values, activity_timestamp, module_name
        ) VALUES (
            'DELETE', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, record_pk,
            row_to_json(OLD)::JSONB, NOW(), TG_TABLE_SCHEMA
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to critical tables
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT schema_name, table_name FROM (VALUES
            ('sales', 'invoices'),
            ('sales', 'orders'),
            ('sales', 'sales_returns'),
            ('financial', 'payments'),
            ('financial', 'credit_notes'),
            ('financial', 'debit_notes'),
            ('procurement', 'purchase_orders'),
            ('procurement', 'supplier_invoices')
        ) AS t(schema_name, table_name)
    LOOP
        -- Drop existing trigger if any
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_audit_%I ON %I.%I',
            tbl.table_name, tbl.schema_name, tbl.table_name
        );
        -- Create new trigger
        EXECUTE format(
            'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION system_config.audit_trigger_func()',
            tbl.table_name, tbl.schema_name, tbl.table_name
        );
    END LOOP;
END $$;

-- Add indexes on existing audit_logs for the new trigger usage
CREATE INDEX IF NOT EXISTS idx_audit_logs_activity_type ON system_config.audit_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON system_config.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_activity_ts ON system_config.audit_logs(activity_timestamp);

-- Verify
SELECT 'Security audit migration complete' AS status;
