/* eslint-disable testing-library/no-node-access */
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BatchTracking from './BatchTracking';
import { canonicalInventoryReadsApi } from '../../../services/api/modules/inventory/canonicalInventoryReads.api';

jest.mock('../../../services/api/modules/inventory/canonicalInventoryReads.api', () => ({
  canonicalInventoryReadsApi: {
    context: jest.fn(), batches: jest.fn(), movements: jest.fn(), currentStock: jest.fn(),
  },
}));
jest.mock('../../global', () => ({ ModuleHeader: ({ title }: any) => <h1>{title}</h1> }));

const ids = {
  org: 'd3000000-0000-7000-8000-000000000001',
  branch: 'd3000000-0000-7000-8000-000000000002',
  location: 'd3000000-0000-7000-8000-000000000003',
  product: 'd3000000-0000-7000-8000-000000000004',
  batch1: 'd3000000-0000-7000-8000-000000000005',
  batch2: 'd3000000-0000-7000-8000-000000000006',
  batch3: 'd3000000-0000-7000-8000-000000000009',
  movement: 'd3000000-0000-7000-8000-000000000007',
  document: 'd3000000-0000-7000-8000-000000000008',
};

const scope = { branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main', location_id: null, location_code: null, location_name: null };
const batch = (batch_id: string, batch_number: string) => ({
  batch_id, product_id: ids.product, product_code: 'BOX', product_name: 'Carton',
  batch_number, manufactured_on: null, expires_on: '2027-08-25', expiry_state: 'current',
  mrp: '168.0000', status: 'released', is_saleable: true, total_quantity: '1.000000',
  total_value: '95.24', average_unit_cost: '95.2400',
});

beforeEach(() => {
  jest.clearAllMocks();
  (canonicalInventoryReadsApi.context as jest.Mock).mockResolvedValue({ data: {
    organization_id: ids.org, organization_timezone: 'Asia/Kolkata', business_date: '2026-08-25',
    branches: [{ branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main', locations: [] }],
  } });
  (canonicalInventoryReadsApi.batches as jest.Mock).mockResolvedValue({ data: {
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25',
    items: [batch(ids.batch1, 'B-1'), batch(ids.batch2, 'B-2'), {
      ...batch(ids.batch3, 'B-NEG'), is_saleable: false,
      total_quantity: '-1.000000', total_value: '-95.24',
    }], total_count: 3,
    summary: { batch_count: 3, positive_stock_count: 2, exhausted_batch_count: 0,
      negative_stock_count: 1, total_quantity: '1.000000', total_value: '95.24',
      expired_count: 0, expiring_30d_count: 0, near_expiry_90d_count: 0 },
    next_cursor: null,
  } });
  (canonicalInventoryReadsApi.movements as jest.Mock).mockResolvedValue({ data: {
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25', total_count: 1,
    summary: { movement_count: 1, gross_quantity: '0.000000', net_quantity_delta: '0.000000', gross_value: '5.00', net_value_delta: '-5.00' },
    items: [{ movement_id: ids.movement, posted_at: '2026-08-25T10:00:00Z', entry_kind: 'reversal',
      quantity_delta: '0.000000', value_delta: '-5.00', absolute_quantity: '0.000000', absolute_value: '5.00', unit_cost: '90.2400',
      branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main', location_id: ids.location, location_code: 'SALE', location_name: 'Saleable',
      product_id: ids.product, product_code: 'BOX', product_name: 'Carton', batch_id: ids.batch2, batch_number: 'B-2',
      inventory_document_id: ids.document, document_number: 'REV-1', reverses_entry_id: ids.movement,
      reversed_entry_kind: 'value_adjustment', reversal_reconciled: true, posted_by: null }],
    next_cursor: null,
  } });
});

test('Escape closes only movements and restores the exact clicked batch trigger', async () => {
  render(<BatchTracking />);
  const first = await screen.findByRole('button', { name: 'View movements for batch B-1' });
  const second = screen.getByRole('button', { name: 'View movements for batch B-2' });
  const negative = screen.getByRole('button', { name: 'View movements for batch B-NEG' }).closest('tr');
  expect(negative).toHaveAttribute('data-stock-sign', 'negative');
  expect(negative).toHaveClass('text-red-700');
  fireEvent.click(second);
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(await screen.findByText('Reversal of value adjustment')).toBeVisible();
  expect(screen.getByText('-₹5.00')).toBeVisible();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(second).toHaveFocus());
  expect(first).not.toHaveFocus();
});
