/**
 * Inventory Module - Central Export
 * 
 * Unified inventory module combining stock management and batch tracking.
 * Following the same pattern as sales module.
 */

// ==================== MAIN COMPONENTS ====================
export { default as StockHub } from './StockHub';

// ==================== STOCK COMPONENTS ====================
export {
    CurrentStock,
    StockMovement,
    BatchTracking,
    EnhancedStockAdjustmentFlow,
    StockTransfer
} from './stock';

// Default export for the module registry.
export { default } from './StockHub';
