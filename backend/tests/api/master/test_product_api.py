#!/usr/bin/env python3
"""
Product API Test - Tests product creation, batches, and listing
Run: API_BASE_URL="http://localhost:8000" python backend/tests/api/test_product_api.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
      No auth token needed when TEST_MODE is enabled.
"""
import os
import sys
import json
import requests
import pytest
from datetime import date, timedelta
import random
import string

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def generate_random_sku():
    """Generate random SKU code"""
    return f"TST-{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}"


def generate_random_barcode():
    """Generate random 13-digit barcode (EAN-13 format)"""
    return ''.join(random.choices(string.digits, k=13))


def create_test_product_payload():
    """Create a test product payload with all fields"""
    sku = generate_random_sku()
    
    payload = {
        # Required fields
        "product_name": f"API Test Product {sku[-4:]}",
        "sku": sku,
        "category_id": 1,  # Use existing category
        
        # Identifiers
        "barcode": generate_random_barcode(),
        "hsn_code": random.choice(["30049099", "30042090", "30049099", "21069099"]),
        
        # Manufacturer
        "manufacturer_id": 1,  # Use existing manufacturer
        "brand_name": "Test Brand",
        
        # Packaging
        "pack_type": random.choice(["box", "strip", "bottle", "tube"]),
        "units_per_pack": random.choice([10, 20, 30, 50, 100]),
        "packages_per_box": random.choice([10, 20, 50, 100]),
        
        # Pricing
        "mrp": round(random.uniform(50, 500), 2),
        "sale_price": round(random.uniform(40, 450), 2),
        "cost_price": round(random.uniform(30, 400), 2),
        "ptr": round(random.uniform(35, 420), 2),  # Price to retailer
        "pts": round(random.uniform(32, 400), 2),  # Price to stockist
        
        # Tax
        "gst_percent": random.choice([5, 12, 18]),
        
        # Stock
        "min_stock_level": random.randint(10, 50),
        "max_stock_level": random.randint(100, 500),
        "reorder_level": random.randint(20, 80),
        
        # Drug info (pharma specific)
        "is_prescription_required": random.choice([True, False]),
        "schedule_type": random.choice(["H", "H1", "X", None]),
        "drug_type": random.choice(["tablet", "capsule", "syrup", "injection", "cream"]),
        "generic_name": f"Generic Test {sku[-4:]}",
        "composition": "Test Active Ingredient 500mg",
        
        # Storage
        "storage_conditions": random.choice(["Store in cool dry place", "Refrigerate 2-8°C", "Protect from light"]),
        
        # Status
        "is_active": True,
        "is_saleable": True,
        "is_purchasable": True,
        
        # Notes
        "description": f"API Test Product - Auto Created - {sku}",
        "internal_notes": "Created by API test script"
    }
    
    return payload


def create_test_batch_payload(product_id):
    """Create a test batch payload with all fields"""
    batch_number = f"B{date.today().strftime('%Y%m%d')}{random.randint(100, 999)}"
    
    payload = {
        "product_id": product_id,
        "batch_number": batch_number,
        "manufacturing_date": str(date.today() - timedelta(days=random.randint(30, 180))),
        "expiry_date": str(date.today() + timedelta(days=random.randint(365, 730))),
        "quantity": random.randint(100, 1000),
        "mrp_per_unit": round(random.uniform(50, 500), 2),
        "sale_price_per_unit": round(random.uniform(40, 450), 2),
        "cost_per_unit": round(random.uniform(30, 400), 2),
        "batch_status": "active",
        "quality_status": "approved",
        "notes": "API Test Batch - Auto Created"
    }
    
    return payload


def test_list_products():
    """Test listing products with search"""
    print("\n" + "=" * 70)
    print("TEST 1: LIST/SEARCH PRODUCTS")
    print("=" * 70)
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/products/?search=test&limit=5",
            headers=headers,
            timeout=30
        )
        
        print(f"\nResponse status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ API Error: {response.text}")
            return False
        
        result = response.json()
        
        # Handle both list and dict response formats
        if isinstance(result, list):
            products = result
            total = len(result)
        else:
            products = result.get('products', [])
            total = result.get('total', len(products))
        
        print(f"✅ Products retrieved successfully!")
        print(f"   Total: {total}")
        
        for p in products[:3]:  # Show first 3
            print(f"\n   Product: {p.get('product_name')}")
            print(f"     SKU: {p.get('sku')}")
            print(f"     MRP: ₹{p.get('mrp')}")
        
        return True
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False


def get_any_product_id():
    """Get any product ID for standalone pytest execution."""
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.get(f"{API_BASE_URL}/api/products/?limit=1", headers=headers, timeout=30)
        if response.status_code != 200:
            return None
        result = response.json()
        products = result if isinstance(result, list) else result.get("products") or result.get("data", [])
        if products:
            return products[0].get("product_id") or products[0].get("id")
    except requests.RequestException:
        return None
    return None


def test_get_product(product_id=None):
    """Test getting product details"""
    if product_id is None:
        product_id = get_any_product_id()
    if product_id is None:
        pytest.skip("No product available for product detail test")

    print("\n" + "=" * 70)
    print("TEST 2: GET PRODUCT DETAILS")
    print("=" * 70)
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/products/{product_id}",
            headers=headers,
            timeout=30
        )
        
        print(f"\nResponse status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ API Error: {response.text}")
            return None
        
        result = response.json()
        
        print(f"✅ Product retrieved successfully!")
        print(f"   Product ID: {result.get('product_id')}")
        print(f"   Name: {result.get('product_name')}")
        print(f"   SKU: {result.get('sku')}")
        print(f"   MRP: ₹{result.get('mrp')}")
        print(f"   GST: {result.get('gst_percent')}%")
        print(f"   Category: {result.get('category_name')}")
        
        return result
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return None


def test_get_product_batches(product_id=None):
    """Test getting batches for a product"""
    if product_id is None:
        product_id = get_any_product_id()
    if product_id is None:
        pytest.skip("No product available for product batch test")

    print("\n" + "=" * 70)
    print("TEST 3: GET PRODUCT BATCHES")
    print("=" * 70)
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/products/{product_id}/batches",
            headers=headers,
            timeout=30
        )
        
        print(f"\nResponse status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ API Error: {response.text}")
            return False
        
        result = response.json()
        batches = result.get('batches', [])
        
        print(f"✅ Batches retrieved successfully!")
        print(f"   Product ID: {result.get('product_id')}")
        print(f"   Total Batches: {result.get('total_batches', len(batches))}")
        
        for b in batches[:3]:  # Show first 3
            print(f"\n   Batch: {b.get('batch_number')}")
            print(f"     Qty Available: {b.get('quantity_available')}")
            print(f"     Expiry: {b.get('expiry_date')}")
            print(f"     MRP: ₹{b.get('mrp_per_unit')}")
        
        return True
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False


def test_search_products_with_batches():
    """Test searching products with embedded batches"""
    print("\n" + "=" * 70)
    print("TEST 4: SEARCH PRODUCTS WITH BATCHES")
    print("=" * 70)
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/products/search-with-batches?search=para&limit=3",
            headers=headers,
            timeout=30
        )
        
        print(f"\nResponse status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ API Error: {response.text}")
            return False
        
        result = response.json()
        products = result.get('products', [])
        
        print(f"✅ Products with batches retrieved!")
        print(f"   Total: {result.get('total', len(products))}")
        
        for p in products[:2]:  # Show first 2
            batches = p.get('batches', [])
            print(f"\n   Product: {p.get('product_name')}")
            print(f"     Batches: {len(batches)}")
            for b in batches[:2]:
                print(f"       - {b.get('batch_number')}: Qty {b.get('quantity_available')}")
        
        return True
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False


def print_verification_queries(product_id):
    """Print SQL queries for manual verification"""
    print("\n" + "=" * 70)
    print("VERIFICATION QUERIES")
    print("=" * 70)
    
    print("\n-- Verify product in database:")
    print(f"""
SELECT 
    product_id,
    sku,
    product_name,
    mrp,
    gst_percent,
    is_active,
    created_at
FROM master.products
WHERE product_id = {product_id};
""")
    
    print("\n-- Verify batches for product:")
    print(f"""
SELECT 
    batch_id,
    product_id,
    batch_number,
    quantity_available,
    mrp_per_unit,
    expiry_date,
    batch_status,
    quality_status
FROM inventory.batches
WHERE product_id = {product_id}
ORDER BY expiry_date DESC;
""")


def main():
    """Run all product API tests"""
    print("\n" + "=" * 70)
    print("PRODUCT API TEST SUITE (TEST_MODE)")
    print("=" * 70)
    
    print(f"\nAPI URL: {API_BASE_URL}")
    print("Auth: TEST_MODE bypass (no token needed)")
    
    # Use existing product for testing
    test_product_id = 122  # Existing product ID
    
    # Track test results
    results = {
        "list_products": False,
        "get_product": False,
        "get_batches": False,
        "search_with_batches": False
    }
    
    # Test 1: List products
    results["list_products"] = test_list_products()
    
    # Test 2: Get product details
    product = test_get_product(test_product_id)
    results["get_product"] = product is not None
    
    # Test 3: Get product batches
    results["get_batches"] = test_get_product_batches(test_product_id)
    
    # Test 4: Search with batches
    results["search_with_batches"] = test_search_products_with_batches()
    
    # Print verification queries
    print_verification_queries(test_product_id)
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    
    passed = sum(results.values())
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = "✅ PASS" if passed_test else "❌ FAIL"
        print(f"  {test_name}: {status}")
    
    print(f"\n  Total: {passed}/{total} tests passed")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
