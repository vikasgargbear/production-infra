/**
 * GST Calculations Utilities
 * 
 * Shared calculation logic for GST reports and tax type determination
 */

import type { GSTSummary, B2BInvoice, B2CData, InputTaxCredit } from '../types';

// =============================================================================
// GST TYPE DETERMINATION
// =============================================================================

/**
 * GST Type: IGST for inter-state, CGST/SGST for intra-state
 */
export type GstType = 'IGST' | 'CGST/SGST';

/**
 * Determine GST Type based on company state vs customer/supplier state.
 * 
 * Indian GST Rules:
 * - IGST (Integrated GST) = Inter-state transactions (different states)
 * - CGST/SGST (Central + State GST) = Intra-state transactions (same state)
 * 
 * @param companyState - The seller's/company's state
 * @param partyState - The buyer's/customer's/supplier's state  
 * @returns 'IGST' for inter-state, 'CGST/SGST' for intra-state
 * 
 * @example
 * // Inter-state: Rajasthan → Haryana
 * determineGstType('Rajasthan', 'Haryana') // Returns 'IGST'
 * 
 * // Intra-state: Rajasthan → Rajasthan  
 * determineGstType('Rajasthan', 'Rajasthan') // Returns 'CGST/SGST'
 */
export function determineGstType(
    companyState: string | undefined | null,
    partyState: string | undefined | null
): GstType {
    // Normalize states for comparison (lowercase, trimmed)
    const normalizedCompanyState = companyState?.toLowerCase().trim();
    const normalizedPartyState = partyState?.toLowerCase().trim();

    // If either state is missing, default to intra-state (safer for compliance)
    if (!normalizedCompanyState || !normalizedPartyState) {
        console.log('[GST] Missing state info, defaulting to CGST/SGST');
        return 'CGST/SGST';
    }

    const isInterState = normalizedCompanyState !== normalizedPartyState;
    const gstType: GstType = isInterState ? 'IGST' : 'CGST/SGST';

    console.log(`[GST] Company: ${normalizedCompanyState}, Party: ${normalizedPartyState} → ${gstType}`);
    return gstType;
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
        group.taxableValue += invoice.taxable_amount || 0;
        group.cgst += invoice.cgst_amount || 0;
        group.sgst += invoice.sgst_amount || 0;
        group.igst += invoice.igst_amount || 0;
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

        const taxableValue = invoice.taxable_amount || 0;
        const isLarge = taxableValue >= B2C_THRESHOLD;

        const target = isLarge ? large : small;
        target.count += 1;
        target.taxableValue += taxableValue;
        target.cgst += invoice.cgst_amount || 0;
        target.sgst += invoice.sgst_amount || 0;
        target.igst += invoice.igst_amount || 0;
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
        totalTaxableValue += invoice.taxable_amount || 0;
        totalCGST += invoice.cgst_amount || 0;
        totalSGST += invoice.sgst_amount || 0;
        totalIGST += invoice.igst_amount || 0;
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
        cgst += purchase.cgst_amount || 0;
        sgst += purchase.sgst_amount || 0;
        igst += purchase.igst_amount || 0;
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

    notes.forEach(note => {
        const taxAmount = (note.cgst_amount || 0) + (note.sgst_amount || 0) + (note.igst_amount || 0);

        if (note.note_type === 'credit') {
            creditAdjustment += taxAmount;
        } else if (note.note_type === 'debit') {
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
