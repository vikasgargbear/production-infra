/** Boundary between invoice UI state and canonical backend calculations. */

import EnterpriseCalculator from '../enterpriseCalculator';
import {
    invoiceCalculationsApi,
    InvoiceCalculationRequest,
    InvoiceCalculationResponse
} from '../api/modules/sales/calculations.api';


function toRequest(invoice: any): InvoiceCalculationRequest {
    const customer = invoice?.customer_details;
    const customerId = customer?.customer_id ?? customer?.id;

    return {
        // Canonical ERP entities use UUIDs. Preserve the identifier instead of
        // coercing it to Number (which serializes a UUID as null via NaN).
        customer_id: customerId == null ? undefined : customerId,
        gst_type: invoice?.gst_type,
        items: (invoice?.items || []).map((item: any) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            free_quantity: item.free_quantity || 0,
            free_supply_tax_treatment:
                item.free_supply_tax_treatment || 'excluded_from_taxable_value',
            unit_price: item.unit_price,
            discount_percent: item.discount_percent || 0,
            gst_percent: item.gst_percent ?? item.tax_percent ?? 0
        })),
        freight_charges: invoice?.freight_charges || 0,
        insurance_charges: invoice?.insurance_charges || 0,
        other_charges: invoice?.other_charges || 0,
        discount_type: invoice?.discount_type || 'percentage',
        discount_percent: invoice?.discount_percent || 0,
        discount_amount: invoice?.discount_amount || 0
    };
}

export function normalizeInvoicePreview(invoice: any, data: InvoiceCalculationResponse) {
    const totals = data.totals;
    const roundOff = Number(totals.round_off_amount || 0);
    const items = data.line_items.map((line, index) => ({
        ...(invoice.items[index] || {}),
        ...line,
        gst_amount: line.total_tax_amount,
        total_amount: line.line_total
    }));

    return {
        items,
        totals: {
            ...totals,
            subtotal: totals.subtotal_amount,
            gross_amount: totals.subtotal_amount,
            total_discount: totals.discount_amount,
            taxable_before_scheme:
                Number(totals.taxable_amount || 0) + Number(totals.scheme_discount || 0),
            tax_amount: totals.total_tax_amount,
            total_tax: totals.total_tax_amount,
            total_gst: totals.total_tax_amount,
            cgst_total: totals.cgst_amount,
            sgst_total: totals.sgst_amount,
            igst_total: totals.igst_amount,
            round_off: roundOff,
            net_amount: Number(totals.final_amount || 0) - roundOff,
            total_amount: totals.final_amount,
            final_amount: totals.final_amount
        },
        gst_type: data.gst_type
    };
}

export async function calculateInvoicePreview(invoice: any, isOnline: boolean) {
    if (!isOnline) {
        return {
            ...EnterpriseCalculator.calculateInvoice(invoice),
            gst_type: invoice?.gst_type || 'CGST/SGST'
        };
    }

    const response = await invoiceCalculationsApi.preview(toRequest(invoice));
    return normalizeInvoicePreview(invoice, response.data);
}
