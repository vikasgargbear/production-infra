-- =====================================================
-- Final Trigger Fix for Invoice Module
-- =====================================================
-- This script drops all problematic triggers that were causing invoice creation failures

-- 1. Drop the calculate_gst_on_invoice_item_trigger 
--    (References non-existent master.branches table)
DROP TRIGGER IF EXISTS calculate_gst_on_invoice_item_trigger ON sales.invoice_items CASCADE;
DROP FUNCTION IF EXISTS calculate_gst_on_invoice_item() CASCADE;

-- 2. Drop sync_order_invoice_status triggers
--    (References non-existent invoice_id column in orders table)
DROP TRIGGER IF EXISTS trigger_sync_order_invoice_status ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS sync_order_invoice_status_trigger ON sales.invoices CASCADE;
DROP FUNCTION IF EXISTS sync_order_invoice_status() CASCADE;

-- 3. Drop inventory update trigger
--    (Expects non-existent batch_allocation field)
DROP TRIGGER IF EXISTS trigger_inventory_update_on_sale ON sales.invoice_items CASCADE;
DROP FUNCTION IF EXISTS update_inventory_on_sale() CASCADE;

-- 4. Drop update_invoice_totals_trigger if it exists
--    (May reference wrong column names)
DROP TRIGGER IF EXISTS update_invoice_totals_trigger ON sales.invoice_items CASCADE;
DROP FUNCTION IF EXISTS update_invoice_totals() CASCADE;

-- 5. Drop any analytics/KPI triggers that might interfere
DROP TRIGGER IF EXISTS trigger_update_kpi_on_invoice ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_realtime_analytics ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS calculate_invoice_analytics_trigger ON sales.invoices CASCADE;

-- Verify triggers are removed
SELECT 
    'Remaining triggers on invoice tables:' as status,
    COUNT(*) as count
FROM information_schema.triggers 
WHERE event_object_schema = 'sales' 
AND event_object_table IN ('invoices', 'invoice_items', 'orders', 'order_items');

-- Show any remaining triggers for review
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers 
WHERE event_object_schema = 'sales' 
AND event_object_table IN ('invoices', 'invoice_items', 'orders', 'order_items')
ORDER BY event_object_table, trigger_name;