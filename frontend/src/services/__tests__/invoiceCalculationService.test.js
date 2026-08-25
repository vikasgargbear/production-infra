/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  invoiceCalculationsApi: { preview: jest.fn() }
}));

import { calculateInvoicePreview, normalizeInvoicePreview } from '../calculations/invoiceCalculationService';
import { invoiceCalculationsApi } from '../api/modules/sales/calculations.api';
import { exactInvoiceResponse, exactSalesLine } from './exactCalculationFixtures';

const customerId = '10000000-0000-7000-8000-000000000001';
const productId = '10000000-0000-7000-8000-000000000002';
const invoice = (items = [{ product_id: productId, quantity: '1.000000', unit_price: '0.100000', gst_percent: '18.000000' }]) => ({
  customer_details: { customer_id: customerId },
  gst_type: 'CGST/SGST',
  freight_charges: '0.00',
  discount_type: 'percentage',
  discount_percent: '0.000000',
  discount_amount: '0.00',
  items: items.map(item => ({
    free_quantity: '0.000000',
    free_supply_tax_treatment: 'excluded_from_taxable_value',
    discount_percent: '0.000000',
    gst_percent: '18.000000',
    ...item,
  })),
});

beforeEach(() => jest.clearAllMocks());

test('keeps authoritative 0.10 + 0.20 line totals exact', () => {
  const response = exactInvoiceResponse({
    line_items: [
      exactSalesLine(),
      exactSalesLine({ subtotal: '0.20', taxable_amount: '0.20', cgst_amount: '0.02', sgst_amount: '0.02', total_tax: '0.04', total_tax_amount: '0.04', line_total: '0.24' }),
    ],
    totals: {
      ...exactInvoiceResponse().totals,
      subtotal_amount: '0.30', taxable_amount: '0.30', cgst_amount: '0.03', sgst_amount: '0.03', total_tax_amount: '0.06', final_amount: '0.36',
    },
  });
  const result = normalizeInvoicePreview(invoice([
    { product_id: productId, quantity: '1.000000', unit_price: '0.100000' },
    { product_id: productId, quantity: '1.000000', unit_price: '0.200000' },
  ]), response);
  expect(result.totals.subtotal_amount).toBe('0.30');
  expect(result.totals.final_amount).toBe('0.36');
});

test('preserves six-place quantity and a rate above 2^53 in the request', async () => {
  invoiceCalculationsApi.preview.mockResolvedValue({ data: exactInvoiceResponse({
    line_items: [exactSalesLine({ quantity: '0.123456' })],
  }) });
  await calculateInvoicePreview(invoice([{
    product_id: productId,
    quantity: '0.123456',
    unit_price: '9007199254740993.000000',
    gst_percent: '18.000000',
  }]), true);
  expect(invoiceCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    items: [expect.objectContaining({
      quantity: '0.123456',
      unit_price: '9007199254740993.000000',
    })],
  }));
});

test.each([
  ['numeric JSON', { ...exactSalesLine(), quantity: 1 }],
  ['overprecision', { ...exactSalesLine(), quantity: '1.0000001' }],
])('fails closed on %s authoritative decimals', async (_label, line) => {
  invoiceCalculationsApi.preview.mockResolvedValue({ data: exactInvoiceResponse({ line_items: [line] }) });
  await expect(calculateInvoicePreview(invoice(), true)).rejects.toThrow(/exact decimal string|precision/);
});

test('fails closed offline without transport', async () => {
  await expect(calculateInvoicePreview(invoice(), false)).rejects.toThrow('live ERP API');
  expect(invoiceCalculationsApi.preview).not.toHaveBeenCalled();
});
