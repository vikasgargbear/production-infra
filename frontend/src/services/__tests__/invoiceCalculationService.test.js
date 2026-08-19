jest.mock('../api/modules/sales/calculations.api', () => ({
  invoiceCalculationsApi: { preview: jest.fn() }
}));

import { normalizeInvoicePreview } from '../calculations/invoiceCalculationService';


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
