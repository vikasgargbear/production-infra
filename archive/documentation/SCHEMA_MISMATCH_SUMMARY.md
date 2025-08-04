# Schema Mismatch Summary

## Root Cause of Invoice Creation Failure

The main invoice API (`POST /api/invoices/`) is failing because it tries to insert data into **columns that don't exist** in the database.

## Critical Mismatches Found

### 1. Orders Table
**API tries to use (but DON'T exist):**
- ❌ `delivery_type` 
- ❌ `customer_name`
- ❌ `payment_mode`
- ❌ `order_status` (column name issue)

**Actual columns that exist:**
- ✅ `order_id`, `order_number`, `order_date`, `order_type`
- ✅ `customer_id` (but NOT `customer_name`)
- ✅ `subtotal_amount`, `discount_amount`, `final_amount`
- ✅ `cgst_amount`, `sgst_amount`, `tax_amount`

### 2. Invoices Table  
**API tries to use (but DON'T exist):**
- ❌ `payment_terms`
- ❌ `due_date`
- ❌ `place_of_supply`

**Actual columns that exist:**
- ✅ `invoice_id`, `invoice_number`, `invoice_date`
- ✅ `customer_id`, `customer_name`
- ✅ `subtotal_amount`, `discount_amount`, `final_amount`

### 3. Invoice Items Table
**API tries to use (but might not exist):**
- ❌ `hsn_code`
- ❌ `mrp`
- ❌ `batch_number`

## Triggers Still Causing Issues

These triggers are still active and may reference non-existent columns:
1. `trigger_credit_update_on_invoice`
2. `trigger_invoice_cash_flow_impact`
3. `trigger_sales_target_tracking`
4. `trigger_populate_gstr1`
5. `trigger_cache_refresh_invoices` (3 instances)

## Solutions Implemented

### 1. Created Fixed Invoice API
**New endpoint**: `/invoice-fixed/create`
- Only uses columns that actually exist
- Properly gets `branch_id` and `created_by`
- Handles missing columns gracefully
- Simplified invoice creation flow

### 2. Database Fix APIs
**Endpoints created:**
- `/database-fix/drop-all-broken-triggers` - Drops problematic triggers
- `/database-fix/test-invoice-flow` - Tests with minimal columns
- `/table-inspector/columns/{schema}/{table}` - Inspects actual columns

### 3. Working Test Flow
The test flow (`/database-fix/test-invoice-flow`) works because it:
- Uses minimal required columns only
- Doesn't rely on non-existent columns
- Creates test data with TEST- prefix for easy cleanup

## Next Steps

1. **Update main invoice API** to match actual schema
2. **Drop all problematic triggers** using the fix API
3. **Add missing columns** to database OR **remove from API**
4. **Test with production data** using fixed API

## Quick Fix Commands

```bash
# Drop problematic triggers
curl -X POST "https://pharma-backend-production-0c09.up.railway.app/database-fix/drop-all-broken-triggers" \
  -H "X-Org-Id: ad808530-1ddb-4377-ab20-67bef145d80d"

# Test invoice creation with fixed API
curl -X POST "https://pharma-backend-production-0c09.up.railway.app/invoice-fixed/create" \
  -H "X-Org-Id: ad808530-1ddb-4377-ab20-67bef145d80d" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 35,
    "items": [{
      "product_id": 47,
      "quantity": 5,
      "unit_price": 10
    }]
  }'
```

## Conclusion

The invoice creation is failing due to **fundamental schema mismatches** between what the API expects and what actually exists in the database. The code was written for a different database schema than what's currently deployed.