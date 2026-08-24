/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  challanCalculationsApi: { preview: jest.fn() }
}));
import { challanCalculationsApi } from '../api/modules/sales/calculations.api';
import { calculateChallanPreview } from '../calculations/challanCalculationService';


const challan = {
  customer_id: 7,
  freight_charges: 5,
  items: [{ product_id: 3, quantity: 2, free_quantity: 0, unit_price: 100,
    gst_percent: 18, free_supply_tax_treatment: 'excluded_from_taxable_value' }]
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
  expect(result.items[0].line_total).toBe(236);
  expect(result.totals.final_amount).toBe(241);
});

test('fails closed instead of calculating an offline challan preview', async () => {
  await expect(calculateChallanPreview(challan, false)).rejects.toThrow(
    'Delivery challan preview requires the live API'
  );
  expect(challanCalculationsApi.preview).not.toHaveBeenCalled();
});

test('preserves canonical UUIDs, free quantity, and included-at-rate treatment', async () => {
  challanCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'CGST/SGST',
      calculation_timestamp: 1,
      line_items: [{ taxable_amount: 200, total_tax_amount: 24, line_total: 224 }],
      totals: { taxable_amount: 200, total_tax_amount: 24, final_amount: 224 }
    }
  });
  const canonicalChallan = {
    ...challan,
    customer_id: '10000000-0000-7000-8000-000000000001',
    items: [{
      ...challan.items[0],
      product_id: '10000000-0000-7000-8000-000000000002',
      quantity: 1,
      free_quantity: 1,
      free_supply_tax_treatment: 'included_at_unit_rate'
    }]
  };

  const result = await calculateChallanPreview(canonicalChallan, true);

  expect(challanCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    customer_id: canonicalChallan.customer_id,
    items: [expect.objectContaining({
      product_id: canonicalChallan.items[0].product_id,
      quantity: 1,
      free_quantity: 1,
      free_supply_tax_treatment: 'included_at_unit_rate'
    })]
  }));
  expect(result.items[0]).toEqual(expect.objectContaining({
    product_id: canonicalChallan.items[0].product_id,
    free_quantity: 1,
    free_supply_tax_treatment: 'included_at_unit_rate'
  }));
});
