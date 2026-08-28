import type { DocumentImportType } from '../../global/modals/DocumentImportModal';
import { challansApi, invoicesApi } from '../../../services/api';
import { extractDocumentCollection, extractDocumentDetail } from '../utils/documentImport';

export const salesOrderImportDocumentTypes: DocumentImportType[] = [
    {
        value: 'invoice',
        label: 'Invoices',
        loadFunction: async (searchQuery?: string) => {
            const response = await invoicesApi.getAll({ search: searchQuery, limit: 50 });
            return extractDocumentCollection(response, ['invoices']);
        },
        resolveDocument: async (document: any) => {
            const response = await invoicesApi.getById(document.invoice_id || document.id);
            return extractDocumentDetail(response, ['invoice']);
        },
    },
    {
        value: 'challan',
        label: 'Delivery Challans',
        loadFunction: async (searchQuery?: string) => {
            const response = await challansApi.getAll({ search: searchQuery, limit: 50 });
            return extractDocumentCollection(response, ['challans', 'delivery_challans']);
        },
        resolveDocument: async (document: any) => {
            const response = await challansApi.getById(document.challan_id || document.id);
            return extractDocumentDetail(response, ['challan', 'delivery_challan']);
        },
    },
];
