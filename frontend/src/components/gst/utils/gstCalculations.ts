/**
 * GST Calculations Utilities
 * 
 * Shared calculation logic for GST reports and tax type determination
 */

import type { GSTSummary, B2BInvoice, B2CData, InputTaxCredit } from '../types';

const toAmount = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

// =============================================================================
// GST TYPE DETERMINATION
// =============================================================================

/**
 * GST Type: IGST for inter-state, CGST/SGST for intra-state
 */
export type GstType = 'IGST' | 'CGST/SGST';

/**
 * Determine GST Type based on GSTIN state codes or company/customer state names.
 *
 * WARNING: This uses GSTIN registration state, NOT delivery address.
 * For invoice/supply scenarios, prefer `determineGstTypeForSupply()` which
 * correctly uses delivery address as Place of Supply per IGST Act Section 10.
 *
 * @param companyState - The seller's/company's state name
 * @param partyState - The buyer's/customer's/supplier's state name
 * @param companyGstin - The seller's GSTIN (optional, preferred)
 * @param partyGstin - The buyer's GSTIN (optional, preferred)
 * @returns 'IGST' for inter-state, 'CGST/SGST' for intra-state
 */
export function determineGstType(
    companyState: string | undefined | null,
    partyState: string | undefined | null,
    companyGstin?: string | null,
    partyGstin?: string | null
): GstType {
    // Priority 1: GSTIN-based comparison (first 2 digits = state code)
    if (companyGstin && partyGstin && companyGstin.length >= 2 && partyGstin.length >= 2) {
        const companyStateCode = companyGstin.substring(0, 2);
        const partyStateCode = partyGstin.substring(0, 2);
        if (/^\d{2}$/.test(companyStateCode) && /^\d{2}$/.test(partyStateCode)) {
            return companyStateCode !== partyStateCode ? 'IGST' : 'CGST/SGST';
        }
    }

    // Priority 2: State name comparison (fallback)
    const normalizedCompanyState = companyState?.toLowerCase().trim();
    const normalizedPartyState = partyState?.toLowerCase().trim();

    // If either state is missing, default to intra-state (safer for compliance)
    if (!normalizedCompanyState || !normalizedPartyState) {
        return 'CGST/SGST';
    }

    return normalizedCompanyState !== normalizedPartyState ? 'IGST' : 'CGST/SGST';
}

/**
 * Determine GST type for goods/services SUPPLY based on Place of Supply rules.
 *
 * USE THIS for invoices, credit notes, purchase returns — anywhere goods move.
 *
 * Indian GST Law:
 *   GOODS  (IGST Act Section 10): Place of Supply = where goods movement terminates (delivery address)
 *   SERVICES (IGST Act Section 12): Place of Supply = location of recipient
 *
 * Priority:
 *   1. Delivery address state (Place of Supply) — legally correct for goods
 *   2. GSTIN state codes — fallback when delivery state unknown
 *   3. State name comparison — last resort
 *
 * Example: Customer registered in Maharashtra (27) but delivery to Rajasthan (08)
 *          Seller in Rajasthan (08) → Same state → CGST/SGST (NOT IGST!)
 *
 * @param sellerState - Seller/company state name
 * @param placeOfSupply - Delivery address state (for goods) or recipient state (for services)
 * @param sellerGstin - Seller's GSTIN (fallback only)
 * @param buyerGstin - Buyer's GSTIN (fallback only)
 */
export function determineGstTypeForSupply(
    sellerState: string | undefined | null,
    placeOfSupply: string | undefined | null,
    sellerGstin?: string | null,
    buyerGstin?: string | null
): GstType {
    // PRIMARY: Place of Supply (delivery address state) vs Seller state
    if (placeOfSupply && sellerState) {
        const normalizedSeller = sellerState.toLowerCase().trim();
        const normalizedPOS = placeOfSupply.toLowerCase().trim();
        return normalizedSeller !== normalizedPOS ? 'IGST' : 'CGST/SGST';
    }

    // FALLBACK: When place of supply is unknown, use GSTIN/state comparison
    return determineGstType(sellerState, null, sellerGstin, buyerGstin);
}

// =============================================================================
// TAX CALCULATIONS
// =============================================================================

/**
 * Calculate total tax from CGST, SGST, and IGST
 */
export function calculateTotalTax(cgst: number, sgst: number, igst: number): number {
    return Math.round((cgst + sgst + igst) * 100) / 100;
}

/**
 * Calculate GST amount from taxable value and rate
 */
export function calculateGSTAmount(taxableValue: number, gstRate: number): number {
    return Math.round((taxableValue * gstRate) / 100 * 100) / 100;
}

/**
 * Calculate net payable GST (Output Tax - Input Credit)
 */
export function calculateNetPayable(outputTax: number, inputCredit: number): number {
    return Math.round((outputTax - inputCredit) * 100) / 100;
}

/**
 * Calculate compliance score based on filing status
 */
export function calculateComplianceScore(
    totalReturns: number,
    filedReturns: number,
    lateReturns: number
): number {
    if (totalReturns === 0) return 100;

    const onTimeReturns = filedReturns - lateReturns;
    const score = (onTimeReturns / totalReturns) * 100;

    return Math.round(score * 10) / 10;
}

/**
 * Group invoices by GSTIN for B2B calculation
 */
export function groupByGSTIN(invoices: any[]): Map<string, B2BInvoice> {
    const grouped = new Map<string, B2BInvoice>();

    invoices.forEach(invoice => {
        const gst_number = invoice.customer_gst_number || invoice.gst_number || '';
        const name = invoice.customer_name || invoice.name || 'Unknown';

        if (!grouped.has(gst_number)) {
            grouped.set(gst_number, {
                gst_number,
                name,
                invoices: 0,
                taxableValue: 0,
                cgst: 0,
                sgst: 0,
                igst: 0
            });
        }

        const group = grouped.get(gst_number)!;
        group.invoices += 1;
        group.taxableValue += toAmount(invoice.taxable_amount);
        group.cgst += toAmount(invoice.cgst_amount);
        group.sgst += toAmount(invoice.sgst_amount);
        group.igst += toAmount(invoice.igst_amount);
    });

    return grouped;
}

/**
 * Calculate B2C summary (invoices without GSTIN)
 */
export function calculateB2CSummary(invoices: any[]): { small: B2CData; large: B2CData } {
    const small: B2CData = {
        count: 0,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0
    };

    const large: B2CData = {
        count: 0,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0
    };

    const B2C_THRESHOLD = 250000; // Rs. 2.5 lakhs

    invoices.forEach(invoice => {
        const hasGSTIN = invoice.customer_gst_number || invoice.gst_number;
        if (hasGSTIN) return; // Skip B2B invoices

        const taxableValue = toAmount(invoice.taxable_amount);
        const isLarge = taxableValue >= B2C_THRESHOLD;

        const target = isLarge ? large : small;
        target.count += 1;
        target.taxableValue += taxableValue;
        target.cgst += toAmount(invoice.cgst_amount);
        target.sgst += toAmount(invoice.sgst_amount);
        target.igst += toAmount(invoice.igst_amount);
    });

    return { small, large };
}

/**
 * Calculate GST summary from invoices
 */
export function calculateGSTSummary(invoices: any[]): GSTSummary {
    let totalInvoices = 0;
    let totalTaxableValue = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;

    invoices.forEach(invoice => {
        totalInvoices += 1;
        totalTaxableValue += toAmount(invoice.taxable_amount);
        totalCGST += toAmount(invoice.cgst_amount);
        totalSGST += toAmount(invoice.sgst_amount);
        totalIGST += toAmount(invoice.igst_amount);
    });

    const totalTax = calculateTotalTax(totalCGST, totalSGST, totalIGST);

    return {
        totalInvoices,
        totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
        totalCGST: Math.round(totalCGST * 100) / 100,
        totalSGST: Math.round(totalSGST * 100) / 100,
        totalIGST: Math.round(totalIGST * 100) / 100,
        totalTax
    };
}

/**
 * Calculate input tax credit from purchase invoices
 */
export function calculateInputCredit(purchases: any[]): InputTaxCredit {
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    purchases.forEach(purchase => {
        cgst += toAmount(purchase.cgst_amount);
        sgst += toAmount(purchase.sgst_amount);
        igst += toAmount(purchase.igst_amount);
    });

    return {
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100,
        igst: Math.round(igst * 100) / 100,
        total: Math.round((cgst + sgst + igst) * 100) / 100
    };
}

/**
 * Apply credit/debit note adjustments to GST summary
 */
export function applyNoteAdjustments(
    summary: GSTSummary,
    notes: any[]
): GSTSummary {
    let creditAdjustment = 0;
    let debitAdjustment = 0;

    classifyGSTR1Notes(notes).forEach(note => {
        const taxAmount = toAmount(note.cgst_amount) + toAmount(note.sgst_amount) + toAmount(note.igst_amount);

        if (note.gstr1Direction === 'credit') {
            creditAdjustment += taxAmount;
        } else if (note.gstr1Direction === 'debit') {
            debitAdjustment += taxAmount;
        }
    });

    const netAdjustment = Math.round((debitAdjustment - creditAdjustment) * 100) / 100;

    return {
        ...summary,
        creditAdjustment: Math.round(creditAdjustment * 100) / 100,
        debitAdjustment: Math.round(debitAdjustment * 100) / 100,
        netAdjustment,
        totalTax: Math.round((summary.totalTax + netAdjustment) * 100) / 100
    };
}

export type ClassifiedGSTR1Note = Record<string, any> & {
    gstr1Direction: 'credit' | 'debit';
};

/** GSTR-1 contains outward/sales notes only; canonical note_type is sales_credit/sales_debit. */
export function classifyGSTR1Notes(notes: any[]): ClassifiedGSTR1Note[] {
    return notes.flatMap(note => {
        const compositeType = String(note?.note_type || '').toLowerCase();
        const side = String(note?.side || compositeType.split('_')[0] || '').toLowerCase();
        const direction = String(note?.direction || compositeType.split('_')[1] || compositeType).toLowerCase();
        if (side !== 'sales' || (direction !== 'credit' && direction !== 'debit')) return [];
        return [{ ...note, gstr1Direction: direction } as ClassifiedGSTR1Note];
    });
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
    return `₹${amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

/**
 * Calculate financial year from date
 */
export function getFinancialYear(date: Date = new Date()): string {
    const month = date.getMonth(); // 0-11
    const year = date.getFullYear();

    if (month >= 3) { // April onwards
        return `${year}-${year + 1}`;
    } else { // Jan-Mar
        return `${year - 1}-${year}`;
    }
}

/**
 * Get financial year date range
 */
export function getFinancialYearRange(fyString?: string): { from: string; to: string } {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let startYear: number;

    if (fyString) {
        // Parse "2024-2025" format
        startYear = parseInt(fyString.split('-')[0]);
    } else {
        // Current FY
        startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    }

    const from = `${startYear}-04-01`;
    const to = `${startYear + 1}-03-31`;

    return { from, to };
}
