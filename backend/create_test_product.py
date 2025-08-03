#!/usr/bin/env python3
"""
Test product creation with batch creation
"""
import requests
import json

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app"

print("\n🧪 TESTING PRODUCT CREATION WITH BATCH")
print("="*50)

# Test product data with MRP
test_product = {
    "product_name": "Test Batch Product",
    "manufacturer": "Test Pharma",
    "product_type": "Medicine",
    "mrp": 150.0,  # This should trigger batch creation
    "sale_price": 120.0,
    "generic_name": "Test Generic",
    "category": "Testing"
}

try:
    print("🔄 Creating product with MRP ₹150...")
    print(f"Product data: {json.dumps(test_product, indent=2)}")
    
    response = requests.post(
        f"{API_BASE_URL}/products/",
        json=test_product,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 201:
        product_data = response.json()
        product_id = product_data.get("product_id")
        print(f"✅ Product created successfully! ID: {product_id}")
        
        # Now check if batches were created for this product
        print(f"\n🔍 Checking batches for product {product_id}...")
        batch_response = requests.get(f"{API_BASE_URL}/inventory/batches?product_id={product_id}")
        
        print(f"Batch API Status: {batch_response.status_code}")
        print(f"Batch Response: {batch_response.text}")
        
        if batch_response.status_code == 200:
            batches = batch_response.json()
            if batches and len(batches) > 0:
                print(f"✅ Found {len(batches)} batch(es) for the product!")
                for batch in batches:
                    print(f"  - Batch: {batch.get('batch_number')} | MRP: ₹{batch.get('mrp_per_unit')} | Qty: {batch.get('quantity_available')}")
            else:
                print("❌ No batches found for the product")
        else:
            print(f"❌ Failed to fetch batches: {batch_response.text}")
    else:
        print(f"❌ Failed to create product: {response.text}")
        
except Exception as e:
    print(f"❌ Error: {e}")

print("\n🏁 Test completed!")