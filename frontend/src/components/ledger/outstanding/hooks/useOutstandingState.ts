/**
 * useOutstandingState Hook
 * Centralized state management for Outstanding component using useReducer
 * Replaces 7 useState calls with a single reducer
 */

import { useReducer } from 'react';
import type {
    OutstandingState,
    OutstandingFilters,
    PartyOutstanding
} from '../types/outstanding.types';

// ============================================================================
// Action Types
// ============================================================================

type OutstandingAction =
    | { type: 'TOGGLE_PARTY_EXPANSION'; partyId: string }
    | { type: 'SET_FILTERS'; filters: Partial<OutstandingFilters> }
    | { type: 'SET_VIEW_MODE'; mode: 'summary' | 'aging' }
    | { type: 'SET_SELECTED_PARTY'; party: PartyOutstanding | null }
    | { type: 'TOGGLE_DETAILS_VIEW' }
    | { type: 'SET_DETAILS_VIEW'; show: boolean }
    | { type: 'RESET' };

// ============================================================================
// Initial State
// ============================================================================

const initialState: OutstandingState = {
    expandedParties: new Set<string>(),
    filters: {
        status: 'all',
        searchQuery: ''
    },
    ui: {
        viewMode: 'summary',
        showDetailsView: false
    },
    selectedParty: null
};

// ============================================================================
// Reducer
// ============================================================================

function outstandingReducer(
    state: OutstandingState,
    action: OutstandingAction
): OutstandingState {
    switch (action.type) {
        case 'TOGGLE_PARTY_EXPANSION': {
            const newExpanded = new Set(state.expandedParties);
            if (newExpanded.has(action.partyId)) {
                newExpanded.delete(action.partyId);
            } else {
                newExpanded.add(action.partyId);
            }
            return {
                ...state,
                expandedParties: newExpanded
            };
        }

        case 'SET_FILTERS':
            return {
                ...state,
                filters: { ...state.filters, ...action.filters }
            };

        case 'SET_VIEW_MODE':
            return {
                ...state,
                ui: { ...state.ui, viewMode: action.mode }
            };

        case 'SET_SELECTED_PARTY':
            return {
                ...state,
                selectedParty: action.party
            };

        case 'TOGGLE_DETAILS_VIEW':
            return {
                ...state,
                ui: { ...state.ui, showDetailsView: !state.ui.showDetailsView }
            };

        case 'SET_DETAILS_VIEW':
            return {
                ...state,
                ui: { ...state.ui, showDetailsView: action.show }
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

export function useOutstandingState() {
    const [state, dispatch] = useReducer(outstandingReducer, initialState);

    return {
        state,
        dispatch,
        // Convenience accessors
        expandedParties: state.expandedParties,
        filters: state.filters,
        ui: state.ui,
        selectedParty: state.selectedParty
    };
}
