#!/usr/bin/env python3
"""
Verify Invoice Data in Database
Checks all tables to confirm invoice creation worked properly
"""

import psycopg2
import os
from datetime import datetime

# Database connection from environment
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("❌ DATABASE_URL not set. Please export DATABASE_URL environment variable")
    exit(1)

def verify_invoice_data(invoice_id=49):
    """Verify all invoice-related data in database"""
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("\n" + "=" * 80)
    print(f"📊 VERIFYING INVOICE DATA FOR INVOICE ID: {invoice_id}")
    print("=" * 80)
    
    # 1. Check Invoice
    print("\n1️⃣ INVOICE RECORD:")
    cur.execute("""
        SELECT invoice_id, invoice_number, order_id, customer_id, customer_name, 
               final_amount, payment_status, created_at
        FROM sales.invoices 
        WHERE invoice_id = %s
    """, (invoice_id,))
    
    invoice = cur.fetchone()
    if invoice:
        print(f"   ✅ Invoice found:")
        print(f"      Number: {invoice[1]}")
        print(f"      Order ID: {invoice[2]}")
        print(f"      Customer: {invoice[4]} (ID: {invoice[3]})")
        print(f"      Amount: ₹{invoice[5]}")
        print(f"      Status: {invoice[6]}")
        print(f"      Created: {invoice[7]}")
        order_id = invoice[2]
        customer_id = invoice[3]
    else:
        print(f"   ❌ Invoice {invoice_id} not found")
        return
    
    # 2. Check Invoice Items
    print("\n2️⃣ INVOICE ITEMS:")
    cur.execute("""
        SELECT product_name, quantity, unit_price, discount_percent, 
               cgst_rate, sgst_rate, line_total, uom, pack_type
        FROM sales.invoice_items 
        WHERE invoice_id = %s
    """, (invoice_id,))
    
    items = cur.fetchall()
    if items:
        for item in items:
            print(f"   ✅ Item: {item[0]}")
            print(f"      Qty: {item[1]} {item[7]}")
            print(f"      Price: ₹{item[2]}, Discount: {item[3]}%")
            print(f"      GST: CGST {item[4]}% + SGST {item[5]}%")
            print(f"      Line Total: ₹{item[6]}")
            print(f"      Pack: {item[8]}")
    else:
        print(f"   ❌ No items found for invoice {invoice_id}")
    
    # 3. Check Order
    if order_id:
        print(f"\n3️⃣ ORDER RECORD (ID: {order_id}):")
        cur.execute("""
            SELECT order_number, order_date, total_amount, order_status
            FROM sales.orders 
            WHERE order_id = %s
        """, (order_id,))
        
        order = cur.fetchone()
        if order:
            print(f"   ✅ Order found:")
            print(f"      Number: {order[0]}")
            print(f"      Date: {order[1]}")
            print(f"      Amount: ₹{order[2]}")
            print(f"      Status: {order[3]}")
        else:
            print(f"   ❌ Order {order_id} not found")
    
    # 4. Check Inventory Impact
    print("\n4️⃣ INVENTORY IMPACT:")
    cur.execute("""
        SELECT im.product_id, p.product_name, im.quantity, im.movement_type, im.created_at
        FROM inventory.inventory_movements im
        JOIN inventory.products p ON im.product_id = p.product_id
        WHERE im.reference_type = 'invoice' 
        AND im.reference_id = %s
    """, (invoice_id,))
    
    movements = cur.fetchall()
    if movements:
        for mov in movements:
            print(f"   ✅ Movement: {mov[1]}")
            print(f"      Quantity: {mov[2]} ({mov[3]})")
            print(f"      Time: {mov[4]}")
    else:
        print(f"   ⚠️ No inventory movements recorded")
    
    # 5. Check Customer Outstanding
    print(f"\n5️⃣ CUSTOMER OUTSTANDING (ID: {customer_id}):")
    cur.execute("""
        SELECT customer_name, current_outstanding
        FROM parties.customers 
        WHERE customer_id = %s
    """, (customer_id,))
    
    customer = cur.fetchone()
    if customer:
        print(f"   ✅ Customer: {customer[0]}")
        print(f"      Outstanding: ₹{customer[1] or 0}")
    
    # 6. Check Financial Entries
    print("\n6️⃣ FINANCIAL ENTRIES:")
    cur.execute("""
        SELECT entry_type, narration, total_debit, total_credit, status
        FROM financial.journal_entries 
        WHERE reference_type = 'invoice' 
        AND reference_id = %s
    """, (invoice_id,))
    
    journal = cur.fetchall()
    if journal:
        for entry in journal:
            print(f"   ✅ Journal Entry: {entry[1]}")
            print(f"      Type: {entry[0]}, Status: {entry[4]}")
            print(f"      Debit: ₹{entry[2]}, Credit: ₹{entry[3]}")
    else:
        print(f"   ⚠️ No journal entries found")
    
    # 7. Check GST Ledger
    print("\n7️⃣ GST LEDGER:")
    cur.execute("""
        SELECT transaction_type, cgst_amount, sgst_amount, total_amount
        FROM gst.gst_ledger 
        WHERE reference_type = 'invoice' 
        AND reference_id = %s
    """, (invoice_id,))
    
    gst = cur.fetchall()
    if gst:
        for entry in gst:
            print(f"   ✅ GST Entry ({entry[0]}):")
            print(f"      CGST: ₹{entry[1]}, SGST: ₹{entry[2]}")
            print(f"      Total GST: ₹{entry[3]}")
    else:
        print(f"   ⚠️ No GST ledger entries found")
    
    cur.close()
    conn.close()
    
    print("\n" + "=" * 80)
    print("✅ VERIFICATION COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    # Check latest invoice
    verify_invoice_data(49)  # Or pass different invoice_id as needed