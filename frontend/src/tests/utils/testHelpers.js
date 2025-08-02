/**
 * Test Helper Functions
 * Common utilities for all tests
 */

import { TEST_CONFIG } from '../testConfig';

/**
 * Wait for a specific amount of time
 */
export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a function multiple times
 */
export const retry = async (fn, retries = TEST_CONFIG.MAX_RETRIES) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await wait(1000 * (i + 1)); // Exponential backoff
    }
  }
};

/**
 * Generate random test data
 */
export const generateTestData = {
  // Generate random invoice number
  invoiceNumber: () => `TEST-INV-${Date.now()}`,
  
  // Generate random phone number
  phoneNumber: () => `98${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
  
  // Generate random GST number
  gstNumber: (stateCode = '27') => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomChars = Array(5).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    const randomDigits = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${stateCode}${randomChars}${randomDigits}Z1`;
  },
  
  // Generate random email
  email: () => `test_${Date.now()}@pharma.com`,
  
  // Generate random amount
  amount: (min = 100, max = 10000) => Math.floor(Math.random() * (max - min) + min),
  
  // Generate random date
  date: (daysFromNow = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
  }
};

/**
 * Assert helper functions
 */
export const assert = {
  // Check if value exists
  exists: (value, message) => {
    if (!value && value !== 0 && value !== false) {
      throw new Error(message || 'Value does not exist');
    }
  },
  
  // Check if values are equal
  equal: (actual, expected, message) => {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  },
  
  // Check if value is truthy
  truthy: (value, message) => {
    if (!value) {
      throw new Error(message || `Expected truthy value, got ${value}`);
    }
  },
  
  // Check if array contains value
  contains: (array, value, message) => {
    if (!Array.isArray(array) || !array.includes(value)) {
      throw new Error(message || `Array does not contain ${value}`);
    }
  },
  
  // Check if object has property
  hasProperty: (obj, property, message) => {
    if (!obj || !obj.hasOwnProperty(property)) {
      throw new Error(message || `Object does not have property ${property}`);
    }
  },
  
  // Check if value is greater than
  greaterThan: (actual, expected, message) => {
    if (actual <= expected) {
      throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
    }
  }
};

/**
 * Format test results for display
 */
export const formatTestResults = (results) => {
  const total = results.passed.length + results.failed.length;
  const percentage = total > 0 ? (results.passed.length / total * 100).toFixed(1) : 0;
  
  return {
    summary: `${results.passed.length}/${total} passed (${percentage}%)`,
    status: results.failed.length === 0 ? 'PASSED' : 'FAILED',
    details: {
      passed: results.passed,
      failed: results.failed.map(f => ({
        test: f.test,
        error: f.error || f.message || 'Unknown error'
      }))
    }
  };
};

/**
 * Log test step
 */
export const logStep = (step, description) => {
  if (TEST_CONFIG.VERBOSE) {
    console.log(`  ${step}: ${description}`);
  }
};

/**
 * Create test context
 */
export const createTestContext = () => {
  return {
    startTime: Date.now(),
    steps: [],
    data: {},
    
    // Log a step
    log: function(step) {
      this.steps.push({
        step,
        timestamp: Date.now() - this.startTime
      });
      logStep(`Step ${this.steps.length}`, step);
    },
    
    // Store test data
    store: function(key, value) {
      this.data[key] = value;
    },
    
    // Get stored data
    get: function(key) {
      return this.data[key];
    },
    
    // Get duration
    getDuration: function() {
      return Date.now() - this.startTime;
    }
  };
};

/**
 * Mock API response
 */
export const mockApiResponse = (data, delay = 100) => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
    }, delay);
  });
};

/**
 * Check if API is reachable
 */
export const checkAPIConnection = async () => {
  try {
    const response = await fetch(`${TEST_CONFIG.API_BASE_URL}/health`, {
      method: 'GET',
      timeout: 5000
    });
    return response.ok;
  } catch (error) {
    console.error('API connection check failed:', error.message);
    return false;
  }
};

/**
 * Clean test data from database (if needed)
 */
export const cleanTestData = async (type, id) => {
  // This would be implemented based on backend cleanup endpoints
  console.log(`Would clean ${type} with id ${id}`);
  // In real implementation:
  // await api[type].delete(id);
};

export default {
  wait,
  retry,
  generateTestData,
  assert,
  formatTestResults,
  logStep,
  createTestContext,
  mockApiResponse,
  checkAPIConnection,
  cleanTestData
};