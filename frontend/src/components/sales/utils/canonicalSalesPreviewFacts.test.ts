import {
  canonicalDispatchPreviewUnavailableReason,
  canonicalInvoicePreviewUnavailableReason,
  canonicalOrderPreviewUnavailableReason,
} from './canonicalSalesPreviewFacts';

const id = (suffix: string) => `10000000-0000-7000-8000-${suffix.padStart(12, '0')}`;

const invoice = {
  items: [{
    quantity: '1.000000', free_quantity: '0.000000', unit_price: '100.0000',
    discount_percent: '0.000000', gst_percent: '12.000000',
    taxable_amount: '100.00', cgst_amount: '6.00', sgst_amount: '6.00',
    igst_amount: '0.00', total_tax_amount: '12.00', line_total: '112.00',
  }],
  totals: {
    subtotal_amount: '100.00', discount_amount: '0.00', scheme_discount: '0.00',
    taxable_amount: '100.00', cgst_amount: '6.00', sgst_amount: '6.00',
    igst_amount: '0.00', total_tax_amount: '12.00', freight_charges: '0.00',
    round_off_amount: '0.00', final_amount: '112.00',
  },
};

const order = {
  items: [{ calculated_total: '112.00', taxable_amount: '100.00', tax_amount: '12.00' }],
  subtotal_amount: '100.00', discount_amount: '0.00', tax_amount: '12.00',
  cgst_amount: '6.00', sgst_amount: '6.00', igst_amount: '0.00', total_amount: '112.00',
};

const dispatch = {
  source_order_id: id('1'), customer_name: 'Canonical Customer',
  items: [{
    source_order_line_id: id('2'), product_id: id('3'), branch_id: id('4'),
    location_id: id('5'), batch_id: id('6'), product_name: 'Canonical Product',
    batch_number: 'BATCH-1', uom_code: 'EA', quantity: '2.000000', free_quantity: '1.000000',
  }],
};

describe('canonical desktop sales preview facts', () => {
  it('accepts complete exact invoice, order, and dispatch projections', () => {
    expect(canonicalInvoicePreviewUnavailableReason(invoice)).toBeNull();
    expect(canonicalOrderPreviewUnavailableReason(order)).toBeNull();
    expect(canonicalDispatchPreviewUnavailableReason(dispatch)).toBeNull();
  });

  it.each([
    ['invoice line GST', { ...invoice, items: [{ ...invoice.items[0], gst_percent: undefined }] }, /gst percent is unavailable/i],
    ['invoice line total', { ...invoice, items: [{ ...invoice.items[0], line_total: 0 }] }, /line total is unavailable/i],
    ['invoice tax split', { ...invoice, totals: { ...invoice.totals, cgst_amount: undefined } }, /cgst amount is unavailable/i],
    ['order amount', { ...order, total_amount: undefined }, /total amount is unavailable/i],
    ['order line tax', { ...order, items: [{ ...order.items[0], tax_amount: undefined }] }, /tax amount is unavailable/i],
  ])('fails closed when %s is missing or non-authoritative', (_label, candidate, message) => {
    const reason = _label.startsWith('invoice')
      ? canonicalInvoicePreviewUnavailableReason(candidate)
      : canonicalOrderPreviewUnavailableReason(candidate);
    expect(reason).toMatch(message);
  });

  it('treats dispatch as inventory evidence and never requires invented selling or tax totals', () => {
    expect(canonicalDispatchPreviewUnavailableReason({
      ...dispatch,
      total_amount: undefined,
      taxable_amount: undefined,
      total_tax_amount: undefined,
    })).toBeNull();
  });

  it.each([
    ['order identity', { ...dispatch, source_order_id: '' }],
    ['batch identity', { ...dispatch, items: [{ ...dispatch.items[0], batch_id: '' }] }],
    ['free quantity', { ...dispatch, items: [{ ...dispatch.items[0], free_quantity: undefined }] }],
  ])('blocks dispatch when canonical %s is absent', (_label, candidate) => {
    expect(canonicalDispatchPreviewUnavailableReason(candidate)).toMatch(/unavailable/i);
  });
});
