/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  challanCalculationsApi: { preview: jest.fn() }
}));

import { challanCalculationsApi } from '../api/modules/sales/calculations.api';
import { calculateChallanPreview } from '../calculations/challanCalculationService';
import { exactChallanResponse, exactSalesLine } from './exactCalculationFixtures';

const challan = {
  customer_id: '10000000-0000-7000-8000-000000000001',
  gst_type: 'CGST/SGST', freight_charges: '0.00',
  items: [{
    product_id: '10000000-0000-7000-8000-000000000002',
    quantity: '0.123456', free_quantity: '0', unit_price: '9007199254740993.000000',
    discount_percent: '0', gst_percent: '18',
  }],
};

beforeEach(() => jest.clearAllMocks());

test('preserves exact request decimals and maps authoritative strings', async () => {
  challanCalculationsApi.preview.mockResolvedValue({ data: exactChallanResponse({
    line_items: [exactSalesLine({ quantity: '0.123456' })],
  }) });
  const result = await calculateChallanPreview(challan, true);
  expect(challanCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    items: [expect.objectContaining({ quantity: '0.123456', unit_price: '9007199254740993.000000' })],
  }));
  expect(result.items[0].line_total).toBe('0.12');
  expect(result.totals.final_amount).toBe('0.12');
});

test.each([1, '1.0000001'])('rejects invalid authoritative quantity %p', async quantity => {
  challanCalculationsApi.preview.mockResolvedValue({ data: exactChallanResponse({
    line_items: [exactSalesLine({ quantity })],
  }) });
  await expect(calculateChallanPreview({ ...challan, items: [{ ...challan.items[0], quantity: '1.000000' }] }, true))
    .rejects.toThrow(/exact decimal string|precision/);
});

test('fails closed offline', async () => {
  await expect(calculateChallanPreview(challan, false)).rejects.toThrow('live API');
  expect(challanCalculationsApi.preview).not.toHaveBeenCalled();
});
