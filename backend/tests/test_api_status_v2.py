"""
Test all APIs after fixes
"""
import requests
import json

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {"Content-Type": "application/json"}

print("Testing Fixed APIs...")
print("=" * 60)

tests = [
    # Core APIs
    ("GET", "/invoices?limit=1", "Invoices"),
    ("GET", "/products/search?query=test", "Products Search"),
    ("GET", "/customers?limit=1", "Customers"),
    ("GET", "/orders?limit=1", "Orders"),
    
    # Fixed APIs
    ("GET", "/sale-returns?limit=1", "Sales Returns"),
    ("GET", "/stock-movements?limit=1", "Stock Movements"),
    ("GET", "/party-ledger/balance/13?party_type=customer", "Party Ledger"),
    ("GET", "/delivery-challan?limit=1", "Delivery Challan"),
    ("GET", "/inventory/batches?limit=1", "Inventory Batches"),
    ("GET", "/inventory/stock/current", "Inventory Stock"),
    ("GET", "/inventory/dashboard", "Inventory Dashboard"),
    
    # Purchase API
    ("GET", "/purchases?limit=1", "Purchases"),
    ("POST", "/purchases-enhanced/with-items", "Purchase Create", {
        "supplier_id": 1,
        "items": [{"product_id": 1, "quantity": 10, "rate": 100}]
    }),
    
    # Payments API
    ("GET", "/payments/summary", "Payments Summary"),
    ("GET", "/payments/outstanding", "Payments Outstanding"),
    ("POST", "/payments", "Payment Create", {
        "customer_id": 13,
        "payment_type": "advance_payment",
        "amount": 100,
        "payment_mode": "cash"
    }),
]

working = 0
errors = 0

for test in tests:
    method = test[0]
    endpoint = test[1]
    name = test[2]
    data = test[3] if len(test) > 3 else None
    
    try:
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}", headers=HEADERS, timeout=10)
        else:
            response = requests.post(f"{BASE_URL}{endpoint}", json=data, headers=HEADERS, timeout=10)
        
        if response.status_code == 200:
            print(f"✅ {name:<25} - Working")
            working += 1
        elif response.status_code == 404:
            print(f"❌ {name:<25} - Not Found (404)")
            errors += 1
        elif response.status_code == 500:
            error_detail = response.json().get('detail', 'Unknown error')[:100]
            print(f"⚠️  {name:<25} - Error 500: {error_detail}")
            errors += 1
        else:
            print(f"❓ {name:<25} - Status {response.status_code}")
            errors += 1
    except Exception as e:
        print(f"💥 {name:<25} - Exception: {str(e)[:50]}")
        errors += 1

print("=" * 60)
print(f"Summary: {working} working, {errors} with issues")
print("=" * 60)