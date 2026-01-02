/**
 * Sales Order Module Exports
 * 
 * Clean barrel export for all sales order-related components
 */

// Main entry points
export { default as SalesOrderFlow } from './SalesOrderFlow';
export { default as SalesOrderList } from './SalesOrderList';

// Legacy alias for backward compatibility
export { default as SalesOrderManagement } from './SalesOrderList';

// Step components
export { default as OrderItemsStep } from './steps/OrderItemsStep';
export { default as OrderReviewStep } from './steps/OrderReviewStep';

// Hooks
export { useSalesOrderLogic } from './hooks/useSalesOrderLogic';
