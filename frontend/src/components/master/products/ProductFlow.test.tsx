import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProductFlow from './ProductFlow';

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockGetSetupOptions = jest.fn();
const mockGetSetup = jest.fn();
const mockSaveSetup = jest.fn();
const mockActivate = jest.fn();
const mockSuccess = jest.fn();

jest.mock('../../../services/api', () => ({
  productsApi: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    getSetupOptions: (...args: unknown[]) => mockGetSetupOptions(...args),
    getSetup: (...args: unknown[]) => mockGetSetup(...args),
    saveSetup: (...args: unknown[]) => mockSaveSetup(...args),
    activate: (...args: unknown[]) => mockActivate(...args),
    searchHsnCodes: jest.fn().mockResolvedValue({ data: [] }),
    searchIngredients: jest.fn().mockResolvedValue({ data: [] }),
  },
}));
jest.mock('../../global/ui/feedback/Toast', () => ({ useToast: () => ({ success: mockSuccess }) }));
jest.mock('../../../hooks/useEnterAsTab', () => ({ useEnterAsTab: () => undefined }));
jest.mock('../../../hooks/useEscapeKey', () => ({ __esModule: true, default: () => undefined }));

const options = {
  business_date: '2026-08-28', ingredient_reference_ready: true, hsn_reference_ready: true,
  categories: [],
  units: [{ code: 'EA', name: 'Each', symbol: 'ea', dimension: 'count', decimal_places: 0 }],
  manufacturers: [],
};
const setupRead = {
  product_id: '33333333-3333-7333-8333-333333333333', product_code: 'IMMUTABLE-P-1',
  product_name: 'Original', generic_name: null, product_kind: 'medicine', category_id: null,
  category_name: null, manufacturer_party_id: null, manufacturer_name: null, base_uom_code: 'EA',
  dosage_form: null, strength_display: null, hsn_code: null, cold_chain_required: false,
  minimum_storage_celsius: null, maximum_storage_celsius: null, shelf_life_days: null, gtin: null,
  status: 'draft', row_version: 7, missing_fields: ['manufacturer_party_id', 'hsn_code', 'dosage_form', 'strength_display', 'ingredients'],
  recommended_fields: ['category_id', 'shelf_life_days', 'gtin'], ready_to_activate: false,
  pack_conversions: [], ingredients: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSetupOptions.mockResolvedValue({ data: options });
  mockGetSetup.mockResolvedValue({ data: setupRead });
});

test('creates one code-free draft attempt and continues into canonical classification', async () => {
  let resolveCreate: (value: unknown) => void = () => undefined;
  mockCreate.mockReturnValue(new Promise(resolve => { resolveCreate = resolve; }));
  render(<ProductFlow open onClose={jest.fn()} onProductCreated={jest.fn()} />);

  await screen.findByLabelText('Product name *');
  expect(screen.queryByLabelText(/Internal product code/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Product name *'), { target: { value: 'New medicine' } });
  fireEvent.change(screen.getByLabelText('Product kind *'), { target: { value: 'medicine' } });
  const save = screen.getByRole('button', { name: 'Save & continue' });
  fireEvent.click(save); fireEvent.click(save);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate).toHaveBeenCalledWith(
    { product_name: 'New medicine', product_kind: 'medicine' },
    expect.stringMatching(/^erp-web-master-product-create:[0-9a-f-]{36}$/i),
  );
  resolveCreate({ data: { product_id: setupRead.product_id, product_code: 'GENERATED-P-1', product_name: 'New medicine', lifecycle_status: 'draft', row_version: 1, message: 'Draft created' } });
  expect(await screen.findByText('Classification and tax')).toBeInTheDocument();
  expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('GENERATED-P-1'));
});

test('existing drafts expose immutable code and preserve identity-only update boundary', async () => {
  mockUpdate.mockResolvedValue({ data: { product_id: setupRead.product_id, product_code: 'IMMUTABLE-P-1', product_name: 'Renamed', lifecycle_status: 'draft', row_version: 8, message: 'Updated' } });
  render(<ProductFlow open onClose={jest.fn()} product={{ product_id: setupRead.product_id, product_code: 'IMMUTABLE-P-1', product_name: 'Original', product_type: 'medicine', row_version: 7 }} />);

  await screen.findByText('Classification and tax');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Immutable product code')).toHaveTextContent('IMMUTABLE-P-1');
  fireEvent.change(screen.getByLabelText('Product name *'), { target: { value: 'Renamed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(setupRead.product_id, {
    row_version: 7, product_name: 'Renamed', generic_name: undefined, product_kind: 'medicine',
  }));
});

test('keeps the same draft attempt identity across a failed retry', async () => {
  mockCreate.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ data: {
    product_id: setupRead.product_id, product_code: 'GENERATED-P-2', product_name: 'Retry product',
    lifecycle_status: 'draft', row_version: 1, message: 'Draft created',
  } });
  render(<ProductFlow open onClose={jest.fn()} />);
  await screen.findByLabelText('Product name *');
  fireEvent.change(screen.getByLabelText('Product name *'), { target: { value: 'Retry product' } });
  fireEvent.change(screen.getByLabelText('Product kind *'), { target: { value: 'medicine' } });
  const save = screen.getByRole('button', { name: 'Save & continue' });
  fireEvent.click(save);
  await screen.findByText('Failed to save product basics.');
  fireEvent.click(save);
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[0][1]).toBe(mockCreate.mock.calls[1][1]);
});

test('shows every foundational product stage and keeps receipt-owned facts out of setup', async () => {
  render(<ProductFlow open onClose={jest.fn()} product={{ product_id: setupRead.product_id, product_code: 'IMMUTABLE-P-1', product_name: 'Original', product_type: 'medicine', row_version: 7 }} />);
  await screen.findByText('Classification and tax');
  expect(screen.getByText(/Schedule, prescription, NDPS and H2 rules are derived/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('Units and packaging')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('Storage and shelf life')).toBeInTheDocument();
  expect(screen.getByText('Reviewed composition *')).toBeInTheDocument();
  expect(screen.queryByLabelText(/MRP/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Expiry date/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Opening quantity/i)).not.toBeInTheDocument();
});
