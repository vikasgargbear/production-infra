import React, { createContext, useContext, useReducer, useCallback } from 'react';

// Initial state for unified sales module
const initialState = {
  // Sales type: 'invoice', 'challan', 'sales-order'
  salesType: 'invoice',
  
  // Common fields across all sales types
  salesData: {
    // Document info
    document_no: '',
    document_date: new Date().toISOString().split('T')[0],
    reference_no: '',
    
    // Party info
    party_id: null,
    party_name: '',
    party_details: null,
    
    // Items
    items: [],
    
    // Financial
    total_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    other_charges: 0,
    round_off: 0,
    net_amount: 0,
    
    // Invoice specific
    payment_mode: 'CREDIT',
    payment_status: 'PENDING',
    due_date: '',
    
    // Challan specific
    transport_details: {
      transporter_name: '',
      vehicle_no: '',
      lr_no: '',
      dispatch_date: ''
    },
    
    // Sales Order specific
    order_status: 'PENDING',
    delivery_date: '',
    terms_conditions: '',
    
    // Common
    notes: '',
    created_by: '',
    org_id: null
  },
  
  // UI State
  currentStep: 1,
  saving: false,
  loading: false,
  message: null,
  messageType: null,
  errors: {},
  
  // Search and selection state
  selectedParty: null,
  searchResults: [],
  productSearchResults: []
};

// Action types
const actionTypes = {
  SET_SALES_TYPE: 'SET_SALES_TYPE',
  SET_SALES_FIELD: 'SET_SALES_FIELD',
  SET_TRANSPORT_FIELD: 'SET_TRANSPORT_FIELD',
  SET_PARTY: 'SET_PARTY',
  ADD_ITEM: 'ADD_ITEM',
  UPDATE_ITEM: 'UPDATE_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  CALCULATE_TOTALS: 'CALCULATE_TOTALS',
  SET_MESSAGE: 'SET_MESSAGE',
  CLEAR_MESSAGE: 'CLEAR_MESSAGE',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_LOADING: 'SET_LOADING',
  SET_SAVING: 'SET_SAVING',
  SET_CURRENT_STEP: 'SET_CURRENT_STEP',
  RESET_SALES: 'RESET_SALES',
  SET_SEARCH_RESULTS: 'SET_SEARCH_RESULTS',
  SET_PRODUCT_SEARCH_RESULTS: 'SET_PRODUCT_SEARCH_RESULTS'
};

// Reducer
const salesReducer = (state, action) => {
  switch (action.type) {
    case actionTypes.SET_SALES_TYPE:
      // Generate appropriate document number based on type
      const documentNo = generateDocumentNumber(action.payload);
      return {
        ...state,
        salesType: action.payload,
        salesData: {
          ...initialState.salesData,
          document_no: documentNo,
          document_date: state.salesData.document_date
        },
        selectedParty: null,
        errors: {}
      };
      
    case actionTypes.SET_SALES_FIELD:
      return {
        ...state,
        salesData: {
          ...state.salesData,
          [action.payload.field]: action.payload.value
        }
      };
      
    case actionTypes.SET_TRANSPORT_FIELD:
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
      
    case actionTypes.SET_PARTY:
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
      
    case actionTypes.ADD_ITEM:
      return {
        ...state,
        salesData: {
          ...state.salesData,
          items: [...state.salesData.items, action.payload]
        }
      };
      
    case actionTypes.UPDATE_ITEM:
      return {
        ...state,
        salesData: {
          ...state.salesData,
          items: state.salesData.items.map((item, index) =>
            index === action.payload.index ? action.payload.item : item
          )
        }
      };
      
    case actionTypes.REMOVE_ITEM:
      return {
        ...state,
        salesData: {
          ...state.salesData,
          items: state.salesData.items.filter((_, index) => index !== action.payload)
        }
      };
      
    case actionTypes.CALCULATE_TOTALS:
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
      
    case actionTypes.SET_MESSAGE:
      return {
        ...state,
        message: action.payload.message,
        messageType: action.payload.type
      };
      
    case actionTypes.CLEAR_MESSAGE:
      return {
        ...state,
        message: null,
        messageType: null
      };
      
    case actionTypes.SET_ERROR:
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.payload.field]: action.payload.error
        }
      };
      
    case actionTypes.CLEAR_ERROR:
      const { [action.payload]: _, ...restErrors } = state.errors;
      return {
        ...state,
        errors: restErrors
      };
      
    case actionTypes.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };
      
    case actionTypes.SET_SAVING:
      return {
        ...state,
        saving: action.payload
      };
      
    case actionTypes.SET_CURRENT_STEP:
      return {
        ...state,
        currentStep: action.payload
      };
      
    case actionTypes.RESET_SALES:
      return {
        ...initialState,
        salesType: state.salesType,
        salesData: {
          ...initialState.salesData,
          document_no: generateDocumentNumber(state.salesType)
        }
      };
      
    case actionTypes.SET_SEARCH_RESULTS:
      return {
        ...state,
        searchResults: action.payload
      };
      
    case actionTypes.SET_PRODUCT_SEARCH_RESULTS:
      return {
        ...state,
        productSearchResults: action.payload
      };
      
    default:
      return state;
  }
};

// Helper function to generate document numbers
const generateDocumentNumber = (type) => {
  const prefix = {
    'invoice': 'INV',
    'challan': 'DC',
    'sales-order': 'SO'
  };
  
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  return `${prefix[type] || 'DOC'}-${year}${month}-${random}`;
};

// Create context
const SalesContext = createContext();

// Provider component
export const SalesProvider = ({ children }) => {
  const [state, dispatch] = useReducer(salesReducer, initialState);
  
  // Action creators
  const setSalesType = useCallback((type) => {
    dispatch({ type: actionTypes.SET_SALES_TYPE, payload: type });
  }, []);
  
  const setSalesField = useCallback((field, value) => {
    dispatch({ type: actionTypes.SET_SALES_FIELD, payload: { field, value } });
  }, []);
  
  const setTransportField = useCallback((field, value) => {
    dispatch({ type: actionTypes.SET_TRANSPORT_FIELD, payload: { field, value } });
  }, []);
  
  const setParty = useCallback((party) => {
    dispatch({ type: actionTypes.SET_PARTY, payload: party });
  }, []);
  
  const addItem = useCallback((item) => {
    dispatch({ type: actionTypes.ADD_ITEM, payload: item });
    dispatch({ type: actionTypes.CALCULATE_TOTALS });
  }, []);
  
  const updateItem = useCallback((index, item) => {
    dispatch({ type: actionTypes.UPDATE_ITEM, payload: { index, item } });
    dispatch({ type: actionTypes.CALCULATE_TOTALS });
  }, []);
  
  const removeItem = useCallback((index) => {
    dispatch({ type: actionTypes.REMOVE_ITEM, payload: index });
    dispatch({ type: actionTypes.CALCULATE_TOTALS });
  }, []);
  
  const calculateTotals = useCallback(() => {
    dispatch({ type: actionTypes.CALCULATE_TOTALS });
  }, []);
  
  const setMessage = useCallback((message, type = 'info') => {
    dispatch({ type: actionTypes.SET_MESSAGE, payload: { message, type } });
  }, []);
  
  const clearMessage = useCallback(() => {
    dispatch({ type: actionTypes.CLEAR_MESSAGE });
  }, []);
  
  const setError = useCallback((field, error) => {
    dispatch({ type: actionTypes.SET_ERROR, payload: { field, error } });
  }, []);
  
  const clearError = useCallback((field) => {
    dispatch({ type: actionTypes.CLEAR_ERROR, payload: field });
  }, []);
  
  const setLoading = useCallback((loading) => {
    dispatch({ type: actionTypes.SET_LOADING, payload: loading });
  }, []);
  
  const setSaving = useCallback((saving) => {
    dispatch({ type: actionTypes.SET_SAVING, payload: saving });
  }, []);
  
  const setCurrentStep = useCallback((step) => {
    dispatch({ type: actionTypes.SET_CURRENT_STEP, payload: step });
  }, []);
  
  const resetSales = useCallback(() => {
    dispatch({ type: actionTypes.RESET_SALES });
  }, []);
  
  const setSearchResults = useCallback((results) => {
    dispatch({ type: actionTypes.SET_SEARCH_RESULTS, payload: results });
  }, []);
  
  const setProductSearchResults = useCallback((results) => {
    dispatch({ type: actionTypes.SET_PRODUCT_SEARCH_RESULTS, payload: results });
  }, []);
  
  const value = {
    ...state,
    setSalesType,
    setSalesField,
    setTransportField,
    setParty,
    addItem,
    updateItem,
    removeItem,
    calculateTotals,
    setMessage,
    clearMessage,
    setError,
    clearError,
    setLoading,
    setSaving,
    setCurrentStep,
    resetSales,
    setSearchResults,
    setProductSearchResults
  };
  
  return (
    <SalesContext.Provider value={value}>
      {children}
    </SalesContext.Provider>
  );
};

// Custom hook to use sales context
export const useSales = () => {
  const context = useContext(SalesContext);
  if (!context) {
    throw new Error('useSales must be used within SalesProvider');
  }
  return context;
};