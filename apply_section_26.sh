#!/bin/bash

# Apply Section 26 of MASTER_DATABASE_FIXES.sql
# Purchase Entry Triggers

echo "========================================="
echo "APPLYING SECTION 26: PURCHASE ENTRY TRIGGERS"
echo "========================================="

# Extract and apply Section 26
echo "Extracting Section 26 from MASTER_DATABASE_FIXES.sql..."
sed -n '/SECTION 26: PURCHASE ENTRY TRIGGERS/,/SECTION 27:/p' database/MASTER_DATABASE_FIXES.sql > /tmp/section_26.sql

# If Section 27 doesn't exist yet, extract to end of file
if [ ! -s /tmp/section_26.sql ]; then
    sed -n '/SECTION 26: PURCHASE ENTRY TRIGGERS/,$p' database/MASTER_DATABASE_FIXES.sql > /tmp/section_26.sql
fi

echo "Applying Section 26..."
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -f /tmp/section_26.sql

if [ $? -eq 0 ]; then
    echo "✅ Section 26 applied successfully!"
else
    echo "❌ Failed to apply Section 26"
    exit 1
fi

echo ""
echo "Verifying purchase triggers..."
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -c "
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname LIKE '%purchase%'
ORDER BY tgname;
"

echo ""
echo "========================================="
echo "SECTION 26 DEPLOYMENT COMPLETE"
echo "========================================="
echo ""
echo "What this section does:"
echo "1. ✅ Adds batch_number, expiry_date, selling_price, mrp columns to purchase_order_items"
echo "2. ✅ Creates triggers to auto-generate batches on purchase entry"
echo "3. ✅ Updates inventory levels automatically"
echo "4. ✅ Tracks all stock movements"
echo "5. ✅ Updates product pricing with weighted average"
echo ""