#!/usr/bin/env python3
"""
Ledger API Test - Tests party ledger balance, statement, and outstanding endpoints
Run: API_BASE_URL="http://localhost:8000" python backend/tests/api/test_ledger_api.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
      No auth token needed when TEST_MODE is enabled.
"""
import os
import sys
import json
import requests
import pytest
from datetime import date, timedelta
from typing import Optional, Dict, Any

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


def test_ledger_balance(party_id: Optional[int] = None, party_type: str = "customer") -> bool:
    """
    Test GET /ledger/balance/{party_id}
    Returns party balance summary
    """
    if party_id is None:
        party_id = get_any_customer_id() if party_type == "customer" else get_any_supplier_id()
    if party_id is None:
        pytest.skip(f"No {party_type} available for ledger balance test")

    print_info(f"Testing ledger balance for {party_type} ID {party_id}...")
    
    success, data = make_request(
        "GET", 
        f"/ledger/balance/{party_id}",
        params={"party_type": party_type}
    )
    
    if success and data:
        print_success(f"Balance endpoint returned successfully")
        print(f"   Party ID: {data.get('party_id')}")
        print(f"   Party Type: {data.get('party_type')}")
        
        if party_type == "customer":
            print(f"   Outstanding: {data.get('outstanding', 0):.2f}")
            print(f"   Advance: {data.get('advance', 0):.2f}")
            print(f"   Net Balance: {data.get('net_balance', 0):.2f}")
        else:
            print(f"   Payable: {data.get('payable', 0):.2f}")
            
        print(f"   Pending Invoices: {data.get('pending_invoices', 0)}")
        return finish_test(True)
    else:
        print_error("Balance endpoint failed")
        return finish_test(False)


def test_ledger_statement(
    party_id: Optional[int] = None,
    party_type: str = "customer",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> bool:
    """
    Test GET /ledger/statement/{party_id}
    Returns party ledger statement with transactions
    """
    if party_id is None:
        party_id = get_any_customer_id() if party_type == "customer" else get_any_supplier_id()
    if party_id is None:
        pytest.skip(f"No {party_type} available for ledger statement test")

    print_info(f"Testing ledger statement for {party_type} ID {party_id}...")
    
    params = {"party_type": party_type}
    if date_from:
        params["from_date"] = date_from
    if date_to:
        params["to_date"] = date_to
    
    success, data = make_request(
        "GET", 
        f"/ledger/statement/{party_id}",
        params=params
    )
    
    if success and data:
        print_success(f"Statement endpoint returned successfully")
        
        # Check response structure
        if data.get("success"):
            party_info = data.get("party", {})
            print(f"   Party Name: {party_info.get('name', 'N/A')}")
            print(f"   Party Type: {party_info.get('type', 'N/A')}")
            
            statement = data.get("statement", [])
            print(f"   Transactions: {len(statement)}")
            
            summary = data.get("summary", {})
            if summary:
                print(f"   Final Balance: {summary.get('final_balance', 0):.2f}")
                print(f"   Transaction Count: {summary.get('transaction_count', 0)}")
            
            # Show first few transactions
            if statement:
                print_info("First 3 transactions:")
                for txn in statement[:3]:
                    print(f"      - {txn.get('date')}: {txn.get('type')} - {txn.get('reference')} | Dr: {txn.get('debit', 0):.2f} | Cr: {txn.get('credit', 0):.2f}")
        else:
            print_warning(f"Response success=false: {data}")
            
        return finish_test(True)
    else:
        print_error("Statement endpoint failed")
        return finish_test(False)


def test_ledger_outstanding(party_id: Optional[int] = None, party_type: str = "customer") -> bool:
    """
    Test GET /ledger/outstanding/{party_id}
    Returns outstanding bills for a party
    """
    if party_id is None:
        party_id = get_any_customer_id() if party_type == "customer" else get_any_supplier_id()
    if party_id is None:
        pytest.skip(f"No {party_type} available for ledger outstanding test")

    print_info(f"Testing outstanding bills for {party_type} ID {party_id}...")
    
    success, data = make_request(
        "GET", 
        f"/ledger/outstanding/{party_id}",
        params={"party_type": party_type}
    )
    
    if success and data:
        print_success(f"Outstanding endpoint returned successfully")
        print(f"   Party ID: {data.get('party_id')}")
        print(f"   Total Outstanding: {data.get('total_outstanding', 0):.2f}")
        print(f"   Bill Count: {data.get('bill_count', 0)}")
        
        bills = data.get("outstanding_bills", [])
        if bills:
            print_info("First 3 outstanding bills:")
            for bill in bills[:3]:
                print(f"      - {bill.get('invoice_number')}: {bill.get('outstanding_amount', 0):.2f} (due: {bill.get('due_date')}, overdue: {bill.get('days_overdue', 0)} days)")
        
        return finish_test(True)
    else:
        print_error("Outstanding endpoint failed")
        return finish_test(False)


def test_ledger_aging(party_type: str = "customer") -> bool:
    """
    Test GET /ledger/aging
    Returns aging analysis for all parties
    """
    print_info(f"Testing aging analysis for {party_type}s...")
    
    success, data = make_request(
        "GET", 
        f"/ledger/aging",
        params={"party_type": party_type}
    )
    
    if success and data:
        print_success(f"Aging endpoint returned successfully")
        print(f"   Party Type: {data.get('party_type')}")
        
        summary = data.get("summary", {})
        if summary:
            print(f"   Total: {summary.get('total', 0):.2f}")
            print(f"   Current: {summary.get('current', 0):.2f}")
            print(f"   Overdue: {summary.get('overdue', 0):.2f}")
            print(f"   Party Count: {summary.get('party_count', 0)}")
        
        aging_data = data.get("aging_data", [])
        if aging_data:
            print_info(f"Top 3 parties by outstanding:")
            for party in aging_data[:3]:
                name = party.get('customer_name') or party.get('supplier_name') or 'Unknown'
                outstanding = party.get('total_outstanding') or party.get('total_payable', 0)
                print(f"      - {name}: {outstanding:.2f}")
        
        return finish_test(True)
    else:
        print_error("Aging endpoint failed")
        return finish_test(False)


def test_ledger_summary(party_type: str = "customer") -> bool:
    """
    Test GET /ledger/summary
    Returns overall ledger summary
    """
    print_info(f"Testing ledger summary for {party_type}s...")
    
    success, data = make_request(
        "GET", 
        f"/ledger/summary",
        params={"party_type": party_type}
    )
    
    if success and data:
        print_success(f"Summary endpoint returned successfully")
        print(f"   Party Type: {data.get('party_type')}")
        print(f"   Total Parties: {data.get('total_parties', 0)}")
        print(f"   Parties with Dues: {data.get('parties_with_dues', 0)}")
        
        if party_type == "customer":
            print(f"   Total Receivable: {data.get('total_receivable', 0):.2f}")
            print(f"   Total Overdue: {data.get('total_overdue', 0):.2f}")
            print(f"   Collection Efficiency: {data.get('collection_efficiency', 0):.2f}%")
        else:
            print(f"   Total Payable: {data.get('total_payable', 0):.2f}")
            print(f"   Total Overdue: {data.get('total_overdue', 0):.2f}")
            
        print(f"   Pending Invoices: {data.get('pending_invoices', 0)}")
        return finish_test(True)
    else:
        print_error("Summary endpoint failed")
        return finish_test(False)


def get_any_customer_id() -> Optional[int]:
    """Get any customer ID from the system for testing"""
    success, data = make_request("GET", "/customers", params={"limit": 5})
    if success and data:
        customers = data.get("customers") or data.get("data", [])
        if customers and len(customers) > 0:
            return customers[0].get("customer_id") or customers[0].get("id")
    return None


def get_any_supplier_id() -> Optional[int]:
    """Get any supplier ID from the system for testing"""
    success, data = make_request("GET", "/suppliers", params={"limit": 5})
    if success and data:
        suppliers = data.get("suppliers") or data.get("data", [])
        if suppliers and len(suppliers) > 0:
            return suppliers[0].get("supplier_id") or suppliers[0].get("id")
    return None


def run_all_tests():
    """Run all ledger API tests"""
    print_header("LEDGER API TEST SUITE")
    
    results = {
        "passed": 0,
        "failed": 0,
        "skipped": 0
    }
    
    # Test configuration
    print(f"API Base URL: {API_BASE_URL}")
    
    # Get test party IDs
    print_info("Finding test customers and suppliers...")
    customer_id = get_any_customer_id()
    supplier_id = get_any_supplier_id()
    
    if customer_id:
        print_success(f"Using customer ID: {customer_id}")
    else:
        print_warning("No customers found - some tests will be skipped")
        
    if supplier_id:
        print_success(f"Using supplier ID: {supplier_id}")
    else:
        print_warning("No suppliers found - some tests will be skipped")
    
    # ===== TEST 1: Customer Balance =====
    print_header("TEST 1: Customer Balance")
    if customer_id:
        if test_ledger_balance(customer_id, "customer"):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("Skipped - no customer available")
        results["skipped"] += 1
    
    # ===== TEST 2: Customer Statement =====
    print_header("TEST 2: Customer Statement")
    if customer_id:
        # Test with date range (last 3 months)
        date_from = (date.today() - timedelta(days=90)).isoformat()
        date_to = date.today().isoformat()
        
        if test_ledger_statement(customer_id, "customer", date_from, date_to):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("Skipped - no customer available")
        results["skipped"] += 1
    
    # ===== TEST 3: Customer Outstanding Bills =====
    print_header("TEST 3: Customer Outstanding Bills")
    if customer_id:
        if test_ledger_outstanding(customer_id, "customer"):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("Skipped - no customer available")
        results["skipped"] += 1
    
    # ===== TEST 4: Customer Aging Analysis =====
    print_header("TEST 4: Customer Aging Analysis")
    if test_ledger_aging("customer"):
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # ===== TEST 5: Customer Ledger Summary =====
    print_header("TEST 5: Customer Ledger Summary")
    if test_ledger_summary("customer"):
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # ===== TEST 6: Supplier Balance =====
    print_header("TEST 6: Supplier Balance")
    if supplier_id:
        if test_ledger_balance(supplier_id, "supplier"):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("Skipped - no supplier available")
        results["skipped"] += 1
    
    # ===== TEST 7: Supplier Statement =====
    print_header("TEST 7: Supplier Statement")
    if supplier_id:
        date_from = (date.today() - timedelta(days=90)).isoformat()
        date_to = date.today().isoformat()
        
        if test_ledger_statement(supplier_id, "supplier", date_from, date_to):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("Skipped - no supplier available")
        results["skipped"] += 1
    
    # ===== TEST 8: Supplier Aging Analysis =====
    print_header("TEST 8: Supplier Aging Analysis")
    if test_ledger_aging("supplier"):
        results["passed"] += 1
    else:
        results["failed"] += 1
    
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
