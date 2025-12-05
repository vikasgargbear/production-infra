# CRITICAL: Offline Invoice Timestamp Bug

## Problem Discovered

When syncing offline invoices, the backend is using **today's date** instead of the **original invoice creation date**.

### Current Broken Flow

```javascript
// FRONTEND (Day 1 - Offline)
User creates invoice:
  invoice_date: "2024-12-01"  // Actual creation date
  created_at: "2024-12-01T10:30:00Z"
  
Saves to IndexedDB ✅

// BACKEND (Day 3 - Syncing)
Receives invoice data with:
  invoice_date: "2024-12-01"  // From frontend
  
But uses:
  order_date: date.today()  // ❌ 2024-12-03 (WRONG!)
```

### Impact

**Scenario:**
1. User works offline Dec 1-2 (creates 50 invoices)
2. Reconnects Dec 3
3. All invoices sync with **Dec 3** as order_date ❌
4. Reports show: 0 invoices on Dec 1-2, 50 on Dec 3 (WRONG!)
5. Accounting nightmare: Revenue recognition wrong dates
6. Inventory movement dates wrong
7. GST filing dates incorrect

## Root Cause

**File**: `backend/app/api/routes/invoices.py` Line ~172

```python
# Current (BROKEN):
order_create = db.execute(text("""
    INSERT INTO sales.orders (
        ...
        order_date, order_type,
        ...
    ) VALUES (
        ...
        :order_date, 'sales',  # <-- Uses date.today()
        ...
    )
"""), {
    ...
    "order_date": date.today(),  # ❌ ALWAYS TODAY!
    ...
})
```

## Fix Required

```python
# FIXED:
# Use invoice_date from frontend if provided, otherwise default to today
invoice_date_str = invoice_data.get("invoice_date")
if invoice_date_str:
    # Parse the date string from frontend
    try:
        invoice_date = datetime.fromisoformat(invoice_date_str.replace('Z', '+00:00')).date()
    except:
        invoice_date = date.today()
else:
    invoice_date = date.today()

order_create = db.execute(text("""
    INSERT INTO sales.orders (
        ...
        order_date, order_type,
        ...
    ) VALUES (
        ...
        :order_date, 'sales',  # ✅ Uses actual invoice date
        ...
    )
"""), {
    ...
    "order_date": invoice_date,  # ✅ CORRECT!
    ...
})
```

## What Frontend Sends

```javascript
// From useInvoiceLogic.js
const invoiceData = {
  ...invoice,
  customer_id: selectedCustomer.customer_id,
  invoice_date: invoice.invoice_date || getTodayBusinessDate(), // ✅ Date when created
  created_at: getUTCTimestamp(), // ✅ Timestamp when created
  items: [...],
  totals: {...}
};

// When saved offline:
await offlineDB.add('invoices', {
  ...invoiceData,  // ✅ Includes invoice_date
  sync_status: 'pending',
  created_offline: true
});

// When syncing:
const { _localId, _syncStatus, reserved_batches, ...invoice } = invoiceData;
await apiClient.post('/invoices', invoice);  // ✅ Sends invoice_date
```

## Similar Issues to Check

Need to check if `created_at` is also being overridden:

```python
# Current:
"created_by": created_by,
"created_at": CURRENT_TIMESTAMP  # ❌ Might also be wrong!

# Should be:
"created_by": created_by,
"created_at": invoice_data.get("created_at", datetime.utcnow())  # ✅ Use original
```

## Testing After Fix

### Test 1: Simple Offline Invoice
```
1. Dec 1 10:00 AM: Go offline
2. Dec 1 10:05 AM: Create invoice
3. Dec 1 10:10 AM: Check IndexedDB
   - invoice_date should be 2024-12-01 ✅
4. Dec 3 9:00 AM: Reconnect and sync
5. Query backend: SELECT order_date FROM sales.orders WHERE order_id = ?
   - Expected: 2024-12-01 ✅
   - Current bug: 2024-12-03 ❌
```

### Test 2: Multiple Days Offline
```
1. Dec 1: Create 10 invoices (offline)
2. Dec 2: Create 15 invoices (offline)
3. Dec 3: Reconnect and sync
4. Check backend:
   - 10 invoices with order_date = 2024-12-01 ✅
   - 15 invoices with order_date = 2024-12-02 ✅
   - Current bug: All 25 with order_date = 2024-12-03 ❌
```

### Test 3: Reports Accuracy
```
After syncing offline invoices:
1. Sales report for Dec 1: Should show correct revenue ✅
2. GST report for Dec 1-31: Should include all dates ✅
3. Inventory movement: Should match invoice dates ✅
```

## Priority

**CRITICAL** - This breaks:
- Accounting accuracy
- Revenue recognition dates
- GST filing
- Inventory reports
- Financial statements
- Audit trail

## Implementation Steps

1. Update `backend/app/api/routes/invoices.py`
2. Parse `invoice_date` from request
3. Parse `created_at` from request (if needed)
4. Use these instead of `date.today()` and `CURRENT_TIMESTAMP`
5. Add logging to track which date is used
6. Test with offline invoices
7. Verify reports show correct dates

## Verification Query

```sql
-- After fix, check if dates are preserved:
SELECT 
  order_id,
  order_number,
  order_date,  -- Should match original invoice_date
  created_at,  -- Should match original created_at
  customer_id
FROM sales.orders
WHERE order_number LIKE 'ORD-%'
ORDER BY created_at DESC
LIMIT 20;
```

## Status

- [x] Issue identified
- [ ] Backend fix implemented
- [ ] Tested with offline invoices
- [ ] Verified reports accuracy
- [ ] Deployed to production

## Related Code Locations

1. **Frontend saves date**: `frontend/src/components/sales/invoice/hooks/useInvoiceLogic.js:454`
2. **Backend ignores date**: `backend/app/api/routes/invoices.py:172`
3. **Sync sends date**: `frontend/src/services/offline/syncEngine.js:248`

---

**This must be fixed before offline invoicing goes to production!**
