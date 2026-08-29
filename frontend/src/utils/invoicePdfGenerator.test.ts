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
  due_date: '2026-09-05',
  status: 'posted',
  seller_legal_name: 'Aaso Pharma Private Limited',
  seller_gstin: '27ABCDE1234F1Z5',
  seller_address: 'Seller Lane\nMumbai',
  seller_drug_license_numbers: ['MH-MZ6-20B', 'MH-MZ6-21B'],
  customer_name: 'City Care Pharmacy',
  customer_phone: undefined,
  customer_gst_number: undefined,
  customer_drug_license_numbers: ['MH-BUYER-20B'],
  billing_address: 'Buyer Lane\nPune',
  shipping_address: 'Buyer Lane\nPune',
  supply_type: 'intra_state',
  place_of_supply_state_code: '27',
  place_of_supply_display_name: 'Maharashtra',
  tax_charge_mechanism: 'normal',
  items: [{
    product_name: 'Carton',
    manufacturer_name: 'Exact Labs',
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
    free_supply_tax_treatment: 'excluded_from_taxable_value',
    unit_price: '150.0000',
    line_discount_kind: 'percent',
    line_discount_basis: 'price_value',
    line_discount_value: '2.500000',
    line_discount_amount: '5.00',
    line_taxable_discount_amount: '5.00',
    document_discount_amount: '0.00',
    document_taxable_discount_amount: '0.00',
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
  pre_tax_discount_amount: '5.00',
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
  due_date: '2026-09-05',
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
    line_discount_kind: item.line_discount_kind,
    line_discount_basis: item.line_discount_basis,
    line_discount_value: item.line_discount_value,
    line_discount_amount: item.line_discount_amount,
    line_taxable_discount_amount: item.line_taxable_discount_amount,
    document_discount_amount: item.document_discount_amount,
    document_taxable_discount_amount: item.document_taxable_discount_amount,
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

test('uses the pre-tax reduction for printable discount and preserves header discount semantics', () => {
  const detail = {
    ...canonicalDetail(),
    subtotal_amount: '200.00',
    discount_amount: '11.20',
    pre_tax_discount_amount: '10.00',
    charges_amount: '0.00',
    net_value_amount: '190.00',
    taxable_amount: '190.00',
    cgst_amount: '11.40',
    sgst_amount: '11.40',
    total_amount: '212.80',
    items: [{
      ...canonicalDetail().items[0], taxable_amount: '190.00',
      line_discount_amount: '11.20', line_taxable_discount_amount: '10.00',
      cgst_amount: '11.40', sgst_amount: '11.40', line_total: '212.80',
    }],
  };

  const printable = printableCanonicalInvoice(detail);
  const html = generateInvoiceHTML(printable);
  expect(detail.discount_amount).toBe('11.20');
  expect(printable.discount_amount).toBe('10.00');
  expect(printable.cgst_amount).toBe('11.40');
  expect(printable.sgst_amount).toBe('11.40');
  expect(printable.total_amount).toBe('212.80');
  expect(printable.items[0]).toEqual(expect.objectContaining({
    taxable_amount: '190.00',
    cgst_amount: '11.40',
    sgst_amount: '11.40',
    igst_amount: '0.00',
    line_total: '212.80',
  }));
  expect(html).toContain('<span>Discount</span><span>-₹10.00</span>');
  expect(html).toContain('<strong>GST total:</strong> ₹22.80');
  expect(html).toContain('<span>CGST</span><span>₹11.40</span>');
  expect(html).toContain('<span>SGST</span><span>₹11.40</span>');
  expect(html).toContain('<span>Grand Total</span><span>₹212.80</span>');
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
  expect(html).toContain('Aaso Pharma Private Limited');
  expect(html).toContain('27ABCDE1234F1Z5');
  expect(html).toContain('MH-MZ6-20B / MH-MZ6-21B');
  expect(html).toContain('MH-BUYER-20B');
  expect(html).toContain('481910');
  expect(html).toContain('Mfr Exact Labs');
  expect(html).toContain('BATCH-ONE');
  expect(html).toContain('2028-09-30');
  expect(html).toContain('BATCH-TWO');
  expect(html).toContain('2029-01-31');
  expect(html).toContain('Free excluded from taxable value');
  expect(html).toContain('Paid 1.23');
  expect(html).toContain('2.5% (₹5.00)');
  expect(html).toContain('12%');
  expect(html).toContain('<div class="muted">₹18.00</div>');
  expect(html).toContain('Original for Recipient');
  expect(html).toContain('<strong>Due Date:</strong> 2026-09-05');
  expect(html).toContain('<strong>Place of Supply:</strong> Maharashtra (27)');
  expect(html).toContain('<strong>Supply:</strong> intra state');
  expect(html).toContain('Recipient (name and signature)');
  expect(html).toContain('Competent Person (name and signature)');
  expect(html).toContain('₹168.00');
  expect(html).not.toContain('Your Company Name');
  expect(html).not.toContain('Customer Name');
  expect(html).not.toContain('Unknown Product');
  expect(html).not.toContain('3004');
  expect(html).not.toContain('DOC-');
  expect(html).not.toContain('1.234567');
  expect(html).not.toContain('{{');
  expect(html).not.toContain('[object Object]');
  expect(html).not.toContain('canonical-factual-v1');
  expect(html.toLowerCase()).not.toContain('canonical');
  expect(html).toContain('thead{display:table-header-group}');
  expect(html).toContain('tr{break-inside:avoid;page-break-inside:avoid}');
  expect(html).not.toContain('.invoice-page{page-break-inside:avoid');
});

test('labels fixed line discounts and invoice allocations without inventing a percent', () => {
  const fixed = invoice();
  fixed.discount_amount = '7.00';
  fixed.net_value_amount = '148.00';
  fixed.total_amount = '166.00';
  fixed.items[0] = {
    ...fixed.items[0],
    line_discount_kind: 'amount',
    line_discount_basis: 'taxable_value',
    line_discount_value: '5.000000',
    line_discount_amount: '5.00',
    line_taxable_discount_amount: '5.00',
    document_discount_amount: '2.00',
    document_taxable_discount_amount: '2.00',
    discount_percent: '0.000000',
  };
  const html = generateInvoiceHTML(fixed);
  expect(html).toContain('Fixed ₹5.00 (₹5.00) + invoice ₹2.00');
  expect(html).not.toContain('>0%');

  expect(() => generateInvoiceHTML({
    ...fixed,
    items: [{ ...fixed.items[0], discount_percent: '5.000000' }],
  })).toThrow('cannot expose a percentage for its immutable kind');
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

test('renders the reviewed included-at-rate treatment for free product quantities', () => {
  const detail = canonicalDetail();
  detail.items[0].free_supply_tax_treatment = 'included_at_unit_rate';
  const printable = printableCanonicalInvoice(detail);

  expect(printable.items[0].free_supply_tax_treatment).toBe('included_at_unit_rate');
  expect(generateInvoiceHTML(printable)).toContain('Free included at unit rate');
});

test('fails closed when canonical free-supply tax treatment is absent', () => {
  const detail = canonicalDetail();
  (detail.items[0] as any).free_supply_tax_treatment = undefined;

  expect(() => printableCanonicalInvoice(detail)).toThrow('free-supply tax treatment is unavailable');
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

test('keeps every invoice item column inside the A4 printable width with Amount visible', async () => {
  mockAutoTable.mockClear();
  await downloadInvoicePDF(invoice());

  const options = mockAutoTable.mock.calls
    .map((call: any[]) => call[1])
    .find((callOptions: any) => callOptions.head[0][0] === '#');
  expect(options).toBeDefined();
  expect(options.head[0].at(-1)).toBe('Amount');
  expect(options.body[0].at(-1)).toBe('INR 168.00');
  expect(options.margin.left).toBe(9);
  expect(options.margin.right).toBe(9);
  expect(options.tableWidth).toBe(192);
  expect(options.horizontalPageBreak).toBe(false);

  const columnWidths = Object.values(options.columnStyles)
    .map((style: any) => style.cellWidth as number);
  expect(columnWidths).toEqual([6, 38, 23, 16, 18, 18, 17, 20, 17, 19]);
  expect(columnWidths.reduce((total: number, width: number) => total + width, 0))
    .toBe(options.tableWidth);
  expect(options.margin.left + options.tableWidth + options.margin.right).toBe(210);
  expect(options.columnStyles[1].cellWidth).toBeGreaterThan(options.columnStyles[9].cellWidth);
});

test('prints invoice and due dates in the PDF header without obscuring the item table', async () => {
  mockAutoTable.mockClear();
  await downloadInvoicePDF(invoice());

  const pdf = mockAutoTable.mock.calls.at(-1)?.[0];
  expect(pdf.text).toHaveBeenCalledWith('Invoice No: INV-2026-1', 201, 22, { align: 'right' });
  expect(pdf.text).toHaveBeenCalledWith('Date: 2026-08-25', 201, 27, { align: 'right' });
  expect(pdf.text).toHaveBeenCalledWith('Due Date: 2026-09-05', 201, 32, { align: 'right' });
  expect(mockAutoTable.mock.calls.at(-1)?.[1].startY).toBeGreaterThan(53);
});

test('renders four-digit rates, Cess, free treatment, and every batch without formatted-value reparsing', async () => {
  mockAutoTable.mockClear();
  await downloadInvoicePDF({
    ...invoice(),
    items: [{
      ...invoice().items[0],
      unit_price: '1234.5678',
      free_supply_tax_treatment: 'included_at_unit_rate',
      cess_amount: '1.00',
      line_total: '169.00',
    }],
    cess_amount: '1.00',
    total_amount: '169.00',
  });

  const options = mockAutoTable.mock.calls.at(-1)?.[1];
  expect(options.body[0][1]).toContain('Mfr Exact Labs');
  expect(options.body[0][1]).toContain('Free included at unit rate');
  expect(options.body[0][2]).toBe('BATCH-ONE\nBATCH-TWO');
  expect(options.body[0][3]).toBe('2028-09-30\n2029-01-31');
  expect(options.body[0][4]).toBe('Paid 1.23\nFree 0.13');
  expect(options.body[0][5]).toBe('INR 1,234.57');
  expect(options.body[0][7]).toBe('INR 150.00');
  expect(options.body[0][8]).toBe('12%\nINR 18.00');
});
