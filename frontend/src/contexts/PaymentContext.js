import React, { createContext, useContext, useReducer } from 'react';

// Initial state
const initialState = {
  payment: {
    customer_id: '',
    customer_name: '',
    customer_details: null,
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_mode: 'CASH',
    reference_number: '',
    remarks: '',
    payment_type: 'order_payment'
  },
  selectedCustomer: null,
  outstandingInvoices: [],
  currentStep: 1,
  saving: false,
  errors: {},
  touched: {},
  message: '',
  messageType: 'info'
};

// Action types
const ACTION_TYPES = {
  SET_PAYMENT_FIELD: 'SET_PAYMENT_FIELD',
  SET_PAYMENT_DATA: 'SET_PAYMENT_DATA',
  SET_CUSTOMER: 'SET_CUSTOMER',
  SET_OUTSTANDING_INVOICES: 'SET_OUTSTANDING_INVOICES',
  SET_CURRENT_STEP: 'SET_CURRENT_STEP',
  SET_SAVING: 'SET_SAVING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_ERRORS: 'SET_ERRORS',
  SET_TOUCHED: 'SET_TOUCHED',
  SET_MESSAGE: 'SET_MESSAGE',
  CLEAR_MESSAGE: 'CLEAR_MESSAGE',
  RESET_PAYMENT: 'RESET_PAYMENT'
};

// Reducer function
const paymentReducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.SET_PAYMENT_FIELD:
      return {
        ...state,
        payment: {
          ...state.payment,
          [action.field]: action.value
        }
      };

    case ACTION_TYPES.SET_PAYMENT_DATA:
      return {
        ...state,
        payment: {
          ...state.payment,
          ...action.data
        }
      };

    case ACTION_TYPES.SET_CUSTOMER:
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

    case ACTION_TYPES.SET_OUTSTANDING_INVOICES:
      return {
        ...state,
        outstandingInvoices: action.invoices
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

    case ACTION_TYPES.RESET_PAYMENT:
      return {
        ...initialState,
        payment: {
          ...initialState.payment,
          payment_date: new Date().toISOString().split('T')[0]
        }
      };

    default:
      return state;
  }
};

// Create context
const PaymentContext = createContext();

// Provider component
export const PaymentProvider = ({ children }) => {
  const [state, dispatch] = useReducer(paymentReducer, initialState);

  // Action creators
  const setPaymentField = (field, value) => {
    dispatch({ type: ACTION_TYPES.SET_PAYMENT_FIELD, field, value });
  };

  const setPaymentData = (data) => {
    dispatch({ type: ACTION_TYPES.SET_PAYMENT_DATA, data });
  };

  const setCustomer = (customer) => {
    dispatch({ type: ACTION_TYPES.SET_CUSTOMER, customer });
  };

  const setOutstandingInvoices = (invoices) => {
    dispatch({ type: ACTION_TYPES.SET_OUTSTANDING_INVOICES, invoices });
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

  const resetPayment = () => {
    dispatch({ type: ACTION_TYPES.RESET_PAYMENT });
  };

  const value = {
    ...state,
    setPaymentField,
    setPaymentData,
    setCustomer,
    setOutstandingInvoices,
    setCurrentStep,
    setSaving,
    setError,
    clearError,
    setErrors,
    setTouched,
    setMessage,
    clearMessage,
    resetPayment
  };

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
};

// Custom hook
export const usePayment = () => {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
};

export default PaymentContext;