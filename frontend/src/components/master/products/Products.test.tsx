import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Products from './Products';

const mockGetAll = jest.fn();
const mockDelete = jest.fn();
const mockHasPermission = jest.fn(() => true);
const mockHasCapability = jest.fn(() => true);
const mockHasAnyCapability = jest.fn(() => true);

jest.mock('../../../services/api', () => ({
  productsApi: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: mockHasPermission,
    hasCapability: mockHasCapability,
    hasAnyCapability: mockHasAnyCapability,
  }),
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
    row_version: 4,
  },
  {
    product_id: 'd3000000-0000-7000-8000-000000000002',
    product_code: 'ACTIVE-1',
    product_name: 'Released product',
    product_type: 'consumable',
    status: 'active',
    row_version: 2,
  },
  {
    product_id: 'd3000000-0000-7000-8000-000000000003',
    product_code: 'BLOCKED-1',
    product_name: 'Blocked product',
    product_type: 'medical_device',
    status: 'blocked',
    row_version: 3,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue({ data: { products } });
  mockDelete.mockResolvedValue({ data: { success: true } });
  mockHasPermission.mockReturnValue(true);
  mockHasCapability.mockReturnValue(true);
  mockHasAnyCapability.mockReturnValue(true);
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

test('draft deletion requires explicit in-app review and reports canonical API rejection', async () => {
  mockDelete.mockRejectedValue({ response: { data: { detail: 'This draft is already referenced and cannot be deleted' } } });
  render(<Products />);

  const trigger = (await screen.findAllByRole('button', { name: 'Delete draft Mutable draft' }))[0];
  fireEvent.click(trigger);

  expect(mockDelete).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'Delete product draft?' });
  expect(within(dialog).getByText('Mutable draft')).toBeTruthy();
  expect(within(dialog).getByText('DRAFT-1')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

  fireEvent.click(screen.getByRole('button', { name: /^Delete draft$/ }));

  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(
    products[0].product_id,
    products[0].row_version,
  ));
  expect(await screen.findByText('This draft is already referenced and cannot be deleted')).toBeTruthy();
  expect(screen.getByRole('dialog', { name: 'Delete product draft?' })).toBeTruthy();
});

test('Escape cancels deletion and restores focus without issuing a request', async () => {
  render(<Products />);

  const trigger = (await screen.findAllByRole('button', { name: 'Delete draft Mutable draft' }))[0];
  trigger.focus();
  fireEvent.click(trigger);

  const cancel = screen.getByRole('button', { name: 'Cancel' });
  const deleteButton = screen.getByRole('button', { name: /^Delete draft$/ });
  const closeButton = screen.getByRole('button', { name: 'Close delete product draft dialog' });
  deleteButton.focus();
  fireEvent.keyDown(deleteButton, { key: 'Tab' });
  expect(closeButton).toHaveFocus();
  fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
  expect(deleteButton).toHaveFocus();
  cancel.focus();
  fireEvent.keyDown(cancel, { key: 'Escape' });

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete product draft?' })).toBeNull());
  expect(trigger).toHaveFocus();
  expect(mockDelete).not.toHaveBeenCalled();
});

test('lookup remains readable but every product mutation CTA is hidden without exact manage', async () => {
  mockHasCapability.mockReturnValue(false);
  render(<Products />);

  expect(await screen.findAllByText('Mutable draft')).toHaveLength(2);
  expect(screen.getByLabelText(/Search products/)).not.toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Create product' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Edit draft/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Delete draft/ })).toBeNull();
});

test('does not call the API and explains denial without master view', async () => {
  mockHasAnyCapability.mockReturnValue(false);
  render(<Products />);

  expect(await screen.findByText('You do not have permission to search products.')).toBeTruthy();
  expect(screen.getByLabelText(/Search products/)).toBeDisabled();
  expect(mockGetAll).not.toHaveBeenCalled();
});
