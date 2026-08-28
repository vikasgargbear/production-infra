import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { InvoiceTable } from './InvoiceTable';

jest.mock('../../../../global', () => ({
    DataTable: () => <div data-testid="desktop-data-table" />,
    StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));

jest.mock('../../../../../contexts/CompanyContext', () => ({
    useCompany: () => ({ companyInfo: { name: 'AASO Pharma' } }),
}));

jest.mock('../../../../../services/api/modules/sales/invoices.api', () => ({
    invoicesApi: { getById: jest.fn() },
}));

const invoice = {
    id: 'invoice-id',
    document_type: 'invoice' as const,
    document_status: 'posted',
    invoice_number: 'INV-1001',
    invoice_date: '2026-08-29',
    due_date: '2026-09-05',
    customer_id: 'customer-id',
    customer_name: 'Long Customer Name That Must Remain Readable',
    customer_phone: undefined,
    customer_email: undefined,
    total_amount: '1234567.80',
    paid_amount: '1233333.30',
    pending_amount: '1234.50',
    payment_status: 'partial' as const,
    items_count: 2,
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
};

test('mobile sales history cards keep exact Indian money and controls usable without a table viewport', () => {
    const onToggleSelect = jest.fn();
    render(<InvoiceTable
        invoices={[invoice]}
        documentType="invoice"
        selectedIds={new Set()}
        isAllSelected={false}
        loading={false}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={jest.fn()}
    />);

    const cards = screen.getByTestId('sales-history-cards');
    expect(within(cards).getByText('₹12,34,567.80')).toBeTruthy();
    expect(within(cards).getByText('₹1,234.50 pending')).toBeTruthy();
    expect(within(cards).getByText(invoice.customer_name)).toBeTruthy();
    expect(within(cards).getByText('Partially Paid')).toBeTruthy();

    fireEvent.click(within(cards).getByRole('checkbox', { name: 'Select Invoice INV-1001' }));
    expect(onToggleSelect).toHaveBeenCalledWith('invoice-id');
    expect(within(cards).getAllByRole('button')).toHaveLength(5);
    expect(screen.getByTestId('desktop-data-table')).toBeTruthy();
});
