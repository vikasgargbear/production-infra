# Test Directory Structure

## Quick Start
```bash
# Run all end-to-end tests
./run_e2e_tests.sh

# Run specific e2e test
cd e2e && node test_e2e_customer_challan.js
```

## Test Categories

## `/e2e/` ⭐ **NEW**
End-to-end business workflow tests:
- `test_e2e_customer_challan.js` - Customer creation & challan flow testing
- Tests complete frontend-to-backend-to-database workflows
- Validates Indian pharma business flows (direct challan creation)
- Comprehensive schema compliance and data storage verification

## `/database-fixes/`
Database fix and validation tests:
- `test_comprehensive_fix.py` - Comprehensive database fix testing
- `test_final_summary.py` - Final summary of all fixes applied
- `test_main_invoice_api.py` - Tests for main invoice API

## `/invoice-tests/`
Invoice creation and workflow tests:
- `test_simple_invoice.py` - Simple invoice creation test
- `test_basim_invoice.py` - Test with Basim customer data
- `test_complete_invoice_flow.py` - Complete invoice workflow test
- `test_order_creation.py` - Order creation testing

## `/workflows/`
End-to-end workflow tests:
- `test_invoice_complete_workflow.py` - Complete invoice workflow

## `/modules/`
Module-specific tests:
- `test_inventory_deduction.py` - Inventory deduction logic

## Running Tests

### Database Fixes
```bash
cd tests/database-fixes
python3 test_final_summary.py  # Check current status
```

### Invoice Tests
```bash
cd tests/invoice-tests
python3 test_simple_invoice.py  # Test basic invoice creation
```