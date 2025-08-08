/**
 * Payment Entry Module
 * Central export for all payment-related components
 */

// Main Components
import ModularPaymentEntry from './ModularPaymentEntry';
export { ModularPaymentEntry };
// TODO: Implement these components
// export { default as ModularPaymentEntryV2 } from './ModularPaymentEntryV2';
// export { default as ModularPaymentEntryV3 } from './ModularPaymentEntryV3';

// Sub Components
// export { default as PartySelector } from './components/PartySelector'; // TODO: Implement
import PaymentDetails from './components/PaymentDetails';
import PaymentSummary from './components/PaymentSummary';
import InvoiceSelector from './components/InvoiceSelector';
export { PaymentDetails, PaymentSummary, InvoiceSelector };
// export { default as PaymentModeSelector } from './components/PaymentModeSelector'; // TODO: Implement
// export { default as InvoiceAllocation } from './components/InvoiceAllocation'; // TODO: Implement

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
  // PartySelector: React.ComponentType<any>; // TODO: Implement
  PaymentDetails: React.ComponentType<any>;
  // PaymentModeSelector: React.ComponentType<any>; // TODO: Implement
  PaymentSummary: React.ComponentType<any>;
  InvoiceSelector: React.ComponentType<any>;
  // InvoiceAllocation: React.ComponentType<any>; // TODO: Implement
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
  // ModularPaymentEntryV2: React.ComponentType<any>;
  // ModularPaymentEntryV3: React.ComponentType<any>;
  components: PaymentComponents;
  constants: PaymentConstants;
  utils: PaymentUtils;
}

const PaymentModule: PaymentModule = {
  ModularPaymentEntry,
  // ModularPaymentEntryV2,
  // ModularPaymentEntryV3,
  components: {
    // PartySelector, // TODO: Implement
    PaymentDetails,
    // PaymentModeSelector, // TODO: Implement
    PaymentSummary,
    InvoiceSelector
    // InvoiceAllocation // TODO: Implement
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