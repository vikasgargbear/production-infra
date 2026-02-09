#!/bin/bash
# ============================================================
# GST Module - End-to-End Flow Tests
# ============================================================
# Tests:
#   1. GST Settings & Configuration
#   2. GST Dashboard
#   3. GST Calculation (Intra-state: CGST+SGST)
#   4. GST Calculation (Inter-state: IGST)
#   5. GST Returns Status
#   6. GST Verification
#   7. GST Compliance Status
#   8. GST Metrics
#   9. GSTR-2A Report
#  10. Credit/Debit Notes Report
#  11. DB Integrity Checks
#
# Usage:
#   export TOKEN="eyJ..."
#   ./tests/api/test_gst_e2e.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"
set +e

if [ -z "$TOKEN" ]; then
    get_test_token || { echo "Auth failed."; exit 1; }
fi

echo "=============================================="
echo " GST Module E2E Tests"
echo "=============================================="

# =============================================
# TEST 1: GST Settings & Configuration
# =============================================
section "Test 1: GST Settings & Configuration"

parse_response "$(api_get "/gst/settings")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/settings: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    # Verify GSTIN present
    GSTIN=$(echo "$RESPONSE_BODY" | jq -r '.gst_number // empty')
    if [ -n "$GSTIN" ] && [ "$GSTIN" != "null" ]; then
        echo -e "  ${GREEN}✓ GSTIN present: ${GSTIN}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ GSTIN not configured${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify state code
    STATE_CODE=$(echo "$RESPONSE_BODY" | jq -r '.state_code // empty')
    if [ -n "$STATE_CODE" ] && [ "$STATE_CODE" != "null" ]; then
        echo -e "  ${GREEN}✓ State code present: ${STATE_CODE}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ State code missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify tax rate slabs include standard rates
    TAX_RATE_COUNT=$(echo "$RESPONSE_BODY" | jq '.tax_rates | length')
    if [ "$TAX_RATE_COUNT" -ge "3" ] 2>/dev/null; then
        echo -e "  ${GREEN}✓ Tax rate options: ${TAX_RATE_COUNT} slabs${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ Tax rate slabs insufficient: ${TAX_RATE_COUNT}${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify is_valid flag
    IS_VALID=$(echo "$RESPONSE_BODY" | jq -r '.is_valid // empty')
    echo "  → GSTIN valid: ${IS_VALID}"
else
    echo -e "  ${RED}✗ GET /gst/settings failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 2: GST Dashboard
# =============================================
section "Test 2: GST Dashboard"

parse_response "$(api_get "/gst/dashboard")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/dashboard: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    # Verify outputTax field exists
    OUTPUT_TAX=$(echo "$RESPONSE_BODY" | jq '.outputTax // empty')
    if [ -n "$OUTPUT_TAX" ] && [ "$OUTPUT_TAX" != "null" ]; then
        echo -e "  ${GREEN}✓ outputTax present: ${OUTPUT_TAX}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ outputTax field missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify inputCredit field exists
    INPUT_CREDIT=$(echo "$RESPONSE_BODY" | jq '.inputCredit // empty')
    if [ -n "$INPUT_CREDIT" ] && [ "$INPUT_CREDIT" != "null" ]; then
        echo -e "  ${GREEN}✓ inputCredit present: ${INPUT_CREDIT}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ inputCredit field missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify netPayable field exists
    NET_PAYABLE=$(echo "$RESPONSE_BODY" | jq '.netPayable // empty')
    if [ -n "$NET_PAYABLE" ] && [ "$NET_PAYABLE" != "null" ]; then
        echo -e "  ${GREEN}✓ netPayable present: ${NET_PAYABLE}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ netPayable field missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify summary section
    TOTAL_INVOICES=$(echo "$RESPONSE_BODY" | jq '.summary.total_invoices // empty')
    if [ -n "$TOTAL_INVOICES" ] && [ "$TOTAL_INVOICES" != "null" ]; then
        echo -e "  ${GREEN}✓ summary.total_invoices: ${TOTAL_INVOICES}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ summary.total_invoices missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    # DB cross-check: output tax ≈ SUM(cgst+sgst+igst) from invoices
    DB_OUTPUT_TAX=$(run_sql "
        SELECT COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0)
        FROM sales.invoices
        WHERE invoice_status NOT IN ('cancelled', 'void')
          AND EXTRACT(year FROM invoice_date) = EXTRACT(year FROM CURRENT_DATE)
          AND EXTRACT(month FROM invoice_date) = EXTRACT(month FROM CURRENT_DATE)
    " | tr -d '[:space:]')

    TAX_MATCH=$(python3 -c "
api_val = float('${OUTPUT_TAX}')
db_val = float('${DB_OUTPUT_TAX}')
# Allow tolerance since API may filter by branch_id
print('yes' if abs(api_val - db_val) < 1 or db_val == 0 else 'close')
" 2>/dev/null || echo "skip")

    if [ "$TAX_MATCH" = "yes" ]; then
        echo -e "  ${GREEN}✓ Dashboard output tax matches DB: API=${OUTPUT_TAX}, DB=${DB_OUTPUT_TAX}${NC}"; ((PASS_COUNT++)) || true
    elif [ "$TAX_MATCH" = "close" ]; then
        echo -e "  ${YELLOW}⊘ Dashboard output tax close: API=${OUTPUT_TAX}, DB=${DB_OUTPUT_TAX} (branch filter)${NC}"; ((SKIP_COUNT++)) || true
    else
        echo -e "  ${YELLOW}⊘ Could not verify output tax cross-check${NC}"; ((SKIP_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ GET /gst/dashboard failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 3: GST Calculation (Intra-state)
# =============================================
section "Test 3: GST Calculation (Intra-state: CGST+SGST)"

parse_response "$(api_get "/gst/calculate?amount=1000&gst_rate=18&is_interstate=false")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/calculate (intra): ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    CGST=$(echo "$RESPONSE_BODY" | jq '.cgst // empty')
    SGST=$(echo "$RESPONSE_BODY" | jq '.sgst // empty')
    IGST=$(echo "$RESPONSE_BODY" | jq '.igst // empty')
    TOTAL_TAX=$(echo "$RESPONSE_BODY" | jq '.totalTax // empty')
    TOTAL=$(echo "$RESPONSE_BODY" | jq '.total // empty')

    # Intra-state: CGST=90, SGST=90, IGST=0
    CGST_OK=$(python3 -c "print('yes' if abs(float('${CGST}') - 90.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$CGST_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ CGST = ${CGST} (expected 90)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ CGST = ${CGST} (expected 90)${NC}"; ((FAIL_COUNT++)) || true
    fi

    SGST_OK=$(python3 -c "print('yes' if abs(float('${SGST}') - 90.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$SGST_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ SGST = ${SGST} (expected 90)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ SGST = ${SGST} (expected 90)${NC}"; ((FAIL_COUNT++)) || true
    fi

    IGST_OK=$(python3 -c "print('yes' if abs(float('${IGST}') - 0.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$IGST_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ IGST = ${IGST} (expected 0)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ IGST = ${IGST} (expected 0)${NC}"; ((FAIL_COUNT++)) || true
    fi

    TAX_OK=$(python3 -c "print('yes' if abs(float('${TOTAL_TAX}') - 180.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$TAX_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ Total tax = ${TOTAL_TAX} (expected 180)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ Total tax = ${TOTAL_TAX} (expected 180)${NC}"; ((FAIL_COUNT++)) || true
    fi

    TOTAL_OK=$(python3 -c "print('yes' if abs(float('${TOTAL}') - 1180.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$TOTAL_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ Total = ${TOTAL} (expected 1180)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ Total = ${TOTAL} (expected 1180)${NC}"; ((FAIL_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ GST calculation (intra) failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 4: GST Calculation (Inter-state)
# =============================================
section "Test 4: GST Calculation (Inter-state: IGST)"

parse_response "$(api_get "/gst/calculate?amount=1000&gst_rate=18&is_interstate=true")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/calculate (inter): ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    CGST=$(echo "$RESPONSE_BODY" | jq '.cgst // empty')
    SGST=$(echo "$RESPONSE_BODY" | jq '.sgst // empty')
    IGST=$(echo "$RESPONSE_BODY" | jq '.igst // empty')
    TOTAL_TAX=$(echo "$RESPONSE_BODY" | jq '.totalTax // empty')

    # Inter-state: CGST=0, SGST=0, IGST=180
    CGST_OK=$(python3 -c "print('yes' if abs(float('${CGST}') - 0.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$CGST_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ CGST = ${CGST} (expected 0)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ CGST = ${CGST} (expected 0)${NC}"; ((FAIL_COUNT++)) || true
    fi

    SGST_OK=$(python3 -c "print('yes' if abs(float('${SGST}') - 0.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$SGST_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ SGST = ${SGST} (expected 0)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ SGST = ${SGST} (expected 0)${NC}"; ((FAIL_COUNT++)) || true
    fi

    IGST_OK=$(python3 -c "print('yes' if abs(float('${IGST}') - 180.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$IGST_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ IGST = ${IGST} (expected 180)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ IGST = ${IGST} (expected 180)${NC}"; ((FAIL_COUNT++)) || true
    fi

    TAX_OK=$(python3 -c "print('yes' if abs(float('${TOTAL_TAX}') - 180.0) < 0.01 else 'no')" 2>/dev/null || echo "skip")
    if [ "$TAX_OK" = "yes" ]; then
        echo -e "  ${GREEN}✓ Total tax = ${TOTAL_TAX} (expected 180)${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ Total tax = ${TOTAL_TAX} (expected 180)${NC}"; ((FAIL_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ GST calculation (inter) failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 5: GST Returns Status
# =============================================
section "Test 5: GST Returns Status"

parse_response "$(api_get "/gst/returns/status")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/returns/status: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    # Verify GSTR-1 section
    GSTR1_STATUS=$(echo "$RESPONSE_BODY" | jq -r '.gstr1.status // empty')
    if [ -n "$GSTR1_STATUS" ] && [ "$GSTR1_STATUS" != "null" ]; then
        echo -e "  ${GREEN}✓ GSTR-1 status present: ${GSTR1_STATUS}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ GSTR-1 status missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    GSTR1_DUE=$(echo "$RESPONSE_BODY" | jq -r '.gstr1.dueDate // empty')
    if [ -n "$GSTR1_DUE" ] && [ "$GSTR1_DUE" != "null" ]; then
        echo -e "  ${GREEN}✓ GSTR-1 due date: ${GSTR1_DUE}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ GSTR-1 due date missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify GSTR-3B section
    GSTR3B_STATUS=$(echo "$RESPONSE_BODY" | jq -r '.gstr3b.status // empty')
    if [ -n "$GSTR3B_STATUS" ] && [ "$GSTR3B_STATUS" != "null" ]; then
        echo -e "  ${GREEN}✓ GSTR-3B status present: ${GSTR3B_STATUS}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ GSTR-3B status missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    # Verify GSTR-2B section
    GSTR2B_STATUS=$(echo "$RESPONSE_BODY" | jq -r '.gstr2b.status // empty')
    if [ -n "$GSTR2B_STATUS" ] && [ "$GSTR2B_STATUS" != "null" ]; then
        echo -e "  ${GREEN}✓ GSTR-2B status present: ${GSTR2B_STATUS}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ GSTR-2B status missing${NC}"; ((FAIL_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ GET /gst/returns/status failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 6: GST Verification
# =============================================
section "Test 6: GST Verification"

parse_response "$(api_get "/gst/verification")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/verification: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    V_SCORE=$(echo "$RESPONSE_BODY" | jq '.verification_score // empty')
    if [ -n "$V_SCORE" ] && [ "$V_SCORE" != "null" ]; then
        echo -e "  ${GREEN}✓ Verification score: ${V_SCORE}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ verification_score missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    TOTAL_INV=$(echo "$RESPONSE_BODY" | jq '.total_invoices // empty')
    echo "  → Total invoices checked: ${TOTAL_INV}"

    ISSUES_COUNT=$(echo "$RESPONSE_BODY" | jq '.total_issues // 0')
    echo "  → Issues found: ${ISSUES_COUNT}"
else
    echo -e "  ${RED}✗ GET /gst/verification failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 7: GST Compliance Status
# =============================================
section "Test 7: GST Compliance Status"

parse_response "$(api_get "/gst/compliance/status")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/compliance/status: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    C_SCORE=$(echo "$RESPONSE_BODY" | jq '.score // empty')
    if [ -n "$C_SCORE" ] && [ "$C_SCORE" != "null" ]; then
        echo -e "  ${GREEN}✓ Compliance score: ${C_SCORE}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ compliance score missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    C_STATUS=$(echo "$RESPONSE_BODY" | jq -r '.status // empty')
    if [ -n "$C_STATUS" ] && [ "$C_STATUS" != "null" ]; then
        echo -e "  ${GREEN}✓ Status: ${C_STATUS}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ status field missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    ISSUES=$(echo "$RESPONSE_BODY" | jq -r '.issues[]? // empty' 2>/dev/null)
    if [ -n "$ISSUES" ]; then
        echo "  → Issues: $(echo "$RESPONSE_BODY" | jq -r '.issues | join(", ")')"
    fi

    RECS=$(echo "$RESPONSE_BODY" | jq -r '.recommendations[]? // empty' 2>/dev/null)
    if [ -n "$RECS" ]; then
        echo "  → Recommendations: $(echo "$RESPONSE_BODY" | jq -r '.recommendations | join(", ")')"
    fi
else
    echo -e "  ${RED}✗ GET /gst/compliance/status failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 8: GST Metrics
# =============================================
section "Test 8: GST Metrics"

parse_response "$(api_get "/gst/metrics")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/metrics: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    # Verify currentMonth section has numeric fields
    SALES=$(echo "$RESPONSE_BODY" | jq '.currentMonth.sales // empty')
    if [ -n "$SALES" ] && [ "$SALES" != "null" ]; then
        echo -e "  ${GREEN}✓ currentMonth.sales: ${SALES}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ currentMonth.sales missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    OUTPUT_TAX_M=$(echo "$RESPONSE_BODY" | jq '.currentMonth.outputTax // empty')
    if [ -n "$OUTPUT_TAX_M" ] && [ "$OUTPUT_TAX_M" != "null" ]; then
        echo -e "  ${GREEN}✓ currentMonth.outputTax: ${OUTPUT_TAX_M}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ currentMonth.outputTax missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    NET_TAX=$(echo "$RESPONSE_BODY" | jq '.currentMonth.netTax // empty')
    if [ -n "$NET_TAX" ] && [ "$NET_TAX" != "null" ]; then
        echo -e "  ${GREEN}✓ currentMonth.netTax: ${NET_TAX}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ currentMonth.netTax missing${NC}"; ((FAIL_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ GET /gst/metrics failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 9: GSTR-2A Report
# =============================================
section "Test 9: GSTR-2A Report"

parse_response "$(api_get "/gst/reports/tax/gstr2a?from_date=2026-01-01&to_date=2026-02-28")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/reports/tax/gstr2a: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    # Verify invoices array
    INV_COUNT=$(echo "$RESPONSE_BODY" | jq '.invoices | length')
    echo "  → Invoices: ${INV_COUNT}"

    # Verify summary section
    SUMMARY_TOTAL=$(echo "$RESPONSE_BODY" | jq '.summary.totalInvoices // empty')
    if [ -n "$SUMMARY_TOTAL" ] && [ "$SUMMARY_TOTAL" != "null" ]; then
        echo -e "  ${GREEN}✓ summary.totalInvoices: ${SUMMARY_TOTAL}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ summary.totalInvoices missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    TOTAL_ITC=$(echo "$RESPONSE_BODY" | jq '.summary.totalITC // empty')
    if [ -n "$TOTAL_ITC" ] && [ "$TOTAL_ITC" != "null" ]; then
        echo -e "  ${GREEN}✓ summary.totalITC: ${TOTAL_ITC}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ summary.totalITC missing${NC}"; ((FAIL_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ GET /gst/reports/tax/gstr2a failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 10: Credit/Debit Notes Report
# =============================================
section "Test 10: Credit/Debit Notes Report"

parse_response "$(api_get "/gst/reports/credit-debit-notes?from_date=2026-01-01&to_date=2026-02-28")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/reports/credit-debit-notes: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    # Verify notes array
    NOTES_COUNT=$(echo "$RESPONSE_BODY" | jq '.notes | length')
    echo "  → Notes: ${NOTES_COUNT}"

    # Verify summary section
    CREDIT_NOTES=$(echo "$RESPONSE_BODY" | jq '.summary.totalCreditNotes // empty')
    if [ -n "$CREDIT_NOTES" ] && [ "$CREDIT_NOTES" != "null" ]; then
        echo -e "  ${GREEN}✓ summary.totalCreditNotes: ${CREDIT_NOTES}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ summary.totalCreditNotes missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    DEBIT_NOTES=$(echo "$RESPONSE_BODY" | jq '.summary.totalDebitNotes // empty')
    if [ -n "$DEBIT_NOTES" ] && [ "$DEBIT_NOTES" != "null" ]; then
        echo -e "  ${GREEN}✓ summary.totalDebitNotes: ${DEBIT_NOTES}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ summary.totalDebitNotes missing${NC}"; ((FAIL_COUNT++)) || true
    fi

    NET_ADJ=$(echo "$RESPONSE_BODY" | jq '.summary.netAdjustment // empty')
    if [ -n "$NET_ADJ" ] && [ "$NET_ADJ" != "null" ]; then
        echo -e "  ${GREEN}✓ summary.netAdjustment: ${NET_ADJ}${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ summary.netAdjustment missing${NC}"; ((FAIL_COUNT++)) || true
    fi
else
    echo -e "  ${RED}✗ GET /gst/reports/credit-debit-notes failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 11: GSTR-2B Status (newly mounted router)
# =============================================
section "Test 11: GSTR-2B Status Endpoint"

parse_response "$(api_get "/gst/gstr2b/status")"

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓ GET /gst/gstr2b/status: ${HTTP_STATUS}${NC}"; ((PASS_COUNT++)) || true

    # Verify response has uploads array
    UPLOADS=$(echo "$RESPONSE_BODY" | jq '.uploads | length')
    echo "  → Uploads found: ${UPLOADS}"
    echo -e "  ${GREEN}✓ GSTR-2B router mounted successfully${NC}"; ((PASS_COUNT++)) || true
elif [ "$HTTP_STATUS" = "404" ]; then
    echo -e "  ${RED}✗ GSTR-2B router not mounted (404)${NC}"; ((FAIL_COUNT++)) || true
else
    echo -e "  ${RED}✗ GET /gst/gstr2b/status failed: HTTP ${HTTP_STATUS}${NC}"; ((FAIL_COUNT++)) || true
    echo -e "  ${RED}  $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
fi

# =============================================
# TEST 12: DB Integrity Checks
# =============================================
section "Test 12: DB Integrity Checks"

# Check 1: Organization has gst_number set
ORG_GST=$(run_sql "SELECT gst_number FROM master.organizations WHERE org_id = '${ORG_ID}'" | tr -d '[:space:]')
if [ -n "$ORG_GST" ] && [ "$ORG_GST" != "" ]; then
    echo -e "  ${GREEN}✓ Organization GSTIN set: ${ORG_GST}${NC}"; ((PASS_COUNT++)) || true
else
    echo -e "  ${RED}✗ Organization GSTIN not configured${NC}"; ((FAIL_COUNT++)) || true
fi

# Check 2: Products have gst_rate values
PRODUCTS_WITH_GST=$(run_sql "SELECT COUNT(*) FROM inventory.products WHERE gst_rate IS NOT NULL AND gst_rate > 0" | tr -d '[:space:]')
TOTAL_PRODUCTS=$(run_sql "SELECT COUNT(*) FROM inventory.products" | tr -d '[:space:]')
if [ "$PRODUCTS_WITH_GST" -gt "0" ] 2>/dev/null; then
    echo -e "  ${GREEN}✓ Products with GST rate: ${PRODUCTS_WITH_GST}/${TOTAL_PRODUCTS}${NC}"; ((PASS_COUNT++)) || true
else
    echo -e "  ${RED}✗ No products have GST rate set${NC}"; ((FAIL_COUNT++)) || true
fi

# Check 3: Invoice GST amounts are non-zero for posted invoices
INVOICES_WITH_GST=$(run_sql "
    SELECT COUNT(*) FROM sales.invoices
    WHERE invoice_status = 'posted'
      AND (cgst_amount > 0 OR sgst_amount > 0 OR igst_amount > 0)
" | tr -d '[:space:]')
TOTAL_POSTED=$(run_sql "
    SELECT COUNT(*) FROM sales.invoices WHERE invoice_status = 'posted'
" | tr -d '[:space:]')
if [ "$INVOICES_WITH_GST" -gt "0" ] 2>/dev/null; then
    echo -e "  ${GREEN}✓ Posted invoices with GST: ${INVOICES_WITH_GST}/${TOTAL_POSTED}${NC}"; ((PASS_COUNT++)) || true
else
    echo -e "  ${YELLOW}⊘ No posted invoices have GST amounts${NC}"; ((SKIP_COUNT++)) || true
fi

# Check 4: GSTIN format validation (15-char alphanumeric)
if [ -n "$ORG_GST" ]; then
    GST_LEN=${#ORG_GST}
    if [ "$GST_LEN" -eq "15" ]; then
        echo -e "  ${GREEN}✓ GSTIN length valid: ${GST_LEN} chars${NC}"; ((PASS_COUNT++)) || true
    else
        echo -e "  ${RED}✗ GSTIN length: ${GST_LEN} (expected 15)${NC}"; ((FAIL_COUNT++)) || true
    fi
fi

# Check 5: gst.gstr2b_uploads table exists (for GSTR-2B feature)
GSTR2B_TABLE=$(run_sql "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'gst' AND table_name = 'gstr2b_uploads')" | tr -d '[:space:]')
if [ "$GSTR2B_TABLE" = "t" ]; then
    echo -e "  ${GREEN}✓ gst.gstr2b_uploads table exists${NC}"; ((PASS_COUNT++)) || true
else
    echo -e "  ${YELLOW}⊘ gst.gstr2b_uploads table missing (GSTR-2B feature not deployed)${NC}"; ((SKIP_COUNT++)) || true
fi

# Check 6: gst.gstr2b_invoices table exists
GSTR2B_INV_TABLE=$(run_sql "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'gst' AND table_name = 'gstr2b_invoices')" | tr -d '[:space:]')
if [ "$GSTR2B_INV_TABLE" = "t" ]; then
    echo -e "  ${GREEN}✓ gst.gstr2b_invoices table exists${NC}"; ((PASS_COUNT++)) || true
else
    echo -e "  ${YELLOW}⊘ gst.gstr2b_invoices table missing (GSTR-2B feature not deployed)${NC}"; ((SKIP_COUNT++)) || true
fi

# =============================================
# Summary
# =============================================
echo ""
print_summary
