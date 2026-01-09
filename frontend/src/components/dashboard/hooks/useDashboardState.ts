/**
 * useDashboardState Hook
 * Centralized state management for Dashboard using useReducer
 * Replaces 21 useState calls with a single reducer
 */

import { useReducer } from 'react';
import type {
    AlertFilter,
    OrderFilter,
    OrderSort,
    ChartTimeRange,
    SelectedChart,
    PanelType,
    DashboardUIState
} from '../types/dashboard.types';

// ============================================================================
// State Type
// ============================================================================

interface DashboardLocalState {
    ui: DashboardUIState;
    selectedKPIs: number[];
    searchQuery: string;
}

// ============================================================================
// Action Types
// ============================================================================

type DashboardAction =
    | { type: 'SET_ALERT_FILTER'; filter: AlertFilter }
    | { type: 'SET_ORDER_FILTER'; filter: OrderFilter }
    | { type: 'SET_ORDER_SORT'; sort: OrderSort }
    | { type: 'SET_CHART_TIME_RANGE'; range: ChartTimeRange }
    | { type: 'SET_SELECTED_CHART'; chart: SelectedChart }
    | { type: 'TOGGLE_FAB' }
    | { type: 'SET_PANEL'; panel: PanelType }
    | { type: 'TOGGLE_KPI_CUSTOMIZATION' }
    | { type: 'SET_SELECTED_KPIS'; kpis: number[] }
    | { type: 'SET_SEARCH_QUERY'; query: string }
    | { type: 'RESET' };

// ============================================================================
// Initial State
// ============================================================================

const initialState: DashboardLocalState = {
    ui: {
        alertFilter: 'all',
        orderFilter: 'all',
        orderSort: { field: 'date', direction: 'desc' },
        chartTimeRange: 'monthly',
        selectedChart: 'revenue',
        fabOpen: false,
        panel: null,
        isCustomizingKPIs: false,
        showMoreFilters: false
    },
    selectedKPIs: [1, 2, 3, 4],
    searchQuery: ''
};

// ============================================================================
// Reducer
// ============================================================================

function dashboardReducer(
    state: DashboardLocalState,
    action: DashboardAction
): DashboardLocalState {
    switch (action.type) {
        case 'SET_ALERT_FILTER':
            return {
                ...state,
                ui: { ...state.ui, alertFilter: action.filter }
            };

        case 'SET_ORDER_FILTER':
            return {
                ...state,
                ui: { ...state.ui, orderFilter: action.filter }
            };

        case 'SET_ORDER_SORT':
            return {
                ...state,
                ui: { ...state.ui, orderSort: action.sort }
            };

        case 'SET_CHART_TIME_RANGE':
            return {
                ...state,
                ui: { ...state.ui, chartTimeRange: action.range }
            };

        case 'SET_SELECTED_CHART':
            return {
                ...state,
                ui: { ...state.ui, selectedChart: action.chart }
            };

        case 'TOGGLE_FAB':
            return {
                ...state,
                ui: { ...state.ui, fabOpen: !state.ui.fabOpen, panel: state.ui.fabOpen ? null : state.ui.panel }
            };

        case 'SET_PANEL':
            return {
                ...state,
                ui: { ...state.ui, panel: action.panel, fabOpen: action.panel ? false : state.ui.fabOpen }
            };

        case 'TOGGLE_KPI_CUSTOMIZATION':
            return {
                ...state,
                ui: { ...state.ui, isCustomizingKPIs: !state.ui.isCustomizingKPIs }
            };

        case 'SET_SELECTED_KPIS':
            return {
                ...state,
                selectedKPIs: action.kpis
            };

        case 'SET_SEARCH_QUERY':
            return {
                ...state,
                searchQuery: action.query
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

export function useDashboardState() {
    const [state, dispatch] = useReducer(dashboardReducer, initialState);

    return {
        state,
        dispatch,
        // Convenience accessors
        ui: state.ui,
        selectedKPIs: state.selectedKPIs,
        searchQuery: state.searchQuery
    };
}
