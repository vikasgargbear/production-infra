/**
 * GST Module - Shared Type Definitions
 * 
 * Comprehensive types for GST Reports, Dashboard, Filing, and Reconciliation
 */

// ==================== DATE & PERIOD ====================

export interface DateRange {
    from: string;
    to: string;
}

export type GSTReportPeriod = 'current' | 'previous' | 'quarter' | 'year' | 'custom';

// ==================== B2B & B2C DATA ====================

export interface B2BInvoice {
    gst_number: string;
    name: string;
    invoices: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
}

export interface B2CData {
    count: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
}

// ==================== GST SUMMARY ====================

export interface GSTSummary {
    totalInvoices: number;
    totalTaxableValue: number;
    totalCGST: number;
    totalSGST: number;
    totalIGST: number;
    totalTax: number;
    creditAdjustment?: number;
    debitAdjustment?: number;
    netAdjustment?: number;
}

// ==================== INPUT TAX CREDIT ====================

export interface InputTaxCredit {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
}

// ==================== REPORT DATA STRUCTURES ====================

export interface GSTR1Data {
    b2b: B2BInvoice[];
    b2c: {
        small: B2CData;
        large: B2CData;
    };
    summary: GSTSummary;
}

export interface GSTR2BData extends GSTR1Data {
    inputCredit?: InputTaxCredit;
}

export interface GSTR3BData extends GSTR1Data {
    outputTax: number;
    inputCredit: number;
    netPayable: number;
}

export interface HSNSummaryItem {
    hsn_code: string;
    description: string;
    quantity: number;
    taxable_value: number;
    tax_rate: number;
    tax_amount: number;
}

export interface PartyWiseItem {
    party_name: string;
    gst_number: string;
    total_taxable_value: number;
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    total_tax: number;
}

// ==================== CREDIT/DEBIT NOTES ====================

export interface CreditDebitNote {
    note_id: number | string;
    note_number: string;
    note_type: 'credit' | 'debit';
    note_date: string;
    original_invoice_number?: string;
    customer_name?: string;
    customer_gst_number?: string;
    reason?: string;
    amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_tax: number;
}

export interface CreditDebitSummary {
    totalCreditNotes: number;
    totalDebitNotes: number;
    totalCreditAmount: number;
    totalDebitAmount: number;
    netAdjustment: number;
    netTaxAdjustment: number;
}

// ==================== REPORT TYPES ====================

export type GSTReportType =
    | 'gstr-1'      // Outward Supplies
    | 'gstr-2b'     // Input Tax Credit (absorbs Input Credit Report)
    | 'gstr-3b'     // Summary Return (absorbs GST Payable Report)
    | 'hsn-summary' // Product-wise GST
    | 'party-wise'; // Customer GST details

export interface ReportTypeConfig {
    id: GSTReportType;
    name: string;
    description: string;
    icon: React.ComponentType<any>;
    color: string;
}

// ==================== EXPORT FORMATS ====================

export type ExportFormat = 'excel' | 'pdf' | 'json';

export interface ExportOptions {
    format: ExportFormat;
    filename?: string;
    includeNotes?: boolean;
    includeBreakdown?: boolean;
}

// ==================== PAGINATION ====================

export interface PaginationState {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
}

// ==================== API RESPONSES ====================

export interface GSTAPIResponse<T = any> {
    data?: T;
    summary?: GSTSummary;
    invoices?: any[];
    notes?: CreditDebitNote[];
    success: boolean;
    message?: string;
}

// ==================== DASHBOARD DATA ====================

export interface GSTDashboardData {
    outputTax?: number;
    inputCredit?: number;
    netPayable?: number;
    taxPayable?: number;
    inputTax?: number;
    complianceScore?: number;
    pending_returns?: number;
    total_invoices?: number;
    total_suppliers?: number;
    recent_activity?: any[];
    summary?: {
        total_invoices?: number;
        total_suppliers?: number;
    };
}

export interface GSTReturnsData {
    gstr1?: {
        status?: string;
        dueDate?: string;
        amount?: number;
        filedDate?: string;
    };
    gstr3b?: {
        status?: string;
        dueDate?: string;
        amount?: number;
        filedDate?: string;
    };
    gstr2a?: {
        status?: string;
        lastUpdated?: string;
        amount?: number;
    };
}

export interface GSTSettingsData {
    gst_number?: string;
    is_valid?: boolean;
}

// ==================== FILING DATA ====================

export interface GSTFilingData {
    return_type: GSTReportType;
    period: string;
    status: 'pending' | 'filed' | 'late';
    due_date: string;
    filed_date?: string;
    amount: number;
}

// ==================== RECONCILIATION DATA ====================

export interface ReconciliationItem {
    invoice_number: string;
    invoice_date: string;
    party_name: string;
    gst_number: string;
    taxable_amount: number;
    tax_amount: number;
    status: 'matched' | 'unmatched' | 'partial';
    discrepancy?: number;
}

export interface ReconciliationSummary {
    totalInvoices: number;
    matched: number;
    unmatched: number;
    partialMatch: number;
    totalDiscrepancy: number;
}

// ==================== VALIDATION ====================

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
