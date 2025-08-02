/**
 * Stock Movement Module
 * Central export for all stock movement and inventory components
 */

// Main Components
export { default as StockMovement } from './StockMovement';
export { default as StockMovementV2 } from './StockMovementV2';
export { default as StockHub } from './StockHub';
export { default as StockReceive } from './components/StockReceive';
export { default as StockIssue } from './components/StockIssue';
export { default as StockTransfer } from './components/StockTransfer';
export { default as StockAdjustment } from './components/StockAdjustment';

// Sub Components
export { default as MovementTypeSelector } from './components/MovementTypeSelector';
export { default as ProductStockInfo } from './components/ProductStockInfo';
export { default as BatchSelector } from './components/BatchSelector';
export { default as MovementDetails } from './components/MovementDetails';
export { default as StockSummary } from './components/StockSummary';
export { default as MovementHistory } from './components/MovementHistory';

// Stock Utilities
export const MOVEMENT_TYPES = {
  RECEIVE: 'receive',
  ISSUE: 'issue',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
  OPENING: 'opening',
  DAMAGE: 'damage',
  EXPIRY: 'expiry'
};

export const MOVEMENT_REASONS = {
  PURCHASE: 'Purchase',
  SALES_RETURN: 'Sales Return',
  STOCK_TRANSFER_IN: 'Stock Transfer In',
  SALES: 'Sales',
  PURCHASE_RETURN: 'Purchase Return',
  STOCK_TRANSFER_OUT: 'Stock Transfer Out',
  DAMAGE: 'Damage',
  EXPIRY: 'Expiry',
  THEFT: 'Theft',
  SAMPLE: 'Sample',
  PHYSICAL_COUNT: 'Physical Count',
  OTHER: 'Other'
};

export const MOVEMENT_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Stock validation utilities
export const validateStockQuantity = (quantity, availableQty, movementType) => {
  if (!quantity || isNaN(quantity) || parseFloat(quantity) <= 0) {
    return { valid: false, message: 'Quantity must be greater than 0' };
  }
  
  if (movementType === MOVEMENT_TYPES.ISSUE && parseFloat(quantity) > availableQty) {
    return { valid: false, message: `Quantity cannot exceed available stock (${availableQty})` };
  }
  
  return { valid: true };
};

export const calculateStockValue = (quantity, rate) => {
  return parseFloat(quantity) * parseFloat(rate);
};

export const getMovementSign = (movementType) => {
  const positiveMovements = [MOVEMENT_TYPES.RECEIVE, MOVEMENT_TYPES.OPENING];
  const negativeMovements = [MOVEMENT_TYPES.ISSUE, MOVEMENT_TYPES.DAMAGE, MOVEMENT_TYPES.EXPIRY];
  
  if (positiveMovements.includes(movementType)) return 1;
  if (negativeMovements.includes(movementType)) return -1;
  return 0; // For transfers and adjustments, depends on context
};

// API
export { stockApi } from '../../services/api/modules/stock.api';

// Data Transformer
export { stockDataTransformer } from '../../services/api/utils/stockDataTransformer';

// Default export
const InventoryModule = {
  StockMovement,
  StockMovementV2,
  StockHub,
  components: {
    StockReceive,
    StockIssue,
    StockTransfer,
    StockAdjustment,
    MovementTypeSelector,
    ProductStockInfo,
    BatchSelector,
    MovementDetails,
    StockSummary,
    MovementHistory
  },
  constants: {
    MOVEMENT_TYPES,
    MOVEMENT_REASONS,
    MOVEMENT_STATUS
  },
  utils: {
    validateStockQuantity,
    calculateStockValue,
    getMovementSign
  }
};

export default InventoryModule;