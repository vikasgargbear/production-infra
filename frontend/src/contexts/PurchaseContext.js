import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { PURCHASE_CONFIG, generateBatchNumber, calculateDefaultExpiryDate } from '../config/purchase.config';

// Initial state
const initialState = {
  // Form data
  purchase: {
    supplier_id: '',
    supplier_name: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    items: [],
    subtotal_amount: 0,
    tax_amount: 0,
    discount_amount: 0,
    delivery_charges: 0,
    final_amount: 0,
    payment_mode: 'cash', // Default to cash, user can change on review page
    payment_status: 'pending',
    notes: ''
  },
  
  // UI state
  currentStep: 1,
  loading: false,
  saving: false,
  message: '',
  messageType: '', // 'success' | 'error' | 'info'
  
  // Modal states
  showPDFUpload: false,
  showGSTCalculator: false,
  
  // Validation
  errors: {},
  touched: {}
};

// Action types
const ActionTypes = {
  // Purchase data actions
  SET_PURCHASE_FIELD: 'SET_PURCHASE_FIELD',
  SET_SUPPLIER: 'SET_SUPPLIER',
  ADD_ITEM: 'ADD_ITEM',
  UPDATE_ITEM: 'UPDATE_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  CALCULATE_TOTALS: 'CALCULATE_TOTALS',
  RESET_PURCHASE: 'RESET_PURCHASE',
  
  // UI actions
  SET_LOADING: 'SET_LOADING',
  SET_SAVING: 'SET_SAVING',
  SET_MESSAGE: 'SET_MESSAGE',
  SET_CURRENT_STEP: 'SET_CURRENT_STEP',
  TOGGLE_PDF_UPLOAD: 'TOGGLE_PDF_UPLOAD',
  TOGGLE_GST_CALCULATOR: 'TOGGLE_GST_CALCULATOR',
  
  // Validation actions
  SET_ERROR: 'SET_ERROR',
  SET_ERRORS: 'SET_ERRORS',
  CLEAR_ERROR: 'CLEAR_ERROR',
  CLEAR_ERRORS: 'CLEAR_ERRORS',
  SET_TOUCHED: 'SET_TOUCHED',
  
  // Bulk actions
  LOAD_PDF_DATA: 'LOAD_PDF_DATA',
  SET_PURCHASE_DATA: 'SET_PURCHASE_DATA'
};

// Reducer
const purchaseReducer = (state, action) => {
  switch (action.type) {
    case ActionTypes.SET_PURCHASE_FIELD:
      return {
        ...state,
        purchase: {
          ...state.purchase,
          [action.payload.field]: action.payload.value
        }
      };
      
    case ActionTypes.SET_SUPPLIER:
      return {
        ...state,
        purchase: {
          ...state.purchase,
          supplier_id: action.payload.supplier_id,
          supplier_name: action.payload.supplier_name
        }
      };
      
    case ActionTypes.ADD_ITEM:
      const newItem = {
        id: Date.now(),
        product_id: '',
        product_name: '',
        hsn_code: '',
        batch_number: generateBatchNumber(),
        expiry_date: calculateDefaultExpiryDate(),
        quantity: 1,
        purchase_price: 0,
        selling_price: 0,
        mrp: 0,
        tax_percent: PURCHASE_CONFIG.DEFAULTS.TAX_RATE,
        line_total: 0,
        ...action.payload
      };
      
      return {
        ...state,
        purchase: {
          ...state.purchase,
          items: [...state.purchase.items, newItem]
        }
      };
      
    case ActionTypes.UPDATE_ITEM:
      const updatedItems = state.purchase.items.map(item => {
        if (item.id === action.payload.itemId) {
          const updatedItem = { ...item, [action.payload.field]: action.payload.value };
          
          // Calculate line total
          const quantity = parseFloat(updatedItem.quantity) || 0;
          const purchasePrice = parseFloat(updatedItem.purchase_price) || 0;
          const taxPercent = parseFloat(updatedItem.tax_percent) || 0;
          
          const subtotal = quantity * purchasePrice;
          const taxAmount = (subtotal * taxPercent) / 100;
          updatedItem.line_total = subtotal + taxAmount;
          
          return updatedItem;
        }
        return item;
      });
      
      return {
        ...state,
        purchase: {
          ...state.purchase,
          items: updatedItems
        }
      };
      
    case ActionTypes.REMOVE_ITEM:
      return {
        ...state,
        purchase: {
          ...state.purchase,
          items: state.purchase.items.filter(item => item.id !== action.payload.itemId)
        }
      };
      
    case ActionTypes.CALCULATE_TOTALS:
      const subtotal = state.purchase.items.reduce((sum, item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const purchasePrice = parseFloat(item.purchase_price) || 0;
        return sum + (quantity * purchasePrice);
      }, 0);
      
      const taxAmount = state.purchase.items.reduce((sum, item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const purchasePrice = parseFloat(item.purchase_price) || 0;
        const taxPercent = parseFloat(item.tax_percent) || 0;
        const itemSubtotal = quantity * purchasePrice;
        return sum + ((itemSubtotal * taxPercent) / 100);
      }, 0);
      
      return {
        ...state,
        purchase: {
          ...state.purchase,
          subtotal_amount: subtotal,
          tax_amount: taxAmount,
          final_amount: subtotal + taxAmount - (state.purchase.discount_amount || 0) + (state.purchase.delivery_charges || 0)
        }
      };
      
    case ActionTypes.RESET_PURCHASE:
      return {
        ...state,
        purchase: initialState.purchase,
        errors: {},
        touched: {},
        message: '',
        messageType: '',
        currentStep: 1
      };
      
    case ActionTypes.SET_LOADING:
      return { ...state, loading: action.payload };
      
    case ActionTypes.SET_SAVING:
      return { ...state, saving: action.payload };
      
    case ActionTypes.SET_MESSAGE:
      return {
        ...state,
        message: action.payload.message,
        messageType: action.payload.type || 'info'
      };
      
    case ActionTypes.SET_CURRENT_STEP:
      return { ...state, currentStep: action.payload };
      
    case ActionTypes.TOGGLE_PDF_UPLOAD:
      return { ...state, showPDFUpload: !state.showPDFUpload };
      
    case ActionTypes.TOGGLE_GST_CALCULATOR:
      return { ...state, showGSTCalculator: !state.showGSTCalculator };
      
    case ActionTypes.SET_ERROR:
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.payload.field]: action.payload.error
        }
      };
      
    case ActionTypes.SET_ERRORS:
      return {
        ...state,
        errors: action.payload
      };
      
    case ActionTypes.CLEAR_ERROR:
      const { [action.payload]: _, ...restErrors } = state.errors;
      return {
        ...state,
        errors: restErrors
      };
      
    case ActionTypes.CLEAR_ERRORS:
      return {
        ...state,
        errors: {}
      };
      
    case ActionTypes.SET_TOUCHED:
      return {
        ...state,
        touched: {
          ...state.touched,
          [action.payload]: true
        }
      };
      
    case ActionTypes.LOAD_PDF_DATA:
      // Handle PDF data loading
      return {
        ...state,
        purchase: {
          ...state.purchase,
          ...action.payload
        }
      };
      
    case ActionTypes.SET_PURCHASE_DATA:
      return {
        ...state,
        purchase: {
          ...state.purchase,
          ...action.payload
        }
      };
      
    default:
      return state;
  }
};

// Create context
const PurchaseContext = createContext();

// Provider component
export const PurchaseProvider = ({ children }) => {
  const [state, dispatch] = useReducer(purchaseReducer, initialState);
  
  // Action creators
  const actions = {
    setPurchaseField: useCallback((field, value) => {
      dispatch({ type: ActionTypes.SET_PURCHASE_FIELD, payload: { field, value } });
    }, []),
    
    setSupplier: useCallback((supplier) => {
      dispatch({ 
        type: ActionTypes.SET_SUPPLIER, 
        payload: { 
          supplier_id: supplier.supplier_id, 
          supplier_name: supplier.supplier_name 
        } 
      });
    }, []),
    
    addItem: useCallback((item = {}) => {
      dispatch({ type: ActionTypes.ADD_ITEM, payload: item });
    }, []),
    
    updateItem: useCallback((itemId, field, value) => {
      dispatch({ 
        type: ActionTypes.UPDATE_ITEM, 
        payload: { itemId, field, value } 
      });
      // Calculate totals after a short delay
      setTimeout(() => dispatch({ type: ActionTypes.CALCULATE_TOTALS }), 100);
    }, []),
    
    removeItem: useCallback((itemId) => {
      dispatch({ type: ActionTypes.REMOVE_ITEM, payload: { itemId } });
      // Calculate totals after removal
      setTimeout(() => dispatch({ type: ActionTypes.CALCULATE_TOTALS }), 100);
    }, []),
    
    calculateTotals: useCallback(() => {
      dispatch({ type: ActionTypes.CALCULATE_TOTALS });
    }, []),
    
    resetPurchase: useCallback(() => {
      dispatch({ type: ActionTypes.RESET_PURCHASE });
    }, []),
    
    setLoading: useCallback((loading) => {
      dispatch({ type: ActionTypes.SET_LOADING, payload: loading });
    }, []),
    
    setSaving: useCallback((saving) => {
      dispatch({ type: ActionTypes.SET_SAVING, payload: saving });
    }, []),
    
    setMessage: useCallback((message, type = 'info') => {
      dispatch({ 
        type: ActionTypes.SET_MESSAGE, 
        payload: { message, type } 
      });
    }, []),
    
    clearMessage: useCallback(() => {
      dispatch({ 
        type: ActionTypes.SET_MESSAGE, 
        payload: { message: '', type: '' } 
      });
    }, []),
    
    setCurrentStep: useCallback((step) => {
      dispatch({ type: ActionTypes.SET_CURRENT_STEP, payload: step });
    }, []),
    
    togglePDFUpload: useCallback(() => {
      dispatch({ type: ActionTypes.TOGGLE_PDF_UPLOAD });
    }, []),
    
    toggleGSTCalculator: useCallback(() => {
      dispatch({ type: ActionTypes.TOGGLE_GST_CALCULATOR });
    }, []),
    
    setError: useCallback((field, error) => {
      dispatch({ 
        type: ActionTypes.SET_ERROR, 
        payload: { field, error } 
      });
    }, []),
    
    setErrors: useCallback((errors) => {
      dispatch({ type: ActionTypes.SET_ERRORS, payload: errors });
    }, []),
    
    clearError: useCallback((field) => {
      dispatch({ type: ActionTypes.CLEAR_ERROR, payload: field });
    }, []),
    
    clearErrors: useCallback(() => {
      dispatch({ type: ActionTypes.CLEAR_ERRORS });
    }, []),
    
    setTouched: useCallback((field) => {
      dispatch({ type: ActionTypes.SET_TOUCHED, payload: field });
    }, []),
    
    loadPDFData: useCallback((data) => {
      dispatch({ type: ActionTypes.LOAD_PDF_DATA, payload: data });
    }, []),
    
    setPurchaseData: useCallback((data) => {
      dispatch({ type: ActionTypes.SET_PURCHASE_DATA, payload: data });
      // Calculate totals after setting data
      setTimeout(() => dispatch({ type: ActionTypes.CALCULATE_TOTALS }), 100);
    }, [])
  };
  
  const value = {
    ...state,
    ...actions
  };
  
  return (
    <PurchaseContext.Provider value={value}>
      {children}
    </PurchaseContext.Provider>
  );
};

// Custom hook to use the Purchase context
export const usePurchase = () => {
  const context = useContext(PurchaseContext);
  if (!context) {
    throw new Error('usePurchase must be used within a PurchaseProvider');
  }
  return context;
};

export default PurchaseContext;