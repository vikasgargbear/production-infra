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
const mockSearchHsnCodes = jest.fn();
const mockSearchIngredients = jest.fn();
const mockCreateCategory = jest.fn();
const mockCreateManufacturer = jest.fn();
const mockSuccess = jest.fn();

jest.mock('../../../services/api', () => ({
  productsApi: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    getSetupOptions: (...args: unknown[]) => mockGetSetupOptions(...args),
    getSetup: (...args: unknown[]) => mockGetSetup(...args),
    saveSetup: (...args: unknown[]) => mockSaveSetup(...args),
    activate: (...args: unknown[]) => mockActivate(...args),
    searchHsnCodes: (...args: unknown[]) => mockSearchHsnCodes(...args),
    searchIngredients: (...args: unknown[]) => mockSearchIngredients(...args),
    createCategory: (...args: unknown[]) => mockCreateCategory(...args),
    createManufacturer: (...args: unknown[]) => mockCreateManufacturer(...args),
  },
}));
jest.mock('../../global/ui/feedback/Toast', () => ({ useToast: () => ({ success: mockSuccess }) }));
jest.mock('../../../hooks/useEnterAsTab', () => ({ useEnterAsTab: () => undefined }));
jest.mock('../../../hooks/useEscapeKey', () => ({ __esModule: true, default: () => undefined }));

const productId = '33333333-3333-7333-8333-333333333333';
const manufacturerId = '44444444-4444-7444-8444-444444444444';
const ingredientId = '55555555-5555-7555-8555-555555555555';
const options = {
  business_date: '2026-08-28', ingredient_reference_ready: true, hsn_reference_ready: true,
  categories: [],
  units: [
    { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'count', decimal_places: 0 },
    { code: 'MG', name: 'Milligram', symbol: 'mg', dimension: 'mass', decimal_places: 6 },
    { code: 'STRIP', name: 'Strip', symbol: 'strip', dimension: 'count', decimal_places: 3 },
    { code: 'BX', name: 'Box', symbol: 'box', dimension: 'count', decimal_places: 3 },
  ],
  manufacturers: [{ manufacturer_party_id: manufacturerId, legal_name: 'Micro Labs' }],
};
const ingredient = {
  ingredient_id: ingredientId, canonical_name: 'Paracetamol', salt_or_form: null,
  drugs_rules_schedule: 'H' as const, ndps_classification: 'NONE',
  schedule_h2_applicable_from: null, ruleset_version: 'ingredients-v1',
};
const configuredSetup = {
  product_id: productId, product_code: 'GENERATED-P-1', product_name: 'Dolo 500',
  generic_name: 'Paracetamol', product_kind: 'medicine' as const, category_id: null,
  category_name: null, manufacturer_party_id: manufacturerId, manufacturer_name: 'Micro Labs',
  base_uom_code: 'EA', dosage_form: 'Tablet', strength_display: '500 mg', hsn_code: '3004',
  cold_chain_required: false, minimum_storage_celsius: null, maximum_storage_celsius: null,
  shelf_life_days: null, gtin: null, status: 'draft' as const, row_version: 2,
  missing_fields: [], recommended_fields: ['category_id', 'shelf_life_days', 'gtin'], ready_to_activate: true,
  pack_conversions: [
    { uom_code: 'STRIP', uom_name: 'Strip', multiplier: '10' },
    { uom_code: 'BX', uom_name: 'Box', multiplier: '100' },
  ],
  ingredients: [{ ...ingredient, ingredient_role: 'active' as const, strength_value: '500',
    strength_uom_code: 'MG', basis_quantity: '1', basis_uom_code: 'EA' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSetupOptions.mockResolvedValue({ data: options });
  mockGetSetup.mockResolvedValue({ data: configuredSetup });
  mockSearchHsnCodes.mockResolvedValue({ data: [{
    tax_code_version_id: '66666666-6666-7666-8666-666666666666', hsn_code: '3004',
    description: 'Medicaments', taxability: 'taxable', cgst_rate: '6', sgst_rate: '6',
    igst_rate: '12', cess_rate: '0', ruleset_version: 'hsn-v1',
  }] });
  mockSearchIngredients.mockResolvedValue({ data: [ingredient] });
  mockSaveSetup.mockResolvedValue({ data: { ...configuredSetup, row_version: 2 } });
});

const selectReviewedHsn = async () => {
  fireEvent.change(screen.getByLabelText('HSN code *'), { target: { value: '30' } });
  fireEvent.click(await screen.findByRole('button', { name: /3004 · 12% GST/i }));
};

const fillRequiredMedicine = async () => {
  fireEvent.change(screen.getByLabelText('Product name *'), { target: { value: 'Dolo 500' } });
  fireEvent.change(screen.getByLabelText(/Generic display name/), { target: { value: 'Paracetamol' } });
  fireEvent.change(screen.getByLabelText('Product kind *'), { target: { value: 'medicine' } });
  fireEvent.change(screen.getByLabelText(/^Legal manufacturer/), { target: { value: manufacturerId } });
  fireEvent.change(screen.getByLabelText('Dosage form *'), { target: { value: 'Tablet' } });
  fireEvent.change(screen.getByLabelText(/Strength \*/), { target: { value: '500 mg' } });
  await selectReviewedHsn();
  fireEvent.change(screen.getByLabelText('Add salt *'), { target: { value: 'pa' } });
  fireEvent.click(await screen.findByRole('button', { name: /Paracetamol/ }));
  fireEvent.change(screen.getByLabelText(/Packing/), { target: { value: '10*10' } });
};

test('validates the complete form before creating a partial draft and uses friendly field names', async () => {
  render(<ProductFlow open onClose={jest.fn()} onProductCreated={jest.fn()} />);
  await screen.findByLabelText('Product name *');
  fireEvent.change(screen.getByLabelText('Product name *'), { target: { value: 'Incomplete medicine' } });
  fireEvent.change(screen.getByLabelText('Product kind *'), { target: { value: 'medicine' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review setup' }));

  expect(await screen.findByText('Manufacturer is required.')).toBeInTheDocument();
  expect(screen.getByText('HSN code is required.')).toBeInTheDocument();
  expect(mockCreate).not.toHaveBeenCalled();
});

test('saves a complete product in one pass with exact familiar packing and typed salt strength', async () => {
  mockCreate.mockResolvedValue({ data: {
    product_id: productId, product_code: 'GENERATED-P-1', product_name: 'Dolo 500',
    lifecycle_status: 'draft', row_version: 1, message: 'Draft created',
  } });
  render(<ProductFlow open onClose={jest.fn()} onProductCreated={jest.fn()} />);
  await screen.findByLabelText('Product name *');
  await fillRequiredMedicine();
  fireEvent.click(screen.getByRole('button', { name: 'Review setup' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledWith(
    { product_name: 'Dolo 500', generic_name: 'Paracetamol', product_kind: 'medicine' },
    expect.stringMatching(/^erp-web-master-product-create:[0-9a-f-]{36}$/i),
  );
  await waitFor(() => expect(mockSaveSetup).toHaveBeenCalledWith(productId, expect.objectContaining({
    row_version: 1, manufacturer_party_id: manufacturerId, base_uom_code: 'EA', hsn_code: '3004',
    dosage_form: 'Tablet', strength_display: '500 mg',
    pack_conversions: [
      { uom_code: 'STRIP', multiplier: 10 },
      { uom_code: 'BX', multiplier: 100 },
    ],
    ingredients: [{ ingredient_id: ingredientId, ingredient_role: 'active', strength_value: 500,
      strength_uom_code: 'MG', basis_quantity: 1, basis_uom_code: 'EA' }],
  })));
  expect(await screen.findByText('Review product')).toBeInTheDocument();
  expect(screen.getAllByText('Ready to add')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Add product' })).toBeInTheDocument();
});

test('existing drafts stay on the compact setup page and expose immutable code without raw draft jargon', async () => {
  render(<ProductFlow open onClose={jest.fn()} product={{
    product_id: productId, product_code: 'GENERATED-P-1', product_name: 'Dolo 500',
    product_type: 'medicine', row_version: 2,
  }} />);

  await screen.findByText('Classification and tax');
  expect(screen.getByLabelText('Immutable product code')).toHaveTextContent('GENERATED-P-1');
  expect(screen.getByText('Setup incomplete')).toBeInTheDocument();
  expect(screen.queryByText('Draft until activated')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Packing' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Salt / composition' })).toBeInTheDocument();
});

test('keeps receipt-owned batch, price and quantity facts out of product setup', async () => {
  render(<ProductFlow open onClose={jest.fn()} />);
  await screen.findByText('Classification and tax');
  expect(screen.getByText(/Schedule, prescription, NDPS and H2 rules are derived/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/MRP/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Expiry date/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Opening quantity/i)).not.toBeInTheDocument();
});

test('creates empty organization category and legal manufacturer references inline and selects them', async () => {
  const categoryId = '77777777-7777-7777-8777-777777777777';
  mockGetSetupOptions.mockResolvedValueOnce({ data: {
    ...options, categories: [], manufacturers: [],
  } });
  mockCreateManufacturer.mockResolvedValue({ data: {
    manufacturer_party_id: manufacturerId, legal_name: 'Exact Pharma Laboratories', row_version: 1,
  } });
  mockCreateCategory.mockResolvedValue({ data: {
    category_id: categoryId, code: 'ANALGESICS', name: 'Analgesics', parent_id: null, row_version: 1,
  } });
  render(<ProductFlow open onClose={jest.fn()} onProductCreated={jest.fn()} />);

  expect(await screen.findByText(/No manufacturer exists for this organization yet/)).toBeInTheDocument();
  expect(screen.getByText(/No product categories yet/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('New legal manufacturer name'), {
    target: { value: 'Exact Pharma Laboratories' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add manufacturer' }));
  await waitFor(() => expect(mockCreateManufacturer).toHaveBeenCalledWith(
    'Exact Pharma Laboratories', expect.stringMatching(/^erp-web-master-manufacturer-create:/),
  ));
  await waitFor(() => expect(screen.getByLabelText(/^Legal manufacturer/)).toHaveValue(manufacturerId));

  fireEvent.change(screen.getByLabelText('New product category name'), {
    target: { value: 'Analgesics' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
  await waitFor(() => expect(mockCreateCategory).toHaveBeenCalledWith(
    'Analgesics', expect.stringMatching(/^erp-web-master-category-create:/),
  ));
  await waitFor(() => expect(screen.getByLabelText(/^Category/)).toHaveValue(categoryId));
});

test('retries an uncertain manufacturer request with the same key and blocks a concurrent duplicate', async () => {
  let releaseFirst: ((value: unknown) => void) | undefined;
  mockGetSetupOptions.mockResolvedValueOnce({ data: { ...options, manufacturers: [] } });
  mockCreateManufacturer.mockImplementationOnce(() => new Promise(resolve => {
    releaseFirst = resolve;
  }));
  render(<ProductFlow open onClose={jest.fn()} />);
  await screen.findByLabelText('New legal manufacturer name');
  fireEvent.change(screen.getByLabelText('New legal manufacturer name'), {
    target: { value: 'Exact Pharma Laboratories' },
  });
  const button = screen.getByRole('button', { name: 'Add manufacturer' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mockCreateManufacturer).toHaveBeenCalledTimes(1);
  const firstKey = mockCreateManufacturer.mock.calls[0][1];
  releaseFirst?.(Promise.reject({ response: { data: { detail: 'Retry safely' } } }));
  expect(await screen.findByText('Retry safely')).toBeInTheDocument();

  mockCreateManufacturer.mockResolvedValueOnce({ data: {
    manufacturer_party_id: manufacturerId,
    legal_name: 'Exact Pharma Laboratories',
    row_version: 1,
    idempotency_replayed: true,
  } });
  fireEvent.click(screen.getByRole('button', { name: 'Add manufacturer' }));
  await waitFor(() => expect(mockCreateManufacturer).toHaveBeenCalledTimes(2));
  expect(mockCreateManufacturer.mock.calls[1][1]).toBe(firstKey);
  await waitFor(() => expect(screen.getByLabelText(/^Legal manufacturer/)).toHaveValue(manufacturerId));
});
