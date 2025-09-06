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
# Backend tests
cd backend && pytest

# Frontend tests  
cd frontend && npm test

# Integration tests
python tests/integration_test.py
```

## Workflow
1. Developer requests test run
2. Execute test suite
3. Document failures with context
4. Generate reports
5. Developer fixes issues
6. Re-test until passing