-- Database Maintenance Script: Drop Problematic Triggers
-- Use: Connect to database and run this script manually
-- Security: Admin-only access required

-- Drop problematic triggers from invoices table
DROP TRIGGER IF EXISTS trigger_credit_update_on_invoice ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_invoice_cash_flow_impact ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_sales_target_tracking ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_populate_gstr1 ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_cache_refresh_invoices ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_calculate_invoice_totals ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS invoice_totals_trigger ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS calculate_invoice_totals_trigger ON sales.invoices CASCADE;

-- Drop problematic triggers from invoice_items table
DROP TRIGGER IF EXISTS trigger_credit_update_on_invoice ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS trigger_invoice_cash_flow_impact ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS trigger_sales_target_tracking ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS trigger_populate_gstr1 ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS trigger_cache_refresh_invoices ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS trigger_calculate_invoice_totals ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS invoice_totals_trigger ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS calculate_invoice_totals_trigger ON sales.invoice_items CASCADE;

-- Success message
SELECT 'Problematic triggers dropped successfully' as status;