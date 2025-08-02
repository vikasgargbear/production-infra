/**
 * Test Utilities and Helpers
 * Common utilities for all tests
 */

const axios = require('axios');
const chalk = require('chalk');

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://pharma-backend-production-0c09.up.railway.app';
const TEST_ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

// Create configured API client
const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v2`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Add auth token if available
apiClient.interceptors.request.use((config) => {
  const token = process.env.TEST_AUTH_TOKEN || localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Add org_id to all requests
  if (config.method !== 'get') {
    config.data = { ...config.data, org_id: TEST_ORG_ID };
  }
  return config;
});

// Logging utilities
const log = {
  info: (msg) => console.log(chalk.blue(`ℹ️  ${msg}`)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
  warning: (msg) => console.log(chalk.yellow(`⚠️  ${msg}`)),
  section: (msg) => console.log(chalk.cyan.bold(`\n📦 ${msg}\n`))
};

// Test data generators
const testDataGenerators = {
  // Generate random Indian phone number
  generatePhoneNumber: () => {
    const prefixes = ['98', '97', '96', '95', '94', '93', '92', '91', '90', '89'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    return prefix + suffix;
  },

  // Generate GST number
  generateGSTNumber: (stateCode = '27') => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const panPart = Array(5).fill(0).map(() => chars[Math.floor(Math.random() * 26)]).join('');
    const numbers = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const entityCode = Math.floor(Math.random() * 10);
    const checksum = chars[Math.floor(Math.random() * 26)];
    return `${stateCode}${panPart}${numbers}${checksum}${entityCode}Z${checksum}`;
  },

  // Generate random date
  generateDate: (daysFromNow = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
  },

  // Generate batch number
  generateBatchNumber: () => {
    const year = new Date().getFullYear();
    const number = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `B${year}${number}`;
  },

  // Generate invoice number
  generateInvoiceNumber: () => {
    const year = new Date().getFullYear();
    const number = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}-${number}`;
  }
};

// Common test utilities
const testHelpers = {
  // Wait for condition
  waitForCondition: async (condition, timeout = 5000, interval = 100) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) return true;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Condition not met within timeout');
  },

  // Retry function
  retry: async (fn, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  },

  // Format currency
  formatCurrency: (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  },

  // Calculate GST
  calculateGST: (amount, rate = 18) => {
    const taxAmount = amount * (rate / 100);
    return {
      taxableAmount: amount,
      cgst: taxAmount / 2,
      sgst: taxAmount / 2,
      igst: 0,
      totalTax: taxAmount,
      totalAmount: amount + taxAmount
    };
  },

  // Validate response structure
  validateApiResponse: (response, requiredFields = []) => {
    expect(response).toBeDefined();
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    
    if (requiredFields.length > 0) {
      requiredFields.forEach(field => {
        expect(response.data).toHaveProperty(field);
      });
    }
  },

  // Clean up test data
  cleanupTestData: async (type, id) => {
    try {
      await apiClient.delete(`/${type}/${id}`);
      log.info(`Cleaned up test ${type}: ${id}`);
    } catch (error) {
      log.warning(`Failed to cleanup ${type}: ${id}`);
    }
  }
};

// Mock data for tests
const mockData = {
  validOrganization: {
    org_id: TEST_ORG_ID,
    org_name: 'Test Pharma Company',
    gst_number: '27AABCT1234D1Z5',
    address: {
      address_line1: '123 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    }
  },

  sampleProducts: [
    {
      product_name: 'Paracetamol 500mg',
      category: 'Tablets',
      manufacturer: 'Test Pharma',
      hsn_code: '3004',
      mrp: 10,
      sale_price: 8,
      purchase_price: 6,
      gst_rate: 12
    },
    {
      product_name: 'Amoxicillin 250mg',
      category: 'Capsules',
      manufacturer: 'Test Pharma',
      hsn_code: '3004',
      mrp: 50,
      sale_price: 45,
      purchase_price: 35,
      gst_rate: 12,
      is_narcotic: false
    },
    {
      product_name: 'Cough Syrup 100ml',
      category: 'Syrups',
      manufacturer: 'Test Pharma',
      hsn_code: '3004',
      mrp: 80,
      sale_price: 75,
      purchase_price: 60,
      gst_rate: 12
    }
  ],

  sampleCustomers: [
    {
      customer_name: 'City Medical Store',
      customer_type: 'retail',
      primary_phone: '9876543210',
      primary_email: 'citymedical@test.com',
      credit_limit: 50000
    },
    {
      customer_name: 'Health Plus Pharmacy',
      customer_type: 'wholesale',
      primary_phone: '9876543211',
      primary_email: 'healthplus@test.com',
      credit_limit: 200000,
      gst_number: '27AABCH1234E1Z6'
    }
  ],

  sampleSuppliers: [
    {
      supplier_name: 'Generic Pharma Pvt Ltd',
      contact_person: 'John Doe',
      phone: '9876543212',
      email: 'contact@genericpharma.com',
      gst_number: '27AABCG1234F1Z7',
      credit_period: 30
    }
  ]
};

// Performance testing utilities
const performanceHelpers = {
  measureTime: async (fn, label) => {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    log.info(`${label}: ${duration.toFixed(2)}ms`);
    return { result, duration };
  },

  benchmarkEndpoint: async (endpoint, method = 'GET', iterations = 10) => {
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await apiClient[method.toLowerCase()](endpoint);
      times.push(performance.now() - start);
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    return { avg, min, max, times };
  }
};

module.exports = {
  apiClient,
  log,
  testDataGenerators,
  testHelpers,
  mockData,
  performanceHelpers,
  TEST_ORG_ID
};