/**
 * Application-wide constants
 * Never hardcode these values directly in components
 */

// API Configuration - import from api.config.ts (single source of truth)
export { API_CONFIG } from './api.config';

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
