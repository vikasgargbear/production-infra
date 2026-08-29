import { invoicesApi } from '../../../../services/api/modules/sales/invoices.api';
import {
    downloadInvoicePDF,
    printableCanonicalInvoice,
    printInvoice,
} from '../../../../utils/invoicePdfGenerator';
import {
    downloadCanonicalInvoiceById,
    printCanonicalInvoiceById,
} from './canonicalInvoiceOutput';

jest.mock('../../../../services/api/modules/sales/invoices.api', () => ({
    invoicesApi: { getById: jest.fn() },
}));
jest.mock('../../../../utils/invoicePdfGenerator', () => ({
    printableCanonicalInvoice: jest.fn(detail => ({ canonical: detail.invoice_id })),
    printInvoice: jest.fn(),
    downloadInvoicePDF: jest.fn(),
}));

const detail = { invoice_id: '10000000-0000-4000-8000-000000000119' };

beforeEach(() => {
    jest.clearAllMocks();
    (invoicesApi.getById as jest.Mock).mockResolvedValue({ data: detail });
    (printableCanonicalInvoice as jest.Mock).mockImplementation(
        canonicalDetail => ({ canonical: canonicalDetail.invoice_id }),
    );
});

test('post-save print fetches and renders the captured canonical invoice by ID', async () => {
    await printCanonicalInvoiceById(detail.invoice_id);

    expect(invoicesApi.getById).toHaveBeenCalledWith(detail.invoice_id);
    expect(printableCanonicalInvoice).toHaveBeenCalledWith(detail);
    expect(printInvoice).toHaveBeenCalledWith({ canonical: detail.invoice_id });
});

test('post-save download fetches and renders the captured canonical invoice by ID', async () => {
    await downloadCanonicalInvoiceById(detail.invoice_id);

    expect(invoicesApi.getById).toHaveBeenCalledWith(detail.invoice_id);
    expect(printableCanonicalInvoice).toHaveBeenCalledWith(detail);
    expect(downloadInvoicePDF).toHaveBeenCalledWith({ canonical: detail.invoice_id });
});

test('post-save output fails closed when canonical detail cannot be fetched', async () => {
    (invoicesApi.getById as jest.Mock).mockRejectedValue(new Error('canonical detail unavailable'));

    await expect(downloadCanonicalInvoiceById(detail.invoice_id))
        .rejects.toThrow('canonical detail unavailable');
    expect(printableCanonicalInvoice).not.toHaveBeenCalled();
    expect(downloadInvoicePDF).not.toHaveBeenCalled();
});
