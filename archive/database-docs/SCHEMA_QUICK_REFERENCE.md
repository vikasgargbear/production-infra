# Schema Quick Reference Card

## Core Table Names (Copy-Paste Ready)

### Master Schema
- `master.organizations` - Companies
- `master.org_branches` - Locations  
- `master.org_users` - Users
- `master.addresses` - Address book
- `master.product_categories` - Product categories
- `master.units_of_measurement` - UOM definitions

### Inventory Schema  
- `inventory.products` - Product master
- `inventory.batches` - Batch tracking
- `inventory.storage_locations` - Warehouse locations
- `inventory.location_wise_stock` - Stock by location
- `inventory.inventory_movements` - Stock movements
- `inventory.stock_reservations` - Reserved stock

### Parties Schema
- `parties.customers` - Customer master
- `parties.suppliers` - Supplier master

### Sales Schema
- `sales.orders` - Sales orders
- `sales.order_items` - Order line items
- `sales.invoices` - Tax invoices  
- `sales.invoice_items` - Invoice line items
- `sales.delivery_challans` - Delivery documents
- `sales.delivery_challan_items` - Challan items
- `sales.sales_returns` - Return documents
- `sales.price_lists` - Pricing master

### Procurement Schema
- `procurement.purchase_orders` - Purchase orders
- `procurement.purchase_order_items` - PO items
- `procurement.grn` - Goods receipts
- `procurement.grn_items` - GRN line items
- `procurement.supplier_invoices` - Vendor bills

### Financial Schema  
- `financial.payments` - Payment transactions
- `financial.payment_allocations` - Invoice allocations
- `financial.customer_outstanding` - Receivables
- `financial.supplier_outstanding` - Payables

### GST Schema
- `gst.hsn_sac_codes` - HSN/SAC master
- `gst.gstr1_data` - Sales returns
- `gst.gstr2a_data` - Purchase returns
- `gst.eway_bills` - E-way bills

### Compliance Schema
- `compliance.temperature_logs` - Cold chain monitoring
- `compliance.narcotic_register` - Narcotic tracking
- `compliance.product_recalls` - Recall management
- `compliance.org_licenses` - License tracking

### System Schema
- `system_config.workflow_instances` - Approvals
- `system_config.audit_logs` - Audit trail
- `system_config.api_usage_log` - API monitoring

## Key Column Names

### Common ID Columns
- `org_id` - Organization UUID
- `branch_id` - Branch/location ID
- `product_id` - Product reference
- `customer_id` - Customer reference
- `supplier_id` - Supplier reference
- `user_id` - User reference

### Common Status Columns
- `is_active` - Active flag (BOOLEAN)
- `*_status` - Status fields (TEXT)
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Financial Columns
- `*_amount` - Money values (NUMERIC(15,2))
- `quantity` - Quantities (NUMERIC(15,3))
- `*_percent` - Percentages (NUMERIC(5,2))
- `tax_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`

### JSONB Columns
- `address` - Address structure
- `contact_info` - Contact details
- `tax_config` - Tax configuration
- `pack_config` - Packing configuration
- `approval_history` - Approval trail
- `batch_allocation` - Batch allocation in orders

## Critical Relationships

### Product → Stock Flow
```
inventory.products → inventory.batches → inventory.location_wise_stock
```

### Order → Invoice Flow  
```
sales.orders → sales.order_items → sales.delivery_challans → sales.invoices → sales.invoice_items
```

### Purchase Flow
```
procurement.purchase_orders → procurement.grn → inventory.batches → inventory.location_wise_stock
```

### Payment Flow
```
sales.invoices → financial.customer_outstanding → financial.payments → financial.payment_allocations
```

## Important Notes for Frontend

1. **GST Rates**: Use `igst_rate`, `cgst_rate`, `sgst_rate` NOT `gst_percentage`
2. **Addresses**: Can be JSONB or reference to `master.addresses` table
3. **Status Fields**: Check exact status values in schema
4. **Batch Tracking**: Use `batch_allocation` JSONB in orders, actual `batch_id` in invoices
5. **Multi-branch**: Always filter by `org_id` and often by `branch_id`

## DO NOT Create These Tables (They Already Exist)
- temperature_logs ✓
- product_recalls ✓ 
- workflow_instances ✓
- api_usage_log ✓
- narcotic_register ✓

## Quick Validation Queries

Check if customer exists:
```sql
SELECT 1 FROM parties.customers WHERE customer_id = ? AND org_id = ?
```

Check product stock:
```sql
SELECT SUM(quantity_available) FROM inventory.location_wise_stock 
WHERE product_id = ? AND org_id = ?
```

Check batch availability:
```sql
SELECT * FROM inventory.batches 
WHERE batch_id = ? AND quantity_available > 0 AND batch_status = 'active'
```