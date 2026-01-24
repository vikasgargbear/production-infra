#!/usr/bin/env python3
"""
Outstanding API Test - Tests sales outstanding endpoints
Run: API_BASE_URL="https://pharma-backend-production-0c09.up.railway.app" python backend/tests/api/test_outstanding_api.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
"""
import os
import sys
import requests
from typing import Optional, Dict, Any

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


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


def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠ {text}{Colors.RESET}")


def make_request(method: str, endpoint: str, params: Optional[Dict] = None) -> tuple[bool, Any]:
    url = f"{API_BASE_URL}/api{endpoint}"
    headers = {"Content-Type": "application/json"}
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, timeout=30)
        else:
            print_error(f"Unsupported method: {method}")
            return False, None
        
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


def test_sales_outstanding() -> bool:
    """Test GET /sales/outstanding - Main outstanding endpoint"""
    print_info("Testing sales outstanding endpoint...")
    
    success, data = make_request("GET", "/sales/outstanding")
    
    if success and data:
        print_success("Outstanding endpoint returned successfully")
        
        invoices = data.get("invoices", [])
        print(f"   Outstanding Invoices: {len(invoices)}")
        
        # Calculate totals
        total_outstanding = sum(float(inv.get("pending_amount", 0)) for inv in invoices)
        print(f"   Total Outstanding: ₹{total_outstanding:,.2f}")
        
        # Count unique customers
        customers = set(inv.get("customer_id") for inv in invoices if inv.get("customer_id"))
        print(f"   Customers with Outstanding: {len(customers)}")
        
        if invoices:
            print_info("First 3 invoices:")
            for inv in invoices[:3]:
                print(f"      - {inv.get('invoice_number')}: ₹{float(inv.get('pending_amount', 0)):,.2f} ({inv.get('customer_name', 'Unknown')})")
        
        return True
    else:
        print_error("Outstanding endpoint failed")
        return False


def test_customer_outstanding(customer_id: int) -> bool:
    """Test GET /sales/outstanding for specific customer"""
    print_info(f"Testing sales outstanding for customer {customer_id}...")
    
    success, data = make_request("GET", "/sales/outstanding", params={"customer_id": customer_id})
    
    if success and data:
        print_success("Customer outstanding endpoint returned successfully")
        
        invoices = data.get("invoices", [])
        print(f"   Customer Invoices: {len(invoices)}")
        
        total = sum(float(inv.get("pending_amount", 0)) for inv in invoices)
        print(f"   Total Outstanding: ₹{total:,.2f}")
        
        return True
    else:
        print_error("Customer outstanding endpoint failed")
        return False


def test_ledger_aging() -> bool:
    """Test GET /ledger/aging - Aging analysis endpoint"""
    print_info("Testing ledger aging endpoint...")
    
    success, data = make_request("GET", "/ledger/aging", params={"party_type": "customer"})
    
    if success and data:
        print_success("Ledger aging endpoint returned successfully")
        
        summary = data.get("summary", {})
        print(f"   Total Receivable: ₹{summary.get('total', 0):,.2f}")
        print(f"   Current: ₹{summary.get('current', 0):,.2f}")
        print(f"   Overdue: ₹{summary.get('overdue', 0):,.2f}")
        print(f"   Parties: {summary.get('party_count', 0)}")
        
        return True
    else:
        print_error("Ledger aging endpoint failed")
        return False


def test_ledger_summary() -> bool:
    """Test GET /ledger/summary - Summary endpoint"""
    print_info("Testing ledger summary endpoint...")
    
    success, data = make_request("GET", "/ledger/summary", params={"party_type": "customer"})
    
    if success and data:
        print_success("Ledger summary endpoint returned successfully")
        
        print(f"   Total Parties: {data.get('total_parties', 0)}")
        print(f"   Parties with Dues: {data.get('parties_with_dues', 0)}")
        print(f"   Total Receivable: ₹{data.get('total_receivable', 0):,.2f}")
        print(f"   Total Overdue: ₹{data.get('total_overdue', 0):,.2f}")
        
        return True
    else:
        print_error("Ledger summary endpoint failed")
        return False


def get_any_customer_id() -> Optional[int]:
    """Get any customer ID from outstanding data"""
    success, data = make_request("GET", "/sales/outstanding")
    if success and data:
        invoices = data.get("invoices", [])
        if invoices:
            return invoices[0].get("customer_id")
    return None


def run_all_tests():
    """Run all outstanding API tests"""
    print_header("OUTSTANDING API TEST SUITE")
    
    results = {"passed": 0, "failed": 0, "skipped": 0}
    
    print(f"API Base URL: {API_BASE_URL}")
    
    # TEST 1: Sales Outstanding
    print_header("TEST 1: Sales Outstanding")
    if test_sales_outstanding():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # Get customer ID for next test
    customer_id = get_any_customer_id()
    
    # TEST 2: Customer Outstanding
    print_header("TEST 2: Customer Outstanding")
    if customer_id:
        if test_customer_outstanding(customer_id):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("Skipped - no customer found")
        results["skipped"] += 1
    
    # TEST 3: Ledger Aging
    print_header("TEST 3: Ledger Aging")
    if test_ledger_aging():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # TEST 4: Ledger Summary
    print_header("TEST 4: Ledger Summary")
    if test_ledger_summary():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # Summary
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
