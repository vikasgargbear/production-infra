#!/usr/bin/env python3
"""
Multi-Item Invoice Creation
Creates invoice with multiple products for a customer
"""

from complete_invoice_flow import InvoiceCreator
from datetime import datetime
from decimal import Decimal
import requests

class MultiItemInvoiceCreator(InvoiceCreator):
    """Extended invoice creator that handles multiple items"""
    
    def create_multi_item_invoice(self, customer_name, items_list, 
                                 discount_percent=0, other_charges=0, 
                                 payment_method="cash"):
        """
        Create invoice with multiple items
        
        Args:
            customer_name: Customer name
            items_list: List of tuples (product_name, quantity)
            discount_percent: Overall discount (default 0)
            other_charges: Additional charges (default 0)
            payment_method: Payment method (default cash)
        """
        
        print("\n" + "=" * 60)
        print("📋 CREATING MULTI-ITEM INVOICE")
        print("=" * 60)
        print(f"Customer: {customer_name}")
        print(f"Items: {len(items_list)} different products")
        
        # Step 1: Get/Create Customer
        customer = self.search_customer(customer_name)
        if not customer:
            customer = self.create_customer(customer_name, "7738228969")
            if not customer:
                print("❌ Cannot proceed without customer")
                return None
        
        # Step 2: Get all products and calculate
        invoice_items = []
        total_subtotal = Decimal('0')
        
        for product_name, quantity in items_list:
            print(f"\n📦 Processing: {product_name} x {quantity}")
            
            # Get product from backend
            product = self.get_product_from_batches(product_name)
            if not product:
                print(f"⚠️ Product '{product_name}' not found, skipping...")
                continue
            
            # Calculate for this item
            unit_price = Decimal(str(product['selling_price']))
            item_subtotal = unit_price * Decimal(str(quantity))
            total_subtotal += item_subtotal
            
            # Add to items list
            invoice_items.append({
                "product_id": product['product_id'],
                "product_name": product['product_name'],
                "product_code": product.get('product_code', ''),
                "hsn_code": product['hsn_code'],
                "batch_id": product.get('batch_id'),
                "batch_number": product.get('batch_number', ''),
                "quantity": quantity,
                "unit_price": float(unit_price),
                "mrp": product['mrp'],
                "discount_percent": 0,  # Item level discount
                "uom": "STRIP",
                "pack_type": "STRIP"
            })
        
        if not invoice_items:
            print("❌ No valid items to invoice")
            return None
        
        # Step 3: Calculate total amounts
        print("\n💰 Calculating invoice totals:")
        print("-" * 50)
        
        # Apply overall discount
        discount_amount = total_subtotal * Decimal(str(discount_percent)) / 100
        taxable_amount = total_subtotal - discount_amount
        
        # Calculate weighted average GST
        total_gst = Decimal('0')
        for item in invoice_items:
            # Assume 12% GST for all items (or get from product)
            item_taxable = Decimal(str(item['unit_price'] * item['quantity']))
            item_gst = item_taxable * Decimal('12') / 100
            total_gst += item_gst
        
        # Adjust GST for discount
        if discount_percent > 0:
            gst_amount = taxable_amount * Decimal('12') / 100
        else:
            gst_amount = total_gst
        
        cgst = float((gst_amount / 2).quantize(Decimal('0.01')))
        sgst = float((gst_amount / 2).quantize(Decimal('0.01')))
        
        # Final total
        total = float(taxable_amount) + float(gst_amount) + other_charges
        
        print(f"  Subtotal: ₹{total_subtotal}")
        print(f"  Discount ({discount_percent}%): -₹{discount_amount}")
        print(f"  Taxable: ₹{taxable_amount}")
        print(f"  GST (12%): ₹{gst_amount:.2f}")
        print(f"  Other Charges: ₹{other_charges}")
        print(f"  TOTAL: ₹{total:.2f}")
        
        # Step 4: Create invoice
        invoice_data = {
            "customer_id": customer.get('customer_id'),
            "customer_name": customer.get('customer_name'),
            "primary_phone": customer.get('phone') or customer.get('primary_phone', ''),
            "invoice_date": datetime.now().isoformat(),
            "invoice_type": "tax_invoice",
            "payment_method": payment_method,
            "payment_terms": payment_method,
            "place_of_supply": customer.get('state', 'Maharashtra'),
            "items": invoice_items,
            "subtotal_amount": float(total_subtotal),
            "discount_amount": float(discount_amount),
            "taxable_amount": float(taxable_amount),
            "cgst_amount": cgst,
            "sgst_amount": sgst,
            "igst_amount": 0,
            "total_tax_amount": float(gst_amount),
            "other_charges": other_charges,
            "other_charges_description": "Transportation" if other_charges > 0 else "",
            "final_amount": total,
            "total_amount": total,
            "net_amount": total,
            "paid_amount": total,
            "notes": f"Multi-item invoice for {customer_name}"
        }
        
        # Send to API
        print("\n📤 Sending invoice to backend...")
        response = requests.post(
            f"{self.api_base}/invoices/",
            json=invoice_data,
            headers={**self.headers, "Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"📥 Response: {response.status_code}")
        
        if response.status_code in [200, 201]:
            result = response.json()
            print("\n✅ SUCCESS! Multi-Item Invoice Created:")
            print(f"  Invoice ID: {result.get('invoice_id')}")
            print(f"  Invoice Number: {result.get('invoice_number')}")
            print(f"  Total Amount: ₹{result.get('total_amount')}")
            return result
        else:
            print(f"❌ Failed: {response.text[:500]}")
            return None

def create_basim_invoice():
    """Create invoice for Basim with Vitamin C and Atlas tablets"""
    
    print("\n" + "=" * 60)
    print("🚀 CREATING INVOICE FOR BASIM")
    print("=" * 60)
    print("\nOrder Details:")
    print("• Customer: Basim")
    print("• Products:")
    print("  - 30x Vitamin C tablets")
    print("  - 5x Atlas tablets")
    
    # Initialize creator
    creator = MultiItemInvoiceCreator()
    
    # Define items
    items = [
        ("Vitamin C", 30),  # 30 Vitamin C tablets
        ("Atlas", 5)        # 5 Atlas tablets
    ]
    
    # Create invoice
    invoice = creator.create_multi_item_invoice(
        customer_name="Basim",
        items_list=items,
        discount_percent=0,  # No discount
        other_charges=0,     # No additional charges
        payment_method="cash"
    )
    
    if invoice:
        print("\n" + "=" * 60)
        print("🎉 INVOICE CREATED SUCCESSFULLY!")
        print("=" * 60)
        print(f"\n📊 Final Invoice Summary:")
        print(f"  Customer: Basim")
        print(f"  Invoice Number: {invoice.get('invoice_number')}")
        print(f"  Items:")
        print(f"    • 30x Vitamin C tablets")
        print(f"    • 5x Atlas tablets")
        print(f"  Total Amount: ₹{invoice.get('total_amount')}")
        print(f"\n📍 Check in Supabase:")
        print(f"  SELECT * FROM sales.invoices WHERE invoice_id = {invoice.get('invoice_id')};")
        print(f"  SELECT * FROM sales.invoice_items WHERE invoice_id = {invoice.get('invoice_id')};")
        return invoice
    else:
        print("\n❌ Failed to create invoice")
        return None

if __name__ == "__main__":
    # Create the invoice for Basim
    invoice = create_basim_invoice()