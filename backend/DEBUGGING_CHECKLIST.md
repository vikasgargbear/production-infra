# 🔧 DEBUGGING CHECKLIST FOR PHARMACY ERP MODULES

*Created: 2025-08-03 | A systematic guide for troubleshooting API endpoints and database issues*
For any schema issues or schema validation - all tables and schema and databases are here -  '/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/database/schema-docs'          
## 📋 QUICK DEBUGGING WORKFLOW

### 1. **Initial Problem Analysis**
- [ ] **Test the endpoint directly** with curl/Postman first
- [ ] **Check HTTP status code**: 404 vs 500 vs 400 tells different stories
- [ ] **Read the exact error message** - don't assume, read the full response
- [ ] **Identify the error type**: Frontend issue vs Backend API vs Database

### 2. **Common Error Patterns & Fixes**

#### 🚫 **HTTP 404 Not Found**
```bash
# Test: Does the endpoint exist?
curl -X GET "https://your-api.com/api/endpoint/"

# Common causes:
# ✓ Wrong URL path (/api/sales/invoices/ vs /api/invoices/)
# ✓ Missing trailing slash (/customers vs /customers/)
# ✓ Route not included in main.py
# ✓ Wrong HTTP method (POST vs GET)
```

#### 💥 **HTTP 500 Internal Server Error**
```bash
# Check logs first - they contain the real error
# Common database issues:
# ✓ Missing table: "relation X does not exist"
# ✓ Missing column: "column Y does not exist"  
# ✓ Data type mismatch: "cannot cast X to Y"
# ✓ Constraint violations: "violates foreign key constraint"
```

#### 🔄 **API Returns Empty/Wrong Data**
```bash
# Test the API response format:
curl -X GET "https://your-api.com/api/customers/?limit=1"

# Common issues:
# ✓ API returns {customers: []} but code expects []
# ✓ API returns [] but code expects {data: []}
# ✓ Wrong field names (customer_id vs customerId)
# ✓ Wrong data types (string vs number)
```

### 3. **Database Issues Debugging**

#### **Missing Tables/Columns Checklist**
```sql
-- Quick table existence check:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'your_schema' AND table_name = 'your_table';

-- Quick column existence check:
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'your_schema' AND table_name = 'your_table';
```

#### **Trigger Issues**
```sql
-- Find problematic triggers:
SELECT trigger_name, event_object_table, action_statement 
FROM information_schema.triggers 
WHERE trigger_schema = 'your_schema';

-- Disable problematic trigger temporarily:
ALTER TABLE your_table DISABLE TRIGGER trigger_name;
```

#### **Data Type Issues**
```sql
-- Check actual column types:
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'your_schema' AND table_name = 'your_table';
```

### 4. **Frontend-Backend Integration Issues**

#### **API Response Format Mismatches**
```javascript
// Frontend expects array:
customers.map(c => c.name)

// But API returns object:
{customers: [...], total: 10}

// Fix: Update frontend to handle correct format:
response.data.customers.map(c => c.name)
```

#### **Field Name Mismatches**
```javascript
// API returns: {customer_id: 123}
// Frontend uses: customerId

// Fix: Use backend field names consistently
customer.customer_id // ✓ Correct
customer.customerId  // ❌ Wrong
```

## 🔍 MODULE-SPECIFIC DEBUGGING GUIDES

### **Products Module**
1. **Creation Issues**:
   - Check if batch creation triggers are working
   - Verify `current_mrp` column exists in products table
   - Ensure `source_type` field is provided for batches

2. **Search Issues**:
   - Test GET `/products/` vs `/products/search` endpoints
   - Check if search query parameters are correctly formatted
   - Verify database indexes exist for search performance

3. **Update Issues**:
   - Confirm update endpoints are committing transactions
   - Check field mapping between frontend and backend
   - Verify foreign key constraints aren't blocking updates

### **Customer Module**  
1. **List/Search Issues**:
   - Check response format: `{customers: []}` vs `[]`
   - Verify trailing slash in endpoint URL
   - Test pagination parameters (limit, offset)

2. **Creation Issues**:
   - Validate required fields (name, phone, etc.)
   - Check GSTIN validation if applicable
   - Ensure organization ID is properly set

### **Invoice Module**
1. **Creation Issues**:
   - Verify all required tables exist (invoices, invoice_items, analytics.kpi_actuals)
   - Check if KPI calculation triggers are causing failures
   - Ensure customer_id and product_id exist and are valid
   - Verify tax calculations are working

2. **Data Retrieval Issues**:
   - Test invoice GET endpoint with valid invoice_id
   - Check if invoice_items are being created
   - Verify invoice number generation is working

### **Batch/Inventory Module**
1. **Batch Creation Issues**:
   - Ensure products have `maintain_batch: true`
   - Check if MRP triggers are blocking creation
   - Verify expiry date format (YYYY-MM-DD)

2. **Stock Issues**:
   - Check quantity_available calculations
   - Verify batch selection logic isn't using fallbacks
   - Ensure stock movements are recorded correctly

## 🚀 TESTING WORKFLOW FOR NEW MODULES

### **Step 1: Basic CRUD Testing**
```bash
# Test each operation in sequence:
# 1. CREATE
curl -X POST "/api/module/" -d '{"field": "value"}'

# 2. READ (single)
curl -X GET "/api/module/1"

# 3. READ (list)
curl -X GET "/api/module/?limit=10"

# 4. UPDATE  
curl -X PUT "/api/module/1" -d '{"field": "new_value"}'

# 5. DELETE (if applicable)
curl -X DELETE "/api/module/1"
```

### **Step 2: Integration Testing**
```bash
# Test cross-module workflows:
# 1. Create Product → Create Batch → Create Invoice
# 2. Create Customer → Create Invoice
# 3. Create Supplier → Create Purchase Order
```

### **Step 3: Error Scenario Testing**
```bash
# Test edge cases:
# 1. Invalid data (wrong types, missing fields)
# 2. Non-existent IDs (404 scenarios)
# 3. Duplicate data (constraint violations)
# 4. Large data sets (performance testing)
```

## 🛠️ QUICK FIXES FOR COMMON ISSUES

### **Database Schema Fixes**
```sql
-- Add missing column:
ALTER TABLE table_name ADD COLUMN column_name TYPE DEFAULT value;

-- Add missing table:
CREATE TABLE IF NOT EXISTS schema.table_name (...);

-- Fix trigger issues:
DROP TRIGGER IF EXISTS problematic_trigger ON table_name;
```

### **API Endpoint Fixes**
```python
# Fix response format consistency:
# Instead of returning raw list:
return customers

# Return standardized format:
return {"customers": customers, "total": len(customers)}
```

### **Frontend Integration Fixes**
```javascript
// Handle different response formats:
const data = response.data.customers || response.data || [];

// Use consistent field names:
const customerId = customer.customer_id; // Use backend field names
```

## 📊 DEBUGGING PRIORITY MATRIX

| Error Type | Impact | Fix Priority | Typical Time |
|------------|--------|--------------|--------------|
| HTTP 500 (Database) | High | 🔴 Critical | 15-30 min |
| HTTP 404 (Missing endpoint) | High | 🔴 Critical | 5-15 min |
| Wrong data format | Medium | 🟡 Important | 10-20 min |
| Performance issues | Low | 🟢 Nice to have | 30-60 min |

## 🔄 WORKFLOW FOR SYSTEMATIC DEBUGGING

1. **Document the Issue**
   - What exactly is not working?
   - What error messages appear?
   - When does it happen (always vs sometimes)?

2. **Isolate the Problem**
   - Frontend only? Backend only? Database?
   - Test API endpoints directly with curl
   - Check database tables/data directly

3. **Fix Root Cause**
   - Fix the underlying issue, not just symptoms
   - Update all related documentation
   - Add test cases to prevent regression

4. **Verify the Fix**
   - Test the specific broken functionality
   - Run end-to-end workflow tests
   - Check that other functionality still works

5. **Update Documentation**
   - Add the issue and fix to this checklist
   - Update API documentation if endpoints changed
   - Document any new database schema changes

---

## 📝 NOTES FOR FUTURE DEBUGGING

- **Always test endpoints with curl first** before debugging frontend issues
- **Database triggers can cause unexpected 500 errors** - check trigger logic
- **Response format mismatches** are very common - standardize early
- **Field name consistency** between frontend/backend saves hours of debugging
- **Error messages should be user-friendly** but logs should be technical
- **Test with realistic data**, not just dummy data
- **Document every database schema change** immediately

---

*Last Updated: 2025-08-03*  
*Next Review: After each major module addition*