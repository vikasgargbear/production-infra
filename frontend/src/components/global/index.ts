/**
 * Global Components Index
 * Export all reusable global components from a single location
 */

// Search Components
export { CustomerSearch } from './search/CustomerSearch';
export { EntitySearch } from './search/EntitySearch';
// ProductSearch.tsx removed - was broken (batch selection not implemented)
export { default as ProductSearchSimple } from './search/ProductSearchSimple';
// PartySearch removed - was unused
export { default as SupplierSearch } from './search/SupplierSearch';
export { default as PurchaseProductSearch } from './search/PurchaseProductSearch';
export { default as InvoiceSearch } from './search/InvoiceSearch';
export { default as PurchaseSearch } from './search/PurchaseSearch';
// HistoricalDataSearch removed - was unused

// Selector Components
export { default as InvoiceSelector } from './modals/InvoiceSelector';

// Table Components
// PharmaItemsTable removed - using ItemsTable from ./ui instead

// Modal Components
export { default as BatchSelector } from './modals/BatchSelector';
export { default as ProductCreationModal } from './modals/ProductCreationModal';
export { default as ProductEditModal } from './modals/ProductEditModal';
export { default as CustomerCreation } from './ui/forms/CustomerCreation';
export { default as SupplierCreationModal } from './modals/SupplierCreationModal';
export { default as GenericSuccessModal } from './modals/GenericSuccessModal';
export { default as DocumentImportModal } from './modals/DocumentImportModal';

// Calculator Components
export { default as GSTCalculator } from './ui/GSTCalculator';

// Display Components

// Summary Components - EXTRACTED FROM SALES MODULE
export { default as BillSummary } from './ui/display/BillSummary';
export { default as PaymentDetails } from './ui/display/PaymentDetails';
export { default as TransportDetails } from './ui/forms/TransportDetails';


// Action Components
export { default as ProceedToReviewComponent } from './ui/ProceedToReviewComponent';

// Form Components  
export { default as PackTypeSelector } from './ui/forms/PackTypeSelector';
export { default as MonthYearPicker } from './ui/forms/MonthYearPicker';
export { default as AddressForm } from './ui/AddressForm';
export { default as SplitPayment } from './ui/SplitPayment';
// PrintUtility exports
export { default as PrintUtility } from './ui/PrintUtility';
// ThermalPrintTemplate may not be exported, comment out if not needed

// Re-export common components that are already global
export { default as BaseModal } from './ui/BaseModal';
// Removed ProductSearchInput - use ProductSearchSimple instead
export { default as CloseButton } from './ui/CloseButton';

// Layout Components - NEW
export {
    default as GlobalLayout,
    ContentCard,
    PageHeader,
    FormSection,
    StatsGrid
} from './layout/GlobalLayout';

// Document Flow Components
export { default as EnhancedGlobalDocumentFlow } from './layout/EnhancedGlobalDocumentFlow';

// NEW Global Layout Components for World-Class UX
export { default as DocumentLayout } from './layout/DocumentLayout';
export { default as SectionHeader } from './ui/SectionHeader';
export { default as FormGrid, FormField } from './ui/FormGrid';
export { default as ActionButton } from './ui/ActionButton';
export { default as ContentSection } from './ui/ContentSection';
export { default as KeyboardShortcuts, SHORTCUT_SETS } from './ui/KeyboardShortcuts';
export {
    default as KeyboardNavigableTile,
    KeyboardNavigableForm,
    useKeyboardShortcuts
} from './ui/KeyboardNavigableTile';

// UI Components - NEW
export * from './ui';
export { default as Button } from './ui/Button';
export { default as CompactPaymentMethod, PaymentBadge } from './ui/CompactPaymentMethod';
export {
    // Forms
    Select,
    DatePicker,
    StandardDatePicker,
    NumberInput,
    CurrencyInput,
    SearchBar,
    // Display
    DataTable,
    StatusBadge,
    Pagination,
    SummaryCard,
    InvoiceSummary,
    PaymentSummary,
    OrderSummary,
    ItemsTable,
    ItemsTableKeyboard,
    Card,
    CardSection,
    Badge,
    BadgeGroup,
    SimpleStatusBadge,
    DocumentFooter,
    PDFUploadCard,
    // Layout
    ModuleHeader,
    ViewHistoryButton,
    AddressSelector,
    // Feedback
    Toast,
    ToastProvider,
    useToast,
    NotesSection
} from './ui';

// Filter Components - NEW
export { default as InlineFilterPanel } from './ui/InlineFilterPanel';

// Standard Components - Aliases used by purchase module
export { StandardFormInput, StandardSelect, DocumentSummaryTop } from './ui/StandardComponents';

// Navigation Components
export * from './navigation';
export {
    ModuleHub,
    EnhancedSidebar
} from './navigation';

// Export component types for TypeScript support
export const GlobalComponentTypes = {
    SEARCH: 'search',
    MODAL: 'modal',
    CALCULATOR: 'calculator',
    FORM: 'form',
    DISPLAY: 'display',
    UI: 'ui'
} as const;

// Re-export types from type declaration files
export type { DocumentFooterProps } from './ui/display/DocumentFooter';
export type { ModuleHeaderProps, ModuleHeaderAction } from './ui/ModuleHeader';
// Types from new TSX files (exported from component files, not type-only exports)
export type { ItemsTableProps, ItemsTableItem, ItemsTableRef } from './ui/display/ItemsTableUnified';
export type { PrintUtilityProps, PrintUtilityDocumentData } from './ui/PrintUtility';
export type { AddressFormProps, AddressData } from './ui/AddressForm';
export type { StandardDatePickerProps } from './ui/forms/StandardDatePicker';
