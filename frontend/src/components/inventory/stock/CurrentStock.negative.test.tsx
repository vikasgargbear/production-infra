/* eslint-disable testing-library/no-node-access */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import CurrentStock from './CurrentStock';
import { canonicalInventoryReadsApi } from '../../../services/api/modules/inventory/canonicalInventoryReads.api';

jest.mock('../../../services/api/modules/inventory/canonicalInventoryReads.api', () => ({
  canonicalInventoryReadsApi: {
    context: jest.fn(), currentStock: jest.fn(), batches: jest.fn(), movements: jest.fn(),
  },
}));
jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('../../global', () => ({ ModuleHeader: ({ title }: any) => <h1>{title}</h1> }));

const ids = {
  org: 'd3100000-0000-7000-8000-000000000001',
  branch: 'd3100000-0000-7000-8000-000000000002',
  product: 'd3100000-0000-7000-8000-000000000003',
};

beforeEach(() => {
  jest.clearAllMocks();
  (canonicalInventoryReadsApi.context as jest.Mock).mockResolvedValue({ data: {
    organization_id: ids.org,
    organization_timezone: 'Asia/Kolkata',
    business_date: '2026-08-25',
    transfer_logistics_modes: [{ transport_mode: 'in_person', display_name: 'In person (no carrier)' }],
    branches: [{
      branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main', locations: [],
    }],
  } });
  (canonicalInventoryReadsApi.currentStock as jest.Mock).mockResolvedValue({ data: {
    scope: {
      branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main',
      location_id: null, location_code: null, location_name: null,
    },
    as_of: '2026-08-25T10:00:00Z',
    business_date: '2026-08-25',
    items: [{
      product_id: ids.product, product_code: 'NEG', product_name: 'Negative stock',
      generic_name: null, hsn_code: '3004', product_type: 'medicine', unit: 'EA',
      category: null, total_quantity: '-2.000000', total_value: '-40.00',
      average_unit_cost: '20.0000', batch_count: 1, positive_stock_batch_count: 0,
      exhausted_batch_count: 0, negative_stock_batch_count: 1, expired_batch_count: 0,
      near_expiry_batch_count: 0, requires_cold_chain: false,
    }],
    total_count: 1,
    summary: {
      product_count: 1, total_quantity: '-2.000000', total_value: '-40.00',
      batch_count: 1, positive_stock_batch_count: 0, exhausted_batch_count: 0,
      negative_stock_batch_count: 1,
    },
    next_cursor: null,
  } });
});

test('renders signed negative product and summary aggregates as visible exceptions', async () => {
  render(<CurrentStock />);
  const product = await screen.findByText('Negative stock');
  const row = product.closest('tr');
  expect(row).toHaveAttribute('data-stock-sign', 'negative');
  expect(row).toHaveClass('text-red-700');
  expect(screen.getByText('Total quantity:', { exact: false }).closest('span')).toHaveClass('text-red-700');
  expect(screen.getByText('Total value:', { exact: false }).closest('span')).toHaveClass('text-red-700');
  expect(screen.getByText('Negative:', { exact: false }).closest('span')).toHaveClass('text-red-700');
});
