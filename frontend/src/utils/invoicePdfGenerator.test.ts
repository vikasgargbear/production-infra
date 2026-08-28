import { generateInvoiceHTML, InvoiceData } from './invoicePdfGenerator';

jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));

const invoice = (): InvoiceData => ({
  invoice_number: 'INV-2026-1',
  invoice_date: '2026-08-25',
  status: 'posted',
  seller_legal_name: 'Canonical Seller Private Limited',
  seller_gstin: '27ABCDE1234F1Z5',
  seller_address: 'Seller Lane\nMumbai',
  customer_name: 'Canonical Buyer',
  customer_phone: undefined,
  customer_gst_number: undefined,
  billing_address: 'Buyer Lane\nPune',
  shipping_address: 'Buyer Lane\nPune',
  items: [{
    product_name: 'Carton',
    batch_number: null,
    hsn_code: '481910',
    sale_unit: 'EA',
    quantity: '1.000000',
    unit_price: '150.0000',
    gst_percent: '12.000000',
    line_total: '168.00',
  }],
  taxable_amount: '150.00',
  cgst_amount: '9.00',
  sgst_amount: '9.00',
  igst_amount: '0.00',
  cess_amount: '0.00',
  total_amount: '168.00',
});

test('renders only canonical seller, buyer, line, and exact money facts', () => {
  const html = generateInvoiceHTML(invoice());
  expect(html).toContain('Canonical Seller Private Limited');
  expect(html).toContain('27ABCDE1234F1Z5');
  expect(html).toContain('481910');
  expect(html).toContain('₹168.00');
  expect(html).not.toContain('Your Company Name');
  expect(html).not.toContain('Customer Name');
  expect(html).not.toContain('Unknown Product');
  expect(html).not.toContain('3004');
  expect(html).not.toContain('DOC-');
});

test('preserves an explicit zero tax component without treating it as missing', () => {
  const html = generateInvoiceHTML({ ...invoice(), cgst_amount: '0.00' });
  expect(html).toContain('₹0.00');
});

test.each([
  ['seller identity', { seller_legal_name: '' }],
  ['seller GSTIN', { seller_gstin: '' }],
  ['invoice number', { invoice_number: '' }],
  ['invoice amount', { total_amount: undefined }],
  ['line quantity', { items: [{ ...invoice().items[0], quantity: undefined }] }],
])('fails closed when canonical %s is missing', (_label, override) => {
  expect(() => generateInvoiceHTML({ ...invoice(), ...override } as InvoiceData)).toThrow();
});
