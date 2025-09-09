# Sales Module Cleanup & Enhancement Plan

## Overview
This plan addresses cleanup opportunities, error handling improvements, component globalization, and offline support for the sales module.

## 1. Components to Make Global (Extract from Sales Module)

### High Priority - Reusable UI Components
These components should be moved to `/frontend/src/components/global/`:

#### **BillSummary.tsx** → `/global/ui/display/BillSummary.tsx`
- Generic bill/invoice summary component
- Used across sales, purchase, returns modules
- Line: `/sales/components/BillSummary.tsx`

#### **PaymentDetails.tsx** → `/global/ui/display/PaymentDetails.tsx`
- Payment breakdown display component
- Reusable in any payment context
- Line: `/sales/components/PaymentDetails.tsx`

#### **TransportDetails.tsx** → `/global/ui/forms/TransportDetails.tsx`
- Shipping/transport information form
- Useful for any delivery-related module
- Line: `/sales/components/TransportDetails.tsx`

#### **ImportDocumentModal** (Consolidated) → `/global/modals/ImportDocumentModal.tsx`
- Merge `/sales/components/ImportDocumentModal.tsx` and `ImportFromDocumentModal.js`
- Single flexible component for all document imports
- Support all document types: invoices, orders, challans, etc.

### Medium Priority - Module Headers
#### **SalesHeader.tsx** → Can be generalized as `ModuleHeader`
- Already have ModuleHeader in global, check if SalesHeader adds unique value
- If yes, merge unique features into ModuleHeader

## 2. Error Handling Improvements

### Add Toast Notifications
Replace console.error and silent failures with user-friendly toast messages:

#### **InvoiceFlow.js** - Critical Error Points
```javascript
// Line 97-105: Invoice number generation
} catch (error) {
  console.error('Error generating invoice number:', error);
  // ADD: toast.error('Failed to generate invoice number. Please try again.');
}

// Line 1650-1660: Save invoice
} catch (error) {
  console.error('Error saving invoice:', error);
  // ADD: toast.error(error.response?.data?.message || 'Failed to save invoice. Please check your data and try again.');
}

// Line 850-860: Customer search
} catch (error) {
  console.error('Error searching customers:', error);
  // ADD: toast.error('Failed to search customers. Please try again.');
}
```

#### **SalesOrderFlow.js** - Critical Error Points
```javascript
// Similar pattern for:
// - Order number generation
// - Order saving
// - Product search failures
// - Customer search failures
```

### Error Handling Pattern to Implement
```javascript
// Standard error handler with toast
const handleApiError = (error, defaultMessage) => {
  const message = error.response?.data?.message || error.message || defaultMessage;
  toast.error(message);
  
  // Log for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error('API Error:', error);
  }
};

// Usage
try {
  const result = await apiCall();
  // ... success handling
} catch (error) {
  handleApiError(error, 'Operation failed. Please try again.');
}
```

## 3. Offline Support Strategy (Critical for India)

### Industry Best Practices (How Major Companies Do It)

#### **Google Docs/Microsoft Office Approach**
- **Local-First Architecture**: All edits happen locally first
- **Background Sync**: Changes sync when connection available
- **Conflict Resolution**: Last-write-wins or merge strategies
- **Visual Indicators**: Clear offline/online status

#### **WhatsApp/Telegram Approach**
- **Message Queue**: All messages queued locally
- **Retry Logic**: Automatic retry with exponential backoff
- **Delivery Confirmation**: Ticks/checks show sync status

### Our Implementation Strategy

#### **1. Service Worker & Cache Strategy**
```javascript
// service-worker.js
const CACHE_NAME = 'pharma-erp-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/bundle.js',
  // Core app assets
];

// Cache strategies:
// - Cache First: Static assets, product images
// - Network First: API calls with fallback to cache
// - Background Sync: Queue POST/PUT/DELETE operations
```

#### **2. Local Database (IndexedDB)**
```javascript
// offlineDatabase.js
const DB_NAME = 'PharmaERPOffline';
const DB_VERSION = 1;

// Stores to create:
const stores = {
  customers: { keyPath: 'id', indexes: ['name', 'phone'] },
  products: { keyPath: 'id', indexes: ['name', 'sku'] },
  invoices: { keyPath: 'temp_id', indexes: ['invoice_number', 'sync_status'] },
  queue: { keyPath: 'id', autoIncrement: true },
  settings: { keyPath: 'key' }
};

// Sync status enum:
const SYNC_STATUS = {
  PENDING: 'pending',      // Created offline
  SYNCING: 'syncing',     // Currently syncing
  SYNCED: 'synced',       // Successfully synced
  CONFLICT: 'conflict',   // Needs resolution
  FAILED: 'failed'        // Sync failed
};
```

#### **3. Data to Cache Locally**
```javascript
// Essential data for offline operation:
const offlineData = {
  // Reference Data (cached on login, updated periodically)
  customers: [],        // Top 500 customers
  products: [],        // All active products
  taxRates: [],        // GST rates
  companyInfo: {},     // Company settings
  documentNumbers: {}, // Pre-allocated invoice numbers
  
  // Transactional Data (stored when created offline)
  pendingInvoices: [],
  pendingOrders: [],
  pendingPayments: []
};
```

#### **4. Offline Invoice Creation Flow**
```javascript
// offlineInvoiceService.js
class OfflineInvoiceService {
  async createInvoice(invoiceData) {
    // 1. Generate temporary ID
    const tempId = `offline_${Date.now()}_${Math.random()}`;
    
    // 2. Use pre-allocated invoice number
    const invoiceNumber = await this.getNextOfflineInvoiceNumber();
    
    // 3. Calculate locally (replicate backend logic)
    const calculated = this.calculateInvoiceOffline(invoiceData);
    
    // 4. Store in IndexedDB
    await db.invoices.add({
      ...calculated,
      temp_id: tempId,
      invoice_number: invoiceNumber,
      sync_status: SYNC_STATUS.PENDING,
      created_offline: true,
      created_at: new Date().toISOString()
    });
    
    // 5. Add to sync queue
    await this.addToSyncQueue('invoice', tempId);
    
    // 6. Show success with offline indicator
    toast.success('Invoice saved offline. Will sync when connected.');
    
    return { tempId, invoiceNumber };
  }
  
  calculateInvoiceOffline(data) {
    // Replicate backend calculation logic
    // Including tax calculations, discounts, etc.
    // Use cached tax rates
  }
}
```

#### **5. Sync Engine**
```javascript
// syncEngine.js
class SyncEngine {
  constructor() {
    this.syncInProgress = false;
    this.retryCount = 0;
    this.maxRetries = 5;
  }
  
  async startSync() {
    if (this.syncInProgress) return;
    
    this.syncInProgress = true;
    const queue = await this.getSyncQueue();
    
    for (const item of queue) {
      try {
        await this.syncItem(item);
        await this.markSynced(item.id);
      } catch (error) {
        await this.handleSyncError(item, error);
      }
    }
    
    this.syncInProgress = false;
  }
  
  async syncItem(item) {
    switch (item.type) {
      case 'invoice':
        return await this.syncInvoice(item);
      case 'payment':
        return await this.syncPayment(item);
      // ... other types
    }
  }
  
  async handleConflict(local, remote) {
    // Conflict resolution strategies:
    // 1. Last-write-wins (timestamp based)
    // 2. Merge (combine changes)
    // 3. User choice (show dialog)
    
    if (local.updated_at > remote.updated_at) {
      return local; // Keep local version
    }
    return remote; // Keep server version
  }
}
```

#### **6. Network Status Monitor**
```javascript
// networkMonitor.js
class NetworkMonitor {
  constructor() {
    this.isOnline = navigator.onLine;
    this.listeners = [];
    
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }
  
  handleOnline() {
    this.isOnline = true;
    toast.success('Back online! Syncing data...');
    
    // Start sync immediately
    syncEngine.startSync();
    
    // Update UI indicators
    this.updateStatusIndicators();
  }
  
  handleOffline() {
    this.isOnline = false;
    toast.warning('You are offline. Changes will be saved locally.');
    
    // Update UI indicators
    this.updateStatusIndicators();
  }
}
```

#### **7. Local Trigger/Calculation Replication**
```javascript
// localTriggers.js
// Replicate PostgreSQL triggers in JavaScript

const localTriggers = {
  // Calculate invoice totals (replicate backend trigger)
  calculateInvoiceTotals(items, discounts, taxes) {
    let subtotal = 0;
    
    items.forEach(item => {
      const itemTotal = item.quantity * item.rate;
      const discountAmount = (itemTotal * (item.discount || 0)) / 100;
      const taxableAmount = itemTotal - discountAmount;
      const gstAmount = (taxableAmount * (item.gst_rate || 0)) / 100;
      
      subtotal += taxableAmount + gstAmount;
    });
    
    // Apply invoice-level discount
    const invoiceDiscount = (subtotal * (discounts.percentage || 0)) / 100;
    const finalAmount = subtotal - invoiceDiscount;
    
    return {
      subtotal,
      discount_amount: invoiceDiscount,
      tax_amount: taxes.total || 0,
      total_amount: finalAmount
    };
  },
  
  // Update customer outstanding (replicate backend trigger)
  updateCustomerOutstanding(customerId, amount, type) {
    // Update local customer outstanding balance
    const customer = localDB.customers.get(customerId);
    if (customer) {
      if (type === 'invoice') {
        customer.outstanding += amount;
      } else if (type === 'payment') {
        customer.outstanding -= amount;
      }
      localDB.customers.put(customer);
    }
  }
};
```

#### **8. UI Indicators**
```javascript
// OfflineIndicator.jsx
const OfflineIndicator = () => {
  const { isOnline, pendingCount } = useNetworkStatus();
  
  return (
    <div className={`status-bar ${isOnline ? 'online' : 'offline'}`}>
      {!isOnline && (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Offline Mode</span>
          {pendingCount > 0 && (
            <span className="badge">{pendingCount} pending</span>
          )}
        </>
      )}
      {isOnline && pendingCount > 0 && (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Syncing {pendingCount} items...</span>
        </>
      )}
    </div>
  );
};
```

### Pre-allocation Strategy for Invoice Numbers

```javascript
// Pre-allocate invoice numbers when online
async function preallocateInvoiceNumbers() {
  if (!navigator.onLine) return;
  
  try {
    // Request 50 invoice numbers from backend
    const response = await api.post('/allocate-invoice-numbers', {
      count: 50,
      type: 'invoice'
    });
    
    // Store in IndexedDB
    await localDB.settings.put({
      key: 'preallocated_numbers',
      value: response.data.numbers,
      allocated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to preallocate numbers:', error);
  }
}
```

### Data Sync Priority

1. **High Priority** (sync immediately when online):
   - Payments
   - Invoices
   - Stock adjustments

2. **Medium Priority** (sync within 5 minutes):
   - Customer updates
   - Product updates
   - Orders

3. **Low Priority** (sync when idle):
   - Reports
   - Analytics
   - Logs

### Conflict Resolution Strategies

1. **Invoice Conflicts**:
   - Check if invoice number already used
   - If yes, assign new number and notify user
   - Merge line items if needed

2. **Stock Conflicts**:
   - Server stock levels take precedence
   - Queue local stock adjustments
   - Notify if stock insufficient

3. **Payment Conflicts**:
   - Never duplicate payments
   - Verify payment status before retry
   - Manual intervention for disputes

## 4. Files to Remove/Archive

### Safe to Remove
1. **InvoiceSuccessModal.js** - Replaced by GenericSuccessModal
   - Update imports in InvoiceFlow.js

2. **InvoiceContainer.js + InvoiceSidebar.js** - If sidebar approach not used
   - Check if any routes use InvoiceContainer
   - If not, archive both files

3. **UnifiedSalesHistory.js** - Appears unused
   - No imports found outside module
   - Verify and archive

## 4. Code Cleanup Tasks

### InvoiceFlow.js (2,253 lines - needs refactoring)
1. **Remove commented imports** (Lines 24, 27)
2. **Extract sub-components to reduce file size**:
   - Customer selection section → `InvoiceCustomerSection.js`
   - Product selection section → `InvoiceProductSection.js`
   - Payment section → `InvoicePaymentSection.js`
   - Summary section → `InvoiceSummarySection.js`

### Rename for Clarity
- `InvoiceListV2.tsx` → `InvoiceList.tsx` (no V1 exists)

### Consolidate Import Modals
- Merge `ImportDocumentModal.tsx` and `ImportFromDocumentModal.js`
- Create single TypeScript component with props for document type

## 6. Implementation Steps

### Phase 1: Offline Infrastructure (Days 1-3) - PRIORITY
1. **Day 1: Service Worker & IndexedDB Setup**
   - Create service worker with caching strategies
   - Set up IndexedDB schema for offline storage
   - Implement network status monitor

2. **Day 2: Data Caching & Sync Engine**
   - Cache customers, products, tax rates on login
   - Implement sync queue mechanism
   - Create conflict resolution logic

3. **Day 3: Offline Invoice Creation**
   - Replicate invoice calculation logic locally
   - Implement pre-allocated invoice numbers
   - Add offline status indicators to UI

### Phase 2: Error Handling (Day 4)
1. Add toast to all try-catch blocks in InvoiceFlow.js
2. Add toast to all try-catch blocks in SalesOrderFlow.js
3. Add offline-specific error messages
4. Test error scenarios both online and offline

### Phase 3: Component Extraction (Day 5)
1. Move BillSummary to global
2. Move PaymentDetails to global
3. Move TransportDetails to global
4. Update all imports

### Phase 4: Modal Consolidation (Day 6)
1. Create unified ImportDocumentModal in global
2. Update InvoiceFlow to use new modal
3. Update SalesOrderFlow to use new modal
4. Remove old modal files

### Phase 5: File Cleanup (Day 7)
1. Remove InvoiceSuccessModal.js
2. Archive InvoiceContainer.js + InvoiceSidebar.js (if unused)
3. Archive UnifiedSalesHistory.js (if unused)
4. Rename InvoiceListV2.tsx

### Phase 6: Refactor Large Files (Day 8)
1. Break down InvoiceFlow.js into smaller components
2. Break down SalesOrderFlow.js into smaller components
3. Ensure offline support in refactored components

## 7. Testing Checklist

### Standard Tests (After each phase):
- [ ] Create new invoice
- [ ] Edit existing invoice
- [ ] Import from order/challan
- [ ] All payment methods work
- [ ] Error messages display correctly
- [ ] Search functionality works
- [ ] Print/PDF generation works
- [ ] All calculations are correct

### Offline-Specific Tests:
- [ ] **Offline Creation**: Create invoice while offline
- [ ] **Number Allocation**: Pre-allocated invoice numbers work
- [ ] **Local Calculations**: GST and totals calculate correctly offline
- [ ] **Queue Display**: Pending items show in UI
- [ ] **Auto Sync**: Items sync when connection returns
- [ ] **Conflict Resolution**: Duplicate invoice numbers handled
- [ ] **Status Indicators**: Online/offline status clearly visible
- [ ] **Error Messages**: Appropriate messages for offline scenarios
- [ ] **Data Persistence**: Offline data survives app restart
- [ ] **Partial Sync**: Handle partial sync failures gracefully

### Network Simulation Tests:
- [ ] **Slow Connection**: Test with throttled network (3G)
- [ ] **Intermittent Connection**: Test with network dropping
- [ ] **Airplane Mode**: Full offline functionality
- [ ] **Background Sync**: Test sync while app in background

## 8. Expected Benefits

### Code Quality
- **Reduced duplication**: ~400 lines saved by consolidating modals
- **Better organization**: Components in logical locations
- **Improved maintainability**: Smaller, focused files

### User Experience
- **Better error feedback**: Clear toast messages instead of silent failures
- **Consistent UI**: Reusable global components
- **Faster development**: Global components available to all modules
- **Offline Support**: Work seamlessly without internet
- **No Data Loss**: All changes saved and synced automatically
- **Rural India Ready**: Perfect for areas with poor connectivity

### Performance
- **Smaller bundle**: Less duplicate code
- **Better code splitting**: Smaller component files
- **Improved caching**: Shared global components
- **Offline Speed**: Instant response, no network latency
- **Background Sync**: Non-blocking data synchronization
- **Reduced Server Load**: Batch sync reduces API calls

## 9. Risk Mitigation

1. **Create feature branch**: `feature/sales-module-cleanup`
2. **Test after each step**: Don't batch changes
3. **Keep backup**: Tag current state before starting
4. **Gradual rollout**: Test in development first

## 10. Success Metrics

### Code Quality Metrics:
- [ ] All tests pass
- [ ] No console errors in production
- [ ] Toast messages appear for all error scenarios
- [ ] File count reduced by 3-4 files
- [ ] Average file size < 500 lines
- [ ] Global components reused in at least 2 modules

### Offline Support Metrics:
- [ ] 100% functionality available offline
- [ ] < 3 second sync time for average invoice
- [ ] Zero data loss in offline scenarios
- [ ] Conflict resolution success rate > 95%
- [ ] User satisfaction in low-connectivity areas
- [ ] Support for 1000+ offline transactions before sync

## 11. Additional Resources Needed

### Backend Requirements:
1. **Invoice Number Pre-allocation API**: `/api/allocate-invoice-numbers`
2. **Batch Sync Endpoint**: `/api/sync/batch`
3. **Conflict Resolution API**: `/api/resolve-conflicts`
4. **Offline Data Bundle**: `/api/offline/initial-data`

### Libraries to Add:
```json
{
  "workbox-webpack-plugin": "^7.0.0",  // Service worker management
  "idb": "^7.1.1",                      // IndexedDB wrapper
  "uuid": "^9.0.0",                     // Temporary ID generation
  "date-fns": "^2.30.0"                 // Date handling for offline
}
```

### Infrastructure:
- CDN for static assets (better caching)
- Background job processor for sync queue
- WebSocket for real-time sync status (optional)