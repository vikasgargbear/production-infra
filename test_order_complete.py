#!/usr/bin/env python3
"""
Complete test of sales order with all fields
"""
import requests
import json
from decimal import Decimal

BASE_URL = "http://localhost:8000"
HEADERS = {
    "X-Org-Id": "e78d6777-35f6-4b19-994f-caaede2f021a",
    "Content-Type": "application/json"
}

def test_order():
    """Test order with complete data"""
    
    order_data = {
        "customer_id": 109,
        "order_date": "2025-08-27",
        "delivery_date": "2025-09-03",
        "order_type": "sales",
        "payment_terms": "credit",
        "items": [
            {
                "product_id": 122,  # Airpods Pro
                "batch_id": 119,
                "batch_number": "BATCH74760548",
                "quantity": 2,  # Base quantity (what customer pays for)
                "free_quantity": 4,  # Additional free
                "unit_price": 40.00,
                "mrp": 45.00,  # Higher than unit price
                "discount_percent": 25.0,
                "discount_amount": 20.00,  # Will be recalculated
                "tax_percent": 12.0,
                "gst_type": "CGST/SGST",
                "uom": "NOS",
                "pack_type": "10",
                "product_code": "AIRPODS-PRO"
            },
            {
                "product_id": 124,  # Atlas
                "batch_id": 121,
                "batch_number": "BATCH48466083", 
                "quantity": 2,  # Base quantity
                "free_quantity": 2,  # Additional free
                "unit_price": 25.00,
                "mrp": 50.00,  # Higher MRP
                "discount_percent": 20.0,
                "discount_amount": 10.00,
                "tax_percent": 12.0,
                "gst_type": "CGST/SGST",
                "uom": "NOS",
                "pack_type": "10",
                "product_code": "ATLAS-001"
            }
        ],
        "notes": "Complete test order"
    }
    
    print("=" * 60)
    print("TESTING COMPLETE SALES ORDER")
    print("=" * 60)
    
    response = requests.post(
        f"{BASE_URL}/api/sales-orders/",
        json=order_data,
        headers=HEADERS
    )
    
    if response.status_code == 200:
        order = response.json()
        order_id = order.get("order_id")
        print(f"\n✅ Order created! ID: {order_id}")
        
        # Check items
        items = order.get("items", [])
        print(f"\n📦 Checking {len(items)} items...")
        
        for idx, item in enumerate(items):
            print(f"\n--- Item {idx + 1}: {item.get('product_name')} ---")
            
            # Expected values for each item
            if idx == 0:  # Airpods Pro
                expected = {
                    "quantity": 6,  # 2 + 4 = 6 total
                    "base_quantity": 2,  # What customer pays for
                    "free_quantity": 4,  # Additional free
                    "mrp": 45.00,
                    "discount_percent": 25.0,
                    "discount_amount": 20.00,  # 25% of 80
                    "taxable_amount": 60.00,  # 80 - 20
                    "cgst_amount": 3.60,  # 6% of 60
                    "sgst_amount": 3.60,  # 6% of 60
                    "batch_number": "BATCH74760548"
                }
            else:  # Atlas
                expected = {
                    "quantity": 4,  # 2 + 2 = 4 total
                    "base_quantity": 2,
                    "free_quantity": 2,
                    "mrp": 50.00,
                    "discount_percent": 20.0,
                    "discount_amount": 10.00,  # 20% of 50
                    "taxable_amount": 40.00,  # 50 - 10
                    "cgst_amount": 2.40,  # 6% of 40
                    "sgst_amount": 2.40,  # 6% of 40
                    "batch_number": "BATCH48466083"
                }
            
            # Check each field
            for field, exp_value in expected.items():
                actual = item.get(field)
                if isinstance(exp_value, str):
                    match = actual == exp_value
                else:
                    match = float(actual or 0) == float(exp_value)
                
                icon = "✅" if match else "❌"
                print(f"  {icon} {field}: {actual} (expected: {exp_value})")
        
        # Show order totals
        print(f"\n📊 Order Totals:")
        print(f"  Subtotal: {order.get('subtotal_amount')}")
        print(f"  Discount: {order.get('discount_amount')}")
        print(f"  Taxable: {order.get('taxable_amount')}")
        print(f"  CGST: {order.get('cgst_amount')}")
        print(f"  SGST: {order.get('sgst_amount')}")
        print(f"  Total: {order.get('final_amount')}")
        
    else:
        print(f"❌ Error {response.status_code}: {response.text}")
    
    print("\n" + "=" * 60)
    print("Check backend/backend.log for detailed debug info")
    print("=" * 60)

if __name__ == "__main__":
    test_order()