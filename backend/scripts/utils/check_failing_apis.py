#!/usr/bin/env python3
"""Check all APIs and show detailed errors"""
import requests
import json

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("Checking ALL APIs for failures...")
print("=" * 60)

# Test all major endpoints
tests = [
    ("GET", "/stock-movements?limit=1", "Stock Movements"),
    ("GET", "/dashboard/kpis", "Dashboard KPIs"),
    ("GET", "/dashboard/inventory-summary", "Dashboard Inventory"),
    ("GET", "/dashboard/top-products", "Dashboard Top Products"),
    ("GET", "/dashboard/pending-payments", "Dashboard Payments"),
    ("GET", "/purchases?limit=1", "Purchases List"),
    ("GET", "/payments/summary", "Payments Summary"),
    ("GET", "/payments/outstanding", "Payments Outstanding"),
    ("GET", "/inventory/stock/current", "Inventory Stock"),
    ("GET", "/inventory/batches?limit=1", "Inventory Batches"),
    ("GET", "/orders?limit=1", "Orders"),
    ("GET", "/invoices?limit=1", "Invoices"),
    ("GET", "/customers?limit=1", "Customers"),
    ("GET", "/suppliers?limit=1", "Suppliers"),
    ("GET", "/products/search?query=test", "Products Search"),
]

failed = []
working = []

for method, endpoint, name in tests:
    try:
        url = f"{BASE_URL}{endpoint}"
        response = requests.get(url, timeout=5)
        
        if response.status_code == 200:
            working.append(name)
            print(f"✅ {name:<25} - Working")
        else:
            failed.append((name, response.status_code, response.text[:200]))
            print(f"❌ {name:<25} - Error {response.status_code}")
            if response.status_code == 500:
                # Try to extract error message
                try:
                    error_detail = response.json().get('detail', response.text[:200])
                except:
                    error_detail = response.text[:200]
                print(f"   Details: {error_detail}")
    except Exception as e:
        failed.append((name, 0, str(e)))
        print(f"❌ {name:<25} - Connection Error: {str(e)[:100]}")

print("\n" + "=" * 60)
print(f"Summary: {len(working)} working, {len(failed)} failed")

if failed:
    print("\nFailed APIs:")
    for name, code, error in failed:
        print(f"  - {name}: {code} - {error[:100]}...")