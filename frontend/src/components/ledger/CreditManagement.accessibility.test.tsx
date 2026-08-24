import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CustomerDetailsModal } from './CreditManagement';
import { EscapeKeyProvider } from '../../contexts/EscapeKeyContext';

test('customer credit details is a named focus-owned dialog', () => {
    render(
        <EscapeKeyProvider>
            <CustomerDetailsModal
                customer={{
                    id: 'customer-1',
                    name: 'Demo Customer',
                    credit_limit: 1000,
                    creditUsed: 100,
                    creditAvailable: 900,
                    outstandingInvoices: [],
                } as any}
                onClose={jest.fn()}
            />
        </EscapeKeyProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Customer Credit Details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close customer credit details' })).toHaveFocus();
});
