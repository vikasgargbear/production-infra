import type { calculateInvoicePreview } from '../../../../services/calculations/invoiceCalculationService';
import type { Invoice } from '../hooks/useInvoiceLogic';

type CanonicalInvoicePreview = Awaited<ReturnType<typeof calculateInvoicePreview>>;

/** Apply one authoritative calculation response as one state transition. */
export function applyCanonicalInvoicePreview(
    previous: Invoice,
    preview: CanonicalInvoicePreview,
    options: { replaceItems: boolean },
): Invoice {
    return {
        ...previous,
        totals: preview.totals,
        final_amount: preview.totals.final_amount,
        // The server resolves GST treatment from the same facts as the totals.
        // Dropping it creates an internally inconsistent, fail-closed preview.
        gst_type: preview.gst_type,
        ...(options.replaceItems ? { items: preview.items } : {}),
    };
}
