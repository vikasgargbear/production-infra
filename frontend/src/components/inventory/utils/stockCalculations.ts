/**
 * Stock Calculations Utilities
 * 
 * Shared calculation functions for inventory management.
 * Used across CurrentStock, BatchTracking, StockReport, etc.
 */

import {
    BaseStockItem,
    StockStatus,
    STOCK_STATUS,
    PackBreakdown
} from '../types/inventorySharedTypes';

/**
 * Calculate stock value (quantity × rate)
 * 
 * @param quantity - Stock quantity
 * @param rate - Cost/selling rate per unit
 * @returns Total value
 */
export const calculateStockValue = (quantity: number, rate: number): number => {
    return parseFloat(String(quantity || 0)) * parseFloat(String(rate || 0));
};

/**
 * Check if stock is below reorder level
 * 
 * @param currentStock - Current stock level
 * @param reorderLevel - Reorder threshold
 * @param minStockLevel - Minimum stock level (fallback)
 * @returns True if low stock
 */
export const isLowStock = (
    currentStock: number,
    reorderLevel?: number,
    minStockLevel?: number
): boolean => {
    const threshold = reorderLevel || minStockLevel || 0;
    return threshold > 0 && currentStock <= threshold;
};

/**
 * Determine stock status based on current level
 * 
 * @param currentStock - Current stock level
 * @param reorderLevel - Reorder threshold
 * @param minStockLevel - Minimum stock level
 * @param maxStockLevel - Maximum stock level
 * @returns Stock status
 */
export const getStockStatus = (
    currentStock: number,
    reorderLevel?: number,
    minStockLevel?: number,
    maxStockLevel?: number
): StockStatus => {
    if (currentStock === 0) {
        return STOCK_STATUS.OUT_OF_STOCK;
    }

    const threshold = reorderLevel || minStockLevel || 0;
    if (threshold > 0 && currentStock <= threshold) {
        return STOCK_STATUS.LOW_STOCK;
    }

    if (maxStockLevel && currentStock > maxStockLevel) {
        return STOCK_STATUS.OVERSTOCK;
    }

    return STOCK_STATUS.NORMAL;
};

/**
 * Calculate pack breakdown (boxes, sub-boxes, strips/tablets)
 * 
 * For example: 247 tablets with pack_qty=10, sub_qty=10
 * → 2 boxes, 4 strips, 7 tablets
 * 
 * @param totalUnits - Total number of base units
 * @param packQty - Units per pack (e.g., 10 strips per box)
 * @param subQty - Sub-units per unit (e.g., 10 tablets per strip)  
 * @returns Pack breakdown
 */
export const calculatePackBreakdown = (
    totalUnits: number,
    packQty: number = 1,
    subQty: number = 1
): PackBreakdown => {
    const total = parseInt(String(totalUnits || 0));
    const pack = Math.max(1, parseInt(String(packQty || 1)));
    const sub = Math.max(1, parseInt(String(subQty || 1)));

    const unitsPerBox = pack * sub;
    const boxes = Math.floor(total / unitsPerBox);
    const remainingAfterBoxes = total % unitsPerBox;
    const subBoxes = Math.floor(remainingAfterBoxes / sub);
    const strips = remainingAfterBoxes % sub;

    // Format as human-readable string
    const parts: string[] = [];
    if (boxes > 0) parts.push(`${boxes} Box${boxes > 1 ? 'es' : ''}`);
    if (subBoxes > 0) parts.push(`${subBoxes} Strip${subBoxes > 1 ? 's' : ''}`);
    if (strips > 0) parts.push(`${strips} Unit${strips > 1 ? 's' : ''}`);

    return {
        totalUnits: total,
        boxes,
        subBoxes,
        strips,
        remainingUnits: strips,
        formatted: parts.join(', ') || `${total} Units`
    };
};

/**
 * Calculate total stock value for multiple items
 * 
 * @param items - Array of stock items
 * @returns Total value
 */
export const calculateTotalStockValue = (items: BaseStockItem[]): number => {
    return items.reduce((sum, item) => {
        const value = calculateStockValue(
            item.total_quantity_available || 0,
            item.cost_per_unit || item.cost_per_unit || 0
        );
        return sum + value;
    }, 0);
};

/**
 * Calculate average cost per unit
 * 
 * @param totalValue - Total stock value
 * @param totalQuantity - Total quantity
 * @returns Average cost
 */
export const calculateAverageCost = (
    totalValue: number,
    totalQuantity: number
): number => {
    if (totalQuantity === 0) return 0;
    return totalValue / totalQuantity;
};

/**
 * Calculate variance percentage between two values
 * 
 * @param actual - Actual value
 * @param expected - Expected/target value
 * @returns Percentage variance (positive = over, negative = under)
 */
export const calculateVariance = (
    actual: number,
    expected: number
): number => {
    if (expected === 0) return actual > 0 ? 100 : 0;
    return ((actual - expected) / expected) * 100;
};

/**
 * Get movement sign (+1 for increase, -1 for decrease)
 * 
 * @param movementType - Type of stock movement
 * @returns 1 for positive, -1 for negative, 0 for neutral
 */
export const getMovementSign = (movementType: string): number => {
    const positiveMovements = ['receive', 'opening', 'sales_return', 'transfer_in'];
    const negativeMovements = ['issue', 'sales', 'damage', 'expiry', 'transfer_out'];

    const type = movementType.toLowerCase();
    if (positiveMovements.includes(type)) return 1;
    if (negativeMovements.includes(type)) return -1;
    return 0; // For transfers and adjustments
};

/**
 * Validate stock quantity against constraints
 * 
 * @param quantity - Quantity to validate
 * @param availableQty - Available stock (for issue operations)
 * @param movementType - Type of movement
 * @returns Validation result
 */
export const validateStockQuantity = (
    quantity: number | string,
    availableQty?: number,
    movementType?: string
): { valid: boolean; message?: string } => {
    const qty = parseFloat(String(quantity));

    if (!quantity || isNaN(qty) || qty <= 0) {
        return {
            valid: false,
            message: 'Quantity must be greater than 0'
        };
    }

    // For issue/sales operations, check against available stock
    if (
        movementType &&
        ['issue', 'sales', 'transfer_out'].includes(movementType.toLowerCase()) &&
        availableQty !== undefined &&
        qty > availableQty
    ) {
        return {
            valid: false,
            message: `Quantity cannot exceed available stock (${availableQty})`
        };
    }

    return { valid: true };
};
