import { apiHelpers } from '../../apiClient';
import { purchasesApi } from './purchases.api';

jest.mock('../../apiClient', () => ({
    apiHelpers: {
        post: jest.fn(),
    },
}));

describe('purchase invoice upload transport', () => {
    it('uses the validated parse-only endpoint and lets the browser set the multipart boundary', () => {
        const formData = new FormData();
        formData.append('file', new File(['%PDF-1.7'], 'invoice.pdf', { type: 'application/pdf' }));

        purchasesApi.parseInvoice(formData);

        expect(apiHelpers.post).toHaveBeenCalledWith(
            '/purchase-upload/parse-invoice-safe',
            formData,
        );
    });
});
