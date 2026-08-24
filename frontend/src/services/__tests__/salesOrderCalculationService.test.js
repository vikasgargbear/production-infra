/* eslint-disable import/first */
jest.mock('../api/modules/sales/calculations.api', () => ({
  salesOrderCalculationsApi: { preview: jest.fn() }
}));
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
  expect(result.items[0]).toEqual(expect.objectContaining({ tax_amount: 34.2, total: 224.2 }));
  expect(result.totals).toEqual(expect.objectContaining({ tax_amount: 34.2, total_amount: 236 }));
});


test('fails closed instead of calculating an offline preview', async () => {
  await expect(calculateSalesOrderPreview(order, false)).rejects.toThrow(
    'Sales order preview requires the live API'
  );
  expect(salesOrderCalculationsApi.preview).not.toHaveBeenCalled();
});

test('does not send the blank-order customer sentinel to the API', async () => {
  await expect(calculateSalesOrderPreview({ ...order, customer_id: 0 }, true)).rejects.toThrow(
    'Select a valid customer before calculating a sales order'
  );
  expect(salesOrderCalculationsApi.preview).not.toHaveBeenCalled();
});

test('preserves canonical UUID identities in the server request', async () => {
  salesOrderCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'CGST/SGST',
      calculation_timestamp: 1,
      line_items: [{ total_tax_amount: 12, line_total: 112 }],
      totals: { total_tax_amount: 12, final_amount: 112 }
    }
  });
  const canonicalOrder = {
    ...order,
    customer_id: '10000000-0000-4000-8000-000000000001',
    gst_type: 'CGST/SGST',
    items: [{
      ...order.items[0],
      product_id: '10000000-0000-4000-8000-000000000002',
      batch_id: '10000000-0000-4000-8000-000000000003',
      free_quantity: 1,
      free_supply_tax_treatment: 'included_at_unit_rate'
    }]
  };

  const result = await calculateSalesOrderPreview(canonicalOrder, true);

  expect(salesOrderCalculationsApi.preview).toHaveBeenCalledWith({
    customer_id: canonicalOrder.customer_id,
    gst_type: 'CGST/SGST',
    order_date: '2026-08-19',
    delivery_date: undefined,
    items: [{
      product_id: canonicalOrder.items[0].product_id,
      batch_id: canonicalOrder.items[0].batch_id,
      batch_number: undefined,
      quantity: 2,
      free_quantity: 1,
      free_supply_tax_treatment: 'included_at_unit_rate',
      unit_price: 100,
      mrp: 100,
      discount_percent: 5,
      tax_percent: 18,
      uom: undefined,
      pack_type: undefined
    }],
    delivery_charges: 12,
    other_charges: 0
  });
  expect(salesOrderCalculationsApi.preview.mock.calls[0][0].items[0]).not.toHaveProperty(
    'gst_type'
  );
  expect(result.items[0]).toEqual(expect.objectContaining({
    product_id: canonicalOrder.items[0].product_id,
    batch_id: canonicalOrder.items[0].batch_id,
    free_quantity: 1,
    free_supply_tax_treatment: 'included_at_unit_rate'
  }));
  expect(result.totals).toEqual({
    total_tax_amount: 12,
    final_amount: 112,
    tax_amount: 12,
    total_amount: 112,
    round_off: undefined
  });
});
