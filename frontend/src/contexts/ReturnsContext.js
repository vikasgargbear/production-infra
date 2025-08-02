import React, { createContext, useContext, useReducer } from 'react';

// Initial state
const initialState = {
  returnType: 'sale', // 'sale' or 'purchase'
  returnData: {
    // Common fields
    return_date: new Date().toISOString().split('T')[0],
    reason: '',
    items: [],
    total_amount: 0,
    tax_amount: 0,
    net_amount: 0,
    
    // Sale return specific
    original_invoice_id: '',
    original_invoice_no: '',
    customer_id: '',
    customer_name: '',
    customer_details: null,
    return_mode: 'CASH',
    return_invoice_no: '',
    
    // Purchase return specific  
    original_purchase_id: '',
    original_bill_no: '',
    supplier_id: '',
    supplier_name: '',
    supplier_details: null,
    debit_note_no: ''
  },
  selectedDocument: null, // Selected invoice or purchase bill
  currentStep: 1,
  saving: false,
  errors: {},
  touched: {},
  message: '',
  messageType: 'info'
};

// Action types
const ACTION_TYPES = {
  SET_RETURN_TYPE: 'SET_RETURN_TYPE',
  SET_RETURN_FIELD: 'SET_RETURN_FIELD',
  SET_RETURN_DATA: 'SET_RETURN_DATA',
  SET_SELECTED_DOCUMENT: 'SET_SELECTED_DOCUMENT',
  SET_CURRENT_STEP: 'SET_CURRENT_STEP',
  SET_SAVING: 'SET_SAVING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_ERRORS: 'SET_ERRORS',
  SET_TOUCHED: 'SET_TOUCHED',
  SET_MESSAGE: 'SET_MESSAGE',
  CLEAR_MESSAGE: 'CLEAR_MESSAGE',
  UPDATE_ITEM_RETURN_QUANTITY: 'UPDATE_ITEM_RETURN_QUANTITY',
  CALCULATE_TOTALS: 'CALCULATE_TOTALS',
  RESET_RETURN: 'RESET_RETURN'
};

// Helper function to calculate totals
const calculateTotals = (items) => {
  const total_amount = items.reduce((sum, item) => sum + (item.return_amount || 0), 0);
  const tax_amount = items.reduce((sum, item) => {
    const itemTax = (item.return_amount || 0) * ((item.tax_rate || 0) / 100);
    return sum + itemTax;
  }, 0);
  const net_amount = total_amount + tax_amount;
  
  return { total_amount, tax_amount, net_amount };
};

// Generate return number
const generateReturnNumber = (type) => {
  const prefix = type === 'sale' ? 'SR-' : 'DN-';
  return prefix + Date.now().toString().slice(-6);
};

// Reducer function
const returnsReducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.SET_RETURN_TYPE:
      const newReturnNumber = generateReturnNumber(action.returnType);
      return {
        ...state,
        returnType: action.returnType,
        returnData: {
          ...initialState.returnData,
          return_date: new Date().toISOString().split('T')[0],
          [action.returnType === 'sale' ? 'return_invoice_no' : 'debit_note_no']: newReturnNumber
        },
        selectedDocument: null,
        currentStep: 1,
        errors: {},
        message: ''
      };

    case ACTION_TYPES.SET_RETURN_FIELD:
      return {
        ...state,
        returnData: {
          ...state.returnData,
          [action.field]: action.value
        }
      };

    case ACTION_TYPES.SET_RETURN_DATA:
      return {
        ...state,
        returnData: {
          ...state.returnData,
          ...action.data
        }
      };

    case ACTION_TYPES.SET_SELECTED_DOCUMENT:
      const document = action.document;
      let updatedReturnData = { ...state.returnData };
      
      if (document) {
        if (state.returnType === 'sale') {
          updatedReturnData = {
            ...updatedReturnData,
            original_invoice_id: document.invoice_id || document.order_id,
            original_invoice_no: document.invoice_no,
            customer_id: document.customer_id,
            customer_name: document.customer_name,
            customer_details: document.customer_details,
            items: (document.items || []).map(item => ({
              ...item,
              original_quantity: item.quantity,
              return_quantity: 0,
              return_amount: 0
            }))
          };
        } else {
          updatedReturnData = {
            ...updatedReturnData,
            original_purchase_id: document.purchase_id,
            original_bill_no: document.bill_no || document.invoice_no,
            supplier_id: document.supplier_id,
            supplier_name: document.supplier_name,
            supplier_details: document.supplier_details,
            items: (document.items || []).map(item => ({
              ...item,
              original_quantity: item.quantity,
              return_quantity: 0,
              return_amount: 0
            }))
          };
        }
      }

      return {
        ...state,
        selectedDocument: document,
        returnData: updatedReturnData
      };

    case ACTION_TYPES.SET_CURRENT_STEP:
      return {
        ...state,
        currentStep: action.step
      };

    case ACTION_TYPES.SET_SAVING:
      return {
        ...state,
        saving: action.saving
      };

    case ACTION_TYPES.SET_ERROR:
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.field]: action.error
        }
      };

    case ACTION_TYPES.CLEAR_ERROR:
      const newErrors = { ...state.errors };
      delete newErrors[action.field];
      return {
        ...state,
        errors: newErrors
      };

    case ACTION_TYPES.SET_ERRORS:
      return {
        ...state,
        errors: action.errors
      };

    case ACTION_TYPES.SET_TOUCHED:
      return {
        ...state,
        touched: {
          ...state.touched,
          [action.field]: true
        }
      };

    case ACTION_TYPES.SET_MESSAGE:
      return {
        ...state,
        message: action.message,
        messageType: action.messageType || 'info'
      };

    case ACTION_TYPES.CLEAR_MESSAGE:
      return {
        ...state,
        message: '',
        messageType: 'info'
      };

    case ACTION_TYPES.UPDATE_ITEM_RETURN_QUANTITY:
      const newItems = [...state.returnData.items];
      const item = newItems[action.index];
      
      if (item) {
        const returnQty = Math.min(parseInt(action.quantity) || 0, item.original_quantity);
        item.return_quantity = returnQty;
        item.return_amount = returnQty * (item.rate || item.purchase_price || item.selling_price || 0);
        
        const totals = calculateTotals(newItems);
        
        return {
          ...state,
          returnData: {
            ...state.returnData,
            items: newItems,
            ...totals
          }
        };
      }
      return state;

    case ACTION_TYPES.CALCULATE_TOTALS:
      const totals = calculateTotals(state.returnData.items);
      return {
        ...state,
        returnData: {
          ...state.returnData,
          ...totals
        }
      };

    case ACTION_TYPES.RESET_RETURN:
      const returnNumber = generateReturnNumber(state.returnType);
      return {
        ...initialState,
        returnType: state.returnType,
        returnData: {
          ...initialState.returnData,
          return_date: new Date().toISOString().split('T')[0],
          [state.returnType === 'sale' ? 'return_invoice_no' : 'debit_note_no']: returnNumber
        }
      };

    default:
      return state;
  }
};

// Create context
const ReturnsContext = createContext();

// Provider component
export const ReturnsProvider = ({ children, initialReturnType = 'sale' }) => {
  const [state, dispatch] = useReducer(returnsReducer, {
    ...initialState,
    returnType: initialReturnType,
    returnData: {
      ...initialState.returnData,
      return_invoice_no: generateReturnNumber(initialReturnType)
    }
  });

  // Action creators
  const setReturnType = (returnType) => {
    dispatch({ type: ACTION_TYPES.SET_RETURN_TYPE, returnType });
  };

  const setReturnField = (field, value) => {
    dispatch({ type: ACTION_TYPES.SET_RETURN_FIELD, field, value });
  };

  const setReturnData = (data) => {
    dispatch({ type: ACTION_TYPES.SET_RETURN_DATA, data });
  };

  const setSelectedDocument = (document) => {
    dispatch({ type: ACTION_TYPES.SET_SELECTED_DOCUMENT, document });
  };

  const setCurrentStep = (step) => {
    dispatch({ type: ACTION_TYPES.SET_CURRENT_STEP, step });
  };

  const setSaving = (saving) => {
    dispatch({ type: ACTION_TYPES.SET_SAVING, saving });
  };

  const setError = (field, error) => {
    dispatch({ type: ACTION_TYPES.SET_ERROR, field, error });
  };

  const clearError = (field) => {
    dispatch({ type: ACTION_TYPES.CLEAR_ERROR, field });
  };

  const setErrors = (errors) => {
    dispatch({ type: ACTION_TYPES.SET_ERRORS, errors });
  };

  const setTouched = (field) => {
    dispatch({ type: ACTION_TYPES.SET_TOUCHED, field });
  };

  const setMessage = (message, messageType = 'info') => {
    dispatch({ type: ACTION_TYPES.SET_MESSAGE, message, messageType });
  };

  const clearMessage = () => {
    dispatch({ type: ACTION_TYPES.CLEAR_MESSAGE });
  };

  const updateItemReturnQuantity = (index, quantity) => {
    dispatch({ type: ACTION_TYPES.UPDATE_ITEM_RETURN_QUANTITY, index, quantity });
  };

  const calculateTotals = () => {
    dispatch({ type: ACTION_TYPES.CALCULATE_TOTALS });
  };

  const resetReturn = () => {
    dispatch({ type: ACTION_TYPES.RESET_RETURN });
  };

  const value = {
    ...state,
    setReturnType,
    setReturnField,
    setReturnData,
    setSelectedDocument,
    setCurrentStep,
    setSaving,
    setError,
    clearError,
    setErrors,
    setTouched,
    setMessage,
    clearMessage,
    updateItemReturnQuantity,
    calculateTotals,
    resetReturn
  };

  return (
    <ReturnsContext.Provider value={value}>
      {children}
    </ReturnsContext.Provider>
  );
};

// Custom hook
export const useReturns = () => {
  const context = useContext(ReturnsContext);
  if (!context) {
    throw new Error('useReturns must be used within a ReturnsProvider');
  }
  return context;
};

export default ReturnsContext;