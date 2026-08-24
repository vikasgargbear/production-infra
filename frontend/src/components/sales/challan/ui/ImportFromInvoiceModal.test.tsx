import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportFromInvoiceModal from './ImportFromInvoiceModal';
import { invoicesApi } from '../../../../services/api';

jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../../../hooks/useDialogFocus', () => ({
    __esModule: true,
    default: () => ({ current: null }),
}));
jest.mock('../../../../hooks/useEscapeKey', () => ({
    __esModule: true,
    default: jest.fn(),
}));
jest.mock('../../../../services/api', () => ({
    invoicesApi: { search: jest.fn(), getById: jest.fn() },
    ordersApi: { search: jest.fn(), getById: jest.fn() },
}));

describe('ImportFromInvoiceModal executed allocation mapping', () => {
    it('imports every direct/dispatch batch allocation with exact billed and free quantities', async () => {
        (invoicesApi.search as jest.Mock).mockResolvedValue({ data: { invoices: [{
            invoice_id: 'invoice-1', invoice_number: 'INV-1',
            customer_id: 'customer-1', customer_name: 'Customer', total_amount: 336,
        }] } });
        (invoicesApi.getById as jest.Mock).mockResolvedValue({ data: {
            invoice_id: 'invoice-1', invoice_number: 'INV-1',
            customer_id: 'customer-1', customer_name: 'Customer',
            items: [{
                id: 'line-1', product_id: 'product-1', product_name: 'Carton',
                quantity: 3, free_quantity: 1, unit_price: 100,
                free_supply_tax_treatment: 'excluded_from_taxable_value',
                batch_allocations: [
                    {
                        source_kind: 'dispatch_allocation', command_request_id: null,
                        allocation_id: 'invoice-dispatch-allocation-1',
                        invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-1',
                        dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-1',
                        inventory_document_id: 'document-1',
                        inventory_document_line_id: 'inventory-line-1',
                        batch_id: 'batch-1', batch_number: 'BATCH-1', expiry_date: null,
                        base_quantity: 2, base_billed_quantity: 1, base_free_quantity: 1,
                        billed_quantity: 1, free_quantity: 1,
                    },
                    {
                        source_kind: 'dispatch_allocation', command_request_id: null,
                        allocation_id: 'invoice-dispatch-allocation-2',
                        invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-2',
                        dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-2',
                        inventory_document_id: 'document-2',
                        inventory_document_line_id: 'inventory-line-2',
                        batch_id: 'batch-2', batch_number: 'BATCH-2', expiry_date: '2028-09-01',
                        base_quantity: 2, base_billed_quantity: 2, base_free_quantity: 0,
                        billed_quantity: 2, free_quantity: 0,
                    },
                ],
            }],
        } });
        const onImport = jest.fn();

        render(<ImportFromInvoiceModal isOpen onClose={jest.fn()} onImport={onImport} />);

        await screen.findByText('INV-1');
        fireEvent.click(screen.getByText('INV-1'));
        fireEvent.click(screen.getByRole('button', { name: 'Import to Challan' }));

        await waitFor(() => expect(onImport).toHaveBeenCalled());
        expect(invoicesApi.getById).toHaveBeenCalledWith('invoice-1');
        expect(onImport.mock.calls[0][0].items).toEqual([
            expect.objectContaining({
                batch_id: 'batch-1', batch_number: 'BATCH-1', expiry_date: null,
                quantity: 1, free_quantity: 1,
                inventory_document_line_id: 'inventory-line-1',
                invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-1',
                dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-1',
            }),
            expect.objectContaining({
                batch_id: 'batch-2', batch_number: 'BATCH-2', expiry_date: '2028-09-01',
                quantity: 2, free_quantity: 0,
                inventory_document_line_id: 'inventory-line-2',
                invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-2',
                dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-2',
            }),
        ]);
    });
});
