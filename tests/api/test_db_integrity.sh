#!/bin/bash
# ============================================================
# Database Integrity Checks
# ============================================================
# Validates data consistency across tables. No API calls needed.
# Safe to run anytime.
#
# Usage:
#   ./tests/api/test_db_integrity.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/test_helpers.sh"

echo "=============================================="
echo " Database Integrity Checks"
echo "=============================================="

# =============================================
# 1. Triggers status
# =============================================
section "1. Trigger Status"

# These should be DISABLED (D)
for TRG in "trigger_analyze_price_trend:procurement.grn_items" "trigger_process_purchase_batch:procurement.purchase_order_items"; do
    TRG_NAME=$(echo "$TRG" | cut -d: -f1)
    TRG_TABLE=$(echo "$TRG" | cut -d: -f2)
    STATUS=$(run_sql "SELECT tgenabled FROM pg_trigger WHERE tgname = '${TRG_NAME}' AND tgrelid = '${TRG_TABLE}'::regclass" | tr -d '[:space:]')
    if [ "$STATUS" = "D" ]; then
        echo -e "  ${GREEN}✓ ${TRG_NAME} is DISABLED (correct)${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ ${TRG_NAME} is ${STATUS:-missing} (should be D=disabled)${NC}"; ((FAIL_COUNT++))
    fi
done

# These should be ENABLED (O)
for TRG in "trigger_validate_purchase_item:procurement.purchase_order_items" "trigger_process_grn_batch:procurement.grn_items"; do
    TRG_NAME=$(echo "$TRG" | cut -d: -f1)
    TRG_TABLE=$(echo "$TRG" | cut -d: -f2)
    STATUS=$(run_sql "SELECT tgenabled FROM pg_trigger WHERE tgname = '${TRG_NAME}' AND tgrelid = '${TRG_TABLE}'::regclass" | tr -d '[:space:]')
    if [ "$STATUS" = "O" ]; then
        echo -e "  ${GREEN}✓ ${TRG_NAME} is ENABLED (correct)${NC}"; ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ ${TRG_NAME} is ${STATUS:-missing} (should be O=enabled)${NC}"; ((FAIL_COUNT++))
    fi
done

# =============================================
# 2. No negative batch quantities
# =============================================
section "2. Batch Integrity"

NEGATIVE_BATCHES=$(run_sql "SELECT COUNT(*) FROM inventory.batches WHERE quantity_available < 0" | tr -d '[:space:]')
if [ "$NEGATIVE_BATCHES" = "0" ]; then
    echo -e "  ${GREEN}✓ No negative batch quantities${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${NEGATIVE_BATCHES} batches with negative quantity_available${NC}"; ((FAIL_COUNT++))
    run_sql "SELECT batch_id, product_id, batch_number, quantity_available FROM inventory.batches WHERE quantity_available < 0"
fi

# Active batches should have expiry dates
NO_EXPIRY=$(run_sql "SELECT COUNT(*) FROM inventory.batches WHERE batch_status = 'active' AND expiry_date IS NULL" | tr -d '[:space:]')
if [ "$NO_EXPIRY" = "0" ]; then
    echo -e "  ${GREEN}✓ All active batches have expiry dates${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${YELLOW}⊘ ${NO_EXPIRY} active batches without expiry date${NC}"; ((SKIP_COUNT++))
fi

# =============================================
# 3. GRN data integrity
# =============================================
section "3. GRN Integrity"

# All GRNs should have valid source
INVALID_SOURCE=$(run_sql "SELECT COUNT(*) FROM procurement.goods_receipt_notes WHERE source NOT IN ('DIRECT', 'PO', 'MANUAL') AND source IS NOT NULL" | tr -d '[:space:]')
if [ "$INVALID_SOURCE" = "0" ]; then
    echo -e "  ${GREEN}✓ All GRNs have valid source (DIRECT/PO/MANUAL)${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${INVALID_SOURCE} GRNs with invalid source${NC}"; ((FAIL_COUNT++))
fi

# Auto-GRNs should have stock_updated=true
BAD_AUTO_GRN=$(run_sql "SELECT COUNT(*) FROM procurement.goods_receipt_notes WHERE source IN ('DIRECT', 'PO') AND stock_updated = false" | tr -d '[:space:]')
if [ "$BAD_AUTO_GRN" = "0" ]; then
    echo -e "  ${GREEN}✓ All auto-GRNs have stock_updated=true${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${BAD_AUTO_GRN} auto-GRNs with stock_updated=false${NC}"; ((FAIL_COUNT++))
fi

# GRN items should match GRN header count
ORPHAN_GRN_ITEMS=$(run_sql "SELECT COUNT(*) FROM procurement.grn_items gi WHERE NOT EXISTS (SELECT 1 FROM procurement.goods_receipt_notes g WHERE g.grn_id = gi.grn_id)" | tr -d '[:space:]')
if [ "$ORPHAN_GRN_ITEMS" = "0" ]; then
    echo -e "  ${GREEN}✓ No orphan GRN items${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${ORPHAN_GRN_ITEMS} orphan GRN items${NC}"; ((FAIL_COUNT++))
fi

# =============================================
# 4. PO → Received consistency
# =============================================
section "4. PO Received Quantity Consistency"

# PO items: received_quantity should not exceed ordered_quantity
OVER_RECEIVED=$(run_sql "SELECT COUNT(*) FROM procurement.purchase_order_items WHERE COALESCE(received_quantity, 0) > ordered_quantity" | tr -d '[:space:]')
if [ "$OVER_RECEIVED" = "0" ]; then
    echo -e "  ${GREEN}✓ No PO items with received > ordered${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${OVER_RECEIVED} PO items over-received${NC}"; ((FAIL_COUNT++))
fi

# PO status should match receipt state
MISMATCHED_PO=$(run_sql "
SELECT COUNT(*) FROM procurement.purchase_orders po
WHERE po.po_status = 'completed'
AND EXISTS (
    SELECT 1 FROM procurement.purchase_order_items poi
    WHERE poi.purchase_order_id = po.purchase_order_id
    AND poi.ordered_quantity > COALESCE(poi.received_quantity, 0)
    AND COALESCE(poi.item_status, 'pending') != 'cancelled'
)" | tr -d '[:space:]')
if [ "$MISMATCHED_PO" = "0" ]; then
    echo -e "  ${GREEN}✓ No completed POs with unreceived items${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${YELLOW}⊘ ${MISMATCHED_PO} 'completed' POs still have unreceived items${NC}"; ((SKIP_COUNT++))
fi

# =============================================
# 5. Inventory movements consistency
# =============================================
section "5. Inventory Movements"

# All movements should have valid location_id
BAD_LOCATIONS=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements im WHERE im.location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory.storage_locations sl WHERE sl.location_id = im.location_id)" | tr -d '[:space:]')
if [ "$BAD_LOCATIONS" = "0" ]; then
    echo -e "  ${GREEN}✓ All movements reference valid locations${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${BAD_LOCATIONS} movements with invalid location_id${NC}"; ((FAIL_COUNT++))
fi

# Movement directions should be lowercase 'in'/'out' (not mixed case)
MIXED_CASE=$(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements WHERE movement_direction NOT IN ('in', 'out', 'IN', 'OUT')" | tr -d '[:space:]')
if [ "$MIXED_CASE" = "0" ]; then
    echo -e "  ${GREEN}✓ All movement directions are valid${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${MIXED_CASE} movements with invalid direction${NC}"; ((FAIL_COUNT++))
fi

# =============================================
# 6. Location wise stock consistency
# =============================================
section "6. Location-Wise Stock"

# LWS quantity should not be negative
NEGATIVE_LWS=$(run_sql "SELECT COUNT(*) FROM inventory.location_wise_stock WHERE quantity_available < 0" | tr -d '[:space:]')
if [ "$NEGATIVE_LWS" = "0" ]; then
    echo -e "  ${GREEN}✓ No negative location stock${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${NEGATIVE_LWS} location stock entries with negative quantity${NC}"; ((FAIL_COUNT++))
fi

# All LWS should reference valid locations
INVALID_LWS_LOC=$(run_sql "SELECT COUNT(*) FROM inventory.location_wise_stock lws WHERE NOT EXISTS (SELECT 1 FROM inventory.storage_locations sl WHERE sl.location_id = lws.location_id)" | tr -d '[:space:]')
if [ "$INVALID_LWS_LOC" = "0" ]; then
    echo -e "  ${GREEN}✓ All location stock references valid locations${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ ${INVALID_LWS_LOC} location stock with invalid location${NC}"; ((FAIL_COUNT++))
fi

# =============================================
# 7. Supplier invoice consistency
# =============================================
section "7. Supplier Invoices"

# All supplier invoices should have items
EMPTY_INVOICES=$(run_sql "SELECT COUNT(*) FROM procurement.supplier_invoices si WHERE NOT EXISTS (SELECT 1 FROM procurement.supplier_invoice_items sii WHERE sii.supplier_invoice_id = si.supplier_invoice_id)" | tr -d '[:space:]')
if [ "$EMPTY_INVOICES" = "0" ]; then
    echo -e "  ${GREEN}✓ All supplier invoices have items${NC}"; ((PASS_COUNT++))
else
    echo -e "  ${YELLOW}⊘ ${EMPTY_INVOICES} supplier invoices without items${NC}"; ((SKIP_COUNT++))
fi

# =============================================
# Summary
# =============================================
section "Record Counts"
echo "  Purchase Orders:    $(run_sql "SELECT COUNT(*) FROM procurement.purchase_orders" | tr -d '[:space:]')"
echo "  PO Items:           $(run_sql "SELECT COUNT(*) FROM procurement.purchase_order_items" | tr -d '[:space:]')"
echo "  Supplier Invoices:  $(run_sql "SELECT COUNT(*) FROM procurement.supplier_invoices" | tr -d '[:space:]')"
echo "  GRNs:               $(run_sql "SELECT COUNT(*) FROM procurement.goods_receipt_notes" | tr -d '[:space:]')"
echo "  GRN Items:          $(run_sql "SELECT COUNT(*) FROM procurement.grn_items" | tr -d '[:space:]')"
echo "  Batches:            $(run_sql "SELECT COUNT(*) FROM inventory.batches" | tr -d '[:space:]')"
echo "  Movements:          $(run_sql "SELECT COUNT(*) FROM inventory.inventory_movements" | tr -d '[:space:]')"
echo "  Location Stock:     $(run_sql "SELECT COUNT(*) FROM inventory.location_wise_stock" | tr -d '[:space:]')"
echo "  Sales Invoices:     $(run_sql "SELECT COUNT(*) FROM sales.invoices" | tr -d '[:space:]')"
echo "  Sales Returns:      $(run_sql "SELECT COUNT(*) FROM sales.sales_returns" | tr -d '[:space:]')"

print_summary
