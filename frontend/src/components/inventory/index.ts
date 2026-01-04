/**
 * Inventory Module - Central Export
 * 
 * Unified inventory module combining stock management and batch tracking.
 * Following the same pattern as sales module.
 */

// ==================== MAIN COMPONENTS ====================
export { default as StockHub } from './StockHub';
export { default as StockListHistory } from './StockListHistory';

// ==================== STOCK COMPONENTS ====================
export {
    CurrentStock,
    StockMovement,
    BatchTracking,
    EnhancedStockAdjustmentFlow,
    StockTransfer
} from './stock';

// ==================== SHARED TYPES ====================
export * from './types';

// ==================== SHARED UTILITIES ====================
export * from './utils';

// ==================== CONSTANTS (Re-export from types) ====================
export {
    MOVEMENT_TYPES,
    MOVEMENT_STATUS,
    STOCK_STATUS,
    EXPIRY_THRESHOLDS
} from './types/inventorySharedTypes';

// Default export for backward compatibility
export { default } from './StockHub';
