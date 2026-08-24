import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Products from './Products';

const mockGetAll = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../../services/api', () => ({
  productsApi: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('./ProductFlow', () => ({
  __esModule: true,
  default: ({ product }: { product?: { product_name?: string } | null }) => (
    <div>{product ? `Editing ${product.product_name}` : 'Creating product draft'}</div>
  ),
}));

const products = [
  {
    product_id: 'd3000000-0000-7000-8000-000000000001',
    product_code: 'DRAFT-1',
    product_name: 'Mutable draft',
    product_type: 'medicine',
    status: 'draft',
  },
  {
    product_id: 'd3000000-0000-7000-8000-000000000002',
    product_code: 'ACTIVE-1',
    product_name: 'Released product',
    product_type: 'consumable',
    status: 'active',
  },
  {
    product_id: 'd3000000-0000-7000-8000-000000000003',
    product_code: 'BLOCKED-1',
    product_name: 'Blocked product',
    product_type: 'medical_device',
    status: 'blocked',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue({ data: { products } });
  mockDelete.mockResolvedValue({ data: { success: true } });
});

test('only draft products expose edit and delete actions', async () => {
  render(<Products />);

  expect(await screen.findAllByRole('button', { name: 'Edit draft Mutable draft' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Delete draft Mutable draft' })).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /Released product/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Blocked product/ })).toBeNull();
  expect(screen.getAllByText(/Read only/)).toHaveLength(4);

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit draft Mutable draft' })[0]);
  expect(screen.getByText('Editing Mutable draft')).toBeTruthy();
});

test('draft deletion requires confirmation and reports canonical API rejection', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  mockDelete.mockRejectedValue({ response: { data: { detail: 'This draft is already referenced and cannot be deleted' } } });
  render(<Products />);

  fireEvent.click((await screen.findAllByRole('button', { name: 'Delete draft Mutable draft' }))[0]);

  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(products[0].product_id));
  expect(await screen.findByText('This draft is already referenced and cannot be deleted')).toBeTruthy();
  confirm.mockRestore();
});
