import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';

// Types
type SalesType = 'invoice' | 'challan' | 'sales-order';
type MessageType = 'info' | 'success' | 'error' | null;

interface TransportDetails {
    transporter_name: string;
    vehicle_no: string;
    lr_no: string;
    dispatch_date: string;
}

interface SalesItem {
    product_id: string;
    product_name: string;
    quantity: number;
    rate: number;
    amount: number;
    tax_amount?: number;
    [key: string]: any;
}

interface PartyDetails {
    id?: string;
    customer_id?: string;
    customer_name?: string;
    name?: string;
    [key: string]: any;
}

interface SalesData {
    document_no: string;
    document_date: string;
    reference_no: string;
    party_id: string | null;
    party_name: string;
    party_details: PartyDetails | null;
    items: SalesItem[];
    total_amount: number;
    discount_amount: number;
    tax_amount: number;
    other_charges: number;
    round_off: number;
    net_amount: number;
    payment_mode: string;
    payment_status: string;
    due_date: string;
    transport_details: TransportDetails;
    order_status: string;
    delivery_date: string;
    terms_conditions: string;
    notes: string;
    created_by: string;
    org_id: number | null;
}

interface SalesState {
    salesType: SalesType;
    salesData: SalesData;
    currentStep: number;
    saving: boolean;
    loading: boolean;
    message: string | null;
    messageType: MessageType;
    errors: Record<string, string>;
    selectedParty: PartyDetails | null;
    searchResults: any[];
    productSearchResults: any[];
}

type SalesAction =
    | { type: 'SET_SALES_TYPE'; payload: SalesType }
    | { type: 'SET_SALES_FIELD'; payload: { field: string; value: any } }
    | { type: 'SET_TRANSPORT_FIELD'; payload: { field: string; value: string } }
    | { type: 'SET_PARTY'; payload: PartyDetails | null }
    | { type: 'ADD_ITEM'; payload: SalesItem }
    | { type: 'UPDATE_ITEM'; payload: { index: number; item: SalesItem } }
    | { type: 'REMOVE_ITEM'; payload: number }
    | { type: 'CALCULATE_TOTALS' }
    | { type: 'SET_MESSAGE'; payload: { message: string; type: MessageType } }
    | { type: 'CLEAR_MESSAGE' }
    | { type: 'SET_ERROR'; payload: { field: string; error: string } }
    | { type: 'CLEAR_ERROR'; payload: string }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_SAVING'; payload: boolean }
    | { type: 'SET_CURRENT_STEP'; payload: number }
    | { type: 'RESET_SALES' }
    | { type: 'SET_SEARCH_RESULTS'; payload: any[] }
    | { type: 'SET_PRODUCT_SEARCH_RESULTS'; payload: any[] };

const generateDocumentNumber = (type: SalesType): string => {
    const prefix = {
        'invoice': 'INV',
        'challan': 'DC',
        'sales-order': 'SO'
    };

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    return `${prefix[type]}-${year}${month}-${random}`;
};

const initialState: SalesState = {
    salesType: 'invoice',
    salesData: {
        document_no: '',
        document_date: new Date().toISOString().split('T')[0],
        reference_no: '',
        party_id: null,
        party_name: '',
        party_details: null,
        items: [],
        total_amount: 0,
        discount_amount: 0,
        tax_amount: 0,
        other_charges: 0,
        round_off: 0,
        net_amount: 0,
        payment_mode: 'CREDIT',
        payment_status: 'PENDING',
        due_date: '',
        transport_details: {
            transporter_name: '',
            vehicle_no: '',
            lr_no: '',
            dispatch_date: ''
        },
        order_status: 'PENDING',
        delivery_date: '',
        terms_conditions: '',
        notes: '',
        created_by: '',
        org_id: null
    },
    currentStep: 1,
    saving: false,
    loading: false,
    message: null,
    messageType: null,
    errors: {},
    selectedParty: null,
    searchResults: [],
    productSearchResults: []
};

const salesReducer = (state: SalesState, action: SalesAction): SalesState => {
    switch (action.type) {
        case 'SET_SALES_TYPE':
            return {
                ...state,
                salesType: action.payload,
                salesData: {
                    ...initialState.salesData,
                    document_no: generateDocumentNumber(action.payload),
                    document_date: state.salesData.document_date
                },
                selectedParty: null,
                errors: {}
            };

        case 'SET_SALES_FIELD':
            return {
                ...state,
                salesData: {
                    ...state.salesData,
                    [action.payload.field]: action.payload.value
                }
            };

        case 'SET_TRANSPORT_FIELD':
            return {
                ...state,
                salesData: {
                    ...state.salesData,
                    transport_details: {
                        ...state.salesData.transport_details,
                        [action.payload.field]: action.payload.value
                    }
                }
            };

        case 'SET_PARTY':
            return {
                ...state,
                selectedParty: action.payload,
                salesData: {
                    ...state.salesData,
                    party_id: action.payload?.id || action.payload?.customer_id || null,
                    party_name: action.payload?.customer_name || action.payload?.name || '',
                    party_details: action.payload
                }
            };

        case 'ADD_ITEM':
            return {
                ...state,
                salesData: {
                    ...state.salesData,
                    items: [...state.salesData.items, action.payload]
                }
            };

        case 'UPDATE_ITEM':
            return {
                ...state,
                salesData: {
                    ...state.salesData,
                    items: state.salesData.items.map((item, index) =>
                        index === action.payload.index ? action.payload.item : item
                    )
                }
            };

        case 'REMOVE_ITEM':
            return {
                ...state,
                salesData: {
                    ...state.salesData,
                    items: state.salesData.items.filter((_, index) => index !== action.payload)
                }
            };

        case 'CALCULATE_TOTALS':
            const items = state.salesData.items;
            const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
            const taxAmount = items.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
            const totalAmount = subtotal;
            const netAmount = totalAmount - (state.salesData.discount_amount || 0) +
                taxAmount + (state.salesData.other_charges || 0) +
                (state.salesData.round_off || 0);

            return {
                ...state,
                salesData: {
                    ...state.salesData,
                    total_amount: totalAmount,
                    tax_amount: taxAmount,
                    net_amount: netAmount
                }
            };

        case 'SET_MESSAGE':
            return {
                ...state,
                message: action.payload.message,
                messageType: action.payload.type
            };

        case 'CLEAR_MESSAGE':
            return {
                ...state,
                message: null,
                messageType: null
            };

        case 'SET_ERROR':
            return {
                ...state,
                errors: {
                    ...state.errors,
                    [action.payload.field]: action.payload.error
                }
            };

        case 'CLEAR_ERROR':
            const { [action.payload]: _, ...restErrors } = state.errors;
            return {
                ...state,
                errors: restErrors
            };

        case 'SET_LOADING':
            return {
                ...state,
                loading: action.payload
            };

        case 'SET_SAVING':
            return {
                ...state,
                saving: action.payload
            };

        case 'SET_CURRENT_STEP':
            return {
                ...state,
                currentStep: action.payload
            };

        case 'RESET_SALES':
            return {
                ...initialState,
                salesType: state.salesType,
                salesData: {
                    ...initialState.salesData,
                    document_no: generateDocumentNumber(state.salesType)
                }
            };

        case 'SET_SEARCH_RESULTS':
            return {
                ...state,
                searchResults: action.payload
            };

        case 'SET_PRODUCT_SEARCH_RESULTS':
            return {
                ...state,
                productSearchResults: action.payload
            };

        default:
            return state;
    }
};

interface SalesContextValue extends SalesState {
    setSalesType: (type: SalesType) => void;
    setSalesField: (field: string, value: any) => void;
    setTransportField: (field: string, value: string) => void;
    setParty: (party: PartyDetails | null) => void;
    addItem: (item: SalesItem) => void;
    updateItem: (index: number, item: SalesItem) => void;
    removeItem: (index: number) => void;
    calculateTotals: () => void;
    setMessage: (message: string, type?: MessageType) => void;
    clearMessage: () => void;
    setError: (field: string, error: string) => void;
    clearError: (field: string) => void;
    setLoading: (loading: boolean) => void;
    setSaving: (saving: boolean) => void;
    setCurrentStep: (step: number) => void;
    resetSales: () => void;
    setSearchResults: (results: any[]) => void;
    setProductSearchResults: (results: any[]) => void;
}

const SalesContext = createContext<SalesContextValue | null>(null);

interface SalesProviderProps {
    children: ReactNode;
}

export const SalesProvider: React.FC<SalesProviderProps> = ({ children }) => {
    const [state, dispatch] = useReducer(salesReducer, initialState);

    const value: SalesContextValue = {
        ...state,
        setSalesType: useCallback((type) => dispatch({ type: 'SET_SALES_TYPE', payload: type }), []),
        setSalesField: useCallback((field, value) => dispatch({ type: 'SET_SALES_FIELD', payload: { field, value } }), []),
        setTransportField: useCallback((field, value) => dispatch({ type: 'SET_TRANSPORT_FIELD', payload: { field, value } }), []),
        setParty: useCallback((party) => dispatch({ type: 'SET_PARTY', payload: party }), []),
        addItem: useCallback((item) => {
            dispatch({ type: 'ADD_ITEM', payload: item });
            dispatch({ type: 'CALCULATE_TOTALS' });
        }, []),
        updateItem: useCallback((index, item) => {
            dispatch({ type: 'UPDATE_ITEM', payload: { index, item } });
            dispatch({ type: 'CALCULATE_TOTALS' });
        }, []),
        removeItem: useCallback((index) => {
            dispatch({ type: 'REMOVE_ITEM', payload: index });
            dispatch({ type: 'CALCULATE_TOTALS' });
        }, []),
        calculateTotals: useCallback(() => dispatch({ type: 'CALCULATE_TOTALS' }), []),
        setMessage: useCallback((message, type = 'info') => dispatch({ type: 'SET_MESSAGE', payload: { message, type } }), []),
        clearMessage: useCallback(() => dispatch({ type: 'CLEAR_MESSAGE' }), []),
        setError: useCallback((field, error) => dispatch({ type: 'SET_ERROR', payload: { field, error } }), []),
        clearError: useCallback((field) => dispatch({ type: 'CLEAR_ERROR', payload: field }), []),
        setLoading: useCallback((loading) => dispatch({ type: 'SET_LOADING', payload: loading }), []),
        setSaving: useCallback((saving) => dispatch({ type: 'SET_SAVING', payload: saving }), []),
        setCurrentStep: useCallback((step) => dispatch({ type: 'SET_CURRENT_STEP', payload: step }), []),
        resetSales: useCallback(() => dispatch({ type: 'RESET_SALES' }), []),
        setSearchResults: useCallback((results) => dispatch({ type: 'SET_SEARCH_RESULTS', payload: results }), []),
        setProductSearchResults: useCallback((results) => dispatch({ type: 'SET_PRODUCT_SEARCH_RESULTS', payload: results }), [])
    };

    return (
        <SalesContext.Provider value={value}>
            {children}
        </SalesContext.Provider>
    );
};

export const useSales = (): SalesContextValue => {
    const context = useContext(SalesContext);
    if (!context) {
        throw new Error('useSales must be used within SalesProvider');
    }
    return context;
};

export default SalesContext;
