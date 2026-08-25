/**
 * SalesReturnFlow Type Definitions
 * Extracted from SalesReturnFlow.tsx for better organization
 */

import type { Invoice, Customer } from '../../../types/api.types';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';

// ============================================================================
// Core Return Types
// ============================================================================

export interface ReturnFormItem {
    id?: string | number;
    product_id: number | string;
    product_name: string;
    batch_id?: number | string;
    batch_number: string;
    manufacturing_date?: string;
    expiry_date?: string;
    quantity: number | string;
    paid_quantity: number | string;
    free_quantity: number | string;
    return_quantity: number | string;
    max_returnable_qty: number | string;
    unit_price: number | string;
    discount_percent: number | string;
    tax_percent: number | string;
    selected: boolean;
    hsn_code?: string;
    unit?: string;
    uom?: string;
    manufacturer?: string;
    is_manual?: boolean;
    available_stock?: number | string;
    return_reason?: string;
    disposition?: string;
    invoice_item_id?: number | string;
    requires_approval?: boolean;
    verification_status?: string;
    [key: string]: any;
}

export interface ReturnFormData {
    return_no: string;
    return_date: string;
    customer_id: string | number;
    customer_details: Customer | null;
    invoice_id: string | number;
    invoice_number: string;
    invoice_date: string;
    original_invoice: Invoice | null;
    items: ReturnFormItem[];
    return_reason: string;
    return_reason_notes: string;
    return_method: string;
    subtotal_amount: string;
    tax_amount: string;
    total_amount: string;
    credit_note_no: string;
    status: string;
    include_gst: boolean;
    credit_adjustment_type: 'future' | 'existing_dues';
    /** Return resolution type */
    return_type: 'credit_note' | 'replacement' | 'refund' | 'no_adjustment';
    /** Whether to withhold GST from return (B2B option) */
    withhold_gst: boolean;
    branch_id?: string;
    gst_tax_treatment?: '' | 'commercial_only' | 'statutory';
    return_reason_choices?: Array<{
        reason_code: string;
        supported_gst_treatments: Array<'commercial_only' | 'statutory'>;
    }>;
    statutory_itc_reversal_evidence?: Array<Record<string, unknown>>;
    recipient_itc_reversal_evidence_attachment_id?: string;
    recipient_itc_reversal_confirmed_at?: string;
}

export interface ReturnReason {
    value: string;
    label: string;
}

// ============================================================================
// Component Props
// ============================================================================

export interface SalesReturnFlowProps {
    onClose: () => void;
}

// NOTE: ReturnCustomerSelector was removed - use CustomerSearch directly with displayMode="compact"

export interface ReturnInvoiceSelectorProps {
    selectedCustomer: Customer | null;
    selectedInvoice: Invoice | null;
    onInvoiceSelect: (invoice: Invoice | null) => void;
    onSkipInvoice: () => void;
    onChangeInvoice?: () => void;  // Clear selected invoice to allow re-selection
    showInvoiceSection: boolean;
    invoiceSearchRef: React.RefObject<any>;
}

export interface ReturnItemsTableProps {
    items: ReturnFormItem[];
    selectedInvoice: Invoice | null;
    showManualEntry: boolean;
    availableBatches: Record<number, any[]>;
    onUpdateItem: (indexOrId: string | number, field: string, value: any) => void;
    onAddManualItem: (product: any) => void;
    onRemoveItem: (itemId: string | number) => void;
    onBackToInvoice?: () => void;
}

export interface ReturnReviewPanelProps {
    returnData: ReturnFormData;
    selectedCustomer: Customer | null;
    selectedInvoice?: any;
    customerDues: number;
    onSave?: () => void;
    onPrint?: () => void;
    onBack: () => void;
    saving: boolean;
    submissionUnavailableReason?: string;
    preparedPreview?: CanonicalCommandPreview;
}

// ============================================================================
// State Management Types
// ============================================================================

export interface ReturnUIState {
    currentStep: number;
    showCustomerModal: boolean;
    showManualEntry: boolean;
    showInvoiceSection: boolean;
}

export interface ReturnAsyncState {
    loading: boolean;
    saving: boolean;
}

export interface ReturnState {
    ui: ReturnUIState;
    async: ReturnAsyncState;
    returnData: ReturnFormData;
    selectedCustomer: Customer | null;
    selectedInvoice: Invoice | null;
    customerDues: number;
    returnReasons: ReturnReason[];
    manualItemCounter: number;
    availableBatches: Record<number, any[]>;
}
