#!/bin/bash
# ============================================================
# Invoice Module - Comprehensive End-to-End Tests
# ============================================================
# Validates ALL 7 tables written during invoice creation:
#   1. sales.orders          - Sales order header
#   2. sales.invoices        - Invoice header (amounts, status, payment)
#   3. sales.invoice_items   - Line items (product, batch, GST breakdown)
#   4. inventory.batches     - Stock deduction per batch
#   5. inventory.inventory_movements - Audit trail (sale, direction=out)
#   6. inventory.location_wise_stock - Location stock decremented
#   7. financial.customer_outstanding - A/R ledger entry
#
# Cross-validates amounts between tables for data integrity.
# Generates report: tests/reports/invoice_test_report.txt
#
# Scenarios:
#   1. Partial payment (2 items, cash < total)
#   2. Fully paid (1 item, cash = total)
#   3. Credit only (1 item, no payments)
#
# Usage:
#   export TOKEN="eyJ..."  # or set TEST_EMAIL/TEST_PASSWORD
#   ./tests/api/test_invoice_e2e.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"

# Disable set -e (inherited from helpers) — we handle errors ourselves
set +e

if [ -z "$TOKEN" ]; then
    get_test_token || { echo "Auth failed."; exit 1; }
fi

# --- Report Setup ---
REPORT_DIR="${SCRIPT_DIR}/../reports"
mkdir -p "$REPORT_DIR"
REPORT_FILE="${REPORT_DIR}/invoice_test_report.txt"
REPORT_ERRORS=0
REPORT_WARNINGS=0

report() {
    echo "$1" >> "$REPORT_FILE"
}

report_pass() {
    report "  ✓ $1"
}

report_fail() {
    report "  ✗ ERROR: $1"
    ((REPORT_ERRORS++)) || true
}

report_warn() {
    report "  ⚠ WARNING: $1"
    ((REPORT_WARNINGS++)) || true
}

# Initialize report
cat > "$REPORT_FILE" << EOF
INVOICE E2E TEST REPORT - $(date '+%Y-%m-%d %H:%M:%S')
========================================================
EOF

echo "=============================================="
echo " Invoice Module - Comprehensive E2E Tests"
echo "=============================================="
echo " Report: ${REPORT_FILE}"
echo "=============================================="

# --- Helper: assert_db_value ---
# Runs a SQL query that returns a single value, compares to expected
assert_db_value() {
    local sql="$1"
    local expected="$2"
    local test_name="$3"
    local allow_decimal="${4:-no}"  # "yes" to use python float compare

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
# Compares two values with a label
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

# ============================================================
# FIND TEST DATA
# ============================================================
section "Setup: Finding test data"

# Find 2 products with available stock (different products for multi-item test)
STOCK_DATA=$(run_sql "
    SELECT b.product_id, b.batch_id, b.batch_number, b.quantity_available
    FROM inventory.batches b
    WHERE b.batch_status = 'active' AND b.quantity_available > 10
    ORDER BY b.quantity_available DESC
    LIMIT 2
")

if [ -z "$STOCK_DATA" ]; then
    echo -e "${RED}No products with sufficient stock found. Run purchase tests first.${NC}"
    exit 1
fi

# Parse product 1
PRODUCT1_LINE=$(echo "$STOCK_DATA" | head -1)
PRODUCT1_ID=$(echo "$PRODUCT1_LINE" | cut -d'|' -f1 | tr -d '[:space:]')
BATCH1_ID=$(echo "$PRODUCT1_LINE" | cut -d'|' -f2 | tr -d '[:space:]')
BATCH1_NUMBER=$(echo "$PRODUCT1_LINE" | cut -d'|' -f3 | tr -d '[:space:]')
BATCH1_QTY=$(echo "$PRODUCT1_LINE" | cut -d'|' -f4 | tr -d '[:space:]')

# Parse product 2 (may be same product different batch, that's ok)
PRODUCT2_LINE=$(echo "$STOCK_DATA" | tail -1)
PRODUCT2_ID=$(echo "$PRODUCT2_LINE" | cut -d'|' -f1 | tr -d '[:space:]')
BATCH2_ID=$(echo "$PRODUCT2_LINE" | cut -d'|' -f2 | tr -d '[:space:]')
BATCH2_NUMBER=$(echo "$PRODUCT2_LINE" | cut -d'|' -f3 | tr -d '[:space:]')
BATCH2_QTY=$(echo "$PRODUCT2_LINE" | cut -d'|' -f4 | tr -d '[:space:]')

echo "  Product 1: id=${PRODUCT1_ID}, batch=${BATCH1_ID} (${BATCH1_NUMBER}), qty=${BATCH1_QTY}"
echo "  Product 2: id=${PRODUCT2_ID}, batch=${BATCH2_ID} (${BATCH2_NUMBER}), qty=${BATCH2_QTY}"

# Find customer
CUSTOMER_ID=$(run_sql "SELECT customer_id FROM parties.customers LIMIT 1" | tr -d '[:space:]')
if [ -z "$CUSTOMER_ID" ]; then
    echo -e "${RED}No customers found.${NC}"
    exit 1
fi
echo "  Customer: ${CUSTOMER_ID}"

# Get location_id for verification
LOCATION_ID=$(run_sql "SELECT location_id FROM inventory.storage_locations LIMIT 1" | tr -d '[:space:]')
echo "  Location: ${LOCATION_ID}"

report ""
report "TEST DATA"
report "  Product 1: id=${PRODUCT1_ID}, batch=${BATCH1_ID} (${BATCH1_NUMBER}), stock=${BATCH1_QTY}"
report "  Product 2: id=${PRODUCT2_ID}, batch=${BATCH2_ID} (${BATCH2_NUMBER}), stock=${BATCH2_QTY}"
report "  Customer: ${CUSTOMER_ID}"
report "  Location: ${LOCATION_ID}"

# ============================================================
# SCENARIO 1: Partial Payment Invoice (2 items)
# ============================================================
report ""
report "SCENARIO 1: Partial Payment Invoice (2 items)"
report "================================================"
section "Scenario 1: Partial Payment (2 items, partial cash)"

# Snapshot BEFORE
BEFORE_BATCH1_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH1_ID}" | tr -d '[:space:]')
BEFORE_BATCH2_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH2_ID}" | tr -d '[:space:]')
BEFORE_LWS1=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH1_ID} AND location_id = ${LOCATION_ID}" | tr -d '[:space:]')
BEFORE_LWS2=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH2_ID} AND location_id = ${LOCATION_ID}" | tr -d '[:space:]')

echo "  Before: batch1_qty=${BEFORE_BATCH1_QTY}, batch2_qty=${BEFORE_BATCH2_QTY}"
echo "  Before LWS: batch1=${BEFORE_LWS1}, batch2=${BEFORE_LWS2}"

# Item 1: 3 units @ 100, 18% GST → taxable=300, cgst=27, sgst=27, line_total=354
# Item 2: 2 units @ 150, 12% GST → taxable=300, cgst=18, sgst=18, line_total=336
# Total taxable=600, total_tax=90, final=690
# Pay 300 cash → partial payment
S1_ITEM1_QTY=3
S1_ITEM1_PRICE=100
S1_ITEM1_GST=18
S1_ITEM2_QTY=2
S1_ITEM2_PRICE=150
S1_ITEM2_GST=12
S1_PAYMENT=300

INVOICE_DATA_S1='{
    "customer_id": '$CUSTOMER_ID',
    "invoice_date": "'$(date +%Y-%m-%d)'",
    "items": [
        {
            "product_id": '$PRODUCT1_ID',
            "batch_id": '$BATCH1_ID',
            "batch_number": "'$BATCH1_NUMBER'",
            "quantity": '$S1_ITEM1_QTY',
            "unit_price": '$S1_ITEM1_PRICE',
            "discount_percent": 0,
            "gst_percent": '$S1_ITEM1_GST'
        },
        {
            "product_id": '$PRODUCT2_ID',
            "batch_id": '$BATCH2_ID',
            "batch_number": "'$BATCH2_NUMBER'",
            "quantity": '$S1_ITEM2_QTY',
            "unit_price": '$S1_ITEM2_PRICE',
            "discount_percent": 0,
            "gst_percent": '$S1_ITEM2_GST'
        }
    ],
    "payments": [
        {"method": "cash", "amount": '$S1_PAYMENT'}
    ]
}'

parse_response "$(api_post "/invoices/" "$INVOICE_DATA_S1")"
assert_status "201" "S1: Invoice creation"

S1_INVOICE_ID=$(echo "$RESPONSE_BODY" | jq -r '.invoice_id // empty')
S1_INVOICE_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.invoice_number // empty')
S1_ORDER_ID=$(echo "$RESPONSE_BODY" | jq -r '.order_id // empty')
S1_FINAL_AMOUNT=$(echo "$RESPONSE_BODY" | jq -r '.final_amount // empty')
S1_ITEMS_COUNT=$(echo "$RESPONSE_BODY" | jq -r '.items_count // empty')

echo "  → Invoice: ${S1_INVOICE_ID} (${S1_INVOICE_NUMBER}), order: ${S1_ORDER_ID}, final: ${S1_FINAL_AMOUNT}"
report "  Invoice: ${S1_INVOICE_NUMBER} (ID: ${S1_INVOICE_ID})"
report "  Order ID: ${S1_ORDER_ID}"

if [ -z "$S1_INVOICE_ID" ] || [ "$S1_INVOICE_ID" = "null" ]; then
    echo -e "  ${RED}Invoice creation failed, skipping scenario 1 verifications${NC}"
    report_fail "Invoice creation failed"
    skip_test "S1: All verifications skipped"
else
    # Allow a moment for any background processing
    sleep 2

    # --- TABLE 1: sales.orders ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.orders${NC}"
    report ""
    report "  TABLE: sales.orders"

    assert_db_value \
        "SELECT COUNT(*) FROM sales.orders WHERE order_id = ${S1_ORDER_ID}" \
        "1" "S1: Order row exists"

    S1_ORDER_FINAL=$(run_sql "SELECT final_amount FROM sales.orders WHERE order_id = ${S1_ORDER_ID}" | tr -d '[:space:]')
    cross_validate "$S1_ORDER_FINAL" "$S1_FINAL_AMOUNT" "S1: orders.final_amount matches response"

    # --- TABLE 2: sales.invoices ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.invoices${NC}"
    report ""
    report "  TABLE: sales.invoices"

    assert_db_value \
        "SELECT COUNT(*) FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" \
        "1" "S1: Invoice row exists"

    assert_db_value \
        "SELECT invoice_status FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" \
        "posted" "S1: invoice_status=posted"

    assert_db_value \
        "SELECT payment_status FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" \
        "partial" "S1: payment_status=partial"

    S1_INV_FINAL=$(run_sql "SELECT final_amount FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_INV_PAID=$(run_sql "SELECT paid_amount FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_INV_CREDIT=$(run_sql "SELECT credit_amount FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_INV_TAXABLE=$(run_sql "SELECT taxable_amount FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_INV_CGST=$(run_sql "SELECT cgst_amount FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_INV_SGST=$(run_sql "SELECT sgst_amount FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_INV_ITEMS_COUNT=$(run_sql "SELECT items_count FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_INV_TOTAL_QTY=$(run_sql "SELECT total_quantity FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_INV_ORDER_ID=$(run_sql "SELECT order_id FROM sales.invoices WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')

    cross_validate "$S1_INV_FINAL" "$S1_FINAL_AMOUNT" "S1: invoices.final_amount matches response"
    cross_validate "$S1_INV_PAID" "$S1_PAYMENT" "S1: invoices.paid_amount=${S1_PAYMENT}"

    # credit_amount should be final - paid
    S1_EXPECTED_CREDIT=$(python3 -c "print(float('${S1_INV_FINAL}') - float('${S1_INV_PAID}'))")
    cross_validate "$S1_INV_CREDIT" "$S1_EXPECTED_CREDIT" "S1: credit_amount = final - paid"

    # order_id link
    cross_validate "$S1_INV_ORDER_ID" "$S1_ORDER_ID" "S1: invoices.order_id links to order"

    # --- TABLE 3: sales.invoice_items ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.invoice_items${NC}"
    report ""
    report "  TABLE: sales.invoice_items"

    S1_ACTUAL_ITEMS=$(run_sql "SELECT COUNT(*) FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    assert_db_value \
        "SELECT COUNT(*) FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID}" \
        "2" "S1: 2 invoice items created"

    # Verify item 1
    S1_ITEM1_ACTUAL_QTY=$(run_sql "SELECT quantity FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID} AND product_id = ${PRODUCT1_ID} AND batch_id = ${BATCH1_ID}" | tr -d '[:space:]')
    cross_validate "$S1_ITEM1_ACTUAL_QTY" "$S1_ITEM1_QTY" "S1: Item 1 quantity"

    S1_ITEM1_TAXABLE=$(run_sql "SELECT taxable_amount FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID} AND product_id = ${PRODUCT1_ID} AND batch_id = ${BATCH1_ID}" | tr -d '[:space:]')
    S1_ITEM1_EXPECTED_TAXABLE=$(python3 -c "print(${S1_ITEM1_QTY} * ${S1_ITEM1_PRICE})")
    cross_validate "$S1_ITEM1_TAXABLE" "$S1_ITEM1_EXPECTED_TAXABLE" "S1: Item 1 taxable_amount"

    # Verify item 2
    S1_ITEM2_ACTUAL_QTY=$(run_sql "SELECT quantity FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID} AND product_id = ${PRODUCT2_ID} AND batch_id = ${BATCH2_ID}" | tr -d '[:space:]')
    cross_validate "$S1_ITEM2_ACTUAL_QTY" "$S1_ITEM2_QTY" "S1: Item 2 quantity"

    S1_ITEM2_TAXABLE=$(run_sql "SELECT taxable_amount FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID} AND product_id = ${PRODUCT2_ID} AND batch_id = ${BATCH2_ID}" | tr -d '[:space:]')
    S1_ITEM2_EXPECTED_TAXABLE=$(python3 -c "print(${S1_ITEM2_QTY} * ${S1_ITEM2_PRICE})")
    cross_validate "$S1_ITEM2_TAXABLE" "$S1_ITEM2_EXPECTED_TAXABLE" "S1: Item 2 taxable_amount"

    # Sum checks: invoice header vs items aggregate
    S1_ITEMS_SUM_TAXABLE=$(run_sql "SELECT COALESCE(SUM(taxable_amount), 0) FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_ITEMS_SUM_CGST=$(run_sql "SELECT COALESCE(SUM(cgst_amount), 0) FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_ITEMS_SUM_SGST=$(run_sql "SELECT COALESCE(SUM(sgst_amount), 0) FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    S1_ITEMS_SUM_QTY=$(run_sql "SELECT COALESCE(SUM(quantity), 0) FROM sales.invoice_items WHERE invoice_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')

    # --- TABLE 4: inventory.batches ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.batches${NC}"
    report ""
    report "  TABLE: inventory.batches"

    AFTER_BATCH1_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH1_ID}" | tr -d '[:space:]')
    S1_EXPECTED_BATCH1=$(python3 -c "print(round(float('${BEFORE_BATCH1_QTY}') - ${S1_ITEM1_QTY}, 2))")
    cross_validate "$AFTER_BATCH1_QTY" "$S1_EXPECTED_BATCH1" "S1: Batch 1 deducted by ${S1_ITEM1_QTY} (${BEFORE_BATCH1_QTY}→${AFTER_BATCH1_QTY})"

    AFTER_BATCH2_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH2_ID}" | tr -d '[:space:]')
    S1_EXPECTED_BATCH2=$(python3 -c "print(round(float('${BEFORE_BATCH2_QTY}') - ${S1_ITEM2_QTY}, 2))")
    cross_validate "$AFTER_BATCH2_QTY" "$S1_EXPECTED_BATCH2" "S1: Batch 2 deducted by ${S1_ITEM2_QTY} (${BEFORE_BATCH2_QTY}→${AFTER_BATCH2_QTY})"

    # --- TABLE 5: inventory.inventory_movements ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements"

    S1_MOVEMENT_COUNT=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S1_INVOICE_ID}" | tr -d '[:space:]')
    assert_db_value \
        "SELECT COUNT(*) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S1_INVOICE_ID}" \
        "2" "S1: 2 inventory movements created"

    assert_db_value \
        "SELECT COUNT(DISTINCT movement_type) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S1_INVOICE_ID} AND movement_type = 'sale'" \
        "1" "S1: All movements have movement_type=sale"

    assert_db_value \
        "SELECT COUNT(DISTINCT movement_direction) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S1_INVOICE_ID} AND movement_direction = 'out'" \
        "1" "S1: All movements have direction=out"

    # Verify movement quantities match item quantities
    S1_MV1_QTY=$(run_sql "SELECT quantity FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S1_INVOICE_ID} AND product_id = ${PRODUCT1_ID} AND batch_id = ${BATCH1_ID}" | tr -d '[:space:]')
    cross_validate "$S1_MV1_QTY" "$S1_ITEM1_QTY" "S1: Movement 1 qty matches item 1 qty"

    S1_MV2_QTY=$(run_sql "SELECT quantity FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S1_INVOICE_ID} AND product_id = ${PRODUCT2_ID} AND batch_id = ${BATCH2_ID}" | tr -d '[:space:]')
    cross_validate "$S1_MV2_QTY" "$S1_ITEM2_QTY" "S1: Movement 2 qty matches item 2 qty"

    # Verify location_id is correct
    if [ -n "$LOCATION_ID" ]; then
        S1_MV_LOCATIONS=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S1_INVOICE_ID} AND location_id = ${LOCATION_ID}" | tr -d '[:space:]')
        assert_db_value \
            "SELECT COUNT(*) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S1_INVOICE_ID} AND location_id = ${LOCATION_ID}" \
            "2" "S1: All movements have correct location_id=${LOCATION_ID}"
    fi

    # --- TABLE 6: inventory.location_wise_stock ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.location_wise_stock${NC}"
    report ""
    report "  TABLE: inventory.location_wise_stock"

    if [ -n "$BEFORE_LWS1" ] && [ "$BEFORE_LWS1" != "0" ]; then
        AFTER_LWS1=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH1_ID} AND location_id = ${LOCATION_ID}" | tr -d '[:space:]')
        S1_EXPECTED_LWS1=$(python3 -c "print(round(float('${BEFORE_LWS1}') - ${S1_ITEM1_QTY}, 2))")
        cross_validate "$AFTER_LWS1" "$S1_EXPECTED_LWS1" "S1: LWS batch 1 decreased (${BEFORE_LWS1}→${AFTER_LWS1})"
    else
        echo -e "  ${YELLOW}⊘ LWS batch 1: no prior row (before=${BEFORE_LWS1})${NC}"
        report_warn "LWS batch 1 had no prior row"
    fi

    if [ -n "$BEFORE_LWS2" ] && [ "$BEFORE_LWS2" != "0" ]; then
        AFTER_LWS2=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH2_ID} AND location_id = ${LOCATION_ID}" | tr -d '[:space:]')
        S1_EXPECTED_LWS2=$(python3 -c "print(round(float('${BEFORE_LWS2}') - ${S1_ITEM2_QTY}, 2))")
        cross_validate "$AFTER_LWS2" "$S1_EXPECTED_LWS2" "S1: LWS batch 2 decreased (${BEFORE_LWS2}→${AFTER_LWS2})"
    else
        echo -e "  ${YELLOW}⊘ LWS batch 2: no prior row (before=${BEFORE_LWS2})${NC}"
        report_warn "LWS batch 2 had no prior row"
    fi

    # --- TABLE 7: financial.customer_outstanding ---
    echo ""
    echo -e "  ${BLUE}TABLE: financial.customer_outstanding${NC}"
    report ""
    report "  TABLE: financial.customer_outstanding"

    assert_db_value \
        "SELECT COUNT(*) FROM financial.customer_outstanding WHERE document_id = ${S1_INVOICE_ID} AND document_type = 'invoice'" \
        "1" "S1: Outstanding row exists"

    S1_OUT_ORIGINAL=$(run_sql "SELECT original_amount FROM financial.customer_outstanding WHERE document_id = ${S1_INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
    cross_validate "$S1_OUT_ORIGINAL" "$S1_INV_FINAL" "S1: outstanding.original_amount = invoices.final_amount"

    S1_OUT_PAID=$(run_sql "SELECT paid_amount FROM financial.customer_outstanding WHERE document_id = ${S1_INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
    cross_validate "$S1_OUT_PAID" "$S1_PAYMENT" "S1: outstanding.paid_amount = ${S1_PAYMENT}"

    S1_OUT_OUTSTANDING=$(run_sql "SELECT outstanding_amount FROM financial.customer_outstanding WHERE document_id = ${S1_INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
    S1_EXPECTED_OUTSTANDING=$(python3 -c "print(float('${S1_INV_FINAL}') - ${S1_PAYMENT})")
    cross_validate "$S1_OUT_OUTSTANDING" "$S1_EXPECTED_OUTSTANDING" "S1: outstanding_amount = final - paid"

    assert_db_value \
        "SELECT status FROM financial.customer_outstanding WHERE document_id = ${S1_INVOICE_ID} AND document_type = 'invoice'" \
        "partial" "S1: outstanding status=partial"

    # --- CROSS-TABLE VALIDATION ---
    echo ""
    echo -e "  ${BLUE}CROSS-TABLE VALIDATION${NC}"
    report ""
    report "  CROSS-TABLE VALIDATION"

    cross_validate "$S1_INV_FINAL" "$S1_ORDER_FINAL" "S1: invoices.final == orders.final"
    cross_validate "$S1_INV_FINAL" "$S1_OUT_ORIGINAL" "S1: invoices.final == outstanding.original"
    cross_validate "$S1_INV_TAXABLE" "$S1_ITEMS_SUM_TAXABLE" "S1: invoices.taxable == SUM(items.taxable)"
    cross_validate "$S1_INV_CGST" "$S1_ITEMS_SUM_CGST" "S1: invoices.cgst == SUM(items.cgst)"
    cross_validate "$S1_INV_SGST" "$S1_ITEMS_SUM_SGST" "S1: invoices.sgst == SUM(items.sgst)"
    cross_validate "$S1_INV_ITEMS_COUNT" "$S1_ACTUAL_ITEMS" "S1: invoices.items_count == COUNT(items)"
    cross_validate "$S1_INV_TOTAL_QTY" "$S1_ITEMS_SUM_QTY" "S1: invoices.total_quantity == SUM(items.qty)"
    cross_validate "$S1_MOVEMENT_COUNT" "$S1_ACTUAL_ITEMS" "S1: movement count == item count"

    # Update BEFORE values for subsequent scenarios (batch qty changed)
    BEFORE_BATCH1_QTY="$AFTER_BATCH1_QTY"
    BEFORE_BATCH2_QTY="$AFTER_BATCH2_QTY"
fi

# ============================================================
# SCENARIO 2: Fully Paid Invoice (1 item)
# ============================================================
report ""
report ""
report "SCENARIO 2: Fully Paid Invoice (1 item)"
report "================================================"
section "Scenario 2: Fully Paid (1 item, exact cash payment)"

# Snapshot BEFORE
S2_BEFORE_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH1_ID}" | tr -d '[:space:]')
S2_BEFORE_LWS=$(run_sql "SELECT COALESCE(quantity_available, 0) FROM inventory.location_wise_stock WHERE batch_id = ${BATCH1_ID} AND location_id = ${LOCATION_ID}" | tr -d '[:space:]')

S2_ITEM_QTY=2
S2_ITEM_PRICE=100
S2_ITEM_GST=18
# Compute expected final: taxable=200, tax=36, final=236
S2_EXPECTED_FINAL=$(python3 -c "
qty=${S2_ITEM_QTY}; price=${S2_ITEM_PRICE}; gst=${S2_ITEM_GST}
taxable = qty * price
tax = round(taxable * gst / 100, 2)
final = round(taxable + tax)
print(final)
")

INVOICE_DATA_S2='{
    "customer_id": '$CUSTOMER_ID',
    "invoice_date": "'$(date +%Y-%m-%d)'",
    "items": [
        {
            "product_id": '$PRODUCT1_ID',
            "batch_id": '$BATCH1_ID',
            "batch_number": "'$BATCH1_NUMBER'",
            "quantity": '$S2_ITEM_QTY',
            "unit_price": '$S2_ITEM_PRICE',
            "discount_percent": 0,
            "gst_percent": '$S2_ITEM_GST'
        }
    ],
    "payments": [
        {"method": "cash", "amount": '$S2_EXPECTED_FINAL'}
    ]
}'

parse_response "$(api_post "/invoices/" "$INVOICE_DATA_S2")"
assert_status "201" "S2: Invoice creation"

S2_INVOICE_ID=$(echo "$RESPONSE_BODY" | jq -r '.invoice_id // empty')
S2_INVOICE_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.invoice_number // empty')
S2_ORDER_ID=$(echo "$RESPONSE_BODY" | jq -r '.order_id // empty')
S2_FINAL_AMOUNT=$(echo "$RESPONSE_BODY" | jq -r '.final_amount // empty')

echo "  → Invoice: ${S2_INVOICE_ID} (${S2_INVOICE_NUMBER}), final: ${S2_FINAL_AMOUNT}"
report "  Invoice: ${S2_INVOICE_NUMBER} (ID: ${S2_INVOICE_ID})"

if [ -z "$S2_INVOICE_ID" ] || [ "$S2_INVOICE_ID" = "null" ]; then
    echo -e "  ${RED}Invoice creation failed, skipping scenario 2 verifications${NC}"
    report_fail "Invoice creation failed"
    skip_test "S2: All verifications skipped"
else
    sleep 2

    # --- TABLE 2: sales.invoices ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.invoices${NC}"
    report ""
    report "  TABLE: sales.invoices"

    assert_db_value \
        "SELECT invoice_status FROM sales.invoices WHERE invoice_id = ${S2_INVOICE_ID}" \
        "posted" "S2: invoice_status=posted"

    assert_db_value \
        "SELECT payment_status FROM sales.invoices WHERE invoice_id = ${S2_INVOICE_ID}" \
        "paid" "S2: payment_status=paid"

    S2_INV_CREDIT=$(run_sql "SELECT credit_amount FROM sales.invoices WHERE invoice_id = ${S2_INVOICE_ID}" | tr -d '[:space:]')
    cross_validate "$S2_INV_CREDIT" "0" "S2: credit_amount=0 (fully paid)"

    S2_INV_FINAL=$(run_sql "SELECT final_amount FROM sales.invoices WHERE invoice_id = ${S2_INVOICE_ID}" | tr -d '[:space:]')
    S2_INV_PAID=$(run_sql "SELECT paid_amount FROM sales.invoices WHERE invoice_id = ${S2_INVOICE_ID}" | tr -d '[:space:]')
    cross_validate "$S2_INV_PAID" "$S2_INV_FINAL" "S2: paid_amount == final_amount"

    # --- TABLE 1: sales.orders ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.orders${NC}"
    report ""
    report "  TABLE: sales.orders"

    assert_db_value \
        "SELECT COUNT(*) FROM sales.orders WHERE order_id = ${S2_ORDER_ID}" \
        "1" "S2: Order row exists"

    S2_ORDER_FINAL=$(run_sql "SELECT final_amount FROM sales.orders WHERE order_id = ${S2_ORDER_ID}" | tr -d '[:space:]')
    cross_validate "$S2_ORDER_FINAL" "$S2_FINAL_AMOUNT" "S2: orders.final == response.final"

    # --- TABLE 3: sales.invoice_items ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.invoice_items${NC}"
    report ""
    report "  TABLE: sales.invoice_items"

    assert_db_value \
        "SELECT COUNT(*) FROM sales.invoice_items WHERE invoice_id = ${S2_INVOICE_ID}" \
        "1" "S2: 1 invoice item created"

    S2_ITEM_ACTUAL_QTY=$(run_sql "SELECT quantity FROM sales.invoice_items WHERE invoice_id = ${S2_INVOICE_ID}" | tr -d '[:space:]')
    cross_validate "$S2_ITEM_ACTUAL_QTY" "$S2_ITEM_QTY" "S2: Item quantity=${S2_ITEM_QTY}"

    # --- TABLE 4: inventory.batches ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.batches${NC}"
    report ""
    report "  TABLE: inventory.batches"

    S2_AFTER_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH1_ID}" | tr -d '[:space:]')
    S2_EXPECTED_BATCH=$(python3 -c "print(round(float('${S2_BEFORE_BATCH_QTY}') - ${S2_ITEM_QTY}, 2))")
    cross_validate "$S2_AFTER_BATCH_QTY" "$S2_EXPECTED_BATCH" "S2: Batch deducted by ${S2_ITEM_QTY} (${S2_BEFORE_BATCH_QTY}→${S2_AFTER_BATCH_QTY})"

    # --- TABLE 5: inventory.inventory_movements ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements"

    assert_db_value \
        "SELECT COUNT(*) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S2_INVOICE_ID}" \
        "1" "S2: 1 inventory movement created"

    assert_db_value \
        "SELECT movement_type FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S2_INVOICE_ID}" \
        "sale" "S2: movement_type=sale"

    assert_db_value \
        "SELECT movement_direction FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S2_INVOICE_ID}" \
        "out" "S2: movement_direction=out"

    # --- TABLE 7: financial.customer_outstanding ---
    echo ""
    echo -e "  ${BLUE}TABLE: financial.customer_outstanding${NC}"
    report ""
    report "  TABLE: financial.customer_outstanding"

    assert_db_value \
        "SELECT COUNT(*) FROM financial.customer_outstanding WHERE document_id = ${S2_INVOICE_ID} AND document_type = 'invoice'" \
        "1" "S2: Outstanding row exists"

    assert_db_value \
        "SELECT status FROM financial.customer_outstanding WHERE document_id = ${S2_INVOICE_ID} AND document_type = 'invoice'" \
        "paid" "S2: outstanding status=paid"

    S2_OUT_OUTSTANDING=$(run_sql "SELECT outstanding_amount FROM financial.customer_outstanding WHERE document_id = ${S2_INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
    cross_validate "$S2_OUT_OUTSTANDING" "0" "S2: outstanding_amount=0 (fully paid)"

    # Update batch qty for next scenario
    BEFORE_BATCH1_QTY="$S2_AFTER_BATCH_QTY"
fi

# ============================================================
# SCENARIO 3: Credit Invoice (no payment)
# ============================================================
report ""
report ""
report "SCENARIO 3: Credit Invoice (no payment)"
report "================================================"
section "Scenario 3: Credit Only (1 item, no payments)"

S3_BEFORE_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH1_ID}" | tr -d '[:space:]')

S3_ITEM_QTY=1
S3_ITEM_PRICE=100
S3_ITEM_GST=18

INVOICE_DATA_S3='{
    "customer_id": '$CUSTOMER_ID',
    "invoice_date": "'$(date +%Y-%m-%d)'",
    "items": [
        {
            "product_id": '$PRODUCT1_ID',
            "batch_id": '$BATCH1_ID',
            "batch_number": "'$BATCH1_NUMBER'",
            "quantity": '$S3_ITEM_QTY',
            "unit_price": '$S3_ITEM_PRICE',
            "discount_percent": 0,
            "gst_percent": '$S3_ITEM_GST'
        }
    ]
}'

parse_response "$(api_post "/invoices/" "$INVOICE_DATA_S3")"
assert_status "201" "S3: Invoice creation"

S3_INVOICE_ID=$(echo "$RESPONSE_BODY" | jq -r '.invoice_id // empty')
S3_INVOICE_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.invoice_number // empty')
S3_ORDER_ID=$(echo "$RESPONSE_BODY" | jq -r '.order_id // empty')
S3_FINAL_AMOUNT=$(echo "$RESPONSE_BODY" | jq -r '.final_amount // empty')

echo "  → Invoice: ${S3_INVOICE_ID} (${S3_INVOICE_NUMBER}), final: ${S3_FINAL_AMOUNT}"
report "  Invoice: ${S3_INVOICE_NUMBER} (ID: ${S3_INVOICE_ID})"

if [ -z "$S3_INVOICE_ID" ] || [ "$S3_INVOICE_ID" = "null" ]; then
    echo -e "  ${RED}Invoice creation failed, skipping scenario 3 verifications${NC}"
    report_fail "Invoice creation failed"
    skip_test "S3: All verifications skipped"
else
    sleep 2

    # --- TABLE 2: sales.invoices ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.invoices${NC}"
    report ""
    report "  TABLE: sales.invoices"

    assert_db_value \
        "SELECT invoice_status FROM sales.invoices WHERE invoice_id = ${S3_INVOICE_ID}" \
        "posted" "S3: invoice_status=posted"

    assert_db_value \
        "SELECT payment_status FROM sales.invoices WHERE invoice_id = ${S3_INVOICE_ID}" \
        "pending" "S3: payment_status=pending"

    S3_INV_FINAL=$(run_sql "SELECT final_amount FROM sales.invoices WHERE invoice_id = ${S3_INVOICE_ID}" | tr -d '[:space:]')
    S3_INV_PAID=$(run_sql "SELECT paid_amount FROM sales.invoices WHERE invoice_id = ${S3_INVOICE_ID}" | tr -d '[:space:]')
    S3_INV_CREDIT=$(run_sql "SELECT credit_amount FROM sales.invoices WHERE invoice_id = ${S3_INVOICE_ID}" | tr -d '[:space:]')

    cross_validate "$S3_INV_PAID" "0" "S3: paid_amount=0"
    cross_validate "$S3_INV_CREDIT" "$S3_INV_FINAL" "S3: credit_amount == final_amount (full credit)"

    # --- TABLE 1: sales.orders ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.orders${NC}"
    report ""
    report "  TABLE: sales.orders"

    assert_db_value \
        "SELECT COUNT(*) FROM sales.orders WHERE order_id = ${S3_ORDER_ID}" \
        "1" "S3: Order row exists"

    # --- TABLE 3: sales.invoice_items ---
    echo ""
    echo -e "  ${BLUE}TABLE: sales.invoice_items${NC}"
    report ""
    report "  TABLE: sales.invoice_items"

    assert_db_value \
        "SELECT COUNT(*) FROM sales.invoice_items WHERE invoice_id = ${S3_INVOICE_ID}" \
        "1" "S3: 1 invoice item created"

    # --- TABLE 4: inventory.batches ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.batches${NC}"
    report ""
    report "  TABLE: inventory.batches"

    S3_AFTER_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH1_ID}" | tr -d '[:space:]')
    S3_EXPECTED_BATCH=$(python3 -c "print(round(float('${S3_BEFORE_BATCH_QTY}') - ${S3_ITEM_QTY}, 2))")
    cross_validate "$S3_AFTER_BATCH_QTY" "$S3_EXPECTED_BATCH" "S3: Batch deducted by ${S3_ITEM_QTY} (${S3_BEFORE_BATCH_QTY}→${S3_AFTER_BATCH_QTY})"

    # --- TABLE 5: inventory.inventory_movements ---
    echo ""
    echo -e "  ${BLUE}TABLE: inventory.inventory_movements${NC}"
    report ""
    report "  TABLE: inventory.inventory_movements"

    assert_db_value \
        "SELECT COUNT(*) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${S3_INVOICE_ID}" \
        "1" "S3: 1 inventory movement created"

    # --- TABLE 7: financial.customer_outstanding ---
    echo ""
    echo -e "  ${BLUE}TABLE: financial.customer_outstanding${NC}"
    report ""
    report "  TABLE: financial.customer_outstanding"

    assert_db_value \
        "SELECT COUNT(*) FROM financial.customer_outstanding WHERE document_id = ${S3_INVOICE_ID} AND document_type = 'invoice'" \
        "1" "S3: Outstanding row exists"

    assert_db_value \
        "SELECT status FROM financial.customer_outstanding WHERE document_id = ${S3_INVOICE_ID} AND document_type = 'invoice'" \
        "open" "S3: outstanding status=open"

    S3_OUT_ORIGINAL=$(run_sql "SELECT original_amount FROM financial.customer_outstanding WHERE document_id = ${S3_INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
    cross_validate "$S3_OUT_ORIGINAL" "$S3_INV_FINAL" "S3: outstanding.original == invoices.final"

    S3_OUT_OUTSTANDING=$(run_sql "SELECT outstanding_amount FROM financial.customer_outstanding WHERE document_id = ${S3_INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
    cross_validate "$S3_OUT_OUTSTANDING" "$S3_INV_FINAL" "S3: outstanding_amount == final_amount (no payment)"

    S3_OUT_PAID=$(run_sql "SELECT paid_amount FROM financial.customer_outstanding WHERE document_id = ${S3_INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
    cross_validate "$S3_OUT_PAID" "0" "S3: outstanding.paid_amount=0"
fi

# ============================================================
# REPORT SUMMARY
# ============================================================
report ""
report ""
report "========================================================"
report "SUMMARY"
report "========================================================"
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
report "========================================================"

echo ""
echo "  Report saved to: ${REPORT_FILE}"

# ============================================================
# FINAL SUMMARY
# ============================================================
print_summary
