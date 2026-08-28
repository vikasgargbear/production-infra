/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  salesOrderCalculationsApi: { preview: jest.fn() }
}));

import {
  calculateSalesOrderPreview,
  isSalesOrderPreviewReady,
} from '../calculations/salesOrderCalculationService';
import { salesOrderCalculationsApi } from '../api/modules/sales/calculations.api';
import { exactInvoiceResponse, exactSalesLine } from './exactCalculationFixtures';

const order = {
  customer_id: '10000000-0000-7000-8000-000000000001',
  order_date: '2026-08-25',
  gst_type: 'CGST/SGST',
  delivery_charges: 0,
  other_charges: 0,
  document_discount_amount: '0.00',
  discount_amount: '17.25',
  items: [{
    product_id: '10000000-0000-7000-8000-000000000002',
    branch_id: '10000000-0000-7000-8000-000000000003',
    quantity: '0.123456', free_quantity: '0', unit_price: '9007199254740993.000000',
    discount_percent: '0', gst_percent: '18', free_supply_tax_treatment: 'excluded_from_taxable_value',
  }],
};
const policy = { default_rounding_policy: 'none' };

beforeEach(() => jest.clearAllMocks());

test('preserves UUIDs, six-place quantities and >2^53 rates into exact API strings', async () => {
  salesOrderCalculationsApi.preview.mockResolvedValue({ data: exactInvoiceResponse({
    line_items: [exactSalesLine({ quantity: '0.123456' })],
  }) });
  const result = await calculateSalesOrderPreview(order, true, policy);
  expect(salesOrderCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    branch_id: order.items[0].branch_id,
    customer_id: order.customer_id,
    discount_amount: '0.00',
    rounding_policy: 'none',
    items: [expect.objectContaining({ quantity: '0.123456', unit_price: '9007199254740993.000000' })],
  }));
  expect(salesOrderCalculationsApi.preview.mock.calls[0][0].items[0]).not.toHaveProperty('tax_percent');
  expect(result.totals.final_amount).toBe('0.12');
});

test('rejects blank customer sentinel before transport', async () => {
  await expect(calculateSalesOrderPreview({ ...order, customer_id: 0 }, true, policy)).rejects.toThrow(/canonical UUID/);
  expect(salesOrderCalculationsApi.preview).not.toHaveBeenCalled();
});

test('keeps zero billed-quantity drafts out of the calculation transport', async () => {
  const zeroQuantityOrder = {
    ...order,
    items: [{ ...order.items[0], quantity: '0.000000', free_quantity: '0.000000' }],
  };

  expect(isSalesOrderPreviewReady(zeroQuantityOrder, policy)).toBe(false);
  await expect(calculateSalesOrderPreview(zeroQuantityOrder, true, policy)).rejects.toThrow(
    'Sales order calculation items[0].quantity must be greater than zero.',
  );
  expect(salesOrderCalculationsApi.preview).not.toHaveBeenCalled();
});

test('recognizes a complete positive sales-order draft as preview-ready', () => {
  expect(isSalesOrderPreviewReady(order, policy)).toBe(true);
});

test('rejects numeric authoritative response decimals', async () => {
  salesOrderCalculationsApi.preview.mockResolvedValue({ data: exactInvoiceResponse({
    line_items: [exactSalesLine({ quantity: 0.123456 })],
  }) });
  await expect(calculateSalesOrderPreview(order, true, policy)).rejects.toThrow('exact decimal string');
});
