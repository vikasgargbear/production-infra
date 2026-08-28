import { downloadInvoicePDF, generateInvoiceHTML, InvoiceData } from './invoicePdfGenerator';

const mockPdfSave = jest.fn();
jest.mock('jspdf', () => ({
  jsPDF: class MockJsPdf {
    internal = { pageSize: { getWidth: () => 210 } };
    save = mockPdfSave;
    setTextColor = jest.fn();
    setFont = jest.fn();
    setFontSize = jest.fn();
    text = jest.fn();
    setDrawColor = jest.fn();
    setLineWidth = jest.fn();
    line = jest.fn();
    splitTextToSize = jest.fn((value: string) => value.split('\n'));
    roundedRect = jest.fn();
    addPage = jest.fn();
    getNumberOfPages = jest.fn(() => 1);
    setPage = jest.fn();
  },
}));
jest.mock('jspdf-autotable', () => ({
  autoTable: jest.fn((pdf: any) => { pdf.lastAutoTable = { finalY: 100 }; }),
}));
const { autoTable: mockAutoTable } = jest.requireMock('jspdf-autotable');

const invoice = (): InvoiceData => ({
  invoice_number: 'INV-2026-1',
  invoice_date: '2026-08-25',
  status: 'posted',
  seller_legal_name: 'Canonical Seller Private Limited',
  seller_gstin: '27ABCDE1234F1Z5',
  seller_address: 'Seller Lane\nMumbai',
  seller_drug_license_numbers: ['MH-MZ6-20B', 'MH-MZ6-21B'],
  customer_name: 'Canonical Buyer',
  customer_phone: undefined,
  customer_gst_number: undefined,
  customer_drug_license_numbers: ['MH-BUYER-20B'],
  billing_address: 'Buyer Lane\nPune',
  shipping_address: 'Buyer Lane\nPune',
  tax_charge_mechanism: 'normal',
  items: [{
    product_name: 'Carton',
    batch_number: 'BATCH-ONE',
    expiry_date: '2028-09-30',
    batch_allocations: [
      {
        batch_number: 'BATCH-ONE', expiry_date: '2028-09-30',
        billed_quantity: '0.734567', free_quantity: '0.125000',
      },
      {
        batch_number: 'BATCH-TWO', expiry_date: '2029-01-31',
        billed_quantity: '0.500000', free_quantity: '0.000000',
      },
    ],
    hsn_code: '481910',
    sale_unit: 'EA',
    quantity: '1.234567',
    free_quantity: '0.125000',
    unit_price: '150.0000',
    discount_percent: '2.500000',
    gst_percent: '12.000000',
    taxable_amount: '150.00',
    cgst_amount: '9.00',
    sgst_amount: '9.00',
    igst_amount: '0.00',
    cess_amount: '0.00',
    line_total: '168.00',
  }],
  subtotal_amount: '155.00',
  discount_amount: '5.00',
  charges_amount: '0.00',
  net_value_amount: '150.00',
  taxable_amount: '150.00',
  cgst_amount: '9.00',
  sgst_amount: '9.00',
  igst_amount: '0.00',
  cess_amount: '0.00',
  rounding_adjustment: '0.00',
  total_amount: '168.00',
});

test('renders only canonical seller, buyer, line, and exact money facts', () => {
  const html = generateInvoiceHTML(invoice());
  expect(html).toContain('Canonical Seller Private Limited');
  expect(html).toContain('27ABCDE1234F1Z5');
  expect(html).toContain('MH-MZ6-20B / MH-MZ6-21B');
  expect(html).toContain('MH-BUYER-20B');
  expect(html).toContain('481910');
  expect(html).toContain('Batch BATCH-ONE; Exp 2028-09-30; Qty 0.73; Free 0.13');
  expect(html).toContain('Batch BATCH-TWO; Exp 2029-01-31; Qty 0.5; Free 0');
  expect(html).toContain('>1.23');
  expect(html).toContain('>2.5%');
  expect(html).toContain('₹168.00');
  expect(html).not.toContain('Your Company Name');
  expect(html).not.toContain('Customer Name');
  expect(html).not.toContain('Unknown Product');
  expect(html).not.toContain('3004');
  expect(html).not.toContain('DOC-');
  expect(html).not.toContain('1.234567');
  expect(html).toContain('thead{display:table-header-group}');
  expect(html).toContain('tr{break-inside:avoid;page-break-inside:avoid}');
  expect(html).not.toContain('.invoice-page{page-break-inside:avoid');
});

test('preserves an explicit zero tax component without treating it as missing', () => {
  const html = generateInvoiceHTML(invoice());
  expect(html).toContain('<span>IGST</span><span>₹0.00</span>');
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

test('fails closed when header totals do not reconcile', () => {
  expect(() => generateInvoiceHTML({ ...invoice(), total_amount: '168.01' }))
    .toThrow('Invoice net value, tax, rounding, and grand total do not reconcile.');
  expect(() => generateInvoiceHTML({ ...invoice(), net_value_amount: '149.99' }))
    .toThrow('Invoice subtotal, discount, charges, and net value do not reconcile.');
});

test('does not include cess in the GST total', () => {
  const html = generateInvoiceHTML({
    ...invoice(), cess_amount: '1.00', total_amount: '169.00',
    items: [{ ...invoice().items[0], cess_amount: '1.00', line_total: '169.00' }],
  });
  expect(html).toContain('<strong>GST total:</strong> ₹18.00');
  expect(html).toContain('<span>Cess</span><span>₹1.00</span>');
});

test('downloads the reconciled canonical facts through the paginated A4 PDF builder', async () => {
  const before = document.body.childElementCount;
  await downloadInvoicePDF({ ...invoice(), invoice_number: 'INV/2026/1' });

  expect(mockAutoTable).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    rowPageBreak: 'avoid', showHead: 'everyPage',
  }));
  expect(mockPdfSave).toHaveBeenCalledWith('INV-2026-1.pdf');
  expect(document.body.childElementCount).toBe(before);
});
