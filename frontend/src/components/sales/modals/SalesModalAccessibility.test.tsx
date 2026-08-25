import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import BillDiscountModal from './BillDiscountModal';
import CashCalculatorModal from './CashCalculatorModal';
import LastDealModal from './LastDealModal';
import TaxDetailModal from './TaxDetailModal';
import ItemProfitModal from './ItemProfitModal';
import ImportDocumentModal from './ImportDocumentModal';
import ImportFromInvoiceModal from '../challan/ui/ImportFromInvoiceModal';

jest.mock('../../../hooks/useEscapeKey', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('../../../services/api', () => ({
    apiClient: { get: jest.fn(() => new Promise(() => {})) },
    invoicesApi: {
        getLastDeals: jest.fn(() => new Promise(() => {})),
        search: jest.fn(() => new Promise(() => {})),
    },
    ordersApi: { getAll: jest.fn(() => new Promise(() => {})) },
    challansApi: { getAll: jest.fn(() => new Promise(() => {})) },
}));

describe.each([
    ['Bill Discount (F4)', <BillDiscountModal isOpen onClose={jest.fn()} onApply={jest.fn()} />],
    ['Cash Calculator (F11)', <CashCalculatorModal isOpen onClose={jest.fn()} billAmount={100} />],
    ['Last Deal (Alt+L)', <LastDealModal isOpen onClose={jest.fn()} productName="Test" />],
    ['Tax Detail (F10)', <TaxDetailModal isOpen onClose={jest.fn()} invoice={{ items: [], totals: {} }} />],
    ['Item Cost & Profit Analysis (Shift+~)', <ItemProfitModal isOpen onClose={jest.fn()} items={[]} />],
    ['Import from Document', <ImportDocumentModal isOpen onClose={jest.fn()} onImport={jest.fn()} />],
    ['Import approved sales order', <ImportFromInvoiceModal isOpen onClose={jest.fn()} onImport={jest.fn()} />],
] as const)('%s dialog', (name, element) => {
    it('has a programmatic name, modal semantics, and a named close control', async () => {
        render(element);
        const dialog = screen.getByRole('dialog', { name });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(within(dialog).getAllByRole('button', { name: /close/i }).length).toBeGreaterThan(0);
    });
});
