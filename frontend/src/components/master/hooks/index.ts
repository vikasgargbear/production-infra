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

// Shared utilities
export { extractDataArray, filterBySearch, filterByType } from './masterUtils';
export { usePartyEdit } from './usePartyEdit';
export type { UsePartyEditConfig, FormErrors } from './usePartyEdit';

// Party edit hooks
export { useSupplierEdit } from './useSupplierEdit';
export { useCustomerEdit } from './useCustomerEdit';
export { useCompanyProfile } from './useCompanyProfile';
