#!/usr/bin/env python3
"""
Simple invoice creation test - creating invoice directly with known IDs
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def create_simple_invoice():
    """Create a simple invoice with hardcoded values"""
    
    print("Creating Simple Invoice Test")
    print("=" * 60)
    
    # Invoice data with hardcoded customer and product IDs
    invoice_data = {
        "customer_id": 1,  # Assuming customer ID 1 exists
        "invoice_date": datetime.now().isoformat(),
        "payment_method": "cash",
        "items": [
            {
                "product_id": 1,  # Assuming product ID 1 exists
                "product_name": "Atlas Tablet",
                "product_code": "ATL001",
                "hsn_code": "3004",
                "batch_id": None,
                "batch_number": "",
                "quantity": 12,
                "unit_price": 100.00,
                "mrp": 120.00,
                "discount_percentage": 10.0,
                "discount_amount": 120.00,  # 12 * 100 * 10%
                "gst_percentage": 18.0,
                "cgst_amount": 97.20,  # (1200 - 120) * 9%
                "sgst_amount": 97.20,  # (1200 - 120) * 9%
                "igst_amount": 0,
                "line_total": 1080.00,  # 1200 - 120
                "line_total_with_tax": 1274.40  # 1080 + 194.40
            }
        ],
        "subtotal_amount": 1200.00,  # 12 * 100
        "discount_amount": 120.00,  # 10%
        "discount_percentage": 10.0,
        "other_charges": 20.00,  # Transportation
        "other_charges_description": "Transportation",
        "net_amount": 1294.40,  # 1274.40 + 20
        "paid_amount": 1294.40,  # Full cash payment
        "notes": "Test invoice for Basim - Atlas product"
    }
    
    print("\nInvoice Summary:")
    print(f"  Customer ID: 1")
    print(f"  Product: Atlas Tablet")
    print(f"  Quantity: 12")
    print(f"  Unit Price: ₹100.00")
    print(f"  Subtotal: ₹1,200.00")
    print(f"  Discount: -₹120.00 (10%)")
    print(f"  GST: ₹194.40 (18%)")
    print(f"  Transportation: ₹20.00")
    print(f"  Total: ₹1,294.40")
    print(f"  Payment: Cash (Paid in full)")
    
    # Create invoice
    response = requests.post(
        f"{API_BASE}/invoices",
        json=invoice_data,
        headers={
            "X-Org-Id": ORG_ID,
            "Content-Type": "application/json"
        }
    )
    
    print(f"\n📡 Response Status: {response.status_code}")
    
    if response.status_code in [200, 201]:
        invoice = response.json()
        print(f"\n✅ Invoice created successfully!")
        print(f"   Invoice Number: {invoice.get('invoice_number', 'N/A')}")
        print(f"   Invoice ID: {invoice.get('invoice_id', 'N/A')}")
        print(f"   Total Amount: ₹{invoice.get('total_amount', invoice_data['net_amount']):.2f}")
        return invoice
    else:
        print(f"❌ Failed to create invoice")
        print(f"Response: {response.text[:500]}")
        return None

if __name__ == "__main__":
    try:
        invoice = create_simple_invoice()
        if invoice:
            print("\n" + "=" * 60)
            print("✅ INVOICE CREATION TEST COMPLETED!")
            print("=" * 60)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()