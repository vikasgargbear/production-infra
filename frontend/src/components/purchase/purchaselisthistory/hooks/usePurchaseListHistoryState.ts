/**
 * usePurchaseListHistoryState Hook
 * Centralized state management using useReducer
 * Replaces 15 useState calls with a single reducer
 */

import { useReducer } from 'react';
import type { PurchaseListHistoryState, PurchaseOrder } from '../types/purchasehistory.types';

type PurchaseListHistoryAction =
    | { type: 'SET_PURCHASES'; purchases: PurchaseOrder[] }
    | { type: 'SET_LOADING'; loading: boolean }
    | { type: 'SET_ERROR'; error: string | null }
    | { type: 'TOGGLE_SELECT'; id: string }
    | { type: 'TOGGLE_SELECT_ALL'; purchaseIds: string[] }
    | { type: 'CLEAR_SELECTION' }
    | { type: 'SET_FILTERS'; filters: Partial<PurchaseListHistoryState['filters']> }
    | { type: 'TOGGLE_SHOW_FILTERS' }
    | { type: 'SET_PAGINATION'; pagination: Partial<PurchaseListHistoryState['pagination']> }
    | { type: 'SET_REFRESHING'; refreshing: boolean }
    | { type: 'SET_EXPORTING'; exporting: boolean };

const initialState: PurchaseListHistoryState = {
    purchases: [],
    selectedIds: new Set<string>(),
    filters: {
        searchQuery: '',
        dateFilter: 'all',
        statusFilter: 'all'
    },
    ui: {
        showFilters: false,
        refreshing: false,
        exporting: false
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

function purchaseListHistoryReducer(
    state: PurchaseListHistoryState,
    action: PurchaseListHistoryAction
): PurchaseListHistoryState {
    switch (action.type) {
        case 'SET_PURCHASES':
            return { ...state, purchases: action.purchases };
        case 'SET_LOADING':
            return { ...state, loading: action.loading };
        case 'SET_ERROR':
            return { ...state, error: action.error };
        case 'TOGGLE_SELECT': {
            const newSelectedIds = new Set(state.selectedIds);
            if (newSelectedIds.has(action.id)) {
                newSelectedIds.delete(action.id);
            } else {
                newSelectedIds.add(action.id);
            }
            return { ...state, selectedIds: newSelectedIds };
        }
        case 'TOGGLE_SELECT_ALL': {
            const allSelected = action.purchaseIds.every(id => state.selectedIds.has(id));
            const newSelectedIds = new Set(state.selectedIds);
            if (allSelected) {
                action.purchaseIds.forEach(id => newSelectedIds.delete(id));
            } else {
                action.purchaseIds.forEach(id => newSelectedIds.add(id));
            }
            return { ...state, selectedIds: newSelectedIds };
        }
        case 'CLEAR_SELECTION':
            return { ...state, selectedIds: new Set<string>() };
        case 'SET_FILTERS':
            return { ...state, filters: { ...state.filters, ...action.filters } };
        case 'TOGGLE_SHOW_FILTERS':
            return { ...state, ui: { ...state.ui, showFilters: !state.ui.showFilters } };
        case 'SET_PAGINATION':
            return { ...state, pagination: { ...state.pagination, ...action.pagination } };
        case 'SET_REFRESHING':
            return { ...state, ui: { ...state.ui, refreshing: action.refreshing } };
        case 'SET_EXPORTING':
            return { ...state, ui: { ...state.ui, exporting: action.exporting } };
        default:
            return state;
    }
}

export function usePurchaseListHistoryState() {
    const [state, dispatch] = useReducer(purchaseListHistoryReducer, initialState);

    return {
        state,
        dispatch,
        purchases: state.purchases,
        selectedIds: state.selectedIds,
        filters: state.filters,
        ui: state.ui,
        pagination: state.pagination,
        loading: state.loading,
        error: state.error
    };
}
