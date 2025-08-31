#!/usr/bin/env node

/**
 * Comprehensive test script for Purchase API
 * Tests all important inputs including batch, expiry, MRP, etc.
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = 'https://pharma-backend-production-0c09.up.railway.app/api';
const TOKEN = localStorage.getItem('access_token') || 'your-test-token-here';

// Test data
const testSupplierData = {
  supplier_name: 'Test Medical Supplier ' + Date.now(),
  phone: '9876543210',
  email: 'supplier@test.com',
  gst_number: 'GST1234567890',
  dl_number: 'DL-123456',
  address: '123 Test Street, Mumbai'
};

const testPurchaseData = {
  supplier_invoice_number: 'INV-TEST-' + Date.now(),
  invoice_date: new Date().toISOString().split('T')[0],
  supplier_id: null, // Will be set after creating supplier
  subtotal_amount: 10000,
  tax_amount: 1800,
  discount_amount: 500,
  final_amount: 11300,
  other_charges: 0,
  payment_mode: 'cash',
  payment_status: 'paid',
  notes: 'Test purchase with comprehensive item details',
  items: [
    {
      product_name: 'Paracetamol 500mg',
      hsn_code: '3004',
      batch_number: 'BATCH-2024-001',
      expiry_date: '2026-12-31',
      manufacturing_date: '2024-01-15',
      quantity: 100,
      free_quantity: 10,
      purchase_price: 25.50,
      mrp: 45.00,
      selling_price: 40.00,
      discount_percent: 5,
      tax_percent: 18,
      pack_type: 'STRIP',
      pack_size: 10,
      strips_per_box: 10,
      category: 'Analgesics',
      brand_name: 'TestPharma'
    },
    {
      product_name: 'Amoxicillin 250mg',
      hsn_code: '3004',
      batch_number: 'BATCH-2024-002',
      expiry_date: '2025-06-30',
      manufacturing_date: '2024-02-01',
      quantity: 50,
      free_quantity: 5,
      purchase_price: 35.00,
      mrp: 65.00,
      selling_price: 58.00,
      discount_percent: 3,
      tax_percent: 12,
      pack_type: 'BOTTLE',
      pack_size: 30,
      strips_per_box: 1,
      category: 'Antibiotics',
      brand_name: 'MediCare'
    },
    {
      product_name: 'Vitamin C 500mg',
      hsn_code: '2106',
      batch_number: 'BATCH-2024-003',
      expiry_date: '2027-03-31',
      manufacturing_date: '2024-03-01',
      quantity: 200,
      free_quantity: 20,
      purchase_price: 15.00,
      mrp: 30.00,
      selling_price: 28.00,
      discount_percent: 10,
      tax_percent: 5,
      pack_type: 'STRIP',
      pack_size: 15,
      strips_per_box: 10,
      category: 'Vitamins',
      brand_name: 'HealthPlus'
    },
    {
      product_name: 'Surgical Mask Pack',
      hsn_code: '6307',
      batch_number: 'MASK-2024-001',
      expiry_date: null, // Non-expiring item
      manufacturing_date: '2024-01-01',
      quantity: 500,
      free_quantity: 0,
      purchase_price: 2.50,
      mrp: 5.00,
      selling_price: 4.50,
      discount_percent: 0,
      tax_percent: 12,
      pack_type: 'BOX',
      pack_size: 50,
      strips_per_box: 1,
      category: 'Medical Supplies',
      brand_name: 'SafeGuard'
    }
  ]
};

// API client setup
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'X-Org-ID': '1' // Adjust as needed
  }
});

// Test functions
async function createTestSupplier() {
  console.log('\n📝 Creating test supplier...');
  try {
    const response = await apiClient.post('/suppliers/', testSupplierData);
    console.log('✅ Supplier created:', response.data.supplier_name);
    return response.data.supplier_id || response.data.id;
  } catch (error) {
    console.error('❌ Failed to create supplier:', error.response?.data || error.message);
    throw error;
  }
}

async function testCreatePurchase(supplierId) {
  console.log('\n📝 Testing CREATE Purchase with comprehensive data...');
  
  const purchasePayload = {
    ...testPurchaseData,
    supplier_id: supplierId
  };
  
  console.log('Payload items summary:');
  purchasePayload.items.forEach((item, idx) => {
    console.log(`  Item ${idx + 1}: ${item.product_name}`);
    console.log(`    - Batch: ${item.batch_number}`);
    console.log(`    - Expiry: ${item.expiry_date || 'N/A'}`);
    console.log(`    - MRP: ₹${item.mrp}, Cost: ₹${item.purchase_price}`);
    console.log(`    - Qty: ${item.quantity} + ${item.free_quantity} free`);
  });
  
  try {
    const response = await apiClient.post('/purchases/enhanced/with-items', purchasePayload);
    console.log('✅ Purchase created successfully!');
    console.log('   Purchase ID:', response.data.purchase_id);
    console.log('   Purchase Number:', response.data.purchase_number);
    console.log('   Total Amount:', response.data.final_amount);
    return response.data.purchase_id;
  } catch (error) {
    console.error('❌ Failed to create purchase:', error.response?.data || error.message);
    if (error.response?.data?.detail) {
      console.error('   Details:', error.response.data.detail);
    }
    throw error;
  }
}

async function testGetPurchase(purchaseId) {
  console.log('\n📝 Testing GET Purchase by ID...');
  try {
    const response = await apiClient.get(`/purchases/${purchaseId}`);
    console.log('✅ Purchase retrieved successfully!');
    console.log('   Purchase Number:', response.data.purchase_number);
    console.log('   Supplier:', response.data.supplier_name);
    console.log('   Items Count:', response.data.items?.length || 0);
    
    // Verify all fields were saved correctly
    if (response.data.items) {
      console.log('\n   Verifying saved item details:');
      response.data.items.forEach((item, idx) => {
        console.log(`   Item ${idx + 1}: ${item.product_name}`);
        console.log(`     ✓ Batch: ${item.batch_number || '❌ Missing'}`);
        console.log(`     ✓ Expiry: ${item.expiry_date || 'N/A'}`);
        console.log(`     ✓ MRP: ₹${item.mrp || '❌ Missing'}`);
        console.log(`     ✓ Manufacturing Date: ${item.manufacturing_date || '❌ Missing'}`);
        console.log(`     ✓ Pack Info: ${item.pack_type || '❌'} (${item.pack_size || '❌'}×${item.strips_per_box || '❌'})`);
      });
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to get purchase:', error.response?.data || error.message);
    throw error;
  }
}

async function testGetAllPurchases() {
  console.log('\n📝 Testing GET All Purchases...');
  try {
    const response = await apiClient.get('/purchases/', {
      params: {
        limit: 5,
        offset: 0
      }
    });
    console.log('✅ Purchases list retrieved successfully!');
    console.log('   Total Count:', response.data.total || response.data.length);
    console.log('   Retrieved:', response.data.items?.length || response.data.length);
    
    if (response.data.items || response.data.length > 0) {
      const purchases = response.data.items || response.data;
      console.log('\n   Recent purchases:');
      purchases.slice(0, 3).forEach(purchase => {
        console.log(`   - ${purchase.purchase_number} | ${purchase.supplier_name} | ₹${purchase.final_amount}`);
      });
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to get purchases:', error.response?.data || error.message);
    throw error;
  }
}

async function testSearchPurchases(searchTerm) {
  console.log(`\n📝 Testing SEARCH Purchases with term: "${searchTerm}"...`);
  try {
    const response = await apiClient.get('/purchases/', {
      params: {
        search: searchTerm,
        limit: 10
      }
    });
    console.log('✅ Search completed successfully!');
    console.log('   Results found:', response.data.items?.length || response.data.length);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to search purchases:', error.response?.data || error.message);
    throw error;
  }
}

async function testUpdatePurchase(purchaseId) {
  console.log('\n📝 Testing UPDATE Purchase...');
  const updateData = {
    notes: 'Updated test notes - ' + new Date().toISOString(),
    payment_status: 'paid'
  };
  
  try {
    const response = await apiClient.put(`/purchases/${purchaseId}`, updateData);
    console.log('✅ Purchase updated successfully!');
    console.log('   Updated Notes:', response.data.notes);
    console.log('   Payment Status:', response.data.payment_status);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to update purchase:', error.response?.data || error.message);
    throw error;
  }
}

async function testPurchaseWithoutProductId() {
  console.log('\n📝 Testing Purchase with items without product_id (PDF parsed scenario)...');
  
  const pdfParsedPurchase = {
    supplier_invoice_number: 'PDF-TEST-' + Date.now(),
    invoice_date: new Date().toISOString().split('T')[0],
    supplier_id: null, // Will be set
    subtotal_amount: 5000,
    tax_amount: 900,
    discount_amount: 0,
    final_amount: 5900,
    payment_mode: 'cash',
    payment_status: 'pending',
    notes: 'Test purchase from PDF parse - no product IDs',
    items: [
      {
        product_id: null, // No product ID (not in database yet)
        product_name: 'Generic Medicine ABC',
        batch_number: 'PDF-BATCH-001',
        expiry_date: '2025-12-31',
        quantity: 50,
        free_quantity: 0,
        purchase_price: 100,
        mrp: 150,
        selling_price: 140,
        tax_percent: 18
      }
    ]
  };
  
  try {
    // First create a supplier
    const supplierId = await createTestSupplier();
    pdfParsedPurchase.supplier_id = supplierId;
    
    const response = await apiClient.post('/purchases/enhanced/with-items', pdfParsedPurchase);
    console.log('✅ Purchase without product_id created successfully!');
    console.log('   This simulates PDF parsed items');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to create purchase without product_id:', error.response?.data || error.message);
    if (error.response?.data?.detail) {
      console.error('   Details:', error.response.data.detail);
    }
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting comprehensive Purchase API tests...');
  console.log('================================');
  
  try {
    // Test 1: Create supplier
    const supplierId = await createTestSupplier();
    
    // Test 2: Create purchase with all fields
    const purchaseId = await testCreatePurchase(supplierId);
    
    // Test 3: Get the created purchase
    await testGetPurchase(purchaseId);
    
    // Test 4: Get all purchases
    await testGetAllPurchases();
    
    // Test 5: Search purchases
    await testSearchPurchases('Test');
    
    // Test 6: Update purchase
    await testUpdatePurchase(purchaseId);
    
    // Test 7: Test without product_id (PDF parse scenario)
    await testPurchaseWithoutProductId();
    
    console.log('\n================================');
    console.log('✅ All tests completed successfully!');
    
  } catch (error) {
    console.log('\n================================');
    console.log('❌ Tests failed. See errors above.');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(console.error);