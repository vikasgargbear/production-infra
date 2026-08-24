/* eslint-disable import/first */
jest.mock('../api/modules/purchase/calculations.api', () => ({
  purchaseCalculationsApi: { preview: jest.fn() }
}));

import { purchaseCalculationsApi } from '../api/modules/purchase/calculations.api';
import { calculatePurchaseOrderPreview, toPurchaseCalculationRequest } from '../calculations/purchaseOrderCalculationService';
import { exactPurchaseResponse } from './exactCalculationFixtures';

const order = {
  supplier_id: '10000000-0000-7000-8000-000000000001',
  discount_amount: '0.00', freight_charges: '0.00', insurance_charges: '0.00', other_charges: '0.00',
  items: [{
    product_id: '10000000-0000-7000-8000-000000000002',
    quantity: '0.123456', unit_price: '9007199254740993.000000', mrp: '9007199254740993.000000',
    discount_percent: '0', tax_percent: '18',
  }],
};

beforeEach(() => jest.clearAllMocks());

test('keeps six-place quantities and >2^53 rates in purchase requests', async () => {
  purchaseCalculationsApi.preview.mockResolvedValue({ data: exactPurchaseResponse({
    line_items: [{ ...exactPurchaseResponse().line_items[0], quantity: '0.123456' }],
  }) });
  const result = await calculatePurchaseOrderPreview(order, true);
  expect(purchaseCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    items: [expect.objectContaining({ quantity: '0.123456', unit_price: '9007199254740993.000000' })],
  }));
  expect(result.items[0].total).toBe('0.12');
  expect(result.totals.final_amount).toBe('0.00');
});

test('preserves UUIDv7 identities without numeric coercion', () => {
  expect(toPurchaseCalculationRequest(order)).toEqual(expect.objectContaining({
    supplier_id: order.supplier_id,
    items: [expect.objectContaining({ product_id: order.items[0].product_id })],
  }));
});

test.each([1, '0.1234567'])('rejects invalid authoritative quantity %p', async quantity => {
  purchaseCalculationsApi.preview.mockResolvedValue({ data: exactPurchaseResponse({
    line_items: [{ ...exactPurchaseResponse().line_items[0], quantity }],
  }) });
  await expect(calculatePurchaseOrderPreview({ ...order, items: [{ ...order.items[0], quantity: '1.000000' }] }, true))
    .rejects.toThrow(/exact decimal string|precision/);
});

test('blocks header discounts and offline calculation', async () => {
  await expect(calculatePurchaseOrderPreview({ ...order, discount_amount: '0.01' }, true)).rejects.toThrow('header discounts');
  await expect(calculatePurchaseOrderPreview(order, false)).rejects.toThrow('live ERP API');
  expect(purchaseCalculationsApi.preview).not.toHaveBeenCalled();
});
