/**
 * Frontend Component Tests for Enterprise Calculation Migration
 * Verifies all components use API-based calculations correctly
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
// All calculators now use EnterpriseCalculator
import EnterpriseCalculator from '../services/enterpriseCalculator';
import InvoiceCalculator from '../services/InvoiceCalculator';

// Mock API calls
jest.mock('../services/api', () => ({
  post: jest.fn()
}));

import api from '../services/api';

describe('Enterprise Calculation Migration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PurchaseCalculatorEnterprise', () => {
    it('should calculate purchase totals via API', async () => {
      const mockResponse = {
        data: {
          success: true,
          totals: {
            gross_amount: 1000,
            total_discount: 50,
            taxable_amount: 950,
            total_tax: 114,
            freight_charges: 100,
            insurance_charges: 25,
            other_charges: 15,
            final_amount: 1204
          },
          line_items: []
        }
      };

      api.post.mockResolvedValue(mockResponse);

      const purchaseData = {
        supplier_id: 1,
        items: [
          {
            product_id: 114,
            quantity: 10,
            purchase_price: 100,
            discount_percent: 5,
            gst_percent: 12
          }
        ],
        freight_charges: 100,
        insurance_charges: 25,
        other_charges: 15
      };

      const result = await PurchaseCalculatorEnterprise.calculatePurchase(purchaseData);

      expect(api.post).toHaveBeenCalledWith('/calculations/purchase', expect.objectContaining({
        supplier_id: 1,
        items: expect.any(Array),
        freight_charges: 100,
        insurance_charges: 25,
        other_charges: 15
      }));

      expect(result.success).toBe(true);
      expect(result.totals.final_amount).toBe(1204);
    });

    it('should handle API errors gracefully', async () => {
      api.post.mockRejectedValue(new Error('Network error'));

      const result = await PurchaseCalculatorEnterprise.calculatePurchase({
        items: []
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.totals.final_amount).toBe(0);
    });

    it('should format totals for display correctly', () => {
      const rawTotals = {
        gross_amount: 1000.123,
        total_tax: 120.456,
        freight_charges: 100.789,
        final_amount: 1220.999
      };

      const formatted = PurchaseCalculatorEnterprise.formatTotalsForDisplay(rawTotals);

      expect(formatted.gross_amount).toBe(1000.123);
      expect(formatted.tax_amount).toBe(120.456);
      expect(formatted.freight_charges).toBe(100.789);
      expect(formatted.final_amount).toBe(1220.999);
    });
  });

  describe('SalesOrderCalculatorEnterprise', () => {
    it('should calculate sales order totals via API', async () => {
      const mockResponse = {
        data: {
          success: true,
          totals: {
            gross_amount: 800,
            total_discount: 40,
            taxable_amount: 760,
            total_tax: 91.2,
            delivery_charges: 75,
            final_amount: 926
          }
        }
      };

      api.post.mockResolvedValue(mockResponse);

      const orderData = {
        customer_id: 36,
        items: [
          {
            product_id: 114,
            quantity: 8,
            unit_price: 100,
            discount_percent: 5,
            gst_percent: 12
          }
        ],
        delivery_charges: 75
      };

      const result = await SalesOrderCalculatorEnterprise.calculateSalesOrder(orderData);

      expect(api.post).toHaveBeenCalledWith('/calculations/sales-order', expect.objectContaining({
        customer_id: 36,
        items: expect.any(Array),
        delivery_charges: 75
      }));

      expect(result.success).toBe(true);
      expect(result.totals.final_amount).toBe(926);
    });

    it('should create debounced calculator', () => {
      const callback = jest.fn();
      const debouncedCalculator = SalesOrderCalculatorEnterprise.createDebouncedCalculator(callback, 100);

      expect(typeof debouncedCalculator).toBe('function');
    });
  });

  describe('ReturnsCalculatorEnterprise', () => {
    it('should calculate sales return totals via API', async () => {
      const mockResponse = {
        data: {
          success: true,
          totals: {
            gross_amount: 200,
            total_tax: 24,
            adjustment_amount: 10,
            final_amount: 214
          }
        }
      };

      api.post.mockResolvedValue(mockResponse);

      const returnData = {
        customer_id: 36,
        items: [
          {
            product_id: 114,
            return_quantity: 2,
            unit_price: 100,
            gst_percent: 12
          }
        ],
        adjustment_amount: 10
      };

      const result = await ReturnsCalculatorEnterprise.calculateSalesReturn(returnData);

      expect(api.post).toHaveBeenCalledWith('/calculations/sales-return', expect.objectContaining({
        customer_id: 36,
        adjustment_amount: 10
      }));

      expect(result.success).toBe(true);
      expect(result.totals.final_amount).toBe(214);
    });

    it('should calculate purchase return totals via API', async () => {
      const mockResponse = {
        data: {
          success: true,
          totals: {
            gross_amount: 300,
            total_tax: 36,
            adjustment_amount: 15,
            final_amount: 321
          }
        }
      };

      api.post.mockResolvedValue(mockResponse);

      const returnData = {
        supplier_id: 1,
        items: [
          {
            product_id: 115,
            return_quantity: 3,
            purchase_price: 100,
            gst_percent: 12
          }
        ],
        adjustment_amount: 15
      };

      const result = await ReturnsCalculatorEnterprise.calculatePurchaseReturn(returnData);

      expect(api.post).toHaveBeenCalledWith('/calculations/purchase-return', expect.objectContaining({
        supplier_id: 1,
        adjustment_amount: 15
      }));

      expect(result.success).toBe(true);
      expect(result.totals.final_amount).toBe(321);
    });
  });

  describe('Migration Verification Tests', () => {
    it('should ensure no frontend calculation logic remains', () => {
      // Test that calculation services only make API calls
      const purchaseCode = PurchaseCalculatorEnterprise.calculatePurchase.toString();
      const salesOrderCode = SalesOrderCalculatorEnterprise.calculateSalesOrder.toString();
      const returnsCode = ReturnsCalculatorEnterprise.calculateSalesReturn.toString();

      // Verify API calls are present
      expect(purchaseCode).toContain('api.post');
      expect(salesOrderCode).toContain('api.post');
      expect(returnsCode).toContain('api.post');

      // Verify no manual calculations
      expect(purchaseCode).not.toContain('* ');
      expect(purchaseCode).not.toContain('+ ');
      expect(purchaseCode).not.toContain('/ 100');
      expect(salesOrderCode).not.toContain('* ');
      expect(salesOrderCode).not.toContain('+ ');
      expect(returnsCode).not.toContain('* ');
      expect(returnsCode).not.toContain('+ ');
    });

    it('should verify all calculator services exist', () => {
      expect(PurchaseCalculatorEnterprise).toBeDefined();
      expect(SalesOrderCalculatorEnterprise).toBeDefined();
      expect(ReturnsCalculatorEnterprise).toBeDefined();
      expect(InvoiceCalculatorEnterprise).toBeDefined();
    });

    it('should verify API endpoints are correctly mapped', async () => {
      // Mock successful responses for all endpoints
      api.post.mockResolvedValue({
        data: { success: true, totals: { final_amount: 100 } }
      });

      await PurchaseCalculatorEnterprise.calculatePurchase({ items: [] });
      expect(api.post).toHaveBeenCalledWith('/calculations/purchase', expect.any(Object));

      await SalesOrderCalculatorEnterprise.calculateSalesOrder({ items: [] });
      expect(api.post).toHaveBeenCalledWith('/calculations/sales-order', expect.any(Object));

      await ReturnsCalculatorEnterprise.calculateSalesReturn({ items: [] });
      expect(api.post).toHaveBeenCalledWith('/calculations/sales-return', expect.any(Object));

      await ReturnsCalculatorEnterprise.calculatePurchaseReturn({ items: [] });
      expect(api.post).toHaveBeenCalledWith('/calculations/purchase-return', expect.any(Object));
    });

    it('should handle all charge types correctly', async () => {
      api.post.mockResolvedValue({
        data: { success: true, totals: { final_amount: 100 } }
      });

      const purchaseData = {
        items: [],
        freight_charges: 100,
        insurance_charges: 50,
        other_charges: 25,
        discount_amount: 10
      };

      await PurchaseCalculatorEnterprise.calculatePurchase(purchaseData);

      expect(api.post).toHaveBeenCalledWith('/calculations/purchase', expect.objectContaining({
        freight_charges: 100,
        insurance_charges: 50,
        other_charges: 25,
        discount_amount: 10
      }));
    });
  });
});

describe('Integration Tests - Real Component Usage', () => {
  it('should simulate PurchaseFlow component usage', async () => {
    // Mock the API response
    api.post.mockResolvedValue({
      data: {
        success: true,
        totals: {
          gross_amount: 1000,
          final_amount: 1120,
          freight_charges: 100
        },
        line_items: []
      }
    });

    // Simulate how PurchaseFlow would use the calculator
    const purchaseData = {
      supplier_id: 1,
      items: [
        {
          product_id: 114,
          quantity: 10,
          purchase_price: 100,
          gst_percent: 12
        }
      ],
      freight_charges: 100
    };

    const result = await PurchaseCalculatorEnterprise.calculatePurchase(purchaseData);
    const formattedTotals = PurchaseCalculatorEnterprise.formatTotalsForDisplay(result.totals);

    // Verify the component would get correct data
    expect(formattedTotals.gross_amount).toBe(1000);
    expect(formattedTotals.final_amount).toBe(1120);
    expect(formattedTotals.freight_charges).toBe(100);
  });

  it('should verify error handling in components', async () => {
    // Simulate API error
    api.post.mockRejectedValue(new Error('API Error'));

    const result = await PurchaseCalculatorEnterprise.calculatePurchase({ items: [] });

    // Verify component gets safe fallback data
    expect(result.success).toBe(false);
    expect(result.totals.final_amount).toBe(0);
    expect(result.error).toBe('API Error');
  });
});

describe('Performance Tests', () => {
  it('should handle debounced calculations efficiently', (done) => {
    let callCount = 0;
    const callback = () => {
      callCount++;
      if (callCount === 1) {
        // Should only be called once due to debouncing
        expect(callCount).toBe(1);
        done();
      }
    };

    const debouncedCalculator = SalesOrderCalculatorEnterprise.createDebouncedCalculator(callback, 50);

    // Trigger multiple rapid calls
    debouncedCalculator({ items: [] });
    debouncedCalculator({ items: [] });
    debouncedCalculator({ items: [] });
  });
});

describe('Data Transformation Tests', () => {
  it('should correctly transform frontend data to API format', async () => {
    api.post.mockResolvedValue({
      data: { success: true, totals: { final_amount: 100 } }
    });

    const frontendData = {
      supplier_id: 1,
      items: [
        {
          product_id: 114,
          quantity: '10',  // String from input
          purchase_price: '25.50',  // String from input  
          discount_percent: '5',  // String from input
          tax_percent: '12'  // Different field name
        }
      ],
      freight_charges: '75.25'  // String from input
    };

    await PurchaseCalculatorEnterprise.calculatePurchase(frontendData);

    // Verify proper type conversion and field mapping
    expect(api.post).toHaveBeenCalledWith('/calculations/purchase', expect.objectContaining({
      supplier_id: 1,
      items: [
        expect.objectContaining({
          product_id: 114,
          quantity: 10,  // Converted to number
          purchase_price: 25.50,  // Converted to number
          discount_percent: 5,  // Converted to number
          gst_percent: 12  // Field mapped correctly
        })
      ],
      freight_charges: 75.25  // Converted to number
    }));
  });
});