# End-to-End Testing Suite

This directory contains comprehensive end-to-end tests that validate complete business workflows from frontend components to backend database storage.

## Available Tests

### 1. Customer & Challan Flow Test (`test_e2e_customer_challan.js`)

**Purpose**: Tests the complete customer creation and challan creation flow supporting both Indian pharma workflows

**Test Coverage**:
- ✅ B2B Customer Creation (via API)
- ✅ Backend Data Storage Verification
- ✅ Direct Challan Creation (without order)
- ✅ Order-based Challan Creation (if orders exist)
- ✅ Schema Compliance Validation

**Business Flows Tested**:
1. **Traditional Flow**: Order → Challan → Invoice
2. **Indian Pharma Flow**: Direct Invoice → Challan (most common)
3. **Direct Challan Flow**: Standalone challan creation

**How to Run**:
```bash
cd /Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/tests/e2e
node test_e2e_customer_challan.js
```

**Expected Results**:
- Customer creation: ✅ PASSED
- Data storage: ✅ PASSED  
- Direct challan: ⚠️ Requires user management setup for `created_by` field

## Test Structure

Each e2e test follows this pattern:
1. **Setup**: Configure API endpoints and authentication
2. **Test Execution**: Run business workflow scenarios
3. **Verification**: Validate backend data storage
4. **Cleanup**: Report results and any issues

## Authentication

Tests use production API endpoints with JWT tokens. Ensure your token is valid before running tests.

## Database Impact

These tests create actual records in the production database. They use test data prefixed with "TEST-" for easy identification.

## Adding New E2E Tests

1. Create test file in this directory
2. Follow the existing pattern for structure
3. Include comprehensive verification steps
4. Document business workflows being tested
5. Update this README with new test information

## Production Validation

These tests validate:
- ✅ Frontend component integration
- ✅ Backend API functionality  
- ✅ Database schema compliance
- ✅ Business workflow completeness
- ✅ Error handling and validation