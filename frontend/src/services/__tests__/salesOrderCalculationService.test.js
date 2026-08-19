/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  salesOrderCalculationsApi: { preview: jest.fn() }
}));
jest.mock('../enterpriseCalculator', () => ({
  __esModule: true,
  default: { calculateSalesOrder: jest.fn() }
}));

import EnterpriseCalculator from '../enterpriseCalculator';
import { salesOrderCalculationsApi } from '../api/modules/sales/calculations.api';
import { calculateSalesOrderPreview } from '../calculations/salesOrderCalculationService';


const order = {
  customer_id: 5,
  order_date: '2026-08-19',
  gst_type: 'IGST',
  delivery_charges: 12,
  other_charges: 0,
  items: [{
    product_id: 11,
    quantity: 2,
    free_quantity: 0,
    unit_price: 100,
    discount_percent: 5,
    gst_percent: 18
  }]
};


test('uses authenticated backend preview when online', async () => {
  salesOrderCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'IGST',
      calculation_timestamp: 1,
      line_items: [{
        taxable_amount: 190,
        total_tax_amount: 34.2,
        line_total: 224.2
      }],
      totals: {
        subtotal_amount: 200,
        discount_amount: 10,
        total_tax_amount: 34.2,
        round_off_amount: -0.2,
        final_amount: 236
      }
    }
  });

  const result = await calculateSalesOrderPreview(order, true);

  expect(salesOrderCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    customer_id: 5,
    delivery_charges: 12,
    items: [expect.objectContaining({ tax_percent: 18 })]
  }));
  expect(EnterpriseCalculator.calculateSalesOrder).not.toHaveBeenCalled();
  expect(result.items[0]).toEqual(expect.objectContaining({ tax_amount: 34.2, total: 224.2 }));
  expect(result.totals).toEqual(expect.objectContaining({ tax_amount: 34.2, total_amount: 236 }));
});


test('uses deterministic local calculation only when explicitly offline', async () => {
  EnterpriseCalculator.calculateSalesOrder.mockReturnValue({
    items: [{ total_amount: 224.2 }],
    totals: { final_amount: 224 }
  });

  const result = await calculateSalesOrderPreview(order, false);

  expect(EnterpriseCalculator.calculateSalesOrder).toHaveBeenCalledWith(order);
  expect(salesOrderCalculationsApi.preview).not.toHaveBeenCalled();
  expect(result.gst_type).toBe('IGST');
});
