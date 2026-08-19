#!/usr/bin/env python3
"""
GST API Test - Tests GST Hub endpoints on Railway production
Run: API_BASE_URL="https://pharma-backend-production-0c09.up.railway.app" python backend/tests/api/test_gst_api.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
"""
import os
import sys
import requests
from typing import Optional, Any

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def finish_test(value, predicate=None):
    """Assert under pytest, preserve return values for script-mode runs."""
    ok = predicate(value) if predicate else bool(value)
    if os.getenv("PYTEST_CURRENT_TEST"):
        assert ok
        return None
    return value


class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")


def print_success(text: str):
    print(f"{Colors.GREEN}✓ {text}{Colors.RESET}")


def print_error(text: str):
    print(f"{Colors.RED}✗ {text}{Colors.RESET}")


def print_info(text: str):
    print(f"{Colors.CYAN}ℹ {text}{Colors.RESET}")


def make_request(method: str, endpoint: str, params: Optional[dict] = None) -> tuple[bool, Any]:
    url = f"{API_BASE_URL}/api{endpoint}"
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code in [200, 201]:
            try:
                return True, response.json()
            except:
                return True, response.text
        else:
            print_error(f"HTTP {response.status_code}: {response.text[:300]}")
            return False, response.text
            
    except requests.exceptions.ConnectionError:
        print_error(f"Connection failed to {url}")
        return False, None
    except Exception as e:
        print_error(f"Request error: {str(e)}")
        return False, None


def test_gst_dashboard() -> bool:
    """Test GET /gst/dashboard"""
    print_info("Testing GST dashboard endpoint...")
    
    success, data = make_request("GET", "/gst/dashboard", {"period": "current"})
    
    if success and data:
        print_success("GST Dashboard endpoint returned successfully")
        
        summary = data.get("summary", {})
        print(f"   GSTIN: {data.get('gstin', 'N/A')}")
        print(f"   Period: {data.get('period', 'N/A')}")
        print(f"   Output Tax: ₹{summary.get('total_output_tax', 0):,.2f}")
        print(f"   Input Tax: ₹{summary.get('total_input_tax', 0):,.2f}")
        print(f"   Net Payable: ₹{summary.get('net_payable', 0):,.2f}")
        
        return finish_test(True)
    else:
        print_error("GST Dashboard endpoint failed")
        return finish_test(False)


def test_gst_returns_status() -> bool:
    """Test GET /gst/returns-status"""
    print_info("Testing GST returns status endpoint...")
    
    success, data = make_request("GET", "/gst/returns/status", {"period": "current"})
    
    if success and data:
        print_success("GST Returns Status endpoint returned successfully")
        
        returns = data.get("returns", [])
        print(f"   Returns Count: {len(returns)}")
        
        for ret in returns[:3]:
            print(f"      - {ret.get('return_type')}: {ret.get('status')} (Due: {ret.get('due_date')})")
        
        return finish_test(True)
    else:
        print_error("GST Returns Status endpoint failed")
        return finish_test(False)


def test_gst_compliance() -> bool:
    """Test GET /gst/compliance-status"""
    print_info("Testing GST compliance status endpoint...")
    
    success, data = make_request("GET", "/gst/compliance/status")
    
    if success and data:
        print_success("GST Compliance Status endpoint returned successfully")
        
        print(f"   Status: {data.get('status')}")
        print(f"   Score: {data.get('compliance_score', 0)}%")
        print(f"   Pending Returns: {data.get('pending_returns', 0)}")
        
        return finish_test(True)
    else:
        print_error("GST Compliance Status endpoint failed")
        return finish_test(False)


def test_gst_metrics() -> bool:
    """Test GET /gst/metrics"""
    print_info("Testing GST metrics endpoint...")
    
    success, data = make_request("GET", "/gst/metrics", {"period": "current"})
    
    if success and data:
        print_success("GST Metrics endpoint returned successfully")
        
        print(f"   Total Sales: ₹{data.get('total_sales', 0):,.2f}")
        print(f"   Total Purchases: ₹{data.get('total_purchases', 0):,.2f}")
        print(f"   Output GST: ₹{data.get('output_gst', 0):,.2f}")
        print(f"   Input GST: ₹{data.get('input_gst', 0):,.2f}")
        
        return finish_test(True)
    else:
        print_error("GST Metrics endpoint failed")
        return finish_test(False)


def test_gst_settings() -> bool:
    """Test GET /gst/settings"""
    print_info("Testing GST settings endpoint...")
    
    success, data = make_request("GET", "/gst/settings")
    
    if success and data:
        print_success("GST Settings endpoint returned successfully")
        
        print(f"   GSTIN: {data.get('gstin', 'N/A')}")
        print(f"   State Code: {data.get('state_code', 'N/A')}")
        print(f"   Registration Type: {data.get('registration_type', 'N/A')}")
        
        return finish_test(True)
    else:
        print_error("GST Settings endpoint failed")
        return finish_test(False)


def run_all_tests():
    """Run all GST API tests"""
    print_header("GST HUB API TEST SUITE")
    
    results = {"passed": 0, "failed": 0}
    
    print(f"API Base URL: {API_BASE_URL}")
    
    # TEST 1: GST Dashboard
    print_header("TEST 1: GST Dashboard")
    if test_gst_dashboard():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # TEST 2: GST Returns Status
    print_header("TEST 2: GST Returns Status")
    if test_gst_returns_status():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # TEST 3: GST Compliance Status
    print_header("TEST 3: GST Compliance Status")
    if test_gst_compliance():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # TEST 4: GST Metrics
    print_header("TEST 4: GST Metrics")
    if test_gst_metrics():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # TEST 5: GST Settings
    print_header("TEST 5: GST Settings")
    if test_gst_settings():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # Summary
    print_header("TEST RESULTS SUMMARY")
    total = results["passed"] + results["failed"]
    print(f"   {Colors.GREEN}Passed: {results['passed']}/{total}{Colors.RESET}")
    print(f"   {Colors.RED}Failed: {results['failed']}/{total}{Colors.RESET}")
    
    if results["failed"] == 0:
        print(f"\n{Colors.GREEN}{Colors.BOLD}✓ ALL TESTS PASSED!{Colors.RESET}")
        return 0
    else:
        print(f"\n{Colors.RED}{Colors.BOLD}✗ SOME TESTS FAILED{Colors.RESET}")
        return 1


if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
