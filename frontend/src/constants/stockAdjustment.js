/**
 * Stock Adjustment Constants
 * Enterprise-grade constants for stock adjustment operations
 */

// Adjustment Types
export const ADJUSTMENT_TYPES = {
  INCREASE: 'increase',
  DECREASE: 'decrease'
};

// Adjustment Type Labels
export const ADJUSTMENT_TYPE_LABELS = {
  [ADJUSTMENT_TYPES.INCREASE]: 'Stock Increase',
  [ADJUSTMENT_TYPES.DECREASE]: 'Stock Decrease'
};

// Adjustment Reasons mapped to backend values
export const ADJUSTMENT_REASONS = {
  increase: [
    { value: 'gift', label: 'Gift/Free Sample Received' },
    { value: 'transfer_in', label: 'Transfer from Another Location' },
    { value: 'found', label: 'Found/Recovered Stock' },
    { value: 'adjustment', label: 'Stock Count Adjustment' },
    { value: 'opening', label: 'Opening Stock' },
    { value: 'return_from_customer', label: 'Customer Return' },
    { value: 'other', label: 'Other Increase' }
  ],
  decrease: [
    { value: 'damaged', label: 'Damaged Goods' },
    { value: 'expired', label: 'Expired Products' },
    { value: 'lost', label: 'Lost/Missing' },
    { value: 'sample', label: 'Free Sample Given' },
    { value: 'personal', label: 'Personal Use' },
    { value: 'transfer_out', label: 'Transfer to Another Location' },
    { value: 'theft', label: 'Theft' },
    { value: 'adjustment', label: 'Stock Count Adjustment' },
    { value: 'other', label: 'Other Decrease' }
  ]
};

// Icons for adjustment types
export const ADJUSTMENT_ICONS = {
  [ADJUSTMENT_TYPES.INCREASE]: 'TrendingUp',
  [ADJUSTMENT_TYPES.DECREASE]: 'TrendingDown'
};

// Colors for adjustment types
export const ADJUSTMENT_COLORS = {
  [ADJUSTMENT_TYPES.INCREASE]: 'green',
  [ADJUSTMENT_TYPES.DECREASE]: 'red'
};

// Validation rules
export const ADJUSTMENT_VALIDATION = {
  MIN_QUANTITY: 1,
  MAX_QUANTITY: 999999,
  REASON_REQUIRED: true,
  NOTES_MAX_LENGTH: 500
};

// Status indicators
export const ADJUSTMENT_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed'
};

export const ADJUSTMENT_STATUS_LABELS = {
  [ADJUSTMENT_STATUS.DRAFT]: 'Draft',
  [ADJUSTMENT_STATUS.PENDING]: 'Pending Approval',
  [ADJUSTMENT_STATUS.APPROVED]: 'Approved',
  [ADJUSTMENT_STATUS.REJECTED]: 'Rejected',
  [ADJUSTMENT_STATUS.COMPLETED]: 'Completed'
};

export const ADJUSTMENT_STATUS_COLORS = {
  [ADJUSTMENT_STATUS.DRAFT]: 'gray',
  [ADJUSTMENT_STATUS.PENDING]: 'yellow',
  [ADJUSTMENT_STATUS.APPROVED]: 'blue',
  [ADJUSTMENT_STATUS.REJECTED]: 'red',
  [ADJUSTMENT_STATUS.COMPLETED]: 'green'
};