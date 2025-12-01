# Offline-First Sync Strategy

## Overview
Complete implementation of offline-first architecture with intelligent syncing, conflict resolution, and inventory consistency.

## Architecture

### **Frontend Components**
1. **IndexedDB** (`offlineDatabase.js`)
   - Stores: invoices, customers, products, payments, sync_queue
   - Tracks: sync_status, timestamps, retry attempts
   
2. **Sync Engine** (`syncEngine.js`)
   - **Chronological Sync**: Sorts by invoice_date before syncing
   - **Sequential Processing**: One invoice at a time (no parallel)
   - **Conflict Detection**: Catches 409 errors from backend
   - **Auto-Retry**: Incremental backoff for failed syncs

3. **Network Monitor** (`networkMonitor.js`)
   - Listens: `window.online`/`offline` events
   - **Auto-Sync on Reconnect**: Triggers `syncEngine.startSync()`
   - Visual indicators for offline state

4. **Service Worker** (`service-worker.js`)
   - Caches API responses
   - Queues offline requests
   - Background sync when online

### **Backend Validation**
1. **Stock Validation** (`/api/invoices POST`)
   ```sql
   UPDATE inventory.batches
   SET quantity_available = quantity_available - :quantity
   WHERE batch_id = :batch_id
   AND quantity_available >= :quantity  -- VALIDATION!
   RETURNING quantity_available
   ```
   
2. **Conflict Response** (409 status)
   ```json
   {
     "error": "INSUFFICIENT_STOCK",
     "message": "Required 90, Available 50",
     "product_id": 123,
     "batch_id": 456,
     "required_quantity": 90,
     "available_quantity": 50,
     "invoice_number": "INV-20231201-001"
   }
   ```

## Complete Flow

### **Scenario: 90 Products Sold Offline**

#### **Initial State (Online)**
```
Product Batch #456
├── Quantity Available: 100
└── Last Sync: 2024-12-01 10:00 AM
```

#### **User Goes Offline**
```
📱 User Disconnects (10:05 AM)
└── NetworkMonitor detects offline
    └── Updates UI with OfflineIndicator
```

#### **Creating Invoices Offline**
```javascript
// InvoiceFlow.js (enhanced)
const handleSaveInvoice = async (invoiceData) => {
  if (!isOnline) {
    // 1. Save to IndexedDB
    const tempId = await offlineDB.add('invoices', {
      ...invoiceData,
      temp_id: `LOCAL_${Date.now()}`,
      invoice_date: new Date().toISOString(),
      created_offline: true
    });
    
    // 2. Add to sync queue
    await offlineDB.addToSyncQueue('invoices', tempId, 'create');
    
    // 3. Show success (offline)
    toast.success('Invoice saved offline. Will sync when online.');
    return;
  }
  
  // Normal online flow...
};
```

#### **Offline State**
```
10:10 AM - Invoice #1 created (Qty: 10) → IndexedDB
10:15 AM - Invoice #2 created (Qty: 20) → IndexedDB
10:20 AM - Invoice #3 created (Qty: 15) → IndexedDB
...
11:00 AM - Invoice #10 created (Qty: 10) → IndexedDB

Total Offline Sales: 90 units
IndexedDB Sync Queue: 10 invoices pending
```

#### **Meanwhile Online (Someone Else)**
```
10:30 AM - Another user sells 50 units
Server State:
├── Batch #456: 100 - 50 = 50 available
└── Invoice #ONLINE-001 created
```

#### **User Reconnects (11:05 AM)**
```
1. NetworkMonitor detects online
   └── Triggers: syncEngine.startSync()

2. Sync Engine Preparation:
   ├── Get pending items: 10 invoices
   ├── Sort chronologically by invoice_date (oldest first)
   └── Process sequentially (NO parallel)

3. Sequential Sync Process:
   
   Invoice #1 (10:10 AM, Qty: 10)
   ├── POST /api/invoices
   ├── Backend checks: 50 available >= 10 ✅
   ├── Deduct: 50 - 10 = 40 remaining
   ├── Response: 200 OK
   └── Frontend: Mark synced, remove from queue
   
   Invoice #2 (10:15 AM, Qty: 20)
   ├── POST /api/invoices
   ├── Backend checks: 40 available >= 20 ✅
   ├── Deduct: 40 - 20 = 20 remaining
   ├── Response: 200 OK
   └── Frontend: Mark synced, remove from queue
   
   Invoice #3 (10:20 AM, Qty: 15)
   ├── POST /api/invoices
   ├── Backend checks: 20 available >= 15 ✅
   ├── Deduct: 20 - 15 = 5 remaining
   ├── Response: 200 OK
   └── Frontend: Mark synced, remove from queue
   
   Invoice #4 (10:25 AM, Qty: 10)
   ├── POST /api/invoices
   ├── Backend checks: 5 available >= 10 ❌ FAILED!
   ├── Response: 409 CONFLICT
   │   {
   │     "error": "INSUFFICIENT_STOCK",
   │     "required_quantity": 10,
   │     "available_quantity": 5
   │   }
   └── Frontend: Mark as CONFLICT, keep in queue
   
   Invoices #5-#10: ALL FAIL (insufficient stock)
   └── All marked as conflicts
```

#### **Sync Result**
```
✅ Synced: 3 invoices (45 units)
⚠️ Conflicts: 7 invoices (45 units)

Server Final State:
└── Batch #456: 5 units remaining

User Notification:
"⚠️ 7 invoices failed to sync due to insufficient stock.
Please review and adjust quantities."
```

## Conflict Resolution UI

```javascript
// ConflictResolutionModal.js (NEW)
const ConflictResolutionModal = ({ conflicts }) => {
  return (
    <div>
      <h2>Sync Conflicts Detected</h2>
      <p>The following invoices couldn't be synced due to insufficient stock:</p>
      
      {conflicts.map(conflict => (
        <div key={conflict.invoiceNumber}>
          <h3>Invoice: {conflict.invoiceNumber}</h3>
          <p>Product ID: {conflict.productId}</p>
          <p>Required: {conflict.requiredQty}</p>
          <p>Available: {conflict.availableQty}</p>
          
          <button onClick={() => adjustQuantity(conflict)}>
            Adjust Quantity to {conflict.availableQty}
          </button>
          
          <button onClick={() => cancelInvoice(conflict)}>
            Cancel Invoice
          </button>
          
          <button onClick={() => orderMore(conflict)}>
            Order More Stock
          </button>
        </div>
      ))}
    </div>
  );
};
```

## Key Features

### ✅ **Incremental Backup**
- Only new/changed records sync
- Timestamp-based: `sync_queue.created_at`
- No full database dumps

### ✅ **Stock Consistency**
```
Offline Local Display (Read-Only):
└── Shows last known stock from IndexedDB

Server (Source of Truth):
└── Real-time stock deduction on invoice creation

Sync Behavior:
├── Offline invoices: Optimistic (assume success)
└── Online sync: Validates actual stock availability
```

### ✅ **Conflict Prevention**
1. **Chronological Order**: Oldest invoice syncs first
2. **Sequential Processing**: One at a time
3. **Atomic Validation**: Stock check + deduction in single transaction
4. **Immediate Failure**: Rolls back on insufficient stock

### ✅ **User Experience**
```
Offline:
└── "✅ Invoice saved offline. Will sync automatically."

Reconnecting:
└── "🔄 Syncing 10 items..."

Success:
└── "✅ Synced 3 invoices successfully"

Conflicts:
└── "⚠️ 7 invoices need review - insufficient stock"
    └── Shows modal with options
```

## Database Triggers (Future Enhancement)

```sql
-- Optimistic Concurrency Control
ALTER TABLE inventory.batches
ADD COLUMN version INTEGER DEFAULT 1;

CREATE TRIGGER increment_batch_version
BEFORE UPDATE ON inventory.batches
FOR EACH ROW
EXECUTE FUNCTION increment_version();

-- Frontend sends version in request
-- Backend checks: WHERE version = :expected_version
-- If mismatch → 409 Conflict
```

## Testing Checklist

- [ ] Service worker registered
- [ ] Offline indicator appears when disconnected
- [ ] Invoice saves to IndexedDB offline
- [ ] Sync triggers on reconnect
- [ ] Chronological order maintained
- [ ] Sequential processing (not parallel)
- [ ] Stock validation works
- [ ] 409 conflicts caught properly
- [ ] Conflict modal shows detailed info
- [ ] Re-sync after adjusting quantities
- [ ] Inventory movement recorded
- [ ] Final stock count accurate

## Monitoring & Logging

```javascript
// Sync Stats
{
  lastSync: "2024-12-01T11:05:00Z",
  pending: 0,
  synced: 3,
  failed: 0,
  conflicts: 7,
  totalProcessed: 10
}

// Backend Logs
[INFO] ✅ Inventory deducted: Batch 456, -10, new available: 40
[ERROR] ❌ INVOICE CREATION FAILED: Insufficient stock (Required 10, Available 5)
[INFO] 📦 Inventory movement recorded for batch 456
```

## Future Enhancements

1. **Batch Reservation System**
   - Reserve stock when creating offline invoices
   - Release reservations if not synced within 24h

2. **Smart Conflict Resolution**
   - Auto-adjust to available quantity
   - Partial fulfillment with backorder

3. **Multi-Warehouse**
   - Check other locations for stock
   - Suggest transfers

4. **Real-time Stock Updates**
   - WebSocket for live inventory changes
   - Push notifications for low stock

---

**Status**: ✅ Implemented
**Last Updated**: 2024-12-01
**Tested**: Pending full integration test
