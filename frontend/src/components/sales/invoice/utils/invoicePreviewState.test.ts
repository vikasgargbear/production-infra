import type { Invoice } from '../hooks/useInvoiceLogic';
import { canonicalInvoicePreviewUnavailableReason } from '../../utils/canonicalSalesPreviewFacts';
import { applyCanonicalInvoicePreview } from './invoicePreviewState';

const originalItem = {
    product_id: '10000000-0000-7000-8000-000000000001',
    product_name: 'Canonical Carton',
    batch_id: '10000000-0000-7000-8000-000000000002',
    batch_number: 'BATCH-1',
    branch_id: '10000000-0000-7000-8000-000000000003',
    location_id: '10000000-0000-7000-8000-000000000004',
    uom_conversion_id: '10000000-0000-7000-8000-000000000005',
    quantity: '1.000000',
    free_quantity: '0.000000',
    free_supply_tax_treatment: 'excluded_from_taxable_value' as const,
    available_quantity: '10.000000',
    unit_price: '100.000000',
    mrp: '120.000000',
    gst_percent: '0.000000',
    discount_percent: '0.000000',
};

const invoice = {
    items: [originalItem],
    totals: null,
    final_amount: '0.00',
    gst_type: '',
} as Invoice;

const previewItem = {
    ...originalItem,
    gst_percent: '12.000000',
    taxable_amount: '100.00',
    cgst_amount: '6.00',
    sgst_amount: '6.00',
    igst_amount: '0.00',
    total_tax_amount: '12.00',
    line_total: '112.00',
};

const preview = {
    items: [previewItem],
    totals: {
        subtotal_amount: '100.00',
        subtotal: '100.00',
        gross_amount: '100.00',
        discount_amount: '0.00',
        total_discount: '0.00',
        scheme_discount: '0.00',
        scheme_discount_percent: '0.000000',
        taxable_before_scheme: '100.00',
        taxable_amount: '100.00',
        cgst_amount: '6.00',
        sgst_amount: '6.00',
        igst_amount: '0.00',
        total_tax_amount: '12.00',
        tax_amount: '12.00',
        total_tax: '12.00',
        total_gst: '12.00',
        cgst_total: '6.00',
        sgst_total: '6.00',
        igst_total: '0.00',
        freight_charges: '0.00',
        insurance_charges: '0.00',
        other_charges: '0.00',
        round_off_amount: '0.00',
        round_off: '0.00',
        net_amount: '112.00',
        final_amount: '112.00',
        total_amount: '112.00',
    },
    gst_type: 'CGST/SGST' as const,
};

describe('canonical invoice preview state', () => {
    it('keeps authoritative GST treatment with the item-step totals', () => {
        const next = applyCanonicalInvoicePreview(invoice, preview, { replaceItems: false });

        expect(next).toEqual(expect.objectContaining({
            gst_type: 'CGST/SGST',
            final_amount: '112.00',
            totals: expect.objectContaining({ final_amount: '112.00' }),
        }));
        expect(next.items).toBe(invoice.items);
    });

    it('moves authoritative GST treatment, lines, and totals together into preview', () => {
        const historicalProjection = {
            ...invoice,
            items: preview.items,
            totals: preview.totals,
            final_amount: preview.totals.final_amount,
        };
        expect(canonicalInvoicePreviewUnavailableReason(historicalProjection)).toMatch(
            /GST treatment is unavailable/,
        );

        const next = applyCanonicalInvoicePreview(invoice, preview, { replaceItems: true });

        expect(next.gst_type).toBe('CGST/SGST');
        expect(next.items).toBe(preview.items);
        expect(next.totals).toBe(preview.totals);
        expect(next.final_amount).toBe('112.00');
        expect(canonicalInvoicePreviewUnavailableReason(next)).toBeNull();
    });
});
