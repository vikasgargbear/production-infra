/**
 * GST Transform Utilities
 * 
 * Transform API responses into UI-ready data structures
 */

import type { GSTR1Data, B2BInvoice, GSTSummary, HSNSummaryItem, PartyWiseItem } from '../types';
import { groupByGSTIN, calculateB2CSummary, calculateGSTSummary } from './gstCalculations';

/**
 * Transform invoices to GSTR1 format
 */
export function transformInvoicesToGSTR1(
    invoices: any[],
    customerData: Record<string, any> = {}
): GSTR1Data {
    // Separate B2B (with GSTIN) and B2C (without GSTIN) invoices
    const b2bInvoices: any[] = [];
    const b2cInvoices: any[] = [];

    invoices.forEach(invoice => {
        const customerId = invoice.customer_id;
        const customer = customerData[customerId];

        // Check for GSTIN in multiple possible locations
        const hasGSTIN =
            invoice.customer_gst_number ||
            invoice.gst_number ||
            customer?.gst_number ||
            customer?.gst_number ||
            customer?.gst_no;

        if (hasGSTIN) {
            b2bInvoices.push({
                ...invoice,
                customer_gst_number: hasGSTIN
            });
        } else {
            b2cInvoices.push(invoice);
        }
    });

    // Group B2B invoices by GSTIN
    const b2bGrouped = Array.from(groupByGSTIN(b2bInvoices).values());

    // Calculate B2C summary
    const b2c = calculateB2CSummary(b2cInvoices);

    // Calculate overall summary
    const summary = calculateGSTSummary(invoices);

    return {
        b2b: b2bGrouped,
        b2c,
        summary
    };
}

/**
 * Transform GSTR1 API response
 */
export function transformGSTR1Response(data: any): GSTR1Data {
    return {
        b2b: data.b2b || [],
        b2c: data.b2c || {
            small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
            large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        summary: data.summary || {
            totalInvoices: 0,
            totalTaxableValue: 0,
            totalCGST: 0,
            totalSGST: 0,
            totalIGST: 0,
            totalTax: 0
        }
    };
}

/**
 * Transform GSTR2B API response (Purchase/Input Credit)
 */
export function transformGSTR2BResponse(data: any): GSTR1Data {
    const invoices = data.invoices || [];
    const summary = data.summary || {};

    // Map supplier invoices to B2B format
    const b2b: B2BInvoice[] = invoices.map((inv: any) => ({
        gst_number: inv.supplier_gst_number || inv.gst_number || '',
        name: inv.supplier_name || inv.name || 'Unknown Supplier',
        invoices: 1,
        taxableValue: inv.taxable_amount || 0,
        cgst: inv.cgst_amount || 0,
        sgst: inv.sgst_amount || 0,
        igst: inv.igst_amount || 0
    }));

    return {
        b2b,
        b2c: {
            small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
            large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        summary: {
            totalInvoices: summary.totalInvoices || invoices.length,
            totalTaxableValue: summary.totalTaxableValue || 0,
            totalCGST: summary.totalCGST || 0,
            totalSGST: summary.totalSGST || 0,
            totalIGST: summary.totalIGST || 0,
            totalTax: summary.totalITC || summary.totalTax || 0
        }
    };
}

/**
 * Transform dashboard data to GSTR1 format
 */
export function transformDashboardToGSTR1(dashboardData: any): GSTR1Data {
    return {
        b2b: [],
        b2c: {
            small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
            large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        summary: {
            totalInvoices: dashboardData.summary?.total_invoices || 0,
            totalTaxableValue: dashboardData.outputTax || 0,
            totalCGST: 0,
            totalSGST: 0,
            totalIGST: dashboardData.outputTax || 0,
            totalTax: dashboardData.outputTax || 0
        }
    };
}

/**
 * Transform HSN summary data
 */
export function transformHSNResponse(data: any): GSTR1Data {
    const hsnItems = data.hsn_summary || data.items || [];

    // For HSN report, we use B2B array to display HSN items
    const b2b: any[] = hsnItems.map((item: HSNSummaryItem) => ({
        gst_number: item.hsn_code,
        name: item.description,
        invoices: 1,
        taxableValue: item.taxable_value,
        cgst: item.tax_amount / 2, // Assuming equal CGST/SGST
        sgst: item.tax_amount / 2,
        igst: 0
    }));

    return {
        b2b,
        b2c: {
            small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
            large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        summary: data.summary || {
            totalInvoices: hsnItems.length,
            totalTaxableValue: 0,
            totalCGST: 0,
            totalSGST: 0,
            totalIGST: 0,
            totalTax: 0
        }
    };
}

/**
 * Transform party-wise data
 */
export function transformPartyWiseResponse(data: any): GSTR1Data {
    const parties = data.parties || data.party_wise || [];

    const b2b: B2BInvoice[] = parties.map((party: PartyWiseItem) => ({
        gst_number: party.gst_number,
        name: party.party_name,
        invoices: 1,
        taxableValue: party.total_taxable_value,
        cgst: party.total_cgst,
        sgst: party.total_sgst,
        igst: party.total_igst
    }));

    return {
        b2b,
        b2c: {
            small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
            large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        summary: data.summary || {
            totalInvoices: parties.length,
            totalTaxableValue: 0,
            totalCGST: 0,
            totalSGST: 0,
            totalIGST: 0,
            totalTax: 0
        }
    };
}

/**
 * Transform GST payable data
 */
export function transformGSTPayableResponse(data: any): GSTR1Data {
    return {
        b2b: [],
        b2c: {
            small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
            large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        summary: {
            totalInvoices: 0,
            totalTaxableValue: data.output_tax || 0,
            totalCGST: 0,
            totalSGST: 0,
            totalIGST: data.tax_payable || 0,
            totalTax: data.tax_payable || 0
        }
    };
}

/**
 * Clean and normalize invoice data
 */
export function normalizeInvoiceData(invoice: any): any {
    return {
        invoice_id: invoice.invoice_id || invoice.id,
        invoice_number: invoice.invoice_number || invoice.number,
        invoice_date: invoice.invoice_date || invoice.date,
        customer_id: invoice.customer_id,
        customer_name: invoice.customer_name || invoice.party_name,
        customer_gst_number: invoice.customer_gst_number || invoice.gst_number,
        subtotal_amount: invoice.taxable_amount || 0,
        cgst_amount: invoice.cgst_amount || 0,
        sgst_amount: invoice.sgst_amount || 0,
        igst_amount: invoice.igst_amount || 0,
        total_amount: invoice.total_amount || invoice.net_amount,
        items: invoice.items || []
    };
}
