# Master Schema Index

Complete database table reference organized by schema.

---

## Database Overview

| Metric | Value |
|--------|-------|
| **Database** | PostgreSQL 14+ |
| **Total Schemas** | 10 |
| **Total Tables** | 166 |
| **Last Updated** | 2026-01-08 |
| **Source** | [07-DATABASE-SCHEMA.md](../../Architecture%20Documentation/07-DATABASE-SCHEMA.md) |

---

## Schema Summary

| Schema | Tables | Description | Documentation |
|--------|--------|-------------|---------------|
| [sales](#sales-schema) | 25 | Orders, invoices, challans, returns | [Details](schemas/sales.md) |
| [inventory](#inventory-schema) | 16 | Products, batches, stock, movements | [Details](schemas/inventory.md) |
| [procurement](#procurement-schema) | 14 | PO, GRN, supplier invoices | [Details](schemas/procurement.md) |
| [financial](#financial-schema) | 16 | Payments, ledger, accounting | [Details](schemas/financial.md) |
| [parties](#parties-schema) | 4 | Customers, suppliers | [Details](schemas/parties.md) |
| [master](#master-schema) | 13 | Orgs, branches, users, employees | — |
| [gst](#gst-schema) | 15 | Tax settings, returns, HSN codes | — |
| [compliance](#compliance-schema) | 28 | Licenses, inspections, QC | — |
| [analytics](#analytics-schema) | 13 | Dashboards, KPIs, reports | — |
| [system_config](#system-config-schema) | 22 | Audit logs, settings, workflows | — |

---

## sales Schema

**Tables**: 25  
**Purpose**: Complete sales cycle from orders to returns

| Table | Purpose |
|-------|---------|
| `orders` | Sales order headers |
| `order_items` | Order line items |
| `invoices` | Sales invoice headers |
| `invoice_items` | Invoice line items |
| `delivery_challans` | Delivery challan headers |
| `delivery_challan_items` | Challan line items |
| `sales_returns` | Return headers |
| `sales_return_items` | Return line items |
| `proof_of_delivery` | POD records |
| `price_lists` | Price list masters |
| `price_list_items` | Product prices per list |
| `promotional_schemes` | Promotional discounts |
| `sales_schemes` | Sales scheme rules |
| `scheme_products` | Scheme-product mapping |
| `scheme_customers` | Scheme-customer mapping |
| `scheme_usage` | Scheme utilization tracking |
| `scheme_volume_slabs` | Volume-based discounts |
| `sales_targets` | Sales targets by entity |

---

## inventory Schema

**Tables**: 16  
**Purpose**: Product catalog, batch tracking, stock management

| Table | Purpose |
|-------|---------|
| `products` | Product master catalog |
| `product_categories` | Category hierarchy |
| `product_types` | Type definitions |
| `units_of_measure` | UOM definitions |
| `batches` | Batch/lot tracking with expiry |
| `storage_locations` | Warehouse location hierarchy |
| `location_wise_stock` | Real-time stock by location |
| `stock_reservations` | Stock allocation for orders |
| `inventory_movements` | Complete movement audit trail |
| `stock_transfers` | Inter-location transfers |
| `stock_transfer_items` | Transfer line items |
| `reorder_suggestions` | Automated reorder alerts |
| `price_history` | Price change log |
| `price_change_log` | Price change audit |
| `price_alerts` | Pricing anomaly alerts |
| `competitor_pricing` | Competitor price tracking |

---

## procurement Schema

**Tables**: 14  
**Purpose**: Procure-to-pay cycle management

| Table | Purpose |
|-------|---------|
| `purchase_orders` | PO headers |
| `purchase_order_items` | PO line items |
| `goods_receipt_notes` | GRN headers |
| `grn_items` | GRN line items (creates batches) |
| `supplier_invoices` | Supplier invoice headers |
| `supplier_invoice_items` | Supplier invoice lines |
| `purchase_returns` | Return to supplier headers |
| `purchase_return_items` | Return line items |
| `purchase_requisitions` | Purchase requests |
| `purchase_requisition_items` | Requisition line items |
| `supplier_quotations` | Supplier quotes |
| `supplier_quotation_items` | Quote line items |
| `vendor_performance` | Supplier scorecard |

---

## financial Schema

**Tables**: 16  
**Purpose**: Accounting, payments, receivables/payables

| Table | Purpose |
|-------|---------|
| `payments` | Payment records (receipts/payments) |
| `payment_allocations` | Payment to invoice mapping |
| `payment_methods` | Payment method definitions |
| `chart_of_accounts` | Account ledger hierarchy |
| `journal_entries` | Journal voucher headers |
| `journal_entry_lines` | Journal line items |
| `customer_outstanding` | Customer receivables tracking |
| `supplier_outstanding` | Supplier payables tracking |
| `bank_reconciliations` | Bank statement reconciliation |
| `bank_reconciliation_items` | Reconciliation line items |
| `unmatched_transactions` | Unreconciled transactions |
| `expense_claims` | Employee expense claims |
| `expense_claim_items` | Claim line items |
| `expense_categories` | Expense categorization |
| `pdc_management` | Post-dated cheque tracking |
| `cash_flow_forecast` | Cash flow projections |

---

## parties Schema

**Tables**: 4  
**Purpose**: Customer and supplier master data

| Table | Purpose |
|-------|---------|
| `customers` | Customer master |
| `suppliers` | Supplier master |
| `customer_groups` | Customer segmentation |
| `supplier_groups` | Supplier categorization |

> **Note**: Addresses stored in `master.addresses` with polymorphic entity_type

---

## master Schema

**Tables**: 13  
**Purpose**: Core master data and system configuration

| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant org master |
| `org_branches` | Branch/location management |
| `org_users` | User accounts |
| `org_bank_accounts` | Bank account management |
| `addresses` | Polymorphic address storage |
| `employees` | Employee records |
| `doctors` | Doctor/prescriber records |
| `departments` | Department structure |
| `number_series` | Document numbering config |
| `currencies` | Currency master |
| `exchange_rates` | Exchange rate tracking |

---

## gst Schema

**Tables**: 15  
**Purpose**: GST compliance and returns filing

| Table | Purpose |
|-------|---------|
| `hsn_sac_codes` | HSN/SAC code master |
| `gst_rates` | GST rate configuration |
| `gstr1_data` | GSTR-1 outward supply data |
| `gstr2a_data` | GSTR-2A auto-populated data |
| `gstr2b_data` | GSTR-2B ITC data |
| `gstr3b_data` | GSTR-3B summary return |
| `gst_reconciliation` | Books vs GST return matching |
| `gst_credit_ledger` | ITC ledger tracking |
| `gst_liability` | GST liability calculation |
| `gst_audit_trail` | GST activity audit |
| `eway_bills` | E-way bill records |
| `compliance_calendar` | Filing due date tracking |
| `advance_receipts` | Advance payment GST |
| `purchase_reconciliation` | Purchase ITC matching |
| `return_filing_status` | Filing status tracking |

---

## compliance Schema

**Tables**: 28 (Largest)  
**Purpose**: Pharmaceutical regulatory compliance

| Table | Purpose |
|-------|---------|
| `drug_licenses` | Drug license management |
| `org_licenses` | All license types |
| `license_types` | License type definitions |
| `license_renewal_history` | Renewal tracking |
| `pharmacist_registrations` | Pharmacist records |
| `narcotic_register` | Schedule H/X drug tracking |
| `narcotic_discrepancies` | Narcotic audit findings |
| `regulatory_inspections` | Inspection records |
| `regulatory_authorities` | Authority master |
| `inspector_visits` | Visit logs |
| `corrective_action_plans` | CAP tracking |
| `corrective_actions` | Action items |
| `compliance_violations` | Violation records |
| `compliance_alerts` | Compliance notifications |
| `compliance_audits` | Audit records |
| `compliance_documents` | Document storage |
| `product_recalls` | Recall management |
| `expired_destructions` | Expired product destruction |
| `destruction_approvals` | Destruction approvals |
| `quality_control_tests` | QC test records |
| `quality_deviations` | Deviation tracking |
| `environmental_compliance` | Environmental monitoring |
| `environmental_breaches` | Breach records |
| `temperature_zones` | Cold chain zones |
| `temperature_logs` | Temperature monitoring |
| `inspection_schedule` | Upcoming inspections |
| `required_licenses` | Required license types |
| `org_compliance_status` | Overall compliance score |

---

## analytics Schema

**Tables**: 13  
**Purpose**: Business intelligence and reporting

| Table | Purpose |
|-------|---------|
| `dashboards` | Dashboard definitions |
| `dashboard_widgets` | Widget configuration |
| `dashboard_cache` | Cached metrics |
| `kpi_definitions` | KPI configuration |
| `kpi_values` | KPI calculated values |
| `report_templates` | Report template definitions |
| `report_schedules` | Scheduled report config |
| `report_execution_history` | Report run history |
| `alert_definitions` | Alert configuration |
| `alert_history` | Triggered alerts |
| `user_activity_analytics` | User behavior tracking |
| `data_quality_metrics` | Data quality scores |
| `product_consumption_stats` | Consumption analytics |

---

## system_config Schema

**Tables**: 22  
**Purpose**: System administration and workflows

| Table | Purpose |
|-------|---------|
| `system_settings` | System configuration |
| `feature_flags` | Feature toggles |
| `api_keys` | API key management |
| `api_usage_log` | API usage tracking |
| `api_logs` | Request/response logs |
| `audit_logs` | Audit trail |
| `system_notifications` | System alerts |
| `user_notifications` | User notifications |
| `scheduled_jobs` | Cron job definitions |
| `email_templates` | Email template storage |
| `workflow_definitions` | Workflow configuration |
| `workflow_instances` | Workflow execution |

---

## Column Naming Conventions

### Standard Patterns ✅

| Pattern | Example | Notes |
|---------|---------|-------|
| Primary key | `{table}_id` | e.g., `invoice_id` |
| Foreign key | Same as PK | e.g., `customer_id` |
| Percentage | `*_percent` | e.g., `discount_percent` |
| GST rates | `cgst_rate`, `sgst_rate` | Not `gst_percentage` |
| Amounts | `*_amount` | e.g., `total_amount` |
| Dates | `*_date` | e.g., `invoice_date` |
| Status | `*_status` | e.g., `payment_status` |

### Common Fields

Most tables include:
```sql
org_id          UUID NOT NULL       -- Tenant isolation
created_at      TIMESTAMP
updated_at      TIMESTAMP
created_by      INTEGER
is_active       BOOLEAN DEFAULT true
```

---

## Quick SQL Reference

```sql
-- List all tables in a schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'sales' 
ORDER BY table_name;

-- Get columns for a table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'sales' AND table_name = 'invoices'
ORDER BY ordinal_position;

-- Count tables per schema
SELECT table_schema, COUNT(*) as tables
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
GROUP BY table_schema
ORDER BY tables DESC;
```

---

## Related Documentation

- [Sales Schema Details](schemas/sales.md)
- [Inventory Schema Details](schemas/inventory.md)
- [Procurement Schema Details](schemas/procurement.md)
- [Financial Schema Details](schemas/financial.md)
- [Parties Schema Details](schemas/parties.md)
- [Backend Services](../services/)

---

**Source of Truth**: [Architecture Documentation/07-DATABASE-SCHEMA.md](../../Architecture%20Documentation/07-DATABASE-SCHEMA.md)
