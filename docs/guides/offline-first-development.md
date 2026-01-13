# Offline-First Development Guide

> **Learnings from production debugging sessions** - patterns and pitfalls to avoid.

## Table of Contents
1. [Backend API Conventions](#backend-api-conventions)
2. [Frontend API Client](#frontend-api-client)
3. [Offline-First Data Flow](#offline-first-data-flow)
4. [Sync Engine Integration](#sync-engine-integration)
5. [Common Pitfalls](#common-pitfalls)
6. [Checklist for New Features](#checklist-for-new-features)

---

## Backend API Conventions

### Trailing Slashes
The frontend apiClient **adds trailing slashes** to all POST/PUT/PATCH/DELETE requests.

```python
# ❌ WRONG - will cause 404
@router.post("/{customer_id}/addresses")

# ✅ CORRECT - matches frontend trailing slash
@router.post("/{customer_id}/addresses/")
```

### Field Naming Consistency
Use **exact database column names** throughout the stack. No aliases.

```python
# ❌ WRONG - creates confusion
return {"state": row["state_name"]}  # Different names!

# ✅ CORRECT - same name everywhere
return {"state_name": row["state_name"]}
```

### Validation Before Database
Always validate input before hitting the database. Return 400, not 500.

```python
# ✅ CORRECT - catch bad input early
pincode = str(data.get('pincode', '')).strip()
if pincode and (not pincode.isdigit() or len(pincode) != 6):
    raise HTTPException(
        status_code=400,
        detail="Indian pincodes must be exactly 6 digits"
    )
```

### Response Model Flexibility
For endpoints with dynamic data, avoid strict `response_model` if it causes 500 errors.

```python
# ❌ May cause 500 if data doesn't exactly match schema
@router.get("/{id}", response_model=CustomerResponse)

# ✅ More flexible - still returns proper JSON
@router.get("/{id}")
async def get_customer(...) -> dict:
```

---

## Frontend API Client

### Automatic Trailing Slashes
The apiClient in `apiClient.ts` adds trailing slashes to POST/PUT/PATCH/DELETE.

```typescript
// See: frontend/src/services/api/apiClient.ts lines 74-91
post: (url, data) => {
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.post(urlWithSlash, data);
}
```

**Impact:** Backend routes MUST have trailing slashes for these methods.

### API Module Pattern
Always add new endpoints to the centralized API modules:

```typescript
// frontend/src/services/api/modules/master/customers.api.ts
export const customersApi = {
    // Add new methods here
    createAddress: (customerId: string, data: any) => {
        return apiHelpers.post(`/customers/${customerId}/addresses`, data);
    }
};
```

---

## Offline-First Data Flow

### Creating Data Offline

```
User Action
    ↓
1. Save to IndexedDB (immediate feedback)
    ↓
2. Add to Sync Queue (entity_type, entity_id, action, data)
    ↓
3. Try API call (non-blocking)
    ↓
4. Success? Mark as synced : Leave pending for retry
```

### Editing Pending Data
When editing data that hasn't synced yet:

```typescript
// ✅ CORRECT - Update IndexedDB record, not just React state
if (isLocalPending) {
    const db = await offlineDB.init();
    const existing = await db.get('store', id);
    await db.put('store', { ...existing, ...newData });
    // Sync queue will send updated data when it syncs
}
```

### Key IndexedDB Methods

| Method | Purpose |
|--------|---------|
| `offlineDB.saveCustomerAddress()` | Save address + add to sync queue |
| `offlineDB.getCustomerAddresses()` | Merge synced + pending addresses |
| `offlineDB.markAddressSynced()` | Update temp ID → real ID after sync |

---

## Sync Engine Integration

### Adding New Entity Types
To sync a new entity type, add to `syncEngine.ts`:

```typescript
// 1. Add interface
interface MyEntityData {
    entity_id?: string;
    // ... fields
}

// 2. Add case in syncItem switch
case 'my_entity':
    response = await this.syncMyEntity(item.data);
    break;

// 3. Add sync method
async syncMyEntity(data: MyEntityData): Promise<AxiosResponse> {
    return await myApi.create(data);
}
```

### Sync Queue Entry Format
When adding to sync queue:

```typescript
await offlineDB.syncQueue.addToSyncQueue(
    'customer_address',  // entity_type - must match syncItem switch
    tempId,              // entity_id
    'create',            // action
    addressData          // full data to send
);
```

---

## Common Pitfalls

### 1. Trailing Slash Mismatch
**Symptom:** 404 on POST/PUT  
**Cause:** Backend route missing trailing slash  
**Fix:** Add `/` to backend route decorator

### 2. Field Name Inconsistency
**Symptom:** Data doesn't display after save  
**Cause:** API returns `state_name`, frontend expects `state`  
**Fix:** Use same field names as database everywhere

### 3. Unknown Sync Type
**Symptom:** "Unknown sync type: xxx" error, items fail to sync  
**Cause:** Entity type not in syncItem switch  
**Fix:** Add case to switch + implement sync method

### 4. Editing Pending Data Doesn't Persist
**Symptom:** Edits lost after refresh  
**Cause:** Only updating React state, not IndexedDB  
**Fix:** Update IndexedDB record for pending items

### 5. Local ID Sent to PUT
**Symptom:** 422 error with `temp_xxx` ID  
**Cause:** Trying to PUT a locally-created item  
**Fix:** Check for `temp_` prefix, skip API call for pending items

### 6. 500 from Pydantic Validation
**Symptom:** GET returns 500  
**Cause:** Response data doesn't match strict response_model  
**Fix:** Remove response_model or fix data types

---

## Checklist for New Features

### Backend Endpoint
- [ ] Route has trailing slash for POST/PUT/PATCH/DELETE
- [ ] Field names match database columns exactly
- [ ] Input validation returns 400, not 500
- [ ] Error messages are user-friendly
- [ ] Tested with api test file

### Frontend API
- [ ] Method added to appropriate API module
- [ ] Uses `apiHelpers.post/put/etc` (auto trailing slash)
- [ ] Uses `cleanData()` for request payload

### Offline Support
- [ ] Data saved to IndexedDB first (immediate feedback)
- [ ] Added to sync queue with correct entity_type
- [ ] Entity type added to syncEngine.ts switch
- [ ] Sync method implemented
- [ ] Editing pending items updates IndexedDB
- [ ] Temp IDs handled (skip PUT for local items)

### UI
- [ ] Loading states while syncing
- [ ] Fallback data when offline
- [ ] Sync status indicator
- [ ] Form state matches IndexedDB on edit

---

## Quick Reference

### File Locations

| Purpose | Path |
|---------|------|
| API Client | `frontend/src/services/api/apiClient.ts` |
| Customers API | `frontend/src/services/api/modules/master/customers.api.ts` |
| Sync Engine | `frontend/src/services/offline/sync/syncEngine.ts` |
| Offline DB | `frontend/src/services/offline/core/offlineDatabase.ts` |
| Customer Routes | `backend/app/api/routes/master/customers/routes.py` |

### Debug Commands

```bash
# Check sync queue in browser console
await offlineDB.getSyncQueue()

# Check pending addresses
await offlineDB.getCustomerAddresses(customerId)

# Force sync
syncEngine.forceSync()

# Clear failed syncs
syncEngine.clearSyncData()
```
