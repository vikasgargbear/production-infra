/**
 * Returns Module - Central Export
 * 
 * Unified returns module for sales and purchase returns.
 * Follows same patterns as sales module.
 */

// ==================== MAIN COMPONENTS ====================
export { default as ReturnsHub } from './ReturnsHub';
export { default as SalesReturnFlow } from './SalesReturnFlow';
export { default as PurchaseReturnFlow } from './PurchaseReturnFlow';
export { default as CommercialReversalFlow } from './CommercialReversalFlow';
export { default as ReturnsListHistory } from './ReturnsListHistory';

// ==================== UI COMPONENTS ====================
export { default as PurchaseReturnSelector } from './ui/PurchaseReturnSelector';
export { default as ReturnSteps } from './ui/ReturnSteps';

// ==================== SHARED TYPES ====================
export * from './types';
