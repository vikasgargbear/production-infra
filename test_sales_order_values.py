#!/usr/bin/env python3
"""
Test script to verify sales order values are saved correctly
"""
import requests
import json
from decimal import Decimal

# API Configuration
BASE_URL = "http://localhost:8000"
HEADERS = {
    "X-Org-Id": "e78d6777-35f6-4b19-994f-caaede2f021a",
    "Content-Type": "application/json"
}

def test_sales_order_creation():
    """Test that all values are saved correctly"""
    
    # Test data matching your example
    order_data = {
        "customer_id": 109,
        "order_date": "2025-08-27",
        "delivery_date": "2025-09-03",
        "order_type": "sales",
        "payment_terms": "credit",
        "items": [
            {
                "product_id": 122,  # Airpods Pro
                "product_code": "PROD760548",
                "batch_id": 119,
                "batch_number": "BATCH74760548",
                "quantity": 2,  # What customer pays for
                "free_quantity": 4,  # Additional free items
                "unit_price": 40.00,
                "mrp": 45.00,  # Should be 45, not 40!
                "discount_percent": 25.0,  # 25% discount
                "discount_amount": 20.00,  # 25% of 80 = 20
                "tax_percent": 12.0,
                "tax_amount": 7.20,  # 12% of 60 = 7.20
                "gst_type": "CGST/SGST",
                "uom": "NOS",
                "pack_type": "10",
                "pack_size": None
            }
        ],
        "notes": "Test order with all values"
    }
    
    print("Testing Sales Order Creation...")
    print(f"Sending data:\n{json.dumps(order_data, indent=2)}")
    
    # Create order
    response = requests.post(
        f"{BASE_URL}/api/sales-orders/",
        json=order_data,
        headers=HEADERS
    )
    
    if response.status_code == 200:
        order = response.json()
        order_id = order.get("order_id")
        print(f"\n✅ Order created successfully! ID: {order_id}")
        
        # Check the saved values
        print("\n📊 Checking saved values...")
        items = order.get("items", [])
        if items:
            item = items[0]
            
            # Expected values
            checks = [
                ("MRP", item.get("mrp"), 45.00),
                ("Discount %", item.get("discount_percent"), 25.0),
                ("Free Quantity", item.get("free_quantity"), 4),
                ("Taxable Amount", item.get("taxable_amount"), 60.00),  # 80 - 20 discount
                ("Batch Number", item.get("batch_number"), "BATCH74760548"),
                ("CGST Amount", item.get("cgst_amount"), 3.60),  # 6% of 60
                ("SGST Amount", item.get("sgst_amount"), 3.60),  # 6% of 60
            ]
            
            print("\n" + "="*50)
            for field, actual, expected in checks:
                if float(actual or 0) == float(expected):
                    print(f"✅ {field}: {actual} (Expected: {expected})")
                else:
                    print(f"❌ {field}: {actual} (Expected: {expected}) - MISMATCH!")
            print("="*50)
            
            # Show complete item data
            print(f"\nComplete item data:\n{json.dumps(item, indent=2)}")
        else:
            print("❌ No items found in response!")
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text}")

if __name__ == "__main__":
    test_sales_order_creation()
    print("\n🔍 Check backend logs for detailed debugging info!")