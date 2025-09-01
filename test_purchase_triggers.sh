#!/bin/bash

echo "========================================="
echo "TESTING PURCHASE ENTRY TRIGGERS"
echo "========================================="

# Test by checking if a recent purchase created batches and updated inventory
echo ""
echo "Checking recent purchase entries and their effects..."
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -c "
-- Show recent purchase items and corresponding batches
WITH recent_purchases AS (
    SELECT 
        poi.po_item_id,
        po.po_number,
        poi.product_id,
        poi.product_name,
        poi.ordered_quantity,
        poi.unit_price,
        poi.batch_number,
        poi.expiry_date,
        poi.created_at as purchase_date
    FROM procurement.purchase_order_items poi
    JOIN procurement.purchase_orders po ON po.purchase_order_id = poi.purchase_order_id
    WHERE poi.created_at > CURRENT_DATE - INTERVAL '7 days'
    ORDER BY poi.created_at DESC
    LIMIT 5
)
SELECT 
    rp.po_number,
    rp.product_name,
    rp.ordered_quantity as purchase_qty,
    rp.batch_number as purchase_batch,
    b.batch_number as created_batch,
    b.quantity_available as batch_qty,
    sl.quantity_in_stock as stock_level
FROM recent_purchases rp
LEFT JOIN inventory.batches b 
    ON b.product_id = rp.product_id 
    AND b.batch_number = rp.batch_number
LEFT JOIN inventory.stock_levels sl
    ON sl.product_id = rp.product_id;
"

echo ""
echo "Checking stock movements created by purchases..."
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -c "
SELECT 
    sm.movement_date,
    sm.movement_type,
    p.product_name,
    sm.quantity,
    sm.reference_type,
    sm.notes
FROM inventory.stock_movements sm
JOIN inventory.products p ON p.product_id = sm.product_id
WHERE sm.movement_type = 'purchase'
  AND sm.created_at > CURRENT_DATE - INTERVAL '7 days'
ORDER BY sm.created_at DESC
LIMIT 10;
"

echo ""
echo "========================================="
echo "TEST COMPLETE"
echo "========================================="
echo ""
echo "If you see batches and stock levels matching purchase quantities,"
echo "then the triggers are working correctly!"
echo ""