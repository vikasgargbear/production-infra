/**
 * useStockState Hook
 * Centralized state management for CurrentStock using useReducer
 * Replaces 24 useState calls with a single reducer
 */

import { useReducer } from 'react';
import type { StockUIState, SortConfig } from '../types/stock.types';

// ============================================================================
// State Type
// ============================================================================

interface StockLocalState {
    ui: StockUIState;
    selectedIds: Set<number>;
}

// ============================================================================
// Action Types
// ============================================================================

type StockAction =
    | { type: 'SET_SEARCH_QUERY'; query: string }
    | { type: 'SET_CATEGORY'; category: string }
    | { type: 'SET_LOCATION'; location: string }
    | { type: 'TOGGLE_LOW_STOCK' }
    | { type: 'TOGGLE_EXPIRING' }
    | { type: 'SET_DATE_FILTER'; filter: string }
    | { type: 'SET_SORT'; config: SortConfig }
    | { type: 'TOGGLE_DETAILS' }
    | { type: 'TOGGLE_EDIT_MODAL' }
    | { type: 'TOGGLE_MORE_FILTERS' }
    | { type: 'TOGGLE_HELP_MODAL' }
    | { type: 'SET_MORE_FILTERS'; filters: { stockStatus?: string; expiryPeriod?: string; packType?: string } }
    | { type: 'SET_SELECTED_IDS'; ids: Set<number> }
    | { type: 'TOGGLE_SELECTION'; id: number }
    | { type: 'SELECT_ALL'; ids: number[] }
    | { type: 'DESELECT_ALL' }
    | { type: 'RESET' };

// ============================================================================
// Initial State
// ============================================================================

const initialState: StockLocalState = {
    ui: {
        searchQuery: '',
        selectedCategory: 'all',
        selectedLocation: 'all',
        showLowStock: false,
        showExpiring: false,
        dateFilter: 'all',
        sortConfig: { key: 'product_name', direction: 'asc' },
        showDetails: false,
        showEditModal: false,
        showMoreFilters: false,
        showHelpModal: false,
        moreFilters: {
            stockStatus: 'all',
            expiryPeriod: 'all',
            packType: 'all'
        }
    },
    selectedIds: new Set()
};

// ============================================================================
// Reducer
// ============================================================================

function stockReducer(
    state: StockLocalState,
    action: StockAction
): StockLocalState {
    switch (action.type) {
        case 'SET_SEARCH_QUERY':
            return {
                ...state,
                ui: { ...state.ui, searchQuery: action.query }
            };

        case 'SET_CATEGORY':
            return {
                ...state,
                ui: { ...state.ui, selectedCategory: action.category }
            };

        case 'SET_LOCATION':
            return {
                ...state,
                ui: { ...state.ui, selectedLocation: action.location }
            };

        case 'TOGGLE_LOW_STOCK':
            return {
                ...state,
                ui: { ...state.ui, showLowStock: !state.ui.showLowStock }
            };

        case 'TOGGLE_EXPIRING':
            return {
                ...state,
                ui: { ...state.ui, showExpiring: !state.ui.showExpiring }
            };

        case 'SET_DATE_FILTER':
            return {
                ...state,
                ui: { ...state.ui, dateFilter: action.filter }
            };

        case 'SET_SORT':
            return {
                ...state,
                ui: { ...state.ui, sortConfig: action.config }
            };

        case 'TOGGLE_DETAILS':
            return {
                ...state,
                ui: { ...state.ui, showDetails: !state.ui.showDetails }
            };

        case 'TOGGLE_EDIT_MODAL':
            return {
                ...state,
                ui: { ...state.ui, showEditModal: !state.ui.showEditModal }
            };

        case 'TOGGLE_MORE_FILTERS':
            return {
                ...state,
                ui: { ...state.ui, showMoreFilters: !state.ui.showMoreFilters }
            };

        case 'TOGGLE_HELP_MODAL':
            return {
                ...state,
                ui: { ...state.ui, showHelpModal: !state.ui.showHelpModal }
            };

        case 'SET_MORE_FILTERS':
            return {
                ...state,
                ui: {
                    ...state.ui,
                    moreFilters: { ...state.ui.moreFilters, ...action.filters }
                }
            };

        case 'SET_SELECTED_IDS':
            return {
                ...state,
                selectedIds: action.ids
            };

        case 'TOGGLE_SELECTION':
            const newIds = new Set(state.selectedIds);
            if (newIds.has(action.id)) {
                newIds.delete(action.id);
            } else {
                newIds.add(action.id);
            }
            return {
                ...state,
                selectedIds: newIds
            };

        case 'SELECT_ALL':
            return {
                ...state,
                selectedIds: new Set(action.ids)
            };

        case 'DESELECT_ALL':
            return {
                ...state,
                selectedIds: new Set()
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

export function useStockState() {
    const [state, dispatch] = useReducer(stockReducer, initialState);

    return {
        state,
        dispatch,
        // Convenience accessors
        ui: state.ui,
        selectedIds: state.selectedIds
    };
}
