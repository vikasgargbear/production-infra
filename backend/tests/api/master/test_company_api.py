#!/usr/bin/env python3
"""
Company Profile API Test - Tests company info and bank accounts endpoints
Run: API_BASE_URL="http://localhost:8000" python backend/tests/api/test_company_api.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
      No auth token needed when TEST_MODE is enabled.
"""
import os
import sys
import json
import requests
from typing import Optional, Dict, Any, List

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def finish_test(value, predicate=None):
    """Assert under pytest, preserve return values for script-mode runs."""
    ok = predicate(value) if predicate else bool(value)
    if os.getenv("PYTEST_CURRENT_TEST"):
        assert ok
        return None
    return value


class Colors:
    """ANSI color codes for terminal output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_header(text: str):
    """Print section header"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")


def print_success(text: str):
    """Print success message"""
    print(f"{Colors.GREEN}✓ {text}{Colors.RESET}")


def print_error(text: str):
    """Print error message"""
    print(f"{Colors.RED}✗ {text}{Colors.RESET}")


def print_info(text: str):
    """Print info message"""
    print(f"{Colors.CYAN}ℹ {text}{Colors.RESET}")


def print_warning(text: str):
    """Print warning message"""
    print(f"{Colors.YELLOW}⚠ {text}{Colors.RESET}")


def make_request(
    method: str, 
    endpoint: str, 
    data: Optional[Dict] = None, 
    params: Optional[Dict] = None
) -> tuple[bool, Any, int]:
    """
    Make HTTP request to API
    Returns: (success: bool, response_data: Any, status_code: int)
    """
    url = f"{API_BASE_URL}/api{endpoint}"
    headers = {"Content-Type": "application/json"}
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=data, params=params, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=data, params=params, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, params=params, timeout=30)
        else:
            print_error(f"Unsupported method: {method}")
            return False, None, 0
        
        # Check response
        if response.status_code in [200, 201]:
            try:
                return True, response.json(), response.status_code
            except:
                return True, response.text, response.status_code
        else:
            print_error(f"HTTP {response.status_code}: {response.text[:500]}")
            return False, response.text, response.status_code
            
    except requests.exceptions.ConnectionError:
        print_error(f"Connection failed to {url}")
        return False, None, 0
    except requests.exceptions.Timeout:
        print_error(f"Request timed out: {url}")
        return False, None, 0
    except Exception as e:
        print_error(f"Request error: {str(e)}")
        return False, None, 0


# ============================================================
# COMPANY INFO TESTS
# ============================================================

def test_get_company_info() -> bool:
    """
    Test GET /company/info
    Returns company profile information
    """
    print_info("Testing GET /company/info...")
    
    success, data, status = make_request("GET", "/company/info")
    
    if success and data:
        print_success("Company info endpoint returned successfully")
        print(f"   Company Name: {data.get('company_name', 'N/A')}")
        print(f"   Legal Name: {data.get('legal_name', 'N/A')}")
        print(f"   GSTIN: {data.get('gstin', 'N/A')}")
        print(f"   Email: {data.get('email', 'N/A')}")
        print(f"   Phone: {data.get('phone', 'N/A')}")
        print(f"   State: {data.get('state', 'N/A')}")
        print(f"   Logo Present: {'Yes' if data.get('logo') else 'No'}")
        
        # Check for bank_accounts array
        bank_accounts = data.get('bank_accounts', [])
        print(f"   Bank Accounts: {len(bank_accounts)} found")
        for i, account in enumerate(bank_accounts[:3]):  # Show first 3
            print(f"      [{i+1}] {account.get('bank_name', 'N/A')} - {account.get('account_number', 'N/A')}")
        
        return finish_test(True)
    else:
        print_error(f"Company info endpoint failed (status: {status})")
        return finish_test(False)


def test_update_company_info() -> bool:
    """
    Test PUT /company/info
    Updates company profile information
    """
    print_info("Testing PUT /company/info...")
    
    # First get current info
    success, current_data, _ = make_request("GET", "/company/info")
    if not success:
        print_error("Cannot test update - failed to get current info")
        return False
    
    # Make a minor update (preserving original values)
    update_data = {
        "company_name": current_data.get("company_name", "Test Company"),
        "phone": current_data.get("phone", ""),
    }
    
    success, data, status = make_request("PUT", "/company/info", data=update_data)
    
    if success:
        print_success("Company info update endpoint returned successfully")
        return finish_test(True)
    else:
        print_error(f"Company info update endpoint failed (status: {status})")
        return finish_test(False)


# ============================================================
# BANK ACCOUNTS TESTS
# ============================================================

def test_get_bank_accounts() -> bool:
    """
    Test GET /bank-accounts
    Returns all bank accounts for the organization
    """
    print_info("Testing GET /bank-accounts...")
    
    success, data, status = make_request("GET", "/bank-accounts")
    
    if success and isinstance(data, list):
        print_success(f"Bank accounts endpoint returned successfully ({len(data)} accounts)")
        for i, account in enumerate(data[:5]):  # Show first 5
            print(f"   [{i+1}] {account.get('bank_name', 'N/A')}")
            print(f"       Account: {account.get('account_number', 'N/A')}")
            print(f"       IFSC: {account.get('ifsc_code', 'N/A')}")
            print(f"       Default: {account.get('is_default_account', False)}")
        return finish_test(True)
    else:
        print_error(f"Bank accounts endpoint failed (status: {status})")
        return finish_test(False)


def test_get_bank_accounts_with_trailing_slash() -> bool:
    """
    Test GET /bank-accounts/ (with trailing slash)
    Verifies both URL variants work
    """
    print_info("Testing GET /bank-accounts/ (with trailing slash)...")
    
    # Make direct request to verify both routes work
    url = f"{API_BASE_URL}/api/bank-accounts/"
    try:
        response = requests.get(url, headers={"Content-Type": "application/json"}, timeout=30)
        if response.status_code == 200:
            print_success("Bank accounts with trailing slash works")
            return finish_test(True)
        else:
            print_error(f"Bank accounts with trailing slash failed (status: {response.status_code})")
            return finish_test(False)
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return finish_test(False)


def test_create_bank_account() -> bool:
    """
    Test POST /bank-accounts
    Creates a new bank account (test account, will be deleted)
    """
    print_info("Testing POST /bank-accounts...")
    
    test_account = {
        "account_name": "Test API Account",
        "account_number": "TEST123456789",
        "account_type": "savings",
        "bank_name": "Test Bank",
        "branch_name": "Test Branch",
        "ifsc_code": "SBIN0001234",
        "is_active": True
    }
    
    success, data, status = make_request("POST", "/bank-accounts/", data=test_account)
    
    if success:
        print_success("Bank account creation endpoint works")
        if isinstance(data, dict) and data.get("id"):
            print(f"   Created Account ID: {data.get('id')}")
            return finish_test(data.get("id"))
        return finish_test(True)
    else:
        print_error(f"Bank account creation failed (status: {status})")
        return finish_test(False)


# ============================================================
# LOGO TESTS
# ============================================================

def test_get_logo() -> bool:
    """
    Test GET /company/logo
    Returns company logo if set
    """
    print_info("Testing GET /company/logo...")
    
    success, data, status = make_request("GET", "/company/logo")
    
    if success:
        if data and isinstance(data, dict) and data.get("logo"):
            logo_preview = data.get("logo", "")[:50]
            print_success(f"Logo endpoint returned successfully (data: {logo_preview}...)")
        else:
            print_success("Logo endpoint works (no logo set)")
        return finish_test(True)
    else:
        if status == 404:
            print_warning("Logo endpoint returned 404 (no logo set - this may be expected)")
            return finish_test(True)
        print_error(f"Logo endpoint failed (status: {status})")
        return finish_test(False)


# ============================================================
# ROUTE ACCESSIBILITY TESTS
# ============================================================

def test_route_accessibility() -> dict:
    """
    Test that all company-related routes are accessible (not 404)
    Returns dict of route -> status
    """
    print_header("Route Accessibility Tests")
    
    routes = [
        ("GET", "/company/info"),
        ("GET", "/company/logo"),
        ("GET", "/bank-accounts"),
        ("GET", "/bank-accounts/"),
    ]
    
    results = {}
    
    for method, route in routes:
        url = f"{API_BASE_URL}/api{route}"
        try:
            if method == "GET":
                response = requests.get(url, headers={"Content-Type": "application/json"}, timeout=10)
            else:
                response = requests.options(url, timeout=10)
            
            if response.status_code == 404:
                print_error(f"{method} {route} -> 404 NOT FOUND")
                results[route] = "404"
            elif response.status_code == 401:
                print_warning(f"{method} {route} -> 401 UNAUTHORIZED (route exists, auth needed)")
                results[route] = "401"
            elif response.status_code in [200, 201]:
                print_success(f"{method} {route} -> {response.status_code} OK")
                results[route] = "OK"
            else:
                print_info(f"{method} {route} -> {response.status_code}")
                results[route] = str(response.status_code)
                
        except Exception as e:
            print_error(f"{method} {route} -> ERROR: {str(e)}")
            results[route] = "ERROR"
    
    return finish_test(results, predicate=lambda v: all(status != "404" for status in v.values()))


# ============================================================
# MAIN TEST RUNNER
# ============================================================

def run_all_tests():
    """Run all company API tests"""
    print_header("Company Profile API Test Suite")
    print_info(f"API Base URL: {API_BASE_URL}")
    print_info("NOTE: Backend must have TEST_MODE=true to bypass auth")
    
    results = {
        "passed": 0,
        "failed": 0,
        "tests": []
    }
    
    # Route accessibility first
    route_results = test_route_accessibility()
    
    # Company Info Tests
    print_header("Company Info Endpoint Tests")
    
    tests = [
        ("GET /company/info", test_get_company_info),
        ("PUT /company/info", test_update_company_info),
        ("GET /company/logo", test_get_logo),
    ]
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            if result:
                results["passed"] += 1
                results["tests"].append((test_name, "PASS"))
            else:
                results["failed"] += 1
                results["tests"].append((test_name, "FAIL"))
        except Exception as e:
            print_error(f"{test_name} raised exception: {str(e)}")
            results["failed"] += 1
            results["tests"].append((test_name, "ERROR"))
    
    # Bank Account Tests
    print_header("Bank Accounts Endpoint Tests")
    
    bank_tests = [
        ("GET /bank-accounts", test_get_bank_accounts),
        ("GET /bank-accounts/", test_get_bank_accounts_with_trailing_slash),
        # Note: create test commented out to avoid creating test data
        # ("POST /bank-accounts", test_create_bank_account),
    ]
    
    for test_name, test_func in bank_tests:
        try:
            result = test_func()
            if result:
                results["passed"] += 1
                results["tests"].append((test_name, "PASS"))
            else:
                results["failed"] += 1
                results["tests"].append((test_name, "FAIL"))
        except Exception as e:
            print_error(f"{test_name} raised exception: {str(e)}")
            results["failed"] += 1
            results["tests"].append((test_name, "ERROR"))
    
    # Summary
    print_header("Test Summary")
    
    total = results["passed"] + results["failed"]
    print(f"Total Tests: {total}")
    print(f"{Colors.GREEN}Passed: {results['passed']}{Colors.RESET}")
    print(f"{Colors.RED}Failed: {results['failed']}{Colors.RESET}")
    
    print("\nDetailed Results:")
    for test_name, status in results["tests"]:
        color = Colors.GREEN if status == "PASS" else Colors.RED
        print(f"   {color}{status}{Colors.RESET} - {test_name}")
    
    # Check route accessibility
    print("\nRoute Accessibility Summary:")
    for route, status in route_results.items():
        if status == "404":
            print(f"   {Colors.RED}✗ {route} - NOT FOUND{Colors.RESET}")
        elif status == "OK":
            print(f"   {Colors.GREEN}✓ {route} - OK{Colors.RESET}")
        else:
            print(f"   {Colors.YELLOW}? {route} - {status}{Colors.RESET}")
    
    # Exit code
    if results["failed"] > 0:
        print(f"\n{Colors.RED}Some tests failed!{Colors.RESET}")
        return 1
    else:
        print(f"\n{Colors.GREEN}All tests passed!{Colors.RESET}")
        return 0


if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
