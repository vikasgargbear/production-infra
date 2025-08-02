/**
 * Customer Test Fixtures
 * Reusable customer data for tests
 */

const { testDataGenerators, TEST_ORG_ID } = require('../utils/test-helpers');

const generateTestCustomer = (overrides = {}) => {
  const timestamp = Date.now();
  
  return {
    customer_name: `Test Customer ${timestamp}`,
    primary_phone: testDataGenerators.generatePhoneNumber(),
    primary_email: `customer${timestamp}@test.com`,
    customer_type: 'retail',
    credit_limit: 50000,
    credit_period: 30,
    org_id: TEST_ORG_ID,
    status: 'active',
    address: {
      address_line1: '123 Test Street',
      address_line2: 'Near Test Hospital',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      country: 'India'
    },
    ...overrides
  };
};

const generateWholesaleCustomer = (overrides = {}) => {
  return generateTestCustomer({
    customer_type: 'wholesale',
    credit_limit: 200000,
    gst_number: testDataGenerators.generateGSTNumber(),
    pan_number: 'ABCDE1234F',
    ...overrides
  });
};

const generateHospitalCustomer = (overrides = {}) => {
  return generateTestCustomer({
    customer_type: 'hospital',
    customer_name: `Test Hospital ${Date.now()}`,
    credit_limit: 500000,
    gst_number: testDataGenerators.generateGSTNumber(),
    drug_license_number: 'DL-MH-2024-12345',
    ...overrides
  });
};

const customerFixtures = {
  // Valid customer data sets
  validRetailCustomer: generateTestCustomer(),
  
  validWholesaleCustomer: generateWholesaleCustomer(),
  
  validHospitalCustomer: generateHospitalCustomer(),
  
  // Invalid customer data for validation tests
  customerWithoutName: {
    primary_phone: '9876543210',
    customer_type: 'retail'
  },
  
  customerWithInvalidPhone: generateTestCustomer({
    primary_phone: '123' // Too short
  }),
  
  customerWithInvalidEmail: generateTestCustomer({
    primary_email: 'invalid-email'
  }),
  
  customerWithInvalidGST: generateTestCustomer({
    gst_number: 'INVALID123'
  }),
  
  // Edge case customers
  customerWithMaxCreditLimit: generateTestCustomer({
    credit_limit: 9999999
  }),
  
  customerWithZeroCreditLimit: generateTestCustomer({
    credit_limit: 0
  }),
  
  // Customer states
  activeCustomer: generateTestCustomer({
    status: 'active'
  }),
  
  inactiveCustomer: generateTestCustomer({
    status: 'inactive'
  }),
  
  blockedCustomer: generateTestCustomer({
    status: 'blocked',
    block_reason: 'Payment overdue'
  }),
  
  // Bulk test data
  generateBulkCustomers: (count = 10) => {
    return Array(count).fill(null).map((_, index) => 
      generateTestCustomer({
        customer_name: `Bulk Customer ${index + 1}`,
        primary_phone: `98765432${(10 + index).toString().padStart(2, '0')}`
      })
    );
  }
};

module.exports = {
  generateTestCustomer,
  generateWholesaleCustomer,
  generateHospitalCustomer,
  customerFixtures
};