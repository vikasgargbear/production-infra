# 📋 Schema Mismatches Found During API Testing

## 🔍 Summary
During systematic API testing, we discovered multiple column name mismatches between the database schema and the API/trigger code. These mismatches were causing API failures and have been documented for fixing.

## 🚨 Critical Mismatches Fixed

### 1. GST Trigger - Branch GST Column
- **Table**: `master.org_branches`
- **Wrong**: `b.gst_number`
- **Correct**: `b.branch_gst_number`
- **Fix Applied**: ✅ `FIX_GST_TRIGGER_BRANCH_GST.sql`
- **Status**: Deployed to production

### 2. Inventory Trigger - Last Movement Date
- **Table**: `inventory.batches`
- **Wrong**: `last_movement_date`
- **Correct**: `updated_at`
- **Fix Applied**: ✅ `FIX_INVENTORY_TRIGGER_UPDATED_AT.sql`
- **Status**: Deployed to production

### 3. Invoice Totals Trigger - Count Columns
- **Table**: `sales.invoices`
- **Wrong**: `items_count`, `total_quantity`
- **Correct**: These columns don't exist
- **Fix Applied**: ✅ `FIX_INVOICE_TOTALS_TRIGGER.sql`
- **Status**: Deployed to production

## 🔴 New Mismatches Found (Need Fixing)

### 4. Products Table - MRP Column
- **Table**: `inventory.products`
- **Wrong**: `mrp`
- **Correct**: `current_mrp`
- **Found In**: Order creation API
- **Error**: `column "mrp" does not exist`
- **Status**: ❌ Needs fix

### 5. Order Response Schema Issues
- **Issue**: OrderResponse schema expects fields that may be NULL in database:
  - `payment_terms` (can be NULL)
  - `paid_amount` (missing field)
  - `confirmed_at` (missing field)
  - `delivered_at` (missing field)
- **Status**: ❌ Needs schema adjustment

## 📊 Column Name Patterns Found

### Customer Table Inconsistencies
| API/Schema | Database Column |
|------------|----------------|
| `phone` | `primary_phone` |
| `gstin` | `gst_number` |
| `email` | `primary_email` |

### Product Table Inconsistencies
| API/Schema | Database Column |
|------------|----------------|
| `gst_percent` | `gst_percentage` |
| `mrp` | `current_mrp` |
| `gst_rate` | `gst_percentage` |

### Common Naming Patterns
1. **Phone Numbers**: Often prefixed with `primary_` in database
2. **GST Fields**: Inconsistent between `gst_number`, `gstin`, `gst_percentage`, `gst_rate`
3. **Timestamps**: Sometimes `created_at/updated_at`, sometimes specific like `confirmed_at`
4. **Counts**: Expected as `items_count` but not stored in database

## 🛠️ Recommended Actions

### Immediate Fixes Needed
1. **Fix Order API**:
   ```sql
   -- Update order service to use current_mrp instead of mrp
   SELECT 
       gst_percentage as gst_percent,
       COALESCE(current_mrp, 100) as mrp  -- Change this line
   FROM inventory.products
   ```

2. **Fix Order Response Schema**:
   - Make `payment_terms` optional
   - Remove or make optional: `paid_amount`, `confirmed_at`, `delivered_at`
   - Or ensure these fields are populated when fetching orders

### Long-term Recommendations
1. **Standardize Naming Conventions**:
   - Choose between `gst_number` or `gstin` and use consistently
   - Choose between `phone` or `primary_phone` and use consistently
   - Document the chosen conventions

2. **Schema Documentation**:
   - Update all schema documentation to reflect actual database columns
   - Create a mapping table for API fields to database columns
   - Add validation in API layer to catch mismatches early

3. **Testing Strategy**:
   - Continue systematic API testing for remaining modules
   - Create automated tests to detect schema mismatches
   - Add schema validation as part of CI/CD pipeline

## 📈 Impact Analysis

### APIs Affected
1. **Invoice API**: ✅ Fixed and working
2. **Products API**: ✅ Working (uses correct field names)
3. **Customer API**: ✅ Working (handles field variations)
4. **Order API**: ❌ Blocked by MRP column issue

### Risk Assessment
- **High Risk**: Order creation blocked for all users
- **Medium Risk**: Schema validation errors in list endpoints
- **Low Risk**: Field naming inconsistencies (handled by API layer)

## 🔄 Next Steps

1. Create fix for MRP column issue in order service
2. Update OrderResponse schema to handle nullable fields
3. Continue testing remaining APIs (Inventory, Purchase, Financial, Delivery)
4. Document all findings and create comprehensive fix script

---

**Created**: August 6, 2025  
**Purpose**: Document schema mismatches found during systematic API testing  
**Action Required**: Apply fixes for Order API to continue testing