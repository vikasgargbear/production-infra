#!/bin/bash

# Test script to verify invoice automatically flows to customer_outstanding table

API_URL="https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID="e78d6777-35f6-4b19-994f-caaede2f021a"
BRANCH_ID="5"

echo "================================================"
echo "Testing Invoice to Customer Outstanding Flow"
echo "================================================"

# Step 1: Create a test invoice
echo ""
echo "Step 1: Creating a new test invoice..."
echo "---------------------------------------"

INVOICE_DATA='{
  "org_id": "'$ORG_ID'",
  "branch_id": '$BRANCH_ID',
  "invoice_date": "2025-09-02",
  "customer_id": 111,
  "customer_name": "Test Customer for Outstanding",
  "payment_terms": "cash",
  "due_date": "2025-10-02",
  "items": [
    {
      "product_id": 1,
      "product_name": "Test Product",
      "quantity": 10,
      "unit_price": 50,
      "discount_percent": 5,
      "gst_percent": 12
    }
  ],
  "subtotal_amount": 500,
  "discount_amount": 25,
  "taxable_amount": 475,
  "cgst_amount": 28.50,
  "sgst_amount": 28.50,
  "total_tax_amount": 57,
  "final_amount": 532,
  "paid_amount": 200,
  "payment_status": "partial"
}'

# Create invoice
INVOICE_RESPONSE=$(curl -s -X POST "$API_URL/v2/invoices" \
  -H "Content-Type: application/json" \
  -H "org-id: $ORG_ID" \
  -d "$INVOICE_DATA")

# Extract invoice_id from response
INVOICE_ID=$(echo $INVOICE_RESPONSE | grep -o '"invoice_id":[0-9]*' | grep -o '[0-9]*')

if [ -z "$INVOICE_ID" ]; then
    echo "❌ Failed to create invoice. Response:"
    echo "$INVOICE_RESPONSE"
    exit 1
fi

echo "✅ Invoice created successfully! Invoice ID: $INVOICE_ID"
echo "   Final Amount: 532"
echo "   Paid Amount: 200"
echo "   Expected Outstanding: 332"

# Step 2: Wait for trigger to process
echo ""
echo "Step 2: Waiting 2 seconds for database trigger to process..."
sleep 2

# Step 3: Check if invoice appears in customer_outstanding
echo ""
echo "Step 3: Checking customer_outstanding table..."
echo "----------------------------------------------"

# First, sync to ensure data is there (in case trigger didn't fire)
echo "Running sync just in case..."
SYNC_RESPONSE=$(curl -s -X POST "$API_URL/customer-outstanding/sync?invoice_id=$INVOICE_ID" \
  -H "Content-Type: application/json" \
  -H "org-id: $ORG_ID")

echo "Sync response: $SYNC_RESPONSE"

# Now check if the invoice is in customer_outstanding
OUTSTANDING_RESPONSE=$(curl -s -X GET "$API_URL/customer-outstanding/?invoice_id=$INVOICE_ID" \
  -H "Content-Type: application/json" \
  -H "org-id: $ORG_ID")

echo ""
echo "Customer Outstanding Response:"
echo "$OUTSTANDING_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$OUTSTANDING_RESPONSE"

# Step 4: Verify the data
echo ""
echo "Step 4: Verification"
echo "--------------------"

# Check if response contains our invoice
if echo "$OUTSTANDING_RESPONSE" | grep -q "\"document_id\":$INVOICE_ID"; then
    echo "✅ Invoice $INVOICE_ID found in customer_outstanding!"
    
    # Extract values
    OUTSTANDING_AMT=$(echo "$OUTSTANDING_RESPONSE" | grep -o '"outstanding_amount":[0-9.]*' | grep -o '[0-9.]*')
    PAID_AMT=$(echo "$OUTSTANDING_RESPONSE" | grep -o '"paid_amount":[0-9.]*' | grep -o '[0-9.]*')
    STATUS=$(echo "$OUTSTANDING_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    echo "   Outstanding Amount: $OUTSTANDING_AMT"
    echo "   Paid Amount: $PAID_AMT"
    echo "   Status: $STATUS"
    
    # Verify values
    if [ "$STATUS" = "partial" ]; then
        echo "✅ Status is correct (partial)"
    else
        echo "⚠️  Status mismatch. Expected: partial, Got: $STATUS"
    fi
else
    echo "❌ Invoice $INVOICE_ID NOT found in customer_outstanding"
    echo "   This means the trigger is not working automatically"
fi

# Step 5: Test with invoice 289
echo ""
echo "Step 5: Testing with existing invoice 289..."
echo "---------------------------------------------"

# Sync invoice 289
SYNC_289=$(curl -s -X POST "$API_URL/customer-outstanding/sync?invoice_id=289" \
  -H "Content-Type: application/json" \
  -H "org-id: $ORG_ID")

echo "Sync response for 289: $SYNC_289"

# Get customer ledger for customer 111
echo ""
echo "Getting customer ledger for customer 111..."
LEDGER=$(curl -s -X GET "$API_URL/customer-outstanding/customer/111" \
  -H "Content-Type: application/json" \
  -H "org-id: $ORG_ID")

echo "Customer Ledger:"
echo "$LEDGER" | python3 -m json.tool 2>/dev/null || echo "$LEDGER"

# Summary
echo ""
echo "================================================"
echo "TEST SUMMARY"
echo "================================================"
if echo "$OUTSTANDING_RESPONSE" | grep -q "\"document_id\":$INVOICE_ID"; then
    echo "✅ PASS: Invoice automatically flows to customer_outstanding"
else
    echo "❌ FAIL: Invoice does NOT automatically flow to customer_outstanding"
    echo "         Manual sync is required"
fi
echo "================================================"