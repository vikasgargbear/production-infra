#!/usr/bin/env node

/**
 * Automated test for Customer and Product creation
 * Tests the entire flow from API to UI
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

// Add auth token if available
const token = process.env.AUTH_TOKEN;
if (token) {
  api.defaults.headers.Authorization = `Bearer ${token}`;
}

// Test data
const testCustomerData = {
  customer_name: `Test Customer ${Date.now()}`,
  phone: '9876543210',  // API expects 'phone' not 'primary_phone'
  email: 'test@example.com',
  customer_type: 'retail',
  gstin: null,
  pan_number: null,
  drug_license_number: null,
  credit_limit: 5000,
  credit_days: 0,
  org_id: ORG_ID,
  // Flatten address fields
  address_line1: 'Test Address Line 1',
  address_line2: '',
  city: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302022'
};

const testProductData = {
  product_name: `Test Product ${Date.now()}`,
  product_code: `PROD${Date.now().toString().slice(-6)}`,
  generic_name: 'Test Generic',
  brand: 'Test Brand',
  manufacturer: 'Test Manufacturer',
  category_id: null,
  product_type: 'standard',
  product_class: 'medicine',
  composition: { active: 'Test Composition' },
  strength: null,
  hsn_code: '3004',
  gst_percentage: 12,
  barcode: null,
  pack_config: {
    base_uom: 'TABLET',
    pack_size: 10,
    pack_unit: 'STRIP',
    box_size: 10
  },
  maintain_batch: true,
  maintain_expiry: true,
  is_active: true,
  is_saleable: true,
  is_purchasable: true
};

// Test functions
async function testCustomerCreation() {
  console.log('\n🧪 Testing Customer Creation...');
  console.log('📤 Sending data:', JSON.stringify(testCustomerData, null, 2));
  
  try {
    const response = await api.post('/customers/', testCustomerData);
    console.log('✅ Customer created successfully!');
    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
    
    // Verify response structure
    if (!response.data) {
      throw new Error('Response missing data field');
    }
    
    // Check if customer_id exists in response
    if (!response.data.customer_id && !response.data.id) {
      console.warn('⚠️  Warning: Response missing customer_id');
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Customer creation failed!');
    if (error.response) {
      console.error('Error status:', error.response.status);
      console.error('Error data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

async function testProductCreation() {
  console.log('\n🧪 Testing Product Creation...');
  console.log('📤 Sending data:', JSON.stringify(testProductData, null, 2));
  
  try {
    const response = await api.post('/products/', testProductData);
    console.log('✅ Product created successfully!');
    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
    
    // Verify response structure
    if (!response.data) {
      throw new Error('Response missing data field');
    }
    
    // Check if product_id exists in response
    if (!response.data.product_id && !response.data.id) {
      console.warn('⚠️  Warning: Response missing product_id');
    }
    
    // Check MRP value
    if (response.data.mrp !== testProductData.mrp) {
      console.warn(`⚠️  Warning: MRP mismatch - sent: ${testProductData.mrp}, received: ${response.data.mrp}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Product creation failed!');
    if (error.response) {
      console.error('Error status:', error.response.status);
      console.error('Error data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

async function testSearchCustomer(customerId) {
  console.log(`\n🔍 Testing Customer Search (ID: ${customerId})...`);
  
  try {
    const response = await api.get(`/customers/${customerId}`);
    console.log('✅ Customer found!');
    console.log('📥 Customer details:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Customer search failed!');
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

async function testSearchProduct(productId) {
  console.log(`\n🔍 Testing Product Search (ID: ${productId})...`);
  
  try {
    const response = await api.get(`/products/${productId}`);
    console.log('✅ Product found!');
    console.log('📥 Product details:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Product search failed!');
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API Tests...');
  console.log('📍 API URL:', API_BASE_URL);
  console.log('🏢 Organization ID:', ORG_ID);
  
  let testResults = {
    customerCreation: false,
    productCreation: false,
    customerSearch: false,
    productSearch: false
  };
  
  try {
    // Test 1: Customer Creation
    const createdCustomer = await testCustomerCreation();
    testResults.customerCreation = true;
    
    // Test 2: Customer Search
    if (createdCustomer && (createdCustomer.customer_id || createdCustomer.id)) {
      const customerId = createdCustomer.customer_id || createdCustomer.id;
      await testSearchCustomer(customerId);
      testResults.customerSearch = true;
    }
    
    // Test 3: Product Creation
    const createdProduct = await testProductCreation();
    testResults.productCreation = true;
    
    // Test 4: Product Search
    if (createdProduct && (createdProduct.product_id || createdProduct.id)) {
      const productId = createdProduct.product_id || createdProduct.id;
      await testSearchProduct(productId);
      testResults.productSearch = true;
    }
    
  } catch (error) {
    console.error('\n⚠️  Test suite encountered an error');
  }
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`Customer Creation: ${testResults.customerCreation ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Customer Search: ${testResults.customerSearch ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Product Creation: ${testResults.productCreation ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Product Search: ${testResults.productSearch ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('='.repeat(50));
  
  const allPassed = Object.values(testResults).every(result => result);
  if (allPassed) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please check the logs above.');
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});