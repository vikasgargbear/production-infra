import { calculateReturnPreview } from './returnCalculationService';
import { returnCalculationsApi } from '../api/modules/sales/returnCalculations.api';

jest.mock('../api/modules/sales/returnCalculations.api', () => ({
  returnCalculationsApi: { preview: jest.fn() },
}));

describe('return calculation canonical identity projection', () => {
  it('preserves UUIDv7 supplier and product identities in the API preview', async () => {
    (returnCalculationsApi.preview as jest.Mock).mockResolvedValue({ data: {
      gst_type: 'CGST/SGST',
      line_items: [{ taxable_amount: 40, tax_amount: 4.8, total_amount: 44.8 }],
      totals: { subtotal: 40, tax_amount: 4.8, total_amount: 44.8 },
    } });
    const supplierId = 'd3000000-0000-7000-8000-000000000021';
    const productId = 'd3000000-0000-7000-8000-000000000015';

    await calculateReturnPreview({
      supplier_id: supplierId,
      include_gst: true,
      items: [{ selected: true, product_id: productId, return_quantity: 1, unit_price: 40, tax_percent: 12 }],
    }, 'purchase');

    expect(returnCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
      supplier_id: supplierId,
      items: [expect.objectContaining({ product_id: productId, return_quantity: 1 })],
    }));
  });

  it('sends the edited paid/free split instead of the original invoice quantities', async () => {
    (returnCalculationsApi.preview as jest.Mock).mockResolvedValue({ data: {
      gst_type: 'CGST/SGST',
      line_items: [{ taxable_amount: 100, tax_amount: 12, total_amount: 112 }],
      totals: { subtotal: 100, tax_amount: 12, total_amount: 112 },
    } });

    await calculateReturnPreview({
      customer_id: 'd3000000-0000-7000-8000-000000000021',
      items: [{
        selected: true,
        product_id: 'd3000000-0000-7000-8000-000000000015',
        return_quantity: 2,
        return_paid_qty: 1,
        return_free_qty: 1,
        paid_quantity: 5,
        free_quantity: 2,
        unit_price: 100,
        tax_percent: 12,
      }],
    }, 'sales');

    expect(returnCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        return_quantity: 2,
        paid_quantity: 1,
        free_quantity: 1,
        tax_percent: 12,
      })],
    }));
  });
});
