/**
 * Purchase Module - Barrel Export
 * 
 * Centralized export for all purchase-related components
 * Following sales module patterns
 */

// ==================== MAIN HUB ====================
export { default as PurchaseHub } from './PurchaseHub';
export { default as PurchaseListHistory } from './PurchaseListHistory';
export { default as PurchaseErrorBoundary } from './PurchaseErrorBoundary';

// ==================== SUB-MODULES ====================
export { PurchaseOrderFlow } from './purchase-order';
export { PurchaseEntryFlow } from './purchase-entry';
export { GRNFlow } from './grn';

// ==================== SHARED INFRASTRUCTURE ====================
export * from './types';
export * from './utils';
export * from './hooks';

// ==================== UI COMPONENTS ====================
export { default as SupplierSelector } from './ui/SupplierSelector';
export { default as PurchaseHeader } from './ui/PurchaseHeader';
export { default as PurchaseSummary } from './ui/PurchaseSummary';
export { default as PurchaseSummaryTop } from './ui/PurchaseSummaryTop';
export { default as PurchaseItemEditModal } from './ui/PurchaseItemEditModal';
export { default as SupplierQuickSelect } from './ui/SupplierQuickSelect';

// ==================== MODALS ====================
export { default as ProductVerificationModal } from './modals/ProductVerificationModal';
export { default as SupplierCreationForm } from './modals/SupplierCreationForm';
export { default as SupplierVerificationModal } from './modals/SupplierVerificationModal';
export { default as PDFUploadModal } from './modals/PDFUploadModal';

// ==================== UTILITIES ====================
export { default as PDFVerificationFlow } from './PDFVerificationFlow';
export { default as BulkUploadInline } from './BulkUploadInline';
