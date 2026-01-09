/**
 * useSystemSettingsState Hook
 * Centralized state management using useReducer
 * Replaces 8 useState calls with a single reducer
 */

import { useReducer } from 'react';
import type { SettingsState, SystemSettingsUIState } from '../types/settings.types';

interface SystemSettingsState {
    settings: SettingsState;
    ui: SystemSettingsUIState;
}

type SystemSettingsAction =
    | { type: 'SET_SETTINGS'; settings: Partial<SettingsState> }
    | { type: 'UPDATE_SETTING'; category: string; field: string; value: any }
    | { type: 'SET_ACTIVE_TAB'; tab: string }
    | { type: 'SET_HAS_CHANGES'; hasChanges: boolean }
    | { type: 'SET_SAVING'; isSaving: boolean }
    | { type: 'SET_LOADING'; isLoading: boolean }
    | { type: 'SET_SUCCESS_MESSAGE'; message: string }
    | { type: 'SET_ERROR'; error: string | null }
    | { type: 'RESET_MESSAGES' };

const initialSettings: SettingsState = {
    general: {
        companyName: '',
        financialYear: '2024-25',
        dateFormat: 'DD/MM/YYYY',
        timeZone: 'Asia/Kolkata',
        currency: 'INR',
        currencySymbol: '₹',
        decimalPlaces: 2,
        quantityDecimalPlaces: 2
    },
    invoice: {
        prefix: 'INV',
        startNumber: 1,
        autoGenerate: true,
        showLogo: true,
        showTerms: true,
        defaultTerms: '',
        footerText: '',
        printCopies: 2
    },
    stock: {
        enableNegativeStock: false,
        enableBatchTracking: true,
        enableExpiryTracking: true,
        lowStockAlert: true,
        expiryAlertDays: 30,
        enableSerialNumbers: false,
        autoUpdatePrices: false
    },
    tax: {
        enableGST: true,
        gstNumber: '',
        defaultTaxRate: 18,
        taxInclusive: false,
        enableComposite: false,
        compositeRate: 0
    },
    notifications: {
        lowStock: true,
        expiry: true,
        pendingPayments: true,
        newOrders: true,
        emailNotifications: false,
        smsNotifications: false,
        notificationEmail: '',
        notificationPhone: ''
    },
    security: {
        sessionTimeout: 30,
        enforcePasswordChange: true,
        passwordChangeDays: 90,
        minPasswordLength: 8,
        requireSpecialChar: true,
        enableTwoFactor: false,
        maxLoginAttempts: 5
    },
    backup: {
        autoBackup: true,
        backupFrequency: 'daily',
        backupTime: '02:00',
        retentionDays: 30,
        backupLocation: 'cloud',
        emailBackupReport: false
    }
};

const initialState: SystemSettingsState = {
    settings: initialSettings,
    ui: {
        activeTab: 'general',
        hasChanges: false,
        isSaving: false,
        isLoading: false,
        successMessage: '',
        error: null
    }
};

function systemSettingsReducer(
    state: SystemSettingsState,
    action: SystemSettingsAction
): SystemSettingsState {
    switch (action.type) {
        case 'SET_SETTINGS':
            return {
                ...state,
                settings: { ...state.settings, ...action.settings }
            };

        case 'UPDATE_SETTING':
            return {
                ...state,
                settings: {
                    ...state.settings,
                    [action.category]: {
                        ...state.settings[action.category as keyof SettingsState],
                        [action.field]: action.value
                    }
                },
                ui: { ...state.ui, hasChanges: true }
            };

        case 'SET_ACTIVE_TAB':
            return {
                ...state,
                ui: { ...state.ui, activeTab: action.tab }
            };

        case 'SET_HAS_CHANGES':
            return {
                ...state,
                ui: { ...state.ui, hasChanges: action.hasChanges }
            };

        case 'SET_SAVING':
            return {
                ...state,
                ui: { ...state.ui, isSaving: action.isSaving }
            };

        case 'SET_LOADING':
            return {
                ...state,
                ui: { ...state.ui, isLoading: action.isLoading }
            };

        case 'SET_SUCCESS_MESSAGE':
            return {
                ...state,
                ui: { ...state.ui, successMessage: action.message, error: null }
            };

        case 'SET_ERROR':
            return {
                ...state,
                ui: { ...state.ui, error: action.error }
            };

        case 'RESET_MESSAGES':
            return {
                ...state,
                ui: { ...state.ui, successMessage: '', error: null }
            };

        default:
            return state;
    }
}

export function useSystemSettingsState() {
    const [state, dispatch] = useReducer(systemSettingsReducer, initialState);

    return {
        state,
        dispatch,
        settings: state.settings,
        ui: state.ui
    };
}
