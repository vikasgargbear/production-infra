# Test Directory Structure

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