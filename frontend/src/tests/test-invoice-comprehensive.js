#!/usr/bin/env node

/**
 * COMPREHENSIVE INVOICE CREATION AND INVENTORY UPDATE TEST
 * Tests the complete flow:
 * 1. Create product with initial batch quantity
 * 2. Create customer
 * 3. Create invoice/order with items
 * 4. Verify batch quantity is reduced
 * 5. Verify invoice and invoice_items tables are populated
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://pharma-backend-production-0c09.up.railway.app';
const ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
});

// Test data
const testProductData = {
  product_name: `Test Product Invoice ${Date.now()}`,
  product_code: `INVPROD${Date.now().toString().slice(-6)}`,
  generic_name: 'Test Generic',
  brand: 'Test Brand',
  manufacturer: 'Test Manufacturer',
  hsn_code: '3004',
  gst_percentage: 12,
  // Important: Set specific values to track
  mrp: 100,
  sale_price: 90,
  cost_price: 60,
  quantity_available: 1000,  // Initial stock: 1000 units
  batch_number: `INVBATCH${Date.now().toString().slice(-8)}`,
  manufacturing_date: '2024-01-01',
  expiry_date: '2026-01-01',
  maintain_batch: true,
  maintain_expiry: true,
  is_active: true,
  is_saleable: true,
  is_purchasable: true
};

const testCustomerData = {
  customer_name: `Test Customer Invoice ${Date.now()}`,
  phone: '9876543210',
  email: 'testinvoice@example.com',
  customer_type: 'retail',
  credit_limit: 50000,
  credit_days: 30,
  org_id: ORG_ID,
  address_line1: 'Test Address',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001'
};

// Color codes for better output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Step 1: Create Product with Batch
async function createProductWithBatch() {
  log('\n📦 Step 1: Creating Product with Initial Batch...', 'cyan');
  log(`Initial Quantity: ${testProductData.quantity_available} units`, 'yellow');
  
  try {
    const response = await api.post('/products/', testProductData);
    const productId = response.data.product_id || response.data.id;
    
    log(`✅ Product created: ID ${productId}`, 'green');
    
    // Verify product details
    const productDetails = await api.get(`/products/${productId}`);
    log(`Product MRP: ${productDetails.data.current_mrp || 'NOT SET'}`, 'yellow');
    
    // Try to get batch info
    try {
      const batchResponse = await api.get(`/products/${productId}/batches`);
      if (batchResponse.data && batchResponse.data.length > 0) {
        const batch = batchResponse.data[0];
        log(`Batch Created: ${batch.batch_number}`, 'green');
        log(`Batch Initial Quantity: ${batch.quantity_available}`, 'green');
        return { productId, batchId: batch.batch_id, initialQuantity: batch.quantity_available };
      }
    } catch (e) {
      log('⚠️  Could not fetch batch details directly', 'yellow');
    }
    
    return { productId, batchId: null, initialQuantity: testProductData.quantity_available };
    
  } catch (error) {
    log(`❌ Product creation failed: ${error.response?.data?.detail || error.message}`, 'red');
    throw error;
  }
}

// Step 2: Create Customer
async function createCustomer() {
  log('\n👤 Step 2: Creating Customer...', 'cyan');
  
  try {
    const response = await api.post('/customers/', testCustomerData);
    const customerId = response.data.customer_id || response.data.id;
    
    log(`✅ Customer created: ID ${customerId}`, 'green');
    log(`Credit Limit: ${testCustomerData.credit_limit}`, 'yellow');
    
    return customerId;
    
  } catch (error) {
    log(`❌ Customer creation failed: ${error.response?.data?.detail || error.message}`, 'red');
    throw error;
  }
}

// Step 3: Create Invoice/Order
async function createInvoice(customerId, productId, batchId) {
  log('\n📄 Step 3: Creating Invoice/Order...', 'cyan');
  
  const orderQuantity = 50;  // Order 50 units
  const freeQuantity = 5;    // 5 free units
  const totalQuantity = orderQuantity + freeQuantity;
  
  log(`Ordering: ${orderQuantity} units + ${freeQuantity} free = ${totalQuantity} total`, 'yellow');
  
  const orderData = {
    org_id: ORG_ID,
    customer_id: customerId,
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: new Date().toISOString().split('T')[0],
    order_type: 'sales',
    payment_terms: 'credit',
    payment_status: 'pending',
    payment_mode: 'credit',
    status: 'placed',
    delivery_type: 'pickup',
    items: [
      {
        product_id: productId,
        batch_id: batchId,
        quantity: orderQuantity,
        free_quantity: freeQuantity,
        unit_price: 90,  // Sale price
        selling_price: 90,
        discount_percent: 0,
        discount_amount: 0,
        tax_percent: 12,
        tax_amount: (orderQuantity * 90 * 0.12),
        line_total: (orderQuantity * 90 * 1.12)
      }
    ],
    notes: 'Test invoice for inventory update verification'
  };
  
  try {
    log('Sending order data...', 'yellow');
    const response = await api.post('/orders/', orderData);
    const orderId = response.data.order_id || response.data.id;
    
    log(`✅ Order created: ID ${orderId}`, 'green');
    log(`Order Number: ${response.data.order_number || 'N/A'}`, 'yellow');
    log(`Total Amount: ${response.data.final_amount || response.data.total_amount || 'N/A'}`, 'yellow');
    
    return { orderId, orderQuantity: totalQuantity };
    
  } catch (error) {
    log(`❌ Order creation failed: ${error.response?.data?.detail || error.message}`, 'red');
    if (error.response?.data) {
      console.log('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Step 4: Check Batch Quantity After Order
async function checkBatchQuantityAfterOrder(productId, initialQuantity, orderedQuantity) {
  log('\n🔍 Step 4: Checking Batch Quantity After Order...', 'cyan');
  
  try {
    // Get product details
    const productDetails = await api.get(`/products/${productId}`);
    
    // Try multiple ways to get batch info
    let currentQuantity = null;
    let batchInfo = null;
    
    // Method 1: Direct batch endpoint
    try {
      const batchResponse = await api.get(`/products/${productId}/batches`);
      if (batchResponse.data && batchResponse.data.length > 0) {
        batchInfo = batchResponse.data[0];
        currentQuantity = parseFloat(batchInfo.quantity_available);
      }
    } catch (e) {
      log('Could not fetch from /products/{id}/batches', 'yellow');
    }
    
    // Method 2: Try batches endpoint with filter
    if (currentQuantity === null) {
      try {
        const batchesResponse = await api.get('/batches', {
          params: { product_id: productId }
        });
        if (batchesResponse.data && batchesResponse.data.length > 0) {
          batchInfo = batchesResponse.data[0];
          currentQuantity = parseFloat(batchInfo.quantity_available);
        }
      } catch (e) {
        log('Could not fetch from /batches', 'yellow');
      }
    }
    
    // Display results
    log('\n' + '='.repeat(70), 'cyan');
    log('INVENTORY UPDATE VERIFICATION', 'magenta');
    log('='.repeat(70), 'cyan');
    
    log(`Initial Batch Quantity: ${initialQuantity} units`, 'yellow');
    log(`Ordered Quantity: ${orderedQuantity} units (including free)`, 'yellow');
    log(`Expected Remaining: ${initialQuantity - orderedQuantity} units`, 'yellow');
    
    if (currentQuantity !== null) {
      log(`Actual Remaining: ${currentQuantity} units`, 'yellow');
      
      const expectedRemaining = initialQuantity - orderedQuantity;
      if (Math.abs(currentQuantity - expectedRemaining) < 0.01) {
        log('✅ PASS: Batch quantity correctly updated!', 'green');
        return true;
      } else {
        log(`❌ FAIL: Batch quantity NOT updated correctly!`, 'red');
        log(`   Expected: ${expectedRemaining}, Got: ${currentQuantity}`, 'red');
        log(`   Difference: ${currentQuantity - expectedRemaining} units`, 'red');
        return false;
      }
    } else {
      log('⚠️  WARNING: Could not fetch current batch quantity', 'yellow');
      return null;
    }
    
  } catch (error) {
    log(`❌ Error checking batch quantity: ${error.message}`, 'red');
    return false;
  }
}

// Step 5: Check Invoice Tables
async function checkInvoiceTables(orderId) {
  log('\n📊 Step 5: Checking Invoice/Order Tables...', 'cyan');
  
  try {
    // Check if order exists
    const orderResponse = await api.get(`/orders/${orderId}`);
    
    if (orderResponse.data) {
      log('✅ Order found in database', 'green');
      log(`   Order Status: ${orderResponse.data.order_status || 'N/A'}`, 'yellow');
      log(`   Payment Status: ${orderResponse.data.payment_status || 'N/A'}`, 'yellow');
      
      // Check for items
      if (orderResponse.data.items && orderResponse.data.items.length > 0) {
        log(`✅ Order items found: ${orderResponse.data.items.length} items`, 'green');
        
        const item = orderResponse.data.items[0];
        log(`   Product: ${item.product_name || 'N/A'}`, 'yellow');
        log(`   Quantity: ${item.quantity}`, 'yellow');
        log(`   Free Quantity: ${item.free_quantity || 0}`, 'yellow');
        log(`   Unit Price: ${item.unit_price}`, 'yellow');
        log(`   Line Total: ${item.line_total}`, 'yellow');
      } else {
        log('⚠️  No order items found', 'yellow');
      }
      
      return true;
    } else {
      log('❌ Order not found in database', 'red');
      return false;
    }
    
  } catch (error) {
    log(`❌ Error checking order tables: ${error.message}`, 'red');
    return false;
  }
}

// Step 6: List Triggers That Should Run
function listExpectedTriggers() {
  log('\n⚙️  Step 6: Expected Database Triggers...', 'cyan');
  
  const triggers = [
    'calculate_order_totals - Should calculate order totals from items',
    'apply_dynamic_pricing - Should apply customer-specific pricing',
    'sync_location_stock_with_batch - Should update batch quantities',
    'manage_stock_reservation - Should reserve stock for the order',
    'update_product_current_stock - Should update product current stock',
    'track_inventory_movement - Should create inventory movement record',
    'update_customer_outstanding - Should update customer outstanding amount'
  ];
  
  triggers.forEach(trigger => {
    log(`   • ${trigger}`, 'yellow');
  });
}

// Main Test Runner
async function runComprehensiveTest() {
  log('🚀 COMPREHENSIVE INVOICE & INVENTORY TEST', 'magenta');
  log('=' .repeat(70), 'cyan');
  log(`📍 API URL: ${API_BASE_URL}`, 'yellow');
  log(`🏢 Organization ID: ${ORG_ID}`, 'yellow');
  log('=' .repeat(70), 'cyan');
  
  const testResults = {
    productCreation: false,
    customerCreation: false,
    invoiceCreation: false,
    inventoryUpdate: false,
    tablePopulation: false
  };
  
  try {
    // Step 1: Create Product
    const { productId, batchId, initialQuantity } = await createProductWithBatch();
    testResults.productCreation = true;
    
    // Step 2: Create Customer
    const customerId = await createCustomer();
    testResults.customerCreation = true;
    
    // Step 3: Create Invoice/Order
    const { orderId, orderQuantity } = await createInvoice(customerId, productId, batchId);
    testResults.invoiceCreation = true;
    
    // Wait a bit for triggers to execute
    log('\n⏳ Waiting 3 seconds for database triggers to execute...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 4: Check Batch Quantity
    const inventoryUpdated = await checkBatchQuantityAfterOrder(productId, initialQuantity, orderQuantity);
    if (inventoryUpdated !== null) {
      testResults.inventoryUpdate = inventoryUpdated;
    }
    
    // Step 5: Check Invoice Tables
    testResults.tablePopulation = await checkInvoiceTables(orderId);
    
    // Step 6: List Expected Triggers
    listExpectedTriggers();
    
  } catch (error) {
    log(`\n❌ Test failed with error: ${error.message}`, 'red');
  }
  
  // Final Summary
  log('\n' + '='.repeat(70), 'cyan');
  log('📊 TEST SUMMARY', 'magenta');
  log('='.repeat(70), 'cyan');
  
  Object.entries(testResults).forEach(([test, result]) => {
    const testName = test.replace(/([A-Z])/g, ' $1').trim();
    const status = result ? '✅ PASS' : '❌ FAIL';
    const color = result ? 'green' : 'red';
    log(`${testName}: ${status}`, color);
  });
  
  log('='.repeat(70), 'cyan');
  
  const allPassed = Object.values(testResults).every(r => r);
  if (allPassed) {
    log('🎉 ALL TESTS PASSED!', 'green');
    log('The invoice creation and inventory update flow is working correctly!', 'green');
  } else {
    log('⚠️  SOME TESTS FAILED!', 'red');
    log('The system is NOT properly updating inventory after invoice creation.', 'red');
    log('\nPOSSIBLE ISSUES:', 'yellow');
    log('1. Database triggers may be disabled or not created', 'yellow');
    log('2. The order creation endpoint may not be deducting inventory', 'yellow');
    log('3. Batch update logic may be missing in the backend', 'yellow');
    log('4. Invoice and order tables may be using different schemas', 'yellow');
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run the test
runComprehensiveTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});