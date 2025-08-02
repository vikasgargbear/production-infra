/**
 * Payment Entry Module
 * Central export for all payment-related components
 */

// Main Components
export { default as ModularPaymentEntry } from './ModularPaymentEntry';
export { default as ModularPaymentEntryV2 } from './ModularPaymentEntryV2';
export { default as ModularPaymentEntryV3 } from './ModularPaymentEntryV3';

// Sub Components
export { default as PartySelector } from './components/PartySelector';
export { default as PaymentDetails } from './components/PaymentDetails';
export { default as PaymentModeSelector } from './components/PaymentModeSelector';
export { default as PaymentSummary } from './components/PaymentSummary';
export { default as InvoiceAllocation } from './components/InvoiceAllocation';

// Payment Utilities
export const PAYMENT_MODES = {
  CASH: 'cash',
  UPI: 'upi',
  CHEQUE: 'cheque',
  RTGS_NEFT: 'rtgs_neft',
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer'
};

export const PAYMENT_TYPES = {
  RECEIPT: 'receipt',
  PAYMENT: 'payment'
};

export const PAYMENT_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  BOUNCED: 'bounced'
};

// Payment validation utilities
export const validatePaymentAmount = (amount) => {
  return amount && !isNaN(amount) && parseFloat(amount) > 0;
};

export const validateChequeDetails = (paymentMode, chequeDetails) => {
  if (paymentMode !== PAYMENT_MODES.CHEQUE) return true;
  return chequeDetails && chequeDetails.chequeNumber && chequeDetails.chequeDate;
};

// API
export { paymentsApi } from '../../services/api/modules/payments.api';

// Data Transformer
export { paymentDataTransformer } from '../../services/api/utils/paymentDataTransformer';

// Default export
const PaymentModule = {
  ModularPaymentEntry,
  ModularPaymentEntryV2,
  ModularPaymentEntryV3,
  components: {
    PartySelector,
    PaymentDetails,
    PaymentModeSelector,
    PaymentSummary,
    InvoiceAllocation
  },
  constants: {
    PAYMENT_MODES,
    PAYMENT_TYPES,
    PAYMENT_STATUS
  },
  utils: {
    validatePaymentAmount,
    validateChequeDetails
  }
};

export default PaymentModule;