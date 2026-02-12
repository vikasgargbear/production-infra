/**
 * Master Module Hooks Barrel Export
 */

export { useEntityMaster } from './useEntityMaster';
export type {
    UseEntityMasterConfig,
    UseEntityMasterReturn,
    ApiResponse
} from './useEntityMaster';

export { useSettingsEntity } from './useSettingsEntity';
export type {
    UseSettingsEntityConfig,
    UseSettingsEntityReturn,
    SettingsApiModule
} from './useSettingsEntity';

export { useSystemSettings } from './useSystemSettings';
export type {
    GeneralSettings,
    InvoiceSettings,
    StockSettings,
    TaxSettings,
    NotificationSettings,
    SecuritySettings,
    BackupSettings,
    SettingsState,
    UseSystemSettingsReturn
} from './useSystemSettings';

// Shared utilities
export { extractDataArray, filterBySearch, filterByType } from './masterUtils';
export { usePartyEdit } from './usePartyEdit';
export type { UsePartyEditConfig, FormErrors } from './usePartyEdit';

// Party edit hooks
export { useSupplierEdit } from './useSupplierEdit';
export { useCustomerEdit } from './useCustomerEdit';
export { useProducts } from './useProducts';
export { useCompanyProfile } from './useCompanyProfile';
export { useBatchMaster } from './useBatchMaster';
