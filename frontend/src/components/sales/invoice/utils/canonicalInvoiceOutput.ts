import { invoicesApi } from '../../../../services/api/modules/sales/invoices.api';

const canonicalOutput = async (invoiceId: string | number) => {
    const response = await invoicesApi.getById(invoiceId);
    const renderer = await import('../../../../utils/invoicePdfGenerator');
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
