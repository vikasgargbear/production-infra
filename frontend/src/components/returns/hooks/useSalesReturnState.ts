/**
 * useSalesReturnState Hook
 * Centralized state management for SalesReturnFlow using useReducer
 * Replaces 14 useState calls with a single reducer
 */

import { useReducer } from 'react';
import type { ReturnUIState, ReturnFormData, ReturnReason } from '../types/return.types';
import type { Customer, Invoice } from '../../../types/api.types';

// ============================================================================
// State Type
// ============================================================================

interface ReturnLocalState {
    ui: ReturnUIState;
    returnData: ReturnFormData;
    selectedCustomer: Customer | null;
    selectedInvoice: Invoice | null;
    returnReasons: ReturnReason[];
}

// ============================================================================
// Action Types
// ============================================================================

type ReturnAction =
    | { type: 'SET_STEP'; step: number }
    | { type: 'TOGGLE_CUSTOMER_MODAL' }
    | { type: 'SET_SHOW_INVOICE_SECTION'; show: boolean }
    | { type: 'SET_RETURN_DATA'; data: Partial<ReturnFormData> }
    | { type: 'SET_SELECTED_CUSTOMER'; customer: Customer | null }
    | { type: 'SET_SELECTED_INVOICE'; invoice: Invoice | null }
    | { type: 'SET_RETURN_REASONS'; reasons: ReturnReason[] }
    | { type: 'RESET' };

// ============================================================================
// Initial State
// ============================================================================

const initialReturnData: ReturnFormData = {
    return_no: '',
    return_date: '',
    customer_id: '',
    customer_details: null,
    invoice_id: '',
    invoice_number: '',
    invoice_date: '',
    original_invoice: null,
    items: [],
    return_reason: '',
    return_reason_notes: '',
    subtotal_amount: '',
    tax_amount: '',
    total_amount: '',
    credit_note_no: '',
    gst_tax_treatment: '',
    return_reason_choices: [],
    statutory_itc_reversal_evidence: [],
    recipient_itc_reversal_evidence_attachment_id: '',
    recipient_itc_reversal_confirmed_at: '',
    branch_id: ''
};

const initialState: ReturnLocalState = {
    ui: {
        currentStep: 1,
        showCustomerModal: false,
        showInvoiceSection: true
    },
    returnData: initialReturnData,
    selectedCustomer: null,
    selectedInvoice: null,
    returnReasons: [],
};

// ============================================================================
// Reducer
// ============================================================================

function returnReducer(
    state: ReturnLocalState,
    action: ReturnAction
): ReturnLocalState {
    switch (action.type) {
        case 'SET_STEP':
            return {
                ...state,
                ui: { ...state.ui, currentStep: action.step }
            };

        case 'TOGGLE_CUSTOMER_MODAL':
            return {
                ...state,
                ui: { ...state.ui, showCustomerModal: !state.ui.showCustomerModal }
            };

        case 'SET_SHOW_INVOICE_SECTION':
            return {
                ...state,
                ui: { ...state.ui, showInvoiceSection: action.show }
            };

        case 'SET_RETURN_DATA':
            return {
                ...state,
                returnData: { ...state.returnData, ...action.data }
            };

        case 'SET_SELECTED_CUSTOMER':
            return {
                ...state,
                selectedCustomer: action.customer
            };

        case 'SET_SELECTED_INVOICE':
            return {
                ...state,
                selectedInvoice: action.invoice
            };

        case 'SET_RETURN_REASONS':
            return {
                ...state,
                returnReasons: action.reasons
            };

        case 'RESET':
            return initialState;

        default:
            return state;
    }
}

// ============================================================================
// Hook
// ============================================================================

export function useSalesReturnState() {
    const [state, dispatch] = useReducer(returnReducer, initialState);

    return {
        state,
        dispatch,
        // Convenience accessors
        ui: state.ui,
        returnData: state.returnData,
        selectedCustomer: state.selectedCustomer,
        selectedInvoice: state.selectedInvoice,
        returnReasons: state.returnReasons,
    };
}
