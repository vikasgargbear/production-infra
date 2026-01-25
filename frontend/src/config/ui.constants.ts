/**
 * UI Constants - Centralized Labels, Terminology & Dimensions
 * 
 * This file standardizes all UI text and dimensions across the application
 * to ensure consistent brand UX.
 */

// ============================================
// STANDARDIZED LABELS
// ============================================

export const UI_LABELS = {
    // Action button labels - use "Create" consistently
    actions: {
        CREATE_CUSTOMER: 'Create Customer',
        CREATE_PRODUCT: 'Create Product',
        CREATE_SUPPLIER: 'Create Supplier',
        CREATE_INVOICE: 'Create Invoice',
        CREATE_ORDER: 'Create Order',
        CREATE_PAYMENT: 'Create Payment',
        CREATE_NOTE: 'Create Note',
        SAVE: 'Save',
        SAVE_DRAFT: 'Save Draft',
        CANCEL: 'Cancel',
        CLOSE: 'Close',
        PROCEED: 'Proceed to Review',
        CONFIRM: 'Confirm',
        SUBMIT: 'Submit',
        REFRESH: 'Refresh',
        RESET: 'Reset',
        CHANGE: 'Change',
        EDIT: 'Edit',
        DELETE: 'Delete',
        VIEW: 'View',
        SEARCH: 'Search',
    },

    // Section headers - UPPERCASE consistently
    sections: {
        CUSTOMER: 'CUSTOMER',
        PRODUCTS: 'PRODUCTS',
        ITEMS: 'ITEMS',
        INVOICE_ITEMS: 'INVOICE ITEMS',
        PAYMENT: 'PAYMENT',
        PAYMENT_DETAILS: 'PAYMENT DETAILS',
        PAYMENT_METHOD: 'PAYMENT METHOD',
        PAYMENT_AMOUNT: 'PAYMENT AMOUNT',
        DATE: 'DATE',
        NOTES: 'NOTES',
        SUMMARY: 'SUMMARY',
        DETAILS: 'DETAILS',
        SELECT_INVOICE: 'SELECT INVOICE',
        SELECT_CUSTOMER: 'SELECT CUSTOMER',
    },

    // Placeholders
    placeholders: {
        SEARCH_CUSTOMER: 'Search customer by name, phone, or code...',
        SEARCH_PRODUCT: 'Search product by name, code, or manufacturer...',
        SEARCH_SUPPLIER: 'Search supplier by name, phone, or GSTIN...',
        SEARCH_INVOICE: 'Search by invoice number...',
        ENTER_AMOUNT: 'Enter amount',
        SELECT_DATE: 'Select date',
        NOTES: 'Additional notes...',
    },
} as const;

// ============================================
// STANDARDIZED DIMENSIONS
// ============================================

export const UI_DIMENSIONS = {
    // Button dimensions
    button: {
        minWidth: {
            sm: '100px',
            md: '140px',
            lg: '180px',
        },
        height: {
            sm: '32px',
            md: '38px',
            lg: '44px',
        },
    },

    // Input dimensions
    input: {
        height: {
            sm: '36px',
            md: '42px',
            lg: '48px',
        },
    },

    // Card/Section dimensions
    section: {
        padding: {
            sm: '12px',
            md: '16px',
            lg: '24px',
        },
        gap: {
            sm: '12px',
            md: '16px',
            lg: '24px',
        },
    },

    // Icon sizes
    icon: {
        sm: '14px',
        md: '16px',
        lg: '20px',
        xl: '24px',
    },
} as const;

// ============================================
// TAILWIND CLASS PRESETS
// ============================================

export const UI_CLASSES = {
    // Section header pattern
    sectionHeader: {
        wrapper: 'flex items-center justify-between mb-3',
        title: 'text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center',
        titleGreen: 'text-sm font-semibold text-green-700 uppercase tracking-wider flex items-center',
        titleOrange: 'text-sm font-semibold text-orange-700 uppercase tracking-wider flex items-center',
        icon: 'w-4 h-4 mr-2',
    },

    // Action buttons - standard dimensions
    actionButton: {
        primary: 'min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium',
        primaryGreen: 'min-w-[140px] px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium',
        secondary: 'min-w-[140px] px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm font-medium',
        danger: 'min-w-[140px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium',
        // Small variant
        sm: 'min-w-[100px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
        // Link style
        link: 'text-sm text-blue-600 hover:text-blue-700 font-medium',
    },

    // Card wrapper pattern
    cardWrapper: 'bg-white rounded-lg border border-gray-200 p-4',

    // Input standard classes
    input: {
        base: 'w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors',
        sm: 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
        lg: 'w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
        error: 'border-red-500 focus:ring-red-500',
        disabled: 'bg-gray-100 cursor-not-allowed opacity-60',
    },

    // Date picker custom style to match input heights
    datePicker: {
        wrapper: 'relative',
        input: 'w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors',
        icon: 'absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none',
    },

    // Amount input with currency symbol
    amountInput: {
        wrapper: 'relative',
        symbol: 'absolute left-3 top-1/2 -translate-y-1/2 text-lg text-green-600 font-semibold',
        input: 'w-full pl-8 pr-3 py-2.5 text-lg font-semibold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
    },

    // Selected item display (e.g., selected customer/invoice)
    selectedItem: {
        wrapper: 'flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200',
        wrapperBlue: 'flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200',
        content: 'flex-1',
        title: 'font-medium text-gray-900',
        subtitle: 'text-sm text-gray-600',
        changeButton: 'text-sm text-blue-600 hover:text-blue-700 font-medium',
    },

    // Empty state / Select button
    selectButton: {
        base: 'w-full px-4 py-3 border-2 border-dashed rounded-lg transition-colors flex items-center justify-center gap-2',
        blue: 'border-blue-300 text-blue-600 hover:border-blue-400 hover:bg-blue-50',
        green: 'border-green-300 text-green-600 hover:border-green-400 hover:bg-green-50',
        orange: 'border-orange-300 text-orange-600 hover:border-orange-400 hover:bg-orange-50',
    },
} as const;

// ============================================
// EXPORTS
// ============================================

export default {
    labels: UI_LABELS,
    dimensions: UI_DIMENSIONS,
    classes: UI_CLASSES,
};
