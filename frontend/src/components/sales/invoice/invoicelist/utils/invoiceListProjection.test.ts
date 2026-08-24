import { projectInvoiceListRow, projectSalesHistoryRow } from './invoiceListProjection';

test('projects canonical invoice totals and document status without NaN or custom labels', () => {
    const invoice = projectInvoiceListRow({
        id: '11111111-1111-4111-8111-111111111111',
        document_number: 'DEMO-SI-000001',
        document_date: '2026-08-20',
        customer_id: '22222222-2222-4222-8222-222222222222',
        customer_name: 'Demo Customer',
        total_amount: '150.00',
        status: 'posted',
        items_count: 1,
    });

    expect(invoice).toEqual(expect.objectContaining({
        invoice_number: 'DEMO-SI-000001',
        total_amount: 150,
        paid_amount: 0,
        pending_amount: 150,
        payment_status: 'pending',
        document_type: 'invoice',
        document_status: 'posted',
    }));
    expect(Number.isFinite(invoice.total_amount)).toBe(true);
});

test.each([
    ['sales_order' as const, {
        order_id: '11111111-1111-7111-8111-111111111111',
        order_number: 'DEMO-SO-000004',
        order_date: '2026-08-20',
        requested_delivery_date: '2026-08-26',
        status: 'approved',
        grand_total: '250.50',
        items: [{ product_id: 'product-1' }],
    }, 'approved', 'DEMO-SO-000004', '2026-08-26'],
    ['challan' as const, {
        challan_id: '11111111-1111-7111-8111-111111111112',
        challan_number: 'DEMO-SD-000003',
        challan_date: '2026-08-21',
        status: 'posted',
        total_amount: 0,
    }, 'posted', 'DEMO-SD-000003', ''],
])('projects %s identity and authoritative lifecycle status', (
    documentType,
    row,
    expectedStatus,
    expectedNumber,
    expectedDueDate,
) => {
    const document = projectSalesHistoryRow(row, documentType);

    expect(document).toEqual(expect.objectContaining({
        document_type: documentType,
        document_status: expectedStatus,
        invoice_number: expectedNumber,
        due_date: expectedDueDate,
        pending_amount: 0,
    }));
});
