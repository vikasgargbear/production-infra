import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentImportModal from './DocumentImportModal';

jest.mock('react-toastify', () => ({
    toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn() },
}));

describe('DocumentImportModal detail resolution', () => {
    it('labels a non-monetary dispatch instead of inventing a zero amount', async () => {
        render(<DocumentImportModal isOpen onClose={jest.fn()} onImport={jest.fn()}
            documentTypes={[{
                value: 'challan', label: 'Delivery Challans',
                loadFunction: jest.fn().mockResolvedValue([{
                    challan_id: 'dispatch-1', challan_number: 'DC-1',
                    customer_name: 'Synthetic Customer', delivery_status: 'posted',
                }]),
            }]} />);
        expect(await screen.findByText('Amount not applicable')).toBeTruthy();
        expect(screen.queryByText('₹0.00')).toBeNull();
    });

    it('resolves the selected API document before importing customer and line data', async () => {
        const onImport = jest.fn();
        const onClose = jest.fn();
        const loadFunction = jest.fn().mockResolvedValue([{
            invoice_id: 'invoice-1',
            invoice_number: 'INV-1',
            customer_name: 'Synthetic Customer',
            total_amount: '150.00',
        }]);
        const resolveDocument = jest.fn().mockResolvedValue({
            invoice_id: 'invoice-1',
            invoice_number: 'INV-1',
            customer_id: 'customer-1',
            customer_name: 'Synthetic Customer',
            items: [{
                product_id: 'product-1', product_name: 'Carton', quantity: '1.000000',
                free_quantity: '0.000000',
                free_supply_tax_treatment: 'excluded_from_taxable_value',
                unit_price: '150.0000', batch_id: 'batch-1', batch_number: 'BATCH-1',
                gst_percent: '0.000000', discount_percent: '0.000000',
            }],
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
            items: [expect.objectContaining({ product_id: 'product-1', quantity: '1.000000' })],
        })));
        expect(resolveDocument).toHaveBeenCalledWith(expect.objectContaining({ invoice_id: 'invoice-1' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('expands every authoritative invoice allocation instead of choosing a scalar batch', async () => {
        const onImport = jest.fn();
        const loadFunction = jest.fn().mockResolvedValue([{
            invoice_id: 'invoice-2', invoice_number: 'INV-2',
            customer_name: 'Synthetic Customer', total_amount: '336.00',
        }]);
        const resolveDocument = jest.fn().mockResolvedValue({
            invoice_id: 'invoice-2', invoice_number: 'INV-2',
            customer_id: 'customer-1', customer_name: 'Synthetic Customer',
            items: [{
                id: 'line-1', product_id: 'product-1', product_name: 'Carton',
                quantity: '3.000000', free_quantity: '1.000000',
                unit_price: '100.0000', line_total: '336.00',
                free_supply_tax_treatment: 'excluded_from_taxable_value',
                gst_percent: '12.000000', discount_percent: '0.000000',
                batch_id: null, batch_number: null,
                batch_allocations: [
                    {
                        source_kind: 'dispatch_allocation', command_request_id: null,
                        allocation_id: 'invoice-dispatch-allocation-1',
                        invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-1',
                        dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-1',
                        inventory_document_id: 'document-1',
                        inventory_document_line_id: 'inventory-line-1',
                        batch_id: 'batch-1', batch_number: 'BATCH-1', expiry_date: null,
                        base_quantity: '2.000000', base_billed_quantity: '1.000000',
                        base_free_quantity: '1.000000', billed_quantity: '1.000000',
                        free_quantity: '1.000000',
                    },
                    {
                        source_kind: 'dispatch_allocation', command_request_id: null,
                        allocation_id: 'invoice-dispatch-allocation-2',
                        invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-2',
                        dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-2',
                        inventory_document_id: 'document-2',
                        inventory_document_line_id: 'inventory-line-2',
                        batch_id: 'batch-2', batch_number: 'BATCH-2', expiry_date: '2028-09-01',
                        base_quantity: '2.000000', base_billed_quantity: '2.000000',
                        base_free_quantity: '0.000000', billed_quantity: '2.000000',
                        free_quantity: '0.000000',
                    },
                ],
            }],
        });

        render(<DocumentImportModal isOpen onClose={jest.fn()} onImport={onImport}
            documentTypes={[{ value: 'invoice', label: 'Invoices', loadFunction, resolveDocument }]} />);

        await screen.findByText('INV-2');
        fireEvent.click(screen.getByText('INV-2'));
        fireEvent.click(screen.getByRole('button', { name: 'Import Selected' }));

        await waitFor(() => expect(onImport).toHaveBeenCalled());
        const imported = onImport.mock.calls[0][0];
        expect(imported.items).toEqual([
            expect.objectContaining({
                batch_id: 'batch-1', quantity: '1.000000', free_quantity: '1.000000',
                dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-1',
            }),
            expect.objectContaining({
                batch_id: 'batch-2', quantity: '2.000000', free_quantity: '0.000000',
                invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-2',
                dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-2',
            }),
        ]);
        expect(imported.items.map((item: any) => item.line_total)).toEqual(['112.00', '224.00']);
    });
});
