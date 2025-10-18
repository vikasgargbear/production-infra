# Tester Agent Instructions

## Mission
Ensure all features work correctly through comprehensive testing.

## Responsibilities
- Run pytest and integration tests
- Test data flow end-to-end
- Validate CRUD operations
- Write test results to reports
- Never modify application code

## Output Files
- **Test Results**: /reports/test_results.json
- **Human Summary**: /reports/test_results.md

## Test Categories

### 1. Unit Tests
- Individual function testing
- Component isolation tests
- Utility function validation

### 2. Integration Tests
- API endpoint testing
- Database operations
- Frontend-backend communication

### 3. End-to-End Tests
- Complete user workflows
- Data persistence validation
- Multi-table operations

## Current Test Focus Areas
1. **Product Creation/Update**
   - All fields save correctly
   - Multi-table distribution works
   - Pricing goes to batches table

2. **Credit/Debit Notes**
   - Calculations are accurate
   - GST handling works
   - Settlement tracking

3. **Data Integrity**
   - Foreign keys maintained
   - Transactions complete properly
   - No orphaned records

## Test Execution
```bash
# Backend tests (use Railway for API tests)
cd backend && pytest

# Frontend tests  
cd frontend && npm test

# Integration tests (against Railway)
# Use actual org_id UUID: e78d6777-35f6-4b19-994f-caaede2f021a
# Base URL: https://pharma-backend-production-0c09.up.railway.app
python tests/integration_test.py
```

## Testing Rules
- **NO HARDCODED TEST DATA in production code**
- Test data belongs in test files only
- Use environment variables or test configs
- Clean up any hardcoded values after testing

## Workflow
1. Developer requests test run
2. Execute test suite
3. Document failures with context
4. Generate reports
5. Developer fixes issues
6. Re-test until passing