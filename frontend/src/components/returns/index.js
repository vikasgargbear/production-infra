/**
 * Returns Module Index
 * Export all return-related components
 */

export { default as ReturnsHub } from './ReturnsHub';
export { default as SalesReturnFlow } from './SalesReturnFlow';
export { default as PurchaseReturnFlow } from './PurchaseReturnFlowV2'; // Use V2 with matching UI
export { default as PurchaseReturnFlowOld } from './PurchaseReturnFlow'; // Keep old version as backup

// Export return components if needed elsewhere
export { default as PurchaseInvoiceSelector } from './components/PurchaseInvoiceSelector';
// ReturnItemsTable moved to archive - use ItemsTable from global instead
export { default as ReturnSummary } from './components/ReturnSummary';
export { default as CreditNotePreview } from './components/CreditNotePreview';
export { default as DebitNotePreview } from './components/DebitNotePreview';