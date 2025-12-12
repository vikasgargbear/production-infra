// Purchase Module Exports
// Centralized export for all purchase-related components

// Main Components
export { default as ModularPurchaseEntry } from './ModularPurchaseEntry';
export { default as SimplifiedPurchaseEntry } from './SimplifiedPurchaseEntry';
export { default as PurchaseErrorBoundary } from './PurchaseErrorBoundary';

// Sub-components
export { default as SupplierSelector } from './components/SupplierSelector';
export { default as PurchaseHeader } from './components/PurchaseHeader';
// PurchaseItemsTable moved to archive - use ItemsTable from global instead
export { default as PurchaseSummary } from './components/PurchaseSummary';
export { default as ItemRow } from './components/ItemRow';
export { default as ProductSearch } from './components/ProductSearch';

// Contexts
export { PurchaseProvider, usePurchase } from '../../contexts/PurchaseContext';

// Configuration
export { PURCHASE_CONFIG } from '../../config/purchase.config';

// Utilities
export { validatePurchaseForm } from '../../utils/purchaseValidation';

// API
export { purchasesApi } from '../../services/api';