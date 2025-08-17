# Master Schema Index

## Quick Reference: All Tables by Schema

This document provides a complete index of all database tables organized by schema, with links to detailed documentation.

---

## 📊 Database Overview

- **Total Schemas:** 10
- **Total Tables:** 128
- **Last Updated:** 2025-08-16 (Auto-generated from SQL schema files)

---

## 🗂️ Schema Structure

### 1. **master** Schema (12 tables)
**Documentation:** [01_master_schema.md](./01_master_schema.md)  
**Purpose:** Core master data and system configuration

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `organizations` | Organization master data | org_id, org_name, business_type |
| `org_branches` | Branch/location management | branch_id, branch_name, branch_code |
| `org_users` | User management | user_id, username, email, role |
| `roles` | Role and permission management | role_id, role_name, permissions |
| `departments` | Department structure | department_id, department_name |
| `org_bank_accounts` | Bank account management | account_id, bank_name, account_number |
| `addresses` | Address management | address_id, entity_type, entity_id |
| `employees` | Employee records | employee_id, employee_code, employee_name |
| `doctors` | Doctor registration | doctor_id, license_number, specialization |
| `number_series` | Document numbering | series_id, prefix, next_number |
| `currencies` | Currency master | currency_id, currency_code, symbol |
| `exchange_rates` | Exchange rate tracking | rate_id, from_currency, to_currency, rate |

---

### 2. **parties** Schema (8 tables)
**Documentation:** [02_parties_schema.md](./02_parties_schema.md)  
**Purpose:** Customer and supplier management

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `customers` | Customer master data | customer_id, customer_name, phone, address_line1 |
| `suppliers` | Supplier master data | supplier_id, supplier_name, contact_person |
| `customer_contacts` | Customer contact persons | contact_id, customer_id, contact_name, phone |
| `supplier_contacts` | Supplier contact persons | contact_id, supplier_id, contact_name, phone |
| `customer_groups` | Customer grouping and discounts | group_id, group_name, discount_percent |
| `customer_group_members` | Group membership mapping | membership_id, group_id, customer_id |
| `territories` | Territory/area management | territory_id, territory_name, region |
| `routes` | Delivery route planning | route_id, route_name, territory_id |

---

### 3. **inventory** Schema (13 tables)
**Documentation:** [03_inventory_schema.md](./03_inventory_schema.md)  
**Purpose:** Product inventory and stock management

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `product_categories` | Product classification hierarchy | category_id, category_name, category_path |
| `product_types` | Product type definitions | type_id, type_name, default_base_uom |
| `units_of_measure` | Unit of measure master | uom_id, uom_code, conversion_factor |
| `products` | Product master catalog | product_id, product_name, gst_percentage, composition |
| `product_pack_configurations` | Pack hierarchy (tablets→strips→boxes) | pack_config_id, product_id, base_units_per_pack |
| `batches` | Batch/lot tracking with expiry | batch_id, product_id, batch_number, expiry_date, quantity_available |
| `storage_locations` | Warehouse location hierarchy | location_id, location_name, location_type, storage_class |
| `location_wise_stock` | Real-time stock by location | stock_id, product_id, batch_id, location_id, quantity_available |
| `stock_reservations` | Stock allocation management | reservation_id, product_id, reserved_quantity, reference_type |
| `inventory_movements` | Complete movement audit trail | movement_id, movement_type, product_id, quantity, movement_direction |
| `stock_transfers` | Inter-location transfers | transfer_id, transfer_number, from_location_id, to_location_id |
| `stock_transfer_items` | Transfer line items | transfer_item_id, transfer_id, product_id, requested_quantity |
| `reorder_suggestions` | Automated reorder alerts | suggestion_id, product_id, suggested_quantity, urgency |

---

### 4. **sales** Schema
**Documentation:** [04_sales_schema.md](./04_sales_schema.md)  
**Purpose:** Sales orders, invoices, and returns

| Table | Purpose | Key Fields | Important Notes |
|-------|---------|------------|-----------------|
| `orders` | Sales orders | order_id, customer_id, order_date, total_amount | |
| `order_items` | Order line items | order_item_id, order_id, product_id, quantity, discount_percent | Uses cgst_rate/sgst_rate not gst_percentage |
| `invoices` | Sales invoices | invoice_id, invoice_number, customer_id, final_amount | |
| `invoice_items` | Invoice line items | invoice_item_id, invoice_id, product_id, quantity | ⚠️ Uses discount_percent, cgst_rate/sgst_rate, line_total, requires uom & pack_type |
| `delivery_challans` | Delivery documents | challan_id, challan_number, customer_id | |
| `sales_returns` | Return management | return_id, invoice_id, return_reason | |
| `sales_return_items` | Return line items | return_item_id, return_id, product_id, quantity | |

---

### 5. **procurement** Schema
**Documentation:** [05_procurement_schema.md](./05_procurement_schema.md)  
**Purpose:** Purchase orders and goods receipt

| Table | Purpose | Key Fields | Important Notes |
|-------|---------|------------|-----------------|
| `purchase_orders` | Purchase orders | po_id, supplier_id, po_date, discount_percent | Uses discount_percent |
| `purchase_order_items` | PO line items | po_item_id, po_id, product_id, quantity | Uses cgst_rate/sgst_rate, line_total |
| `goods_receipt_notes` | GRN documents | grn_id, po_id, received_date | |
| `grn_items` | GRN line items | grn_item_id, grn_id, product_id, quantity | |
| `purchase_requisitions` | Purchase requests | requisition_id, requested_by, status | |
| `purchase_requisition_items` | Requisition items | item_id, requisition_id, product_id | |
| `supplier_quotations` | Supplier quotes | quotation_id, supplier_id, validity_date | |
| `supplier_quotation_items` | Quote line items | item_id, quotation_id, product_id, discount_percent | |

---

### 6. **financial** Schema
**Documentation:** [06_financial_schema.md](./06_financial_schema.md)  
**Purpose:** Accounting and financial management

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `chart_of_accounts` | Account ledgers | account_id, account_name, account_type |
| `journal_entries` | Journal vouchers | entry_id, entry_date, total_debit, total_credit |
| `journal_entry_lines` | Journal line items | line_id, entry_id, account_id, debit, credit |
| `payments` | Payment records | payment_id, party_type, party_id, amount |
| `payment_allocations` | Payment allocation | allocation_id, payment_id, invoice_id, amount |
| `customer_outstanding` | Customer balances | customer_id, total_outstanding |
| `supplier_outstanding` | Supplier balances | supplier_id, total_outstanding |
| `bank_reconciliation` | Bank reconciliation | reconciliation_id, bank_account_id, date |
| `expense_claims` | Employee expenses | claim_id, employee_id, amount, status |
| `expense_claim_items` | Expense line items | item_id, claim_id, expense_type, amount |

---

### 7. **gst** Schema
**Documentation:** [07_gst_schema.md](./07_gst_schema.md)  
**Purpose:** GST compliance and returns

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `gst_returns` | GST return filing | return_id, return_type, period, status |
| `gstr1_data` | GSTR-1 sales data | record_id, invoice_id, gstin, taxable_value |
| `gstr2a_data` | GSTR-2A purchase data | record_id, supplier_gstin, invoice_number |
| `gst_reconciliation` | GST reconciliation | reconciliation_id, period, status |
| `e_invoices` | E-invoice generation | e_invoice_id, invoice_id, irn, qr_code |
| `e_way_bills` | E-way bill generation | eway_bill_id, document_number, valid_until |
| `gst_ledger` | GST ledger entries | ledger_id, transaction_type, amount |
| `gst_rates` | GST rate master | hsn_code, gst_rate, description |

---

### 8. **compliance** Schema
**Documentation:** [08_compliance_schema.md](./08_compliance_schema.md)  
**Purpose:** Regulatory compliance management

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `org_licenses` | License management | license_id, license_type, expiry_date |
| `narcotic_register` | Narcotic drug tracking | entry_id, drug_name, quantity, prescription_no |
| `regulatory_inspections` | Inspection records | inspection_id, inspector_name, date, findings |
| `compliance_violations` | Violation tracking | violation_id, violation_type, severity |
| `environmental_compliance` | Environmental records | record_id, waste_type, quantity |
| `training_records` | Staff training | training_id, employee_id, course_name |
| `sop_documents` | Standard procedures | sop_id, document_name, version |
| `compliance_calendar` | Compliance deadlines | event_id, compliance_type, due_date |

---

### 9. **system_config** Schema
**Documentation:** [09_system_config_schema.md](./09_system_config_schema.md)  
**Purpose:** System configuration and monitoring

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `system_settings` | System configuration | setting_id, setting_key, setting_value |
| `audit_logs` | Audit trail | log_id, user_id, action, timestamp |
| `system_notifications` | System alerts | notification_id, type, message |
| `user_notifications` | User notifications | notification_id, user_id, read_status |
| `scheduled_jobs` | Cron jobs | job_id, job_name, schedule, status |
| `system_health_metrics` | System monitoring | metric_id, metric_name, value |
| `feature_flags` | Feature toggles | flag_id, flag_name, enabled |
| `email_templates` | Email templates | template_id, template_name, content |
| `workflow_definitions` | Workflow config | workflow_id, workflow_name, steps |
| `workflow_instances` | Workflow execution | instance_id, workflow_id, status |
| `api_keys` | API key management | key_id, key_hash, permissions |
| `api_usage_log` | API usage tracking | log_id, api_key_id, endpoint, timestamp |

---

### 10. **analytics** Schema
**Documentation:** [10_analytics_schema.md](./10_analytics_schema.md)  
**Purpose:** Business analytics and reporting

| Table | Purpose | Key Fields | Important Notes |
|-------|---------|------------|-----------------|
| `daily_sales_summary` | Daily sales metrics | date, total_sales, total_orders | |
| `monthly_business_summary` | Monthly metrics | year, month, revenue, gross_margin_percent | Uses margin_percent |
| `product_analytics` | Product performance | product_id, units_sold, margin_percent | Uses margin_percent |
| `customer_analytics` | Customer metrics | customer_id, total_purchases, frequency | |
| `inventory_analytics` | Stock analytics | product_id, turnover_ratio, days_of_stock | |
| `financial_analytics` | Financial metrics | period, revenue, expenses, profit | |
| `kpi_metrics` | KPI tracking | kpi_id, metric_name, value, target | |
| `dashboard_configs` | Dashboard setup | config_id, user_id, layout | |
| `report_templates` | Report templates | template_id, report_name, query | |
| `data_mart_refresh_log` | ETL logs | log_id, process_name, status | |

---

## 🔧 Validation Tools

### Schema Validation Script
**Location:** [validate_schemas.py](./validate_schemas.py)

Run this script to:
- Check for column naming inconsistencies
- Verify required fields
- Generate SQL to validate against actual database

```bash
python3 validate_schemas.py
```

---

## ⚠️ Common Column Naming Patterns

### Correct Patterns ✅
- `discount_percent` (NOT discount_percentage)
- `cgst_rate`, `sgst_rate`, `igst_rate` (NOT gst_percentage for line items)
- `line_total` (NOT line_total_with_tax)
- `margin_percent` (NOT margin_percentage)
- `sale_price_per_unit` (for batches, NOT selling_price)

### Required Fields Often Missing
- `invoice_items`: uom, pack_type, taxable_amount, total_tax_amount
- `customers`: phone, address_line1, org_id

---

## 📝 Quick SQL References

### Find Table
```sql
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name = 'your_table_name';
```

### List All Tables in Schema
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'schema_name' 
ORDER BY table_name;
```

### Check Column Names
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'schema_name'
AND table_name = 'table_name'
ORDER BY ordinal_position;
```

---

## 📚 Documentation Files

1. **Schema Documentation:**
   - [01_master_schema.md](./01_master_schema.md)
   - [02_parties_schema.md](./02_parties_schema.md)
   - [03_inventory_schema.md](./03_inventory_schema.md)
   - [04_sales_schema.md](./04_sales_schema.md)
   - [05_procurement_schema.md](./05_procurement_schema.md)
   - [06_financial_schema.md](./06_financial_schema.md)
   - [07_gst_schema.md](./07_gst_schema.md)
   - [08_compliance_schema.md](./08_compliance_schema.md)
   - [09_system_config_schema.md](./09_system_config_schema.md)
   - [10_analytics_schema.md](./10_analytics_schema.md)

2. **Validation Tools:**
   - [validate_schemas.py](./validate_schemas.py) - Schema validation script

---

*Last Updated: 2025-08-03*