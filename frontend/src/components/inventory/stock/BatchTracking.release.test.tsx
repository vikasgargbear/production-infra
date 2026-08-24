import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BatchTracking from './BatchTracking';
import { batchesApi, inventoryMovementsApi } from '../../../services/api';

jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => ({ autoTable: jest.fn() }));
jest.mock('../../../services/api', () => ({
  batchesApi: { getAll: jest.fn() },
  inventoryMovementsApi: { getByBatch: jest.fn() },
}));
jest.mock('../../global', () => ({
  ModuleHeader: ({ title }: any) => <h1>{title}</h1>,
  StatusBadge: ({ label }: any) => <span>{label}</span>,
  DataTable: ({ columns, data }: any) => (
    <div>
      {data.map((row: any) => (
        <div key={row.batch_id}>
          {columns.map((column: any) => (
            <div key={column.key}>
              {column.render ? column.render(row[column.key], row) : String(row[column.key] ?? '')}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

const mockedBatchesApi = batchesApi as jest.Mocked<typeof batchesApi>;
const mockedMovementsApi = inventoryMovementsApi as jest.Mocked<typeof inventoryMovementsApi>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedBatchesApi.getAll.mockResolvedValue({
    data: [{
      batch_id: '01991f69-b5ae-7000-8000-000000000001',
      batch_number: 'BATCH-001',
      product_name: 'Canonical carton',
      quantity: 95,
      expiry_date: '2028-09-01',
    }],
  } as any);
  mockedMovementsApi.getByBatch.mockResolvedValue({
    data: [{
      id: 'movement-1',
      entry_kind: 'issue',
      movement_type: 'out',
      quantity: 14,
      movement_date: '2026-08-24T00:00:00Z',
    }],
  } as any);
});

test('shows unavailable valuation and closes the movement dialog with Escape', async () => {
  render(<BatchTracking />);

  expect(await screen.findByText('Unavailable')).not.toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'View movements for batch BATCH-001' }));

  await waitFor(() => expect(screen.getByRole('dialog')).not.toBeNull());
  expect(await screen.findByText('Stock Out')).not.toBeNull();
  expect(screen.getByText('-14')).not.toBeNull();

  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
