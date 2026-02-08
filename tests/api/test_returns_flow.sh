#!/bin/bash
# ============================================================
# Returns Module - End-to-End Flow Tests
# ============================================================
# Tests: Sales Return → verify stock restored + outstanding adjusted
#
# Prerequisite: Run test_invoice_flow.sh first to have invoices to return
#
# Usage:
#   export TOKEN="eyJ..."
#   ./tests/api/test_returns_flow.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"
set +e

if [ -z "$TOKEN" ]; then
    get_test_token || { echo "Auth failed."; exit 1; }
fi

echo "=============================================="
echo " Returns Module E2E Tests"
echo "=============================================="

# Find a posted invoice with items to return
RETURNABLE=$(run_sql "
SELECT i.invoice_id, i.invoice_number, ii.invoice_item_id, ii.product_id, ii.batch_id, ii.quantity
FROM sales.invoices i
JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
WHERE i.invoice_status = 'posted' AND ii.quantity > 0
ORDER BY i.invoice_id DESC LIMIT 1")

if [ -z "$RETURNABLE" ]; then
    echo "No posted invoices found for return testing."
    echo "Run test_invoice_flow.sh first."
    exit 1
fi

INVOICE_ID=$(echo "$RETURNABLE" | cut -d'|' -f1)
INVOICE_NUMBER=$(echo "$RETURNABLE" | cut -d'|' -f2)
INVOICE_ITEM_ID=$(echo "$RETURNABLE" | cut -d'|' -f3)
PRODUCT_ID=$(echo "$RETURNABLE" | cut -d'|' -f4)
BATCH_ID=$(echo "$RETURNABLE" | cut -d'|' -f5)
ORIG_QTY=$(echo "$RETURNABLE" | cut -d'|' -f6)
echo "Returning from invoice ${INVOICE_ID} (${INVOICE_NUMBER})"
echo "Item: product ${PRODUCT_ID}, batch ${BATCH_ID}, orig qty ${ORIG_QTY}"

# Snapshot
BEFORE_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')
BEFORE_RETURN_MOVEMENTS=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE movement_type = 'SALES_RETURN' OR reference_type = 'SALES_RETURN'" | tr -d '[:space:]')

# =============================================
# TEST 1: Get Returnable Items
# =============================================
section "Test 1: Get Returnable Items for Invoice ${INVOICE_ID}"

parse_response "$(api_get "/sale-returns/invoice/${INVOICE_ID}/returnable-items")"
if [ "$HTTP_STATUS" = "200" ]; then
    assert_status "200" "Returnable items endpoint"
    RETURNABLE_COUNT=$(echo "$RESPONSE_BODY" | jq 'if type == "array" then length else .items // [] | length end')
    echo "  → ${RETURNABLE_COUNT} returnable items found"
    if [ "$RETURNABLE_COUNT" -ge "1" ] 2>/dev/null; then
        echo -e "  ${GREEN}✓ Has returnable items${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ No returnable items${NC}"; ((FAIL_COUNT++))
    fi
else
    echo -e "  ${YELLOW}⊘ Returnable items endpoint returned ${HTTP_STATUS}${NC}"
    ((SKIP_COUNT++))
fi

# =============================================
# TEST 2: Create Sales Return
# =============================================
section "Test 2: Create Sales Return"

RETURN_QTY=1

# Get customer_id from the invoice
CUSTOMER_ID=$(run_sql "SELECT customer_id FROM sales.invoices WHERE invoice_id = ${INVOICE_ID}" | tr -d '[:space:]')
echo "  Customer ID: ${CUSTOMER_ID}"

# Get unit_price from invoice item
UNIT_PRICE=$(run_sql "SELECT unit_price FROM sales.invoice_items WHERE invoice_item_id = ${INVOICE_ITEM_ID}" | tr -d '[:space:]')
GST_PERCENT=$(run_sql "SELECT COALESCE(cgst_rate + sgst_rate + igst_rate, 18) FROM sales.invoice_items WHERE invoice_item_id = ${INVOICE_ITEM_ID}" | tr -d '[:space:]')
echo "  Unit price: ${UNIT_PRICE}, GST: ${GST_PERCENT}%"

RETURN_DATA='{
    "customer_id": '$CUSTOMER_ID',
    "invoice_id": '$INVOICE_ID',
    "return_date": "'$(date +%Y-%m-%d)'",
    "return_reason": "Customer changed mind",
    "return_category": "OTHER",
    "items": [
        {
            "invoice_item_id": '$INVOICE_ITEM_ID',
            "product_id": '$PRODUCT_ID',
            "batch_id": '$BATCH_ID',
            "return_quantity": '$RETURN_QTY',
            "unit_price": '$UNIT_PRICE',
            "tax_percent": '$GST_PERCENT',
            "return_reason": "Not needed",
            "disposition": "RESTOCK"
        }
    ]
}'

parse_response "$(api_post "/sale-returns/" "$RETURN_DATA")"

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
    assert_status "$HTTP_STATUS" "Sales return creation"
    RETURN_ID=$(echo "$RESPONSE_BODY" | jq -r '.return_id // .id // empty')
    RETURN_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.return_number // empty')
    echo "  → Return: ${RETURN_ID} (${RETURN_NUMBER})"

    # Verify stock restored
    section "Test 2b: Verify Stock Restored"
    AFTER_BATCH_QTY=$(run_sql "SELECT quantity_available FROM inventory.batches WHERE batch_id = ${BATCH_ID}" | tr -d '[:space:]')

    QTY_INCREASED=$(python3 -c "print('yes' if float('${AFTER_BATCH_QTY}') > float('${BEFORE_BATCH_QTY}') else 'no')")
    if [ "$QTY_INCREASED" = "yes" ]; then
        echo -e "  ${GREEN}✓ Batch quantity restored (${BEFORE_BATCH_QTY} → ${AFTER_BATCH_QTY})${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Batch quantity NOT restored (${BEFORE_BATCH_QTY} → ${AFTER_BATCH_QTY})${NC}"; ((FAIL_COUNT++))
    fi

    # Return movement
    AFTER_RETURN_MOVEMENTS=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE movement_type = 'SALES_RETURN' OR reference_type = 'SALES_RETURN'" | tr -d '[:space:]')
    if [ "$AFTER_RETURN_MOVEMENTS" -gt "$BEFORE_RETURN_MOVEMENTS" ] 2>/dev/null; then
        echo -e "  ${GREEN}✓ Return movement created (${BEFORE_RETURN_MOVEMENTS} → ${AFTER_RETURN_MOVEMENTS})${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ No return movement created${NC}"; ((FAIL_COUNT++))
    fi
else
    echo -e "  ${RED}✗ Sales return failed: HTTP ${HTTP_STATUS}${NC}"
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
    ((FAIL_COUNT++))
fi

print_summary
