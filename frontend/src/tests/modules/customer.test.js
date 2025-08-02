/**
 * Customer Module Tests
 * Tests all customer-related functionality
 */

const { apiClient, testHelpers, log } = require('../utils/test-helpers');
const { generateTestCustomer } = require('../fixtures/customer.fixtures');

describe('Customer Management Module', () => {
  let testCustomerId;

  // Test Suite 1: Customer CRUD Operations
  describe('Customer CRUD Operations', () => {
    test('Should create a new customer', async () => {
      const customerData = generateTestCustomer();
      
      const response = await apiClient.post('/customers/', customerData);
      
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('customer_id');
      expect(response.data.customer_name).toBe(customerData.customer_name);
      
      testCustomerId = response.data.customer_id;
      log.success(`Created customer: ${testCustomerId}`);
    });

    test('Should retrieve customer details', async () => {
      const response = await apiClient.get(`/customers/${testCustomerId}`);
      
      expect(response.status).toBe(200);
      expect(response.data.customer_id).toBe(testCustomerId);
      expect(response.data).toHaveProperty('balance_amount');
    });

    test('Should update customer information', async () => {
      const updateData = {
        primary_phone: '9999999999',
        credit_limit: 100000
      };
      
      const response = await apiClient.put(`/customers/${testCustomerId}`, updateData);
      
      expect(response.status).toBe(200);
      expect(response.data.primary_phone).toBe(updateData.primary_phone);
    });

    test('Should search customers', async () => {
      const response = await apiClient.get('/customers/', {
        params: { search: 'test', limit: 10 }
      });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  // Test Suite 2: Customer Credit Management
  describe('Customer Credit Management', () => {
    test('Should check customer credit limit', async () => {
      const creditCheckData = {
        order_amount: 50000
      };
      
      const response = await apiClient.post(
        `/customers/${testCustomerId}/check-credit`,
        creditCheckData
      );
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('has_credit');
      expect(response.data).toHaveProperty('available_credit');
    });

    test('Should handle credit limit exceeded', async () => {
      const creditCheckData = {
        order_amount: 200000 // Exceeds default limit
      };
      
      const response = await apiClient.post(
        `/customers/${testCustomerId}/check-credit`,
        creditCheckData
      );
      
      expect(response.data.has_credit).toBe(false);
      expect(response.data.message).toContain('credit limit');
    });
  });

  // Test Suite 3: Customer Ledger & Transactions
  describe('Customer Ledger Operations', () => {
    test('Should fetch customer ledger', async () => {
      const response = await apiClient.get(`/customers/${testCustomerId}/ledger`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('opening_balance');
      expect(response.data).toHaveProperty('transactions');
      expect(Array.isArray(response.data.transactions)).toBe(true);
    });

    test('Should get outstanding invoices', async () => {
      const response = await apiClient.get(`/customers/${testCustomerId}/outstanding`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    test('Should record customer payment', async () => {
      const paymentData = {
        amount: 10000,
        payment_mode: 'cash',
        payment_date: new Date().toISOString(),
        remarks: 'Test payment'
      };
      
      const response = await apiClient.post(
        `/customers/${testCustomerId}/payment`,
        paymentData
      );
      
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('payment_id');
    });
  });

  // Test Suite 4: Customer Type Specific Tests
  describe('Customer Type Specific Features', () => {
    test('Should handle retail customer pricing', async () => {
      const retailCustomer = generateTestCustomer({ customer_type: 'retail' });
      const response = await apiClient.post('/customers/', retailCustomer);
      
      expect(response.data.customer_type).toBe('retail');
      // Test retail-specific features
    });

    test('Should handle wholesale customer pricing', async () => {
      const wholesaleCustomer = generateTestCustomer({ customer_type: 'wholesale' });
      const response = await apiClient.post('/customers/', wholesaleCustomer);
      
      expect(response.data.customer_type).toBe('wholesale');
      // Test wholesale-specific features
    });
  });

  // Test Suite 5: Customer Validation
  describe('Customer Data Validation', () => {
    test('Should validate required fields', async () => {
      const invalidCustomer = {
        // Missing required customer_name
        primary_phone: '9876543210'
      };
      
      await expect(
        apiClient.post('/customers/', invalidCustomer)
      ).rejects.toThrow();
    });

    test('Should validate phone number format', async () => {
      const customerWithInvalidPhone = generateTestCustomer({
        primary_phone: '123' // Too short
      });
      
      await expect(
        apiClient.post('/customers/', customerWithInvalidPhone)
      ).rejects.toThrow();
    });

    test('Should validate email format', async () => {
      const customerWithInvalidEmail = generateTestCustomer({
        primary_email: 'invalid-email'
      });
      
      await expect(
        apiClient.post('/customers/', customerWithInvalidEmail)
      ).rejects.toThrow();
    });

    test('Should validate GST number format', async () => {
      const customerWithInvalidGST = generateTestCustomer({
        gst_number: 'INVALID123'
      });
      
      await expect(
        apiClient.post('/customers/', customerWithInvalidGST)
      ).rejects.toThrow();
    });
  });
});

// Export for use in integration tests
module.exports = {
  createTestCustomer: async () => {
    const customerData = generateTestCustomer();
    const response = await apiClient.post('/customers/', customerData);
    return response.data;
  }
};