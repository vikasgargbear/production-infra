-- Migration: Production-grade inventory overhaul
-- Date: 2026-02-06
-- Context: Multiple inventory issues blocking product launch.
--          Moves legacy tables from public schema to proper schemas,
--          adds audit trigger for batch quantity changes.

-- =========================================================================
-- 1. Move legacy tables from public schema to proper schemas
-- =========================================================================

-- Move stock_writeoffs to inventory schema (was in public)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_writeoffs') THEN
        ALTER TABLE public.stock_writeoffs SET SCHEMA inventory;
        RAISE NOTICE 'Moved stock_writeoffs to inventory schema';
    ELSE
        RAISE NOTICE 'stock_writeoffs already in correct schema or does not exist';
    END IF;
END $$;

-- Move stock_writeoff_items to inventory schema (was in public)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_writeoff_items') THEN
        ALTER TABLE public.stock_writeoff_items SET SCHEMA inventory;
        RAISE NOTICE 'Moved stock_writeoff_items to inventory schema';
    ELSE
        RAISE NOTICE 'stock_writeoff_items already in correct schema or does not exist';
    END IF;
END $$;

-- Move gst_adjustments to compliance schema (was in public)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gst_adjustments') THEN
        ALTER TABLE public.gst_adjustments SET SCHEMA compliance;
        RAISE NOTICE 'Moved gst_adjustments to compliance schema';
    ELSE
        RAISE NOTICE 'gst_adjustments already in correct schema or does not exist';
    END IF;
END $$;

-- =========================================================================
-- 2. Audit trigger for batch quantity changes
--    Any direct UPDATE to batches.quantity_available creates an audit trail
--    in inventory.inventory_movements
-- =========================================================================

CREATE OR REPLACE FUNCTION inventory.audit_batch_quantity_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.quantity_available IS DISTINCT FROM NEW.quantity_available THEN
    INSERT INTO inventory.inventory_movements (
      org_id, product_id, batch_id, movement_type, movement_direction,
      quantity, movement_date, reason, created_by
    ) VALUES (
      NEW.org_id, NEW.product_id, NEW.batch_id,
      'system_audit',
      CASE WHEN NEW.quantity_available > OLD.quantity_available THEN 'in' ELSE 'out' END,
      ABS(NEW.quantity_available - OLD.quantity_available),
      CURRENT_DATE,
      'Automatic audit of batch quantity change',
      0
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_batch_quantity'
    ) THEN
        CREATE TRIGGER trg_audit_batch_quantity
            AFTER UPDATE OF quantity_available ON inventory.batches
            FOR EACH ROW
            EXECUTE FUNCTION inventory.audit_batch_quantity_change();
        RAISE NOTICE 'Created audit trigger on inventory.batches';
    ELSE
        RAISE NOTICE 'Audit trigger already exists';
    END IF;
END $$;
