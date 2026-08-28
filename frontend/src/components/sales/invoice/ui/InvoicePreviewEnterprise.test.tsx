import { render, screen } from '@testing-library/react';

import InvoicePreviewEnterprise from './InvoicePreviewEnterprise';

const id = (suffix: string) => `10000000-0000-7000-8000-${suffix.padStart(12, '0')}`;

describe('InvoicePreviewEnterprise exact rate display', () => {
  it('renders imported four-decimal rate and MRP as two-decimal currency without changing totals', () => {
    render(
      <InvoicePreviewEnterprise
        companyInfo={{ name: 'Canonical Seller Private Limited' }}
        invoice={{
          invoice_number: '',
          invoice_date: '2026-08-29',
          customer_name: 'Canonical Buyer',
          customer_details: { customer_name: 'Canonical Buyer' },
          gst_type: 'CGST/SGST',
          items: [{
            product_id: id('1'),
            product_name: 'Imported Medicine',
            batch_id: id('2'),
            batch_number: 'DEMO-BATCH-1',
            expiry_date: '2028-09-01',
            quantity: '2.000000',
            free_quantity: '0.000000',
            unit_price: '95.2381',
            mrp: '100.0000',
            discount_percent: '0.000000',
            gst_percent: '12.000000',
            taxable_amount: '190.48',
            cgst_amount: '11.43',
            sgst_amount: '11.43',
            igst_amount: '0.00',
            total_tax_amount: '22.86',
            line_total: '213.34',
          }],
          totals: {
            subtotal_amount: '190.48',
            discount_amount: '0.00',
            scheme_discount: '0.00',
            taxable_amount: '190.48',
            cgst_amount: '11.43',
            sgst_amount: '11.43',
            igst_amount: '0.00',
            total_tax_amount: '22.86',
            freight_charges: '0.00',
            round_off_amount: '0.00',
            final_amount: '213.34',
          },
        } as any}
      />,
    );

    expect(screen.getByText('Imported Medicine')).not.toBeNull();
    expect(screen.getByText('₹95.24')).not.toBeNull();
    expect(screen.getByText('₹100.00')).not.toBeNull();
    expect(screen.getAllByText('₹213.34').length).toBeGreaterThan(0);
  });
});
