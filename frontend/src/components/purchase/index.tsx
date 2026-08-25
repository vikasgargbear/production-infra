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
export { CanonicalPurchaseWorkflow } from './purchase-entry';
export { GRNFlow } from './grn';

// ==================== SHARED INFRASTRUCTURE ====================
export * from './types';
export * from './utils';
export * from './hooks';

// ==================== UI COMPONENTS ====================
export { default as SupplierSelector } from './ui/SupplierSelector';
export { default as PurchaseItemEditModal } from './ui/PurchaseItemEditModal';
export { default as SupplierQuickSelect } from './ui/SupplierQuickSelect';

// ==================== MODALS ====================
export { default as ProductVerificationModal } from './modals/ProductVerificationModal';
export { default as SupplierCreationForm } from './modals/SupplierCreationForm';
export { default as SupplierVerificationModal } from './modals/SupplierVerificationModal';

// ==================== UTILITIES ====================
export { default as PDFVerificationFlow } from './PDFVerificationFlow';
