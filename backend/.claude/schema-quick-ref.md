# SCHEMA QUICK REFERENCE - ALWAYS USE THESE PREFIXES!

## ⚠️ CRITICAL: Never use table names without schema prefix!

### MASTER SCHEMA (master.)
- `master.organizations` - Organization/company master data
- `master.org_branches` - Branch/location management
- `master.org_users` - User management
- `master.products` - Product master (deprecated - use inventory.products)
- `master.product_categories` - Product categorization
- `master.tax_rates` - Tax rate configuration
- `master.number_series` - Document numbering
- `master.addresses` - Address management (linked via entity_id)

### PARTIES SCHEMA (parties.)
- `parties.customers` - Customer master (phone✓, address_line1✓ required)
- `parties.suppliers` - Supplier master
- `parties.customer_contacts` - Customer contact persons
- `parties.supplier_contacts` - Supplier contact persons
- `parties.customer_groups` - Customer grouping (uses discount_percent)
- `parties.territories` - Territory management
- `parties.routes` - Delivery routes

### INVENTORY SCHEMA (inventory.)
- `inventory.products` - Product master (main) - has gst_percentage, selling_price
- `inventory.batches` - Batch-wise inventory (sale_price_per_unit, quantity_available)
- `inventory.location_wise_stock` - Stock by location
- `inventory.storage_locations` - Warehouse locations
- `inventory.inventory_movements` - Stock movement tracking
- `inventory.stock_reservations` - Reserved stock
- `inventory.stock_adjustments` - Manual adjustments
- `inventory.product_suppliers` - Product-supplier mapping (discount_percent)

### SALES SCHEMA (sales.)
- `sales.orders` - Sales orders
- `sales.order_items` - Order line items (uses discount_percent, cgst_rate/sgst_rate)
- `sales.invoices` - Sales invoices
- `sales.invoice_items` - Invoice line items (⚠️ See critical notes below)
- `sales.delivery_challans` - Delivery documents
- `sales.sales_returns` - Return management
- `sales.sales_return_items` - Return line items

### PROCUREMENT SCHEMA (procurement.)
- `procurement.purchase_orders` - Purchase orders (uses discount_percent)
- `procurement.purchase_order_items` - PO line items (cgst_rate/sgst_rate, line_total)
- `procurement.goods_receipt_notes` - GRN documents
- `procurement.grn_items` - GRN line items
- `procurement.purchase_requisitions` - Purchase requests
- `procurement.supplier_quotations` - Supplier quotes
- `procurement.supplier_quotation_items` - Quote items (discount_percent)

### FINANCIAL SCHEMA (financial.)
- `financial.chart_of_accounts` - Account ledgers
- `financial.journal_entries` - Journal vouchers
- `financial.journal_entry_lines` - Journal line items
- `financial.payments` - Payment records
- `financial.payment_allocations` - Payment allocation
- `financial.customer_outstanding` - Customer balances
- `financial.supplier_outstanding` - Supplier balances
- `financial.bank_reconciliation` - Bank reconciliation

### GST SCHEMA (gst.)
- `gst.gst_returns` - GST return filing
- `gst.gstr1_data` - GSTR-1 sales data
- `gst.gstr2a_data` - GSTR-2A purchase data
- `gst.e_invoices` - E-invoice generation
- `gst.e_way_bills` - E-way bill generation
- `gst.gst_ledger` - GST ledger entries
- `gst.gst_rates` - GST rate master

### COMPLIANCE SCHEMA (compliance.)
- `compliance.org_licenses` - License management
- `compliance.narcotic_register` - Narcotic drug tracking
- `compliance.regulatory_inspections` - Inspection records
- `compliance.compliance_violations` - Violation tracking
- `compliance.sop_documents` - Standard procedures

### SYSTEM_CONFIG SCHEMA (system_config.)
- `system_config.system_settings` - System configuration
- `system_config.audit_logs` - Audit trail
- `system_config.system_notifications` - System alerts
- `system_config.scheduled_jobs` - Cron jobs
- `system_config.api_keys` - API key management

### ANALYTICS SCHEMA (analytics.)
- `analytics.daily_sales_summary` - Daily metrics
- `analytics.monthly_business_summary` - Monthly metrics (gross_margin_percent)
- `analytics.product_analytics` - Product performance (margin_percent)
- `analytics.customer_analytics` - Customer metrics
- `analytics.kpi_metrics` - KPI tracking

## 🔴 CRITICAL COLUMN NAMES FOR sales.invoice_items

### ✅ CORRECT Names (Use These):
- `discount_percent` (NOT discount_percentage)
- `cgst_rate`, `sgst_rate`, `igst_rate` (NOT gst_percentage)
- `line_total` (NOT line_total_with_tax)
- `taxable_amount` (required field)
- `total_tax_amount` (required field)
- `uom` (required - Unit of Measure)
- `pack_type` (required)

### ❌ WRONG Names (Don't Use):
- ~~discount_percentage~~
- ~~gst_percentage~~ (for line items)
- ~~cgst_percentage~~, ~~sgst_percentage~~, ~~igst_percentage~~
- ~~line_total_with_tax~~

## COMMON MISTAKES TO AVOID

### Table References:
❌ `FROM customers` 
✅ `FROM parties.customers`

❌ `JOIN orders` 
✅ `JOIN sales.orders`

❌ `UPDATE products`
✅ `UPDATE inventory.products` (NOT master.products)

❌ `INSERT INTO batches`
✅ `INSERT INTO inventory.batches`

❌ `FROM invoice_items`
✅ `FROM sales.invoice_items`

### Column Names:
❌ `discount_percentage = 10`
✅ `discount_percent = 10`

❌ `gst_percentage = 18` (in invoice_items)
✅ `cgst_rate = 9, sgst_rate = 9`

❌ `line_total_with_tax`
✅ `line_total`

## DEFAULT VALUES & CONSTANTS
- **Organization ID**: `ad808530-1ddb-4377-ab20-67bef145d80d` (actual from DB)
- **API Base URL**: `https://pharma-backend-production-0c09.up.railway.app/api`
- **Always filter by org_id** in queries
- **Invoice endpoint needs trailing slash**: `/api/invoices/`

## QUICK SQL PATTERNS

### Check if table exists:
```sql
SELECT * FROM information_schema.tables 
WHERE table_schema = 'sales' 
AND table_name = 'invoice_items';
```

### Get column names for a table:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'sales' 
AND table_name = 'invoice_items'
ORDER BY ordinal_position;
```

### Common JOIN pattern:
```sql
SELECT 
    i.invoice_number,
    c.customer_name,
    ii.product_name,
    ii.quantity,
    ii.line_total
FROM sales.invoices i
JOIN parties.customers c ON i.customer_id = c.customer_id
JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
WHERE i.org_id = 'ad808530-1ddb-4377-ab20-67bef145d80d';
```

## 📚 FULL DOCUMENTATION
- **Complete Schema Index**: `/database/schema-docs/MASTER_SCHEMA_INDEX.md`
- **Schema Validation Script**: `/database/schema-docs/validate_schemas.py`
- **Individual Schema Docs**: `/database/schema-docs/[01-10]_*.md`

---
*Last Updated: 2025-08-03 - After comprehensive schema analysis of 86 tables*