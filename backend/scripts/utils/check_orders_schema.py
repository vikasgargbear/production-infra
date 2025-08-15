#!/usr/bin/env python3
"""Check actual orders table schema"""
import requests
import json

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("🔍 CHECKING ACTUAL DATABASE SCHEMA")
print("=" * 60)

# Use the test DB endpoint to check schema
try:
    print("\n📋 ORDERS TABLE SCHEMA")
    print("-" * 30)
    
    # Try to get orders first to see what structure is returned
    r = requests.get(f"{BASE_URL}/orders/", params={"limit": 1})
    print(f"Orders GET Status: {r.status_code}")
    
    if r.status_code == 200:
        orders = r.json()
        if orders:
            print("Sample order structure:")
            sample_order = orders[0] if isinstance(orders, list) else orders
            for key, value in sample_order.items():
                print(f"  {key}: {type(value).__name__}")
    
    # Check what's in a working order creation to see required fields
    print(f"\nOrders response: {r.text[:500]}")
    
except Exception as e:
    print(f"Error checking orders: {e}")

try:
    print("\n📦 PRODUCTS TABLE LOCATION")
    print("-" * 30)
    
    # Check products API to see table reference
    r = requests.get(f"{BASE_URL}/products/", params={"limit": 1})
    print(f"Products GET Status: {r.status_code}")
    
    if r.status_code == 200:
        products = r.json()
        print("Products API works - checking table location...")
        print(f"Products response: {r.text[:300]}")
    
except Exception as e:
    print(f"Error checking products: {e}")

print("\n" + "=" * 60)