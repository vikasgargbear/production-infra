/**
 * Returns Module Index
 * Export all return-related components
 */

export { default as ReturnsHub } from './ReturnsHub';
export { default as SalesReturnFlow } from './SalesReturnFlow';
export { default as PurchaseReturnFlow } from './PurchaseReturnFlowV2'; // Use V2 with matching UI

// Export return components if needed elsewhere
export { default as PurchaseInvoiceSelector } from './components/PurchaseInvoiceSelector';
// ReturnItemsTable moved to archive - use ItemsTable from global instead
export { default as CreditNotePreview } from './ui/CreditNotePreview';
export { default as DebitNotePreview } from './ui/DebitNotePreview';