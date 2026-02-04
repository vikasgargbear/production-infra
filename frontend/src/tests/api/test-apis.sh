#!/bin/bash
# Sales API Test Script
# Usage: ./test-apis.sh [token] [org_id]
#
# Tests:
# 1. GET /api/invoices - Invoices API
# 2. GET /api/challan - Challans API (returns direct array)
# 3. GET /api/sales-orders - Sales Orders API

API_BASE="https://pharma-backend-production-c6a8.up.railway.app/api"
TOKEN="${1:-}"
ORG_ID="${2:-}"

echo "=============================================="
echo "SALES API TEST SUITE"
echo "=============================================="
echo "API Base: $API_BASE"
echo ""

if [ -z "$TOKEN" ]; then
  echo "WARNING: No auth token provided"
  echo "Usage: ./test-apis.sh <token> <org_id>"
  echo ""
fi

# Function to make API request
test_api() {
  local name=$1
  local endpoint=$2

  echo "----------------------------------------------"
  echo "Testing: $name"
  echo "Endpoint: $endpoint"
  echo ""

  response=$(curl -s -w "\n%{http_code}" \
    "$API_BASE$endpoint" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Org-Id: $ORG_ID" \
    -H "Content-Type: application/json")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  echo "HTTP Status: $http_code"
  echo "Response:"
  echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
  echo ""
}

# Test Invoices API
test_api "INVOICES API" "/invoices?limit=3&offset=0"

# Test Challans API
test_api "CHALLANS API" "/challan?skip=0&limit=3"

# Test Sales Orders API
test_api "SALES ORDERS API" "/sales-orders?skip=0&limit=3"

echo "=============================================="
echo "EXPECTED RESPONSE STRUCTURES:"
echo "=============================================="
echo ""
echo "INVOICES: { invoices: [...], total: N }"
echo "  Fields: invoice_id, invoice_number, invoice_date, customer_name, final_amount, payment_status"
echo ""
echo "CHALLANS: Direct array [...]"
echo "  Fields: challan_id, challan_number, challan_date, customer_name, total_amount, delivery_status"
echo ""
echo "SALES ORDERS: { orders: [...], total: N, page: N, per_page: N }"
echo "  Fields: order_id, order_number, order_date, customer_name, total_amount, order_status"
echo ""
