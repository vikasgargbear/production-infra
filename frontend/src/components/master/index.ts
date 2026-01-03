/**
 * Master Module Barrel Export
 * 
 * Central export for all Master module components.
 */

// Core entry point
export { default as MasterHub } from './MasterHub';
export { default } from './MasterHub';

// Company & Settings
export { default as CompanyProfile } from './CompanyProfile';
export { default as CompanySettings } from './CompanySettings';
export { default as SystemSettings } from './SystemSettings';
export { default as FeatureSettings } from './FeatureSettings';

// Entity Masters
export { default as CustomerMaster } from './CustomerMaster';
export { default as SupplierMaster } from './SupplierMaster';
export { default as ProductMaster } from './ProductMaster';
export { default as BatchMaster } from './BatchMaster';
export { default as UnitMaster } from './UnitMaster';
export { default as WarehouseMaster } from './WarehouseMaster';
export { default as TaxMaster } from './TaxMaster';

// Edit Modals
export { default as CustomerEditModal } from './CustomerEditModal';
export { default as SupplierEditModal } from './SupplierEditModal';

// User & Bank Management
export { default as UserManagement } from './UserManagement';
export { default as BankAccountManager } from './BankAccountManager';

// Tools & Utilities
export { default as DataValidationEngine } from './DataValidationEngine';
export { default as BulkOperations } from './BulkOperations';
export { default as NotificationsAlerts } from './NotificationsAlerts';
export { default as ThirdPartyIntegrations } from './ThirdPartyIntegrations';

// Types & Utilities
export * from './types';
export * from './utils';
export * from './schemas';
export * from './hooks';
