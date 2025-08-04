#!/usr/bin/env node

/**
 * COMPREHENSIVE VALUE VALIDATION TEST
 * Tests that frontend values are correctly passed to backend and stored in database
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

// Test data with SPECIFIC values we'll validate
const testProductData = {
  product_name: `Test Product ${Date.now()}`,
  product_code: `TESTPROD${Date.now().toString().slice(-6)}`,
  generic_name: 'Test Generic Name',
  brand: 'Test Brand',
  manufacturer: 'Test Manufacturer',
  category_id: null,
  product_type: 'standard',
  product_class: 'medicine',
  composition: { active: 'Test Active Ingredient' },
  hsn_code: '3004',
  gst_percentage: 18,  // Test with 18% GST
  // CRITICAL VALUES TO TEST
  mrp: 250.50,  // Specific MRP to validate
  sale_price: 200.75,  // Specific sale price
  cost_price: 150.25,  // Specific cost price
  quantity_available: 500,  // Specific quantity
  batch_number: `TESTBATCH${Date.now().toString().slice(-8)}`,
  manufacturing_date: '2024-01-15',
  expiry_date: '2026-01-15',
  maintain_batch: true,
  maintain_expiry: true,
  is_active: true,
  is_saleable: true,
  is_purchasable: true
};

const testCustomerData = {
  customer_name: `Test Customer ${Date.now()}`,
  phone: '9876543210',
  email: 'test@example.com',
  customer_type: 'retail',
  gstin: '27ABCDE1234F1Z5',  // Valid GSTIN format
  pan_number: 'ABCDE1234F',  // Valid PAN format
  drug_license_number: 'DL12345',
  credit_limit: 7500,  // Specific credit limit to validate
  credit_days: 30,  // Specific credit days
  org_id: ORG_ID,
  address_line1: 'Test Building, Test Street',
  address_line2: 'Near Test Landmark',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001'
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`);
}

// Validation functions
function validateProductValues(sent, received) {
  const validationResults = [];
  
  // Check MRP
  if (received.current_mrp !== undefined) {
    const receivedMRP = parseFloat(received.current_mrp);
    if (Math.abs(receivedMRP - sent.mrp) < 0.01) {
      validationResults.push({ field: 'MRP', status: 'PASS', sent: sent.mrp, received: receivedMRP });
    } else {
      validationResults.push({ field: 'MRP', status: 'FAIL', sent: sent.mrp, received: receivedMRP });
    }
  } else {
    validationResults.push({ field: 'MRP', status: 'MISSING', sent: sent.mrp, received: null });
  }
  
  // Check GST Percentage
  if (received.gst_percentage !== undefined) {
    const receivedGST = parseFloat(received.gst_percentage);
    if (Math.abs(receivedGST - sent.gst_percentage) < 0.01) {
      validationResults.push({ field: 'GST %', status: 'PASS', sent: sent.gst_percentage, received: receivedGST });
    } else {
      validationResults.push({ field: 'GST %', status: 'FAIL', sent: sent.gst_percentage, received: receivedGST });
    }
  }
  
  // Check Product Name
  if (received.product_name === sent.product_name) {
    validationResults.push({ field: 'Product Name', status: 'PASS', sent: sent.product_name, received: received.product_name });
  } else {
    validationResults.push({ field: 'Product Name', status: 'FAIL', sent: sent.product_name, received: received.product_name });
  }
  
  // Check Manufacturer
  if (received.manufacturer === sent.manufacturer) {
    validationResults.push({ field: 'Manufacturer', status: 'PASS', sent: sent.manufacturer, received: received.manufacturer });
  } else {
    validationResults.push({ field: 'Manufacturer', status: 'FAIL', sent: sent.manufacturer, received: received.manufacturer });
  }
  
  return validationResults;
}

function validateBatchValues(sent, batches) {
  if (!batches || batches.length === 0) {
    return [{ field: 'Batch', status: 'MISSING', sent: 'Expected batch', received: 'No batches found' }];
  }
  
  const batch = batches[0]; // Check first batch
  const validationResults = [];
  
  // Check MRP in batch
  if (batch.mrp_per_unit !== undefined) {
    const receivedMRP = parseFloat(batch.mrp_per_unit);
    if (Math.abs(receivedMRP - sent.mrp) < 0.01) {
      validationResults.push({ field: 'Batch MRP', status: 'PASS', sent: sent.mrp, received: receivedMRP });
    } else {
      validationResults.push({ field: 'Batch MRP', status: 'FAIL', sent: sent.mrp, received: receivedMRP });
    }
  }
  
  // Check Sale Price
  if (batch.sale_price_per_unit !== undefined) {
    const receivedSalePrice = parseFloat(batch.sale_price_per_unit);
    if (Math.abs(receivedSalePrice - sent.sale_price) < 0.01) {
      validationResults.push({ field: 'Sale Price', status: 'PASS', sent: sent.sale_price, received: receivedSalePrice });
    } else {
      validationResults.push({ field: 'Sale Price', status: 'FAIL', sent: sent.sale_price, received: receivedSalePrice });
    }
  }
  
  // Check Cost Price
  if (batch.cost_per_unit !== undefined) {
    const receivedCostPrice = parseFloat(batch.cost_per_unit);
    if (Math.abs(receivedCostPrice - sent.cost_price) < 0.01) {
      validationResults.push({ field: 'Cost Price', status: 'PASS', sent: sent.cost_price, received: receivedCostPrice });
    } else {
      validationResults.push({ field: 'Cost Price', status: 'FAIL', sent: sent.cost_price, received: receivedCostPrice });
    }
  }
  
  // Check Quantity
  if (batch.quantity_available !== undefined) {
    const receivedQty = parseFloat(batch.quantity_available);
    if (Math.abs(receivedQty - sent.quantity_available) < 0.01) {
      validationResults.push({ field: 'Quantity', status: 'PASS', sent: sent.quantity_available, received: receivedQty });
    } else {
      validationResults.push({ field: 'Quantity', status: 'FAIL', sent: sent.quantity_available, received: receivedQty });
    }
  }
  
  // Check Expiry Date
  if (batch.expiry_date) {
    const receivedExpiry = batch.expiry_date.split('T')[0]; // Get date part only
    if (receivedExpiry === sent.expiry_date) {
      validationResults.push({ field: 'Expiry Date', status: 'PASS', sent: sent.expiry_date, received: receivedExpiry });
    } else {
      validationResults.push({ field: 'Expiry Date', status: 'FAIL', sent: sent.expiry_date, received: receivedExpiry });
    }
  }
  
  return validationResults;
}

function validateCustomerValues(sent, received) {
  const validationResults = [];
  
  // Check Credit Limit
  if (received.credit_limit !== undefined) {
    const receivedCreditLimit = parseFloat(received.credit_limit);
    if (Math.abs(receivedCreditLimit - sent.credit_limit) < 0.01) {
      validationResults.push({ field: 'Credit Limit', status: 'PASS', sent: sent.credit_limit, received: receivedCreditLimit });
    } else {
      validationResults.push({ field: 'Credit Limit', status: 'FAIL', sent: sent.credit_limit, received: receivedCreditLimit });
    }
  }
  
  // Check Credit Days
  if (received.credit_days !== undefined) {
    if (received.credit_days === sent.credit_days) {
      validationResults.push({ field: 'Credit Days', status: 'PASS', sent: sent.credit_days, received: received.credit_days });
    } else {
      validationResults.push({ field: 'Credit Days', status: 'FAIL', sent: sent.credit_days, received: received.credit_days });
    }
  }
  
  // Check GSTIN
  if (sent.gstin) {
    if (received.gstin === sent.gstin) {
      validationResults.push({ field: 'GSTIN', status: 'PASS', sent: sent.gstin, received: received.gstin });
    } else {
      validationResults.push({ field: 'GSTIN', status: 'FAIL', sent: sent.gstin, received: received.gstin });
    }
  }
  
  // Check Phone
  if (received.phone === sent.phone) {
    validationResults.push({ field: 'Phone', status: 'PASS', sent: sent.phone, received: received.phone });
  } else {
    validationResults.push({ field: 'Phone', status: 'FAIL', sent: sent.phone, received: received.phone });
  }
  
  return validationResults;
}

function printValidationTable(validationResults) {
  console.log('\n' + '='.repeat(70));
  console.log('FIELD'.padEnd(20) + 'STATUS'.padEnd(10) + 'SENT'.padEnd(20) + 'RECEIVED'.padEnd(20));
  console.log('='.repeat(70));
  
  validationResults.forEach(result => {
    const statusColor = result.status === 'PASS' ? colors.green : 
                        result.status === 'FAIL' ? colors.red : colors.yellow;
    const statusSymbol = result.status === 'PASS' ? '✅' : 
                         result.status === 'FAIL' ? '❌' : '⚠️';
    
    console.log(
      result.field.padEnd(20) + 
      `${statusColor}${statusSymbol} ${result.status}${colors.reset}`.padEnd(20) + 
      String(result.sent).padEnd(20) + 
      String(result.received).padEnd(20)
    );
  });
  
  console.log('='.repeat(70));
}

// Test functions
async function testProductCreation() {
  logInfo('Testing Product Creation with Value Validation...');
  console.log('Sending:', JSON.stringify(testProductData, null, 2));
  
  try {
    const response = await api.post('/products/', testProductData);
    logSuccess('Product created successfully!');
    
    const productId = response.data.product_id || response.data.id;
    if (!productId) {
      logError('No product ID returned');
      return null;
    }
    
    // Fetch complete product details
    const detailResponse = await api.get(`/products/${productId}`);
    const productDetails = detailResponse.data;
    
    // Validate product values
    const productValidation = validateProductValues(testProductData, productDetails);
    
    // Fetch batch details
    let batchValidation = [];
    try {
      // Try different endpoints to get batch info
      const batchResponse = await api.get(`/products/${productId}/batches`);
      if (batchResponse.data && batchResponse.data.length > 0) {
        batchValidation = validateBatchValues(testProductData, batchResponse.data);
      }
    } catch (error) {
      // Try alternative endpoint
      try {
        const altBatchResponse = await api.get(`/batches?product_id=${productId}`);
        if (altBatchResponse.data && altBatchResponse.data.length > 0) {
          batchValidation = validateBatchValues(testProductData, altBatchResponse.data);
        }
      } catch (err) {
        logWarning('Could not fetch batch details');
      }
    }
    
    // Print validation results
    console.log('\n📊 PRODUCT VALUE VALIDATION:');
    printValidationTable([...productValidation, ...batchValidation]);
    
    // Calculate pass rate
    const allResults = [...productValidation, ...batchValidation];
    const passCount = allResults.filter(r => r.status === 'PASS').length;
    const failCount = allResults.filter(r => r.status === 'FAIL').length;
    const totalTests = allResults.length;
    
    if (failCount === 0) {
      logSuccess(`All ${totalTests} value checks passed!`);
    } else {
      logError(`${failCount} out of ${totalTests} value checks failed!`);
    }
    
    return { productId, validationResults: allResults };
    
  } catch (error) {
    logError('Product creation failed!');
    if (error.response) {
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    return null;
  }
}

async function testCustomerCreation() {
  logInfo('Testing Customer Creation with Value Validation...');
  console.log('Sending:', JSON.stringify(testCustomerData, null, 2));
  
  try {
    const response = await api.post('/customers/', testCustomerData);
    logSuccess('Customer created successfully!');
    
    const customerId = response.data.customer_id || response.data.id;
    if (!customerId) {
      logError('No customer ID returned');
      return null;
    }
    
    // Fetch complete customer details
    const detailResponse = await api.get(`/customers/${customerId}`);
    const customerDetails = detailResponse.data;
    
    // Validate customer values
    const customerValidation = validateCustomerValues(testCustomerData, customerDetails);
    
    // Print validation results
    console.log('\n📊 CUSTOMER VALUE VALIDATION:');
    printValidationTable(customerValidation);
    
    // Calculate pass rate
    const passCount = customerValidation.filter(r => r.status === 'PASS').length;
    const failCount = customerValidation.filter(r => r.status === 'FAIL').length;
    const totalTests = customerValidation.length;
    
    if (failCount === 0) {
      logSuccess(`All ${totalTests} value checks passed!`);
    } else {
      logError(`${failCount} out of ${totalTests} value checks failed!`);
    }
    
    return { customerId, validationResults: customerValidation };
    
  } catch (error) {
    logError('Customer creation failed!');
    if (error.response) {
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    return null;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 COMPREHENSIVE VALUE VALIDATION TEST');
  console.log('📍 API URL:', API_BASE_URL);
  console.log('🏢 Organization ID:', ORG_ID);
  console.log('=' .repeat(70));
  
  const testResults = {
    product: null,
    customer: null
  };
  
  // Test Product Creation
  console.log('\n📦 PRODUCT CREATION TEST');
  console.log('-'.repeat(70));
  testResults.product = await testProductCreation();
  
  // Test Customer Creation
  console.log('\n👤 CUSTOMER CREATION TEST');
  console.log('-'.repeat(70));
  testResults.customer = await testCustomerCreation();
  
  // Final Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('='.repeat(70));
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  if (testResults.product) {
    const productPassed = testResults.product.validationResults.filter(r => r.status === 'PASS').length;
    const productFailed = testResults.product.validationResults.filter(r => r.status === 'FAIL').length;
    totalPassed += productPassed;
    totalFailed += productFailed;
    console.log(`Product Tests: ${productPassed} passed, ${productFailed} failed`);
  } else {
    console.log('Product Tests: FAILED TO RUN');
  }
  
  if (testResults.customer) {
    const customerPassed = testResults.customer.validationResults.filter(r => r.status === 'PASS').length;
    const customerFailed = testResults.customer.validationResults.filter(r => r.status === 'FAIL').length;
    totalPassed += customerPassed;
    totalFailed += customerFailed;
    console.log(`Customer Tests: ${customerPassed} passed, ${customerFailed} failed`);
  } else {
    console.log('Customer Tests: FAILED TO RUN');
  }
  
  console.log('='.repeat(70));
  console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  
  if (totalFailed === 0 && totalPassed > 0) {
    logSuccess('🎉 ALL VALUE VALIDATION TESTS PASSED!');
    process.exit(0);
  } else if (totalFailed > 0) {
    logError(`⚠️  ${totalFailed} VALUE VALIDATION TESTS FAILED!`);
    logWarning('The frontend is not correctly passing values to the backend!');
    process.exit(1);
  } else {
    logError('❌ No tests were run successfully');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});