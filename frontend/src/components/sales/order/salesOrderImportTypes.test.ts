import { challansApi, invoicesApi } from '../../../services/api';
import { salesOrderImportDocumentTypes } from './salesOrderImportTypes';

jest.mock('../../../services/api', () => ({
    invoicesApi: { getAll: jest.fn(), getById: jest.fn() },
    challansApi: { getAll: jest.fn(), getById: jest.fn() },
}));

describe('Sales Order import document types', () => {
    beforeEach(() => jest.clearAllMocks());

    it('offers both invoices and delivery challans', () => {
        expect(salesOrderImportDocumentTypes.map(type => [type.value, type.label])).toEqual([
            ['invoice', 'Invoices'],
            ['challan', 'Delivery Challans'],
        ]);
    });

    it('loads and resolves an invoice through API reads', async () => {
        (invoicesApi.getAll as jest.Mock).mockResolvedValue({ data: { invoices: [{ invoice_id: 'i-1' }] } });
        (invoicesApi.getById as jest.Mock).mockResolvedValue({ data: { invoice: { invoice_id: 'i-1', items: [] } } });
        const invoiceType = salesOrderImportDocumentTypes[0];

        await expect(invoiceType.loadFunction('INV-1')).resolves.toEqual([{ invoice_id: 'i-1' }]);
        await expect(invoiceType.resolveDocument?.({ invoice_id: 'i-1' })).resolves.toEqual({ invoice_id: 'i-1', items: [] });
        expect(invoicesApi.getAll).toHaveBeenCalledWith({ search: 'INV-1', limit: 50 });
        expect(invoicesApi.getById).toHaveBeenCalledWith('i-1');
    });

    it('loads and resolves a delivery challan through API reads', async () => {
        (challansApi.getAll as jest.Mock).mockResolvedValue({ data: { delivery_challans: [{ challan_id: 'c-1' }] } });
        (challansApi.getById as jest.Mock).mockResolvedValue({ data: { delivery_challan: { challan_id: 'c-1', items: [] } } });
        const challanType = salesOrderImportDocumentTypes[1];

        await expect(challanType.loadFunction()).resolves.toEqual([{ challan_id: 'c-1' }]);
        await expect(challanType.resolveDocument?.({ challan_id: 'c-1' })).resolves.toEqual({ challan_id: 'c-1', items: [] });
        expect(challansApi.getById).toHaveBeenCalledWith('c-1');
    });
});
