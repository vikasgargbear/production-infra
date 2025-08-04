# Invoice API Issues Analysis

## Current Status

### ✅ Working:
- **Test Invoice Flow** (`/database-fix/test-invoice-flow`) - Creates invoices successfully
- **GET Invoices** (`/api/invoices/`) - Returns invoices with items

### ❌ Not Working:
- **Main Invoice Creation** (`POST /api/invoices/`) - Fails with "Database operation failed"

## Issues Found in Main Invoice API

### 1. Schema/Column Mismatches

#### Orders Table Issues:
The API tries to insert into `sales.orders` with these columns:
- ✅ `order_number`, `order_date`, `order_type`
- ✅ `customer_id`, `customer_name` (but customer_name might not exist)
- ✅ `subtotal_amount`, `discount_amount`, `taxable_amount`
- ✅ `cgst_amount`, `sgst_amount`, `igst_amount`, `total_tax_amount`
- ✅ `final_amount` (was `total_amount` - fixed)
- ❌ `order_status` - might not exist (API uses 'confirmed')
- ❌ `delivery_type` - might not exist  
- ❌ `payment_mode` - might not exist

#### Invoices Table Issues:
The API tries to insert into `sales.invoices` with:
- ✅ `invoice_number`, `invoice_date`, `invoice_type`
- ✅ `customer_id`, `customer_name`
- ✅ `branch_id` (hardcoded to 1)
- ✅ `created_by` (hardcoded to 2)
- ❌ `payment_terms` - might not exist
- ❌ `due_date` - might not exist
- ❌ `place_of_supply` - might not exist

#### Invoice Items Table Issues:
The API expects these columns in `sales.invoice_items`:
- ✅ `invoice_id`, `product_id`, `product_name`
- ✅ `quantity`, `unit_price`, `line_total`
- ✅ `discount_percent`, `cgst_rate`, `sgst_rate`
- ✅ `uom`, `pack_type` (added in our fixes)
- ❌ `hsn_code` - might not exist
- ❌ `mrp` - might not exist

### 2. Active Triggers Still Causing Issues

Currently active triggers on invoices table:
1. `trigger_credit_update_on_invoice` - May reference non-existent columns
2. `trigger_invoice_cash_flow_impact` - May reference non-existent columns
3. `trigger_sales_target_tracking` - May reference non-existent columns
4. `trigger_populate_gstr1` - May reference non-existent columns
5. `trigger_cache_refresh_invoices` (3 instances) - May cause performance issues

### 3. Hardcoded Values Issues
- `branch_id = 1` - May not exist
- `created_by = 2` - May not exist (user_id 2)
- `org_id` - Using ACTUAL_ORG_ID constant

## Required Fixes

### Immediate Actions:

1. **Check actual table columns:**
```sql
-- Check orders table
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'sales' AND table_name = 'orders'
ORDER BY ordinal_position;

-- Check invoices table  
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'sales' AND table_name = 'invoices'
ORDER BY ordinal_position;

-- Check invoice_items table
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'sales' AND table_name = 'invoice_items'
ORDER BY ordinal_position;
```

2. **Drop remaining problematic triggers:**
```sql
DROP TRIGGER IF EXISTS trigger_credit_update_on_invoice ON sales.invoices;
DROP TRIGGER IF EXISTS trigger_invoice_cash_flow_impact ON sales.invoices;
DROP TRIGGER IF EXISTS trigger_sales_target_tracking ON sales.invoices;
DROP TRIGGER IF EXISTS trigger_populate_gstr1 ON sales.invoices;
DROP TRIGGER IF EXISTS trigger_cache_refresh_invoices ON sales.invoices;
```

3. **Fix the main invoice API to:**
- Only use columns that actually exist
- Handle missing columns gracefully
- Get valid branch_id and created_by values

## Next Steps

1. Create a column verification API
2. Update main invoice API to match actual schema
3. Drop all remaining problematic triggers
4. Test with minimal required fields only