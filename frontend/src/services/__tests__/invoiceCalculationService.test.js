jest.mock('../api/modules/sales/calculations.api', () => ({
  invoiceCalculationsApi: { preview: jest.fn() }
}));

import { normalizeInvoicePreview } from '../calculations/invoiceCalculationService';
import { calculateInvoicePreview } from '../calculations/invoiceCalculationService';
import { invoiceCalculationsApi } from '../api/modules/sales/calculations.api';


test('normalizes canonical backend invoice totals for the invoice UI', () => {
  const result = normalizeInvoicePreview(
    { items: [{ product_id: 7, quantity: 2, unit_price: 100 }] },
    {
      success: true,
      gst_type: 'IGST',
      calculation_timestamp: 1,
      line_items: [{
        subtotal: 200,
        discount_amount: 20,
        taxable_amount: 180,
        total_tax_amount: 32.4,
        line_total: 212.4
      }],
      totals: {
        subtotal_amount: 200,
        discount_amount: 20,
        scheme_discount: 0,
        taxable_amount: 180,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 32.4,
        total_tax_amount: 32.4,
        round_off_amount: -0.4,
        final_amount: 212
      }
    }
  );

  expect(result.gst_type).toBe('IGST');
  expect(result.items[0]).toEqual(expect.objectContaining({
    product_id: 7,
    gst_amount: 32.4,
    total_amount: 212.4
  }));
  expect(result.totals).toEqual(expect.objectContaining({
    gross_amount: 200,
    taxable_amount: 180,
    total_gst: 32.4,
    igst_total: 32.4,
    net_amount: 212.4,
    final_amount: 212
  }));
});

test('preserves canonical UUID IDs in the online calculation request', async () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';
  invoiceCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'CGST/SGST',
      calculation_timestamp: 1,
      line_items: [{ line_total: 150, total_tax_amount: 0 }],
      totals: {
        subtotal_amount: 150,
        discount_amount: 0,
        scheme_discount: 0,
        taxable_amount: 150,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_tax_amount: 0,
        round_off_amount: 0,
        final_amount: 150
      }
    }
  });

  await calculateInvoicePreview({
    customer_details: { customer_id: customerId },
    gst_type: 'CGST/SGST',
    items: [{ product_id: productId, quantity: 1, unit_price: 150 }]
  }, true);

  expect(invoiceCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    customer_id: customerId,
    items: [expect.objectContaining({ product_id: productId })]
  }));
});
