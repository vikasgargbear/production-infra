import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProductFlow from './ProductFlow';

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSuccess = jest.fn();

jest.mock('../../../services/api', () => ({
  productsApi: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

jest.mock('../../global/ui/feedback/Toast', () => ({
  useToast: () => ({ success: mockSuccess }),
}));

jest.mock('../../../hooks/useEnterAsTab', () => ({ useEnterAsTab: () => undefined }));
jest.mock('../../../hooks/useEscapeKey', () => ({ __esModule: true, default: () => undefined }));

test('creates one code-free draft attempt and reports the generated code', async () => {
  let resolveCreate: (value: unknown) => void = () => undefined;
  mockCreate.mockReturnValue(new Promise(resolve => { resolveCreate = resolve; }));
  const onCreated = jest.fn();

  render(<ProductFlow open onClose={jest.fn()} onProductCreated={onCreated} />);

  expect(screen.queryByLabelText(/Product code/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'New medicine' } });
  fireEvent.change(screen.getByLabelText('Product kind'), { target: { value: 'medicine' } });
  const save = screen.getByRole('button', { name: 'Save draft' });
  fireEvent.click(save);
  fireEvent.click(save);

  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate).toHaveBeenCalledWith(
    { product_name: 'New medicine', product_kind: 'medicine' },
    expect.stringMatching(/^erp-web-master-product-create:[0-9a-f-]{36}$/i),
  );

  const response = {
    product_id: '33333333-3333-7333-8333-333333333333',
    product_code: 'GENERATED-P-1', product_name: 'New medicine',
    lifecycle_status: 'draft' as const, message: 'Draft created',
  };
  resolveCreate({ data: response });

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(response));
  expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('GENERATED-P-1'));
  expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('activation'));
});

test('shows an existing draft code read-only and never includes it in update payload', async () => {
  mockUpdate.mockResolvedValue({ data: {
    product_id: '33333333-3333-7333-8333-333333333333',
    product_code: 'IMMUTABLE-P-1', product_name: 'Renamed',
    lifecycle_status: 'draft', message: 'Updated',
  } });

  render(<ProductFlow open onClose={jest.fn()} product={{
    product_id: '33333333-3333-7333-8333-333333333333',
    product_code: 'IMMUTABLE-P-1', product_name: 'Original', product_type: 'medicine',
    row_version: 7,
  }} />);

  expect(screen.getByLabelText('Immutable product code')).toHaveTextContent('IMMUTABLE-P-1');
  fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Renamed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  expect(mockUpdate).toHaveBeenCalledWith(
    '33333333-3333-7333-8333-333333333333',
    { row_version: 7, product_name: 'Renamed', generic_name: undefined, product_kind: 'medicine' },
  );
  expect(mockCreate).not.toHaveBeenCalled();
});

test('keeps the same attempt identity across a failed retry', async () => {
  mockCreate
    .mockRejectedValueOnce(new Error('temporary failure'))
    .mockResolvedValueOnce({ data: {
      product_id: '33333333-3333-7333-8333-333333333333',
      product_code: 'GENERATED-P-2', product_name: 'Retry product',
      lifecycle_status: 'draft', message: 'Draft created',
    } });

  render(<ProductFlow open onClose={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Retry product' } });
  fireEvent.change(screen.getByLabelText('Product kind'), { target: { value: 'medicine' } });
  const save = screen.getByRole('button', { name: 'Save draft' });
  fireEvent.click(save);
  await screen.findByText('Failed to save the product draft.');
  fireEvent.click(save);

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[0][1]).toBe(mockCreate.mock.calls[1][1]);
});
