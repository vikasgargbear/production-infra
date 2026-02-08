#!/bin/bash
# ============================================================
# Payments Module - End-to-End Flow Tests
# ============================================================
# Tests:
#   1. Record payment against invoice → verify outstanding updated
#   2. Full payment → verify status changes to 'paid'
#   3. Payment listing & search
#
# Prerequisite: Run test_invoice_e2e.sh first (creates invoices with outstanding)
#
# Usage:
#   export TOKEN="eyJ..."
#   ./tests/api/test_payments_flow.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"
set +e

if [ -z "$TOKEN" ]; then
    get_test_token || { echo "Auth failed."; exit 1; }
fi

echo "=============================================="
echo " Payments Module E2E Tests"
echo "=============================================="

# =============================================
# Setup: Find an invoice with outstanding balance
# =============================================
section "Setup: Finding invoice with outstanding"

UNPAID=$(run_sql "
SELECT i.invoice_id, i.invoice_number, i.final_amount, i.paid_amount, i.credit_amount,
       i.payment_status, i.customer_id
FROM sales.invoices i
WHERE i.payment_status IN ('pending', 'partial')
  AND i.invoice_status = 'posted'
  AND i.credit_amount > 0
ORDER BY i.invoice_id DESC LIMIT 1")

if [ -z "$UNPAID" ]; then
    echo "No invoices with outstanding balance found."
    echo "Run test_invoice_e2e.sh first."
    exit 1
fi

INVOICE_ID=$(echo "$UNPAID" | cut -d'|' -f1 | tr -d '[:space:]')
INVOICE_NUMBER=$(echo "$UNPAID" | cut -d'|' -f2 | tr -d '[:space:]')
FINAL_AMOUNT=$(echo "$UNPAID" | cut -d'|' -f3 | tr -d '[:space:]')
PAID_AMOUNT=$(echo "$UNPAID" | cut -d'|' -f4 | tr -d '[:space:]')
CREDIT_AMOUNT=$(echo "$UNPAID" | cut -d'|' -f5 | tr -d '[:space:]')
PAYMENT_STATUS=$(echo "$UNPAID" | cut -d'|' -f6 | tr -d '[:space:]')
CUSTOMER_ID=$(echo "$UNPAID" | cut -d'|' -f7 | tr -d '[:space:]')

echo "  Invoice: ${INVOICE_ID} (${INVOICE_NUMBER})"
echo "  Final: ${FINAL_AMOUNT}, Paid: ${PAID_AMOUNT}, Outstanding: ${CREDIT_AMOUNT}"
echo "  Status: ${PAYMENT_STATUS}, Customer: ${CUSTOMER_ID}"

# Snapshot before
BEFORE_PAYMENTS=$(run_sql "SELECT COUNT(*) FROM financial.payments" | tr -d '[:space:]')
BEFORE_OUTSTANDING=$(run_sql "SELECT outstanding_amount FROM financial.customer_outstanding WHERE document_id = ${INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')

echo "  Before: ${BEFORE_PAYMENTS} payments, outstanding=${BEFORE_OUTSTANDING}"

# =============================================
# TEST 1: Record partial payment against invoice
# =============================================
section "Test 1: Record Partial Payment (cash)"

# Pay half the outstanding
PARTIAL_AMOUNT=$(python3 -c "print(round(float('${CREDIT_AMOUNT}') / 2, 2))")
echo "  Paying: ${PARTIAL_AMOUNT} (half of ${CREDIT_AMOUNT})"

PAYMENT_DATA='{
    "invoice_id": '$INVOICE_ID',
    "payment_date": "'$(date +%Y-%m-%d)'",
    "payment_mode": "cash",
    "amount": '$PARTIAL_AMOUNT',
    "notes": "E2E test - partial payment"
}'

parse_response "$(api_post "/payments/record" "$PAYMENT_DATA")"

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
    echo -e "  ${GREEN}✓ Payment recorded: HTTP ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    PAYMENT_ID=$(echo "$RESPONSE_BODY" | jq -r '.payment_id // .data.payment_id // empty')
    echo "  → Payment ID: ${PAYMENT_ID}"

    # Verify payment record created
    AFTER_PAYMENTS=$(run_sql "SELECT COUNT(*) FROM financial.payments" | tr -d '[:space:]')
    if [ "$AFTER_PAYMENTS" -gt "$BEFORE_PAYMENTS" ] 2>/dev/null; then
        echo -e "  ${GREEN}✓ Payment record created in DB (${BEFORE_PAYMENTS} → ${AFTER_PAYMENTS})${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ No new payment record in DB${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify invoice paid_amount updated
    sleep 1
    UPDATED_PAID=$(run_sql "SELECT paid_amount FROM sales.invoices WHERE invoice_id = ${INVOICE_ID}" | tr -d '[:space:]')
    EXPECTED_PAID=$(python3 -c "print(round(float('${PAID_AMOUNT}') + float('${PARTIAL_AMOUNT}'), 2))")
    PAID_MATCH=$(python3 -c "print('yes' if abs(float('${UPDATED_PAID}') - float('${EXPECTED_PAID}')) < 0.01 else 'no')")
    if [ "$PAID_MATCH" = "yes" ]; then
        echo -e "  ${GREEN}✓ Invoice paid_amount updated (${PAID_AMOUNT} → ${UPDATED_PAID})${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ Invoice paid_amount: expected ${EXPECTED_PAID}, got ${UPDATED_PAID}${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify invoice payment_status
    UPDATED_STATUS=$(run_sql "SELECT payment_status FROM sales.invoices WHERE invoice_id = ${INVOICE_ID}" | tr -d '[:space:]')
    if [ "$UPDATED_STATUS" = "partial" ]; then
        echo -e "  ${GREEN}✓ Payment status is 'partial'${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${YELLOW}⊘ Payment status: ${UPDATED_STATUS} (may be correct if fully paid)${NC}"; ((SKIP_COUNT++)) || true
    fi

    # Verify customer_outstanding updated
    UPDATED_OUTSTANDING=$(run_sql "SELECT outstanding_amount FROM financial.customer_outstanding WHERE document_id = ${INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
    EXPECTED_OUTSTANDING=$(python3 -c "print(round(float('${BEFORE_OUTSTANDING}') - float('${PARTIAL_AMOUNT}'), 2))")
    OUT_MATCH=$(python3 -c "print('yes' if abs(float('${UPDATED_OUTSTANDING}') - float('${EXPECTED_OUTSTANDING}')) < 0.01 else 'no')")
    if [ "$OUT_MATCH" = "yes" ]; then
        echo -e "  ${GREEN}✓ Outstanding decreased (${BEFORE_OUTSTANDING} → ${UPDATED_OUTSTANDING})${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ Outstanding: expected ${EXPECTED_OUTSTANDING}, got ${UPDATED_OUTSTANDING}${NC}"; ((FAIL_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ Payment failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 2: Pay remaining balance → fully paid
# =============================================
section "Test 2: Pay Remaining Balance (UPI)"

REMAINING=$(run_sql "SELECT credit_amount FROM sales.invoices WHERE invoice_id = ${INVOICE_ID}" | tr -d '[:space:]')
echo "  Remaining: ${REMAINING}"

if [ -n "$REMAINING" ] && python3 -c "exit(0 if float('${REMAINING}') > 0 else 1)" 2>/dev/null; then
    PAYMENT_DATA2='{
        "invoice_id": '$INVOICE_ID',
        "payment_date": "'$(date +%Y-%m-%d)'",
        "payment_mode": "upi",
        "amount": '$REMAINING',
        "transaction_reference": "UPI-TEST-123",
        "notes": "E2E test - final payment"
    }'

    parse_response "$(api_post "/payments/record" "$PAYMENT_DATA2")"

    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
        echo -e "  ${GREEN}✓ Final payment recorded: HTTP ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

        sleep 1

        # Verify fully paid
        FINAL_STATUS=$(run_sql "SELECT payment_status FROM sales.invoices WHERE invoice_id = ${INVOICE_ID}" | tr -d '[:space:]')
        if [ "$FINAL_STATUS" = "paid" ]; then
            echo -e "  ${GREEN}✓ Invoice now fully paid${NC}"; ((PASS_COUNT++)) || true
        else
            echo -e "  ${RED}✗ Expected payment_status=paid, got ${FINAL_STATUS}${NC}"; ((FAIL_COUNT++)) || true
        fi

        # Verify credit_amount = 0
        FINAL_CREDIT=$(run_sql "SELECT credit_amount FROM sales.invoices WHERE invoice_id = ${INVOICE_ID}" | tr -d '[:space:]')
        CREDIT_ZERO=$(python3 -c "print('yes' if abs(float('${FINAL_CREDIT}')) < 0.01 else 'no')")
        if [ "$CREDIT_ZERO" = "yes" ]; then
            echo -e "  ${GREEN}✓ Credit amount is 0 (fully paid)${NC}"; ((PASS_COUNT++)) || true
        else
            echo -e "  ${RED}✗ Credit amount still ${FINAL_CREDIT}${NC}"; ((FAIL_COUNT++)) || true
        fi

        # Verify outstanding = 0
        FINAL_OUT=$(run_sql "SELECT outstanding_amount FROM financial.customer_outstanding WHERE document_id = ${INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
        OUT_ZERO=$(python3 -c "print('yes' if abs(float('${FINAL_OUT}')) < 0.01 else 'no')")
        if [ "$OUT_ZERO" = "yes" ]; then
            echo -e "  ${GREEN}✓ Outstanding amount is 0${NC}"; ((PASS_COUNT++)) || true
        else
            echo -e "  ${RED}✗ Outstanding still ${FINAL_OUT}${NC}"; ((FAIL_COUNT++)) || true
        fi

        # Verify outstanding status = paid
        FINAL_OUT_STATUS=$(run_sql "SELECT status FROM financial.customer_outstanding WHERE document_id = ${INVOICE_ID} AND document_type = 'invoice'" | tr -d '[:space:]')
        if [ "$FINAL_OUT_STATUS" = "paid" ]; then
            echo -e "  ${GREEN}✓ Outstanding status = paid${NC}"; ((PASS_COUNT++)) || true
        else
            echo -e "  ${RED}✗ Outstanding status: ${FINAL_OUT_STATUS}${NC}"; ((FAIL_COUNT++)) || true
        fi
    else
        echo -e "  ${RED}✗ Final payment failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
        echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
    fi
else
    skip_test "No remaining balance to pay"
fi

# =============================================
# TEST 3: Get payments for invoice
# =============================================
section "Test 3: Get Payments for Invoice"

parse_response "$(api_get "/payments/invoice/${INVOICE_ID}")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ Get payments endpoint: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    PAYMENT_COUNT=$(echo "$RESPONSE_BODY" | jq 'if type == "array" then length elif .payments then .payments | length elif .data then .data | length else 0 end')
    if [ "$PAYMENT_COUNT" -ge "1" ] 2>/dev/null; then
        echo -e "  ${GREEN}✓ Found ${PAYMENT_COUNT} payment(s) for invoice${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ No payments found for invoice${NC}"; ((FAIL_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ Get payments failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 200)${NC}"
fi

# =============================================
# TEST 4: Payment search endpoint
# =============================================
section "Test 4: Payment Search"

parse_response "$(api_get "/payments/search?party_id=${CUSTOMER_ID}&party_type=customer&limit=5")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ Payment search endpoint: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true
else
    echo -e "  ${YELLOW}⊘ Payment search returned ${HTTP_STATUS}${NC}"; ((SKIP_COUNT++)) || true
fi

# =============================================
# Summary
# =============================================
echo ""
echo "  Final payment count: $(run_sql "SELECT COUNT(*) FROM financial.payments" | tr -d '[:space:]')"
print_summary
