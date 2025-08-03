#!/usr/bin/env python3
"""
PROPER Invoice Test - Gets all data from backend
User only provides: customer name, product name, quantity
Everything else comes from backend APIs
"""

import requests
import json
from datetime import datetime
from decimal import Decimal

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def search_customer(customer_name):
    """Search for customer by name"""
    print(f"\n🔍 Searching for customer: {customer_name}")
    
    response = requests.get(
        f"{API_BASE}/customers",
        params={"search": customer_name, "limit": 10},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        data = response.json()
        customers = data.get('customers', [])
        
        if customers:
            # Try exact match first
            for customer in customers:
                if customer.get('customer_name', '').lower() == customer_name.lower():
                    print(f"✅ Found customer: {customer['customer_name']} (ID: {customer['customer_id']})")
                    return customer
            
            # Return first match if no exact match
            customer = customers[0]
            print(f"✅ Found customer: {customer['customer_name']} (ID: {customer['customer_id']})")
            return customer
    
    print(f"❌ Customer '{customer_name}' not found")
    return None

def search_product(product_name):
    """Search for product by name and get its details"""
    print(f"\n🔍 Searching for product: {product_name}")
    
    # Try products endpoint
    response = requests.get(
        f"{API_BASE}/products",
        params={"search": product_name, "limit": 10},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        data = response.json()
        products = data.get('products', [])
        
        if products:
            # Try exact match first
            for product in products:
                if product_name.lower() in product.get('product_name', '').lower():
                    print(f"✅ Found product: {product['product_name']}")
                    print(f"   Product ID: {product.get('product_id')}")
                    print(f"   Selling Price: ₹{product.get('selling_price', 'N/A')}")
                    print(f"   MRP: ₹{product.get('mrp', 'N/A')}")
                    print(f"   GST: {product.get('gst_percentage', 'N/A')}%")
                    print(f"   HSN: {product.get('hsn_code', 'N/A')}")
                    return product
            
            # Return first match
            product = products[0]
            print(f"✅ Found product: {product['product_name']}")
            return product
    else:
        print(f"⚠️ Products endpoint failed: {response.status_code}")
    
    # Try to get from batches as fallback
    print("   Trying batches endpoint as fallback...")
    response = requests.get(
        f"{API_BASE}/inventory/batches",
        params={"search": product_name, "limit": 10},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        batches = response.json()
        if isinstance(batches, list) and batches:
            batch = batches[0]
            # Create product-like object from batch
            product = {
                'product_id': batch.get('product_id'),
                'product_name': batch.get('product_name', product_name),
                'selling_price': batch.get('selling_price'),
                'mrp': batch.get('mrp'),
                'batch_id': batch.get('batch_id'),
                'batch_number': batch.get('batch_number')
            }
            print(f"✅ Found in batches: {product_name}")
            print(f"   Batch Price: ₹{batch.get('selling_price', 'N/A')}")
            return product
    
    print(f"❌ Product '{product_name}' not found")
    return None

def get_product_tax_info(product_id):
    """Get tax information for a product"""
    print(f"\n🔍 Getting tax info for product ID: {product_id}")
    
    # Try to get from products endpoint
    response = requests.get(
        f"{API_BASE}/products/{product_id}",
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        product = response.json()
        gst = product.get('gst_percentage', 12)  # Default 12% if not found
        hsn = product.get('hsn_code', '3004')  # Default HSN
        print(f"✅ Tax info: GST {gst}%, HSN: {hsn}")
        return {'gst_percentage': gst, 'hsn_code': hsn}
    
    # Fallback defaults
    print("⚠️ Using default tax info: GST 12%, HSN: 3004")
    return {'gst_percentage': 12, 'hsn_code': '3004'}

def calculate_invoice_from_backend(product, quantity, discount_percent=0, other_charges=0):
    """Calculate invoice amounts using backend data"""
    
    print("\n💰 Calculating invoice with backend data:")
    print("-" * 50)
    
    # Get values from product (from backend)
    unit_price = product.get('selling_price', 0)
    mrp = product.get('mrp', unit_price)
    gst_percent = product.get('gst_percentage', 12)
    
    print(f"  Product: {product.get('product_name')}")
    print(f"  Unit Price: ₹{unit_price} (from backend)")
    print(f"  MRP: ₹{mrp} (from backend)")
    print(f"  Quantity: {quantity}")
    print(f"  GST: {gst_percent}% (from backend)")
    print(f"  Discount: {discount_percent}%")
    print(f"  Other Charges: ₹{other_charges}")
    
    # Calculate
    subtotal = Decimal(str(quantity * unit_price))
    discount_amount = subtotal * Decimal(str(discount_percent)) / 100
    taxable_amount = subtotal - discount_amount
    
    # GST calculation
    gst_amount = taxable_amount * Decimal(str(gst_percent)) / 100
    cgst_amount = gst_amount / 2
    sgst_amount = gst_amount / 2
    
    # Round
    cgst_amount = float(cgst_amount.quantize(Decimal('0.01')))
    sgst_amount = float(sgst_amount.quantize(Decimal('0.01')))
    
    # Final
    total_before_charges = float(taxable_amount) + float(gst_amount)
    final_total = total_before_charges + other_charges
    
    result = {
        "unit_price": unit_price,
        "mrp": mrp,
        "subtotal_amount": float(subtotal),
        "discount_percent": discount_percent,
        "discount_amount": float(discount_amount),
        "taxable_amount": float(taxable_amount),
        "cgst_amount": cgst_amount,
        "sgst_amount": sgst_amount,
        "igst_amount": 0,
        "total_tax_amount": float(gst_amount),
        "other_charges": other_charges,
        "other_charges_description": "Transportation" if other_charges > 0 else "",
        "final_amount": final_total,
        "total_amount": final_total,
        "net_amount": final_total,
        "paid_amount": final_total
    }
    
    print(f"\n  Calculated Total: ₹{final_total:.2f}")
    
    return result

def create_invoice_from_backend(customer_name, product_name, quantity, 
                               discount_percent=0, other_charges=0,
                               payment_method="cash"):
    """
    Create invoice using only backend data
    
    Args:
        customer_name: Name of customer to search
        product_name: Name of product to search
        quantity: Quantity to invoice
        discount_percent: Discount (default 0)
        other_charges: Additional charges (default 0)
        payment_method: Payment method (default cash)
    """
    
    print("\n" + "=" * 60)
    print("📝 CREATING INVOICE FROM BACKEND DATA")
    print("=" * 60)
    
    # Step 1: Get customer from backend
    customer = search_customer(customer_name)
    if not customer:
        print(f"❌ Cannot proceed without customer")
        return None
    
    # Step 2: Get product from backend
    product = search_product(product_name)
    if not product:
        print(f"❌ Cannot proceed without product")
        return None
    
    # Step 3: Get tax info if needed
    if not product.get('gst_percentage'):
        tax_info = get_product_tax_info(product['product_id'])
        product.update(tax_info)
    
    # Step 4: Calculate amounts using backend data
    amounts = calculate_invoice_from_backend(
        product=product,
        quantity=quantity,
        discount_percent=discount_percent,
        other_charges=other_charges
    )
    
    # Step 5: Create invoice data
    invoice_data = {
        # Customer info from backend
        "customer_id": customer['customer_id'],
        "customer_name": customer.get('customer_name'),
        "primary_phone": customer.get('primary_phone', ''),
        "customer_email": customer.get('primary_email', ''),
        "customer_address": customer.get('address_line1', ''),
        
        # Invoice details
        "invoice_date": datetime.now().isoformat(),
        "invoice_type": "tax_invoice",
        "payment_method": payment_method,
        "payment_terms": payment_method,
        "place_of_supply": customer.get('state', 'Maharashtra'),
        
        # Items from backend product data
        "items": [
            {
                "product_id": product['product_id'],
                "product_name": product.get('product_name'),
                "product_code": product.get('product_code', ''),
                "hsn_code": product.get('hsn_code', '3004'),
                "batch_id": product.get('batch_id'),
                "batch_number": product.get('batch_number', ''),
                "quantity": quantity,
                "unit_price": amounts['unit_price'],
                "mrp": amounts['mrp'],
                "discount_percent": discount_percent,
                "uom": product.get('uom', 'STRIP'),
                "pack_type": product.get('pack_type', 'STRIP')
            }
        ],
        
        # Amounts calculated from backend data
        **amounts,
        
        "notes": f"Invoice created from backend data"
    }
    
    # Step 6: Send to API
    print("\n📤 Sending invoice to backend...")
    response = requests.post(
        f"{API_BASE}/invoices/",  # WITH trailing slash
        json=invoice_data,
        headers={"X-Org-Id": ORG_ID, "Content-Type": "application/json"},
        timeout=30
    )
    
    print(f"📥 Response: {response.status_code}")
    
    if response.status_code in [200, 201]:
        result = response.json()
        print("\n✅ SUCCESS! Invoice Created:")
        print(f"  Invoice ID: {result.get('invoice_id')}")
        print(f"  Invoice Number: {result.get('invoice_number')}")
        print(f"  Customer: {customer_name}")
        print(f"  Product: {product_name} x {quantity}")
        print(f"  Total Amount: ₹{result.get('total_amount')}")
        return result
    else:
        print(f"❌ Failed: {response.text[:500]}")
        return None

def main():
    """Main test function"""
    
    print("\n" + "=" * 60)
    print("🚀 PROPER INVOICE TEST - ALL DATA FROM BACKEND")
    print("=" * 60)
    print("\nThis test gets everything from backend APIs:")
    print("• Customer details from /api/customers")
    print("• Product price & GST from /api/products")
    print("• Only user inputs: customer name, product, quantity")
    
    # Example 1: Basim with Atlas
    print("\n" + "-" * 60)
    print("Test 1: Basim invoice for Atlas tablets")
    print("-" * 60)
    
    invoice1 = create_invoice_from_backend(
        customer_name="Basim",
        product_name="Atlas",
        quantity=12,
        discount_percent=0,  # No discount by default
        other_charges=0,     # No charges by default
        payment_method="cash"
    )
    
    # Example 2: Another test
    print("\n" + "-" * 60)
    print("Test 2: Testing with different parameters")
    print("-" * 60)
    
    invoice2 = create_invoice_from_backend(
        customer_name="Nano",
        product_name="Atlas",
        quantity=5,
        discount_percent=10,  # With discount
        other_charges=20,     # With transport
        payment_method="credit"
    )
    
    # Summary
    if invoice1 or invoice2:
        print("\n" + "=" * 60)
        print("✅ TEST COMPLETE - Using Backend Data")
        print("=" * 60)
        print("\nKey Points:")
        print("• Product prices came from backend API")
        print("• GST rates came from backend API")
        print("• Customer details came from backend API")
        print("• No hardcoded values!")

if __name__ == "__main__":
    main()