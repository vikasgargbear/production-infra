import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { InvoiceTable } from './InvoiceTable';

jest.mock('../../../../global', () => ({
    DataTable: ({ data, onRowActivate }: any) => (
        <div data-testid="desktop-data-table">
            <button type="button" onDoubleClick={() => onRowActivate(data[0])}>Desktop row</button>
        </div>
    ),
    StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));

jest.mock('../../../../../contexts/CompanyContext', () => ({
    useCompany: () => ({ companyInfo: { name: 'AASO Pharma' } }),
}));

jest.mock('../../../../../services/api/modules/sales/invoices.api', () => ({
    invoicesApi: { getById: jest.fn() },
}));
const { invoicesApi: mockInvoicesApi } = jest.requireMock('../../../../../services/api/modules/sales/invoices.api');

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

const canonicalDetail = {
    invoice_id: 'invoice-id', invoice_number: 'INV-1001', invoice_date: '2026-08-29', status: 'posted',
    archival_snapshot_state: 'captured', seller_legal_name: 'AASO Pharma', seller_gstin: '27ABCDE1234F1Z5',
    seller_address: 'Seller Road', seller_drug_license_numbers: [], customer_id: 'customer-id',
    customer_name: invoice.customer_name, customer_phone: null, customer_email: null,
    customer_gst_number: '27ABCDE1234F1Z5', customer_drug_license_numbers: [], billing_address: 'Buyer Road',
    shipping_address: 'Buyer Road', seller_gst_evidence: {}, customer_gst_evidence: {},
    seller_drug_licence_evidence: {}, customer_drug_licence_evidence: {}, due_date: '2026-09-05',
    currency_code: 'INR', supply_type: 'intra_state', place_of_supply_state_code: '27',
    place_of_supply_display_name: 'Maharashtra', tax_charge_mechanism: 'normal', subtotal_amount: '150.00', discount_amount: '0.00',
    pre_tax_discount_amount: '0.00', charges_amount: '0.00', net_value_amount: '150.00', taxable_amount: '150.00',
    cgst_amount: '9.00', sgst_amount: '9.00', igst_amount: '0.00', cess_amount: '0.00',
    rounding_adjustment: '0.00', total_amount: '168.00', created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z', items: [{
        id: 'line-1', product_id: 'product-1', product_name: 'AASOPOD-100 Dry Syrup', product_code: 'AASOPOD-100',
        hsn_code: '30042019', uom_code: 'NOS', unit: 'NOS', quantity: '10.000000', free_quantity: '1.000000',
        free_supply_tax_treatment: 'excluded_from_taxable_value', unit_price: '15.0000',
        line_discount_kind: 'none', line_discount_basis: 'price_value', line_discount_value: '0.000000',
        line_discount_amount: '0.00', line_taxable_discount_amount: '0.00',
        document_discount_amount: '0.00', document_taxable_discount_amount: '0.00',
        discount_percent: '0.000000',
        gst_percent: '12.000000', taxable_amount: '150.00', cgst_amount: '9.00', sgst_amount: '9.00',
        igst_amount: '0.00', line_total: '168.00', source_document_kind: 'sales_order',
        base_billed_quantity: '10.000000', base_free_quantity: '1.000000', cess_amount: '0.00',
        batch_id: 'batch-1', batch_number: 'D260153E', expiry_date: '2028-02-29', batch_allocations: [],
    }],
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
    expect(within(cards).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByTestId('desktop-data-table')).toBeTruthy();
});

test('invoice number and desktop row open the full canonical commercial detail', async () => {
    mockInvoicesApi.getById.mockResolvedValue({ data: canonicalDetail });
    render(<InvoiceTable
        invoices={[invoice]}
        documentType="invoice"
        selectedIds={new Set()}
        isAllSelected={false}
        loading={false}
        onToggleSelect={jest.fn()}
        onToggleSelectAll={jest.fn()}
    />);

    fireEvent.doubleClick(within(screen.getByTestId('desktop-data-table')).getByRole('button', { name: 'Desktop row' }));
    const dialog = await screen.findByRole('dialog', { name: 'INV-1001' });
    expect(mockInvoicesApi.getById).toHaveBeenCalledWith('invoice-id');
    expect(await within(dialog).findByText('AASOPOD-100 Dry Syrup')).toBeTruthy();
    expect(within(dialog).getByText('HSN 30042019 | NOS')).toBeTruthy();
    expect(within(dialog).getByRole('columnheader', { name: 'Expiry' })).toBeTruthy();
    expect(within(dialog).getByRole('columnheader', { name: 'GST % / Amount' })).toBeTruthy();
    expect(within(dialog).getAllByText('12%').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('₹18.00').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('GST by rate and amount')).toBeTruthy();
    expect(within(dialog).getByText('Maharashtra (27)')).toBeTruthy();
    expect(within(dialog).getByText('intra state')).toBeTruthy();
});
