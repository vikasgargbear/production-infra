import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentImportModal from './DocumentImportModal';

jest.mock('react-toastify', () => ({
    toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn() },
}));

describe('DocumentImportModal detail resolution', () => {
    it('resolves the selected API document before importing customer and line data', async () => {
        const onImport = jest.fn();
        const onClose = jest.fn();
        const loadFunction = jest.fn().mockResolvedValue([{
            invoice_id: 'invoice-1',
            invoice_number: 'INV-1',
            customer_name: 'Synthetic Customer',
            total_amount: 150,
        }]);
        const resolveDocument = jest.fn().mockResolvedValue({
            invoice_id: 'invoice-1',
            invoice_number: 'INV-1',
            customer_id: 'customer-1',
            customer_name: 'Synthetic Customer',
            items: [{ product_id: 'product-1', product_name: 'Carton', quantity: 1, unit_price: 150 }],
        });

        render(
            <DocumentImportModal
                isOpen
                onClose={onClose}
                onImport={onImport}
                documentTypes={[{
                    value: 'invoice',
                    label: 'Invoices',
                    loadFunction,
                    resolveDocument,
                }]}
            />,
        );

        await screen.findByText('INV-1');
        fireEvent.click(screen.getByText('INV-1'));
        fireEvent.click(screen.getByRole('button', { name: 'Import Selected' }));

        await waitFor(() => expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
            source_type: 'invoice',
            customer_id: 'customer-1',
            customer: expect.objectContaining({ customer_id: 'customer-1' }),
            items: [expect.objectContaining({ product_id: 'product-1', quantity: 1 })],
        })));
        expect(resolveDocument).toHaveBeenCalledWith(expect.objectContaining({ invoice_id: 'invoice-1' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
