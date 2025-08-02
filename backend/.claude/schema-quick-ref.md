# SCHEMA QUICK REFERENCE - ALWAYS USE THESE PREFIXES!

## ⚠️ CRITICAL: Never use table names without schema prefix!

### MASTER SCHEMA (master.)
- `master.customers` - Customer records
- `master.addresses` - Customer addresses (linked via customer_id)
- `master.products` - Product catalog
- `master.organizations` - Organization/company info
- `master.org_users` - Users in organization

### SALES SCHEMA (sales.)
- `sales.orders` - Sales orders
- `sales.order_items` - Order line items
- `sales.invoices` - Invoices
- `sales.invoice_items` - Invoice line items
- `sales.quotes` - Quotations
- `sales.returns` - Sales returns

### INVENTORY SCHEMA (inventory.)
- `inventory.batches` - Product batches with quantities
- `inventory.stock_movements` - Stock in/out records
- `inventory.stock_adjustments` - Manual adjustments

### PURCHASE SCHEMA (purchase.)
- `purchase.purchase_orders` - Purchase orders
- `purchase.suppliers` - Supplier records
- `purchase.goods_receipts` - Goods received

### ACCOUNTING SCHEMA (accounting.)
- `accounting.payments` - Payment records
- `accounting.journal_entries` - Accounting entries

## COMMON MISTAKES TO AVOID
❌ `FROM customers` 
✅ `FROM master.customers`

❌ `JOIN orders` 
✅ `JOIN sales.orders`

❌ `UPDATE products`
✅ `UPDATE master.products`

❌ `INSERT INTO batches`
✅ `INSERT INTO inventory.batches`

## DEFAULT VALUES
- Organization ID: `12de5e22-eee7-4d25-b3a7-d16d01c6170f`
- Always filter by org_id in queries