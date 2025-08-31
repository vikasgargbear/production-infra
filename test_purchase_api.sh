#!/bin/bash

# Purchase API Test Script
# Tests all important fields including batch, expiry, MRP, manufacturing date, etc.

API_BASE="https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID="1"

echo "🚀 Starting Purchase API Tests"
echo "================================"

# Test 1: Create Purchase with comprehensive data
echo -e "\n📝 Test 1: CREATE Purchase with all fields"
echo "Testing fields: batch, expiry, MRP, manufacturing date, pack info, etc."

PURCHASE_DATA='{
  "supplier_invoice_number": "TEST-INV-'$(date +%s)'",
  "invoice_date": "'$(date +%Y-%m-%d)'",
  "supplier_id": 1,
  "subtotal_amount": 10000,
  "tax_amount": 1800,
  "discount_amount": 500,
  "final_amount": 11300,
  "other_charges": 0,
  "payment_mode": "cash",
  "payment_status": "paid",
  "notes": "Comprehensive test with all fields",
  "items": [
    {
      "product_id": 1,
      "product_name": "Paracetamol 500mg",
      "hsn_code": "3004",
      "batch_number": "BATCH-2024-001",
      "expiry_date": "2026-12-31",
      "manufacturing_date": "2024-01-15",
      "quantity": 100,
      "free_quantity": 10,
      "purchase_price": 25.50,
      "mrp": 45.00,
      "selling_price": 40.00,
      "discount_percent": 5,
      "tax_percent": 18,
      "pack_type": "STRIP",
      "pack_size": 10,
      "strips_per_box": 10,
      "category": "Analgesics",
      "brand_name": "TestPharma"
    },
    {
      "product_id": 2,
      "product_name": "Amoxicillin 250mg",
      "hsn_code": "3004",
      "batch_number": "BATCH-2024-002",
      "expiry_date": "2025-06-30",
      "manufacturing_date": "2024-02-01",
      "quantity": 50,
      "free_quantity": 5,
      "purchase_price": 35.00,
      "mrp": 65.00,
      "selling_price": 58.00,
      "discount_percent": 3,
      "tax_percent": 12,
      "pack_type": "BOTTLE",
      "pack_size": 30,
      "strips_per_box": 1,
      "category": "Antibiotics",
      "brand_name": "MediCare"
    },
    {
      "product_name": "Vitamin C 500mg (No ID)",
      "hsn_code": "2106",
      "batch_number": "BATCH-2024-003",
      "expiry_date": "2027-03-31",
      "manufacturing_date": "2024-03-01",
      "quantity": 200,
      "free_quantity": 20,
      "purchase_price": 15.00,
      "mrp": 30.00,
      "selling_price": 28.00,
      "discount_percent": 10,
      "tax_percent": 5,
      "pack_type": "STRIP",
      "pack_size": 15,
      "strips_per_box": 10,
      "category": "Vitamins",
      "brand_name": "HealthPlus"
    }
  ]
}'

echo "Sending purchase data..."
RESPONSE=$(curl -s -X POST "$API_BASE/purchases/enhanced/with-items" \
  -H "Content-Type: application/json" \
  -H "X-Org-ID: $ORG_ID" \
  -d "$PURCHASE_DATA")

if echo "$RESPONSE" | grep -q "purchase_id\|purchase_number"; then
  echo "✅ Purchase created successfully!"
  PURCHASE_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('purchase_id', 'N/A'))")
  echo "   Purchase ID: $PURCHASE_ID"
  echo "$RESPONSE" | python3 -m json.tool | head -20
else
  echo "❌ Failed to create purchase"
  echo "$RESPONSE" | python3 -m json.tool
fi

# Test 2: GET All Purchases
echo -e "\n📝 Test 2: GET All Purchases"
curl -s -X GET "$API_BASE/purchases/?limit=3" \
  -H "X-Org-ID: $ORG_ID" | python3 -m json.tool | head -30

# Test 3: Test with product without ID (PDF parse scenario)
echo -e "\n📝 Test 3: CREATE Purchase without product_id (PDF parsed)"
PDF_PURCHASE_DATA='{
  "supplier_invoice_number": "PDF-TEST-'$(date +%s)'",
  "invoice_date": "'$(date +%Y-%m-%d)'",
  "supplier_id": 1,
  "subtotal_amount": 5000,
  "tax_amount": 900,
  "final_amount": 5900,
  "payment_mode": "cash",
  "items": [
    {
      "product_name": "Generic Medicine from PDF",
      "batch_number": "PDF-BATCH-001",
      "expiry_date": "2025-12-31",
      "quantity": 50,
      "purchase_price": 100,
      "mrp": 150,
      "tax_percent": 18
    }
  ]
}'

echo "Testing without product_id..."
curl -s -X POST "$API_BASE/purchases/enhanced/with-items" \
  -H "Content-Type: application/json" \
  -H "X-Org-ID: $ORG_ID" \
  -d "$PDF_PURCHASE_DATA" | python3 -m json.tool | head -20

echo -e "\n================================"
echo "✅ Tests completed!"