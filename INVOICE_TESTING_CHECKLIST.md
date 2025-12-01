# Invoice Component - Production Testing Checklist

## Pre-Testing Setup

### Backend Verification
```bash
# 1. Verify backend is running
curl http://localhost:8000/health

# 2. Check invoice endpoint
curl -X POST http://localhost:8000/api/v1/invoices/generate-number

# 3. Verify database connection
# Check Railway logs or local PostgreSQL connection
```

### Frontend Verification
```bash
# 1. Start frontend
cd frontend
npm start

# 2. Check browser console
# Should see: [ServiceWorker] ✅ Registered successfully

# 3. Check Application tab in DevTools
# - Service Worker: Activated and running
# - IndexedDB: PharmaERPOffline database created
# - LocalStorage: Should be empty initially
```

---

## Test Suite 1: Online Invoice Creation (Happy Path)

### Test 1.1: Basic Invoice Creation
**Steps:**
1. Open invoice creation page
2. Select customer
3. Add 2-3 products with quantities
4. Click "Save Invoice"

**Expected:**
- ✅ Invoice saves successfully
- ✅ Toast: "✅ Invoice created successfully"
- ✅ Success modal appears
- ✅ Invoice number generated (e.g., INV-001)
- ✅ Draft cleared from localStorage

**Verify:**
```bash
# Check backend logs
# Should see: "✅ Inventory deducted: Batch X quantity reduced by Y"

# Check database
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -c "SELECT * FROM sales.invoices ORDER BY created_at DESC LIMIT 1;"
```

### Test 1.2: Invoice with Insufficient Stock
**Steps:**
1. Find a batch with only 5 units
2. Create invoice with 10 units from that batch
3. Click "Save Invoice"

**Expected:**
- ❌ Invoice creation fails
- ❌ Toast: "Insufficient Stock: Only 5 units available"
- ❌ Error message shows product details
- ✅ No invoice created in database
- ✅ Stock not deducted

---

## Test Suite 2: Offline Functionality

### Test 2.1: Create Invoice Offline
**Steps:**
1. Open DevTools → Network tab
2. Check "Offline" checkbox
3. Create invoice (customer + items)
4. Click "Save Invoice"

**Expected:**
- ✅ Toast: "📱 Invoice saved offline - Will sync when online"
- ✅ Success modal shows
- ✅ Invoice saved to IndexedDB
- ✅ Sync queue has 1 pending item
- ✅ Offline indicator appears (bottom-right)

**Verify IndexedDB:**
```javascript
// In Browser Console
const db = await indexedDB.open('PharmaERPOffline');
const tx = db.transaction('invoices', 'readonly');
const store = tx.objectStore('invoices');
const invoices = await store.getAll();
console.log('Offline invoices:', invoices);
```

### Test 2.2: Auto-Sync on Reconnect
**Steps:**
1. Create 2-3 invoices offline (Test 2.1)
2. Uncheck "Offline" in DevTools
3. Wait 5 seconds

**Expected:**
- ✅ OfflineIndicator shows "🔄 Syncing X items..."
- ✅ Sync happens automatically
- ✅ Toast: "✅ Synced X invoices successfully"
- ✅ Items removed from sync queue
- ✅ Invoices appear in backend/database

**Verify:**
```javascript
// Check sync queue is empty
const queue = await db.transaction('sync_queue').objectStore('sync_queue').getAll();
console.log('Sync queue:', queue); // Should be empty
```

### Test 2.3: Offline + Stock Conflict on Sync
**Steps:**
1. Go offline
2. Create invoice with 10 units of Product A
3. Create invoice with 15 units of Product A
4. (While offline) Manually reduce Product A batch to 5 units in database
5. Go online

**Expected:**
- ⚠️ First invoice syncs ✅ (if fits in 5 units) OR fails ❌
- ⚠️ Second invoice fails with conflict
- ⚠️ Toast: "⚠️ X invoices failed - insufficient stock"
- ⚠️ OfflineIndicator shows "View Conflicts" button
- ✅ Click "View Conflicts" → ConflictResolutionModal opens

**Conflict Modal Expected:**
- Shows failed invoice details
- Shows required vs available qty
- Offers 3 options:
  1. "Adjust to X" - Update to available qty
  2. "Keep for Later" - Hold for manual review
  3. "Cancel Invoice" - Delete invoice

---

## Test Suite 3: Draft Auto-Save

### Test 3.1: Auto-Save While Editing
**Steps:**
1. Select customer
2. Add 2 items
3. Wait 35 seconds (auto-save is 30 sec)

**Expected:**
- ✅ Console log: "[Invoice] Auto-saved draft"
- ✅ localStorage has 'invoice_draft' key

**Verify:**
```javascript
// In Browser Console
const draft = JSON.parse(localStorage.getItem('invoice_draft'));
console.log('Draft:', draft);
// Should have customer_id, items, draft_saved_at
```

### Test 3.2: Restore Draft on Page Reload
**Steps:**
1. Create draft (Test 3.1)
2. Refresh page (F5)

**Expected:**
- ✅ Alert: "Found an unsaved invoice draft. Would you like to restore it?"
- ✅ Click "OK" → Invoice restored with customer + items
- ✅ Click "Cancel" → Draft cleared, fresh invoice

### Test 3.3: Draft Cleared After Save
**Steps:**
1. Create draft
2. Save invoice successfully
3. Check localStorage

**Expected:**
- ✅ localStorage 'invoice_draft' removed
- ✅ No restore prompt on next page load

### Test 3.4: Old Draft Ignored
**Steps:**
1. Manually set draft_saved_at to 2 days ago
2. Refresh page

**Expected:**
- ❌ No restore prompt (draft too old)
- ✅ Old draft auto-deleted

---

## Test Suite 4: Performance & Optimization

### Test 4.1: React.memo - No Unnecessary Re-renders
**Steps:**
1. Open React DevTools → Profiler
2. Start recording
3. Type in customer search
4. Stop recording

**Expected:**
- ✅ Only CustomerSearch component re-renders
- ✅ InvoiceItemsStep NOT re-rendered
- ✅ Overall render time < 16ms (60fps)

### Test 4.2: Large Invoice (50+ Items)
**Steps:**
1. Import CSV with 50 products
2. Observe loading time

**Expected:**
- ✅ Page remains responsive
- ✅ No lag when scrolling items table
- ✅ Total calculation updates instantly

---

## Test Suite 5: Edge Cases

### Test 5.1: Network Interruption During Save
**Steps:**
1. Start saving invoice
2. Go offline immediately (before response)
3. Go online

**Expected:**
- ⚠️ Save fails (network error)
- ✅ Error toast shown
- ✅ Invoice NOT in database
- ✅ User can retry

### Test 5.2: Duplicate Invoice Numbers (Offline)
**Steps:**
1. Create invoice #1 offline (INV-001)
2. Create invoice #2 offline (INV-001 - same number)
3. Sync

**Expected:**
- ⚠️ Both invoices have different temp_ids
- ⚠️ Backend assigns different real invoice numbers
- ✅ No duplicate invoice_number in database

### Test 5.3: Multiple Tabs Syncing
**Steps:**
1. Open app in 2 tabs
2. Create invoice offline in Tab 1
3. Create invoice offline in Tab 2
4. Go online in both tabs

**Expected:**
- ✅ Both invoices sync successfully
- ✅ No race conditions
- ✅ Stock deducted correctly (sequential)

---

## Test Suite 6: Conflict Resolution

### Test 6.1: Adjust Quantity
**Steps:**
1. Create conflict (Test 2.3)
2. Click "View Conflicts"
3. Click "Adjust to 5"

**Expected:**
- ✅ Invoice updated in IndexedDB
- ✅ Re-sync triggered automatically
- ✅ Invoice syncs successfully with adjusted qty
- ✅ Conflict removed from queue
- ✅ Modal closes

### Test 6.2: Cancel Invoice
**Steps:**
1. Create conflict
2. Click "Cancel Invoice"
3. Confirm

**Expected:**
- ✅ Invoice deleted from IndexedDB
- ✅ Removed from sync queue
- ✅ Toast: "Invoice cancelled"
- ✅ Conflict count decreases

### Test 6.3: Keep for Later
**Steps:**
1. Create conflict
2. Click "Keep for Later"

**Expected:**
- ✅ Invoice marked as "ON_HOLD"
- ✅ Won't auto-retry
- ✅ Toast: "Kept for later - retry when stock arrives"
- ✅ User can manually retry later

---

## Test Suite 7: UI/UX

### Test 7.1: Offline Indicator Visibility
**Scenarios:**
| Online | Pending | Indicator Shown? |
|--------|---------|------------------|
| ✅     | 0       | ❌ No            |
| ✅     | 5       | ✅ Yes           |
| ❌     | 0       | ✅ Yes (offline) |
| ❌     | 5       | ✅ Yes (offline) |

### Test 7.2: Loading States
**Check all these show spinners:**
- [ ] Initial page load
- [ ] Generating invoice number
- [ ] Saving invoice
- [ ] Syncing offline invoices
- [ ] Loading conflicts

### Test 7.3: Error Messages
**Check all are user-friendly:**
- [ ] "Please select a customer" (validation)
- [ ] "Insufficient Stock: Only X units available" (stock)
- [ ] "Invoice saved offline - Will sync when online" (offline)
- [ ] "Failed to create invoice" (generic error)

---

## Performance Benchmarks

### Target Metrics
```
✅ Time to Interactive: < 3 seconds
✅ Invoice Save (Online): < 1 second
✅ Invoice Save (Offline): < 200ms
✅ Sync 10 invoices: < 5 seconds
✅ Draft Auto-Save: < 100ms
✅ Component Re-render: < 16ms (60fps)
```

### Measure in Chrome DevTools
```javascript
// Performance API
performance.mark('invoice-save-start');
// ... save invoice ...
performance.mark('invoice-save-end');
performance.measure('invoice-save', 'invoice-save-start', 'invoice-save-end');
console.log(performance.getEntriesByName('invoice-save'));
```

---

## Browser Compatibility

**Test on:**
- [ ] Chrome 90+ (Primary)
- [ ] Edge 90+
- [ ] Firefox 88+
- [ ] Safari 14+ (Mac/iOS)

**IndexedDB Support:**
- [ ] Chrome ✅
- [ ] Firefox ✅
- [ ] Safari ✅
- [ ] Edge ✅

---

## Security Checklist

### Data Protection
- [ ] No invoice data in browser console (production)
- [ ] LocalStorage draft encrypted? (Future)
- [ ] IndexedDB not accessible to other origins
- [ ] Service Worker caches sensitive data? (Review)

### API Security
- [ ] All invoice endpoints require authentication
- [ ] org_id validated on backend
- [ ] Stock deduction atomic (transaction)
- [ ] No SQL injection possible

---

## Production Readiness Checklist

### Code Quality
- [x] Service Worker registered
- [x] Offline DB integrated
- [x] Auto-save drafts implemented
- [x] React.memo optimizations
- [x] Conflict resolution modal
- [x] Stock validation backend
- [x] Chronological sync
- [x] Error handling comprehensive

### Documentation
- [x] Offline sync strategy documented
- [x] Testing checklist created
- [x] Code comments added
- [ ] User guide/help docs

### Deployment
- [ ] Backend deployed to Railway
- [ ] Frontend deployed (Vercel/Netlify)
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Service Worker cacheable assets configured

### Monitoring
- [ ] Error tracking (Sentry/LogRocket)
- [ ] Performance monitoring (Web Vitals)
- [ ] Sync success/failure metrics
- [ ] Stock conflict alerts

---

## Known Issues / Limitations

### Current Limitations
1. **No batch reservation**: Offline invoices don't reserve stock
2. **Manual conflict resolution**: No auto-adjust to available stock
3. **No multi-warehouse**: Single location only
4. **No partial fulfillment**: All-or-nothing stock deduction

### Future Enhancements
1. **Smart conflict resolution**: Auto-adjust with user confirmation
2. **Batch expiry alerts**: Warn before using expired batches
3. **Real-time stock updates**: WebSocket for live inventory
4. **Bulk invoice import**: CSV upload for multiple invoices

---

## Emergency Rollback Plan

### If Critical Issue Found

**1. Disable Offline Mode:**
```javascript
// In serviceWorkerRegistration.js
serviceWorkerRegistration.unregister(); // Comment out register()
```

**2. Revert Backend Stock Validation:**
```python
# In invoices.py, line 579
# Change from:
raise HTTPException(...)
# Back to:
logger.warning("Insufficient stock")
```

**3. Clear User's Offline Data:**
```javascript
// In browser console (provide to users)
localStorage.clear();
indexedDB.deleteDatabase('PharmaERPOffline');
location.reload();
```

---

## Sign-Off

**Tested By**: _______________  
**Date**: _______________  
**Environment**: Production / Staging / Local  

**Test Results:**
- [ ] All critical tests passed
- [ ] Known issues documented
- [ ] Performance benchmarks met
- [ ] Ready for production deployment

**Notes:**
_____________________________________________
_____________________________________________
_____________________________________________

