/* eslint-disable import/first */
jest.mock('../api/modules/purchase/calculations.api', () => ({
  purchaseCalculationsApi: { preview: jest.fn() }
}));
import { purchaseCalculationsApi } from '../api/modules/purchase/calculations.api';
import {
  calculatePurchaseOrderPreview,
  toPurchaseCalculationRequest
} from '../calculations/purchaseOrderCalculationService';


const order = {
  supplier_id: 5,
  discount_amount: 0,
  freight_charges: 0,
  items: [{ product_id: 11, quantity: 2, unit_price: 100, tax_percent: 18 }]
};

test('uses backend purchase preview when online', async () => {
  purchaseCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'IGST',
      calculation_timestamp: 1,
      line_items: [{ taxable_amount: 200, tax_amount: 36, line_total: 200 }],
      totals: { subtotal_amount: 200, tax_amount: 36, total_amount: 236 }
    }
  });

  const result = await calculatePurchaseOrderPreview(order, true);

  expect(purchaseCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    supplier_id: 5,
    items: [expect.objectContaining({ tax_percent: 18 })]
  }));
  expect(result.items[0]).toEqual(expect.objectContaining({ total: 236 }));
  expect(result.totals).toEqual(expect.objectContaining({ net_amount: 236 }));
});

test('blocks unbaselined header discounts online', async () => {
  await expect(calculatePurchaseOrderPreview({ ...order, discount_amount: 10 }, true))
    .rejects.toThrow('header discounts are blocked');
  expect(purchaseCalculationsApi.preview).not.toHaveBeenCalled();
});

test('preserves canonical UUIDv7 supplier and product identifiers', () => {
  const supplierId = '0198ea37-2b1c-7c8d-9123-123456789abc';
  const productId = '0198ea37-2b1d-7c8d-9123-123456789abc';

  expect(toPurchaseCalculationRequest({
    ...order,
    supplier_id: supplierId,
    items: [{ ...order.items[0], product_id: productId }]
  })).toEqual(expect.objectContaining({
    supplier_id: supplierId,
    items: [expect.objectContaining({ product_id: productId })]
  }));
});

test('fails closed instead of calculating business totals offline', async () => {
  await expect(calculatePurchaseOrderPreview(order, false))
    .rejects.toThrow('require the live ERP API');
  expect(purchaseCalculationsApi.preview).not.toHaveBeenCalled();
});
