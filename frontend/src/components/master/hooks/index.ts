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

// New hooks from modernization
export { useSupplierEdit } from './useSupplierEdit';
export { useCustomerEdit } from './useCustomerEdit';
export { useProducts } from './useProducts';
export { useCompanyProfile } from './useCompanyProfile';
export { useBatchMaster } from './useBatchMaster';
