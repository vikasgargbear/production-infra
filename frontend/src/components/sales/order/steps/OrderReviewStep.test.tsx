import React from 'react';
import { render, screen } from '@testing-library/react';

import OrderReviewStep from './OrderReviewStep';

jest.mock('../../../global', () => ({
    NotesSection: () => null,
    AddressForm: () => null,
    PrintUtility: () => null,
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
