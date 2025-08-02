/**
 * Product Module Tests
 * Tests all product-related functionality including batch management
 */

const { apiClient, testHelpers, log } = require('../utils/test-helpers');
const { generateTestProduct, generateTestBatch } = require('../fixtures/product.fixtures');

describe('Product Management Module', () => {
  let testProductId;
  let testBatchId;

  // Test Suite 1: Product CRUD Operations
  describe('Product CRUD Operations', () => {
    test('Should create a new product', async () => {
      const productData = generateTestProduct();
      
      const response = await apiClient.post('/products/', productData);
      
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('product_id');
      expect(response.data.product_name).toBe(productData.product_name);
      
      testProductId = response.data.product_id;
      log.success(`Created product: ${testProductId}`);
    });

    test('Should search products', async () => {
      const response = await apiClient.get('/products/search', {
        params: { q: 'test', limit: 10 }
      });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    test('Should get product details', async () => {
      const response = await apiClient.get(`/products/${testProductId}`);
      
      expect(response.status).toBe(200);
      expect(response.data.product_id).toBe(testProductId);
      expect(response.data).toHaveProperty('stock_quantity');
    });

    test('Should update product information', async () => {
      const updateData = {
        sale_price: 150,
        reorder_level: 100
      };
      
      const response = await apiClient.put(`/products/${testProductId}`, updateData);
      
      expect(response.status).toBe(200);
      expect(response.data.sale_price).toBe(updateData.sale_price);
    });
  });

  // Test Suite 2: Batch Management (Critical for Pharma)
  describe('Batch Management with Expiry Tracking', () => {
    test('Should create batch with expiry date', async () => {
      const batchData = generateTestBatch(testProductId);
      
      const response = await apiClient.post('/batches/', batchData);
      
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('batch_id');
      expect(response.data).toHaveProperty('expiry_date');
      expect(response.data.product_id).toBe(testProductId);
      
      testBatchId = response.data.batch_id;
    });

    test('Should get batches for a product', async () => {
      const response = await apiClient.get(`/products/${testProductId}/batches`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);
    });

    test('Should filter expired batches', async () => {
      const response = await apiClient.get(`/products/${testProductId}/batches`, {
        params: { exclude_expired: true }
      });
      
      expect(response.status).toBe(200);
      const expiredBatches = response.data.filter(batch => 
        new Date(batch.expiry_date) < new Date()
      );
      expect(expiredBatches.length).toBe(0);
    });

    test('Should sort batches by expiry date', async () => {
      const response = await apiClient.get(`/products/${testProductId}/batches`, {
        params: { sort_by: 'expiry_date', order: 'asc' }
      });
      
      expect(response.status).toBe(200);
      
      // Verify sorting
      for (let i = 1; i < response.data.length; i++) {
        const prevExpiry = new Date(response.data[i-1].expiry_date);
        const currExpiry = new Date(response.data[i].expiry_date);
        expect(prevExpiry <= currExpiry).toBe(true);
      }
    });

    test('Should get expiry alerts', async () => {
      const response = await apiClient.get('/batches/expiry-alerts', {
        params: { days_before_expiry: 30 }
      });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      // All returned batches should expire within 30 days
      response.data.forEach(batch => {
        const daysToExpiry = Math.ceil(
          (new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
        );
        expect(daysToExpiry).toBeLessThanOrEqual(30);
      });
    });
  });

  // Test Suite 3: Stock Management
  describe('Stock Level Management', () => {
    test('Should track stock levels', async () => {
      const response = await apiClient.get(`/products/${testProductId}/stock`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('total_stock');
      expect(response.data).toHaveProperty('available_stock');
      expect(response.data).toHaveProperty('batch_wise_stock');
    });

    test('Should update stock on purchase', async () => {
      const stockUpdateData = {
        batch_id: testBatchId,
        quantity: 100,
        transaction_type: 'purchase',
        reference_type: 'purchase_invoice',
        reference_id: 'TEST-PUR-001'
      };
      
      const response = await apiClient.post('/stock-movements/', stockUpdateData);
      
      expect(response.status).toBe(201);
      expect(response.data.quantity).toBe(stockUpdateData.quantity);
    });

    test('Should check reorder levels', async () => {
      const response = await apiClient.get('/products/low-stock', {
        params: { include_zero_stock: true }
      });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      // Verify all returned products are below reorder level
      response.data.forEach(product => {
        expect(product.stock_quantity <= product.reorder_level).toBe(true);
      });
    });
  });

  // Test Suite 4: Product Categories & Classification
  describe('Product Classification', () => {
    test('Should handle narcotic products', async () => {
      const narcoticProduct = generateTestProduct({
        is_narcotic: true,
        drug_license_required: true
      });
      
      const response = await apiClient.post('/products/', narcoticProduct);
      
      expect(response.data.is_narcotic).toBe(true);
      expect(response.data.drug_license_required).toBe(true);
    });

    test('Should get products by category', async () => {
      const response = await apiClient.get('/products/', {
        params: { category: 'tablets' }
      });
      
      expect(response.status).toBe(200);
      response.data.forEach(product => {
        expect(product.category).toBe('tablets');
      });
    });

    test('Should filter by manufacturer', async () => {
      const response = await apiClient.get('/products/', {
        params: { manufacturer: 'Test Pharma' }
      });
      
      expect(response.status).toBe(200);
      response.data.forEach(product => {
        expect(product.manufacturer).toBe('Test Pharma');
      });
    });
  });

  // Test Suite 5: Pricing & Customer Type
  describe('Product Pricing by Customer Type', () => {
    test('Should apply retail pricing', async () => {
      const response = await apiClient.get(`/products/${testProductId}/pricing`, {
        params: { customer_type: 'retail' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('mrp');
      expect(response.data).toHaveProperty('sale_price');
      expect(response.data.sale_price).toBeLessThanOrEqual(response.data.mrp);
    });

    test('Should apply wholesale pricing', async () => {
      const response = await apiClient.get(`/products/${testProductId}/pricing`, {
        params: { customer_type: 'wholesale' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('wholesale_price');
      expect(response.data.wholesale_price).toBeLessThan(response.data.mrp);
    });

    test('Should calculate bulk discounts', async () => {
      const response = await apiClient.post(`/products/${testProductId}/calculate-price`, {
        customer_type: 'wholesale',
        quantity: 1000
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('unit_price');
      expect(response.data).toHaveProperty('discount_applied');
      expect(response.data).toHaveProperty('total_amount');
    });
  });

  // Test Suite 6: Product Validation
  describe('Product Data Validation', () => {
    test('Should validate required fields', async () => {
      const invalidProduct = {
        // Missing required product_name
        sale_price: 100
      };
      
      await expect(
        apiClient.post('/products/', invalidProduct)
      ).rejects.toThrow();
    });

    test('Should validate HSN code format', async () => {
      const productWithInvalidHSN = generateTestProduct({
        hsn_code: '123' // Too short, should be 4-8 digits
      });
      
      await expect(
        apiClient.post('/products/', productWithInvalidHSN)
      ).rejects.toThrow();
    });

    test('Should validate price relationships', async () => {
      const productWithInvalidPrices = generateTestProduct({
        mrp: 100,
        sale_price: 150 // Sale price > MRP
      });
      
      await expect(
        apiClient.post('/products/', productWithInvalidPrices)
      ).rejects.toThrow();
    });
  });
});

// Export for use in integration tests
module.exports = {
  createTestProduct: async () => {
    const productData = generateTestProduct();
    const response = await apiClient.post('/products/', productData);
    return response.data;
  },
  createTestBatch: async (productId) => {
    const batchData = generateTestBatch(productId);
    const response = await apiClient.post('/batches/', batchData);
    return response.data;
  }
};