#!/usr/bin/env python3
"""
Comprehensive API Testing Script
Tests all endpoints from frontend to database
"""

import requests
import json
from datetime import datetime, timedelta
import random
import sys

# API Configuration
API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {"Content-Type": "application/json"}

# Test results tracking
test_results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "errors": []
}

def log_test(name, success, details=""):
    """Log test results"""
    test_results["total"] += 1
    if success:
        test_results["passed"] += 1
        print(f"✅ {name}: PASSED {details}")
    else:
        test_results["failed"] += 1
        test_results["errors"].append(f"{name}: {details}")
        print(f"❌ {name}: FAILED {details}")

def api_call(method, endpoint, data=None, params=None):
    """Make API call with error handling"""
    try:
        url = f"{API_BASE}{endpoint}"
        if method == "GET":
            response = requests.get(url, headers=HEADERS, params=params)
        elif method == "POST":
            response = requests.post(url, headers=HEADERS, json=data)
        elif method == "PUT":
            response = requests.put(url, headers=HEADERS, json=data)
        elif method == "DELETE":
            response = requests.delete(url, headers=HEADERS)
        else:
            return None, "Invalid method"
        
        return response, None
    except Exception as e:
        return None, str(e)

def test_customers_api():
    """Test Customer Management APIs"""
    print("\n🧪 Testing Customer APIs...")
    
    # Create customer
    customer_data = {
        "name": f"Test Customer {random.randint(1000, 9999)}",
        "phone": f"98765{random.randint(10000, 99999)}",
        "email": f"test{random.randint(100, 999)}@example.com",
        "address": "Test Address, City",
        "gst_number": "29ABCDE1234F1Z5",
        "credit_limit": 50000,
        "credit_days": 30,
        "billing_address": "Billing Address",
        "shipping_address": "Shipping Address"
    }
    
    response, error = api_call("POST", "/customers/", customer_data)
    if error or not response or response.status_code != 200:
        log_test("Create Customer", False, error or f"Status: {response.status_code if response else 'No response'}")
        return None
    
    customer_id = response.json().get("id") or response.json().get("customer_id")
    log_test("Create Customer", True, f"ID: {customer_id}")
    
    # Get customer
    response, error = api_call("GET", f"/customers/{customer_id}")
    log_test("Get Customer", not error and response and response.status_code == 200)
    
    # Update customer
    update_data = {"credit_limit": 75000}
    response, error = api_call("PUT", f"/customers/{customer_id}", update_data)
    log_test("Update Customer", not error and response and response.status_code == 200)
    
    # List customers
    response, error = api_call("GET", "/customers/", params={"limit": 10})
    log_test("List Customers", not error and response and response.status_code == 200)
    
    return customer_id

def test_suppliers_api():
    """Test Supplier Management APIs"""
    print("\n🧪 Testing Supplier APIs...")
    
    # Create supplier
    supplier_data = {
        "name": f"Test Supplier {random.randint(1000, 9999)}",
        "phone": f"87654{random.randint(10000, 99999)}",
        "email": f"supplier{random.randint(100, 999)}@example.com",
        "address": "Supplier Address, City",
        "gst_number": "29XYZAB1234F1Z6",
        "credit_limit": 100000,
        "credit_days": 45
    }
    
    response, error = api_call("POST", "/suppliers/", supplier_data)
    if error or not response or response.status_code != 200:
        log_test("Create Supplier", False, error or f"Status: {response.status_code if response else 'No response'}")
        return None
    
    supplier_id = response.json().get("id") or response.json().get("supplier_id")
    log_test("Create Supplier", True, f"ID: {supplier_id}")
    
    # Get supplier
    response, error = api_call("GET", f"/suppliers/{supplier_id}")
    log_test("Get Supplier", not error and response and response.status_code == 200)
    
    return supplier_id

def test_products_api():
    """Test Product Management APIs"""
    print("\n🧪 Testing Product APIs...")
    
    # Create product
    product_data = {
        "name": f"Test Product {random.randint(1000, 9999)}",
        "code": f"PROD{random.randint(10000, 99999)}",
        "category": "Medicine",
        "unit": "Box",
        "mrp": 100,
        "sale_price": 90,
        "purchase_price": 60,
        "gst_percent": 18,
        "hsn_code": "30049099",
        "min_stock": 10,
        "max_stock": 100,
        "current_stock": 50
    }
    
    response, error = api_call("POST", "/products/", product_data)
    if error or not response or response.status_code != 200:
        log_test("Create Product", False, error or f"Status: {response.status_code if response else 'No response'}")
        return None
    
    product_id = response.json().get("id") or response.json().get("product_id")
    log_test("Create Product", True, f"ID: {product_id}")
    
    # Get product
    response, error = api_call("GET", f"/products/{product_id}")
    log_test("Get Product", not error and response and response.status_code == 200)
    
    # List products
    response, error = api_call("GET", "/products/", params={"limit": 10})
    log_test("List Products", not error and response and response.status_code == 200)
    
    return product_id

def test_purchase_apis(supplier_id, product_id):
    """Test Purchase Management APIs"""
    print("\n🧪 Testing Purchase APIs...")
    
    if not supplier_id or not product_id:
        log_test("Purchase APIs", False, "Missing supplier or product ID")
        return None
    
    # Create purchase via purchase-enhanced endpoint
    purchase_data = {
        "supplier_id": supplier_id,
        "invoice_number": f"PUR-{datetime.now().strftime('%Y%m%d')}-{random.randint(1000, 9999)}",
        "invoice_date": datetime.now().strftime("%Y-%m-%d"),
        "items": [{
            "product_id": product_id,
            "batch_number": f"BATCH-{random.randint(1000, 9999)}",
            "quantity": 100,
            "rate": 60,
            "discount_percent": 10,
            "gst_percent": 18,
            "expiry_date": (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
        }],
        "payment_mode": "credit",
        "payment_status": "pending",
        "total_amount": 6372,  # (100 * 60 * 0.9 * 1.18)
        "notes": "Test purchase via API"
    }
    
    # Try purchase-enhanced endpoint
    response, error = api_call("POST", "/purchase-enhanced/", purchase_data)
    if error or not response or response.status_code != 200:
        log_test("Create Purchase", False, error or f"Status: {response.status_code if response else 'No response'}")
        return None
    
    purchase_id = response.json().get("id") or response.json().get("purchase_id")
    log_test("Create Purchase", True, f"ID: {purchase_id}")
    
    return purchase_id

def test_sales_apis(customer_id, product_id):
    """Test Sales APIs (Invoice, Order, Challan)"""
    print("\n🧪 Testing Sales APIs...")
    
    if not customer_id or not product_id:
        log_test("Sales APIs", False, "Missing customer or product ID")
        return None
    
    # Create sales order
    order_data = {
        "customer_id": customer_id,
        "order_date": datetime.now().strftime("%Y-%m-%d"),
        "items": [{
            "product_id": product_id,
            "quantity": 10,
            "rate": 90,
            "discount_percent": 5,
            "gst_percent": 18
        }],
        "status": "pending",
        "total_amount": 1010.7,  # (10 * 90 * 0.95 * 1.18)
        "notes": "Test order via API"
    }
    
    response, error = api_call("POST", "/orders/", order_data)
    if error or not response or response.status_code != 200:
        log_test("Create Sales Order", False, error or f"Status: {response.status_code if response else 'No response'}")
        order_id = None
    else:
        order_id = response.json().get("id") or response.json().get("order_id")
        log_test("Create Sales Order", True, f"ID: {order_id}")
    
    # Create invoice
    invoice_data = {
        "customer_id": customer_id,
        "invoice_date": datetime.now().strftime("%Y-%m-%d"),
        "due_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
        "items": [{
            "product_id": product_id,
            "batch_number": "BATCH-001",
            "quantity": 5,
            "rate": 90,
            "discount_percent": 5,
            "gst_percent": 18
        }],
        "payment_mode": "credit",
        "total_amount": 505.35,  # (5 * 90 * 0.95 * 1.18)
        "notes": "Test invoice via API"
    }
    
    response, error = api_call("POST", "/invoices/", invoice_data)
    if error or not response or response.status_code != 200:
        log_test("Create Invoice", False, error or f"Status: {response.status_code if response else 'No response'}")
        invoice_id = None
    else:
        invoice_id = response.json().get("id") or response.json().get("invoice_id")
        log_test("Create Invoice", True, f"ID: {invoice_id}")
    
    return {"order_id": order_id, "invoice_id": invoice_id}

def test_payment_apis(customer_id, invoice_id):
    """Test Payment APIs"""
    print("\n🧪 Testing Payment APIs...")
    
    if not customer_id:
        log_test("Payment APIs", False, "Missing customer ID")
        return None
    
    # Create payment
    payment_data = {
        "party_type": "customer",
        "party_id": customer_id,
        "payment_date": datetime.now().strftime("%Y-%m-%d"),
        "amount": 5000,
        "payment_mode": "bank_transfer",
        "reference_number": f"PAY-{random.randint(10000, 99999)}",
        "invoice_ids": [invoice_id] if invoice_id else [],
        "notes": "Test payment via API"
    }
    
    response, error = api_call("POST", "/payments/", payment_data)
    if error or not response or response.status_code != 200:
        log_test("Create Payment", False, error or f"Status: {response.status_code if response else 'No response'}")
        return None
    
    payment_id = response.json().get("id") or response.json().get("payment_id")
    log_test("Create Payment", True, f"ID: {payment_id}")
    
    # Get payment
    response, error = api_call("GET", f"/payments/{payment_id}")
    log_test("Get Payment", not error and response and response.status_code == 200)
    
    return payment_id

def test_stock_apis(product_id):
    """Test Stock Management APIs"""
    print("\n🧪 Testing Stock APIs...")
    
    if not product_id:
        log_test("Stock APIs", False, "Missing product ID")
        return None
    
    # Stock adjustment
    adjustment_data = {
        "adjustment_date": datetime.now().strftime("%Y-%m-%d"),
        "items": [{
            "product_id": product_id,
            "batch_number": "BATCH-ADJ-001",
            "adjustment_type": "increase",
            "quantity": 50,
            "reason": "Stock reconciliation"
        }],
        "notes": "Test stock adjustment via API"
    }
    
    response, error = api_call("POST", "/stock-adjustments/", adjustment_data)
    log_test("Stock Adjustment", not error and response and response.status_code == 200)
    
    # Stock movement
    movement_data = {
        "movement_date": datetime.now().strftime("%Y-%m-%d"),
        "movement_type": "transfer",
        "from_location": "Warehouse A",
        "to_location": "Warehouse B",
        "items": [{
            "product_id": product_id,
            "batch_number": "BATCH-001",
            "quantity": 25
        }],
        "notes": "Test stock movement via API"
    }
    
    response, error = api_call("POST", "/stock-movements/", movement_data)
    log_test("Stock Movement", not error and response and response.status_code == 200)
    
    # Get inventory
    response, error = api_call("GET", "/inventory/", params={"limit": 10})
    log_test("Get Inventory", not error and response and response.status_code == 200)

def test_returns_apis(invoice_id, purchase_id):
    """Test Returns APIs"""
    print("\n🧪 Testing Returns APIs...")
    
    # Sales return
    if invoice_id:
        sales_return_data = {
            "invoice_id": invoice_id,
            "return_date": datetime.now().strftime("%Y-%m-%d"),
            "items": [{
                "product_id": 1,
                "batch_number": "BATCH-001",
                "quantity": 2,
                "rate": 90,
                "reason": "Damaged product"
            }],
            "return_type": "credit_note",
            "notes": "Test sales return via API"
        }
        
        response, error = api_call("POST", "/sale-returns/", sales_return_data)
        log_test("Sales Return", not error and response and response.status_code == 200)
    
    # Purchase return
    if purchase_id:
        purchase_return_data = {
            "purchase_id": purchase_id,
            "return_date": datetime.now().strftime("%Y-%m-%d"),
            "items": [{
                "product_id": 1,
                "batch_number": "BATCH-001",
                "quantity": 5,
                "rate": 60,
                "reason": "Quality issue"
            }],
            "return_type": "debit_note",
            "notes": "Test purchase return via API"
        }
        
        response, error = api_call("POST", "/purchase-returns/", purchase_return_data)
        log_test("Purchase Return", not error and response and response.status_code == 200)

def test_ledger_apis(customer_id, supplier_id):
    """Test Ledger APIs"""
    print("\n🧪 Testing Ledger APIs...")
    
    # Customer ledger
    if customer_id:
        response, error = api_call("GET", f"/party-ledger/customer/{customer_id}")
        log_test("Customer Ledger", not error and response and response.status_code == 200)
        
        # Outstanding bills
        response, error = api_call("GET", "/party-ledger/outstanding", 
                                 params={"party_type": "customer", "party_id": customer_id})
        log_test("Customer Outstanding", not error and response and response.status_code == 200)
    
    # Supplier ledger
    if supplier_id:
        response, error = api_call("GET", f"/party-ledger/supplier/{supplier_id}")
        log_test("Supplier Ledger", not error and response and response.status_code == 200)

def test_credit_debit_notes(customer_id, supplier_id):
    """Test Credit/Debit Notes APIs"""
    print("\n🧪 Testing Credit/Debit Notes APIs...")
    
    # Credit note
    if customer_id:
        credit_note_data = {
            "customer_id": customer_id,
            "credit_date": datetime.now().strftime("%Y-%m-%d"),
            "amount": 500,
            "reason": "Quality issue compensation",
            "notes": "Test credit note via API"
        }
        
        response, error = api_call("POST", "/credit-debit-notes/credit", credit_note_data)
        log_test("Credit Note", not error and response and response.status_code == 200)
    
    # Debit note
    if supplier_id:
        debit_note_data = {
            "supplier_id": supplier_id,
            "debit_date": datetime.now().strftime("%Y-%m-%d"),
            "amount": 300,
            "reason": "Pricing adjustment",
            "notes": "Test debit note via API"
        }
        
        response, error = api_call("POST", "/credit-debit-notes/debit", debit_note_data)
        log_test("Debit Note", not error and response and response.status_code == 200)

def main():
    """Run all API tests"""
    print("=" * 60)
    print("🚀 COMPREHENSIVE API TESTING")
    print("=" * 60)
    print(f"API Base: {API_BASE}")
    print(f"Started: {datetime.now()}")
    print("=" * 60)
    
    # Test Master Data APIs
    customer_id = test_customers_api()
    supplier_id = test_suppliers_api()
    product_id = test_products_api()
    
    # Test Transaction APIs
    purchase_id = test_purchase_apis(supplier_id, product_id)
    sales_result = test_sales_apis(customer_id, product_id)
    invoice_id = sales_result["invoice_id"] if sales_result else None
    
    # Test Payment APIs
    payment_id = test_payment_apis(customer_id, invoice_id)
    
    # Test Stock APIs
    test_stock_apis(product_id)
    
    # Test Returns APIs
    test_returns_apis(invoice_id, purchase_id)
    
    # Test Ledger APIs
    test_ledger_apis(customer_id, supplier_id)
    
    # Test Credit/Debit Notes
    test_credit_debit_notes(customer_id, supplier_id)
    
    # Print summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    print(f"Total Tests: {test_results['total']}")
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    print(f"Success Rate: {(test_results['passed']/test_results['total']*100):.1f}%")
    
    if test_results["errors"]:
        print("\n❌ FAILED TESTS:")
        for error in test_results["errors"]:
            print(f"  - {error}")
    
    print("\n" + "=" * 60)
    print(f"Completed: {datetime.now()}")
    print("=" * 60)
    
    # Exit with appropriate code
    sys.exit(0 if test_results["failed"] == 0 else 1)

if __name__ == "__main__":
    main()