#!/usr/bin/env python3
"""
FINAL Working Invoice Creation Test
Uses correct column names from actual database schema
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def create_basim_invoice():
    """Create the Basim invoice with correct field names"""
    
    print("\n" + "="*60)
    print("🧪 FINAL INVOICE CREATION TEST - BASIM")
    print("="*60)
    
    # Invoice data with CORRECT column names from schema
    invoice_data = {
        "customer_id": 1,  # Or use actual Basim customer ID if exists
        "customer_name": "Basim",
        "primary_phone": "7738228969",
        "invoice_date": datetime.now().isoformat(),
        "invoice_type": "tax_invoice",
        "payment_method": "cash",
        "payment_terms": "cash",
        "place_of_supply": "Maharashtra",
        
        # Items with correct field names
        "items": [
            {
                "product_id": 1,
                "product_name": "Atlas Tablet",
                "product_code": "ATL001",
                "hsn_code": "3004",
                "batch_id": None,
                "batch_number": "",
                "quantity": 12,
                "unit_price": 100.00,
                "mrp": 120.00,
                "discount_percent": 10.0,  # CORRECT: discount_percent not discount_percentage
                "discount_amount": 120.00,
                "gst_percent": 18.0,  # This gets converted to cgst_rate/sgst_rate in backend
                "uom": "STRIP",  # Required field
                "pack_type": "STRIP"  # Required field
            }
        ],
        
        # Invoice totals
        "subtotal_amount": 1200.00,
        "discount_amount": 120.00,
        "taxable_amount": 1080.00,  # CORRECT: taxable_amount
        "cgst_amount": 97.20,
        "sgst_amount": 97.20,
        "igst_amount": 0,
        "total_tax_amount": 194.40,
        "other_charges": 20.00,
        "other_charges_description": "Transportation",
        "final_amount": 1294.40,
        "total_amount": 1294.40,
        "net_amount": 1294.40,
        "paid_amount": 1294.40,
        "notes": "Cash sale - Basim (Atlas product x 12) with 10% discount and ₹20 transportation"
    }
    
    # Display summary
    print("\n📋 Invoice Details:")
    print(f"   Customer: {invoice_data['customer_name']} ({invoice_data['primary_phone']})")
    print(f"   Product: Atlas Tablet")
    print(f"   Quantity: 12 units @ ₹100/unit")
    print(f"   Subtotal: ₹1,200.00")
    print(f"   Discount: -₹120.00 (10%)")
    print(f"   Taxable: ₹1,080.00")
    print(f"   GST: ₹194.40 (18%)")
    print(f"   Transport: ₹20.00")
    print(f"   TOTAL: ₹1,294.40")
    print(f"   Payment: Cash (Paid in full)")
    
    # Send to API
    print("\n📤 Sending invoice to backend...")
    
    try:
        response = requests.post(
            f"{API_BASE}/invoices",
            json=invoice_data,
            headers={
                "X-Org-Id": ORG_ID,
                "Content-Type": "application/json"
            },
            timeout=30
        )
        
        print(f"📥 Response Status: {response.status_code}")
        
        if response.status_code in [200, 201]:
            result = response.json()
            print("\n✅ SUCCESS! Invoice created:")
            print(f"   Full Response: {result}")
            print(f"   Invoice ID: {result.get('invoice_id', 'N/A')}")
            print(f"   Invoice Number: {result.get('invoice_number', 'N/A')}")
            print(f"   Total Amount: ₹{result.get('total_amount', 'N/A')}")
            print(f"   Message: {result.get('message', 'Created')}")
            
            print("\n🎉 BASIM INVOICE CREATED SUCCESSFULLY!")
            print("\nYou should now see this invoice in:")
            print("  1. Supabase: sales.invoices table")
            print("  2. Supabase: sales.invoice_items table")
            print("  3. Frontend: Invoice list")
            
            return result
            
        else:
            print(f"\n❌ Failed: HTTP {response.status_code}")
            error_text = response.text[:500]
            print(f"Error: {error_text}")
            
            # Diagnose common issues
            if 'discount_percentage' in error_text:
                print("\n⚠️ Database has old column name 'discount_percentage'")
                print("The schema says 'discount_percent' but your DB might have the old name")
            elif 'gst_percentage' in error_text:
                print("\n⚠️ Database might be missing GST columns")
                print("Should have: cgst_rate, sgst_rate, igst_rate")
            elif 'uom' in error_text or 'pack_type' in error_text:
                print("\n⚠️ Missing required fields: uom or pack_type")
            
            return None
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return None

def main():
    print("\n🚀 Starting Final Invoice Test")
    print("This uses the CORRECT column names from the database schema")
    
    result = create_basim_invoice()
    
    print("\n" + "="*60)
    if result:
        print("✅ TEST PASSED - Invoice created and saved to database!")
    else:
        print("❌ TEST FAILED - Check the error messages above")
        print("\nPossible fixes:")
        print("1. Wait for backend deployment to complete")
        print("2. Check if database schema matches code")
        print("3. Verify all required columns exist")

if __name__ == "__main__":
    main()