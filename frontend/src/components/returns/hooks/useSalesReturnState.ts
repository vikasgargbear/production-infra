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
    customerDues: number;
    returnReasons: ReturnReason[];
    manualItemCounter: number;
    availableBatches: Record<number, any[]>;
}

// ============================================================================
// Action Types
// ============================================================================

type ReturnAction =
    | { type: 'SET_STEP'; step: number }
    | { type: 'TOGGLE_CUSTOMER_MODAL' }
    | { type: 'TOGGLE_MANUAL_ENTRY' }
    | { type: 'SET_SHOW_INVOICE_SECTION'; show: boolean }
    | { type: 'SET_RETURN_DATA'; data: Partial<ReturnFormData> }
    | { type: 'SET_SELECTED_CUSTOMER'; customer: Customer | null }
    | { type: 'SET_SELECTED_INVOICE'; invoice: Invoice | null }
    | { type: 'SET_CUSTOMER_DUES'; dues: number }
    | { type: 'SET_RETURN_REASONS'; reasons: ReturnReason[] }
    | { type: 'INCREMENT_MANUAL_COUNTER' }
    | { type: 'SET_AVAILABLE_BATCHES'; productId: number; batches: any[] }
    | { type: 'RESET' };

// ============================================================================
// Initial State
// ============================================================================

const initialReturnData: ReturnFormData = {
    return_no: '',
    return_date: new Date().toISOString().split('T')[0],
    customer_id: '',
    customer_details: null,
    invoice_id: '',
    invoice_number: '',
    invoice_date: '',
    original_invoice: null,
    items: [],
    return_reason: '',
    return_reason_notes: '',
    return_method: 'credit_note',
    subtotal_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    credit_note_no: '',
    status: 'PENDING',
    include_gst: true,
    credit_adjustment_type: 'future'
};

const initialState: ReturnLocalState = {
    ui: {
        currentStep: 1,
        showCustomerModal: false,
        showManualEntry: false,
        showInvoiceSection: true
    },
    returnData: initialReturnData,
    selectedCustomer: null,
    selectedInvoice: null,
    customerDues: 0,
    returnReasons: [],
    manualItemCounter: 1,
    availableBatches: {}
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

        case 'TOGGLE_MANUAL_ENTRY':
            return {
                ...state,
                ui: { ...state.ui, showManualEntry: !state.ui.showManualEntry }
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

        case 'SET_CUSTOMER_DUES':
            return {
                ...state,
                customerDues: action.dues
            };

        case 'SET_RETURN_REASONS':
            return {
                ...state,
                returnReasons: action.reasons
            };

        case 'INCREMENT_MANUAL_COUNTER':
            return {
                ...state,
                manualItemCounter: state.manualItemCounter + 1
            };

        case 'SET_AVAILABLE_BATCHES':
            return {
                ...state,
                availableBatches: {
                    ...state.availableBatches,
                    [action.productId]: action.batches
                }
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
        customerDues: state.customerDues,
        returnReasons: state.returnReasons,
        manualItemCounter: state.manualItemCounter,
        availableBatches: state.availableBatches
    };
}
