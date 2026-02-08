#!/bin/bash
# ============================================================
# Stock Management - Comprehensive End-to-End Tests
# ============================================================
# Validates ALL 6 tables written during stock management operations:
#   1. inventory.batches              - Stock levels per batch
#   2. inventory.inventory_movements  - Audit trail for every operation
#   3. inventory.location_wise_stock  - Per-location stock tracking
#   4. inventory.stock_writeoffs      - Writeoff headers (S5 only)
#   5. inventory.stock_writeoff_items - Writeoff line items (S5 only)
#   6. compliance.gst_adjustments     - ITC reversal entries (S5 only)
#
# Cross-validates quantities across batches, movements, and LWS.
# Generates report: tests/reports/stock_mgmt_test_report.txt
#
# Scenarios:
#   1. Stock Receive  (+10 units)
#   2. Stock Issue    (-5 units)
#   3. Stock Transfer (3 units, location 5 → test location)
#   4. Stock Adjustment (-2 units, damage)
#   5. Stock Writeoff   (-1 unit, expired, ITC reversal)
#
# Usage:
#   export TOKEN="eyJ..."  # or set TEST_EMAIL/TEST_PASSWORD
#   ./tests/api/test_stock_mgmt_e2e.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"

# Handle errors ourselves
set +e

if [ -z "$TOKEN" ]; then
    get_test_token || { echo "Auth failed."; exit 1; }
fi

# --- Report Setup ---
REPORT_DIR="${SCRIPT_DIR}/../reports"
mkdir -p "$REPORT_DIR"
REPORT_FILE="${REPORT_DIR}/stock_mgmt_test_report.txt"
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

# Initialize report
cat > "$REPORT_FILE" << EOF
STOCK MANAGEMENT E2E TEST REPORT - $(date '+%Y-%m-%d %H:%M:%S')
================================================================
EOF

echo "=============================================="
echo " Stock Management - Comprehensive E2E Tests"
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
    actual=$(run_sql "$sql" | tr -d '[:space:]')

    if [ "$allow_decimal" = "yes" ]; then
        local match
        match=$(python3 -c "
e = float('${expected}') if '${expected}' else 0
a = float('${actual}') if '${actual}' else 0
print('yes' if abs(a - e) < 0.01 else 'no')
" 2>/dev/null)
        if [ "$match" = "yes" ]; then
            echo -e "  ${GREEN}✓ ${test_name}: ${actual}${NC}"; ((PASS_COUNT++)) || true
            report_pass "${test_name}: ${actual}"
        else
            echo -e "  ${RED}✗ ${test_name}: expected ${expected}, got ${actual}${NC}"; ((FAIL_COUNT++)) || true
            report_fail "${test_name}: expected ${expected}, got ${actual}"
        fi
    else
        if [ "$actual" = "$expected" ]; then
            echo -e "  ${GREEN}✓ ${test_name}: ${actual}${NC}"; ((PASS_COUNT++)) || true
            report_pass "${test_name}: ${actual}"
        else
            echo -e "  ${RED}✗ ${test_name}: expected ${expected}, got ${actual}${NC}"; ((FAIL_COUNT++)) || true
            report_fail "${test_name}: expected ${expected}, got ${actual}"
        fi
    fi
}

# --- Helper: cross_validate ---
cross_validate() {
    local val_a="$1"
    local val_b="$2"
    local label="$3"

    local match
    match=$(python3 -c "
a = float('${val_a}') if '${val_a}' not in ('', 'None') else 0
b = float('${val_b}') if '${val_b}' not in ('', 'None') else 0
print('yes' if abs(a - b) < 0.01 else 'no')
" 2>/dev/null || echo "no")
    if [ "$match" = "yes" ]; then
        echo -e "  ${GREEN}✓ ${label}: ${val_a}${NC}"; ((PASS_COUNT++)) || true
        report_pass "${label}: ${val_a}"
    else
        echo -e "  ${RED}✗ ${label}: ${val_a} != ${val_b}${NC}"; ((FAIL_COUNT++)) || true
        report_fail "${label}: ${val_a} != ${val_b}"
    fi
}

TODAY=$(date +%Y-%m-%d)

# ============================================================
# SETUP: Create Second Location + Find Test Data
# ============================================================
section "Setup: Create second location & find test data"
report ""
report "SETUP"
report "------"

# Create test warehouse (idempotent via ON CONFLICT)
TEST_LOC_ID=$(run_sql "
    INSERT INTO inventory.storage_locations (org_id, branch_id, location_code, location_name, location_type)
    VALUES ('${ORG_ID}', ${BRANCH_ID}, 'TEST-WH-2', 'Test Warehouse 2', 'warehouse')
    ON CONFLICT (org_id, location_code) DO UPDATE SET location_name = 'Test Warehouse 2'
    RETURNING location_id
" | head -1 | tr -d '[:space:]')

if [ -z "$TEST_LOC_ID" ] || [ "$TEST_LOC_ID" = "" ]; then
    echo -e "${RED}Failed to create test location${NC}"
    report_fail "Failed to create test location"
    exit 1
fi
echo "  Test location created: location_id=${TEST_LOC_ID}"
report "  Test Location: id=${TEST_LOC_ID}, code=TEST-WH-2"

# Get the primary location (location 5)
PRIMARY_LOC_ID=$(run_sql "
    SELECT location_id FROM inventory.storage_locations
    WHERE org_id = '${ORG_ID}' AND location_code != 'TEST-WH-2'
    ORDER BY location_id LIMIT 1
" | tr -d '[:space:]')
echo "  Primary location: location_id=${PRIMARY_LOC_ID}"
report "  Primary Location: id=${PRIMARY_LOC_ID}"

# Find a product+batch with sufficient stock at primary location
STOCK_DATA=$(run_sql "
    SELECT b.product_id, b.batch_id, b.batch_number, b.quantity_available,
           COALESCE(l.quantity_available, 0) as lws_qty
    FROM inventory.batches b
    LEFT JOIN inventory.location_wise_stock l ON l.batch_id = b.batch_id AND l.location_id = ${PRIMARY_LOC_ID}
    WHERE b.batch_status = 'active'
      AND b.quantity_available > 25
      AND COALESCE(l.quantity_available, 0) > 25
    ORDER BY b.quantity_available DESC
    LIMIT 1
")

if [ -z "$STOCK_DATA" ]; then
    echo -e "${RED}No product with sufficient stock (>25) at location ${PRIMARY_LOC_ID}. Run purchase tests first.${NC}"
    report_fail "No product with sufficient stock found"
    exit 1
fi

PRODUCT_ID=$(echo "$STOCK_DATA" | cut -d'|' -f1 | tr -d '[:space:]')
BATCH_ID=$(echo "$STOCK_DATA" | cut -d'|' -f2 | tr -d '[:space:]')
BATCH_NUMBER=$(echo "$STOCK_DATA" | cut -d'|' -f3 | tr -d '[:space:]')
INITIAL_BATCH_QTY=$(echo "$STOCK_DATA" | cut -d'|' -f4 | tr -d '[:space:]')
INITIAL_LWS_QTY=$(echo "$STOCK_DATA" | cut -d'|' -f5 | tr -d '[:space:]')

echo "  Product: id=${PRODUCT_ID}, batch=${BATCH_ID} (${BATCH_NUMBER})"
echo "  Initial batch qty: ${INITIAL_BATCH_QTY}"
echo "  Initial LWS qty at loc ${PRIMARY_LOC_ID}: ${INITIAL_LWS_QTY}"

report "  Product: id=${PRODUCT_ID}, batch=${BATCH_ID} (${BATCH_NUMBER})"
report "  Initial batch qty: ${INITIAL_BATCH_QTY}"
report "  Initial LWS at location ${PRIMARY_LOC_ID}: ${INITIAL_LWS_QTY}"

# Clean any previous LWS row at test location for this batch (fresh start)
run_sql "DELETE FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${TEST_LOC_ID}" >/dev/null 2>&1

# Track running totals for cross-scenario validation
EXPECTED_BATCH_QTY="${INITIAL_BATCH_QTY}"
EXPECTED_LWS_PRIMARY="${INITIAL_LWS_QTY}"
EXPECTED_LWS_TEST="0"

# ============================================================
# SCENARIO 1: Stock Receive (+10 units at primary location)
# ============================================================
report ""
report ""
report "SCENARIO 1: Stock Receive (+10 units)"
report "========================================"
section "Scenario 1: Stock Receive (+10 units)"

S1_QTY=10

# Snapshot BEFORE
S1_BEFORE_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
S1_BEFORE_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
S1_BEFORE_MV_COUNT=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')

echo "  Before: batch_qty=${S1_BEFORE_BATCH}, lws=${S1_BEFORE_LWS}, movements=${S1_BEFORE_MV_COUNT}"

RECEIVE_DATA='{
    "product_id": '$PRODUCT_ID',
    "batch_id": '$BATCH_ID',
    "quantity": '$S1_QTY',
    "movement_date": "'$TODAY'",
    "reason": "adjustment",
    "notes": "E2E test receive"
}'

parse_response "$(api_post "/stock-movements/receive" "$RECEIVE_DATA")"
assert_status "200" "S1: Stock receive API"

S1_MV_ID=$(echo "$RESPONSE_BODY" | jq -r '.movement_id // empty')
S1_MV_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.movement_number // empty')
echo "  Response: movement_id=${S1_MV_ID}, number=${S1_MV_NUMBER}"
report "  Movement: ${S1_MV_NUMBER} (ID: ${S1_MV_ID})"

if [ -z "$S1_MV_ID" ] || [ "$S1_MV_ID" = "null" ]; then
    echo -e "  ${RED}Receive failed, skipping verifications${NC}"
    report_fail "Stock receive failed"
    skip_test "S1: All verifications"
else
    sleep 1

    # --- TABLE: inventory.inventory_movements ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements"

    assert_db_value \
        "SELECT movement_type FROM inventory.inventory_movements WHERE movement_id = ${S1_MV_ID}" \
        "receive" "S1: movement_type=receive"

    assert_db_value \
        "SELECT movement_direction FROM inventory.inventory_movements WHERE movement_id = ${S1_MV_ID}" \
        "in" "S1: direction=in"

    assert_db_value \
        "SELECT quantity FROM inventory.inventory_movements WHERE movement_id = ${S1_MV_ID}" \
        "${S1_QTY}" "S1: movement qty=${S1_QTY}" "yes"

    assert_db_value \
        "SELECT location_id FROM inventory.inventory_movements WHERE movement_id = ${S1_MV_ID}" \
        "${PRIMARY_LOC_ID}" "S1: location_id=${PRIMARY_LOC_ID}"

    # --- TABLE: inventory.batches ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.batches${NC}"
    report ""
    report "  TABLE: inventory.batches"

    S1_AFTER_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
    S1_EXPECTED_BATCH=$(python3 -c "print(round(float('${S1_BEFORE_BATCH}') + ${S1_QTY}, 2))")
    cross_validate "$S1_AFTER_BATCH" "$S1_EXPECTED_BATCH" "S1: Batch increased by ${S1_QTY} (${S1_BEFORE_BATCH}+${S1_QTY}=${S1_EXPECTED_BATCH})"

    # --- TABLE: inventory.location_wise_stock ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.location_wise_stock${NC}"
    report ""
    report "  TABLE: inventory.location_wise_stock"

    S1_AFTER_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
    S1_EXPECTED_LWS=$(python3 -c "print(round(float('${S1_BEFORE_LWS}') + ${S1_QTY}, 2))")
    cross_validate "$S1_AFTER_LWS" "$S1_EXPECTED_LWS" "S1: LWS at loc ${PRIMARY_LOC_ID} increased by ${S1_QTY}"

    # Update running totals
    EXPECTED_BATCH_QTY=$(python3 -c "print(round(float('${EXPECTED_BATCH_QTY}') + ${S1_QTY}, 2))")
    EXPECTED_LWS_PRIMARY=$(python3 -c "print(round(float('${EXPECTED_LWS_PRIMARY}') + ${S1_QTY}, 2))")
fi

# ============================================================
# SCENARIO 2: Stock Issue (-5 units from primary location)
# ============================================================
report ""
report ""
report "SCENARIO 2: Stock Issue (-5 units)"
report "========================================"
section "Scenario 2: Stock Issue (-5 units)"

S2_QTY=5

# Snapshot BEFORE
S2_BEFORE_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
S2_BEFORE_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')

echo "  Before: batch_qty=${S2_BEFORE_BATCH}, lws=${S2_BEFORE_LWS}"

ISSUE_DATA='{
    "product_id": '$PRODUCT_ID',
    "batch_id": '$BATCH_ID',
    "quantity": '$S2_QTY',
    "movement_date": "'$TODAY'",
    "reason": "damaged",
    "notes": "E2E test issue"
}'

parse_response "$(api_post "/stock-movements/issue" "$ISSUE_DATA")"
assert_status "200" "S2: Stock issue API"

S2_MV_ID=$(echo "$RESPONSE_BODY" | jq -r '.movement_id // empty')
S2_MV_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.movement_number // empty')
echo "  Response: movement_id=${S2_MV_ID}, number=${S2_MV_NUMBER}"
report "  Movement: ${S2_MV_NUMBER} (ID: ${S2_MV_ID})"

if [ -z "$S2_MV_ID" ] || [ "$S2_MV_ID" = "null" ]; then
    echo -e "  ${RED}Issue failed, skipping verifications${NC}"
    report_fail "Stock issue failed"
    skip_test "S2: All verifications"
else
    sleep 1

    # --- TABLE: inventory.inventory_movements ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements"

    assert_db_value \
        "SELECT movement_type FROM inventory.inventory_movements WHERE movement_id = ${S2_MV_ID}" \
        "issue" "S2: movement_type=issue"

    assert_db_value \
        "SELECT movement_direction FROM inventory.inventory_movements WHERE movement_id = ${S2_MV_ID}" \
        "out" "S2: direction=out"

    assert_db_value \
        "SELECT quantity FROM inventory.inventory_movements WHERE movement_id = ${S2_MV_ID}" \
        "${S2_QTY}" "S2: movement qty=${S2_QTY}" "yes"

    # --- TABLE: inventory.batches ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.batches${NC}"
    report ""
    report "  TABLE: inventory.batches"

    S2_AFTER_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
    S2_EXPECTED_BATCH=$(python3 -c "print(round(float('${S2_BEFORE_BATCH}') - ${S2_QTY}, 2))")
    cross_validate "$S2_AFTER_BATCH" "$S2_EXPECTED_BATCH" "S2: Batch decreased by ${S2_QTY} (${S2_BEFORE_BATCH}-${S2_QTY}=${S2_EXPECTED_BATCH})"

    # --- TABLE: inventory.location_wise_stock ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.location_wise_stock${NC}"
    report ""
    report "  TABLE: inventory.location_wise_stock"

    S2_AFTER_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
    S2_EXPECTED_LWS=$(python3 -c "print(round(float('${S2_BEFORE_LWS}') - ${S2_QTY}, 2))")
    cross_validate "$S2_AFTER_LWS" "$S2_EXPECTED_LWS" "S2: LWS at loc ${PRIMARY_LOC_ID} decreased by ${S2_QTY}"

    # Update running totals
    EXPECTED_BATCH_QTY=$(python3 -c "print(round(float('${EXPECTED_BATCH_QTY}') - ${S2_QTY}, 2))")
    EXPECTED_LWS_PRIMARY=$(python3 -c "print(round(float('${EXPECTED_LWS_PRIMARY}') - ${S2_QTY}, 2))")
fi

# ============================================================
# SCENARIO 3: Stock Transfer (3 units, primary → test location)
# ============================================================
report ""
report ""
report "SCENARIO 3: Stock Transfer (3 units, loc ${PRIMARY_LOC_ID} -> loc ${TEST_LOC_ID})"
report "========================================"
section "Scenario 3: Stock Transfer (3 units, loc ${PRIMARY_LOC_ID} -> loc ${TEST_LOC_ID})"

S3_QTY=3

# Snapshot BEFORE
S3_BEFORE_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
S3_BEFORE_LWS_SRC=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
S3_BEFORE_LWS_DST=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${TEST_LOC_ID}" | tr -d '[:space:]')

echo "  Before: batch_qty=${S3_BEFORE_BATCH}, lws_src=${S3_BEFORE_LWS_SRC}, lws_dst=${S3_BEFORE_LWS_DST}"

TRANSFER_DATA='{
    "product_id": '$PRODUCT_ID',
    "batch_id": '$BATCH_ID',
    "quantity": '$S3_QTY',
    "movement_date": "'$TODAY'",
    "source_location": '$PRIMARY_LOC_ID',
    "destination_location": '$TEST_LOC_ID',
    "reason": "E2E test transfer",
    "notes": "E2E test transfer to test warehouse"
}'

parse_response "$(api_post "/stock-movements/transfer" "$TRANSFER_DATA")"
assert_status "200" "S3: Stock transfer API"

S3_MV_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.movement_number // empty')
S3_OUT_MV_ID=$(echo "$RESPONSE_BODY" | jq -r '.out_movement_id // empty')
S3_IN_MV_ID=$(echo "$RESPONSE_BODY" | jq -r '.in_movement_id // empty')
echo "  Response: number=${S3_MV_NUMBER}, out_id=${S3_OUT_MV_ID}, in_id=${S3_IN_MV_ID}"
report "  Transfer: ${S3_MV_NUMBER} (out=${S3_OUT_MV_ID}, in=${S3_IN_MV_ID})"

if [ -z "$S3_OUT_MV_ID" ] || [ "$S3_OUT_MV_ID" = "null" ]; then
    echo -e "  ${RED}Transfer failed, skipping verifications${NC}"
    report_fail "Stock transfer failed"
    skip_test "S3: All verifications"
else
    sleep 1

    # --- TABLE: inventory.inventory_movements (2 rows) ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements (transfer_out)${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements (transfer_out)"

    assert_db_value \
        "SELECT movement_type FROM inventory.inventory_movements WHERE movement_id = ${S3_OUT_MV_ID}" \
        "transfer_out" "S3: OUT movement_type=transfer_out"

    assert_db_value \
        "SELECT movement_direction FROM inventory.inventory_movements WHERE movement_id = ${S3_OUT_MV_ID}" \
        "out" "S3: OUT direction=out"

    assert_db_value \
        "SELECT quantity FROM inventory.inventory_movements WHERE movement_id = ${S3_OUT_MV_ID}" \
        "${S3_QTY}" "S3: OUT qty=${S3_QTY}" "yes"

    assert_db_value \
        "SELECT location_id FROM inventory.inventory_movements WHERE movement_id = ${S3_OUT_MV_ID}" \
        "${PRIMARY_LOC_ID}" "S3: OUT location_id=${PRIMARY_LOC_ID}"

    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements (transfer_in)${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements (transfer_in)"

    assert_db_value \
        "SELECT movement_type FROM inventory.inventory_movements WHERE movement_id = ${S3_IN_MV_ID}" \
        "transfer_in" "S3: IN movement_type=transfer_in"

    assert_db_value \
        "SELECT movement_direction FROM inventory.inventory_movements WHERE movement_id = ${S3_IN_MV_ID}" \
        "in" "S3: IN direction=in"

    assert_db_value \
        "SELECT quantity FROM inventory.inventory_movements WHERE movement_id = ${S3_IN_MV_ID}" \
        "${S3_QTY}" "S3: IN qty=${S3_QTY}" "yes"

    assert_db_value \
        "SELECT location_id FROM inventory.inventory_movements WHERE movement_id = ${S3_IN_MV_ID}" \
        "${TEST_LOC_ID}" "S3: IN location_id=${TEST_LOC_ID}"

    # --- TABLE: inventory.batches (net zero change for transfer) ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.batches${NC}"
    report ""
    report "  TABLE: inventory.batches"

    S3_AFTER_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
    cross_validate "$S3_AFTER_BATCH" "$S3_BEFORE_BATCH" "S3: Batch qty unchanged (transfer is net-zero): ${S3_AFTER_BATCH}"

    # --- TABLE: inventory.location_wise_stock (source down, dest up) ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.location_wise_stock${NC}"
    report ""
    report "  TABLE: inventory.location_wise_stock"

    S3_AFTER_LWS_SRC=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
    S3_EXPECTED_LWS_SRC=$(python3 -c "print(round(float('${S3_BEFORE_LWS_SRC}') - ${S3_QTY}, 2))")
    cross_validate "$S3_AFTER_LWS_SRC" "$S3_EXPECTED_LWS_SRC" "S3: Source LWS decreased by ${S3_QTY}"

    S3_AFTER_LWS_DST=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${TEST_LOC_ID}" | tr -d '[:space:]')
    S3_EXPECTED_LWS_DST=$(python3 -c "print(round(float('${S3_BEFORE_LWS_DST}') + ${S3_QTY}, 2))")
    cross_validate "$S3_AFTER_LWS_DST" "$S3_EXPECTED_LWS_DST" "S3: Dest LWS increased by ${S3_QTY}"

    # Update running totals (batch unchanged, LWS shifts)
    # Batch qty stays the same for transfers
    EXPECTED_LWS_PRIMARY=$(python3 -c "print(round(float('${EXPECTED_LWS_PRIMARY}') - ${S3_QTY}, 2))")
    EXPECTED_LWS_TEST=$(python3 -c "print(round(float('${EXPECTED_LWS_TEST}') + ${S3_QTY}, 2))")
fi

# ============================================================
# SCENARIO 4: Stock Adjustment (-2 units, damage)
# ============================================================
report ""
report ""
report "SCENARIO 4: Stock Adjustment (-2 units, damage)"
report "========================================"
section "Scenario 4: Stock Adjustment (-2 units, damage)"

S4_QTY=2  # Will be negative in request

# Snapshot BEFORE
S4_BEFORE_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
S4_BEFORE_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')

echo "  Before: batch_qty=${S4_BEFORE_BATCH}, lws=${S4_BEFORE_LWS}"

ADJUST_DATA='{
    "batch_id": '$BATCH_ID',
    "quantity_adjusted": -'$S4_QTY',
    "adjustment_type": "damage",
    "adjustment_date": "'$TODAY'",
    "reason": "E2E test - damaged in transit"
}'

parse_response "$(api_post "/stock-adjustments/" "$ADJUST_DATA")"
assert_status "200" "S4: Stock adjustment API"

S4_MV_ID=$(echo "$RESPONSE_BODY" | jq -r '.movement_id // empty')
S4_OLD_QTY=$(echo "$RESPONSE_BODY" | jq -r '.old_quantity // empty')
S4_NEW_QTY=$(echo "$RESPONSE_BODY" | jq -r '.new_quantity // empty')
S4_ADJ_TYPE=$(echo "$RESPONSE_BODY" | jq -r '.adjustment_type // empty')
echo "  Response: movement_id=${S4_MV_ID}, old=${S4_OLD_QTY}, new=${S4_NEW_QTY}, type=${S4_ADJ_TYPE}"
report "  Adjustment: mvmt_id=${S4_MV_ID}, ${S4_OLD_QTY} -> ${S4_NEW_QTY}"

if [ -z "$S4_MV_ID" ] || [ "$S4_MV_ID" = "null" ]; then
    echo -e "  ${RED}Adjustment failed, skipping verifications${NC}"
    report_fail "Stock adjustment failed"
    skip_test "S4: All verifications"
else
    sleep 1

    # Verify response values
    echo ""
    echo -e "  ${BLUE}API Response Validation${NC}"
    report ""
    report "  API Response"

    cross_validate "$S4_OLD_QTY" "$S4_BEFORE_BATCH" "S4: Response old_qty matches snapshot"
    S4_EXPECTED_NEW=$(python3 -c "print(round(float('${S4_BEFORE_BATCH}') - ${S4_QTY}, 2))")
    cross_validate "$S4_NEW_QTY" "$S4_EXPECTED_NEW" "S4: Response new_qty = old - ${S4_QTY}"

    # --- TABLE: inventory.inventory_movements ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements"

    assert_db_value \
        "SELECT movement_type FROM inventory.inventory_movements WHERE movement_id = ${S4_MV_ID}" \
        "stock_damage" "S4: movement_type=stock_damage"

    assert_db_value \
        "SELECT movement_direction FROM inventory.inventory_movements WHERE movement_id = ${S4_MV_ID}" \
        "out" "S4: direction=out"

    assert_db_value \
        "SELECT quantity FROM inventory.inventory_movements WHERE movement_id = ${S4_MV_ID}" \
        "${S4_QTY}" "S4: movement qty=${S4_QTY} (positive, direction=out)" "yes"

    # --- TABLE: inventory.batches ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.batches${NC}"
    report ""
    report "  TABLE: inventory.batches"

    S4_AFTER_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
    S4_EXPECTED_BATCH=$(python3 -c "print(round(float('${S4_BEFORE_BATCH}') - ${S4_QTY}, 2))")
    cross_validate "$S4_AFTER_BATCH" "$S4_EXPECTED_BATCH" "S4: Batch decreased by ${S4_QTY} (${S4_BEFORE_BATCH}-${S4_QTY}=${S4_EXPECTED_BATCH})"

    # --- TABLE: inventory.location_wise_stock ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.location_wise_stock${NC}"
    report ""
    report "  TABLE: inventory.location_wise_stock"

    S4_AFTER_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
    S4_EXPECTED_LWS=$(python3 -c "print(round(float('${S4_BEFORE_LWS}') - ${S4_QTY}, 2))")
    cross_validate "$S4_AFTER_LWS" "$S4_EXPECTED_LWS" "S4: LWS decreased by ${S4_QTY}"

    # Update running totals
    EXPECTED_BATCH_QTY=$(python3 -c "print(round(float('${EXPECTED_BATCH_QTY}') - ${S4_QTY}, 2))")
    EXPECTED_LWS_PRIMARY=$(python3 -c "print(round(float('${EXPECTED_LWS_PRIMARY}') - ${S4_QTY}, 2))")
fi

# ============================================================
# SCENARIO 5: Stock Writeoff (-1 unit, expired, ITC reversal)
# ============================================================
report ""
report ""
report "SCENARIO 5: Stock Writeoff (-1 unit, expired, ITC reversal)"
report "========================================"
section "Scenario 5: Stock Writeoff (-1 unit, expired, ITC reversal)"

S5_QTY=1
S5_COST=100
S5_GST_PCT=18
S5_ITC=$(python3 -c "print(round(${S5_COST} * ${S5_GST_PCT} / 100, 2))")

# Snapshot BEFORE
S5_BEFORE_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
S5_BEFORE_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
S5_BEFORE_WRITEOFF_COUNT=$(run_sql "SELECT COUNT(*) FROM inventory.stock_writeoffs WHERE org_id = '${ORG_ID}'" | tr -d '[:space:]')
S5_BEFORE_GST_ADJ_COUNT=$(run_sql "SELECT COUNT(*) FROM compliance.gst_adjustments WHERE org_id = '${ORG_ID}'" | tr -d '[:space:]')

echo "  Before: batch_qty=${S5_BEFORE_BATCH}, lws=${S5_BEFORE_LWS}"
echo "  Before: writeoff_count=${S5_BEFORE_WRITEOFF_COUNT}, gst_adj_count=${S5_BEFORE_GST_ADJ_COUNT}"

WRITEOFF_DATA='{
    "write_off_date": "'$TODAY'",
    "reason": "expired",
    "reason_notes": "E2E test writeoff",
    "items": [
        {
            "product_id": '$PRODUCT_ID',
            "batch_id": '$BATCH_ID',
            "quantity": '$S5_QTY',
            "cost_price": '$S5_COST',
            "gst_percent": '$S5_GST_PCT'
        }
    ]
}'

parse_response "$(api_post "/stock-writeoff/" "$WRITEOFF_DATA")"
assert_status "200" "S5: Stock writeoff API"

S5_WRITEOFF_ID=$(echo "$RESPONSE_BODY" | jq -r '.writeoff_id // empty')
S5_WRITEOFF_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.writeoff_number // empty')
S5_TOTAL_COST=$(echo "$RESPONSE_BODY" | jq -r '.total_cost_value // empty')
S5_TOTAL_ITC=$(echo "$RESPONSE_BODY" | jq -r '.total_itc_reversal // empty')
S5_REQUIRES_ITC=$(echo "$RESPONSE_BODY" | jq -r '.requires_itc_reversal // empty')
echo "  Response: writeoff_id=${S5_WRITEOFF_ID}, number=${S5_WRITEOFF_NUMBER}"
echo "  Response: cost=${S5_TOTAL_COST}, itc=${S5_TOTAL_ITC}, requires_itc=${S5_REQUIRES_ITC}"
report "  Writeoff: ${S5_WRITEOFF_NUMBER} (ID: ${S5_WRITEOFF_ID})"

if [ -z "$S5_WRITEOFF_ID" ] || [ "$S5_WRITEOFF_ID" = "null" ]; then
    echo -e "  ${RED}Writeoff failed, skipping verifications${NC}"
    echo -e "  ${RED}Response: $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
    report_fail "Stock writeoff failed"
    skip_test "S5: All verifications"
else
    sleep 1

    # --- API Response Validation ---
    echo ""
    echo -e "  ${BLUE}API Response Validation${NC}"
    report ""
    report "  API Response"

    cross_validate "$S5_TOTAL_COST" "${S5_COST}" "S5: total_cost_value=${S5_COST}"
    cross_validate "$S5_TOTAL_ITC" "${S5_ITC}" "S5: total_itc_reversal=${S5_ITC}"

    if [ "$S5_REQUIRES_ITC" = "true" ]; then
        echo -e "  ${GREEN}✓ S5: requires_itc_reversal=true${NC}"; ((PASS_COUNT++)) || true
        report_pass "S5: requires_itc_reversal=true"
    else
        echo -e "  ${RED}✗ S5: requires_itc_reversal expected true, got ${S5_REQUIRES_ITC}${NC}"; ((FAIL_COUNT++)) || true
        report_fail "S5: requires_itc_reversal expected true, got ${S5_REQUIRES_ITC}"
    fi

    # --- TABLE: inventory.stock_writeoffs ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.stock_writeoffs${NC}"
    report ""
    report "  TABLE: inventory.stock_writeoffs"

    assert_db_value \
        "SELECT COUNT(*) FROM inventory.stock_writeoffs WHERE writeoff_id = '${S5_WRITEOFF_ID}'" \
        "1" "S5: Writeoff header exists"

    assert_db_value \
        "SELECT reason FROM inventory.stock_writeoffs WHERE writeoff_id = '${S5_WRITEOFF_ID}'" \
        "expired" "S5: reason=expired"

    assert_db_value \
        "SELECT status FROM inventory.stock_writeoffs WHERE writeoff_id = '${S5_WRITEOFF_ID}'" \
        "approved" "S5: status=approved"

    S5_DB_COST=$(run_sql "SELECT total_cost_value FROM inventory.stock_writeoffs WHERE writeoff_id = '${S5_WRITEOFF_ID}'" | tr -d '[:space:]')
    cross_validate "$S5_DB_COST" "${S5_COST}" "S5: DB total_cost_value=${S5_COST}"

    S5_DB_ITC=$(run_sql "SELECT total_itc_reversal FROM inventory.stock_writeoffs WHERE writeoff_id = '${S5_WRITEOFF_ID}'" | tr -d '[:space:]')
    cross_validate "$S5_DB_ITC" "${S5_ITC}" "S5: DB total_itc_reversal=${S5_ITC}"

    assert_db_value \
        "SELECT requires_itc_reversal FROM inventory.stock_writeoffs WHERE writeoff_id = '${S5_WRITEOFF_ID}'" \
        "t" "S5: DB requires_itc_reversal=true"

    # --- TABLE: inventory.stock_writeoff_items ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.stock_writeoff_items${NC}"
    report ""
    report "  TABLE: inventory.stock_writeoff_items"

    assert_db_value \
        "SELECT COUNT(*) FROM inventory.stock_writeoff_items WHERE writeoff_id = '${S5_WRITEOFF_ID}'" \
        "1" "S5: 1 writeoff item"

    S5_ITEM_QTY=$(run_sql "SELECT quantity FROM inventory.stock_writeoff_items WHERE writeoff_id = '${S5_WRITEOFF_ID}'" | tr -d '[:space:]')
    cross_validate "$S5_ITEM_QTY" "${S5_QTY}" "S5: Item qty=${S5_QTY}"

    S5_ITEM_COST=$(run_sql "SELECT cost_price FROM inventory.stock_writeoff_items WHERE writeoff_id = '${S5_WRITEOFF_ID}'" | tr -d '[:space:]')
    cross_validate "$S5_ITEM_COST" "${S5_COST}" "S5: Item cost_price=${S5_COST}"

    S5_ITEM_GST=$(run_sql "SELECT gst_percent FROM inventory.stock_writeoff_items WHERE writeoff_id = '${S5_WRITEOFF_ID}'" | tr -d '[:space:]')
    cross_validate "$S5_ITEM_GST" "${S5_GST_PCT}" "S5: Item gst_percent=${S5_GST_PCT}"

    assert_db_value \
        "SELECT product_id FROM inventory.stock_writeoff_items WHERE writeoff_id = '${S5_WRITEOFF_ID}'" \
        "${PRODUCT_ID}" "S5: Item product_id=${PRODUCT_ID}"

    assert_db_value \
        "SELECT batch_id FROM inventory.stock_writeoff_items WHERE writeoff_id = '${S5_WRITEOFF_ID}'" \
        "${BATCH_ID}" "S5: Item batch_id=${BATCH_ID}"

    # --- TABLE: inventory.inventory_movements (writeoff) ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements (writeoff)${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements (writeoff)"

    # Writeoff movements reference by writeoff_id as reference_number
    S5_MV_COUNT=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE movement_type = 'writeoff' AND reference_number = '${S5_WRITEOFF_ID}'" | tr -d '[:space:]')
    assert_db_value \
        "SELECT COUNT(*) FROM inventory.inventory_movements WHERE movement_type = 'writeoff' AND reference_number = '${S5_WRITEOFF_ID}'" \
        "1" "S5: 1 writeoff movement"

    assert_db_value \
        "SELECT movement_direction FROM inventory.inventory_movements WHERE movement_type = 'writeoff' AND reference_number = '${S5_WRITEOFF_ID}'" \
        "out" "S5: Writeoff movement direction=out"

    S5_MV_QTY=$(run_sql "SELECT quantity FROM inventory.inventory_movements WHERE movement_type = 'writeoff' AND reference_number = '${S5_WRITEOFF_ID}'" | tr -d '[:space:]')
    cross_validate "$S5_MV_QTY" "${S5_QTY}" "S5: Writeoff movement qty=${S5_QTY}"

    # --- TABLE: inventory.batches ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.batches${NC}"
    report ""
    report "  TABLE: inventory.batches"

    S5_AFTER_BATCH=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
    S5_EXPECTED_BATCH=$(python3 -c "print(round(float('${S5_BEFORE_BATCH}') - ${S5_QTY}, 2))")
    cross_validate "$S5_AFTER_BATCH" "$S5_EXPECTED_BATCH" "S5: Batch decreased by ${S5_QTY} (${S5_BEFORE_BATCH}-${S5_QTY}=${S5_EXPECTED_BATCH})"

    # --- TABLE: inventory.location_wise_stock ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.location_wise_stock${NC}"
    report ""
    report "  TABLE: inventory.location_wise_stock"

    S5_AFTER_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
    S5_EXPECTED_LWS=$(python3 -c "print(round(float('${S5_BEFORE_LWS}') - ${S5_QTY}, 2))")
    cross_validate "$S5_AFTER_LWS" "$S5_EXPECTED_LWS" "S5: LWS decreased by ${S5_QTY}"

    # --- TABLE: compliance.gst_adjustments ---
    echo ""
    echo -e "  ${BLUE}TABLE: compliance.gst_adjustments${NC}"
    report ""
    report "  TABLE: compliance.gst_adjustments"

    S5_AFTER_GST_ADJ_COUNT=$(run_sql "SELECT COUNT(*) FROM compliance.gst_adjustments WHERE org_id = '${ORG_ID}'" | tr -d '[:space:]')
    S5_EXPECTED_GST_COUNT=$((S5_BEFORE_GST_ADJ_COUNT + 1))
    assert_db_value \
        "SELECT COUNT(*) FROM compliance.gst_adjustments WHERE reference_id = '${S5_WRITEOFF_ID}'" \
        "1" "S5: 1 GST adjustment created"

    assert_db_value \
        "SELECT adjustment_type FROM compliance.gst_adjustments WHERE reference_id = '${S5_WRITEOFF_ID}'" \
        "itc_reversal" "S5: GST adjustment type=itc_reversal"

    assert_db_value \
        "SELECT reference_type FROM compliance.gst_adjustments WHERE reference_id = '${S5_WRITEOFF_ID}'" \
        "stock_writeoff" "S5: GST reference_type=stock_writeoff"

    S5_GST_AMOUNT=$(run_sql "SELECT amount FROM compliance.gst_adjustments WHERE reference_id = '${S5_WRITEOFF_ID}'" | tr -d '[:space:]')
    cross_validate "$S5_GST_AMOUNT" "${S5_ITC}" "S5: GST adjustment amount=${S5_ITC}"

    # Update running totals
    EXPECTED_BATCH_QTY=$(python3 -c "print(round(float('${EXPECTED_BATCH_QTY}') - ${S5_QTY}, 2))")
    EXPECTED_LWS_PRIMARY=$(python3 -c "print(round(float('${EXPECTED_LWS_PRIMARY}') - ${S5_QTY}, 2))")
fi

# ============================================================
# CROSS-SCENARIO VALIDATION
# ============================================================
report ""
report ""
report "CROSS-SCENARIO VALIDATION"
report "========================================"
section "Cross-Scenario Validation"

echo "  Expected running totals (based on scenarios that passed):"
echo "    Batch qty: ${EXPECTED_BATCH_QTY}"
echo "    LWS primary: ${EXPECTED_LWS_PRIMARY}"
echo "    LWS test: ${EXPECTED_LWS_TEST}"

report "  Expected: batch=${EXPECTED_BATCH_QTY}, lws_primary=${EXPECTED_LWS_PRIMARY}, lws_test=${EXPECTED_LWS_TEST}"

# Final DB reads
FINAL_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
FINAL_LWS_PRIMARY=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${PRIMARY_LOC_ID}" | tr -d '[:space:]')
FINAL_LWS_TEST=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID} AND location_id = ${TEST_LOC_ID}" | tr -d '[:space:]')

echo ""
echo "  Actual final values:"
echo "    Batch qty: ${FINAL_BATCH_QTY}"
echo "    LWS primary (loc ${PRIMARY_LOC_ID}): ${FINAL_LWS_PRIMARY}"
echo "    LWS test (loc ${TEST_LOC_ID}): ${FINAL_LWS_TEST}"

report "  Actual: batch=${FINAL_BATCH_QTY}, lws_primary=${FINAL_LWS_PRIMARY}, lws_test=${FINAL_LWS_TEST}"

echo ""
echo -e "  ${BLUE}Final Batch Quantity${NC}"
cross_validate "$FINAL_BATCH_QTY" "$EXPECTED_BATCH_QTY" \
    "CROSS: Final batch qty matches running total (expected ${EXPECTED_BATCH_QTY})"

echo -e "  ${BLUE}Final LWS at Primary Location${NC}"
cross_validate "$FINAL_LWS_PRIMARY" "$EXPECTED_LWS_PRIMARY" \
    "CROSS: Final LWS primary matches (expected ${EXPECTED_LWS_PRIMARY})"

echo -e "  ${BLUE}Final LWS at Test Location${NC}"
# Handle empty LWS (no row created if transfer didn't run)
if [ -z "$FINAL_LWS_TEST" ]; then
    FINAL_LWS_TEST="0"
fi
cross_validate "$FINAL_LWS_TEST" "$EXPECTED_LWS_TEST" \
    "CROSS: Final LWS test matches (expected ${EXPECTED_LWS_TEST})"

# Verify batch = SUM(all locations LWS)
echo -e "  ${BLUE}LWS Sum vs Batch Qty${NC}"
ALL_LWS_SUM=$(run_sql "SELECT COALESCE(SUM(quantity_available), 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
cross_validate "$ALL_LWS_SUM" "$FINAL_BATCH_QTY" \
    "CROSS: SUM(all LWS) = batch qty (${ALL_LWS_SUM} vs ${FINAL_BATCH_QTY})"

# ============================================================
# REPORT SUMMARY
# ============================================================
report ""
report ""
report "================================================================"
report "SUMMARY"
report "================================================================"
report "Total Checks: $((PASS_COUNT + FAIL_COUNT))"
report "Passed: ${PASS_COUNT}"
report "Failed: ${FAIL_COUNT}"
report "Skipped: ${SKIP_COUNT}"
report "Report Errors: ${REPORT_ERRORS}"
report "Report Warnings: ${REPORT_WARNINGS}"
report ""
if [ "$REPORT_ERRORS" -eq 0 ]; then
    report "RESULT: ALL CHECKS PASSED"
else
    report "RESULT: ${REPORT_ERRORS} ERRORS FOUND"
fi
report "================================================================"

echo ""
echo "  Report saved to: ${REPORT_FILE}"

# ============================================================
# FINAL SUMMARY
# ============================================================
print_summary
