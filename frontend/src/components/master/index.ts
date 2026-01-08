/**
 * Master Module Barrel Export
 * 
 * Central export for all Master module components.
 * Organized by category for better maintainability.
 */

// ==================== CORE HUB ====================
export { default as MasterHub } from './MasterHub';
export { default } from './MasterHub';

// ==================== MASTER DATA ====================
export * from './masters';

// ==================== SETTINGS ====================
export * from './settings';

// ==================== MODALS ====================
export * from './modals';

// Note: utilities merged into utils

// ==================== PRODUCTS (Subdirectory) ====================
export * from './products';

// ==================== SHARED INFRASTRUCTURE ====================
export * from './types';
export * from './utils';
export * from './schemas';
export * from './hooks';
