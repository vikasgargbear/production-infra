#!/usr/bin/env python3
"""
Returns API Test - Tests sales and purchase returns endpoints
Run: API_BASE_URL="http://localhost:8000" python backend/tests/api/test_returns_api.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
      No auth token needed when TEST_MODE is enabled.
"""
import os
import sys
import json
import requests
from datetime import date, timedelta
from typing import Optional, Dict, Any

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


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
) -> tuple[bool, Any]:
    """
    Make HTTP request to API
    Returns: (success: bool, response_data: Any)
    """
    url = f"{API_BASE_URL}/api{endpoint}"
    headers = {"Content-Type": "application/json"}
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=data, params=params, timeout=30)
        else:
            print_error(f"Unsupported method: {method}")
            return False, None
        
        # Check response
        if response.status_code in [200, 201]:
            try:
                return True, response.json()
            except:
                return True, response.text
        else:
            print_error(f"HTTP {response.status_code}: {response.text[:500]}")
            return False, response.text
            
    except requests.exceptions.ConnectionError:
        print_error(f"Connection failed to {url}")
        return False, None
    except requests.exceptions.Timeout:
        print_error(f"Request timed out: {url}")
        return False, None
    except Exception as e:
        print_error(f"Request error: {str(e)}")
        return False, None


# =============================================================================
# SALES RETURNS TESTS
# =============================================================================

def test_list_sales_returns(limit: int = 10) -> bool:
    """
    Test GET /sale-returns/
    Returns list of sales returns
    """
    print_info(f"Testing sales returns list (limit={limit})...")
    
    success, data = make_request(
        "GET", 
        "/sale-returns/",
        params={"limit": limit}
    )
    
    if success and data:
        print_success(f"Sales returns list endpoint returned successfully")
        print(f"   Total: {data.get('total', 0)}")
        print(f"   Returns in response: {len(data.get('returns', []))}")
        
        returns = data.get("returns", [])
        if returns:
            print_info("First 3 sales returns:")
            for ret in returns[:3]:
                print(f"      - {ret.get('return_number')}: {ret.get('party_name')} | ₹{ret.get('total_amount', 0):.2f} | Items: {ret.get('item_count', 0)}")
        return True
    else:
        print_error("Sales returns list endpoint failed")
        return False


def test_sales_return_detail(return_id: int) -> bool:
    """
    Test GET /sale-returns/{return_id}
    Returns detailed sales return
    """
    print_info(f"Testing sales return detail for ID {return_id}...")
    
    success, data = make_request(
        "GET", 
        f"/sale-returns/{return_id}"
    )
    
    if success and data:
        print_success(f"Sales return detail endpoint returned successfully")
        print(f"   Return Number: {data.get('return_number')}")
        print(f"   Party: {data.get('party_name')}")
        print(f"   Total: ₹{data.get('total_amount', 0):.2f}")
        print(f"   Items: {len(data.get('items', []))}")
        return True
    else:
        print_error("Sales return detail endpoint failed")
        return False


def test_returnable_invoices(customer_id: Optional[int] = None) -> bool:
    """
    Test GET /sale-returns/returnable-invoices/
    Returns invoices that can be returned
    """
    print_info(f"Testing returnable invoices...")
    
    params = {}
    if customer_id:
        params["party_id"] = customer_id
    
    success, data = make_request(
        "GET", 
        "/sale-returns/returnable-invoices",
        params=params
    )
    
    if success and data:
        print_success(f"Returnable invoices endpoint returned successfully")
        invoices = data.get("invoices", [])
        print(f"   Invoices found: {len(invoices)}")
        
        if invoices:
            print_info("First 3 returnable invoices:")
            for inv in invoices[:3]:
                print(f"      - {inv.get('invoice_number')}: {inv.get('party_name')} | ₹{inv.get('grand_total', 0):.2f}")
        return True
    else:
        print_error("Returnable invoices endpoint failed")
        return False


# =============================================================================
# PURCHASE RETURNS TESTS
# =============================================================================

def test_list_purchase_returns(limit: int = 10) -> bool:
    """
    Test GET /purchase-returns/
    Returns list of purchase returns
    """
    print_info(f"Testing purchase returns list (limit={limit})...")
    
    success, data = make_request(
        "GET", 
        "/purchase-returns/",
        params={"limit": limit}
    )
    
    if success and data:
        print_success(f"Purchase returns list endpoint returned successfully")
        print(f"   Total: {data.get('total', 0)}")
        print(f"   Returns in response: {len(data.get('returns', []))}")
        
        returns = data.get("returns", [])
        if returns:
            print_info("First 3 purchase returns:")
            for ret in returns[:3]:
                print(f"      - {ret.get('return_number')}: {ret.get('party_name')} | ₹{ret.get('total_amount', 0):.2f} | Items: {ret.get('item_count', 0)}")
        return True
    else:
        print_error("Purchase returns list endpoint failed")
        return False


def test_purchase_return_detail(return_id: int) -> bool:
    """
    Test GET /purchase-returns/{return_id}
    Returns detailed purchase return
    """
    print_info(f"Testing purchase return detail for ID {return_id}...")
    
    success, data = make_request(
        "GET", 
        f"/purchase-returns/{return_id}"
    )
    
    if success and data:
        print_success(f"Purchase return detail endpoint returned successfully")
        print(f"   Return Number: {data.get('return_number')}")
        print(f"   Supplier: {data.get('party_name')}")
        print(f"   Total: ₹{data.get('total_amount', 0):.2f}")
        print(f"   Items: {len(data.get('items', []))}")
        return True
    else:
        print_error("Purchase return detail endpoint failed")
        return False


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_any_sales_return_id() -> Optional[int]:
    """Get any sales return ID from the system for testing"""
    success, data = make_request("GET", "/sale-returns/", params={"limit": 1})
    if success and data:
        returns = data.get("returns", [])
        if returns:
            return returns[0].get("return_id")
    return None


def get_any_purchase_return_id() -> Optional[int]:
    """Get any purchase return ID from the system for testing"""
    success, data = make_request("GET", "/purchase-returns/", params={"limit": 1})
    if success and data:
        returns = data.get("returns", [])
        if returns:
            return returns[0].get("return_id")
    return None


def get_any_customer_id() -> Optional[int]:
    """Get any customer ID from the system for testing"""
    success, data = make_request("GET", "/customers", params={"limit": 1})
    if success and data:
        customers = data.get("customers") or data.get("data", [])
        if customers:
            return customers[0].get("customer_id") or customers[0].get("id")
    return None


# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

def run_all_tests():
    """Run all returns API tests"""
    print_header("RETURNS API TEST SUITE")
    
    results = {
        "passed": 0,
        "failed": 0,
        "skipped": 0
    }
    
    # Test configuration
    print(f"API Base URL: {API_BASE_URL}")
    
    # ===== TEST 1: Sales Returns List =====
    print_header("TEST 1: Sales Returns List")
    if test_list_sales_returns():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # ===== TEST 2: Sales Return Detail =====
    print_header("TEST 2: Sales Return Detail")
    sales_return_id = get_any_sales_return_id()
    if sales_return_id:
        print_success(f"Using sales return ID: {sales_return_id}")
        if test_sales_return_detail(sales_return_id):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("No sales returns found - skipping detail test")
        results["skipped"] += 1
    
    # ===== TEST 3: Returnable Invoices =====
    print_header("TEST 3: Returnable Invoices")
    if test_returnable_invoices():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # ===== TEST 4: Returnable Invoices for Customer =====
    print_header("TEST 4: Returnable Invoices (for specific customer)")
    customer_id = get_any_customer_id()
    if customer_id:
        print_success(f"Using customer ID: {customer_id}")
        if test_returnable_invoices(customer_id):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("No customers found - skipping")
        results["skipped"] += 1
    
    # ===== TEST 5: Purchase Returns List =====
    print_header("TEST 5: Purchase Returns List")
    if test_list_purchase_returns():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # ===== TEST 6: Purchase Return Detail =====
    print_header("TEST 6: Purchase Return Detail")
    purchase_return_id = get_any_purchase_return_id()
    if purchase_return_id:
        print_success(f"Using purchase return ID: {purchase_return_id}")
        if test_purchase_return_detail(purchase_return_id):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("No purchase returns found - skipping detail test")
        results["skipped"] += 1
    
    # ===== SUMMARY =====
    print_header("TEST RESULTS SUMMARY")
    total = results["passed"] + results["failed"] + results["skipped"]
    print(f"   {Colors.GREEN}Passed: {results['passed']}/{total}{Colors.RESET}")
    print(f"   {Colors.RED}Failed: {results['failed']}/{total}{Colors.RESET}")
    print(f"   {Colors.YELLOW}Skipped: {results['skipped']}/{total}{Colors.RESET}")
    
    if results["failed"] == 0:
        print(f"\n{Colors.GREEN}{Colors.BOLD}✓ ALL TESTS PASSED!{Colors.RESET}")
        return 0
    else:
        print(f"\n{Colors.RED}{Colors.BOLD}✗ SOME TESTS FAILED{Colors.RESET}")
        return 1


if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
