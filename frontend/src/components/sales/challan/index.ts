/**
 * Challan Module Exports
 * 
 * Clean barrel export for all challan-related components
 */

// Main flow component
export { default as ChallanFlow } from './ChallanFlow';

// Legacy alias for backward compatibility
export { default as ModularChallanCreatorV5 } from './ChallanFlow';

// Step components
export { default as ChallanDetailsStep } from './steps/ChallanDetailsStep';
export { default as ChallanPreviewStep } from './steps/ChallanPreviewStep';

// UI components
export { default as ChallanPreview } from './ui/ChallanPreview';
export { default as ChallanSuccess } from './ui/ChallanSuccess';
export { default as ImportFromInvoiceModal } from './ui/ImportFromInvoiceModal';

// Hooks
export { useChallanLogic } from './hooks/useChallanLogic';

// Types
export type {
    Challan,
    ChallanItem,
    ChallanStatus,
    CustomerDetails,
    Employee,
    ImportData,
    CreatedChallanData,
    CompanyInfo,
    UseChallanLogicReturn
} from './types/challanTypes';

export { getInitialChallan } from './types/challanTypes';
