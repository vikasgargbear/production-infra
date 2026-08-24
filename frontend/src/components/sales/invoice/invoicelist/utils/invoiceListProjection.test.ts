import { projectInvoiceListRow } from './invoiceListProjection';

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
    }));
    expect(Number.isFinite(invoice.total_amount)).toBe(true);
});
