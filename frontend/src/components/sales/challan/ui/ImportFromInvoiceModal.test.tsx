import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportFromInvoiceModal from './ImportFromInvoiceModal';
import { ordersApi } from '../../../../services/api';

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
    ordersApi: { listApprovedForDispatch: jest.fn(), getById: jest.fn() },
}));

const id = (suffix: string) => `10000000-0000-7000-8000-${suffix.padStart(12, '0')}`;

describe('delivery challan canonical order import', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (ordersApi.listApprovedForDispatch as jest.Mock).mockResolvedValue([{
            order_id: id('1'), order_number: 'SO-1', order_date: '2026-08-25',
            customer_id: id('2'), customer_name: 'Canonical Customer',
            total_amount: '168.00', order_status: 'approved',
        }]);
        (ordersApi.getById as jest.Mock).mockResolvedValue({ data: {
            order_id: id('1'), order_number: 'SO-1', order_date: '2026-08-25',
            order_status: 'approved', customer_id: id('2'), customer_name: 'Canonical Customer',
            total_amount: '168.00',
            items: [{
                id: id('3'), source_document_kind: 'sales_order',
                product_id: id('4'), product_name: 'Canonical Product',
                branch_id: id('5'), location_id: id('6'), uom_conversion_id: id('7'),
                batch_id: id('8'), batch_number: 'BATCH-1', expiry_date: '2028-09-01',
                quantity: '2.000000', free_quantity: '1.000000', unit_price: '50.0000',
                gst_percent: '12.000000', discount_percent: '0.000000',
                free_supply_tax_treatment: 'included_at_unit_rate', uom_code: 'EA',
            }],
        } });
    });

    it('offers approved sales orders only and preserves order-line/batch identities', async () => {
        const onImport = jest.fn();
        render(<ImportFromInvoiceModal isOpen onClose={jest.fn()} onImport={onImport} />);

        expect(await screen.findByText('SO-1')).toBeTruthy();
        expect(screen.queryByText(/sales invoice/i)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: `Select canonical sales order ${id('1')}` }));
        fireEvent.click(screen.getByRole('button', { name: 'Import order to challan' }));

        await waitFor(() => expect(onImport).toHaveBeenCalled());
        expect(ordersApi.getById).toHaveBeenCalledWith(id('1'));
        expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
            source_order_id: id('1'),
            customer_id: id('2'),
            reference_doc: 'Order: SO-1',
            items: [expect.objectContaining({
                id: id('3'), source_order_line_id: id('3'),
                product_id: id('4'), batch_id: id('8'),
                quantity: '2.000000', free_quantity: '1.000000',
            })],
        }));
    });

    it('fails closed when the detail is no longer approved', async () => {
        (ordersApi.getById as jest.Mock).mockResolvedValueOnce({ data: {
            order_id: id('1'), order_number: 'SO-1', order_status: 'cancelled',
            customer_id: id('2'), customer_name: 'Canonical Customer', items: [],
        } });
        const onImport = jest.fn();
        render(<ImportFromInvoiceModal isOpen onClose={jest.fn()} onImport={onImport} />);
        fireEvent.click(await screen.findByRole('button', { name: `Select canonical sales order ${id('1')}` }));
        fireEvent.click(screen.getByRole('button', { name: 'Import order to challan' }));
        await waitFor(() => expect(ordersApi.getById).toHaveBeenCalled());
        expect(onImport).not.toHaveBeenCalled();
    });
});
