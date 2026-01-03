/**
 * Returns Module - Central Export
 * 
 * Unified returns module for sales and purchase returns.
 */

// ==================== MAIN COMPONENTS ====================
export { default as ReturnsHub } from './ReturnsHub';
export { default as SalesReturnFlow } from './SalesReturnFlow';
export { default as PurchaseReturnFlow } from './PurchaseReturnFlowV2';

// ==================== UI COMPONENTS ====================
export { default as CreditNotePreview } from './ui/CreditNotePreview';
export { default as DebitNotePreview } from './ui/DebitNotePreview';
export { default as PurchaseReturnSelector } from './ui/PurchaseReturnSelector';

// ==================== SELECTORS ====================
export { default as PurchaseInvoiceSelector } from './components/PurchaseInvoiceSelector';

// ==================== SHARED TYPES ====================
export * from './types';

// ==================== SHARED UTILITIES ====================
export * from './utils';

// ==================== HOOKS ====================
export { useReturnCalculations, calculateRefundAmount } from './hooks/useReturnCalculations';
export { useReturnReasons } from './hooks/useReturnReasons';
