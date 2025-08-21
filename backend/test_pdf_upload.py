#!/usr/bin/env python3
"""
Test PDF upload endpoint
"""
import requests
import os

# Check if we have a sample PDF
sample_pdfs = [
    "/Users/vikasgarg/Downloads/invoice.pdf",
    "/Users/vikasgarg/Downloads/purchase_invoice.pdf",
    "/Users/vikasgarg/Downloads/sample_invoice.pdf",
    "/Users/vikasgarg/Documents/invoice.pdf",
    "/Users/vikasgarg/Documents/sample_invoice.pdf"
]

pdf_file = None
for path in sample_pdfs:
    if os.path.exists(path):
        pdf_file = path
        print(f"Found PDF: {path}")
        break

if not pdf_file:
    print("No sample PDF found. Creating a test PDF...")
    # Create a simple test PDF using reportlab
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        
        test_pdf = "/tmp/test_invoice.pdf"
        c = canvas.Canvas(test_pdf, pagesize=letter)
        c.drawString(100, 750, "PHARMA HEALTH DISTRIBUTORS")
        c.drawString(100, 730, "123 Medical Street, City - 400001")
        c.drawString(100, 700, "GST INVOICE")
        c.drawString(100, 680, "Invoice No.: INV-2024-001")
        c.drawString(100, 660, "Invoice Date: 15-12-2024")
        c.drawString(100, 640, "GSTIN No.: 27AABCP9876M1Z5")
        c.drawString(100, 620, "D.L. No.: MH-123456")
        
        # Table header
        c.drawString(50, 580, "Item Name")
        c.drawString(200, 580, "Batch")
        c.drawString(280, 580, "Qty")
        c.drawString(340, 580, "MRP")
        c.drawString(400, 580, "Rate")
        c.drawString(460, 580, "Amount")
        
        # Sample item
        c.drawString(50, 560, "Paracetamol 500mg")
        c.drawString(200, 560, "BTH-001")
        c.drawString(280, 560, "100")
        c.drawString(340, 560, "10.00")
        c.drawString(400, 560, "8.00")
        c.drawString(460, 560, "800.00")
        
        c.drawString(100, 500, "Grand Total: Rs. 800.00")
        c.save()
        
        pdf_file = test_pdf
        print(f"Created test PDF: {test_pdf}")
    except ImportError:
        print("reportlab not installed. Cannot create test PDF.")
        print("Please provide a sample PDF invoice to test with.")
        exit(1)

# Test the endpoint
url = "http://localhost:8080/api/purchase-upload/parse-pdf"

with open(pdf_file, 'rb') as f:
    files = {'file': ('invoice.pdf', f, 'application/pdf')}
    response = requests.post(url, files=files)
    
    print(f"\nStatus Code: {response.status_code}")
    print(f"Response: {response.json()}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('extracted_data'):
            print("\n✅ Extracted Data:")
            print(f"  Supplier: {data['extracted_data'].get('supplier_name')}")
            print(f"  GSTIN: {data['extracted_data'].get('supplier_gstin')}")
            print(f"  Invoice: {data['extracted_data'].get('invoice_number')}")
            print(f"  Date: {data['extracted_data'].get('invoice_date')}")
            print(f"  Items: {len(data['extracted_data'].get('items', []))}")
            if data['extracted_data'].get('items'):
                print("\n  First Item:")
                item = data['extracted_data']['items'][0]
                print(f"    Product: {item.get('product_name')}")
                print(f"    Quantity: {item.get('quantity')}")
                print(f"    MRP: {item.get('mrp')}")