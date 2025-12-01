# Batch Information Investigation

## Issue Reported
**User**: "why is batch no coming as NA"

This is CRITICAL for pharma/FMCG businesses that track batch numbers and expiry dates!

---

## Root Cause Found

### Problem 1: DataTransformer Missing Batch Fields ✅ FIXED
**File**: `frontend/src/services/dataTransformer.js`

**Before**:
```javascript
static transformProduct(product, context = 'default') {
  const base = {
    product_id: ...,
    product_name: ...,
    // ... other fields
    pack_size: product.pack_size || null
    // ❌ NO batch fields!
  };
}
```

**After (FIXED)**:
```javascript
static transformProduct(product, context = 'default') {
  const base = {
    // ... existing fields
    pack_size: product.pack_size || null,
    // ✅ ADDED batch fields
    batch_number: product.batch_number || product.batch_no || product.batchNo || null,
    batch_id: product.batch_id || null,
    expiry_date: product.expiry_date || product.expiryDate || null,
    manufacturing_date: product.manufacturing_date || product.mfg_date || product.mfgDate || null
  };
  
  // For invoice context, add alias
  case 'invoice':
    return {
      ...base,
      batch_no: base.batch_number // Backward compatibility
    };
}
```

---

### Problem 2: Backend May Not Send Batch Info ❓ INVESTIGATING

**File**: `backend/app/api/routes/products_consolidated.py`

**Current Query**:
```sql
SELECT 
    p.product_id, p.product_name, p.hsn_code,
    -- Gets pricing from batches
    (SELECT mrp_per_unit FROM inventory.batches ...),
    (SELECT sale_price_per_unit FROM inventory.batches ...),
    -- ❌ But NO batch_number or expiry_date!
FROM inventory.products p
```

**The Issue**:
- Backend aggregates data FROM batches (prices, stock)
- But doesn't return individual batch details
- When user adds product to invoice, no batch selection happens
- Invoice items show batch_number but it's NULL/undefined

---

## How It Should Work (Pharma/FMCG)

### Option A: Batch Selection (Recommended) ✅
```
User searches "Paracetamol"
  ↓
Shows product with multiple batches:
  - Batch B001, Exp: 12/2025, Stock: 100
  - Batch B002, Exp: 06/2026, Stock: 50
  ↓
User SELECTS batch B001
  ↓
Invoice item includes:
  - product_name: Paracetamol
  - batch_number: B001
  - expiry_date: 12/2025
  - quantity: 10
```

### Option B: Auto-Select Latest Batch (Simple) ✅
```
User searches "Paracetamol"
  ↓
Backend auto-selects batch with:
  - Nearest expiry (FEFO)
  - OR Latest manufacturing
  - OR Batch with most stock
  ↓
Returns product WITH batch info
  ↓
Invoice automatically has batch details
```

---

## Investigation Steps (TODO)

### Step 1: Check What Backend Returns
```bash
# Test the products search API
curl -X GET "http://localhost:8000/api/v1/products?search=Airpods" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Look for in response**:
```json
{
  "product_id": 122,
  "product_name": "Airpods Pro",
  "sale_price": 40,
  // ❓ Does it have these?
  "batch_number": "B001",
  "expiry_date": "2025-12-31",
  "batch_id": 45
}
```

---

### Step 2: Check Console Logs (Now Added)

After restart, when you add a product:

```
📦 [ADD ITEM] Raw product from search: { ... }
// ❓ Does this have batch_number?

📦 [ADD ITEM] Transformed product: { ... }
// ❓ Does this have batch_number?

📦 [ADD ITEM] Batch info: {
  batch_number: "B001" or null?
  expiry_date: "2025-12-31" or null?
}
```

**If null**: Backend doesn't send batch info  
**If has value**: DataTransformer now preserves it ✅

---

### Step 3: Check Display Components

**Files to check**:
1. `InvoicePreviewEnterprise.js` - Line 421
   ```javascript
   <div className="text-sm font-medium">{item.batch_number}</div>
   ```
   
2. `ItemsTableKeyboard.js` - Check batch column
   
3. `InvoicePreview.js` - Check batch display

---

## Solutions

### Short-term Fix: Show "-" Instead of "NA" ✅
```javascript
// In preview component
<div className="text-sm font-medium">
  {item.batch_number || '-'}
</div>
```

### Medium-term Fix: Auto-Select Batch ✅

**Backend Change** (`products_consolidated.py`):
```sql
SELECT 
    p.product_id, p.product_name,
    -- Add latest batch info
    (SELECT batch_number FROM inventory.batches b
     WHERE b.product_id = p.product_id
     ORDER BY b.expiry_date ASC  -- FEFO
     LIMIT 1) as batch_number,
    (SELECT expiry_date FROM inventory.batches b
     WHERE b.product_id = p.product_id
     ORDER BY b.expiry_date ASC
     LIMIT 1) as expiry_date
FROM inventory.products p
```

### Long-term Fix: Batch Selection UI ✅

**Add batch selector when adding items**:
```
[Airpods Pro ▼]
  ├─ Batch B001 (Exp: 12/2025) - Stock: 100 ✓ Selected
  ├─ Batch B002 (Exp: 06/2026) - Stock: 50
  └─ Batch B003 (Exp: 12/2026) - Stock: 25
```

---

## Testing Required

### Test 1: Check Raw Data
1. Restart frontend (`npm start`)
2. Hard refresh browser
3. Add product to invoice
4. Check console for `📦 [ADD ITEM]` logs
5. **Share the raw product object**

### Test 2: Check Backend Response
1. Open Network tab (F12)
2. Search for product
3. Click on `/products` request
4. Check Response tab
5. **Look for `batch_number` field**

### Test 3: Database Check
```sql
-- Check if products table has batch info
SELECT 
    p.product_id, p.product_name,
    b.batch_number, b.expiry_date,
    b.quantity_available
FROM inventory.products p
LEFT JOIN inventory.batches b ON p.product_id = b.product_id
WHERE p.product_name ILIKE '%Airpods%'
LIMIT 5;
```

---

## Expected Outcomes

### If Backend DOES Send Batch Info:
✅ DataTransformer now preserves it  
✅ Display components should show it  
✅ Just needed frontend fix (done!)

### If Backend DOESN'T Send Batch Info:
❌ Need to update products API  
❌ Add batch selection logic  
❌ Update query to include batch data

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| DataTransformer | ✅ FIXED | Now includes batch fields |
| Display Components | ✅ OK | Already expect batch_number |
| Backend API | ❓ UNKNOWN | Need to check response |
| Batch Selection UI | ❌ MISSING | Not implemented yet |

---

## Next Steps

1. **USER**: Restart frontend and add product
2. **USER**: Share console log showing `📦 [ADD ITEM]` output
3. **DROID**: Analyze if batch info is in raw data
4. **DECISION**: 
   - If YES → Just test and confirm working
   - If NO → Update backend products API

---

**Priority**: MEDIUM  
**Impact**: Shows "NA" instead of batch number  
**Risk**: Low (doesn't break invoices, just missing info)  
**Time**: 30 minutes if backend fix needed  

