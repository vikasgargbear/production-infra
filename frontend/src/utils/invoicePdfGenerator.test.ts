import {
  downloadInvoicePDF, generateInvoiceHTML, InvoiceData, printableCanonicalInvoice,
} from './invoicePdfGenerator';
import type { CanonicalInvoiceDetail } from '../services/api/modules/sales/canonicalSalesDocuments.types';

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

const canonicalDetail = (): CanonicalInvoiceDetail => ({
  ...invoice(),
  invoice_id: '7c1ef24b-08f8-4f0d-8c03-f11e62c279ce',
  archival_snapshot_state: 'captured',
  seller_drug_license_numbers: ['LIVE-SELLER-LICENCE-MUST-NOT-PRINT'],
  customer_id: 'd52e98a0-c12b-4a42-826a-26841e334516',
  customer_phone: '9999999999',
  customer_email: 'live-profile@example.test',
  customer_gst_number: null,
  customer_drug_license_numbers: ['LIVE-BUYER-LICENCE-MUST-NOT-PRINT'],
  seller_gst_evidence: {
    availability: 'available', gstin: '27ABCDE1234F1Z5',
  },
  customer_gst_evidence: { availability: 'not_registered' },
  seller_drug_licence_evidence: {
    availability: 'available',
    licences: [{ license_number: 'ARCHIVED-SELLER-20B' }],
  },
  customer_drug_licence_evidence: {
    availability: 'available',
    licences: [{ license_number: 'ARCHIVED-BUYER-20B' }],
  },
  due_date: null,
  currency_code: 'INR',
  items: invoice().items.map((item, index) => ({
    ...item,
    id: `line-${index + 1}`,
    source_document_kind: 'sales_order' as const,
    product_id: `product-${index + 1}`,
    product_code: `PROD-${index + 1}`,
    uom_code: item.sale_unit,
    unit: item.sale_unit,
    base_billed_quantity: item.quantity,
    base_free_quantity: item.free_quantity,
    free_supply_tax_treatment: 'excluded_from_taxable_value' as const,
  })),
  created_at: '2026-08-25T12:00:00Z',
  updated_at: '2026-08-25T12:00:00Z',
});

test('builds printable facts only from captured archival evidence', () => {
  const detail = canonicalDetail();
  expect(detail.items[0].source_document_kind).toBe('sales_order');
  const printable = printableCanonicalInvoice(detail);
  const html = generateInvoiceHTML(printable);

  expect(printable.seller_drug_license_numbers).toEqual(['ARCHIVED-SELLER-20B']);
  expect(printable.customer_drug_license_numbers).toEqual(['ARCHIVED-BUYER-20B']);
  expect(printable.customer_phone).toBeUndefined();
  expect(html).toContain('ARCHIVED-SELLER-20B');
  expect(html).toContain('ARCHIVED-BUYER-20B');
  expect(html).not.toContain('LIVE-SELLER-LICENCE-MUST-NOT-PRINT');
  expect(html).not.toContain('LIVE-BUYER-LICENCE-MUST-NOT-PRINT');
  expect(html).not.toContain('9999999999');
  expect(html).not.toContain('live-profile@example.test');
});

test('fails closed instead of falling back when archival evidence is unavailable or contradictory', () => {
  expect(() => printableCanonicalInvoice({
    ...canonicalDetail(), archival_snapshot_state: 'unavailable',
  })).toThrow('Archived invoice party evidence is unavailable');
  expect(() => printableCanonicalInvoice({
    ...canonicalDetail(), seller_drug_licence_evidence: {
      availability: 'unavailable', reason: 'invoice_predates_archival_migration',
    },
  })).toThrow('Archived seller drug licences is unavailable');
  expect(() => printableCanonicalInvoice({
    ...canonicalDetail(), seller_gst_evidence: {
      availability: 'available', gstin: '29ABCDE1234F1Z5',
    },
  })).toThrow('does not match the invoice snapshot');
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
