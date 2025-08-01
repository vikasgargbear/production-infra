-- =============================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- =============================================
-- Comprehensive indexes for optimal query performance
-- across all schemas and tables
-- =============================================

-- Suppress notices for existing indexes
SET client_min_messages TO WARNING;

-- =============================================
-- MASTER SCHEMA INDEXES
-- =============================================

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_active ON master.organizations(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_organizations_gst ON master.organizations(gst_number) WHERE gst_number IS NOT NULL;

-- Org Branches
CREATE INDEX IF NOT EXISTS idx_org_branches_org_active ON master.org_branches(org_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_org_branches_type ON master.org_branches(branch_type, is_active);
CREATE INDEX IF NOT EXISTS idx_org_branches_gst ON master.org_branches(branch_gst_number) WHERE branch_gst_number IS NOT NULL;

-- Org Users
CREATE INDEX IF NOT EXISTS idx_org_users_org ON master.org_users(org_id);
CREATE INDEX IF NOT EXISTS idx_org_users_email ON master.org_users(email);
CREATE INDEX IF NOT EXISTS idx_org_users_active ON master.org_users(is_active) WHERE is_active = TRUE;

-- Addresses
CREATE INDEX IF NOT EXISTS idx_addresses_org ON master.addresses(org_id);
CREATE INDEX IF NOT EXISTS idx_addresses_entity ON master.addresses(entity_type, entity_id);

-- =============================================
-- INVENTORY SCHEMA INDEXES
-- =============================================

-- Products
CREATE INDEX IF NOT EXISTS idx_products_org_active ON inventory.products(org_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_category ON inventory.products(category_id, is_active) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_hsn ON inventory.products(hsn_code) WHERE hsn_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_name_search ON inventory.products USING gin(to_tsvector('english', product_name));
CREATE INDEX IF NOT EXISTS idx_products_generic_search ON inventory.products USING gin(to_tsvector('english', COALESCE(generic_name, ''))) WHERE generic_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_reorder ON inventory.products(org_id, reorder_level) WHERE reorder_level IS NOT NULL AND is_active = TRUE;

-- Batches
CREATE INDEX IF NOT EXISTS idx_batches_product_active ON inventory.batches(product_id, batch_status) WHERE batch_status = 'active';
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory.batches(expiry_date, batch_status) WHERE batch_status = 'active';
CREATE INDEX IF NOT EXISTS idx_batches_supplier ON inventory.batches(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batches_quantity ON inventory.batches(product_id, quantity_available) WHERE quantity_available > 0;

-- Storage Locations
CREATE INDEX IF NOT EXISTS idx_storage_locations_branch ON inventory.storage_locations(branch_id);
CREATE INDEX IF NOT EXISTS idx_storage_locations_type ON inventory.storage_locations(location_type);
CREATE INDEX IF NOT EXISTS idx_storage_locations_active ON inventory.storage_locations(is_active) WHERE is_active = TRUE;

-- Location Wise Stock
CREATE INDEX IF NOT EXISTS idx_location_stock_product ON inventory.location_wise_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_location_stock_batch ON inventory.location_wise_stock(batch_id);
CREATE INDEX IF NOT EXISTS idx_location_stock_location ON inventory.location_wise_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_location_stock_available ON inventory.location_wise_stock(quantity_available) WHERE quantity_available > 0;

-- Inventory Movements
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory.inventory_movements(movement_type, movement_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch ON inventory.inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON inventory.inventory_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON inventory.inventory_movements(reference_type, reference_id);

-- Stock Reservations
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product ON inventory.stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON inventory.stock_reservations(reservation_status);

-- =============================================
-- PARTIES SCHEMA INDEXES
-- =============================================

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_org ON parties.customers(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_code ON parties.customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_name ON parties.customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON parties.customers(primary_phone) WHERE primary_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_active ON parties.customers(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_customers_grade ON parties.customers(customer_grade) WHERE customer_grade IS NOT NULL;

-- Suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_org_active ON parties.suppliers(org_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_suppliers_name_search ON parties.suppliers USING gin(to_tsvector('english', supplier_name));
CREATE INDEX IF NOT EXISTS idx_suppliers_gst ON parties.suppliers(gst_number) WHERE gst_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_category ON parties.suppliers(supplier_category);

-- Customer Category index (column on customers table)
CREATE INDEX IF NOT EXISTS idx_customers_category ON parties.customers(customer_category) WHERE customer_category IS NOT NULL;

-- =============================================
-- SALES SCHEMA INDEXES
-- =============================================

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_org_date ON sales.orders(org_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON sales.orders(customer_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON sales.orders(order_status, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_branch ON sales.orders(branch_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment ON sales.orders(fulfillment_status) WHERE fulfillment_status != 'fulfilled';
CREATE INDEX IF NOT EXISTS idx_orders_salesperson ON sales.orders(salesperson_id, order_date);

-- Order Items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON sales.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON sales.order_items(product_id);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_org_date ON sales.invoices(org_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON sales.invoices(customer_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON sales.invoices(invoice_status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON sales.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON sales.invoices(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_due ON sales.invoices(due_date, invoice_status) WHERE invoice_status = 'posted';
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON sales.invoices(branch_id, invoice_date);

-- Invoice Items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON sales.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON sales.invoice_items(product_id);

-- Sales Returns
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales.sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales.sales_returns(customer_id, return_date);
CREATE INDEX IF NOT EXISTS idx_sales_returns_status ON sales.sales_returns(approval_status) WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sales_returns_credit_note ON sales.sales_returns(credit_note_status) WHERE credit_note_status = 'pending';

-- Price Lists
CREATE INDEX IF NOT EXISTS idx_price_lists_active ON sales.price_lists(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_price_lists_org ON sales.price_lists(org_id, is_active);

-- Price List Items
CREATE INDEX IF NOT EXISTS idx_price_list_items_list ON sales.price_list_items(price_list_id, is_active);
CREATE INDEX IF NOT EXISTS idx_price_list_items_product ON sales.price_list_items(product_id, is_active);

-- Sales Schemes
CREATE INDEX IF NOT EXISTS idx_sales_schemes_active ON sales.sales_schemes(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sales_schemes_products ON sales.sales_schemes USING GIN(applicable_products);

-- =============================================
-- PROCUREMENT SCHEMA INDEXES
-- =============================================

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_po_org_date ON procurement.purchase_orders(org_id, po_date);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON procurement.purchase_orders(supplier_id, po_date);
CREATE INDEX IF NOT EXISTS idx_po_status ON procurement.purchase_orders(po_status, po_date);
CREATE INDEX IF NOT EXISTS idx_po_number ON procurement.purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_branch ON procurement.purchase_orders(branch_id, po_date);

-- Purchase Order Items
CREATE INDEX IF NOT EXISTS idx_po_items_po ON procurement.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product ON procurement.purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_po_items_pending ON procurement.purchase_order_items(purchase_order_id, received_quantity) WHERE ordered_quantity > COALESCE(received_quantity, 0);

-- GRN
CREATE INDEX IF NOT EXISTS idx_grn_org_date ON procurement.goods_receipt_notes(org_id, grn_date);
CREATE INDEX IF NOT EXISTS idx_grn_po ON procurement.goods_receipt_notes(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_grn_supplier ON procurement.goods_receipt_notes(supplier_id, grn_date);
CREATE INDEX IF NOT EXISTS idx_grn_status ON procurement.goods_receipt_notes(grn_status) WHERE grn_status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_grn_number ON procurement.goods_receipt_notes(grn_number);

-- GRN Items
CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON procurement.grn_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_product ON procurement.grn_items(product_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_batch ON procurement.grn_items(batch_number, product_id);

-- Supplier Invoices
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON procurement.supplier_invoices(supplier_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON procurement.supplier_invoices(invoice_status, due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due ON procurement.supplier_invoices(due_date, invoice_status) WHERE invoice_status = 'posted';

-- Purchase Requisitions
CREATE INDEX IF NOT EXISTS idx_requisitions_branch ON procurement.purchase_requisitions(branch_id, requisition_date);
CREATE INDEX IF NOT EXISTS idx_requisitions_status ON procurement.purchase_requisitions(requisition_status) WHERE requisition_status IN ('draft', 'pending_approval');

-- =============================================
-- FINANCIAL SCHEMA INDEXES
-- =============================================

-- Journal Entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON financial.journal_entries(journal_date, org_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON financial.journal_entries(entry_status) WHERE entry_status = 'draft';
CREATE INDEX IF NOT EXISTS idx_journal_entries_number ON financial.journal_entries(journal_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON financial.journal_entries(reference_type, reference_id);

-- Journal Entry Lines
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON financial.journal_entry_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON financial.journal_entry_lines(account_code);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_org_date ON financial.payments(org_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_party ON financial.payments(party_type, party_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON financial.payments(payment_status, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_allocation ON financial.payments(allocation_status) WHERE allocation_status != 'full';

-- Payment Allocations
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON financial.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_reference ON financial.payment_allocations(reference_type, reference_id);

-- PDC Management
CREATE INDEX IF NOT EXISTS idx_pdc_maturity ON financial.pdc_management(cheque_date, pdc_status) WHERE pdc_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pdc_party ON financial.pdc_management(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_pdc_status ON financial.pdc_management(pdc_status) WHERE pdc_status != 'cleared';

-- Customer Outstanding
CREATE INDEX IF NOT EXISTS idx_fin_customer_outstanding ON financial.customer_outstanding(customer_id, status) WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS idx_fin_outstanding_due ON financial.customer_outstanding(due_date, status);
CREATE INDEX IF NOT EXISTS idx_fin_outstanding_aging ON financial.customer_outstanding(aging_bucket, status);

-- Supplier Outstanding
CREATE INDEX IF NOT EXISTS idx_supplier_outstanding ON financial.supplier_outstanding(supplier_id, status) WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS idx_supplier_outstanding_due ON financial.supplier_outstanding(due_date, status);

-- =============================================
-- GST SCHEMA INDEXES
-- =============================================

-- GSTR1 Data
CREATE INDEX IF NOT EXISTS idx_gstr1_period ON gst.gstr1_data(org_id, return_period, filing_status);

-- GSTR2A Data
CREATE INDEX IF NOT EXISTS idx_gstr2a_period ON gst.gstr2a_data(org_id, return_period);

-- E-way Bills
CREATE INDEX IF NOT EXISTS idx_eway_bills_status ON gst.eway_bills(eway_bill_status) WHERE eway_bill_status = 'active';
CREATE INDEX IF NOT EXISTS idx_eway_bills_validity ON gst.eway_bills(valid_until) WHERE eway_bill_status = 'active';

-- =============================================
-- COMPLIANCE SCHEMA INDEXES
-- =============================================

-- Temperature Logs
CREATE INDEX IF NOT EXISTS idx_temp_logs_location_date ON compliance.temperature_logs(location_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_temp_logs_range ON compliance.temperature_logs(within_range, recorded_at) WHERE within_range = FALSE;

-- Narcotic Register
CREATE INDEX IF NOT EXISTS idx_narcotic_register_product ON compliance.narcotic_register(product_id, batch_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_narcotic_register_date ON compliance.narcotic_register(transaction_date, transaction_type);

-- Product Recalls
CREATE INDEX IF NOT EXISTS idx_recalls_product ON compliance.product_recalls(product_id);
CREATE INDEX IF NOT EXISTS idx_recalls_status ON compliance.product_recalls(recall_status) WHERE recall_status != 'closed';

-- Regulatory Inspections
CREATE INDEX IF NOT EXISTS idx_inspections_org_date ON compliance.regulatory_inspections(org_id, inspection_date);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON compliance.regulatory_inspections(inspection_status) WHERE inspection_status != 'closed';

-- Quality Deviations
CREATE INDEX IF NOT EXISTS idx_deviations_date ON compliance.quality_deviations(deviation_date, severity);
CREATE INDEX IF NOT EXISTS idx_deviations_status ON compliance.quality_deviations(deviation_status) WHERE deviation_status != 'closed';

-- =============================================
-- ANALYTICS SCHEMA INDEXES  
-- =============================================

-- KPI Values
CREATE INDEX IF NOT EXISTS idx_kpi_values_date ON analytics.kpi_values(calculation_date, kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_values_period ON analytics.kpi_values(period_type, calculation_date);

-- User Activity Analytics
CREATE INDEX IF NOT EXISTS idx_user_activity_date ON analytics.user_activity_analytics(activity_date, user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_org ON analytics.user_activity_analytics(org_id, activity_date);

-- Alert History
CREATE INDEX IF NOT EXISTS idx_alert_history_date ON analytics.alert_history(triggered_at, alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_status ON analytics.alert_history(alert_status) WHERE alert_status = 'active';

-- Data Quality Metrics
CREATE INDEX IF NOT EXISTS idx_data_quality_date ON analytics.data_quality_metrics(check_date, table_name);

-- Report Execution History
CREATE INDEX IF NOT EXISTS idx_report_execution_date ON analytics.report_execution_history(execution_date, template_id);
CREATE INDEX IF NOT EXISTS idx_report_execution_user ON analytics.report_execution_history(executed_by, execution_date);
CREATE INDEX IF NOT EXISTS idx_report_execution_org ON analytics.report_execution_history(org_id, execution_date);

-- =============================================
-- SYSTEM_CONFIG SCHEMA INDEXES
-- ==============================================

-- System Notifications
CREATE INDEX IF NOT EXISTS idx_system_notifications_created ON system_config.system_notifications(created_at, notification_type);
CREATE INDEX IF NOT EXISTS idx_system_notifications_priority ON system_config.system_notifications(priority, created_at) WHERE priority IN ('critical', 'high');

-- User Notifications
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON system_config.user_notifications(user_id, read_at) WHERE read_at IS NULL;

-- Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON system_config.audit_logs(user_id, activity_timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_activity ON system_config.audit_logs(entity_type, activity_type, activity_timestamp);

-- System Settings
CREATE INDEX IF NOT EXISTS idx_system_settings_org ON system_config.system_settings(org_id, setting_key);

-- Workflow Instances
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON system_config.workflow_instances(instance_status, created_at) WHERE instance_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_workflow_instances_reference ON system_config.workflow_instances(reference_type, reference_id);

-- API Usage Log
CREATE INDEX IF NOT EXISTS idx_api_usage_log_endpoint ON system_config.api_usage_log(endpoint, request_timestamp);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_user ON system_config.api_usage_log(user_id, request_timestamp);

-- =============================================
-- FULL TEXT SEARCH INDEXES
-- =============================================

-- Product search
CREATE INDEX IF NOT EXISTS idx_products_full_text ON inventory.products 
USING gin(
    to_tsvector('english', 
        COALESCE(product_name, '') || ' ' || 
        COALESCE(generic_name, '') || ' ' || 
        COALESCE(manufacturer, '')
    )
);

-- Customer search
CREATE INDEX IF NOT EXISTS idx_customers_full_text ON parties.customers 
USING gin(
    to_tsvector('english', 
        COALESCE(customer_name, '') || ' ' || 
        COALESCE(contact_person_name, '')
    )
);

-- Supplier search
CREATE INDEX IF NOT EXISTS idx_suppliers_full_text ON parties.suppliers 
USING gin(
    to_tsvector('english', 
        COALESCE(supplier_name, '') || ' ' || 
        COALESCE(contact_person_name, '')
    )
);

-- =============================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- =============================================

-- Invoice with customer and date
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date_status ON sales.invoices(customer_id, invoice_date, invoice_status);

-- Stock by product and location
CREATE INDEX IF NOT EXISTS idx_stock_product_location_available ON inventory.location_wise_stock(product_id, location_id, quantity_available);

-- Outstanding by customer and age
CREATE INDEX IF NOT EXISTS idx_outstanding_customer_age ON financial.customer_outstanding(customer_id, days_overdue, outstanding_amount);

-- Orders pending fulfillment
CREATE INDEX IF NOT EXISTS idx_orders_pending_fulfillment ON sales.orders(branch_id, fulfillment_status, order_date) 
WHERE fulfillment_status IN ('pending', 'partial');

-- Expiring batches
CREATE INDEX IF NOT EXISTS idx_batches_expiring ON inventory.batches(expiry_date, product_id, quantity_available) 
WHERE batch_status = 'active' AND quantity_available > 0;

-- =============================================
-- PERFORMANCE MONITORING
-- =============================================

-- Create extension for monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Function to analyze index usage
CREATE OR REPLACE FUNCTION analyze_index_usage()
RETURNS TABLE (
    schemaname TEXT,
    tablename TEXT,
    indexname TEXT,
    index_size TEXT,
    times_used BIGINT,
    usage_ratio NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.schemaname,
        s.tablename,
        s.indexname,
        pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
        COALESCE(i.idx_scan, 0) as times_used,
        ROUND(
            CASE 
                WHEN t.seq_scan + t.idx_scan > 0 
                THEN 100.0 * i.idx_scan / (t.seq_scan + t.idx_scan)
                ELSE 0
            END, 2
        ) as usage_ratio
    FROM pg_stat_user_indexes i
    JOIN pg_indexes s ON i.indexrelname = s.indexname AND i.schemaname = s.schemaname
    JOIN pg_stat_user_tables t ON i.tablename = t.tablename AND i.schemaname = t.schemaname
    WHERE s.schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY s.schemaname, s.tablename, s.indexname;
END;
$$ LANGUAGE plpgsql;

-- Reset message level
RESET client_min_messages;

-- =============================================
-- MAINTENANCE RECOMMENDATIONS
-- =============================================
COMMENT ON FUNCTION analyze_index_usage() IS 'Analyze index usage to identify unused or rarely used indexes';

/*
Maintenance Schedule:
1. Run ANALYZE weekly on all tables
2. Run VACUUM ANALYZE monthly on high-transaction tables
3. Review index usage quarterly using analyze_index_usage()
4. Rebuild indexes annually or when fragmentation > 30%

High-Priority Tables for Maintenance:
- inventory.inventory_movements
- sales.invoices
- sales.invoice_items
- financial.journal_entry_lines
- inventory.location_wise_stock
*/