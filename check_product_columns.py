#!/usr/bin/env python3
"""
Check actual column names in inventory.products table
"""

import requests
import json

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"

print("\n🔍 Checking product table columns...")

# Get a product to see its structure
response = requests.get(f"{API_BASE}/products", params={"limit": 1})

if response.status_code == 200:
    data = response.json()
    products = data.get('products', [])
    if products:
        product = products[0]
        print("\n📊 Product fields available:")
        for key, value in product.items():
            print(f"   {key}: {value} ({type(value).__name__})")
        
        # Check for GST field
        if 'gst_percentage' in product:
            print("\n✅ gst_percentage field exists")
        elif 'gst_percent' in product:
            print("\n✅ gst_percent field exists (not gst_percentage)")
        elif 'gst_rate' in product:
            print("\n✅ gst_rate field exists")
        else:
            print("\n❌ No GST field found in product")
            
# Also check batches
print("\n🔍 Checking batch table columns...")
response = requests.get(f"{API_BASE}/inventory/batches", params={"limit": 1})

if response.status_code == 200:
    data = response.json()
    batches = data.get('batches', [])
    if batches:
        batch = batches[0]
        print("\n📊 Batch fields available:")
        for key, value in batch.items():
            if 'gst' in key.lower() or 'tax' in key.lower() or 'price' in key.lower():
                print(f"   {key}: {value}")