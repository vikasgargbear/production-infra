import type { Invoice } from '../types/invoicelist.types';
import {
    salesHistoryDocumentCsv,
    salesHistoryExportFilename,
    salesHistoryListCsv,
    salesHistoryPrintHtml,
    salesStatusLabel,
    salesStatusTone,
} from './salesHistoryPresentation';

const order: Invoice = {
    id: '11111111-1111-7111-8111-111111111111',
    document_type: 'sales_order',
    document_status: 'approved',
    invoice_number: 'DEMO-SO-000004',
    invoice_date: '2026-08-20',
    due_date: '2026-08-26',
    customer_id: '22222222-2222-7222-8222-222222222222',
    customer_name: 'Demo Customer',
    total_amount: '150.00',
    paid_amount: null,
    pending_amount: null,
    payment_status: null,
    items_count: 1,
    created_at: '',
    updated_at: '',
};

test('uses authoritative lifecycle labels instead of Custom', () => {
    expect(salesStatusLabel('approved')).toBe('Approved');
    expect(salesStatusLabel('posted')).toBe('Posted');
    expect(salesStatusLabel('partially_dispatched')).toBe('Partially Dispatched');
    expect(salesStatusTone('approved')).toBe('success');
    expect(salesStatusLabel('awaiting_carrier')).toBe('Awaiting Carrier');
});

test('exports a real CSV row and neutralizes spreadsheet formulas after leading whitespace', () => {
    const csv = salesHistoryDocumentCsv({ ...order, customer_name: '  =HYPERLINK("bad")' });

    expect(csv).toContain('"Sales Order"');
    expect(csv).toContain('"DEMO-SO-000004"');
    expect(csv).toContain('"Approved"');
    expect(csv).toContain('"\'  =HYPERLINK(""bad"")"');
});

test('escapes stored values before opening a printable document', () => {
    const html = salesHistoryPrintHtml({ ...order, customer_name: '<script>alert(1)</script>' });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Sales Order DEMO-SO-000004');
});

test.each([
    ['invoice' as const, 'Invoice Number', 'Payment Status', 'invoices-export-2026-08-24.csv'],
    ['sales_order' as const, 'Sales Order Number', 'Order Status', 'sales-orders-export-2026-08-24.csv'],
    ['challan' as const, 'Delivery Challan Number', 'Challan Status', 'delivery-challans-export-2026-08-24.csv'],
])('exports document-specific headings, status, and filenames for %s', (type, numberHeading, statusHeading, filename) => {
    const document = { ...order, document_type: type };
    const csv = salesHistoryListCsv(type, [document]);

    expect(csv).toContain(`"${numberHeading}"`);
    expect(csv).toContain(`"${statusHeading}"`);
    expect(salesHistoryExportFilename(type, '2026-08-24')).toBe(filename);
});
