/**
 * Sales Workflow Integration Tests
 * Tests the complete sales flow using our actual components
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { BrowserRouter } from 'react-router-dom';
import InvoiceFlow from '../../components/sales/InvoiceFlow';
import SalesOrderFlow from '../../components/sales/SalesOrderFlow';
import { customerAPI, productAPI, invoiceAPI } from '../../services/api';
import { searchCache } from '../../utils/searchCache';

jest.mock('../../services/api');
jest.mock('../../utils/searchCache');

const mockCustomer = {
  customer_id: 'cust-123',
  customer_name: 'Test Pharmacy',
  primary_phone: '9876543210',
  customer_type: 'retail',
  credit_limit: 50000,
  balance_amount: 10000
};

const mockProduct = {
  product_id: 'prod-456',
  product_name: 'Paracetamol 500mg',
  manufacturer: 'Test Pharma',
  mrp: 10,
  sale_price: 8,
  stock_quantity: 1000,
  is_narcotic: false
};

const mockBatch = {
  batch_id: 'batch-789',
  batch_number: 'B2024001',
  expiry_date: '2025-12-31',
  quantity_available: 500
};

describe('Complete Sales Workflow Integration', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    
    // Setup default mocks
    customerAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: [mockCustomer]
    });
    
    productAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: [mockProduct]
    });
    
    productAPI.getBatches = jest.fn().mockResolvedValue({
      success: true,
      data: [mockBatch]
    });
    
    searchCache.preloadData = jest.fn();
    searchCache.search = jest.fn().mockImplementation((type, query) => {
      if (type === 'customers') return [mockCustomer];
      if (type === 'products') return [mockProduct];
      return [];
    });
  });

  const renderInvoiceFlow = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <InvoiceFlow />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  describe('Invoice Creation Flow', () => {
    test('Should complete full invoice creation workflow', async () => {
      renderInvoiceFlow();

      // Step 1: Customer Selection
      expect(screen.getByText('Customer Details')).toBeInTheDocument();
      
      const customerSearch = screen.getByPlaceholderText(/search customer/i);
      fireEvent.change(customerSearch, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByText('Test Pharmacy')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Test Pharmacy'));

      // Should display selected customer info
      expect(screen.getByText('Balance: ₹10,000')).toBeInTheDocument();
      expect(screen.getByText('Credit Limit: ₹50,000')).toBeInTheDocument();

      // Step 2: Add Products
      const productSearch = screen.getByPlaceholderText(/search product/i);
      fireEvent.change(productSearch, { target: { value: 'para' } });

      await waitFor(() => {
        expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Paracetamol 500mg'));

      // Should open batch selector
      await waitFor(() => {
        expect(screen.getByText('Select Batch')).toBeInTheDocument();
        expect(screen.getByText('B2024001')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('B2024001'));

      // Product should be added to invoice
      expect(screen.getByTestId('invoice-item-prod-456')).toBeInTheDocument();

      // Step 3: Update Quantity
      const quantityInput = screen.getByTestId('quantity-prod-456');
      fireEvent.change(quantityInput, { target: { value: '50' } });

      // Should update calculations
      await waitFor(() => {
        const subtotal = 50 * 8; // quantity * sale_price
        expect(screen.getByText(`₹${subtotal}`)).toBeInTheDocument();
      });

      // Step 4: Apply Discount
      const discountInput = screen.getByTestId('discount-prod-456');
      fireEvent.change(discountInput, { target: { value: '10' } });

      // Step 5: GST should be auto-calculated
      await waitFor(() => {
        const subtotal = 400;
        const discount = 40;
        const taxable = 360;
        const gst = taxable * 0.18; // 18% GST
        const total = taxable + gst;
        
        expect(screen.getByText(`GST (18%): ₹${gst.toFixed(2)}`)).toBeInTheDocument();
        expect(screen.getByText(`Total: ₹${total.toFixed(2)}`)).toBeInTheDocument();
      });

      // Step 6: Save Invoice
      invoiceAPI.create = jest.fn().mockResolvedValue({
        success: true,
        data: {
          invoice_id: 'inv-001',
          invoice_number: 'INV-2024-001',
          total_amount: 424.80
        }
      });

      const saveButton = screen.getByText('Save Invoice');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(invoiceAPI.create).toHaveBeenCalledWith(
          expect.objectContaining({
            customer_id: 'cust-123',
            items: expect.arrayContaining([
              expect.objectContaining({
                product_id: 'prod-456',
                batch_id: 'batch-789',
                quantity: 50,
                unit_price: 8,
                discount_percent: 10
              })
            ])
          })
        );
      });

      // Should show success message
      expect(screen.getByText('Invoice created successfully!')).toBeInTheDocument();
      expect(screen.getByText('INV-2024-001')).toBeInTheDocument();
    });

    test('Should validate credit limit before saving', async () => {
      // Mock customer with low credit limit
      const lowCreditCustomer = {
        ...mockCustomer,
        credit_limit: 100,
        balance_amount: 0
      };
      
      customerAPI.search = jest.fn().mockResolvedValue({
        success: true,
        data: [lowCreditCustomer]
      });

      renderInvoiceFlow();

      // Select customer
      const customerSearch = screen.getByPlaceholderText(/search customer/i);
      fireEvent.change(customerSearch, { target: { value: 'test' } });
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Test Pharmacy'));
      });

      // Add expensive product
      const productSearch = screen.getByPlaceholderText(/search product/i);
      fireEvent.change(productSearch, { target: { value: 'para' } });
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Paracetamol 500mg'));
      });

      // Select batch
      await waitFor(() => {
        fireEvent.click(screen.getByText('B2024001'));
      });

      // Set high quantity
      const quantityInput = screen.getByTestId('quantity-prod-456');
      fireEvent.change(quantityInput, { target: { value: '100' } });

      // Should show credit limit warning
      await waitFor(() => {
        expect(screen.getByText(/exceeds credit limit/i)).toBeInTheDocument();
        expect(screen.getByTestId('save-button')).toBeDisabled();
      });
    });

    test('Should handle narcotic products specially', async () => {
      const narcoticProduct = {
        ...mockProduct,
        is_narcotic: true,
        drug_license_required: true
      };
      
      productAPI.search = jest.fn().mockResolvedValue({
        success: true,
        data: [narcoticProduct]
      });

      renderInvoiceFlow();

      // Select customer first
      const customerSearch = screen.getByPlaceholderText(/search customer/i);
      fireEvent.change(customerSearch, { target: { value: 'test' } });
      await waitFor(() => {
        fireEvent.click(screen.getByText('Test Pharmacy'));
      });

      // Search narcotic product
      const productSearch = screen.getByPlaceholderText(/search product/i);
      fireEvent.change(productSearch, { target: { value: 'para' } });

      await waitFor(() => {
        // Should show narcotic indicator
        expect(screen.getByTestId('narcotic-badge')).toBeInTheDocument();
        expect(screen.getByText('Drug License Required')).toBeInTheDocument();
      });
    });
  });

  describe('Sales Order to Invoice Conversion', () => {
    test('Should convert sales order to invoice', async () => {
      const renderSalesOrderFlow = () => {
        return render(
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <SalesOrderFlow />
            </BrowserRouter>
          </QueryClientProvider>
        );
      };

      renderSalesOrderFlow();

      // Create sales order
      // ... (similar flow as invoice)

      // Convert to invoice
      const convertButton = screen.getByText('Convert to Invoice');
      fireEvent.click(convertButton);

      await waitFor(() => {
        expect(screen.getByText('Converting Sales Order to Invoice')).toBeInTheDocument();
      });

      // Should pre-fill invoice with sales order data
      expect(screen.getByTestId('customer-name')).toHaveValue('Test Pharmacy');
      expect(screen.getByTestId('product-list')).toContainElement(
        screen.getByText('Paracetamol 500mg')
      );
    });
  });

  describe('Delivery Challan Integration', () => {
    test('Should create delivery challan from invoice', async () => {
      renderInvoiceFlow();

      // ... Create invoice first

      // Create delivery challan
      const deliveryButton = screen.getByText('Create Delivery Challan');
      fireEvent.click(deliveryButton);

      await waitFor(() => {
        expect(screen.getByText('Delivery Challan Details')).toBeInTheDocument();
      });

      // Fill delivery details
      const vehicleInput = screen.getByPlaceholderText('Vehicle Number');
      fireEvent.change(vehicleInput, { target: { value: 'MH12AB1234' } });

      const driverInput = screen.getByPlaceholderText('Driver Name');
      fireEvent.change(driverInput, { target: { value: 'John Doe' } });

      // Save challan
      const saveChallanButton = screen.getByText('Create Challan');
      fireEvent.click(saveChallanButton);

      await waitFor(() => {
        expect(screen.getByText('Delivery Challan created successfully!')).toBeInTheDocument();
      });
    });
  });

  describe('Payment Recording', () => {
    test('Should record payment against invoice', async () => {
      renderInvoiceFlow();

      // ... Create invoice first

      // Record payment
      const paymentButton = screen.getByText('Record Payment');
      fireEvent.click(paymentButton);

      await waitFor(() => {
        expect(screen.getByText('Record Payment')).toBeInTheDocument();
      });

      // Enter payment details
      const amountInput = screen.getByPlaceholderText('Payment Amount');
      fireEvent.change(amountInput, { target: { value: '424.80' } });

      const modeSelect = screen.getByTestId('payment-mode');
      fireEvent.change(modeSelect, { target: { value: 'bank_transfer' } });

      const referenceInput = screen.getByPlaceholderText('Reference Number');
      fireEvent.change(referenceInput, { target: { value: 'TXN123456' } });

      // Save payment
      const savePaymentButton = screen.getByText('Save Payment');
      fireEvent.click(savePaymentButton);

      await waitFor(() => {
        expect(screen.getByText('Payment recorded successfully!')).toBeInTheDocument();
        expect(screen.getByText('Invoice Status: PAID')).toBeInTheDocument();
      });
    });
  });
});