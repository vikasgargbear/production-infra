# Database Schema Reference Guide

## Quick Reference - Schema Prefixes

**ALWAYS use schema prefix when referencing tables in SQL queries!**

### Master Schema Tables
```sql
-- Customers
parties.customers
parties.addresses          -- Customer addresses (linked via customer_id)

-- Products  
inventory.products
master.product_categories
master.manufacturers
master.compositions

-- Organizations
parties.organizations
parties.org_users
master.org_settings

-- Units & Measurements
master.units
master.pack_types
```

### Sales Schema Tables
```sql
sales.orders
sales.order_items
sales.invoices
sales.invoice_items
sales.quotes
sales.quote_items
sales.returns
sales.return_items
```

### Inventory Schema Tables
```sql
inventory.batches
inventory.stock_movements
inventory.stock_adjustments
inventory.warehouses
inventory.warehouse_locations
```

### Purchase Schema Tables
```sql
purchase.purchase_orders
purchase.purchase_order_items
purchase.suppliers
purchase.supplier_invoices
purchase.goods_receipts
```

### Accounting Schema Tables
```sql
accounting.payments
accounting.payment_allocations
accounting.journal_entries
accounting.chart_of_accounts
accounting.tax_rates
```

## Common Query Patterns

### Customer Queries
```sql
-- Get customer with addresses
SELECT c.*, a.* 
FROM parties.customers c
LEFT JOIN parties.addresses a ON c.customer_id = a.customer_id
WHERE c.org_id = :org_id;

-- Check customer existence
SELECT * FROM parties.customers 
WHERE customer_code = :code AND org_id = :org_id;
```

### Product Queries
```sql
-- Get products with inventory
SELECT p.*, COALESCE(SUM(b.quantity_available), 0) as stock
FROM inventory.products p
LEFT JOIN inventory.batches b ON p.product_id = b.product_id
WHERE p.org_id = :org_id
GROUP BY p.product_id;
```

### Order Queries
```sql
-- Get order with customer details
SELECT o.*, c.customer_name, c.phone
FROM sales.orders o
JOIN parties.customers c ON o.customer_id = c.customer_id
WHERE o.org_id = :org_id;

-- Get order items with product info
SELECT oi.*, p.product_name, p.hsn_code
FROM sales.order_items oi
JOIN inventory.products p ON oi.product_id = p.product_id
WHERE oi.order_id = :order_id;
```

### Invoice Queries
```sql
-- Get invoice with order and customer
SELECT i.*, o.order_number, c.customer_name
FROM sales.invoices i
JOIN sales.orders o ON i.order_id = o.order_id
JOIN parties.customers c ON i.customer_id = c.customer_id
WHERE i.org_id = :org_id;
```

### Inventory Queries
```sql
-- Get available batches for a product
SELECT * FROM inventory.batches
WHERE product_id = :product_id 
  AND org_id = :org_id
  AND quantity_available > 0
  AND batch_status = 'active'
ORDER BY expiry_date ASC;
```

## Important Notes

1. **NEVER use tables without schema prefix** - This will cause "relation does not exist" errors
2. **Common mistake**: `FROM customers` ❌ → `FROM parties.customers` ✅
3. **All main entities have org_id** - Always filter by org_id in WHERE clause
4. **Default org_id**: `12de5e22-eee7-4d25-b3a7-d16d01c6170f` (for development)

## Table Relationships

### Customer Related
- `parties.customers` (1) → (n) `parties.addresses`
- `parties.customers` (1) → (n) `sales.orders`
- `parties.customers` (1) → (n) `sales.invoices`

### Product Related
- `inventory.products` (1) → (n) `inventory.batches`
- `inventory.products` (1) → (n) `sales.order_items`
- `inventory.products` (1) → (n) `sales.invoice_items`

### Order Flow
- `sales.orders` (1) → (n) `sales.order_items`
- `sales.orders` (1) → (1) `sales.invoices`
- `sales.invoices` (1) → (n) `sales.invoice_items`

### Inventory Flow
- `inventory.batches` → `inventory.stock_movements`
- `purchase.purchase_orders` → `inventory.batches` (via goods receipt)

## Schema Detection Queries

To check if a table exists:
```sql
SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'master' 
    AND table_name = 'customers'
);
```

To check column existence:
```sql
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'master'
    AND table_name = 'customers' 
    AND column_name = 'area'
);
```

## Common Errors and Solutions

### Error: relation "customers" does not exist
**Solution**: Use `parties.customers` instead of just `customers`

### Error: relation "orders" does not exist  
**Solution**: Use `sales.orders` instead of just `orders`

### Error: relation "batches" does not exist
**Solution**: Use `inventory.batches` instead of just `batches`

### Error: relation "products" does not exist
**Solution**: Use `inventory.products` instead of just `products`

## Quick Checklist Before Running Queries

- [ ] All table references have schema prefix?
- [ ] Using correct schema for each table?
- [ ] Filtering by org_id where needed?
- [ ] JOIN conditions include proper schema prefixes?
- [ ] INSERT/UPDATE statements use schema prefix?

## API File Locations

- Customer API: `/app/api/routes/customers.py`
- Product API: `/app/api/routes/products.py`
- Order API: `/app/api/routes/orders.py`
- Invoice API: `/app/api/routes/invoices.py`
- Inventory API: `/app/api/routes/inventory.py`
- Purchase API: `/app/api/routes/purchase.py`