import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportFromInvoiceModal from '../challan/ui/ImportFromInvoiceModal';

jest.mock('../../../hooks/useEscapeKey', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('../../../services/api', () => ({
    apiClient: { get: jest.fn(() => new Promise(() => {})) },
    invoicesApi: {
        search: jest.fn(() => new Promise(() => {})),
    },
    ordersApi: { getAll: jest.fn(() => new Promise(() => {})) },
    challansApi: { getAll: jest.fn(() => new Promise(() => {})) },
}));

describe.each([
    ['Import approved sales order', <ImportFromInvoiceModal isOpen onClose={jest.fn()} onImport={jest.fn()} />],
] as const)('%s dialog', (name, element) => {
    it('has a programmatic name, modal semantics, and a named close control', async () => {
        render(element);
        const dialog = screen.getByRole('dialog', { name });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(within(dialog).getAllByRole('button', { name: /close/i }).length).toBeGreaterThan(0);
    });
});
