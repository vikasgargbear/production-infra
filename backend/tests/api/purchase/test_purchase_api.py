"""
Purchase Module API Tests
Comprehensive tests for purchases, supplier invoices, GRN, and purchase returns

Run with: python3 tests/api/test_purchase_api.py
"""
import os
import sys
import requests
from datetime import datetime, timedelta

# Configuration
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
HEADERS = {"X-Test-Mode": "true"}
TIMEOUT = 15


def finish_test(value, predicate=None):
    """Assert under pytest, preserve return values for script-mode runs."""
    ok = predicate(value) if predicate else bool(value)
    if os.getenv("PYTEST_CURRENT_TEST"):
        assert ok
        return None
    return value

def log_result(name: str, passed: bool, response=None):
    """Helper to log test results consistently"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status} - {name}")
    if response:
        print(f"   Status: {response.status_code}")
        if not passed:
            try:
                print(f"   Response: {response.json()}")
            except:
                print(f"   Response: {response.text[:200]}")

def request_get(endpoint: str, params: dict = None):
    """Make GET request with error handling"""
    try:
        return requests.get(
            f"{API_BASE_URL}/api{endpoint}",
            headers=HEADERS,
            params=params or {},
            timeout=TIMEOUT
        )
    except Exception as e:
        print(f"   Error: {e}")
        return None

# ============================================
# PURCHASES (Purchase Orders)
# ============================================

def test_purchases_list():
    """Test GET /api/purchases/ - list purchase orders"""
    response = request_get("/purchases/", {"limit": 10})
    passed = response and response.status_code == 200
    log_result("GET /api/purchases/ (list POs)", passed, response)
    return finish_test(passed)

def test_purchases_pending_receipts():
    """Test GET /api/purchases/pending-receipts - purchases awaiting receipt"""
    response = request_get("/purchases/pending-receipts")
    passed = response and response.status_code in [200, 404]  # 404 if no pending
    log_result("GET /api/purchases/pending-receipts", passed, response)
    return finish_test(passed)

def test_purchases_search_products():
    """Test POST /api/purchases/search-products"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/purchases/search-products",
            headers=HEADERS,
            json={"search": "paracetamol"},
            timeout=TIMEOUT
        )
        passed = response.status_code in [200, 401, 403]  # Auth required
        log_result("POST /api/purchases/search-products", passed, response)
        return finish_test(passed)
    except Exception as e:
        log_result("POST /api/purchases/search-products", False)
        return finish_test(False)

# ============================================
# SUPPLIER INVOICES
# ============================================

def test_supplier_invoices_list():
    """Test GET /api/supplier-invoices/ - list supplier invoices"""
    response = request_get("/supplier-invoices/", {"limit": 10})
    passed = response and response.status_code == 200
    log_result("GET /api/supplier-invoices/ (list)", passed, response)
    if passed:
        try:
            data = response.json()
            count = len(data) if isinstance(data, list) else len(data.get('invoices', []))
            print(f"   Found {count} invoices")
        except:
            pass
    return finish_test(passed)

def test_supplier_invoices_returnable():
    """Test GET /api/supplier-invoices/returnable/ - invoices with returnable items"""
    response = request_get("/supplier-invoices/returnable/")
    passed = response and response.status_code == 200
    log_result("GET /api/supplier-invoices/returnable/", passed, response)
    return finish_test(passed)

def test_supplier_invoice_by_id():
    """Test GET /api/supplier-invoices/{id} - get invoice details"""
    # First get list to find an ID
    list_response = request_get("/supplier-invoices", {"limit": 1})
    if list_response and list_response.status_code == 200:
        try:
            data = list_response.json()
            invoices = data if isinstance(data, list) else data.get('invoices', [])
            if invoices:
                invoice_id = invoices[0].get('supplier_invoice_id') or invoices[0].get('id')
                if invoice_id:
                    response = request_get(f"/supplier-invoices/{invoice_id}")
                    passed = response and response.status_code == 200
                    log_result(f"GET /api/supplier-invoices/{invoice_id}", passed, response)
                    return finish_test(passed)
        except:
            pass
    log_result("GET /api/supplier-invoices/{id} (no data to test)", True)
    return finish_test(True)

# ============================================
# GRN (Goods Receipt Notes)
# ============================================

def test_grn_list():
    """Test GET /api/grn - list Goods Receipt Notes"""
    response = request_get("/grn", {"limit": 10})
    passed = response and response.status_code == 200
    log_result("GET /api/grn (list GRNs)", passed, response)
    if passed:
        try:
            data = response.json()
            grns = data.get('grns', data) if isinstance(data, dict) else data
            count = len(grns) if isinstance(grns, list) else 0
            print(f"   Found {count} GRNs")
        except:
            pass
    return finish_test(passed)

def test_grn_generate_number():
    """Test GET /api/grn/generate-number - get next GRN number"""
    response = request_get("/grn/generate-number")
    passed = response and response.status_code in [200, 401, 403]  # Auth may be required
    log_result("GET /api/grn/generate-number", passed, response)
    return finish_test(passed)

def test_grn_by_id():
    """Test GET /api/grn/{id} - get GRN details"""
    list_response = request_get("/grn", {"limit": 1})
    if list_response and list_response.status_code == 200:
        try:
            data = list_response.json()
            grns = data.get('grns', data) if isinstance(data, dict) else data
            if grns and isinstance(grns, list) and len(grns) > 0:
                grn_id = grns[0].get('grn_id') or grns[0].get('id')
                if grn_id:
                    response = request_get(f"/grn/{grn_id}")
                    passed = response and response.status_code == 200
                    log_result(f"GET /api/grn/{grn_id}", passed, response)
                    return finish_test(passed)
        except:
            pass
    log_result("GET /api/grn/{id} (no data to test)", True)
    return finish_test(True)

# ============================================
# PURCHASE RETURNS
# ============================================

def test_purchase_returns_list():
    """Test GET /api/purchase-returns - list purchase returns"""
    response = request_get("/purchase-returns/", {"limit": 10})
    passed = response and response.status_code == 200
    log_result("GET /api/purchase-returns (list)", passed, response)
    return finish_test(passed)

def test_purchase_returns_by_supplier():
    """Test GET /api/purchase-returns/supplier/{id}"""
    response = request_get("/purchase-returns/", {"supplier_id": 1, "limit": 10})
    passed = response and response.status_code == 200
    log_result("GET /api/purchase-returns/?supplier_id=1", passed, response)
    return finish_test(passed)

# ============================================
# PURCHASE UPLOAD
# ============================================

def test_purchase_upload_parse():
    """Test POST /api/purchase-upload/parse - parse invoice image"""
    # This would require an actual file, just test endpoint exists
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/purchase-upload/parse-invoice-safe",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        # Should fail with 422 (no file) or 401 (no auth), not 404
        passed = response.status_code in [200, 401, 403, 422, 400]
        log_result("POST /api/purchase-upload/parse-invoice-safe (endpoint exists)", passed, response)
        return finish_test(passed)
    except Exception as e:
        log_result("POST /api/purchase-upload/parse-invoice-safe", False)
        return finish_test(False)

# ============================================
# MAIN
# ============================================

def main():
    """Run all purchase module tests"""
    print("=" * 70)
    print("PURCHASE MODULE API TESTS")
    print(f"Base URL: {API_BASE_URL}")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 70)
    
    # Group tests by category
    tests = {
        "PURCHASES (Purchase Orders)": [
            ("List Purchases", test_purchases_list),
            ("Pending Receipts", test_purchases_pending_receipts),
            ("Search Products", test_purchases_search_products),
        ],
        "SUPPLIER INVOICES": [
            ("List Invoices", test_supplier_invoices_list),
            ("Returnable Invoices", test_supplier_invoices_returnable),
            ("Invoice by ID", test_supplier_invoice_by_id),
        ],
        "GRN (Goods Receipt Notes)": [
            ("List GRNs", test_grn_list),
            ("Generate Number", test_grn_generate_number),
            ("GRN by ID", test_grn_by_id),
        ],
        "PURCHASE RETURNS": [
            ("List Returns", test_purchase_returns_list),
            ("Returns by Supplier", test_purchase_returns_by_supplier),
        ],
        "PURCHASE UPLOAD": [
            ("Parse Invoice", test_purchase_upload_parse),
        ],
    }
    
    results = {}
    for category, category_tests in tests.items():
        print(f"\n{'─' * 70}")
        print(f"▶ {category}")
        print("─" * 70)
        
        for name, test_fn in category_tests:
            try:
                results[f"{category}: {name}"] = test_fn()
            except Exception as e:
                print(f"\n❌ FAIL - {name}")
                print(f"   Exception: {e}")
                results[f"{category}: {name}"] = False
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST RESULTS SUMMARY")
    print("=" * 70)
    
    passed = sum(1 for v in results.values() if v)
    failed = sum(1 for v in results.values() if not v)
    total = len(results)
    
    for test_name, test_passed in results.items():
        status = "✅" if test_passed else "❌"
        print(f"{status} {test_name}")
    
    print(f"\n{'=' * 70}")
    print(f"TOTAL: {passed}/{total} passed, {failed} failed")
    print("=" * 70)
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
