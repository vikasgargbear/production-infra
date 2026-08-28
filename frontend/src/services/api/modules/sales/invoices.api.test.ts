import { apiHelpers } from '../../apiClient';
import { invoicesApi } from './invoices.api';
import { ordersApi } from './orders.api';
import { challansApi } from './challans.api';

jest.mock('../../apiClient', () => ({
    apiHelpers: {
        get: jest.fn(),
        post: jest.fn(),
    },
}));

describe('canonical invoice web transport', () => {
    it('uses prepare, approve, execute, then reads the authoritative invoice', async () => {
        const post = apiHelpers.post as jest.Mock;
        const get = apiHelpers.get as jest.Mock;
        post
            .mockResolvedValueOnce({ data: {
                command_request_id: '10000000-0000-4000-8000-000000000001',
                preview_hash: `sha256:${'a'.repeat(64)}`,
            } })
            .mockResolvedValueOnce({ data: { status: 'approved' } })
            .mockResolvedValueOnce({ data: {
                status: 'succeeded',
                resource_id: '10000000-0000-4000-8000-000000000002',
            } });
        get.mockResolvedValueOnce({ data: {
            invoice_number: 'INV-2026-0001',
            total_amount: '118.00',
        } });

        const response = await invoicesApi.createCanonical({
            idempotency_key: 'erp-web-invoice:test-0001',
        });

        expect(post.mock.calls.map(call => call[0])).toEqual([
            '/web/actions/sales.invoice.prepare/prepare',
            '/web/actions/commands/10000000-0000-4000-8000-000000000001/approve',
            '/web/actions/commands/10000000-0000-4000-8000-000000000001/execute',
        ]);
        expect(get).toHaveBeenCalledWith(
            '/canonical/invoices/10000000-0000-4000-8000-000000000002',
        );
        expect(response.data).toEqual(expect.objectContaining({
            success: true,
            invoice_id: '10000000-0000-4000-8000-000000000002',
            invoice_number: 'INV-2026-0001',
            total_amount: '118.00',
        }));
    });

    it('uses unique canonical exact-detail aliases for all document imports', () => {
        const get = apiHelpers.get as jest.Mock;
        get.mockResolvedValue({ data: {} });

        invoicesApi.getById('invoice-uuid');
        ordersApi.getById('order-uuid', '2026-08-26');
        challansApi.getById('challan-uuid');

        expect(get.mock.calls.map(call => call[0])).toEqual([
            '/canonical/invoices/invoice-uuid',
            '/canonical/sales-orders/order-uuid/import-detail',
            '/canonical/challans/challan-uuid/import-detail',
        ]);
        expect(get.mock.calls[1][1]).toEqual({
            params: { dispatch_date: '2026-08-26' },
            preserveExactDecimals: true,
        });
        expect(get.mock.calls[2][1]).toEqual({ preserveExactDecimals: true });
    });
});
