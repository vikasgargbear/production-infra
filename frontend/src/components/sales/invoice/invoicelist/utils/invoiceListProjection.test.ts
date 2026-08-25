import { projectInvoiceListRow, projectSalesHistoryRow } from './invoiceListProjection';

test('projects canonical invoice totals and document status without NaN or custom labels', () => {
    const invoice = projectInvoiceListRow({
        document_kind: 'sales_invoice',
        document_id: '11111111-1111-7111-8111-111111111111',
        branch_id: '11111111-1111-7111-8111-111111111112',
        document_number: 'DEMO-SI-000001',
        document_date: '2026-08-20',
        party_account_id: '22222222-2222-7222-8222-222222222222', party_name: 'Demo Customer',
        total_amount: '150.00',
        status: 'posted',
        due_date: null, source_document_type: null, source_document_id: null, source_document_number: null, line_count: 1,
        total_quantity: '1.000000', minimum_unit_rate: '150.0000', maximum_unit_rate: '150.0000',
        taxable_amount: '150.00', total_tax: '0.00', paid_amount: '0.00', outstanding_amount: '150.00',
        payment_status: 'pending', created_at: '', updated_at: '',
    });

    expect(invoice).toEqual(expect.objectContaining({
        invoice_number: 'DEMO-SI-000001',
        total_amount: '150.00',
        paid_amount: '0.00',
        pending_amount: '150.00',
        payment_status: 'pending',
        document_type: 'invoice',
        document_status: 'posted',
    }));
    expect(typeof invoice.total_amount).toBe('string');
});

test.each([
    ['sales_order' as const, {
        document_kind: 'sales_order', document_id: '11111111-1111-7111-8111-111111111111',
        document_number: 'DEMO-SO-000004', document_date: '2026-08-20', due_date: '2026-08-26',
        status: 'approved',
        total_amount: '250.50',
    }, 'approved', 'DEMO-SO-000004', '2026-08-26'],
    ['challan' as const, {
        document_kind: 'sales_dispatch', document_id: '11111111-1111-7111-8111-111111111112',
        document_number: 'DEMO-SD-000003', document_date: '2026-08-21', due_date: null,
        status: 'posted',
        total_amount: null,
    }, 'posted', 'DEMO-SD-000003', ''],
])('projects %s identity and authoritative lifecycle status', (
    documentType,
    sourceRow,
    expectedStatus,
    expectedNumber,
    expectedDueDate,
) => {
    const row = {
        ...sourceRow, branch_id: '11111111-1111-7111-8111-111111111113',
        party_account_id: '22222222-2222-7222-8222-222222222222', party_name: 'Demo Customer',
        source_document_type: null, source_document_id: null, source_document_number: null, line_count: 1,
        total_quantity: '1.000000', minimum_unit_rate: null, maximum_unit_rate: null,
        taxable_amount: documentType === 'challan' ? null : sourceRow.total_amount,
        total_tax: documentType === 'challan' ? null : '0.00', paid_amount: null, outstanding_amount: null,
        payment_status: null, created_at: '', updated_at: '',
    };
    const document = projectSalesHistoryRow(row, documentType);

    expect(document).toEqual(expect.objectContaining({
        document_type: documentType,
        document_status: expectedStatus,
        invoice_number: expectedNumber,
        due_date: expectedDueDate,
        pending_amount: null,
    }));
});
