/**
 * Inventory Hooks - Barrel Export
 */

export { useCurrentStock } from './useCurrentStock';
export type {
    StockItem,
    MoreFilters,
    UseCurrentStockReturn
} from './useCurrentStock';

export { useStockAdjustment } from './useStockAdjustment';
export type {
    AdjustmentItem,
    AdjustmentData,
    UseStockAdjustmentReturn
} from './useStockAdjustment';
