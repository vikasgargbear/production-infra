/* eslint-disable import/first */
jest.mock('../api/modules/purchase/calculations.api', () => ({
  purchaseCalculationsApi: { preview: jest.fn() }
}));
jest.mock('../enterpriseCalculator', () => ({
  __esModule: true,
  default: { calculateTotals: jest.fn() }
}));

import EnterpriseCalculator from '../enterpriseCalculator';
import { purchaseCalculationsApi } from '../api/modules/purchase/calculations.api';
import { calculatePurchaseOrderPreview } from '../calculations/purchaseOrderCalculationService';


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
  expect(EnterpriseCalculator.calculateTotals).not.toHaveBeenCalled();
  expect(result.items[0]).toEqual(expect.objectContaining({ total: 236 }));
  expect(result.totals).toEqual(expect.objectContaining({ net_amount: 236 }));
});

test('blocks unbaselined header discounts online', async () => {
  await expect(calculatePurchaseOrderPreview({ ...order, discount_amount: 10 }, true))
    .rejects.toThrow('header discounts are blocked');
  expect(purchaseCalculationsApi.preview).not.toHaveBeenCalled();
});

test('uses local calculation only when explicitly offline', async () => {
  EnterpriseCalculator.calculateTotals.mockReturnValue({ items: [], totals: { total_amount: 236 } });

  await calculatePurchaseOrderPreview(order, false);

  expect(EnterpriseCalculator.calculateTotals).toHaveBeenCalled();
  expect(purchaseCalculationsApi.preview).not.toHaveBeenCalled();
});
