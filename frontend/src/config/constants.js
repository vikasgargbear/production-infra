/**
 * Application-wide constants
 * Never hardcode these values directly in components
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.REACT_APP_API_URL || 'https://pharma-backend-production-0c09.up.railway.app',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
};

// Order Status Constants
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Payment Constants
export const PAYMENT_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  PENDING: 'pending'
};

export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  UPI: 'upi',
  BANK: 'bank',
  CHECK: 'check'
};

// Credit/Debit Note Reasons
export const NOTE_REASONS = {
  EXPIRED: 'EXPIRED_GOODS',
  DAMAGED: 'DAMAGED_GOODS',
  WRONG_PRODUCT: 'WRONG_BILLING',
  QUALITY: 'QUALITY_ISSUE',
  OVERCHARGE: 'OVERCHARGE',
  OTHER: 'OTHER'
};

// Settlement Types
export const SETTLEMENT_TYPES = {
  REFUND: 'refund',
  CREDIT_NOTE: 'credit_note',
  EXCHANGE: 'exchange'
};

// GST Rates
export const GST_RATES = {
  RATE_0: 0,
  RATE_5: 5,
  RATE_12: 12,
  RATE_18: 18,
  RATE_28: 28
};

// Business Rules
export const BUSINESS_RULES = {
  MAX_DISCOUNT_PERCENT: 50,
  MIN_ORDER_AMOUNT: 100,
  MAX_CREDIT_DAYS: 90,
  DEFAULT_CREDIT_DAYS: 30,
  ITEMS_PER_PAGE: 50,
  MAX_ITEMS_PER_PAGE: 200
};

// UI Constants
export const UI = {
  DEBOUNCE_DELAY: 300,
  TOAST_DURATION: 3000,
  MODAL_ANIMATION_DURATION: 200,
  TABLE_PAGE_SIZE: 20
};

// Date Formats
export const DATE_FORMATS = {
  DISPLAY: 'DD/MM/YYYY',
  API: 'YYYY-MM-DD',
  DATETIME: 'DD/MM/YYYY HH:mm',
  TIME: 'HH:mm'
};

// Feature Flags (from environment)
export const FEATURES = {
  ENABLE_GST: process.env.REACT_APP_ENABLE_GST === 'true',
  ENABLE_MULTI_BRANCH: process.env.REACT_APP_ENABLE_MULTI_BRANCH === 'true',
  ENABLE_BARCODE: process.env.REACT_APP_ENABLE_BARCODE === 'true'
};