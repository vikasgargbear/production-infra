import { invoicesApi } from '../../../../services/api/modules/sales/invoices.api';
// Load PDF dependencies with billing, not after deployment when an old tab's
// lazy chunk may no longer exist. This never changes invoice business state.
import * as renderer from '../../../../utils/invoicePdfGenerator';

const canonicalOutput = async (invoiceId: string | number) => {
    const response = await invoicesApi.getById(invoiceId);
    return {
        invoice: renderer.printableCanonicalInvoice(response.data),
        renderer,
    };
};

/** Print only the captured canonical invoice; never reuse the editable browser draft. */
export const printCanonicalInvoiceById = async (invoiceId: string | number): Promise<void> => {
    const { invoice, renderer } = await canonicalOutput(invoiceId);
    renderer.printInvoice(invoice);
};

/** Download only the captured canonical invoice; never reuse the editable browser draft. */
export const downloadCanonicalInvoiceById = async (invoiceId: string | number): Promise<void> => {
    const { invoice, renderer } = await canonicalOutput(invoiceId);
    await renderer.downloadInvoicePDF(invoice);
};
