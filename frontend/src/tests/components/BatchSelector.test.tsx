/**
 * BatchSelector Component Tests
 * Tests the critical BatchSelector component for pharma expiry tracking
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { BatchSelector } from '../../components/global';
import { batchAPI } from '../../services/api';

jest.mock('../../services/api');

const mockProduct = {
  product_id: 'prod-123',
  product_name: 'Paracetamol 500mg',
  manufacturer: 'Test Pharma',
  category: 'tablets'
};

const mockBatches = [
  {
    batch_id: 'batch-1',
    batch_number: 'B2024001',
    product_id: 'prod-123',
    expiry_date: '2025-12-31',
    manufacturing_date: '2024-01-15',
    quantity_available: 500,
    mrp: 10,
    purchase_price: 6,
    sale_price: 8
  },
  {
    batch_id: 'batch-2',
    batch_number: 'B2024002',
    product_id: 'prod-123',
    expiry_date: '2024-06-30', // Expiring soon
    manufacturing_date: '2023-12-15',
    quantity_available: 100,
    mrp: 10,
    purchase_price: 6,
    sale_price: 8
  },
  {
    batch_id: 'batch-3',
    batch_number: 'B2023001',
    product_id: 'prod-123',
    expiry_date: '2024-01-31', // Expired
    manufacturing_date: '2023-01-15',
    quantity_available: 50,
    mrp: 10,
    purchase_price: 6,
    sale_price: 8
  }
];

describe('BatchSelector Component', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BatchSelector 
          show={true}
          product={mockProduct}
          onBatchSelect={jest.fn()}
          onClose={jest.fn()}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  test('Should display product information', () => {
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent();
    
    expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
    expect(screen.getByText('Test Pharma')).toBeInTheDocument();
  });

  test('Should load and display batches', async () => {
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent();

    await waitFor(() => {
      expect(batchAPI.search).toHaveBeenCalledWith({
        product_id: 'prod-123'
      });
    });

    // Should display batch numbers
    expect(screen.getByText('B2024001')).toBeInTheDocument();
    expect(screen.getByText('B2024002')).toBeInTheDocument();
  });

  test('Should show expiry status indicators', async () => {
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent({ showExpiryStatus: true });

    await waitFor(() => {
      // Good batch (expires in future)
      const goodBatch = screen.getByText('B2024001').closest('.batch-item');
      expect(goodBatch).toHaveClass('expiry-good');

      // Expiring soon batch
      const expiringBatch = screen.getByText('B2024002').closest('.batch-item');
      expect(expiringBatch).toHaveClass('expiry-warning');

      // Expired batch
      const expiredBatch = screen.getByText('B2023001').closest('.batch-item');
      expect(expiredBatch).toHaveClass('expiry-danger');
    });
  });

  test('Should filter out expired batches by default', async () => {
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent({ filterExpired: true });

    await waitFor(() => {
      // Should show non-expired batches
      expect(screen.getByText('B2024001')).toBeInTheDocument();
      expect(screen.getByText('B2024002')).toBeInTheDocument();
      
      // Should NOT show expired batch
      expect(screen.queryByText('B2023001')).not.toBeInTheDocument();
    });
  });

  test('Should sort batches by expiry date', async () => {
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent({ sortBy: 'expiry', sortOrder: 'asc' });

    await waitFor(() => {
      const batchElements = screen.getAllByTestId('batch-item');
      const batchNumbers = batchElements.map(el => 
        el.querySelector('.batch-number').textContent
      );
      
      // Should be sorted by expiry date ascending
      expect(batchNumbers).toEqual(['B2023001', 'B2024002', 'B2024001']);
    });
  });

  test('Should call onBatchSelect when batch is selected', async () => {
    const onBatchSelect = jest.fn();
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent({ onBatchSelect });

    await waitFor(() => {
      expect(screen.getByText('B2024001')).toBeInTheDocument();
    });

    // Click on first batch
    fireEvent.click(screen.getByText('B2024001').closest('.batch-item'));

    expect(onBatchSelect).toHaveBeenCalledWith(mockBatches[0]);
  });

  test('Should show quantity validation', async () => {
    const onBatchSelect = jest.fn();
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent({ 
      onBatchSelect,
      requiredQuantity: 600 // More than available
    });

    await waitFor(() => {
      const firstBatch = screen.getByText('B2024001').closest('.batch-item');
      expect(firstBatch).toHaveClass('insufficient-quantity');
      expect(screen.getByText('Insufficient quantity')).toBeInTheDocument();
    });
  });

  test('Should allow creating default batch if none available', async () => {
    const onBatchSelect = jest.fn();
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: [] // No batches
    });

    renderComponent({ 
      onBatchSelect,
      allowCreateDefault: true 
    });

    await waitFor(() => {
      expect(screen.getByText('No batches available')).toBeInTheDocument();
      expect(screen.getByText('Create Default Batch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Default Batch'));

    expect(onBatchSelect).toHaveBeenCalledWith({
      batch_number: 'DEFAULT',
      expiry_date: expect.any(String),
      quantity_available: 999999
    });
  });

  test('Should integrate with FIFO/FEFO selection', async () => {
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent({ 
      selectionMode: 'FEFO' // First Expiry First Out
    });

    await waitFor(() => {
      // Should highlight the batch expiring first
      const recommendedBatch = screen.getByText('B2024002').closest('.batch-item');
      expect(recommendedBatch).toHaveClass('recommended');
      expect(screen.getByText('Recommended (FEFO)')).toBeInTheDocument();
    });
  });

  test('Should display batch pricing information', async () => {
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent({ showPricing: true });

    await waitFor(() => {
      // Should show MRP and sale price
      expect(screen.getByText('MRP: ₹10')).toBeInTheDocument();
      expect(screen.getByText('Sale Price: ₹8')).toBeInTheDocument();
    });
  });

  test('Should handle inline mode', () => {
    batchAPI.search = jest.fn().mockResolvedValue({
      success: true,
      data: mockBatches
    });

    renderComponent({ mode: 'inline' });

    // Should not render as modal
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    
    // Should render inline
    expect(screen.getByTestId('batch-selector-inline')).toBeInTheDocument();
  });
});