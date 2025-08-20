#!/bin/bash

# End-to-End Test Runner
# Runs all e2e tests with proper setup and reporting

echo "🚀 Starting End-to-End Test Suite..."
echo "======================================"

# Change to e2e directory
cd "$(dirname "$0")/e2e"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js to run e2e tests."
    exit 1
fi

echo "📍 Running from: $(pwd)"
echo "🔗 Testing against: Production API"
echo ""

# Run Customer & Challan Flow Test
echo "🧪 Test 1: Customer & Challan Flow"
echo "-----------------------------------"
node test_e2e_customer_challan.js

echo ""
echo "✅ End-to-End Test Suite Complete!"
echo "📊 Check output above for detailed results"

# Add future tests here as they are created
# echo "🧪 Test 2: Invoice & Payment Flow"
# node test_e2e_invoice_payment.js

# echo "🧪 Test 3: Purchase & Inventory Flow"  
# node test_e2e_purchase_inventory.js