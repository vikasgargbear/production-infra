#!/bin/bash

# Test Party Ledger V2 Endpoints
echo "Testing Party Ledger V2 API Endpoints"
echo "======================================"

# Base URL
BASE_URL="http://localhost:8000/api/party-ledger-v2"

# Test 1: Get Balance
echo -e "\n1. Testing /balance/{party_id}"
curl -s -X GET "$BASE_URL/balance/1?party_type=customer" \
  -H "x-org-id: 1" | python3 -m json.tool

# Test 2: Get Statement  
echo -e "\n2. Testing /statement/{party_id}"
curl -s -X GET "$BASE_URL/statement/1?party_type=customer" \
  -H "x-org-id: 1" | python3 -c "import sys, json; data = json.load(sys.stdin); print(f'Statement entries: {len(data.get(\"statement\", []))}')"

# Test 3: Get Outstanding Bills
echo -e "\n3. Testing /outstanding-bills/{party_id}"
curl -s -X GET "$BASE_URL/outstanding-bills/1?party_type=customer" \
  -H "x-org-id: 1" | python3 -m json.tool

# Test 4: Get Aging Analysis
echo -e "\n4. Testing /aging-analysis"
curl -s -X GET "$BASE_URL/aging-analysis?party_type=customer" \
  -H "x-org-id: 1" | python3 -c "import sys, json; data = json.load(sys.stdin); print(f'Aging data for {len(data.get(\"aging_data\", []))} parties')"

# Test 5: Get Reconciliation
echo -e "\n5. Testing /reconciliation/{party_id}"
curl -s -X GET "$BASE_URL/reconciliation/1?party_type=customer" \
  -H "x-org-id: 1" | python3 -c "import sys, json; data = json.load(sys.stdin); print(f'Unreconciled: {data.get(\"unreconciled_count\", 0)}')"

echo -e "\n======================================"
echo "Test complete. Check for any errors above."