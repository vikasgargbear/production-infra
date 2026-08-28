import { render, screen } from '@testing-library/react';
import InvoicePreviewStep from './InvoicePreviewStep';

jest.mock('../../../global', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    return {
        ModuleHeader: () => null,
        PrintUtility: ({ children }: { children: React.ReactNode }) => (
            React.createElement(React.Fragment, null, children)
        ),
        DocumentFooter: ({ onSave, saveLabel }: {
            onSave?: () => void;
            saveLabel?: string;
        }) => onSave
            ? React.createElement('button', { onClick: onSave }, saveLabel)
            : null,
    };
});

describe('InvoicePreviewStep canonical action boundary', () => {
    it('renders no Generate action when the save validation lacks customer context', () => {
        render(
            <InvoicePreviewStep
                invoice={{
                    invoice_number: '',
                    invoice_date: '2026-08-29',
                    customer_name: '',
                    items: [],
                    totals: null,
                } as any}
                setInvoice={jest.fn() as any}
                selectedCustomer={null}
                companyInfo={{
                    name: 'Canonical Seller Private Limited',
                    address: '1 Seller Road',
                    gst_number: '27ABCDE1234F1Z5',
                }}
                onClose={jest.fn()}
                onBack={jest.fn()}
                onSave={jest.fn()}
                onPrint={jest.fn()}
                onThermalPrint={jest.fn()}
                saving={false}
            />,
        );

        expect(screen.getByRole('alert').textContent).toContain('Please select a customer');
        expect(screen.queryByRole('button', { name: /Generate Invoice/i })).toBeNull();
    });
});
