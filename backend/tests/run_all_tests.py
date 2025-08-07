#!/usr/bin/env python3
"""
Test Runner - Execute All Module and Workflow Tests
Provides comprehensive testing of the pharmacy ERP system
"""
import sys
import os
import subprocess
import time
from datetime import datetime

# Add the tests directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def run_test_file(test_file_path, test_name):
    """Run a single test file and return results"""
    print(f"\n{'='*60}")
    print(f"🧪 RUNNING: {test_name}")
    print(f"📁 File: {test_file_path}")
    print(f"{'='*60}")
    
    start_time = time.time()
    
    try:
        result = subprocess.run([sys.executable, test_file_path], 
                              capture_output=True, text=True, timeout=300)
        
        end_time = time.time()
        duration = end_time - start_time
        
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        
        success = result.returncode == 0
        status = "✅ PASSED" if success else "❌ FAILED"
        
        print(f"\n{status} {test_name} (Duration: {duration:.2f}s)")
        
        return {
            "name": test_name,
            "file": test_file_path,
            "passed": success,
            "duration": duration,
            "output": result.stdout,
            "error": result.stderr
        }
        
    except subprocess.TimeoutExpired:
        print(f"❌ TIMEOUT: {test_name} exceeded 5 minute limit")
        return {
            "name": test_name,
            "file": test_file_path,
            "passed": False,
            "duration": 300,
            "output": "",
            "error": "Test timed out after 5 minutes"
        }
    except Exception as e:
        print(f"❌ ERROR: Failed to run {test_name}: {e}")
        return {
            "name": test_name,
            "file": test_file_path,
            "passed": False,
            "duration": 0,
            "output": "",
            "error": str(e)
        }

def main():
    """Run all tests in the test suite"""
    print("🚀 PHARMACY ERP COMPREHENSIVE TEST SUITE")
    print("="*80)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    # Define all tests to run in priority order
    test_suite = [
        # Already Tested Core APIs (12 APIs completed)
        {"file": "test_01_invoice_api.py", "name": "Invoice API Tests"},
        {"file": "test_02_products_api.py", "name": "Products API Tests"},
        {"file": "test_03_customers_api.py", "name": "Customers API Tests"},
        {"file": "test_04_orders_api.py", "name": "Orders API Tests"},
        {"file": "test_05_inventory_api.py", "name": "Inventory API Tests"},
        {"file": "test_06_purchase_api.py", "name": "Purchase API Tests"},
        {"file": "test_07_financial_api.py", "name": "Financial API Tests"},
        {"file": "test_08_delivery_api.py", "name": "Delivery API Tests"},
        {"file": "test_09_compliance_api.py", "name": "Compliance API Tests (New)"},
        {"file": "test_10_prescription_api.py", "name": "Prescription API Tests"},
        {"file": "test_11_batch_recall_api.py", "name": "Batch Recall API Tests"},
        {"file": "test_12_cold_chain_api.py", "name": "Cold Chain API Tests"},
        
        # HIGH PRIORITY - Stock Management (Core Operations)
        {"file": "test_13_stock_movements_api.py", "name": "Stock Movements API Tests"},
        {"file": "test_14_stock_adjustments_api.py", "name": "Stock Adjustments API Tests"},
        {"file": "test_15_stock_receive_api.py", "name": "Stock Receive API Tests"},
        
        # HIGH PRIORITY - Returns Management
        {"file": "test_16_sales_returns_api.py", "name": "Sales Returns API Tests"},
        {"file": "test_17_purchase_returns_api.py", "name": "Purchase Returns API Tests"},
        
        # HIGH PRIORITY - Financial Operations
        {"file": "test_18_party_ledger_api.py", "name": "Party Ledger API Tests"},
        {"file": "test_19_credit_debit_notes_api.py", "name": "Credit/Debit Notes API Tests"},
        {"file": "test_20_tax_entries_api.py", "name": "Tax Entries API Tests"},
        
        # MEDIUM PRIORITY - Collection Center
        {"file": "test_21_collection_center_api.py", "name": "Collection Center API Tests"},
        {"file": "test_22_collection_center_simple_api.py", "name": "Collection Center Simple API Tests"},
        
        # MEDIUM PRIORITY - Analytics & Reporting
        {"file": "test_23_dashboard_api.py", "name": "Dashboard API Tests"},
        {"file": "test_24_pharma_invoice_parser_api.py", "name": "Pharma Invoice Parser API Tests"},
        
        # LOW PRIORITY - User Management
        {"file": "test_25_users_api.py", "name": "Users API Tests"},
        {"file": "test_26_org_users_api.py", "name": "Organization Users API Tests"},
        {"file": "test_27_auth_api.py", "name": "Authentication API Tests"},
        
        # SPECIALIZED - Additional APIs
        {"file": "test_28_inventory_batches_api.py", "name": "Inventory Batches API Tests"},
        {"file": "test_29_stock_writeoff_api.py", "name": "Stock Write-off API Tests"},
        {"file": "test_30_purchase_enhanced_api.py", "name": "Purchase Enhanced API Tests"},
        {"file": "test_31_purchase_upload_api.py", "name": "Purchase Upload API Tests"},
        {"file": "test_32_enterprise_orders_api.py", "name": "Enterprise Orders API Tests"},
        {"file": "test_33_enterprise_delivery_api.py", "name": "Enterprise Delivery API Tests"},
        {"file": "test_34_challan_to_invoice_api.py", "name": "Challan to Invoice API Tests"},
        {"file": "test_35_direct_invoice_api.py", "name": "Direct Invoice API Tests"},
        {"file": "test_36_smart_invoice_api.py", "name": "Smart Invoice API Tests"},
        {"file": "test_37_quick_sale_api.py", "name": "Quick Sale API Tests"},
        {"file": "test_38_order_items_api.py", "name": "Order Items API Tests"},
        {"file": "test_39_sales_api.py", "name": "Sales API Tests"},
        {"file": "test_40_sales_orders_api.py", "name": "Sales Orders API Tests"},
        {"file": "test_41_billing_api.py", "name": "Billing API Tests"},
        {"file": "test_42_suppliers_api.py", "name": "Suppliers API Tests"},
        {"file": "test_43_organization_settings_api.py", "name": "Organization Settings API Tests"},
        
        # Original Module Tests (Keep for regression)
        {"file": "tests/modules/test_products.py", "name": "Product Module Tests"},
        {"file": "tests/modules/test_batches.py", "name": "Batch Module Tests"},
        {"file": "tests/modules/test_customers.py", "name": "Customer Module Tests"},
        {"file": "tests/modules/test_suppliers.py", "name": "Supplier Module Tests"},
        {"file": "tests/modules/test_invoices.py", "name": "Invoice Module Tests"},
        {"file": "tests/api/test_search_functionality.py", "name": "Search Functionality Tests"},
        {"file": "tests/workflows/test_product_to_invoice_workflow.py", "name": "Product to Invoice Workflow Test"}
    ]
    
    # Run all tests
    test_results = []
    total_start_time = time.time()
    
    for test_config in test_suite:
        test_file = test_config["file"]
        test_name = test_config["name"]
        
        # Check if test file exists
        if not os.path.exists(test_file):
            print(f"❌ SKIPPED: {test_name} - File not found: {test_file}")
            test_results.append({
                "name": test_name,
                "file": test_file,
                "passed": False,
                "duration": 0,
                "output": "",
                "error": "Test file not found"
            })
            continue
        
        result = run_test_file(test_file, test_name)
        test_results.append(result)
        
        # Short pause between tests
        time.sleep(2)
    
    total_end_time = time.time()
    total_duration = total_end_time - total_start_time
    
    # Generate Summary Report
    print(f"\n{'='*80}")
    print("📊 TEST SUITE SUMMARY REPORT")
    print(f"{'='*80}")
    
    passed_tests = [r for r in test_results if r['passed']]
    failed_tests = [r for r in test_results if not r['passed']]
    
    print(f"Total Tests: {len(test_results)}")
    print(f"Passed: {len(passed_tests)}")
    print(f"Failed: {len(failed_tests)}")
    print(f"Success Rate: {len(passed_tests)/len(test_results)*100:.1f}%")
    print(f"Total Duration: {total_duration:.2f} seconds")
    print()
    
    # Detailed Results
    for result in test_results:
        status = "✅ PASS" if result['passed'] else "❌ FAIL"
        print(f"{status} {result['name']} ({result['duration']:.2f}s)")
        if not result['passed'] and result['error']:
            print(f"    Error: {result['error']}")
    
    # Critical Issues
    if failed_tests:
        print(f"\n🚨 CRITICAL ISSUES FOUND:")
        for failed in failed_tests:
            print(f"  - {failed['name']}: {failed['error']}")
    
    # Overall Status
    print(f"\n{'='*80}")
    if len(passed_tests) == len(test_results):
        print("🎉 ALL TESTS PASSED - SYSTEM IS FULLY FUNCTIONAL!")
        print("✅ Product creation works")
        print("✅ Batch creation works") 
        print("✅ Invoice creation works")
        print("✅ End-to-end workflows work")
        exit_code = 0
    else:
        print("❌ SOME TESTS FAILED - SYSTEM HAS ISSUES")
        print("🔧 Review failed tests above and fix issues")
        exit_code = 1
    
    print(f"{'='*80}")
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Save detailed report
    try:
        report_file = f"test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        import json
        with open(report_file, 'w') as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "total_tests": len(test_results),
                "passed_tests": len(passed_tests),
                "failed_tests": len(failed_tests),
                "success_rate": len(passed_tests)/len(test_results)*100,
                "total_duration": total_duration,
                "results": test_results
            }, f, indent=2)
        print(f"📄 Detailed report saved: {report_file}")
    except Exception as e:
        print(f"⚠️ Could not save detailed report: {e}")
    
    return exit_code

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)