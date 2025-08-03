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
    
    # Define all tests to run
    test_suite = [
        # Core Module Tests
        {
            "file": "tests/modules/test_products.py",
            "name": "Product Module Tests"
        },
        {
            "file": "tests/modules/test_batches.py", 
            "name": "Batch Module Tests"
        },
        {
            "file": "tests/modules/test_customers.py",
            "name": "Customer Module Tests"
        },
        {
            "file": "tests/modules/test_suppliers.py",
            "name": "Supplier Module Tests"
        },
        {
            "file": "tests/modules/test_invoices.py",
            "name": "Invoice Module Tests"  
        },
        
        # API Functionality Tests
        {
            "file": "tests/api/test_search_functionality.py",
            "name": "Search Functionality Tests"
        },
        
        # Workflow Tests
        {
            "file": "tests/workflows/test_product_to_invoice_workflow.py",
            "name": "Product to Invoice Workflow Test"
        }
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