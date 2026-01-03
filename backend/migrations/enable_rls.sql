-- =====================================================
-- PostgreSQL Row-Level Security (RLS) for Multi-Tenancy
-- =====================================================
-- Defense in depth: Works alongside TenantAwareSession
-- Prevents cross-tenant access even if application has bugs
--
-- Usage: Set session variable before queries:
--   SET app.org_id = 'your-org-uuid';
-- =====================================================

-- Helper function to get current tenant org_id
CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS uuid AS $$
BEGIN
    RETURN COALESCE(
        current_setting('app.org_id', true)::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN '00000000-0000-0000-0000-000000000000'::uuid;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =====================================================
-- ANALYTICS SCHEMA
-- =====================================================
ALTER TABLE analytics.alert_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.alert_definitions
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE analytics.dashboard_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.dashboard_cache
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE analytics.dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.dashboards
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE analytics.data_quality_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.data_quality_metrics
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE analytics.kpi_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.kpi_definitions
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE analytics.report_execution_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.report_execution_history
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE analytics.report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.report_schedules
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE analytics.report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.report_templates
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE analytics.user_activity_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics.user_activity_analytics
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- COMPLIANCE SCHEMA
-- =====================================================
ALTER TABLE compliance.compliance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.compliance_alerts
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.compliance_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.compliance_audits
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.compliance_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.compliance_documents
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.compliance_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.compliance_violations
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.corrective_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.corrective_actions
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.drug_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.drug_licenses
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.environmental_compliance ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.environmental_compliance
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.expired_destructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.expired_destructions
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.inspector_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.inspector_visits
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.narcotic_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.narcotic_register
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.org_compliance_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.org_compliance_status
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.org_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.org_licenses
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.pharmacist_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.pharmacist_registrations
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.product_recalls ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.product_recalls
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.quality_control_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.quality_control_tests
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.quality_deviations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.quality_deviations
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.regulatory_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.regulatory_inspections
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.temperature_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.temperature_logs
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE compliance.temperature_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance.temperature_zones
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- FINANCIAL SCHEMA
-- =====================================================
ALTER TABLE financial.bank_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.bank_reconciliations
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.cash_flow_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.cash_flow_forecast
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.chart_of_accounts
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.customer_outstanding ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.customer_outstanding
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.expense_categories
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.expense_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.expense_claims
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.journal_entries
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.payment_methods
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.payments
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.pdc_management ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.pdc_management
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE financial.supplier_outstanding ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial.supplier_outstanding
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- GST SCHEMA
-- =====================================================
ALTER TABLE gst.compliance_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst.compliance_calendar
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE gst.eway_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst.eway_bills
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE gst.gst_audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst.gst_audit_trail
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE gst.gst_credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst.gst_credit_ledger
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE gst.gst_liability ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst.gst_liability
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE gst.gst_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst.gst_rates
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE gst.gst_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst.gst_reconciliation
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE gst.gstr1_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst.gstr1_data
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- INVENTORY SCHEMA
-- =====================================================
ALTER TABLE inventory.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory.batches
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE inventory.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory.inventory_movements
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE inventory.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory.product_categories
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE inventory.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory.products
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- MASTER SCHEMA
-- =====================================================
ALTER TABLE master.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON master.addresses
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE master.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON master.employees
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE master.org_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON master.org_bank_accounts
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE master.org_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON master.org_branches
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE master.org_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON master.org_users
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- PARTIES SCHEMA
-- =====================================================
ALTER TABLE parties.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON parties.customers
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE parties.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON parties.suppliers
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- PROCUREMENT SCHEMA
-- =====================================================
ALTER TABLE procurement.goods_receipt_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.goods_receipt_notes
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE procurement.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.purchase_orders
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE procurement.purchase_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.purchase_returns
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE procurement.supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.supplier_invoices
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- SALES SCHEMA
-- =====================================================
ALTER TABLE sales.delivery_challans ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales.delivery_challans
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE sales.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales.invoices
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE sales.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales.orders
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

ALTER TABLE sales.sales_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales.sales_returns
    USING (org_id = get_current_org_id())
    WITH CHECK (org_id = get_current_org_id());

-- =====================================================
-- Superuser bypass (for migrations, admin tools)
-- =====================================================
-- Note: Superusers bypass RLS by default in PostgreSQL
-- For application admin users, set: SET app.org_id = 'admin-bypass-uuid';

COMMENT ON FUNCTION get_current_org_id() IS 'Returns current tenant org_id from session variable app.org_id';
