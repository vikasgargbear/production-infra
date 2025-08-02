#!/bin/bash

# Test Data Import Script for AASO Pharmaceutical ERP
# Run this script when backend server is running to populate test data

BASE_URL="http://localhost:8000/api"

echo "🚀 Starting test data import for AASO Pharmaceutical ERP..."

# Function to make POST request with error handling
post_data() {
    local endpoint=$1
    local data_file=$2
    local entity_name=$3
    
    echo "📝 Importing $entity_name..."
    
    # Read JSON file and import each record
    cat "$data_file" | jq -c '.[]' | while read -r item; do
        response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/$endpoint/" \
            -H "Content-Type: application/json" \
            -d "$item")
        
        http_code="${response: -3}"
        response_body="${response%???}"
        
        if [ "$http_code" -eq 201 ] || [ "$http_code" -eq 200 ]; then
            echo "✅ Created $(echo "$item" | jq -r '.customer_name // .supplier_name // .product_name // .invoice_no // .bill_no')"
        else
            echo "❌ Failed to create $(echo "$item" | jq -r '.customer_name // .supplier_name // .product_name // .invoice_no // .bill_no') - HTTP $http_code"
            echo "   Response: $response_body"
        fi
    done
}

# Check if backend is running
echo "🔍 Checking if backend is running..."
if ! curl -s "$BASE_URL/health/" > /dev/null 2>&1; then
    echo "❌ Backend server is not running on $BASE_URL"
    echo "   Please start the backend server first"
    exit 1
fi

echo "✅ Backend server is running"

# Import data in correct order (respecting dependencies)
echo "📊 Importing test data..."

# 1. Import Products first (no dependencies)
post_data "products" "products.json" "Products"

# 2. Import Customers
post_data "customers" "customers.json" "Customers" 

# 3. Import Suppliers
post_data "suppliers" "suppliers.json" "Suppliers"

# 4. Import Sale Invoices (depends on customers and products)
post_data "orders" "sale-invoices.json" "Sale Invoices"

# 5. Import Purchase Bills (depends on suppliers and products)  
post_data "purchases" "purchase-bills.json" "Purchase Bills"

echo "🎉 Test data import completed!"
echo ""
echo "📋 Summary of imported data:"
echo "   • Products: 5 pharmaceutical items"
echo "   • Customers: 3 medical stores/pharmacies"
echo "   • Suppliers: 3 pharmaceutical distributors"
echo "   • Sale Invoices: 3 sample invoices with items"
echo "   • Purchase Bills: 3 sample bills with items"
echo ""
echo "🔄 You can now test the Returns Management functionality:"
echo "   • Sale Returns: Use invoices INV-2025-001, INV-2025-002, INV-2025-003"
echo "   • Purchase Returns: Use bills PB-2025-001, PB-2025-002, PB-2025-003"
echo ""
echo "💡 To re-run this script, first clear the database or use different data"