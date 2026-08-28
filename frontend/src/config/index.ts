/**
 * Configuration Module - Barrel Export
 */

// Core configs
export { default as APP_CONFIG, type AppConfig } from './app.config';
export { API_CONFIG } from './api.config';
export { getApiBaseUrl } from './apiBase';

// Domain configs

// Design & Theme
export { default as DESIGN_SYSTEM } from './design-system.config';
export { default as THEME_CONFIG } from './theme.config';

export { default as USER_ROLES_CONFIG } from './userRoles.config';

// Constants
export * from './constants';
