/* eslint-disable import/first */
jest.mock('../api/modules/sales/returnCalculations.api', () => ({
  returnCalculationsApi: { preview: jest.fn() }
}));
import { returnCalculationsApi } from '../api/modules/sales/returnCalculations.api';
import { calculateReturnPreview } from '../calculations/returnCalculationService';


const salesReturn = {
  customer_id: 5,
  withhold_gst: true,
  items: [{
    product_id: 11,
    selected: true,
    return_quantity: 3,
    paid_quantity: 2,
    free_quantity: 1,
    unit_price: 100,
    tax_percent: 18
  }]
};

test('uses backend return preview and maps GST withholding when online', async () => {
  returnCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'IGST',
      calculation_timestamp: 1,
      line_items: [{ taxable_amount: 200, tax_amount: 0, total_amount: 200 }],
      totals: { subtotal: 200, tax_amount: 0, total_amount: 200 }
    }
  });

  const result = await calculateReturnPreview(salesReturn, 'sales');

  expect(returnCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    return_type: 'sales',
    customer_id: 5,
    include_gst: false,
    items: [expect.objectContaining({ return_quantity: 3, free_quantity: 1 })]
  }));
  expect(result.totals).toEqual(expect.objectContaining({ final_amount: 200 }));
});

test('fails closed when the authoritative return preview is unavailable', async () => {
  returnCalculationsApi.preview.mockRejectedValueOnce(new Error('API unavailable'));

  await expect(calculateReturnPreview({ items: [] }, 'purchase')).rejects.toThrow(
    'API unavailable'
  );
});
