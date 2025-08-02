/**
 * Sales Module
 * Central export for all sales-related components
 */

// Main Components
export { default as InvoiceFlow } from './InvoiceFlow';
export { default as InvoiceManagement } from './InvoiceManagement';
export { default as SalesOrderFlow } from './SalesOrderFlow';
export { default as SalesOrderManagement } from './SalesOrderManagement';
export { default as ChallanFlow } from '../challan/ModularChallanCreatorV5';
export { default as SalesHub } from './SalesHub';

// Sub Components
export { default as BillSummary } from './components/BillSummary';
export { default as PaymentDetails } from './components/PaymentDetails';
export { default as SalesCustomerSelection } from './components/SalesCustomerSelection';
export { default as SalesHeader } from './components/SalesHeader';
export { default as SalesTypeSelector } from './components/SalesTypeSelector';
export { default as TransportDetails } from './components/TransportDetails';
export { default as PaymentRecordingModal } from './components/PaymentRecordingModal';
export { default as ImportDocumentModal } from './components/ImportDocumentModal';
export { default as ConvertToInvoiceButton } from './components/ConvertToInvoiceButton';

// Sales Constants
export const SALES_TYPES = {
  INVOICE: 'invoice',
  CHALLAN: 'challan',
  ORDER: 'order',
  RETURN: 'return'
};

export const PAYMENT_MODES = {
  CASH: 'cash',
  CREDIT: 'credit',
  CARD: 'card',
  UPI: 'upi',
  BANK_TRANSFER: 'bank_transfer',
  CHEQUE: 'cheque'
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue'
};

export const INVOICE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  SENT: 'sent',
  PAID: 'paid',
  CANCELLED: 'cancelled'
};

// Sales utilities
export const calculateInvoiceTotal = (items, discountAmount = 0, otherCharges = 0) => {
  const subtotal = items.reduce((sum, item) => {
    const amount = parseFloat(item.quantity) * parseFloat(item.rate || item.unit_price);
    return sum + amount;
  }, 0);
  
  const taxAmount = items.reduce((sum, item) => {
    const amount = parseFloat(item.quantity) * parseFloat(item.rate || item.unit_price);
    const taxRate = parseFloat(item.tax_rate || item.tax_percent || 0);
    return sum + (amount * taxRate / 100);
  }, 0);
  
  return {
    subtotal,
    taxAmount,
    total: subtotal + taxAmount - discountAmount + otherCharges
  };
};

export const validateInvoiceData = (invoiceData) => {
  const errors = {};
  
  if (!invoiceData.customer_id) {
    errors.customer = 'Customer is required';
  }
  
  if (!invoiceData.items || invoiceData.items.length === 0) {
    errors.items = 'At least one item is required';
  }
  
  invoiceData.items?.forEach((item, index) => {
    if (!item.product_id) {
      errors[`item_${index}_product`] = 'Product is required';
    }
    if (!item.quantity || item.quantity <= 0) {
      errors[`item_${index}_quantity`] = 'Valid quantity is required';
    }
  });
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Note: Use named exports above instead of default export to avoid circular dependency issues