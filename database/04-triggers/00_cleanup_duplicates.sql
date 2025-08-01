-- =============================================
-- CLEANUP DUPLICATE TRIGGERS AND INDEXES
-- =============================================
-- Run this before creating triggers to avoid conflicts
-- Note: We have duplicate files that create same triggers
-- Files renamed to .duplicate: 07_gst_triggers.sql, 08_compliance_triggers.sql
-- =============================================

-- Drop duplicate triggers (they'll be recreated)
DROP TRIGGER IF EXISTS trigger_populate_gstr1 ON sales.invoices CASCADE;
DROP TRIGGER IF EXISTS trigger_reconcile_gstr2a ON gst.gstr2a_data CASCADE;
DROP TRIGGER IF EXISTS trigger_calculate_gst_invoice_item ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS trigger_calculate_gst_liability ON gst.gst_liability CASCADE;
DROP TRIGGER IF EXISTS trigger_check_itc_eligibility ON gst.gst_credit_ledger CASCADE;
DROP TRIGGER IF EXISTS trigger_check_eway_bill ON sales.delivery_challans CASCADE;
DROP TRIGGER IF EXISTS trigger_gst_filing_reminders ON gst.gstr1_data CASCADE;
DROP TRIGGER IF EXISTS trigger_validate_hsn_products ON inventory.products CASCADE;
DROP TRIGGER IF EXISTS trigger_license_expiry_alerts ON compliance.org_licenses CASCADE;
DROP TRIGGER IF EXISTS trigger_narcotic_balance_check ON compliance.narcotic_register CASCADE;
DROP TRIGGER IF EXISTS trigger_inspection_followup ON compliance.regulatory_inspections CASCADE;
DROP TRIGGER IF EXISTS trigger_environmental_breach_check ON compliance.environmental_compliance CASCADE;
DROP TRIGGER IF EXISTS trigger_calculate_compliance_score ON compliance.org_compliance_status CASCADE;
DROP TRIGGER IF EXISTS trigger_document_expiry_tracking ON parties.suppliers CASCADE;

-- Drop duplicate indexes (they'll be recreated with IF NOT EXISTS)
DROP INDEX IF EXISTS idx_gstr1_period;
DROP INDEX IF EXISTS idx_gstr2a_period;
DROP INDEX IF EXISTS idx_gst_liability_period;
DROP INDEX IF EXISTS idx_licenses_expiry;
DROP INDEX IF EXISTS idx_gst_rates_lookup;
DROP INDEX IF EXISTS idx_supplier_invoices_gst;
DROP INDEX IF EXISTS idx_narcotic_register_lookup;
DROP INDEX IF EXISTS idx_inspections_followup;
DROP INDEX IF EXISTS idx_environmental_breaches;