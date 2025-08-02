/**
 * Test Configuration
 * Central configuration for all tests
 */

export const TEST_CONFIG = {
  // API Configuration
  API_BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
  API_TIMEOUT: 30000,
  
  // Test User Credentials
  TEST_USER: {
    username: 'test@pharma.com',
    password: 'test123',
    organizationId: 'ad808530-1ddb-4377-ab20-67bef145d80d'
  },
  
  // Test Data IDs (should exist in test database)
  TEST_IDS: {
    customerId: 1,
    supplierId: 1,
    productId: 1,
    batchId: 1,
  },
  
  // Test Settings
  VERBOSE: false,
  STOP_ON_ERROR: false,
  RETRY_FAILED: true,
  MAX_RETRIES: 2,
  
  // Module-specific configs
  MODULES: {
    sales: {
      testInvoiceNumber: 'TEST-INV-001',
      testCustomerGST: '27AAAAA0000A1Z5'
    },
    purchase: {
      testSupplierGST: '27BBBBB0000B1Z5',
      testInvoiceFile: 'test-invoice.pdf'
    },
    returns: {
      testReturnReason: 'Quality Issue'
    },
    payment: {
      testPaymentModes: ['cash', 'upi', 'cheque']
    }
  },
  
  // Error Messages
  ERRORS: {
    TIMEOUT: 'Test timed out',
    API_UNREACHABLE: 'API server is not reachable',
    AUTH_FAILED: 'Authentication failed',
    INVALID_DATA: 'Invalid test data'
  }
};

// Test environment setup
export const setupTestEnvironment = async () => {
  // Clear any existing test data
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('test_mode', 'true');
  }
  
  // Set test auth token if needed
  // This would be replaced with actual auth in production
  const testToken = 'test-auth-token-123';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('authToken', testToken);
  }
  
  console.log('✅ Test environment setup complete');
};

// Test environment cleanup
export const cleanupTestEnvironment = async () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('test_mode');
    // Don't remove auth token as it might be needed for app
  }
  
  console.log('✅ Test environment cleanup complete');
};

// Helper to get test config for specific module
export const getModuleConfig = (moduleName) => {
  return {
    ...TEST_CONFIG,
    ...TEST_CONFIG.MODULES[moduleName]
  };
};

export default TEST_CONFIG;