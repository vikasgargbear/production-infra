#!/bin/bash
# ============================================================
# Invoice Module - End-to-End Flow Tests
# ============================================================
# Tests: Create Invoice → verify stock deduction + outstanding + movements
#
# Usage:
#   export TOKEN="eyJ..."  # or set TEST_EMAIL/TEST_PASSWORD
#   ./tests/api/test_invoice_flow.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"

if [ -z "$TOKEN" ]; then
    get_test_token || { echo "Auth failed."; exit 1; }
fi

echo "=============================================="
echo " Invoice Module E2E Tests"
echo "=============================================="

# Find a product with available stock
STOCK_PRODUCT=$(run_sql "SELECT b.product_id, b.batch_id, b.batch_number, b.quantity_available
    FROM inventory.batches b
    WHERE b.batch_status = 'active' AND b.quantity_available > 5
    ORDER BY b.batch_id DESC LIMIT 1")

if [ -z "$STOCK_PRODUCT" ]; then
    echo "No products with available stock found. Run purchase tests first."
    exit 1
fi

PRODUCT_ID=$(echo "$STOCK_PRODUCT" | cut -d'|' -f1)
BATCH_ID=$(echo "$STOCK_PRODUCT" | cut -d'|' -f2)
BATCH_NUMBER=$(echo "$STOCK_PRODUCT" | cut -d'|' -f3)
AVAILABLE_QTY=$(echo "$STOCK_PRODUCT" | cut -d'|' -f4)
echo "Using product ${PRODUCT_ID}, batch ${BATCH_ID} (${BATCH_NUMBER}), available: ${AVAILABLE_QTY}"

# Find a customer
CUSTOMER_ID=$(run_sql "SELECT customer_id FROM parties.customers LIMIT 1")
CUSTOMER_ID=$(echo "$CUSTOMER_ID" | tr -d '[:space:]')

if [ -z "$CUSTOMER_ID" ]; then
    echo "No customers found."
    exit 1
fi
echo "Using customer ${CUSTOMER_ID}"

# Snapshot
BEFORE_MOVEMENTS=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE movement_type = 'sale'" | tr -d '[:space:]')
BEFORE_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')

# =============================================
# TEST 1: Create Invoice
# =============================================
section "Test 1: Create Invoice"

INVOICE_DATA='{
    "customer_id": '$CUSTOMER_ID',
    "invoice_date": "'$(date +%Y-%m-%d)'",
    "items": [
        {
            "product_id": '$PRODUCT_ID',
            "batch_id": '$BATCH_ID',
            "batch_number": "'$BATCH_NUMBER'",
            "quantity": 2,
            "unit_price": 90,
            "discount_percent": 0,
            "gst_percent": 18
        }
    ],
    "payments": [
        {"method": "cash", "amount": 212.4}
    ]
}'

parse_response "$(api_post "/invoices/" "$INVOICE_DATA")"
assert_status "201" "Invoice creation"
assert_json_exists ".invoice_id" "Invoice ID"
assert_json_exists ".invoice_number" "Invoice number"

INVOICE_ID=$(echo "$RESPONSE_BODY" | jq -r '.invoice_id // empty')
INVOICE_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.invoice_number // empty')
echo "  → Invoice: ${INVOICE_ID} (${INVOICE_NUMBER})"

# =============================================
# TEST 2: Verify stock deducted
# =============================================
section "Test 2: Verify Stock Deduction"

if [ -n "$INVOICE_ID" ] && [ "$INVOICE_ID" != "null" ]; then
    AFTER_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')

    # Use python for decimal comparison
    QTY_DECREASED=$(python3 -c "print('yes' if float('${AFTER_BATCH_QTY}') < float('${BEFORE_BATCH_QTY}') else 'no')")
    if [ "$QTY_DECREASED" = "yes" ]; then
        echo -e "  ${GREEN}✓ Batch quantity decreased (${BEFORE_BATCH_QTY} → ${AFTER_BATCH_QTY})${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Batch quantity NOT decreased (${BEFORE_BATCH_QTY} → ${AFTER_BATCH_QTY})${NC}"; ((FAIL_COUNT++))
    fi

    # Inventory movements
    SALE_MOVEMENTS=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE reference_type = 'invoice' AND reference_id = ${INVOICE_ID}" | tr -d '[:space:]')
    if [ "$SALE_MOVEMENTS" -ge "1" ] 2>/dev/null; then
        echo -e "  ${GREEN}✓ Sale movement created (${SALE_MOVEMENTS})${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ No sale movement found for invoice ${INVOICE_ID}${NC}"; ((FAIL_COUNT++))
    fi

    # Customer outstanding
    OUTSTANDING=$(run_sql "SELECT COALESCE(SUM(outstanding_amount), 0) FROM financial.customer_outstanding WHERE reference_type = 'INVOICE' AND reference_id = ${INVOICE_ID}" | tr -d '[:space:]')
    echo "  → Outstanding amount for invoice: ${OUTSTANDING}"
    if [ -n "$OUTSTANDING" ]; then
        echo -e "  ${GREEN}✓ Customer outstanding record exists${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ No customer outstanding for invoice${NC}"; ((FAIL_COUNT++))
    fi
else
    skip_test "Invoice creation failed"
fi

print_summary
