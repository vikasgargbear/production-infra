#!/usr/bin/env python3
"""
Collection Center API Test - Tests collection aging, analytics, and customer outstanding endpoints
Run: API_BASE_URL="http://localhost:8000" python backend/tests/api/test_collection_api.py

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


def test_collection_aging_data() -> bool:
    """
    Test GET /collection-center/collection/aging-data
    Returns comprehensive aging data for smart dashboard
    """
    print_info("Testing collection aging-data endpoint...")
    
    success, data = make_request("GET", "/collection-center/collection/aging-data")
    
    if success and data:
        print_success("Aging-data endpoint returned successfully")
        
        # Check summary
        summary = data.get("summary", {})
        print(f"   Total Outstanding: {summary.get('totalOutstanding', 0):,.2f}")
        print(f"   Overdue Amount: {summary.get('overdueAmount', 0):,.2f}")
        print(f"   Current Week Collections: {summary.get('currentWeekCollections', 0):,.2f}")
        print(f"   Collection Efficiency: {summary.get('collectionEfficiency', 0)}%")
        
        # Check aging buckets
        aging_buckets = data.get("agingBuckets", [])
        if aging_buckets:
            print_info("Aging Buckets:")
            for bucket in aging_buckets:
                print(f"      - {bucket.get('range')} days: {bucket.get('amount', 0):,.2f} ({bucket.get('percentage', 0)}%)")
        
        # Check parties
        parties = data.get("parties", [])
        print(f"   Parties with Outstanding: {len(parties)}")
        
        if parties:
            print_info("Top 3 parties by outstanding:")
            for party in parties[:3]:
                print(f"      - {party.get('name', 'Unknown')}: ₹{party.get('outstandingAmount', 0):,.2f} ({party.get('daysOverdue', 0)} days overdue)")
        
        return finish_test(True)
    else:
        print_error("Aging-data endpoint failed")
        return finish_test(False)


def test_collection_customer_outstanding(customer_id: Optional[int] = None) -> bool:
    """
    Test GET /collection-center/collection/customer/{customer_id}/outstanding
    Returns detailed outstanding for a specific customer
    """
    if customer_id is None:
        customer_id = get_any_customer_id()
    if customer_id is None:
        pytest.skip("No customer available for collection outstanding test")

    print_info(f"Testing customer outstanding for ID {customer_id}...")
    
    success, data = make_request("GET", f"/collection-center/collection/customer/{customer_id}/outstanding")
    
    if success and data:
        print_success("Customer outstanding endpoint returned successfully")
        print(f"   Customer ID: {data.get('customer_id')}")
        print(f"   Total Outstanding: {data.get('total_outstanding', 0):,.2f}")
        
        invoices = data.get("invoices", [])
        print(f"   Outstanding Invoices: {len(invoices)}")
        
        if invoices:
            print_info("First 3 invoices:")
            for inv in invoices[:3]:
                print(f"      - {inv.get('number')}: ₹{inv.get('outstanding', 0):,.2f} (due: {inv.get('dueDate')}, {inv.get('daysOverdue', 0)} days overdue)")
        
        return finish_test(True)
    else:
        print_error("Customer outstanding endpoint failed")
        return finish_test(False)


def test_collection_performance() -> bool:
    """
    Test GET /collection-center/collection/analytics/performance
    Returns collection performance analytics
    """
    print_info("Testing collection performance analytics...")
    
    # Use last 30 days
    start_date = (date.today() - timedelta(days=30)).isoformat()
    end_date = date.today().isoformat()
    
    success, data = make_request(
        "GET", 
        "/collection-center/collection/analytics/performance",
        params={"start_date": start_date, "end_date": end_date}
    )
    
    if success and data:
        print_success("Performance analytics endpoint returned successfully")
        print(f"   Total Collections: {data.get('total_collections', 0):,.2f}")
        print(f"   Collection Rate: {data.get('collection_rate', 0)}%")
        print(f"   Outstanding Change: {data.get('outstanding_change', 0)}%")
        
        daily = data.get("daily_collections", [])
        print(f"   Days with Collections: {len(daily)}")
        
        return finish_test(True)
    else:
        print_error("Performance analytics endpoint failed")
        return finish_test(False)


def test_collection_campaigns() -> bool:
    """
    Test GET /collection-center/collection/campaigns
    Returns active collection campaigns
    """
    print_info("Testing collection campaigns endpoint...")
    
    success, data = make_request("GET", "/collection-center/collection/campaigns")
    
    if success and data:
        print_success("Campaigns endpoint returned successfully")
        
        campaigns = data.get("campaigns", [])
        print(f"   Active Campaigns: {len(campaigns)}")
        
        if campaigns:
            print_info("Campaigns:")
            for campaign in campaigns[:3]:
                print(f"      - {campaign.get('name')}: {campaign.get('status')} ({campaign.get('stats', {}).get('total_sent', 0)} sent)")
        
        return finish_test(True)
    else:
        print_error("Campaigns endpoint failed")
        return finish_test(False)


def test_hub_statistics() -> bool:
    """
    Test GET /collection-center/collection/hub-stats
    Returns comprehensive hub statistics for dashboard
    """
    print_info("Testing hub statistics endpoint...")
    
    success, data = make_request("GET", "/collection-center/collection/hub-stats")
    
    if success and data:
        print_success("Hub statistics endpoint returned successfully")
        print(f"   Total Outstanding: {data.get('total_outstanding', 0):,.2f}")
        print(f"   Overdue Amount: {data.get('overdue_amount', 0):,.2f}")
        print(f"   Today's Collections: {data.get('today_collections', 0):,.2f}")
        print(f"   Collection Efficiency: {data.get('collection_efficiency', 0)}%")
        print(f"   High Risk Customers: {data.get('high_risk_customers', 0)}")
        print(f"   Field Agents: {data.get('field_agents', 0)}")
        
        return finish_test(True)
    else:
        print_error("Hub statistics endpoint failed")
        return finish_test(False)


def get_any_customer_id() -> Optional[int]:
    """Get any customer ID from the system for testing"""
    success, data = make_request("GET", "/customers", params={"limit": 5})
    if success and data:
        customers = data.get("customers") or data.get("data", [])
        if customers and len(customers) > 0:
            return customers[0].get("customer_id") or customers[0].get("id")
    return None


def run_all_tests():
    """Run all collection API tests"""
    print_header("COLLECTION CENTER API TEST SUITE")
    
    results = {
        "passed": 0,
        "failed": 0,
        "skipped": 0
    }
    
    # Test configuration
    print(f"API Base URL: {API_BASE_URL}")
    
    # Get test customer ID
    print_info("Finding test customers...")
    customer_id = get_any_customer_id()
    
    if customer_id:
        print_success(f"Using customer ID: {customer_id}")
    else:
        print_warning("No customers found - some tests will be skipped")
    
    # ===== TEST 1: Aging Data =====
    print_header("TEST 1: Collection Aging Data")
    if test_collection_aging_data():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # ===== TEST 2: Customer Outstanding =====
    print_header("TEST 2: Customer Outstanding")
    if customer_id:
        if test_collection_customer_outstanding(customer_id):
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        print_warning("Skipped - no customer available")
        results["skipped"] += 1
    
    # ===== TEST 3: Collection Performance =====
    print_header("TEST 3: Collection Performance Analytics")
    if test_collection_performance():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # ===== TEST 4: Collection Campaigns =====
    print_header("TEST 4: Collection Campaigns")
    if test_collection_campaigns():
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # ===== TEST 5: Hub Statistics =====
    print_header("TEST 5: Hub Statistics")
    if test_hub_statistics():
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
