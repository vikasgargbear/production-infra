/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  salesOrderCalculationsApi: { preview: jest.fn() }
}));

import { calculateSalesOrderPreview } from '../calculations/salesOrderCalculationService';
import { salesOrderCalculationsApi } from '../api/modules/sales/calculations.api';
import { exactInvoiceResponse, exactSalesLine } from './exactCalculationFixtures';

const order = {
  customer_id: '10000000-0000-7000-8000-000000000001',
  order_date: '2026-08-25',
  gst_type: 'CGST/SGST',
  delivery_charges: 0,
  other_charges: 0,
  discount_amount: 0,
  items: [{
    product_id: '10000000-0000-7000-8000-000000000002',
    branch_id: '10000000-0000-7000-8000-000000000003',
    quantity: '0.123456', free_quantity: '0', unit_price: '9007199254740993.000000',
    discount_percent: '0', gst_percent: '18', free_supply_tax_treatment: 'excluded_from_taxable_value',
  }],
};

beforeEach(() => jest.clearAllMocks());

test('preserves UUIDs, six-place quantities and >2^53 rates into exact API strings', async () => {
  salesOrderCalculationsApi.preview.mockResolvedValue({ data: exactInvoiceResponse({
    line_items: [exactSalesLine({ quantity: '0.123456' })],
  }) });
  const result = await calculateSalesOrderPreview(order, true);
  expect(salesOrderCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    branch_id: order.items[0].branch_id,
    customer_id: order.customer_id,
    items: [expect.objectContaining({ quantity: '0.123456', unit_price: '9007199254740993.000000' })],
  }));
  expect(salesOrderCalculationsApi.preview.mock.calls[0][0].items[0]).not.toHaveProperty('tax_percent');
  expect(result.totals.final_amount).toBe('0.12');
});

test('rejects blank customer sentinel before transport', async () => {
  await expect(calculateSalesOrderPreview({ ...order, customer_id: 0 }, true)).rejects.toThrow(/canonical UUID/);
  expect(salesOrderCalculationsApi.preview).not.toHaveBeenCalled();
});

test('rejects numeric authoritative response decimals', async () => {
  salesOrderCalculationsApi.preview.mockResolvedValue({ data: exactInvoiceResponse({
    line_items: [exactSalesLine({ quantity: 0.123456 })],
  }) });
  await expect(calculateSalesOrderPreview(order, true)).rejects.toThrow('exact decimal string');
});
