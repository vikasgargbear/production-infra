#!/bin/bash

# V2 Reorganization Script
# This script helps reorganize the v2 structure

echo "🔄 Starting V2 Reorganization..."

# Create new v2 structure
echo "📁 Creating new v2 folder structure..."

mkdir -p src/v2/components/{sales,purchase,inventory,payment,master,gst,ledger,returns,dashboard,reports}
mkdir -p src/v2/shared/{ui,business,layouts}
mkdir -p src/v2/{types,services,hooks,utils,constants}
mkdir -p src/v1-legacy/components

# Create index files for better exports
echo "📝 Creating index files..."

# Main v2 index
cat > src/v2/index.ts << 'EOF'
// V2 Components Export
export * from './components';
export * from './shared';
export * from './types';
EOF

# Components index
cat > src/v2/components/index.ts << 'EOF'
// Business Components
export * from './sales';
export * from './purchase';
export * from './inventory';
export * from './payment';
export * from './master';
export * from './gst';
export * from './ledger';
export * from './returns';
EOF

# Shared index
cat > src/v2/shared/index.ts << 'EOF'
// Shared Components
export * from './ui';
export * from './business';
export * from './layouts';
EOF

echo "✅ Folder structure created!"

# Show what needs to be moved
echo ""
echo "📋 Files to be moved:"
echo ""
echo "TypeScript Components (.tsx):"
find src/components -name "*.tsx" -type f | grep -v node_modules | head -10
echo ""
echo "Old JavaScript backups (.old.js):"
find src/components -name "*.old.js" -type f | head -10
echo ""
echo "V2 Components:"
find src/components-v2 -type f | head -10

echo ""
echo "🎯 Next Steps:"
echo "1. Run: npm run move-v2-components (create this script)"
echo "2. Update all imports in App.tsx"
echo "3. Test the application"
echo "4. Remove v1-legacy folder when ready"

# Create a sample move script
cat > scripts/move-components.sh << 'EOF'
#!/bin/bash
# Move components to new structure

# Move TypeScript hub components
mv src/components/sales/SalesHub.tsx src/v2/components/sales/ 2>/dev/null
mv src/components/purchase/PurchaseHub.tsx src/v2/components/purchase/ 2>/dev/null
mv src/components/master/MasterHub.tsx src/v2/components/master/ 2>/dev/null
mv src/components/gst/GSTHub.tsx src/v2/components/gst/ 2>/dev/null
mv src/components/inventory/StockHub.tsx src/v2/components/inventory/ 2>/dev/null
mv src/components/returns/ReturnsHub.tsx src/v2/components/returns/ 2>/dev/null
mv src/components/notes/NotesHub.tsx src/v2/components/returns/ 2>/dev/null
mv src/components/ledger/LedgerHub.tsx src/v2/components/ledger/ 2>/dev/null
mv src/components/payment/EnterprisePaymentEntry.tsx src/v2/components/payment/ 2>/dev/null
mv src/components/receivables/ReceivablesCollectionCenter.tsx src/v2/components/payment/ 2>/dev/null

# Move common UI components
mv src/components-v2/common/*.tsx src/v2/shared/ui/ 2>/dev/null

# Move business components
mv src/components-v2/customers/CustomerSearch.tsx src/v2/shared/business/ 2>/dev/null
mv src/components-v2/products/ProductSearch.tsx src/v2/shared/business/ 2>/dev/null
mv src/components-v2/data-table/DataTable.tsx src/v2/shared/business/ 2>/dev/null

# Move types
mv src/types/api.types.ts src/v2/types/ 2>/dev/null

# Move old files to legacy
find src/components -name "*.old.js" -exec mv {} src/v1-legacy/components/ \; 2>/dev/null

echo "✅ Components moved!"
EOF

chmod +x scripts/move-components.sh

echo ""
echo "✅ Reorganization script created!"
echo "📌 Review the plan in docs/V2_REORGANIZATION_PLAN.md"
echo "🚀 Run ./scripts/move-components.sh when ready to move files"