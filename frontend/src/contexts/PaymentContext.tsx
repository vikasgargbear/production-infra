import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// Types
export interface PaymentAllocation {
    invoice_id: string;
    invoice_number: string;
    amount: string;
}

export interface CustomerDetails {
    customer_id: string;
    customer_name: string;
    [key: string]: any;
}

export interface Payment {
    customer_id: string;
    customer_name: string;
    customer_details: CustomerDetails | null;
    receipt_no: string;
    payment_date: string;
    amount: string;
    payment_mode: string;
    reference_number: string;
    bank_account_id: string;
    settlement_account_id: string;
    remarks: string;
    allocation_method: string;
    allocations: PaymentAllocation[];
}

interface PaymentState {
    payment: Payment;
    selectedCustomer: CustomerDetails | null;
    outstandingInvoices: any[];
    selectedInvoices: any[];
    currentStep: number;
    saving: boolean;
    errors: Record<string, string>;
    touched: Record<string, boolean>;
    message: string;
    messageType: 'info' | 'error' | 'success';
}

type PaymentAction =
    | { type: 'SET_PAYMENT_FIELD'; field: string; value: any }
    | { type: 'SET_PAYMENT_DATA'; data: Partial<Payment> }
    | { type: 'SET_CUSTOMER'; customer: CustomerDetails | null }
    | { type: 'SET_OUTSTANDING_INVOICES'; invoices: any[] }
    | { type: 'SET_SELECTED_INVOICES'; invoices: any[] }
    | { type: 'SET_CURRENT_STEP'; step: number }
    | { type: 'SET_SAVING'; saving: boolean }
    | { type: 'SET_ERROR'; field: string; error: string }
    | { type: 'CLEAR_ERROR'; field: string }
    | { type: 'SET_ERRORS'; errors: Record<string, string> }
    | { type: 'SET_TOUCHED'; field: string }
    | { type: 'SET_MESSAGE'; message: string; messageType: 'info' | 'error' | 'success' }
    | { type: 'CLEAR_MESSAGE' }
    | { type: 'RESET_PAYMENT' };

interface PaymentContextValue extends PaymentState {
    setPaymentField: (field: string, value: any) => void;
    setPaymentData: (data: Partial<Payment>) => void;
    setCustomer: (customer: CustomerDetails | null) => void;
    setOutstandingInvoices: (invoices: any[]) => void;
    setSelectedInvoices: (invoices: any[]) => void;
    setCurrentStep: (step: number) => void;
    setSaving: (saving: boolean) => void;
    setError: (field: string, error: string) => void;
    clearError: (field: string) => void;
    setErrors: (errors: Record<string, string>) => void;
    setTouched: (field: string) => void;
    setMessage: (message: string, messageType?: 'info' | 'error' | 'success') => void;
    clearMessage: () => void;
    resetPayment: () => void;
}

// Initial state
const initialState: PaymentState = {
    payment: {
        customer_id: '',
        customer_name: '',
        customer_details: null,
        receipt_no: '',
        payment_date: '',
        amount: '',
        payment_mode: '',
        reference_number: '',
        bank_account_id: '',
        settlement_account_id: '',
        remarks: '',
        allocation_method: 'fifo',
        allocations: []
    },
    selectedCustomer: null,
    outstandingInvoices: [],
    selectedInvoices: [],
    currentStep: 1,
    saving: false,
    errors: {},
    touched: {},
    message: '',
    messageType: 'info'
};

// Reducer
const paymentReducer = (state: PaymentState, action: PaymentAction): PaymentState => {
    switch (action.type) {
        case 'SET_PAYMENT_FIELD':
            return {
                ...state,
                payment: {
                    ...state.payment,
                    [action.field]: action.value
                }
            };

        case 'SET_PAYMENT_DATA':
            return {
                ...state,
                payment: {
                    ...state.payment,
                    ...action.data
                }
            };

        case 'SET_CUSTOMER':
            return {
                ...state,
                selectedCustomer: action.customer,
                payment: {
                    ...state.payment,
                    customer_id: action.customer?.customer_id || '',
                    customer_name: action.customer?.customer_name || '',
                    customer_details: action.customer
                }
            };

        case 'SET_OUTSTANDING_INVOICES':
            return {
                ...state,
                outstandingInvoices: action.invoices
            };

        case 'SET_SELECTED_INVOICES':
            return {
                ...state,
                selectedInvoices: action.invoices
            };

        case 'SET_CURRENT_STEP':
            return {
                ...state,
                currentStep: action.step
            };

        case 'SET_SAVING':
            return {
                ...state,
                saving: action.saving
            };

        case 'SET_ERROR':
            return {
                ...state,
                errors: {
                    ...state.errors,
                    [action.field]: action.error
                }
            };

        case 'CLEAR_ERROR':
            const newErrors = { ...state.errors };
            delete newErrors[action.field];
            return {
                ...state,
                errors: newErrors
            };

        case 'SET_ERRORS':
            return {
                ...state,
                errors: action.errors
            };

        case 'SET_TOUCHED':
            return {
                ...state,
                touched: {
                    ...state.touched,
                    [action.field]: true
                }
            };

        case 'SET_MESSAGE':
            return {
                ...state,
                message: action.message,
                messageType: action.messageType || 'info'
            };

        case 'CLEAR_MESSAGE':
            return {
                ...state,
                message: '',
                messageType: 'info'
            };

        case 'RESET_PAYMENT':
            return {
                ...initialState,
                payment: {
                    ...initialState.payment,
                    payment_date: '',
                    allocation_method: 'fifo'
                }
            };

        default:
            return state;
    }
};

// Context
const PaymentContext = createContext<PaymentContextValue | null>(null);

// Provider
interface PaymentProviderProps {
    children: ReactNode;
}

export const PaymentProvider: React.FC<PaymentProviderProps> = ({ children }) => {
    const [state, dispatch] = useReducer(paymentReducer, initialState);

    const value: PaymentContextValue = {
        ...state,
        setPaymentField: (field, value) => dispatch({ type: 'SET_PAYMENT_FIELD', field, value }),
        setPaymentData: (data) => dispatch({ type: 'SET_PAYMENT_DATA', data }),
        setCustomer: (customer) => dispatch({ type: 'SET_CUSTOMER', customer }),
        setOutstandingInvoices: (invoices) => dispatch({ type: 'SET_OUTSTANDING_INVOICES', invoices }),
        setSelectedInvoices: (invoices) => dispatch({ type: 'SET_SELECTED_INVOICES', invoices }),
        setCurrentStep: (step) => dispatch({ type: 'SET_CURRENT_STEP', step }),
        setSaving: (saving) => dispatch({ type: 'SET_SAVING', saving }),
        setError: (field, error) => dispatch({ type: 'SET_ERROR', field, error }),
        clearError: (field) => dispatch({ type: 'CLEAR_ERROR', field }),
        setErrors: (errors) => dispatch({ type: 'SET_ERRORS', errors }),
        setTouched: (field) => dispatch({ type: 'SET_TOUCHED', field }),
        setMessage: (message, messageType = 'info') => dispatch({ type: 'SET_MESSAGE', message, messageType }),
        clearMessage: () => dispatch({ type: 'CLEAR_MESSAGE' }),
        resetPayment: () => dispatch({ type: 'RESET_PAYMENT' })
    };

    return (
        <PaymentContext.Provider value={value}>
            {children}
        </PaymentContext.Provider>
    );
};

// Hook
export const usePayment = (): PaymentContextValue => {
    const context = useContext(PaymentContext);
    if (!context) {
        throw new Error('usePayment must be used within a PaymentProvider');
    }
    return context;
};

export default PaymentContext;
