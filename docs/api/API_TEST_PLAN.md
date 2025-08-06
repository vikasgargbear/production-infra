# 📋 Pharma ERP - API Test Plan

## 🎯 Testing Strategy

### Phase 1: Schema Validation (Current)
1. Verify all column names match database schema
2. Fix any mismatches (like gst_number vs branch_gst_number)
3. Ensure data types are correct (UUID vs Integer)

### Phase 2: Individual API Testing
Test each API endpoint in isolation with:
- Valid data (happy path)
- Invalid data (validation testing)
- Edge cases (nulls, empty arrays, etc.)
- Performance (response times)

### Phase 3: Integration Testing
Test complete workflows:
- Order → Invoice → Payment
- Purchase → GRN → Stock Update
- Customer → Credit Limit → Order Blocking

### Phase 4: Load Testing
- Concurrent users
- Large data volumes
- Stress testing

---

## 🔍 Current Issues Found

### 1. GST Trigger Column Mismatch
**Issue**: `b.gst_number` doesn't exist, should be `b.branch_gst_number`
**Status**: Fixed in `FIX_GST_TRIGGER_BRANCH_GST.sql`
**Action**: Deploy to production

### 2. Schema Mismatches to Check
- [ ] payment_mode vs payment_terms
- [ ] delivery_type vs delivery_priority  
- [ ] gst_percent vs gst_percentage
- [ ] phone vs primary_phone
- [ ] gstin vs gst_number

---

## 📝 Test Modules Plan

### Module 1: Invoice API ✅
**File**: `test_01_invoice_api.py`
**Status**: Created, needs trigger fix deployed
**Tests**:
- Create invoice with minimal data
- Verify trigger calculations
- Test GST scenarios
- Validate error handling

### Module 2: Product API 🔄
**File**: `test_02_products_api.py`
**Tests**:
- Product search
- Batch retrieval
- Stock availability
- GST percentage validation

### Module 3: Customer API 📋
**File**: `test_03_customers_api.py`
**Tests**:
- Customer search
- Credit limit checks
- Outstanding calculation
- GST number validation

### Module 4: Order API 📋
**File**: `test_04_orders_api.py`
**Tests**:
- Order creation
- Order to invoice conversion
- Status updates
- Fulfillment tracking

### Module 5: Inventory API 📋
**File**: `test_05_inventory_api.py`
**Tests**:
- Stock movements
- Batch allocation
- Expiry tracking
- Multi-location stock

### Module 6: Purchase API 📋
**File**: `test_06_purchase_api.py`
**Tests**:
- Purchase order creation
- GRN processing
- Supplier invoice matching
- Return processing

### Module 7: Financial API 📋
**File**: `test_07_financial_api.py`
**Tests**:
- Payment recording
- Ledger updates
- Outstanding aging
- Bank reconciliation

### Module 8: Delivery API 📋
**File**: `test_08_delivery_api.py`
**Tests**:
- Challan creation
- E-way bill generation
- Delivery tracking
- POD recording

---

## 🛠️ Common Fixes Required

### 1. Column Name Standardization
```sql
-- Check all foreign key references
SELECT 
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';
```

### 2. Trigger Dependencies
```sql
-- List all triggers
SELECT 
    trigger_name,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY event_object_table;
```

### 3. Missing Indexes
```sql
-- Find tables without primary keys
SELECT 
    schemaname,
    tablename
FROM pg_tables t
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes i
    WHERE i.schemaname = t.schemaname
    AND i.tablename = t.tablename
    AND i.indexname LIKE '%_pkey'
);
```

---

## 🚀 Deployment Process

### Step 1: Fix Schema Issues
```bash
# Deploy GST trigger fix
psql $DATABASE_URL -f database/FIX_GST_TRIGGER_BRANCH_GST.sql

# Deploy master fixes
psql $DATABASE_URL -f database/MASTER_DATABASE_FIXES.sql
```

### Step 2: Run Tests
```bash
# Test individual module
python backend/tests/test_01_invoice_api.py

# Run all tests
python backend/tests/test_runner.py production
```

### Step 3: Monitor Results
- Check API response times
- Monitor error logs
- Track success rates
- Identify patterns

---

## 📊 Success Metrics

### API Health
- ✅ All endpoints return 200/201 for valid requests
- ✅ Proper error codes (400/422) for invalid data
- ✅ Response time < 500ms for single record
- ✅ Response time < 2s for list queries

### Data Integrity
- ✅ Triggers fire correctly
- ✅ Foreign keys maintained
- ✅ No orphaned records
- ✅ Calculations accurate

### Business Logic
- ✅ GST calculations correct
- ✅ Inventory updates accurate
- ✅ Credit limits enforced
- ✅ Compliance rules followed

---

## 📅 Timeline

### Week 1 (Current)
- Fix schema issues
- Complete Invoice API testing
- Start Product API testing

### Week 2
- Complete core modules (Product, Customer, Order)
- Fix any issues found
- Start financial modules

### Week 3
- Complete all API tests
- Integration testing
- Performance optimization

### Week 4
- Load testing
- Documentation updates
- Production deployment

---

## 🔗 Resources

### Documentation
- [API Documentation](./COMPREHENSIVE_API_DOCUMENTATION.md)
- [Schema Documentation](/database/schema-docs/)
- [Trigger Documentation](/database/04-triggers/)

### Test Files
- [Test Runner](../../backend/tests/test_runner.py)
- [Invoice Tests](../../backend/tests/test_01_invoice_api.py)

### Fixes
- [Master Fixes](/database/MASTER_DATABASE_FIXES.sql)
- [GST Trigger Fix](/database/FIX_GST_TRIGGER_BRANCH_GST.sql)

---

**Status**: 🟡 In Progress
**Next Action**: Deploy GST trigger fix and re-run invoice tests