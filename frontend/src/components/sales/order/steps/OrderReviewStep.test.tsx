import React from 'react';
import { render, screen, within } from '@testing-library/react';

import OrderReviewStep from './OrderReviewStep';

jest.mock('../../../global', () => ({
    NotesSection: () => null,
    AddressForm: () => null,
    PrintUtility: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));


test('keeps the canonical submission error visible when calculation preview is unavailable', () => {
    const builderError = 'Item 1 billed quantity must be greater than zero';

    render(<OrderReviewStep
        order={{ items: [] } as any}
        setOrder={jest.fn()}
        selectedCustomer={null}
        sameAsBilling={false}
        setSameAsBilling={jest.fn()}
        selectedBankAccount={null}
        setSelectedBankAccount={jest.fn()}
        message={builderError}
        messageType="error"
        companyInfo={{}}
        documentPolicy={null}
    />);

    expect(screen.getByRole('alert').textContent).toContain(builderError);
    expect(screen.getByRole('status').textContent).toContain(
        'Authoritative sales-order preview unavailable',
    );
    expect(screen.getAllByText(builderError, { exact: true })).toHaveLength(1);
});

test('review rows trim canonical quantities and group exact money in the Indian system', () => {
    render(<OrderReviewStep
        order={{
            order_number: 'SO-1001',
            order_date: '2026-08-29',
            expected_delivery_date: '2026-09-01',
            customer_name: 'Canonical Customer',
            billing_address: '',
            shipping_address: '',
            billing_address_data: null,
            shipping_address_data: null,
            gst_type: 'CGST/SGST',
            subtotal_amount: '123456.70',
            discount_amount: '0.00',
            tax_amount: '22.80',
            cgst_amount: '11.40',
            sgst_amount: '11.40',
            igst_amount: '0.00',
            total_amount: '123456.70',
            items: [{
                product_id: 'd3000000-0000-7000-8000-000000000015',
                batch_id: 'd3000000-0000-7000-8000-000000000016',
                product_name: 'Canonical Product',
                batch_number: 'BATCH-1',
                quantity: '2.000000',
                free_quantity: '0.000000',
                unit_price: '100.0000',
                discount_percent: '5.0000',
                gst_percent: '12.0000',
                calculated_total: '212.80',
                taxable_amount: '190.00',
                tax_amount: '22.80',
            }],
        } as any}
        setOrder={jest.fn()}
        selectedCustomer={null}
        sameAsBilling={false}
        setSameAsBilling={jest.fn()}
        selectedBankAccount={null}
        setSelectedBankAccount={jest.fn()}
        message=""
        messageType=""
        companyInfo={{ name: 'AASO Pharma' }}
        documentPolicy={null}
    />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('2')).toBeTruthy();
    expect(within(table).queryByText('2.000000')).toBeNull();
    expect(within(table).getByText('₹212.80')).toBeTruthy();
    expect(screen.getAllByText('₹1,23,456.70').length).toBeGreaterThan(0);
});
