/* eslint-disable import/first */
jest.mock('../api/modules/sales/returnCalculations.api', () => ({
  returnCalculationsApi: { preview: jest.fn() }
}));
import { returnCalculationsApi } from '../api/modules/sales/returnCalculations.api';
import { calculateReturnPreview } from '../calculations/returnCalculationService';


const salesReturn = {
  customer_id: 'd3000000-0000-7000-8000-000000000021',
  withhold_gst: true,
  items: [{
    product_id: 'd3000000-0000-7000-8000-000000000015',
    selected: true,
    return_quantity: '3.000000',
    return_paid_qty: '2.000000',
    return_free_qty: '1.000000',
    unit_price: '100.000000',
    tax_percent: '18.000000'
  }]
};

test('uses backend return preview and maps GST withholding when online', async () => {
  returnCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'IGST',
      calculation_timestamp: 1,
      line_items: [{
        return_quantity: '3.000000', taxable_quantity: '2.000000',
        unit_price: '100.000000', discount_percent: '0.000000', discount_amount: '0.00',
        tax_percent: '0.000000', taxable_amount: '200.00', cgst_amount: '0.00',
        sgst_amount: '0.00', igst_amount: '0.00', tax_amount: '0.00', total_amount: '200.00'
      }],
      totals: {
        subtotal: '200.00', tax_amount: '0.00', cgst_amount: '0.00', sgst_amount: '0.00',
        igst_amount: '0.00', round_off_amount: '0.00', total_amount: '200.00',
        total_return_quantity: '3.000000'
      }
    }
  });

  const result = await calculateReturnPreview(salesReturn, 'sales');

  expect(returnCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    return_type: 'sales',
    customer_id: 'd3000000-0000-7000-8000-000000000021',
    include_gst: false,
    items: [expect.objectContaining({ return_quantity: '3.000000', free_quantity: '1.000000' })]
  }));
  expect(result.totals).toEqual(expect.objectContaining({ final_amount: '200.00' }));
});

test('fails closed when the authoritative return preview is unavailable', async () => {
  returnCalculationsApi.preview.mockRejectedValueOnce(new Error('API unavailable'));

  await expect(calculateReturnPreview(salesReturn, 'purchase')).rejects.toThrow(
    'API unavailable'
  );
});
