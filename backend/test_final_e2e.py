#!/usr/bin/env python3
"""
Final End-to-End Test: Complete Product → Batch → Invoice Flow
"""
import requests
import json
import time

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

def test_e2e_flow():
    print("🚀 FINAL END-TO-END TEST")
    print("="*60)
    
    # Wait for deployment
    print("⏳ Waiting 15 seconds for Railway deployment...")
    time.sleep(15)
    
    # Step 1: Create product with explicit MRP
    print("\n📦 STEP 1: Creating product with MRP...")
    product_data = {
        "product_name": "Final Test Medicine",
        "manufacturer": "Test Pharma Ltd",
        "product_type": "Medicine",
        "generic_name": "Test API Final",
        "brand": "Final Brand",
        "hsn_code": "3004",
        "gst_percentage": 12.0,
        "mrp": 300.0,
        "sale_price": 250.0,
        "maintain_batch": True,
        "maintain_expiry": True
    }
    
    product_response = requests.post(f"{API_BASE_URL}/products/", json=product_data, timeout=30)
    print(f"Status: {product_response.status_code}")
    
    if product_response.status_code != 201:
        print(f"❌ Product creation failed: {product_response.text}")
        return False
    
    product = product_response.json()
    product_id = product['product_id']
    print(f"✅ Product created: {product['product_code']} (ID: {product_id})")
    
    # Step 2: Check if real batch was created
    print(f"\n📋 STEP 2: Checking batches for product {product_id}...")
    batch_response = requests.get(f"{API_BASE_URL}/inventory/batches?product_id={product_id}", timeout=30)
    print(f"Status: {batch_response.status_code}")
    print(f"Response: {batch_response.text}")
    
    if batch_response.status_code != 200:
        print(f"❌ Batch fetch failed")
        return False
    
    batch_data = batch_response.json()
    batches = batch_data.get('batches', [])
    
    if not batches or len(batches) == 0:
        print(f"❌ No batches found")
        return False
    
    batch = batches[0]
    batch_number = batch.get('batch_number', '')
    batch_mrp = batch.get('mrp', 0)
    
    # Check if it's real or fallback
    if batch_number == 'DEFAULT' or 'default_' in str(batch.get('batch_id', '')):
        print(f"❌ Still getting fallback batch: {batch_number}")
        return False
    
    print(f"✅ Real batch found: {batch_number} | MRP: ₹{batch_mrp}")
    
    # Step 3: Verify product current_mrp was updated
    print(f"\n💰 STEP 3: Checking product current_mrp...")
    product_response = requests.get(f"{API_BASE_URL}/products/{product_id}", timeout=30)
    
    if product_response.status_code == 200:
        updated_product = product_response.json()
        current_mrp = float(updated_product.get('current_mrp', 0))
        print(f"Product current_mrp: ₹{current_mrp}")
        
        if current_mrp > 0:
            print(f"✅ Product MRP properly updated")
        else:
            print(f"❌ Product MRP still 0")
            return False
    else:
        print(f"❌ Could not fetch product details")
        return False
    
    # Step 4: Test invoice creation
    print(f"\n🧾 STEP 4: Testing invoice creation...")
    
    # Get customers
    customers_response = requests.get(f"{API_BASE_URL}/customers/", timeout=30)
    if customers_response.status_code != 200:
        print(f"❌ Could not fetch customers")
        return False
    
    customers = customers_response.json()
    if not customers:
        print(f"❌ No customers found")
        return False
    
    customer = customers[0]
    
    invoice_data = {
        "customer_id": customer['customer_id'],
        "invoice_date": "2025-08-03",
        "due_date": "2025-09-02",
        "payment_terms": "Net 30",
        "items": [
            {
                "product_id": product_id,
                "quantity": 2,
                "unit_price": 250.0,
                "discount_percentage": 0,
                "gst_percentage": 12.0
            }
        ],
        "notes": "Final E2E Test Invoice"
    }
    
    invoice_response = requests.post(f"{API_BASE_URL}/sales/invoices/", json=invoice_data, timeout=30)
    print(f"Status: {invoice_response.status_code}")
    
    if invoice_response.status_code == 201:
        invoice = invoice_response.json()
        print(f"✅ Invoice created: {invoice.get('invoice_number')}")
    else:
        print(f"❌ Invoice creation failed: {invoice_response.text}")
        return False
    
    # Step 5: Final verification - check that frontend batch API works
    print(f"\n🌐 STEP 5: Testing frontend batch API...")
    frontend_batch_response = requests.get(f"{API_BASE_URL}/inventory/batches?product_id={product_id}", timeout=30)
    
    if frontend_batch_response.status_code == 200:
        frontend_data = frontend_batch_response.json()
        frontend_batches = frontend_data.get('batches', [])
        
        if frontend_batches and len(frontend_batches) > 0:
            fb = frontend_batches[0]
            if fb.get('batch_number') != 'DEFAULT':
                print(f"✅ Frontend batch API returns real batch: {fb.get('batch_number')}")
            else:
                print(f"❌ Frontend still returns fallback batch")
                return False
        else:
            print(f"❌ Frontend returns no batches")
            return False
    else:
        print(f"❌ Frontend batch API failed")
        return False
    
    print(f"\n{'='*60}")
    print("🎉 ALL TESTS PASSED!")
    print("✅ Product creation works")
    print("✅ Real batch creation works") 
    print("✅ Product MRP updates correctly")
    print("✅ Invoice creation works")
    print("✅ Frontend batch API returns real data")
    print("✅ End-to-end flow is completely functional!")
    print(f"{'='*60}")
    return True

if __name__ == "__main__":
    success = test_e2e_flow()
    if not success:
        print("\n❌ END-TO-END TEST FAILED")
        exit(1)
    else:
        print("\n✅ END-TO-END TEST SUCCESSFUL")