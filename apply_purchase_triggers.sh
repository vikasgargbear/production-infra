#!/bin/bash

# Apply Purchase Entry Triggers
# This script applies triggers that handle batch creation and inventory updates
# when purchases are created directly (without GRN)

echo "========================================="
echo "APPLYING PURCHASE ENTRY TRIGGERS"
echo "========================================="

# Apply the triggers
echo "Applying direct purchase triggers..."
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" \
    -f database/04-triggers/04a_direct_purchase_triggers.sql

if [ $? -eq 0 ]; then
    echo "✅ Purchase triggers applied successfully!"
else
    echo "❌ Failed to apply purchase triggers"
    exit 1
fi

echo ""
echo "Verifying triggers were created..."
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -c "
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgname LIKE '%purchase%' 
   OR tgname LIKE '%batch%'
ORDER BY tgname;
"

echo ""
echo "========================================="
echo "PURCHASE TRIGGERS DEPLOYMENT COMPLETE"
echo "========================================="
echo ""
echo "What these triggers do:"
echo "1. ✅ Create/update batch records when purchase items are added"
echo "2. ✅ Update inventory stock levels automatically"
echo "3. ✅ Track stock movements for audit trail"
echo "4. ✅ Update product pricing (cost, selling, MRP)"
echo "5. ✅ Handle purchase cancellations (reverse inventory)"
echo "6. ✅ Validate purchase items (auto-generate batch numbers, set expiry dates)"
echo ""
echo "Now when you create a purchase entry:"
echo "- Batches are automatically created/updated"
echo "- Stock levels are updated in real-time"
echo "- Product costs are recalculated using weighted average"
echo "- All changes are tracked in stock_movements"
echo ""