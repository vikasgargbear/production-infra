#!/usr/bin/env python3
"""Quick API verification script"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

def test_api(method, endpoint, name, data=None):
    """Test a single API endpoint"""
    try:
        url = f"{BASE_URL}{endpoint}"
        if method == "GET":
            response = requests.get(url)
        else:
            response = requests.post(url, json=data)
        
        if response.status_code == 200:
            return f"✅ {name}"
        else:
            return f"❌ {name} - {response.status_code}"
    except Exception as e:
        return f"❌ {name} - Error: {str(e)[:50]}"

print("API Status Check")
print("=" * 50)

# Critical APIs to test
tests = [
    ("GET", "/dashboard/kpis", "Dashboard KPIs"),
    ("GET", "/stock-movements?limit=1", "Stock Movements"),
    ("GET", "/purchases?limit=1", "Purchases"),
    ("GET", "/payments/outstanding", "Payments"),
    ("GET", "/inventory/stock/current", "Inventory"),
    ("GET", "/orders?limit=1", "Orders"),
    ("GET", "/invoices?limit=1", "Invoices"),
]

for method, endpoint, name, *data in tests:
    result = test_api(method, endpoint, name, data[0] if data else None)
    print(result)

print("=" * 50)