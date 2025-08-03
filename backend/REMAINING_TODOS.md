# 📋 REMAINING TODOs FOR POST-MVP FIXES

This file documents all remaining issues that need to be fixed after MVP launch.
Use this as a systematic checklist for post-MVP improvements.

## 🚨 HIGH PRIORITY (Core Functionality)

### 1. Product List Endpoint HTTP 500 Error
**Location**: `/backend/app/api/routes/products_consolidated.py:36-110`
**Issue**: GET /products/ endpoint returns 500 Internal Server Error
**Root Cause**: Likely SQL query issue in the new endpoint we added
**Impact**: Frontend can't load product lists, search doesn't work
**Fix Required**: Debug SQL query, check column names and data types

```python
# TODO: Fix HTTP 500 error in product list endpoint
# Error occurs in: @router.get("/", response_model=List[Product])
# Check SQL query syntax and column references
```

### 2. Customer Endpoint Missing 
**Location**: Customer module endpoints
**Issue**: Workflow test fails at "Get Customer" step with "Exception: 0"
**Root Cause**: Customer endpoint may not exist or returns empty list
**Impact**: Cannot create invoices without customers
**Fix Required**: Ensure customer CRUD endpoints exist and work

```python
# TODO: Verify customer endpoints exist and return valid data
# Error: workflow fails at step4_get_customer with "Exception: 0"
```

### 3. Product Update Logic Issue
**Location**: `/backend/app/api/routes/products_consolidated.py` update endpoint
**Issue**: Product update API succeeds but fields not actually updated
**Root Cause**: Update logic doesn't properly save changes to database
**Impact**: Product information cannot be modified after creation
**Fix Required**: Debug update SQL query and transaction handling

```python
# TODO: Fix product update logic - API returns 200 but fields don't update
# Test shows: "Product updated but manufacturer not changed"
```

## 🔧 MEDIUM PRIORITY (User Experience)

### 4. Frontend Modal Close Issue
**Location**: `/frontend/src/components/Products.tsx:217-218`
**Issue**: Product creation modal might not close on API errors
**Root Cause**: Modal close only happens in success block, not error handling
**Impact**: Poor UX when API calls fail
**Fix Required**: Ensure modal closes even on errors, with proper error display

```typescript
// TODO: Ensure modal closes on both success and error cases
// Currently only closes in try block, not catch block
```

### 5. Batch Selection Frontend
**Location**: `/frontend/src/components/global/modals/BatchSelector.js`
**Issue**: May still show fallback batch data in some edge cases
**Root Cause**: Frontend caching or error handling still using fallback
**Impact**: Users might see incorrect batch information
**Fix Required**: Remove all fallback batch logic, ensure real data only

```javascript
// TODO: Remove all fallback batch logic, ensure only real batch data shows
// Verify createDefaultBatch() is never called in production
```

## 🎨 LOW PRIORITY (Nice to Have)

### 6. Search Performance Optimization
**Location**: All search endpoints
**Issue**: Search queries may be slow for large datasets
**Root Cause**: No database indexing on search columns
**Impact**: Slow search response times
**Fix Required**: Add database indexes on commonly searched columns

```sql
-- TODO: Add database indexes for search performance
-- CREATE INDEX idx_products_search ON inventory.products USING gin(to_tsvector('english', product_name || ' ' || generic_name));
```

### 7. API Response Standardization
**Location**: All API endpoints
**Issue**: Inconsistent response formats across endpoints
**Root Cause**: Some endpoints return arrays, others return objects with arrays
**Impact**: Frontend needs different handling for different endpoints
**Fix Required**: Standardize all API responses to consistent format

```python
# TODO: Standardize API response format across all endpoints
# Decide on: direct arrays vs {data: array, total: number, page: number}
```

### 8. Error Message Improvement
**Location**: All API endpoints
**Issue**: Generic error messages don't help users understand issues
**Root Cause**: Exception handling returns technical details
**Impact**: Poor user experience on errors
**Fix Required**: Create user-friendly error messages

```python
# TODO: Replace technical error messages with user-friendly ones
# Instead of "SQL error", show "Unable to save product. Please try again."
```

## 🔒 SECURITY IMPROVEMENTS

### 9. Input Validation
**Location**: All API endpoints
**Issue**: Limited input validation on API endpoints
**Root Cause**: Relying mainly on database constraints
**Impact**: Potential security vulnerabilities
**Fix Required**: Add comprehensive input validation

```python
# TODO: Add input validation for all API endpoints
# Validate: email formats, phone numbers, required fields, data types
```

### 10. Authentication & Authorization
**Location**: All API endpoints
**Issue**: No authentication system implemented
**Root Cause**: MVP focused on core functionality first
**Impact**: Anyone can access all data
**Fix Required**: Implement JWT-based authentication

```python
# TODO: Implement authentication system
# Add: user login, JWT tokens, role-based access control
```

## 📊 MONITORING & LOGGING

### 11. API Logging
**Location**: All API endpoints
**Issue**: Limited logging for debugging production issues
**Root Cause**: Minimal logging implemented
**Impact**: Hard to debug production issues
**Fix Required**: Add comprehensive API request/response logging

```python
# TODO: Add comprehensive API logging
# Log: request details, response times, errors, user actions
```

### 12. Database Performance Monitoring
**Location**: Database queries
**Issue**: No monitoring of slow queries
**Root Cause**: No query performance tracking
**Impact**: Can't identify performance bottlenecks
**Fix Required**: Add query performance monitoring

```sql
-- TODO: Add query performance monitoring
-- Track: slow queries, connection usage, index effectiveness
```

---

## 📝 HOW TO USE THIS FILE

1. **During MVP Development**: Add new TODOs here instead of fixing immediately
2. **Post-MVP Planning**: Use this as sprint planning backlog
3. **Priority Review**: Update priorities based on user feedback
4. **Fix Tracking**: Move completed items to "COMPLETED" section

## ✅ COMPLETED TODOS

### ✅ Batch Creation Fixed
- **Was**: Products created without real batches, showing fallback data
- **Fixed**: Removed problematic database triggers, batch creation now works
- **Result**: Real batches like "BATCH167655" created automatically

### ✅ Product Creation Fixed  
- **Was**: Product creation API failing
- **Fixed**: Added missing source_type field, enabled proper triggers
- **Result**: Products create successfully with proper data

### ✅ Database Schema Issues Fixed
- **Was**: Missing tables, columns, and trigger issues
- **Fixed**: Created CONSOLIDATED_DATABASE_FIXES.sql with all fixes
- **Result**: Database schema supports all core operations

---

*Last Updated: 2025-08-03*
*Next Review: After MVP Launch*