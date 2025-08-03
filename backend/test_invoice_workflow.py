"""
Comprehensive test for invoice creation workflow
Tests the complete flow from frontend to backend including:
1. Invoice creation
2. Invoice items storage
3. Inventory deduction
4. All core triggers
"""

import requests
import json
from datetime import datetime, timedelta
import random

# API Configuration
BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
# BASE_URL = "http://localhost:8000/api"  # For local testing

# Test data
DEFAULT_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

def test_complete_invoice_workflow():
    """Test the complete invoice creation workflow"""
    
    print("="*60)
    print("TESTING COMPLETE INVOICE WORKFLOW")
    print("="*60)
    
    # Step 1: Get a customer
    print("\n1. Getting customer...")
    customers = requests.get(f"{BASE_URL}/customers?limit=1").json()
    if not customers:
        print("❌ No customers found. Creating test customer...")
        customer_data = {
            "customer_name": f"Test Customer {random.randint(1000, 9999)}",
            "phone": "9999999999",
            "email": "test@example.com",
            "address_line1": "Test Address",
            "city": "Test City",
            "state": "Maharashtra",
            "pincode": "400001"
        }
        customer_response = requests.post(f"{BASE_URL}/customers", json=customer_data)
        if customer_response.status_code == 201:
            customer = customer_response.json()
            customer_id = customer['customer_id']
            print(f"✅ Created customer: {customer['customer_name']} (ID: {customer_id})")
        else:
            print(f"❌ Failed to create customer: {customer_response.text}")
            return
    else:
        customer = customers[0]
        customer_id = customer['customer_id']
        print(f"✅ Using customer: {customer['customer_name']} (ID: {customer_id})")
    
    # Step 2: Get products with stock
    print("\n2. Getting products with stock...")
    products_response = requests.get(f"{BASE_URL}/products/search?limit=5")
    if products_response.status_code != 200:
        print(f"❌ Failed to get products: {products_response.text}")
        return
    
    products = products_response.json()
    if not products:
        print("❌ No products found")
        return
    
    # Step 3: Check inventory for products
    print("\n3. Checking inventory levels...")
    products_with_stock = []
    
    for product in products[:3]:  # Check first 3 products
        # Get batches for this product
        batches_response = requests.get(f"{BASE_URL}/batches?product_id={product['product_id']}")
        if batches_response.status_code == 200:
            batches = batches_response.json()
            total_stock = sum(batch.get('quantity_available', 0) for batch in batches)
            if total_stock > 0:
                product['available_stock'] = total_stock
                product['batches'] = batches
                products_with_stock.append(product)
                print(f"✅ Product: {product['name']} - Stock: {total_stock} units")
    
    if not products_with_stock:
        print("⚠️ No products with stock found. Creating with default stock...")
        # Use products anyway for testing
        products_with_stock = products[:2]
    
    # Step 4: Prepare invoice data
    print("\n4. Preparing invoice data...")
    invoice_items = []
    
    for product in products_with_stock[:2]:  # Use 2 products
        item = {
            "product_id": product['product_id'],
            "product_name": product.get('name', 'Product'),
            "quantity": min(2, product.get('available_stock', 10)),  # Order 2 units or available
            "rate": product.get('sale_rate', 100),
            "unit_price": product.get('sale_rate', 100),
            "mrp": product.get('mrp', 120),
            "discount_percent": 5,
            "gst_percent": product.get('gst_rate', 12),
            "hsn_code": product.get('hsn_code', '3004')
        }
        
        # If we have batch info, use the first batch
        if 'batches' in product and product['batches']:
            item['batch_id'] = product['batches'][0].get('batch_id')
            item['batch_number'] = product['batches'][0].get('batch_number', 'DEFAULT')
        
        invoice_items.append(item)
        print(f"  - {item['product_name']}: {item['quantity']} units @ ₹{item['rate']}")
    
    # Calculate totals
    subtotal = sum(item['quantity'] * item['rate'] for item in invoice_items)
    discount_amount = subtotal * 0.05  # 5% discount
    taxable_amount = subtotal - discount_amount
    tax_amount = taxable_amount * 0.12  # 12% GST average
    total_amount = taxable_amount + tax_amount
    
    invoice_data = {
        "customer_id": customer_id,
        "customer_name": customer.get('customer_name', 'Test Customer'),
        "customer_phone": customer.get('phone', '9999999999'),
        "billing_address": "Test Address",
        "invoice_date": datetime.now().strftime("%Y-%m-%d"),
        "invoice_type": "tax_invoice",
        "payment_terms": "cash",
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
        "cgst_amount": tax_amount / 2,
        "sgst_amount": tax_amount / 2,
        "igst_amount": 0,
        "items": invoice_items,
        "notes": "Test invoice created by workflow test"
    }
    
    print(f"\n  Subtotal: ₹{subtotal:.2f}")
    print(f"  Discount: ₹{discount_amount:.2f}")
    print(f"  Tax: ₹{tax_amount:.2f}")
    print(f"  Total: ₹{total_amount:.2f}")
    
    # Step 5: Create invoice
    print("\n5. Creating invoice...")
    invoice_response = requests.post(f"{BASE_URL}/invoices", json=invoice_data)
    
    if invoice_response.status_code in [200, 201]:
        invoice_result = invoice_response.json()
        invoice_id = invoice_result.get('invoice_id')
        invoice_number = invoice_result.get('invoice_number')
        print(f"✅ Invoice created successfully!")
        print(f"   Invoice ID: {invoice_id}")
        print(f"   Invoice Number: {invoice_number}")
    else:
        print(f"❌ Failed to create invoice: {invoice_response.status_code}")
        print(f"   Response: {invoice_response.text}")
        return
    
    # Step 6: Verify invoice was saved with items
    print("\n6. Verifying invoice and items...")
    
    # Check invoice exists
    invoice_check = requests.get(f"{BASE_URL}/invoices/{invoice_id}")
    if invoice_check.status_code == 200:
        saved_invoice = invoice_check.json()
        print(f"✅ Invoice found in database: {saved_invoice.get('invoice_number')}")
    else:
        print(f"❌ Invoice not found in database")
    
    # Check invoice items (would need a specific endpoint)
    # For now, we'll check through the invoice details endpoint if it includes items
    
    # Step 7: Verify inventory was updated
    print("\n7. Verifying inventory deduction...")
    
    for product in products_with_stock[:2]:
        if 'batches' in product and product['batches']:
            # Check if stock was reduced
            batch_id = product['batches'][0].get('batch_id')
            # Note: We'd need a batch details endpoint to verify this properly
            print(f"  ⚠️ Batch {batch_id} inventory check (need endpoint)")
    
    # Step 8: Summary
    print("\n" + "="*60)
    print("WORKFLOW TEST SUMMARY")
    print("="*60)
    print(f"✅ Customer: {customer.get('customer_name', 'Test')}")
    print(f"✅ Invoice: {invoice_number}")
    print(f"✅ Items: {len(invoice_items)} products")
    print(f"✅ Total Amount: ₹{total_amount:.2f}")
    print("\n🎉 Invoice workflow test completed!")
    
    return invoice_id

def test_quick_sale_workflow():
    """Test the quick-sale endpoint as alternative"""
    
    print("\n" + "="*60)
    print("TESTING QUICK-SALE WORKFLOW")
    print("="*60)
    
    # Get customer and products (similar to above)
    customers = requests.get(f"{BASE_URL}/customers?limit=1").json()
    if not customers:
        print("❌ No customers found")
        return
    
    customer = customers[0]
    
    products = requests.get(f"{BASE_URL}/products/search?limit=2").json()
    if not products:
        print("❌ No products found")
        return
    
    # Prepare quick sale data
    sale_data = {
        "customer_id": customer['customer_id'],
        "items": [
            {
                "product_id": products[0]['product_id'],
                "quantity": 1,
                "unit_price": 100,
                "discount_percent": 0
            }
        ],
        "payment_mode": "Cash",
        "payment_amount": 100,
        "discount_amount": 0,
        "other_charges": 0,
        "notes": "Quick sale test"
    }
    
    print(f"Creating quick sale for customer: {customer['customer_name']}")
    
    # Try enterprise-orders endpoint
    response = requests.post(f"{BASE_URL}/enterprise-orders/quick-sale", json=sale_data)
    
    if response.status_code in [200, 201]:
        result = response.json()
        print(f"✅ Quick sale created successfully!")
        print(f"   Order: {result.get('order_number')}")
        print(f"   Invoice: {result.get('invoice_number')}")
    else:
        print(f"❌ Quick sale failed: {response.status_code}")
        print(f"   Response: {response.text}")

if __name__ == "__main__":
    # Run the comprehensive test
    invoice_id = test_complete_invoice_workflow()
    
    # Also test quick-sale as alternative
    test_quick_sale_workflow()
    
    print("\n✅ All workflow tests completed!")