#\!/usr/bin/env python3
"""Insert some test products to enable order creation"""
import requests
import json

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("Inserting test products...")
print("=" * 60)

test_products = [
    {
        "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
        "product_code": "PARA500",
        "product_name": "Paracetamol 500mg",
        "generic_name": "Paracetamol",
        "brand": "Generic",
        "manufacturer": "Test Pharma",
        "product_type": "tablet",
        "product_class": "medicine",
        "hsn_code": "30049099",
        "gst_percentage": 12,
        "maintain_batch": True,
        "maintain_expiry": True,
        "is_active": True,
        "is_saleable": True,
        "is_purchasable": True,
        "pack_config": {"base_uom": "tablet", "base_units_per_pack": 10, "pack_type": "strip"}
    },
    {
        "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
        "product_code": "AMOX500",
        "product_name": "Amoxicillin 500mg",
        "generic_name": "Amoxicillin",
        "brand": "Generic",
        "manufacturer": "Test Pharma",
        "product_type": "capsule",
        "product_class": "medicine",
        "hsn_code": "30041011",
        "gst_percentage": 12,
        "requires_prescription": True,
        "maintain_batch": True,
        "maintain_expiry": True,
        "is_active": True,
        "is_saleable": True,
        "is_purchasable": True,
        "pack_config": {"base_uom": "capsule", "base_units_per_pack": 10, "pack_type": "strip"}
    }
]

for i, product in enumerate(test_products, 1):
    print(f"\n{i}. Creating product: {product['product_name']}")
    r = requests.post(f"{BASE_URL}/products/", json=product)
    print(f"Status: {r.status_code}")
    if r.status_code in [200, 201]:
        print("✅ SUCCESS")
        result = r.json()
        print(f"Product ID: {result.get('product_id', 'N/A')}")
    else:
        print("❌ FAILED")
        print(f"Error: {r.text[:200]}")

print("\n" + "=" * 60)
print("Now testing if products API works...")
r = requests.get(f"{BASE_URL}/products/?limit=5")
print(f"Status: {r.status_code}")
if r.status_code == 200:
    products = r.json()
    print(f"✅ Found {len(products)} products")
    for p in products[:3]:
        print(f"  - ID: {p.get('product_id')}, Name: {p.get('product_name')}")
else:
    print(f"❌ Failed: {r.text[:200]}")
