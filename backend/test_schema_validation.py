#!/usr/bin/env python3
"""Test schema validation by creating minimal records"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("🧪 SCHEMA VALIDATION TESTS")
print("=" * 50)

# Test 1: Minimal delivery challan (order) creation
print("\n📋 1. TESTING MINIMAL DELIVERY CHALLAN")
print("-" * 40)

minimal_challan = {
    "customer_id": 32,
    "order_date": "2024-01-15",
    "order_type": "delivery"
}

print("Attempting minimal delivery challan creation...")
r = requests.post(f"{BASE_URL}/delivery-challan/", json=minimal_challan)
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:500]}")

# Test 2: Check what the working orders API creates
print("\n📋 2. TESTING WORKING ORDERS API FOR COMPARISON")
print("-" * 40)

working_order = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 32,
    "order_date": "2024-01-15",
    "order_type": "sales",
    "items": [
        {
            "product_id": 50,
            "quantity": 1,
            "unit_price": 10
        }
    ]
}

print("Attempting working orders API...")
r = requests.post(f"{BASE_URL}/orders/", json=working_order)
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:500]}")

# Test 3: Check stock movements with correct product table
print("\n📦 3. TESTING STOCK MOVEMENT")
print("-" * 40)

stock_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "product_id": 59,  # Use a product we know exists
    "quantity": 10,
    "movement_date": "2024-01-15",
    "reason": "Test receipt"
}

print("Attempting stock movement...")
r = requests.post(f"{BASE_URL}/stock-movements/receive", json=stock_data)
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:500]}")

print("\n" + "=" * 50)