#!/bin/bash
# ============================================================
# Purchase Module - End-to-End Flow Tests
# ============================================================
# Tests both purchase paths:
#   Path 1: Standalone Purchase Entry → auto-GRN (source=DIRECT)
#   Path 2: PO → Record Receipt → Purchase Entry → auto-GRN (source=PO)
#
# Usage:
#   export TEST_EMAIL="your@email.com"
#   export TEST_PASSWORD="yourpassword"
#   ./tests/api/test_purchase_flow.sh
#
# Or with existing token:
#   export TOKEN="eyJ..."
#   ./tests/api/test_purchase_flow.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"

# Auth
if [ -z "$TOKEN" ]; then
    get_test_token || { echo "Auth failed. Set TOKEN env var directly or provide TEST_EMAIL/TEST_PASSWORD."; exit 1; }
fi

# Snapshot counts before tests
BEFORE_INVOICES=$(run_sql "SELECT COUNT(*) FROM procurement.supplier_invoices")
BEFORE_BATCHES=$(run_sql "SELECT COUNT(*) FROM inventory.batches")
BEFORE_MOVEMENTS=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements")
BEFORE_GRN=$(run_sql "SELECT COUNT(*) FROM procurement.goods_receipt_notes")
BEFORE_GRN_ITEMS=$(run_sql "SELECT COUNT(*) FROM procurement.grn_items")
BEFORE_LWS=$(run_sql "SELECT COUNT(*) FROM inventory.location_wise_stock")
BEFORE_PO=$(run_sql "SELECT COUNT(*) FROM procurement.purchase_orders")

echo "=============================================="
echo " Purchase Module E2E Tests"
echo "=============================================="
echo " Before: ${BEFORE_INVOICES} invoices, ${BEFORE_BATCHES} batches,"
echo "         ${BEFORE_MOVEMENTS} movements, ${BEFORE_GRN} GRNs,"
echo "         ${BEFORE_GRN_ITEMS} GRN items, ${BEFORE_LWS} location stock"
echo "=============================================="

# =============================================
# TEST 1: Standalone Purchase Entry (Path 1)
# =============================================
section "Test 1: Standalone Purchase Entry → auto-GRN (DIRECT)"

PURCHASE_ENTRY_DATA='{
    "supplier_id": 51,
    "invoice_number": "TEST-PE-'$(date +%s)'",
    "invoice_date": "'$(date +%Y-%m-%d)'",
    "subtotal_amount": 1000,
    "discount_amount": 0,
    "tax_amount": 180,
    "final_amount": 1180,
    "payment_terms": "immediate",
    "items": [
        {
            "product_id": 122,
            "product_name": "Airpods Pro",
            "quantity": 10,
            "cost_price": 50,
            "mrp": 100,
            "selling_price": 90,
            "tax_percent": 18,
            "batch_number": "TEST-BATCH-PE-'$(date +%s)'",
            "expiry_date": "2028-12-31"
        },
        {
            "product_id": 124,
            "product_name": "Atlas",
            "quantity": 5,
            "cost_price": 100,
            "mrp": 200,
            "selling_price": 180,
            "tax_percent": 18,
            "batch_number": "TEST-BATCH-PE2-'$(date +%s)'",
            "expiry_date": "2028-06-30"
        }
    ]
}'

parse_response "$(api_post "/purchases/purchase-entry" "$PURCHASE_ENTRY_DATA")"
assert_status "200" "Purchase entry HTTP status"
assert_json_exists ".invoice_id" "Supplier invoice created"
assert_json_exists ".grn_id" "GRN auto-created"
assert_json_exists ".grn_number" "GRN number assigned"
assert_json_field ".items_created" "2" "2 items created"

PE_INVOICE_ID=$(echo "$RESPONSE_BODY" | jq -r '.invoice_id')
PE_GRN_ID=$(echo "$RESPONSE_BODY" | jq -r '.grn_id')
PE_GRN_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.grn_number')
echo "  → Invoice: ${PE_INVOICE_ID}, GRN: ${PE_GRN_ID} (${PE_GRN_NUMBER})"

# Verify DB state
section "Test 1: DB Verification"

if [ -n "$PE_GRN_ID" ] && [ "$PE_GRN_ID" != "null" ]; then
    # GRN header check
    GRN_SOURCE=$(run_sql "SELECT source FROM procurement.goods_receipt_notes WHERE grn_id = ${PE_GRN_ID}")
    GRN_SOURCE=$(echo "$GRN_SOURCE" | tr -d '[:space:]')
    if [ "$GRN_SOURCE" = "DIRECT" ]; then
        echo -e "  ${GREEN}✓ GRN source is DIRECT${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ GRN source: expected DIRECT, got '${GRN_SOURCE}'${NC}"; ((FAIL_COUNT++))
    fi

    GRN_STOCK=$(run_sql "SELECT stock_updated FROM procurement.goods_receipt_notes WHERE grn_id = ${PE_GRN_ID}")
    GRN_STOCK=$(echo "$GRN_STOCK" | tr -d '[:space:]')
    if [ "$GRN_STOCK" = "t" ]; then
        echo -e "  ${GREEN}✓ GRN stock_updated = true${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ GRN stock_updated: expected true, got '${GRN_STOCK}'${NC}"; ((FAIL_COUNT++))
    fi

    # GRN items
    GRN_ITEM_COUNT=$(run_sql "SELECT COUNT(*) FROM procurement.grn_items WHERE grn_id = ${PE_GRN_ID}")
    GRN_ITEM_COUNT=$(echo "$GRN_ITEM_COUNT" | tr -d '[:space:]')
    if [ "$GRN_ITEM_COUNT" = "2" ]; then
        echo -e "  ${GREEN}✓ GRN has 2 items${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ GRN items: expected 2, got ${GRN_ITEM_COUNT}${NC}"; ((FAIL_COUNT++))
    fi

    # Supplier invoice link
    GRN_INV_ID=$(run_sql "SELECT supplier_invoice_id FROM procurement.goods_receipt_notes WHERE grn_id = ${PE_GRN_ID}")
    GRN_INV_ID=$(echo "$GRN_INV_ID" | tr -d '[:space:]')
    if [ "$GRN_INV_ID" = "$PE_INVOICE_ID" ]; then
        echo -e "  ${GREEN}✓ GRN linked to supplier invoice ${PE_INVOICE_ID}${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ GRN invoice link: expected ${PE_INVOICE_ID}, got ${GRN_INV_ID}${NC}"; ((FAIL_COUNT++))
    fi
fi

# Inventory movements
MOVEMENT_COUNT=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE reference_type = 'supplier_invoice' AND reference_id = ${PE_INVOICE_ID}")
MOVEMENT_COUNT=$(echo "$MOVEMENT_COUNT" | tr -d '[:space:]')
if [ "$MOVEMENT_COUNT" = "2" ]; then
    echo -e "  ${GREEN}✓ 2 inventory movements created${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Movements: expected 2, got ${MOVEMENT_COUNT}${NC}"; ((FAIL_COUNT++))
fi

# Location wise stock
LWS_NEW=$(run_sql "SELECT COUNT(*) FROM inventory.location_wise_stock")
LWS_NEW=$(echo "$LWS_NEW" | tr -d '[:space:]')
LWS_BEFORE=$(echo "$BEFORE_LWS" | tr -d '[:space:]')
if [ "$LWS_NEW" -gt "$LWS_BEFORE" ]; then
    echo -e "  ${GREEN}✓ Location wise stock updated (${LWS_BEFORE} → ${LWS_NEW})${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Location wise stock not updated (still ${LWS_NEW})${NC}"; ((FAIL_COUNT++))
fi

# Batches
BATCH_NEW=$(run_sql "SELECT COUNT(*) FROM inventory.batches")
BATCH_NEW=$(echo "$BATCH_NEW" | tr -d '[:space:]')
BATCH_BEFORE=$(echo "$BEFORE_BATCHES" | tr -d '[:space:]')
EXPECTED_BATCHES=$((BATCH_BEFORE + 2))
if [ "$BATCH_NEW" = "$EXPECTED_BATCHES" ]; then
    echo -e "  ${GREEN}✓ 2 new batches created (${BATCH_BEFORE} → ${BATCH_NEW})${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Batches: expected ${EXPECTED_BATCHES}, got ${BATCH_NEW}${NC}"; ((FAIL_COUNT++))
fi

# =============================================
# TEST 2: PO Creation (commitment only, no stock)
# =============================================
section "Test 2: PO Creation → no stock created"

PO_CREATE_DATA='{
    "supplier_id": 51,
    "supplier_name": "April Health",
    "purchase_date": "'$(date +%Y-%m-%d)'",
    "subtotal_amount": 500,
    "discount_amount": 0,
    "tax_amount": 90,
    "other_charges": 0,
    "final_amount": 590,
    "purchase_status": "draft",
    "payment_mode": "cash",
    "items": [
        {
            "product_id": 122,
            "product_name": "Airpods Pro",
            "ordered_quantity": 20,
            "cost_price": 25,
            "mrp": 50,
            "tax_percent": 18,
            "batch_number": "",
            "expiry_date": "2028-12-31"
        }
    ]
}'

# Snapshot before PO
BATCHES_BEFORE_PO=$(run_sql "SELECT COUNT(*) FROM inventory.batches")
MOVEMENTS_BEFORE_PO=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements")

parse_response "$(api_post "/purchases/with-items" "$PO_CREATE_DATA")"
assert_status "200" "PO creation HTTP status"
assert_json_exists ".purchase_id" "PO created"

PO_ID=$(echo "$RESPONSE_BODY" | jq -r '.purchase_id')
PO_NUMBER=$(echo "$RESPONSE_BODY" | jq -r '.purchase_number')
echo "  → PO: ${PO_ID} (${PO_NUMBER})"

# Verify NO stock was created by PO (trigger disabled)
BATCHES_AFTER_PO=$(run_sql "SELECT COUNT(*) FROM inventory.batches")
MOVEMENTS_AFTER_PO=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements")
BATCHES_BEFORE_PO=$(echo "$BATCHES_BEFORE_PO" | tr -d '[:space:]')
BATCHES_AFTER_PO=$(echo "$BATCHES_AFTER_PO" | tr -d '[:space:]')
MOVEMENTS_BEFORE_PO=$(echo "$MOVEMENTS_BEFORE_PO" | tr -d '[:space:]')
MOVEMENTS_AFTER_PO=$(echo "$MOVEMENTS_AFTER_PO" | tr -d '[:space:]')

if [ "$BATCHES_AFTER_PO" = "$BATCHES_BEFORE_PO" ]; then
    echo -e "  ${GREEN}✓ No batches created by PO (trigger disabled)${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ PO created batches! Before: ${BATCHES_BEFORE_PO}, After: ${BATCHES_AFTER_PO}${NC}"; ((FAIL_COUNT++))
fi

if [ "$MOVEMENTS_AFTER_PO" = "$MOVEMENTS_BEFORE_PO" ]; then
    echo -e "  ${GREEN}✓ No movements created by PO${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ PO created movements! Before: ${MOVEMENTS_BEFORE_PO}, After: ${MOVEMENTS_AFTER_PO}${NC}"; ((FAIL_COUNT++))
fi

# Verify PO status
PO_STATUS=$(run_sql "SELECT po_status FROM procurement.purchase_orders WHERE purchase_order_id = ${PO_ID}")
PO_STATUS=$(echo "$PO_STATUS" | tr -d '[:space:]')
if [ "$PO_STATUS" = "draft" ]; then
    echo -e "  ${GREEN}✓ PO status is 'draft' (commitment only)${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ PO status: expected 'draft', got '${PO_STATUS}'${NC}"; ((FAIL_COUNT++))
fi

# =============================================
# TEST 3: PO → Get for Entry (pre-fill data)
# =============================================
section "Test 3: GET /purchases/${PO_ID}/for-entry"

if [ -n "$PO_ID" ] && [ "$PO_ID" != "null" ]; then
    parse_response "$(api_get "/purchases/${PO_ID}/for-entry")"
    assert_status "200" "For-entry HTTP status"
    assert_json_exists ".purchase_order_id" "PO ID returned"
    assert_json_exists ".supplier_id" "Supplier ID returned"
    assert_json_exists ".items" "Items array returned"

    ITEM_COUNT=$(echo "$RESPONSE_BODY" | jq '.items | length')
    if [ "$ITEM_COUNT" = "1" ]; then
        echo -e "  ${GREEN}✓ 1 item with remaining quantity${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Expected 1 item, got ${ITEM_COUNT}${NC}"; ((FAIL_COUNT++))
    fi

    REMAINING=$(echo "$RESPONSE_BODY" | jq -r '.items[0].remaining_quantity')
    if [ "$REMAINING" = "20.000" ] || [ "$REMAINING" = "20" ] || [ "$REMAINING" = "20.0" ]; then
        echo -e "  ${GREEN}✓ Remaining quantity: ${REMAINING}${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Remaining quantity: expected 20, got ${REMAINING}${NC}"; ((FAIL_COUNT++))
    fi
else
    skip_test "PO creation failed, skipping for-entry test"
fi

# =============================================
# TEST 4: PO-linked Purchase Entry (Path 2)
# =============================================
section "Test 4: Purchase Entry linked to PO → auto-GRN (PO)"

if [ -n "$PO_ID" ] && [ "$PO_ID" != "null" ]; then
    # Get the PO item ID
    PO_ITEM_ID=$(run_sql "SELECT po_item_id FROM procurement.purchase_order_items WHERE purchase_order_id = ${PO_ID} LIMIT 1")
    PO_ITEM_ID=$(echo "$PO_ITEM_ID" | tr -d '[:space:]')

    PO_LINKED_DATA='{
        "supplier_id": 51,
        "purchase_order_id": '$PO_ID',
        "invoice_number": "TEST-PO-PE-'$(date +%s)'",
        "invoice_date": "'$(date +%Y-%m-%d)'",
        "subtotal_amount": 500,
        "discount_amount": 0,
        "tax_amount": 90,
        "final_amount": 590,
        "items": [
            {
                "product_id": 122,
                "product_name": "Airpods Pro",
                "quantity": 15,
                "ordered_quantity": 20,
                "po_item_id": '$PO_ITEM_ID',
                "cost_price": 25,
                "mrp": 50,
                "selling_price": 45,
                "tax_percent": 18,
                "batch_number": "TEST-PO-BATCH-'$(date +%s)'",
                "expiry_date": "2028-12-31"
            }
        ]
    }'

    parse_response "$(api_post "/purchases/purchase-entry" "$PO_LINKED_DATA")"
    assert_status "200" "PO-linked purchase entry HTTP status"
    assert_json_exists ".invoice_id" "Supplier invoice created"
    assert_json_exists ".grn_id" "GRN auto-created"
    assert_json_field ".purchase_order_id" "$PO_ID" "PO ID returned in response"

    PO_PE_GRN_ID=$(echo "$RESPONSE_BODY" | jq -r '.grn_id')
    PO_PE_STATUS=$(echo "$RESPONSE_BODY" | jq -r '.po_status')
    echo "  → GRN: ${PO_PE_GRN_ID}, PO status: ${PO_PE_STATUS}"

    # Verify GRN source is PO
    if [ -n "$PO_PE_GRN_ID" ] && [ "$PO_PE_GRN_ID" != "null" ]; then
        GRN_PO_SOURCE=$(run_sql "SELECT source FROM procurement.goods_receipt_notes WHERE grn_id = ${PO_PE_GRN_ID}")
        GRN_PO_SOURCE=$(echo "$GRN_PO_SOURCE" | tr -d '[:space:]')
        if [ "$GRN_PO_SOURCE" = "PO" ]; then
            echo -e "  ${GREEN}✓ GRN source is PO${NC}"; ((PASS_COUNT++))
        else
            echo -e "  ${RED}✗ GRN source: expected PO, got '${GRN_PO_SOURCE}'${NC}"; ((FAIL_COUNT++))
        fi

        # GRN linked to PO
        GRN_PO_ID=$(run_sql "SELECT purchase_order_id FROM procurement.goods_receipt_notes WHERE grn_id = ${PO_PE_GRN_ID}")
        GRN_PO_ID=$(echo "$GRN_PO_ID" | tr -d '[:space:]')
        if [ "$GRN_PO_ID" = "$PO_ID" ]; then
            echo -e "  ${GREEN}✓ GRN linked to PO ${PO_ID}${NC}"; ((PASS_COUNT++))
        else
            echo -e "  ${RED}✗ GRN PO link: expected ${PO_ID}, got ${GRN_PO_ID}${NC}"; ((FAIL_COUNT++))
        fi
    fi

    # Verify PO received_quantity updated
    RECEIVED_QTY=$(run_sql "SELECT received_quantity FROM procurement.purchase_order_items WHERE po_item_id = ${PO_ITEM_ID}")
    RECEIVED_QTY=$(echo "$RECEIVED_QTY" | tr -d '[:space:]')
    if [ "$RECEIVED_QTY" = "15.000" ] || [ "$RECEIVED_QTY" = "15" ]; then
        echo -e "  ${GREEN}✓ PO item received_quantity: ${RECEIVED_QTY}${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ PO item received_quantity: expected 15, got ${RECEIVED_QTY}${NC}"; ((FAIL_COUNT++))
    fi

    # Verify PO status = partial (received 15 of 20)
    PO_NEW_STATUS=$(run_sql "SELECT po_status FROM procurement.purchase_orders WHERE purchase_order_id = ${PO_ID}")
    PO_NEW_STATUS=$(echo "$PO_NEW_STATUS" | tr -d '[:space:]')
    if [ "$PO_NEW_STATUS" = "partial" ]; then
        echo -e "  ${GREEN}✓ PO status is 'partial' (15/20 received)${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ PO status: expected 'partial', got '${PO_NEW_STATUS}'${NC}"; ((FAIL_COUNT++))
    fi

    # Test 4b: Get for-entry again (should show remaining 5)
    section "Test 4b: GET /purchases/${PO_ID}/for-entry (after partial receipt)"
    parse_response "$(api_get "/purchases/${PO_ID}/for-entry")"
    assert_status "200" "For-entry after partial receipt"
    REMAINING2=$(echo "$RESPONSE_BODY" | jq -r '.items[0].remaining_quantity')
    if [ "$REMAINING2" = "5.000" ] || [ "$REMAINING2" = "5" ] || [ "$REMAINING2" = "5.0" ]; then
        echo -e "  ${GREEN}✓ Remaining quantity after partial: ${REMAINING2}${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Remaining: expected 5, got ${REMAINING2}${NC}"; ((FAIL_COUNT++))
    fi
else
    skip_test "PO creation failed, skipping PO-linked purchase entry test"
fi

# =============================================
# TEST 5: GRN List (read-only viewer)
# =============================================
section "Test 5: GRN DB Verification"

# No list endpoint yet — verify directly in DB
GRN_COUNT=$(run_sql "SELECT COUNT(*) FROM procurement.goods_receipt_notes WHERE source IN ('DIRECT','PO')")
GRN_COUNT=$(echo "$GRN_COUNT" | tr -d '[:space:]')
if [ "$GRN_COUNT" -ge "2" ]; then
    echo -e "  ${GREEN}✓ At least 2 auto-created GRNs in DB (found ${GRN_COUNT})${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Expected >= 2 auto-GRNs, found ${GRN_COUNT}${NC}"; ((FAIL_COUNT++))
fi

# Verify GRN sources are correct
DIRECT_COUNT=$(run_sql "SELECT COUNT(*) FROM procurement.goods_receipt_notes WHERE source = 'DIRECT'" | tr -d '[:space:]')
PO_COUNT=$(run_sql "SELECT COUNT(*) FROM procurement.goods_receipt_notes WHERE source = 'PO'" | tr -d '[:space:]')
echo "  GRN sources: ${DIRECT_COUNT} DIRECT, ${PO_COUNT} PO"
if [ "$DIRECT_COUNT" -ge "1" ] && [ "$PO_COUNT" -ge "1" ]; then
    echo -e "  ${GREEN}✓ Both DIRECT and PO GRNs exist${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Expected both DIRECT and PO GRNs${NC}"; ((FAIL_COUNT++))
fi

# =============================================
# FINAL SUMMARY
# =============================================
section "Final DB State"
AFTER_INVOICES=$(run_sql "SELECT COUNT(*) FROM procurement.supplier_invoices")
AFTER_BATCHES=$(run_sql "SELECT COUNT(*) FROM inventory.batches")
AFTER_MOVEMENTS=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements")
AFTER_GRN=$(run_sql "SELECT COUNT(*) FROM procurement.goods_receipt_notes")
AFTER_GRN_ITEMS=$(run_sql "SELECT COUNT(*) FROM procurement.grn_items")
AFTER_LWS=$(run_sql "SELECT COUNT(*) FROM inventory.location_wise_stock")

echo "  Supplier invoices: $(echo $BEFORE_INVOICES | tr -d '[:space:]') → $(echo $AFTER_INVOICES | tr -d '[:space:]')"
echo "  Batches:           $(echo $BEFORE_BATCHES | tr -d '[:space:]') → $(echo $AFTER_BATCHES | tr -d '[:space:]')"
echo "  Movements:         $(echo $BEFORE_MOVEMENTS | tr -d '[:space:]') → $(echo $AFTER_MOVEMENTS | tr -d '[:space:]')"
echo "  GRNs:              $(echo $BEFORE_GRN | tr -d '[:space:]') → $(echo $AFTER_GRN | tr -d '[:space:]')"
echo "  GRN Items:         $(echo $BEFORE_GRN_ITEMS | tr -d '[:space:]') → $(echo $AFTER_GRN_ITEMS | tr -d '[:space:]')"
echo "  Location Stock:    $(echo $BEFORE_LWS | tr -d '[:space:]') → $(echo $AFTER_LWS | tr -d '[:space:]')"

print_summary
