/**
 * useInvoiceListState Hook
 * Centralized state management for InvoiceList component using useReducer
 * Replaces 15 useState calls with a single reducer
 */

import { useReducer } from 'react';
import type { InvoiceListState, Invoice, InvoiceFilters, InvoicePagination } from '../types/invoicelist.types';

// ============================================================================
// Action Types
// ============================================================================

type InvoiceListAction =
    | { type: 'SET_INVOICES'; invoices: Invoice[] }
    | { type: 'SET_LOADING'; loading: boolean }
    | { type: 'SET_ERROR'; error: string | null }
    | { type: 'TOGGLE_SELECT'; id: string }
    | { type: 'TOGGLE_SELECT_ALL'; invoiceIds: string[] }
    | { type: 'CLEAR_SELECTION' }
    | { type: 'SET_FILTERS'; filters: Partial<InvoiceFilters> }
    | { type: 'TOGGLE_SHOW_FILTERS' }
    | { type: 'SET_PAGINATION'; pagination: Partial<InvoicePagination> }
    | { type: 'SET_REFRESHING'; refreshing: boolean }
    | { type: 'SET_REFRESH_SUCCESS'; success: boolean }
    | { type: 'SET_EXPORTING'; exporting: boolean }
    | { type: 'SET_EXPORT_SUCCESS'; success: boolean }
    | { type: 'RESET' };

// ============================================================================
// Initial State
// ============================================================================

const initialState: InvoiceListState = {
    invoices: [],
    selectedIds: new Set<string>(),
    filters: {
        searchQuery: '',
        dateFilter: 'all',
        dateFrom: '',
        dateTo: '',
        statusFilter: 'all'
    },
    ui: {
        showFilters: false,
        refreshing: false,
        exporting: false,
        refreshSuccess: false,
        exportSuccess: false
    },
    pagination: {
        total: 0,
        page: 1,
        per_page: 25,
        total_pages: 0
    },
    loading: false,
    error: null
};

// ============================================================================
// Reducer
// ============================================================================

function invoiceListReducer(
    state: InvoiceListState,
    action: InvoiceListAction
): InvoiceListState {
    switch (action.type) {
        case 'SET_INVOICES':
            return {
                ...state,
                invoices: action.invoices
            };

        case 'SET_LOADING':
            return {
                ...state,
                loading: action.loading
            };

        case 'SET_ERROR':
            return {
                ...state,
                error: action.error
            };

        case 'TOGGLE_SELECT': {
            const newSelectedIds = new Set(state.selectedIds);
            if (newSelectedIds.has(action.id)) {
                newSelectedIds.delete(action.id);
            } else {
                newSelectedIds.add(action.id);
            }
            return {
                ...state,
                selectedIds: newSelectedIds
            };
        }

        case 'TOGGLE_SELECT_ALL': {
            const allSelected = action.invoiceIds.every(id => state.selectedIds.has(id));
            const newSelectedIds = new Set(state.selectedIds);

            if (allSelected) {
                action.invoiceIds.forEach(id => newSelectedIds.delete(id));
            } else {
                action.invoiceIds.forEach(id => newSelectedIds.add(id));
            }

            return {
                ...state,
                selectedIds: newSelectedIds
            };
        }

        case 'CLEAR_SELECTION':
            return {
                ...state,
                selectedIds: new Set<string>()
            };

        case 'SET_FILTERS':
            return {
                ...state,
                filters: { ...state.filters, ...action.filters }
            };

        case 'TOGGLE_SHOW_FILTERS':
            return {
                ...state,
                ui: { ...state.ui, showFilters: !state.ui.showFilters }
            };

        case 'SET_PAGINATION':
            return {
                ...state,
                pagination: { ...state.pagination, ...action.pagination }
            };

        case 'SET_REFRESHING':
            return {
                ...state,
                ui: { ...state.ui, refreshing: action.refreshing }
            };

        case 'SET_REFRESH_SUCCESS':
            return {
                ...state,
                ui: { ...state.ui, refreshSuccess: action.success }
            };

        case 'SET_EXPORTING':
            return {
                ...state,
                ui: { ...state.ui, exporting: action.exporting }
            };

        case 'SET_EXPORT_SUCCESS':
            return {
                ...state,
                ui: { ...state.ui, exportSuccess: action.success }
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

export function useInvoiceListState() {
    const [state, dispatch] = useReducer(invoiceListReducer, initialState);

    return {
        state,
        dispatch,
        // Convenience accessors
        invoices: state.invoices,
        selectedIds: state.selectedIds,
        filters: state.filters,
        ui: state.ui,
        pagination: state.pagination,
        loading: state.loading,
        error: state.error
    };
}
