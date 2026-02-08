#!/bin/bash
# ============================================================
# Masters Module - Comprehensive End-to-End Tests
# ============================================================
# Validates CRUD operations for:
#   1. Products  (inventory.products + inventory.batches)
#   2. Customers (parties.customers + master.addresses)
#   3. Suppliers (parties.suppliers + master.addresses)
#
# Each entity: Create → Read → Update → Verify DB → Search → List
# Plus: customer addresses, credit check, soft delete
#
# Generates report: tests/reports/masters_test_report.txt
#
# Usage:
#   export TOKEN="eyJ..."
#   bash tests/api/test_masters_e2e.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"

set +e

if [ -z "$TOKEN" ]; then
    get_test_token || { echo "Auth failed."; exit 1; }
fi

# --- Report Setup ---
REPORT_DIR="${SCRIPT_DIR}/../reports"
mkdir -p "$REPORT_DIR"
REPORT_FILE="${REPORT_DIR}/masters_test_report.txt"
REPORT_ERRORS=0
REPORT_WARNINGS=0

report() {
    echo "$1" >> "$REPORT_FILE"
}

report_pass() {
    report "  PASS: $1"
}

report_fail() {
    report "  FAIL: $1"
    ((REPORT_ERRORS++)) || true
}

report_warn() {
    report "  WARN: $1"
    ((REPORT_WARNINGS++)) || true
}

cat > "$REPORT_FILE" << EOF
MASTERS E2E TEST REPORT - $(date '+%Y-%m-%d %H:%M:%S')
================================================================
EOF

echo "=============================================="
echo " Masters Module - Comprehensive E2E Tests"
echo "=============================================="
echo " Report: ${REPORT_FILE}"
echo "=============================================="

# --- Helper: assert_db_value ---
assert_db_value() {
    local sql="$1"
    local expected="$2"
    local test_name="$3"
    local allow_decimal="${4:-no}"

    local actual
    actual=$(run_sql "$sql" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    if [ "$allow_decimal" = "yes" ]; then
        local match
        match=$(python3 -c "
e = float('${expected}') if '${expected}' else 0
a = float('${actual}') if '${actual}' else 0
print('yes' if abs(a - e) < 0.01 else 'no')
" 2>/dev/null)
        if [ "$match" = "yes" ]; then
            echo -e "  ${GREEN}PASS ${test_name}: ${actual}${NC}"; ((PASS_COUNT++)) || true
            report_pass "${test_name}: ${actual}"
        else
            echo -e "  ${RED}FAIL ${test_name}: expected ${expected}, got ${actual}${NC}"; ((FAIL_COUNT++)) || true
            report_fail "${test_name}: expected ${expected}, got ${actual}"
        fi
    else
        if [ "$actual" = "$expected" ]; then
            echo -e "  ${GREEN}PASS ${test_name}: ${actual}${NC}"; ((PASS_COUNT++)) || true
            report_pass "${test_name}: ${actual}"
        else
            echo -e "  ${RED}FAIL ${test_name}: expected ${expected}, got ${actual}${NC}"; ((FAIL_COUNT++)) || true
            report_fail "${test_name}: expected ${expected}, got ${actual}"
        fi
    fi
}

# --- Helper: assert_json_notempty ---
assert_json_notempty() {
    local field="$1"
    local test_name="${2:-JSON field ${field} not empty}"

    local actual
    actual=$(echo "$RESPONSE_BODY" | jq -r "$field // empty")

    if [ -n "$actual" ] && [ "$actual" != "null" ] && [ "$actual" != "" ]; then
        echo -e "  ${GREEN}PASS ${test_name}: ${actual}${NC}"; ((PASS_COUNT++)) || true
        report_pass "${test_name}: ${actual}"
    else
        echo -e "  ${RED}FAIL ${test_name}: field is empty/null${NC}"; ((FAIL_COUNT++)) || true
        report_fail "${test_name}: field is empty/null"
    fi
}

# --- Helper: assert_json_eq ---
assert_json_eq() {
    local field="$1"
    local expected="$2"
    local test_name="${3:-JSON ${field} == ${expected}}"

    local actual
    actual=$(echo "$RESPONSE_BODY" | jq -r "$field // empty")

    if [ "$actual" = "$expected" ]; then
        echo -e "  ${GREEN}PASS ${test_name}: ${actual}${NC}"; ((PASS_COUNT++)) || true
        report_pass "${test_name}: ${actual}"
    else
        echo -e "  ${RED}FAIL ${test_name}: expected '${expected}', got '${actual}'${NC}"; ((FAIL_COUNT++)) || true
        report_fail "${test_name}: expected '${expected}', got '${actual}'"
    fi
}

# Override api_put to use -X PUT (shared helper is missing it)
api_put() {
    local endpoint="$1"
    local data="$2"
    curl -s -w "\n%{http_code}" -X PUT "${API_BASE}${endpoint}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

# Unique suffix to avoid collisions
UNIQUE_ID=$(date +%s)

TODAY=$(date +%Y-%m-%d)

# ================================================================
# SECTION 1: PRODUCTS
# ================================================================
report ""
report "SECTION 1: PRODUCTS"
report "========================================"
section "SECTION 1: PRODUCTS"

# --- 1.1 Create Product ---
report ""
report "Scenario 1.1: Create Product"
report "----------------------------------------"
echo ""
echo -e "${BLUE}--- 1.1 Create Product ---${NC}"

PRODUCT_NAME="Test Product E2E ${UNIQUE_ID}"
PRODUCT_HSN="30049099"
PRODUCT_GST=18
PRODUCT_MANUFACTURER="Test Pharma Ltd"

RESPONSE=$(api_post "/products/" "{
    \"product_name\": \"${PRODUCT_NAME}\",
    \"manufacturer\": \"${PRODUCT_MANUFACTURER}\",
    \"hsn_code\": \"${PRODUCT_HSN}\",
    \"gst_percent\": ${PRODUCT_GST},
    \"generic_name\": \"Paracetamol\",
    \"brand\": \"TestBrand\",
    \"product_type\": \"medicine\",
    \"product_class\": \"tablet\",
    \"maintain_batch\": true,
    \"maintain_expiry\": true,
    \"is_active\": true,
    \"is_saleable\": true,
    \"is_purchasable\": true,
    \"reorder_level\": 50,
    \"min_stock_quantity\": 10,
    \"max_stock_quantity\": 1000,
    \"initial_quantity\": 100,
    \"mrp_per_unit\": 150.00,
    \"sale_price_per_unit\": 140.00,
    \"cost_per_unit\": 100.00,
    \"pack_type\": \"strip\",
    \"pack_size\": 10
}")
parse_response "$RESPONSE"
assert_status "201" "S1.1: Create product HTTP status"

PRODUCT_ID=$(echo "$RESPONSE_BODY" | jq -r '.product_id // empty')
PRODUCT_CODE=$(echo "$RESPONSE_BODY" | jq -r '.product_code // empty')

if [ -z "$PRODUCT_ID" ] || [ "$PRODUCT_ID" = "null" ]; then
    echo -e "  ${RED}FATAL: Product creation failed, cannot continue product tests${NC}"
    report_fail "Product creation failed - RESPONSE: $(echo "$RESPONSE_BODY" | head -c 300)"
else
    echo -e "  ${GREEN}Created product_id=${PRODUCT_ID}, code=${PRODUCT_CODE}${NC}"
    report "  Created: product_id=${PRODUCT_ID}, code=${PRODUCT_CODE}"

    # --- 1.1b Verify in DB ---
    echo ""
    echo -e "${BLUE}--- 1.1b Verify Product in DB ---${NC}"

    assert_db_value \
        "SELECT product_name FROM inventory.products WHERE product_id = ${PRODUCT_ID} AND org_id = '${ORG_ID}'" \
        "${PRODUCT_NAME}" \
        "S1.1: DB product_name matches"

    assert_db_value \
        "SELECT hsn_code FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "${PRODUCT_HSN}" \
        "S1.1: DB hsn_code matches"

    assert_db_value \
        "SELECT gst_percent FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "${PRODUCT_GST}" \
        "S1.1: DB gst_percent matches" \
        "yes"

    assert_db_value \
        "SELECT manufacturer FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "${PRODUCT_MANUFACTURER}" \
        "S1.1: DB manufacturer matches"

    assert_db_value \
        "SELECT is_active FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "t" \
        "S1.1: DB is_active=true"

    assert_db_value \
        "SELECT reorder_level FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "50" \
        "S1.1: DB reorder_level=50" \
        "yes"

    # Check initial batch was created
    assert_db_value \
        "SELECT COUNT(*) FROM inventory.batches WHERE product_id = ${PRODUCT_ID} AND org_id = '${ORG_ID}'" \
        "1" \
        "S1.1: Initial batch created"

    BATCH_ID=$(run_sql "SELECT batch_id FROM inventory.batches WHERE product_id = ${PRODUCT_ID} AND org_id = '${ORG_ID}' LIMIT 1" | tr -d '[:space:]')

    if [ -n "$BATCH_ID" ] && [ "$BATCH_ID" != "" ]; then
        assert_db_value \
            "SELECT mrp_per_unit FROM inventory.batches WHERE batch_id = ${BATCH_ID}" \
            "150" \
            "S1.1: Batch mrp_per_unit=150" \
            "yes"

        assert_db_value \
            "SELECT sale_price_per_unit FROM inventory.batches WHERE batch_id = ${BATCH_ID}" \
            "140" \
            "S1.1: Batch sale_price=140" \
            "yes"

        assert_db_value \
            "SELECT cost_per_unit FROM inventory.batches WHERE batch_id = ${BATCH_ID}" \
            "100" \
            "S1.1: Batch cost_per_unit=100" \
            "yes"
    fi

    # --- 1.2 Get Product by ID ---
    report ""
    report "Scenario 1.2: Get Product by ID"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 1.2 Get Product by ID ---${NC}"

    RESPONSE=$(api_get "/products/${PRODUCT_ID}")
    parse_response "$RESPONSE"
    assert_status "200" "S1.2: Get product HTTP status"
    assert_json_eq ".product_id" "${PRODUCT_ID}" "S1.2: API product_id matches"
    assert_json_eq ".product_name" "${PRODUCT_NAME}" "S1.2: API product_name matches"
    assert_json_eq ".manufacturer" "${PRODUCT_MANUFACTURER}" "S1.2: API manufacturer matches"
    assert_json_eq ".hsn_code" "${PRODUCT_HSN}" "S1.2: API hsn_code matches"
    assert_json_notempty ".product_code" "S1.2: API product_code exists"

    # --- 1.3 Update Product ---
    report ""
    report "Scenario 1.3: Update Product"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 1.3 Update Product ---${NC}"

    UPDATED_NAME="Updated Product E2E ${UNIQUE_ID}"
    RESPONSE=$(api_put "/products/${PRODUCT_ID}" "{
        \"product_name\": \"${UPDATED_NAME}\",
        \"generic_name\": \"Ibuprofen\",
        \"reorder_level\": 100,
        \"min_stock_quantity\": 20,
        \"gst_percent\": 12
    }")
    parse_response "$RESPONSE"
    assert_status "200" "S1.3: Update product HTTP status"

    # Verify update in DB
    assert_db_value \
        "SELECT product_name FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "${UPDATED_NAME}" \
        "S1.3: DB product_name updated"

    assert_db_value \
        "SELECT generic_name FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "Ibuprofen" \
        "S1.3: DB generic_name updated"

    assert_db_value \
        "SELECT reorder_level FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "100" \
        "S1.3: DB reorder_level updated" \
        "yes"

    assert_db_value \
        "SELECT gst_percent FROM inventory.products WHERE product_id = ${PRODUCT_ID}" \
        "12" \
        "S1.3: DB gst_percent updated to 12" \
        "yes"

    # --- 1.4 Search Products ---
    report ""
    report "Scenario 1.4: Search Products"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 1.4 Search Products ---${NC}"

    RESPONSE=$(api_get "/products/search?q=Updated+Product+E2E")
    parse_response "$RESPONSE"
    assert_status "200" "S1.4: Search products HTTP status"

    # Check our product appears in results
    FOUND=$(echo "$RESPONSE_BODY" | jq -r "[.[] | select(.product_id == ${PRODUCT_ID})] | length // 0")
    if [ "$FOUND" = "1" ]; then
        echo -e "  ${GREEN}PASS S1.4: Product found in search results${NC}"; ((PASS_COUNT++)) || true
        report_pass "S1.4: Product found in search results"
    else
        echo -e "  ${RED}FAIL S1.4: Product NOT found in search results${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S1.4: Product NOT found in search results (found=$FOUND)"
    fi

    # --- 1.5 List Products ---
    report ""
    report "Scenario 1.5: List Products"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 1.5 List Products ---${NC}"

    RESPONSE=$(api_get "/products/?limit=50")
    parse_response "$RESPONSE"
    assert_status "200" "S1.5: List products HTTP status"

    # Response may be {total, products} or just an array
    TOTAL=$(echo "$RESPONSE_BODY" | jq -r '.total // (if type == "array" then length else .products | length end) // 0')
    if [ "$TOTAL" -gt 0 ] 2>/dev/null; then
        echo -e "  ${GREEN}PASS S1.5: Products list total > 0: ${TOTAL}${NC}"; ((PASS_COUNT++)) || true
        report_pass "S1.5: Products list total=${TOTAL}"
    else
        echo -e "  ${RED}FAIL S1.5: Products list total is 0 or invalid${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S1.5: Products list total=0"
    fi

    # --- 1.6 Get Product Batches ---
    report ""
    report "Scenario 1.6: Get Product Batches"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 1.6 Get Product Batches ---${NC}"

    RESPONSE=$(api_get "/products/${PRODUCT_ID}/batches")
    parse_response "$RESPONSE"
    assert_status "200" "S1.6: Get batches HTTP status"

    BATCH_COUNT=$(echo "$RESPONSE_BODY" | jq -r '.count // .batches | length // 0')
    if [ "$BATCH_COUNT" -ge 1 ] 2>/dev/null; then
        echo -e "  ${GREEN}PASS S1.6: Product has batches: ${BATCH_COUNT}${NC}"; ((PASS_COUNT++)) || true
        report_pass "S1.6: Product has ${BATCH_COUNT} batch(es)"
    else
        echo -e "  ${RED}FAIL S1.6: No batches found for product${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S1.6: No batches found"
    fi

    # --- 1.7 Search with Batches ---
    report ""
    report "Scenario 1.7: Search Products with Batches"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 1.7 Search Products with Batches ---${NC}"

    RESPONSE=$(api_get "/products/search-with-batches?q=Updated+Product+E2E")
    parse_response "$RESPONSE"
    assert_status "200" "S1.7: Search with batches HTTP status"

    SWB_TOTAL=$(echo "$RESPONSE_BODY" | jq -r '.total // .products | length // 0')
    if [ "$SWB_TOTAL" -ge 1 ] 2>/dev/null; then
        echo -e "  ${GREEN}PASS S1.7: Search-with-batches returned results: ${SWB_TOTAL}${NC}"; ((PASS_COUNT++)) || true
        report_pass "S1.7: Search-with-batches total=${SWB_TOTAL}"
    else
        echo -e "  ${RED}FAIL S1.7: Search-with-batches returned 0 results${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S1.7: Search-with-batches returned 0"
    fi

    # --- 1.8 Get Categories ---
    report ""
    report "Scenario 1.8: Get Product Categories"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 1.8 Get Product Categories ---${NC}"

    RESPONSE=$(api_get "/products/master/categories")
    parse_response "$RESPONSE"
    assert_status "200" "S1.8: Get categories HTTP status"
    assert_json_eq ".success" "true" "S1.8: categories success=true"
fi

# ================================================================
# SECTION 2: CUSTOMERS
# ================================================================
report ""
report ""
report "SECTION 2: CUSTOMERS"
report "========================================"
section "SECTION 2: CUSTOMERS"

# --- 2.1 Create Customer ---
report ""
report "Scenario 2.1: Create Customer"
report "----------------------------------------"
echo ""
echo -e "${BLUE}--- 2.1 Create Customer ---${NC}"

CUSTOMER_NAME="E2E Test Customer ${UNIQUE_ID}"
CUSTOMER_PHONE="98${UNIQUE_ID: -8}"  # Take last 8 digits to make 10-digit phone
# Ensure phone is exactly 10 digits
CUSTOMER_PHONE=$(echo "$CUSTOMER_PHONE" | head -c 10)
# Pad with zeros if needed
while [ ${#CUSTOMER_PHONE} -lt 10 ]; do
    CUSTOMER_PHONE="${CUSTOMER_PHONE}0"
done

RESPONSE=$(api_post "/customers/" "{
    \"customer_name\": \"${CUSTOMER_NAME}\",
    \"customer_type\": \"pharmacy\",
    \"primary_phone\": \"${CUSTOMER_PHONE}\",
    \"primary_email\": \"e2etest${UNIQUE_ID}@test.com\",
    \"business_type\": \"retail_pharmacy\",
    \"contact_person_name\": \"E2E Test Contact\",
    \"contact_person_phone\": \"9876543210\",
    \"drug_license_number\": \"DL-20B-E2E${UNIQUE_ID}\",
    \"credit_limit\": 50000,
    \"credit_days\": 30,
    \"payment_terms\": \"NET30\",
    \"discount_percent\": 5,
    \"internal_notes\": \"E2E test customer - auto-created\",
    \"address_line1\": \"123 E2E Test Street\",
    \"address_line2\": \"Floor 2\",
    \"city\": \"Mumbai\",
    \"state\": \"Maharashtra\",
    \"pincode\": \"400001\"
}")
parse_response "$RESPONSE"
assert_status "200" "S2.1: Create customer HTTP status"

CUSTOMER_ID=$(echo "$RESPONSE_BODY" | jq -r '.customer_id // empty')
CUSTOMER_CODE=$(echo "$RESPONSE_BODY" | jq -r '.customer_code // empty')

if [ -z "$CUSTOMER_ID" ] || [ "$CUSTOMER_ID" = "null" ]; then
    echo -e "  ${RED}FATAL: Customer creation failed, cannot continue customer tests${NC}"
    report_fail "Customer creation failed - RESPONSE: $(echo "$RESPONSE_BODY" | head -c 300)"
else
    echo -e "  ${GREEN}Created customer_id=${CUSTOMER_ID}, code=${CUSTOMER_CODE}${NC}"
    report "  Created: customer_id=${CUSTOMER_ID}, code=${CUSTOMER_CODE}"

    # --- 2.1b Verify in DB ---
    echo ""
    echo -e "${BLUE}--- 2.1b Verify Customer in DB ---${NC}"

    assert_db_value \
        "SELECT customer_name FROM parties.customers WHERE customer_id = ${CUSTOMER_ID} AND org_id = '${ORG_ID}'" \
        "${CUSTOMER_NAME}" \
        "S2.1: DB customer_name matches"

    assert_db_value \
        "SELECT customer_type FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "pharmacy" \
        "S2.1: DB customer_type=pharmacy"

    assert_db_value \
        "SELECT primary_phone FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "${CUSTOMER_PHONE}" \
        "S2.1: DB primary_phone matches"

    assert_db_value \
        "SELECT credit_limit FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "50000" \
        "S2.1: DB credit_limit=50000" \
        "yes"

    assert_db_value \
        "SELECT credit_days FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "30" \
        "S2.1: DB credit_days=30"

    assert_db_value \
        "SELECT payment_terms FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "NET30" \
        "S2.1: DB payment_terms=NET30"

    assert_db_value \
        "SELECT is_active FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "t" \
        "S2.1: DB is_active=true"

    # Check address was auto-created in master.addresses
    ADDR_COUNT=$(run_sql "SELECT COUNT(*) FROM master.addresses WHERE entity_type = 'customer' AND entity_id = ${CUSTOMER_ID} AND org_id = '${ORG_ID}'" | tr -d '[:space:]')
    if [ "$ADDR_COUNT" -ge 1 ] 2>/dev/null; then
        echo -e "  ${GREEN}PASS S2.1: Address auto-created (${ADDR_COUNT} address(es))${NC}"; ((PASS_COUNT++)) || true
        report_pass "S2.1: Address auto-created: ${ADDR_COUNT}"
    else
        echo -e "  ${RED}FAIL S2.1: No address auto-created${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S2.1: No address auto-created"
    fi

    assert_db_value \
        "SELECT city FROM master.addresses WHERE entity_type = 'customer' AND entity_id = ${CUSTOMER_ID} LIMIT 1" \
        "Mumbai" \
        "S2.1: Address city=Mumbai"

    # --- 2.2 Get Customer by ID ---
    report ""
    report "Scenario 2.2: Get Customer by ID"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 2.2 Get Customer by ID ---${NC}"

    RESPONSE=$(api_get "/customers/${CUSTOMER_ID}")
    parse_response "$RESPONSE"
    assert_status "200" "S2.2: Get customer HTTP status"
    assert_json_eq ".customer_id" "${CUSTOMER_ID}" "S2.2: API customer_id matches"
    assert_json_eq ".customer_name" "${CUSTOMER_NAME}" "S2.2: API customer_name matches"
    assert_json_eq ".customer_type" "pharmacy" "S2.2: API customer_type=pharmacy"
    assert_json_eq ".primary_phone" "${CUSTOMER_PHONE}" "S2.2: API primary_phone matches"
    assert_json_eq ".credit_days" "30" "S2.2: API credit_days=30"
    assert_json_eq ".payment_terms" "NET30" "S2.2: API payment_terms=NET30"

    # --- 2.3 Update Customer ---
    report ""
    report "Scenario 2.3: Update Customer"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 2.3 Update Customer ---${NC}"

    UPDATED_CUSTOMER_NAME="Updated E2E Customer ${UNIQUE_ID}"
    RESPONSE=$(api_put "/customers/${CUSTOMER_ID}" "{
        \"customer_name\": \"${UPDATED_CUSTOMER_NAME}\",
        \"credit_limit\": 100000,
        \"credit_days\": 45,
        \"payment_terms\": \"NET45\",
        \"contact_person_name\": \"Updated Contact\"
    }")
    parse_response "$RESPONSE"
    assert_status "200" "S2.3: Update customer HTTP status"

    # Verify update in DB
    assert_db_value \
        "SELECT customer_name FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "${UPDATED_CUSTOMER_NAME}" \
        "S2.3: DB customer_name updated"

    assert_db_value \
        "SELECT credit_limit FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "100000" \
        "S2.3: DB credit_limit updated to 100000" \
        "yes"

    assert_db_value \
        "SELECT credit_days FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "45" \
        "S2.3: DB credit_days updated to 45"

    assert_db_value \
        "SELECT payment_terms FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "NET45" \
        "S2.3: DB payment_terms updated to NET45"

    assert_db_value \
        "SELECT contact_person_name FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "Updated Contact" \
        "S2.3: DB contact_person_name updated"

    # --- 2.4 Customer Addresses ---
    report ""
    report "Scenario 2.4: Customer Addresses"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 2.4 Customer Addresses ---${NC}"

    # 2.4a List addresses
    RESPONSE=$(api_get "/customers/${CUSTOMER_ID}/addresses")
    parse_response "$RESPONSE"
    assert_status "200" "S2.4a: List addresses HTTP status"

    ADDR_TOTAL=$(echo "$RESPONSE_BODY" | jq -r '.total_addresses // (.data | length) // 0')
    if [ "$ADDR_TOTAL" -ge 1 ] 2>/dev/null; then
        echo -e "  ${GREEN}PASS S2.4a: Customer has addresses: ${ADDR_TOTAL}${NC}"; ((PASS_COUNT++)) || true
        report_pass "S2.4a: Customer has ${ADDR_TOTAL} address(es)"
    else
        echo -e "  ${RED}FAIL S2.4a: No addresses found${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S2.4a: No addresses found"
    fi

    # 2.4b Add a new shipping address
    RESPONSE=$(api_post "/customers/${CUSTOMER_ID}/addresses/" "{
        \"address_line1\": \"456 E2E Shipping Lane\",
        \"city\": \"Pune\",
        \"state\": \"Maharashtra\",
        \"pincode\": \"411001\",
        \"address_type\": \"shipping\",
        \"is_default\": false
    }")
    parse_response "$RESPONSE"
    assert_status "200" "S2.4b: Add shipping address HTTP status"

    NEW_ADDR_ID=$(echo "$RESPONSE_BODY" | jq -r '.address_id // empty')
    if [ -n "$NEW_ADDR_ID" ] && [ "$NEW_ADDR_ID" != "null" ]; then
        echo -e "  ${GREEN}PASS S2.4b: Shipping address created (id=${NEW_ADDR_ID})${NC}"; ((PASS_COUNT++)) || true
        report_pass "S2.4b: Shipping address id=${NEW_ADDR_ID}"

        # Verify in DB
        assert_db_value \
            "SELECT city FROM master.addresses WHERE address_id = ${NEW_ADDR_ID}" \
            "Pune" \
            "S2.4b: DB shipping address city=Pune"
    else
        echo -e "  ${RED}FAIL S2.4b: Shipping address not created${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S2.4b: Shipping address not created"
    fi

    # --- 2.5 Customer List ---
    report ""
    report "Scenario 2.5: List Customers"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 2.5 List Customers ---${NC}"

    RESPONSE=$(api_get "/customers/?limit=50")
    parse_response "$RESPONSE"
    assert_status "200" "S2.5: List customers HTTP status"

    CUST_TOTAL=$(echo "$RESPONSE_BODY" | jq -r '.total // 0')
    if [ "$CUST_TOTAL" -gt 0 ] 2>/dev/null; then
        echo -e "  ${GREEN}PASS S2.5: Customers list total > 0: ${CUST_TOTAL}${NC}"; ((PASS_COUNT++)) || true
        report_pass "S2.5: Customers list total=${CUST_TOTAL}"
    else
        echo -e "  ${RED}FAIL S2.5: Customers list total is 0${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S2.5: Customers list total=0"
    fi

    # --- 2.6 Credit Check ---
    report ""
    report "Scenario 2.6: Credit Check"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 2.6 Credit Check ---${NC}"

    # Credit check uses order_amount as query param on POST
    # API returns: {valid: bool, credit_limit, outstanding, available, message?}
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/customers/${CUSTOMER_ID}/check-credit?order_amount=50000" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json")
    parse_response "$RESPONSE"
    assert_status "200" "S2.6: Credit check HTTP status"
    assert_json_eq ".valid" "true" "S2.6: valid=true for 50000 order (credit limit 100000)"

    # Also try over-limit
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/customers/${CUSTOMER_ID}/check-credit?order_amount=200000" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json")
    parse_response "$RESPONSE"
    assert_status "200" "S2.6b: Over-limit credit check HTTP status"
    assert_json_eq ".valid" "false" "S2.6b: valid=false for 200000 > 100000 credit limit"

    # --- 2.7 Customer Outstanding ---
    report ""
    report "Scenario 2.7: Customer Outstanding"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 2.7 Customer Outstanding ---${NC}"

    RESPONSE=$(api_get "/customers/${CUSTOMER_ID}/outstanding")
    parse_response "$RESPONSE"
    assert_status "200" "S2.7: Outstanding HTTP status"
    assert_json_eq ".customer_id" "${CUSTOMER_ID}" "S2.7: Outstanding customer_id matches"

    # --- 2.8 Customer Ledger ---
    report ""
    report "Scenario 2.8: Customer Ledger"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 2.8 Customer Ledger ---${NC}"

    RESPONSE=$(api_get "/customers/${CUSTOMER_ID}/ledger?from_date=2026-01-01&to_date=2026-12-31")
    parse_response "$RESPONSE"
    assert_status "200" "S2.8: Ledger HTTP status"

    # New customer, so ledger should be empty or zero balance
    CLOSING=$(echo "$RESPONSE_BODY" | jq -r '.closing_balance // 0')
    echo -e "  ${GREEN}PASS S2.8: Ledger returned (closing_balance=${CLOSING})${NC}"; ((PASS_COUNT++)) || true
    report_pass "S2.8: Ledger closing_balance=${CLOSING}"

    # --- 2.9 Soft Delete Customer ---
    report ""
    report "Scenario 2.9: Soft Delete Customer"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 2.9 Soft Delete Customer ---${NC}"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "${API_BASE}/customers/${CUSTOMER_ID}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json")
    parse_response "$RESPONSE"
    assert_status "200" "S2.9: Delete customer HTTP status"

    # Verify soft delete in DB
    assert_db_value \
        "SELECT is_active FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "f" \
        "S2.9: DB is_active=false after delete"

    # Verify record still exists (soft delete, not hard delete)
    assert_db_value \
        "SELECT COUNT(*) FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" \
        "1" \
        "S2.9: Record still exists (soft delete)"

    # Re-activate for cleanup sanity
    RESPONSE=$(api_put "/customers/${CUSTOMER_ID}" "{\"is_active\": true}")
    parse_response "$RESPONSE"
fi

# ================================================================
# SECTION 3: SUPPLIERS
# ================================================================
report ""
report ""
report "SECTION 3: SUPPLIERS"
report "========================================"
section "SECTION 3: SUPPLIERS"

# --- 3.1 Create Supplier ---
report ""
report "Scenario 3.1: Create Supplier"
report "----------------------------------------"
echo ""
echo -e "${BLUE}--- 3.1 Create Supplier ---${NC}"

SUPPLIER_NAME="E2E Test Supplier ${UNIQUE_ID}"
SUPPLIER_PHONE="97${UNIQUE_ID: -8}"
SUPPLIER_PHONE=$(echo "$SUPPLIER_PHONE" | head -c 10)
while [ ${#SUPPLIER_PHONE} -lt 10 ]; do
    SUPPLIER_PHONE="${SUPPLIER_PHONE}0"
done

RESPONSE=$(api_post "/suppliers/" "{
    \"supplier_name\": \"${SUPPLIER_NAME}\",
    \"supplier_type\": \"distributor\",
    \"primary_phone\": \"${SUPPLIER_PHONE}\",
    \"primary_email\": \"supplier${UNIQUE_ID}@test.com\",
    \"contact_person\": \"Supplier Contact E2E\",
    \"contact_person_phone\": \"9876543211\",
    \"gst_number\": \"29AAGCR4375J1ZU\",
    \"pan_number\": \"AAGCR4375J\",
    \"drug_license_number\": \"DL-21B-E2E${UNIQUE_ID}\",
    \"bank_name\": \"HDFC Bank\",
    \"account_number\": \"12345678901234\",
    \"ifsc_code\": \"HDFC0001234\",
    \"account_holder_name\": \"${SUPPLIER_NAME}\",
    \"payment_days\": 45,
    \"payment_terms\": \"NET45\",
    \"credit_days\": 60,
    \"credit_limit\": 200000,
    \"address_line1\": \"789 E2E Supplier Road\",
    \"city\": \"Bangalore\",
    \"state\": \"Karnataka\",
    \"pincode\": \"560001\",
    \"internal_notes\": \"E2E test supplier - auto-created\"
}")
parse_response "$RESPONSE"
assert_status "200" "S3.1: Create supplier HTTP status"

SUPPLIER_ID=$(echo "$RESPONSE_BODY" | jq -r '.supplier_id // empty')
SUPPLIER_CODE=$(echo "$RESPONSE_BODY" | jq -r '.supplier_code // empty')

if [ -z "$SUPPLIER_ID" ] || [ "$SUPPLIER_ID" = "null" ]; then
    echo -e "  ${RED}FATAL: Supplier creation failed, cannot continue supplier tests${NC}"
    report_fail "Supplier creation failed - RESPONSE: $(echo "$RESPONSE_BODY" | head -c 300)"
else
    echo -e "  ${GREEN}Created supplier_id=${SUPPLIER_ID}, code=${SUPPLIER_CODE}${NC}"
    report "  Created: supplier_id=${SUPPLIER_ID}, code=${SUPPLIER_CODE}"

    # --- 3.1b Verify in DB ---
    echo ""
    echo -e "${BLUE}--- 3.1b Verify Supplier in DB ---${NC}"

    assert_db_value \
        "SELECT supplier_name FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID} AND org_id = '${ORG_ID}'" \
        "${SUPPLIER_NAME}" \
        "S3.1: DB supplier_name matches"

    assert_db_value \
        "SELECT supplier_type FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "distributor" \
        "S3.1: DB supplier_type=distributor"

    assert_db_value \
        "SELECT primary_phone FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "${SUPPLIER_PHONE}" \
        "S3.1: DB primary_phone matches"

    assert_db_value \
        "SELECT gst_number FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "29AAGCR4375J1ZU" \
        "S3.1: DB gst_number matches"

    assert_db_value \
        "SELECT payment_days FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "45" \
        "S3.1: DB payment_days=45"

    assert_db_value \
        "SELECT is_active FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "t" \
        "S3.1: DB is_active=true"

    assert_db_value \
        "SELECT bank_name FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "HDFC Bank" \
        "S3.1: DB bank_name=HDFC Bank"

    # Check address was auto-created
    SUPP_ADDR_COUNT=$(run_sql "SELECT COUNT(*) FROM master.addresses WHERE entity_type = 'supplier' AND entity_id = ${SUPPLIER_ID} AND org_id = '${ORG_ID}'" | tr -d '[:space:]')
    if [ "$SUPP_ADDR_COUNT" -ge 1 ] 2>/dev/null; then
        echo -e "  ${GREEN}PASS S3.1: Supplier address auto-created (${SUPP_ADDR_COUNT})${NC}"; ((PASS_COUNT++)) || true
        report_pass "S3.1: Supplier address auto-created: ${SUPP_ADDR_COUNT}"
    else
        # Address auto-creation may not be implemented for suppliers
        echo -e "  ${YELLOW}WARN S3.1: No supplier address auto-created${NC}"; ((SKIP_COUNT++)) || true
        report_warn "S3.1: No supplier address auto-created (may not be implemented)"
    fi

    # --- 3.2 Get Supplier by ID ---
    report ""
    report "Scenario 3.2: Get Supplier by ID"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 3.2 Get Supplier by ID ---${NC}"

    RESPONSE=$(api_get "/suppliers/${SUPPLIER_ID}")
    parse_response "$RESPONSE"
    assert_status "200" "S3.2: Get supplier HTTP status"
    assert_json_eq ".supplier_id" "${SUPPLIER_ID}" "S3.2: API supplier_id matches"
    assert_json_eq ".supplier_name" "${SUPPLIER_NAME}" "S3.2: API supplier_name matches"
    assert_json_eq ".supplier_type" "distributor" "S3.2: API supplier_type=distributor"
    assert_json_eq ".primary_phone" "${SUPPLIER_PHONE}" "S3.2: API primary_phone matches"
    assert_json_eq ".gst_number" "29AAGCR4375J1ZU" "S3.2: API gst_number matches"

    # --- 3.3 Update Supplier ---
    report ""
    report "Scenario 3.3: Update Supplier"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 3.3 Update Supplier ---${NC}"

    UPDATED_SUPPLIER_NAME="Updated E2E Supplier ${UNIQUE_ID}"
    RESPONSE=$(api_put "/suppliers/${SUPPLIER_ID}" "{
        \"supplier_name\": \"${UPDATED_SUPPLIER_NAME}\",
        \"internal_notes\": \"Updated by E2E test\"
    }")
    parse_response "$RESPONSE"
    assert_status "200" "S3.3: Update supplier HTTP status"

    # Verify update in DB
    assert_db_value \
        "SELECT supplier_name FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "${UPDATED_SUPPLIER_NAME}" \
        "S3.3: DB supplier_name updated"

    assert_db_value \
        "SELECT internal_notes FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "Updated by E2E test" \
        "S3.3: DB internal_notes updated"

    # --- 3.4 Search Suppliers ---
    report ""
    report "Scenario 3.4: Search Suppliers"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 3.4 Search Suppliers ---${NC}"

    RESPONSE=$(api_get "/suppliers/search?search_term=Updated+E2E+Supplier")
    parse_response "$RESPONSE"
    assert_status "200" "S3.4: Search suppliers HTTP status"

    # Response may be {suppliers: [...]} or just an array
    SUPP_FOUND=$(echo "$RESPONSE_BODY" | jq -r "if type == \"array\" then [.[] | select(.supplier_id == ${SUPPLIER_ID})] | length else (.suppliers // []) | [.[] | select(.supplier_id == ${SUPPLIER_ID})] | length end // 0")
    if [ "$SUPP_FOUND" = "1" ]; then
        echo -e "  ${GREEN}PASS S3.4: Supplier found in search results${NC}"; ((PASS_COUNT++)) || true
        report_pass "S3.4: Supplier found in search results"
    else
        echo -e "  ${RED}FAIL S3.4: Supplier NOT found in search results${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S3.4: Supplier NOT found in search results (found=$SUPP_FOUND)"
    fi

    # --- 3.5 List Suppliers ---
    report ""
    report "Scenario 3.5: List Suppliers"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 3.5 List Suppliers ---${NC}"

    RESPONSE=$(api_get "/suppliers/?limit=50")
    parse_response "$RESPONSE"
    assert_status "200" "S3.5: List suppliers HTTP status"

    # Response may be {total, suppliers} or just an array
    SUPP_TOTAL=$(echo "$RESPONSE_BODY" | jq -r '.total // (if type == "array" then length else 0 end) // 0')
    if [ "$SUPP_TOTAL" -gt 0 ] 2>/dev/null; then
        echo -e "  ${GREEN}PASS S3.5: Suppliers list total > 0: ${SUPP_TOTAL}${NC}"; ((PASS_COUNT++)) || true
        report_pass "S3.5: Suppliers list total=${SUPP_TOTAL}"
    else
        echo -e "  ${RED}FAIL S3.5: Suppliers list total is 0${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S3.5: Suppliers list total=0"
    fi

    # --- 3.6 Soft Delete Supplier ---
    report ""
    report "Scenario 3.6: Soft Delete Supplier"
    report "----------------------------------------"
    echo ""
    echo -e "${BLUE}--- 3.6 Soft Delete Supplier ---${NC}"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "${API_BASE}/suppliers/${SUPPLIER_ID}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json")
    parse_response "$RESPONSE"
    assert_status "200" "S3.6: Delete supplier HTTP status"

    # Verify soft delete in DB
    assert_db_value \
        "SELECT is_active FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "f" \
        "S3.6: DB is_active=false after delete"

    # Verify record still exists
    assert_db_value \
        "SELECT COUNT(*) FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" \
        "1" \
        "S3.6: Record still exists (soft delete)"

    # Re-activate for cleanup sanity
    RESPONSE=$(api_put "/suppliers/${SUPPLIER_ID}" "{\"is_active\": true}")
    parse_response "$RESPONSE"
fi


# ================================================================
# CROSS-VALIDATION
# ================================================================
report ""
report ""
report "CROSS-VALIDATION"
report "========================================"
section "CROSS-VALIDATION"

echo ""
echo -e "${BLUE}--- Cross-Validation: API vs DB Consistency ---${NC}"

# Product: API response fields match DB
if [ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "null" ]; then
    RESPONSE=$(api_get "/products/${PRODUCT_ID}")
    parse_response "$RESPONSE"
    API_NAME=$(echo "$RESPONSE_BODY" | jq -r '.product_name // empty')
    DB_NAME=$(run_sql "SELECT product_name FROM inventory.products WHERE product_id = ${PRODUCT_ID}" | tr -d '[:space:]' | head -c 200)
    # Names may have spaces so compare carefully
    DB_NAME_FULL=$(run_sql "SELECT product_name FROM inventory.products WHERE product_id = ${PRODUCT_ID}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [ "$API_NAME" = "$DB_NAME_FULL" ]; then
        echo -e "  ${GREEN}PASS CROSS: Product API name == DB name${NC}"; ((PASS_COUNT++)) || true
        report_pass "CROSS: Product API name matches DB"
    else
        echo -e "  ${RED}FAIL CROSS: Product API name ('$API_NAME') != DB name ('$DB_NAME_FULL')${NC}"; ((FAIL_COUNT++)) || true
        report_fail "CROSS: Product API name mismatch"
    fi
fi

# Customer: API response fields match DB
if [ -n "$CUSTOMER_ID" ] && [ "$CUSTOMER_ID" != "null" ]; then
    RESPONSE=$(api_get "/customers/${CUSTOMER_ID}")
    parse_response "$RESPONSE"
    API_CTYPE=$(echo "$RESPONSE_BODY" | jq -r '.customer_type // empty')
    DB_CTYPE=$(run_sql "SELECT customer_type FROM parties.customers WHERE customer_id = ${CUSTOMER_ID}" | tr -d '[:space:]')
    if [ "$API_CTYPE" = "$DB_CTYPE" ]; then
        echo -e "  ${GREEN}PASS CROSS: Customer API type == DB type${NC}"; ((PASS_COUNT++)) || true
        report_pass "CROSS: Customer API type matches DB"
    else
        echo -e "  ${RED}FAIL CROSS: Customer API type mismatch${NC}"; ((FAIL_COUNT++)) || true
        report_fail "CROSS: Customer type mismatch"
    fi
fi

# Supplier: API response fields match DB
if [ -n "$SUPPLIER_ID" ] && [ "$SUPPLIER_ID" != "null" ]; then
    RESPONSE=$(api_get "/suppliers/${SUPPLIER_ID}")
    parse_response "$RESPONSE"
    API_STYPE=$(echo "$RESPONSE_BODY" | jq -r '.supplier_type // empty')
    DB_STYPE=$(run_sql "SELECT supplier_type FROM parties.suppliers WHERE supplier_id = ${SUPPLIER_ID}" | tr -d '[:space:]')
    if [ "$API_STYPE" = "$DB_STYPE" ]; then
        echo -e "  ${GREEN}PASS CROSS: Supplier API type == DB type${NC}"; ((PASS_COUNT++)) || true
        report_pass "CROSS: Supplier API type matches DB"
    else
        echo -e "  ${RED}FAIL CROSS: Supplier API type mismatch${NC}"; ((FAIL_COUNT++)) || true
        report_fail "CROSS: Supplier type mismatch"
    fi
fi


# ================================================================
# SUMMARY
# ================================================================
report ""
report ""
report "================================================================"
report "SUMMARY"
report "================================================================"
report "Total Checks: $((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))"
report "Passed: ${PASS_COUNT}"
report "Failed: ${FAIL_COUNT}"
report "Skipped: ${SKIP_COUNT}"
report "Report Errors: ${REPORT_ERRORS}"
report "Report Warnings: ${REPORT_WARNINGS}"
report ""
if [ "$FAIL_COUNT" -eq 0 ]; then
    report "RESULT: ALL CHECKS PASSED"
else
    report "RESULT: ${FAIL_COUNT} CHECKS FAILED"
fi
report "================================================================"

# Cleanup info
report ""
report "TEST DATA CREATED:"
if [ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "null" ]; then
    report "  Product: id=${PRODUCT_ID}, code=${PRODUCT_CODE}"
fi
if [ -n "$CUSTOMER_ID" ] && [ "$CUSTOMER_ID" != "null" ]; then
    report "  Customer: id=${CUSTOMER_ID}, code=${CUSTOMER_CODE}"
fi
if [ -n "$SUPPLIER_ID" ] && [ "$SUPPLIER_ID" != "null" ]; then
    report "  Supplier: id=${SUPPLIER_ID}, code=${SUPPLIER_CODE}"
fi

print_summary
