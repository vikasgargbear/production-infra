#!/usr/bin/env python3
"""Comprehensive API testing script"""
import requests
import json
from datetime import datetime, date

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api/v1"
ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

def test_api(method, endpoint, data=None, description=""):
    """Test an API endpoint and return the result"""
    print(f"\n{'='*60}")
    print(f"Testing: {description or endpoint}")
    print(f"Method: {method} {endpoint}")
    
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            print(f"Data: {json.dumps(data, indent=2)}")
            response = requests.post(url, json=data, headers=headers)
        elif method == "PUT":
            response = requests.put(url, json=data, headers=headers)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers)
        else:
            print(f"Unknown method: {method}")
            return None
        
        print(f"Status: {response.status_code}")
        
        if response.status_code < 300:
            print("✅ SUCCESS")
            if response.text:
                print(f"Response: {json.dumps(response.json(), indent=2)[:500]}...")
        else:
            print("❌ FAILED")
            print(f"Error: {response.text[:500]}...")
        
        return response
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")
        return None

def run_tests():
    """Run comprehensive API tests"""
    
    print("🚀 Starting Comprehensive API Tests")
    print(f"Base URL: {BASE_URL}")
    print(f"Org ID: {ORG_ID}")
    
    # Test 1: Health Check
    test_api("GET", "/../health", description="Health Check")
    
    # Test 2: Product Search
    test_api("GET", "/products/search?q=para&limit=2", description="Product Search")
    
    # Test 3: Customer List
    test_api("GET", "/customers?limit=2", description="Customer List")
    
    # Test 4: Create Customer
    customer_data = {
        "org_id": ORG_ID,
        "customer_name": f"Test Customer {datetime.now().strftime('%Y%m%d%H%M%S')}",
        "phone": "9876543210",
        "email": "test@example.com",
        "customer_type": "retail",
        "gstin": "27AABCU9603R1ZM",
        "credit_limit": 50000,
        "credit_days": 30
    }
    customer_response = test_api("POST", "/customers/", customer_data, description="Create Customer")
    
    # Test 5: Get specific customer
    if customer_response and customer_response.status_code == 200:
        customer_id = customer_response.json().get("customer_id")
        test_api("GET", f"/customers/{customer_id}", description="Get Specific Customer")
    
    # Test 6: Create Order (with existing customer)
    order_data = {
        "org_id": ORG_ID,
        "customer_id": 1,  # Assuming customer 1 exists
        "order_date": date.today().isoformat(),
        "delivery_date": date.today().isoformat(),
        "order_type": "sales",
        "payment_terms": "credit",
        "items": [
            {
                "product_id": 1,
                "quantity": 10,
                "unit_price": 100.00,
                "discount_percent": 5,
                "discount_amount": 5.00,
                "tax_percent": 12,
                "tax_amount": 11.40,
                "line_total": 106.40
            }
        ]
    }
    test_api("POST", "/orders/", order_data, description="Create Order")
    
    # Test 7: List Orders
    test_api("GET", "/orders?limit=2", description="List Orders")
    
    # Test 8: List Invoices
    test_api("GET", "/invoices/?limit=2", description="List Invoices")
    
    # Test 9: Dashboard Stats
    test_api("GET", "/dashboard/stats", description="Dashboard Stats")
    
    # Test 10: Stock Check
    test_api("GET", "/stock/current?limit=2", description="Current Stock")
    
    # Test 11: Suppliers List
    test_api("GET", "/suppliers?limit=2", description="Suppliers List")
    
    # Test 12: Payments Outstanding
    test_api("GET", "/payments/outstanding?limit=2", description="Outstanding Payments")
    
    print("\n" + "="*60)
    print("✅ API Testing Complete!")

if __name__ == "__main__":
    run_tests()