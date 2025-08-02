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

// Payment Constants
export const PAYMENT_MODES = {
  CASH: 'cash',
  UPI: 'upi',
  CHEQUE: 'cheque',
  RTGS_NEFT: 'rtgs_neft',
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer'
} as const;

export const PAYMENT_TYPES = {
  RECEIPT: 'receipt',
  PAYMENT: 'payment'
} as const;

export const PAYMENT_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  BOUNCED: 'bounced'
} as const;

// Type definitions
export type PaymentMode = typeof PAYMENT_MODES[keyof typeof PAYMENT_MODES];
export type PaymentType = typeof PAYMENT_TYPES[keyof typeof PAYMENT_TYPES];
export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

interface ChequeDetails {
  chequeNumber: string;
  chequeDate: string;
}

// Payment validation utilities
export const validatePaymentAmount = (amount: string | number): boolean => {
  return amount !== null && amount !== undefined && !isNaN(Number(amount)) && parseFloat(amount.toString()) > 0;
};

export const validateChequeDetails = (paymentMode: string, chequeDetails?: ChequeDetails): boolean => {
  if (paymentMode !== PAYMENT_MODES.CHEQUE) return true;
  return !!(chequeDetails && chequeDetails.chequeNumber && chequeDetails.chequeDate);
};

// API
export { paymentsApi } from '../../services/api/modules/payments.api';

// Data Transformer
export { paymentDataTransformer } from '../../services/api/utils/paymentDataTransformer';

// Main component interfaces
interface PaymentComponents {
  PartySelector: React.ComponentType<any>;
  PaymentDetails: React.ComponentType<any>;
  PaymentModeSelector: React.ComponentType<any>;
  PaymentSummary: React.ComponentType<any>;
  InvoiceAllocation: React.ComponentType<any>;
}

interface PaymentConstants {
  PAYMENT_MODES: typeof PAYMENT_MODES;
  PAYMENT_TYPES: typeof PAYMENT_TYPES;
  PAYMENT_STATUS: typeof PAYMENT_STATUS;
}

interface PaymentUtils {
  validatePaymentAmount: typeof validatePaymentAmount;
  validateChequeDetails: typeof validateChequeDetails;
}

// Default export
interface PaymentModule {
  ModularPaymentEntry: React.ComponentType<any>;
  ModularPaymentEntryV2: React.ComponentType<any>;
  ModularPaymentEntryV3: React.ComponentType<any>;
  components: PaymentComponents;
  constants: PaymentConstants;
  utils: PaymentUtils;
}

const PaymentModule: PaymentModule = {
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