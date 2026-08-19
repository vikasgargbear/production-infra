/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  challanCalculationsApi: { preview: jest.fn() }
}));
jest.mock('../enterpriseCalculator', () => ({
  __esModule: true,
  default: { calculateChallan: jest.fn() }
}));

import EnterpriseCalculator from '../enterpriseCalculator';
import { challanCalculationsApi } from '../api/modules/sales/calculations.api';
import { calculateChallanPreview } from '../calculations/challanCalculationService';


const challan = {
  customer_id: 7,
  freight_charges: 5,
  items: [{ product_id: 3, quantity: 2, unit_price: 100, gst_percent: 18 }]
};

test('uses backend challan preview and maps authoritative lines online', async () => {
  challanCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'CGST/SGST',
      calculation_timestamp: 1,
      line_items: [{ taxable_amount: 200, total_tax_amount: 36, line_total: 236 }],
      totals: { taxable_amount: 200, total_tax_amount: 36, final_amount: 241 }
    }
  });

  const result = await calculateChallanPreview(challan, true);

  expect(challanCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    customer_id: 7,
    freight_charges: 5,
    items: [expect.objectContaining({ gst_percent: 18 })]
  }));
  expect(EnterpriseCalculator.calculateChallan).not.toHaveBeenCalled();
  expect(result.items[0].line_total).toBe(236);
  expect(result.totals.final_amount).toBe(241);
});

test('uses local challan calculation only when explicitly offline', async () => {
  EnterpriseCalculator.calculateChallan.mockReturnValue({
    items: [{ line_total: 200 }],
    totals: { final_amount: 200 }
  });

  await calculateChallanPreview(challan, false);

  expect(EnterpriseCalculator.calculateChallan).toHaveBeenCalledWith(challan);
  expect(challanCalculationsApi.preview).not.toHaveBeenCalled();
});
