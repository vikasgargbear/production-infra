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
