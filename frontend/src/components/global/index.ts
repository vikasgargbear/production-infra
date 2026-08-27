/**
 * Global Components Index
 * Export all reusable global components from a single location
 */

// ============== CREATION COMPONENTS ==============
export {
    SupplierCreationModal,
    ProductCreationModal,
    CustomerCreation
} from './creation';

// ============== SELECTOR COMPONENTS ==============
export {
    AddressSelector,
    BatchSelector,
    InvoiceSelector,
    PackTypeSelector
} from './selector';

// ============== EDIT COMPONENTS ==============
export {
    ProductEditModal
} from './edit';

// ============== MODAL COMPONENTS ==============
export {
    BaseModal,
    FullScreenModal,
    DocumentImportModal,
    GenericSuccessModal,
    PDFUploadModal
} from './modals';

// ============== SEARCH COMPONENTS ==============
export { CustomerSearch } from './search/CustomerSearch';
export { EntitySearch } from './search/EntitySearch';
export { default as ProductSearch } from './search/ProductSearch';
export { default as SupplierSearch } from './search/SupplierSearch';
export { default as PurchaseProductSearch } from './search/PurchaseProductSearch';
export { default as InvoiceSearch } from './search/InvoiceSearch';
export { default as PurchaseSearch } from './search/PurchaseSearch';

// ============== DISPLAY COMPONENTS ==============
export { default as BillSummary } from './ui/display/BillSummary';
export { default as TransportDetails } from './ui/forms/TransportDetails';

// ============== ACTION COMPONENTS ==============
export { default as ProceedToReviewComponent } from './ui/ProceedToReviewComponent';

// ============== FORM COMPONENTS ==============
export { default as MonthYearPicker } from './ui/forms/MonthYearPicker';
export { default as AddressForm } from './ui/AddressForm';
export { default as SplitPayment } from './ui/SplitPayment';
export { default as PrintUtility } from './ui/PrintUtility';
export { default as CloseButton } from './ui/CloseButton';

// ============== LAYOUT COMPONENTS ==============
export {
    default as GlobalLayout,
    ContentCard,
    PageHeader,
    FormSection,
    StatsGrid
} from './layout/GlobalLayout';
export { default as GlobalDocumentFlow } from './layout/GlobalDocumentFlow';
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

// ============== UI COMPONENTS ==============
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
    // Feedback
    Toast,
    ToastProvider,
    useToast,
    NotesSection
} from './ui';

// ============== FILTER COMPONENTS ==============
export { default as InlineFilterPanel } from './ui/InlineFilterPanel';

// ============== NAVIGATION COMPONENTS ==============
export * from './navigation';
export { ModuleHub } from './navigation';

// ============== TYPES ==============
export const GlobalComponentTypes = {
    SEARCH: 'search',
    MODAL: 'modal',
    CALCULATOR: 'calculator',
    FORM: 'form',
    DISPLAY: 'display',
    UI: 'ui',
    CREATION: 'creation',
    SELECTOR: 'selector',
    EDIT: 'edit'
} as const;

// Re-export types
export type { DocumentFooterProps } from './ui/display/DocumentFooter';
export type { ModuleHeaderProps, ModuleHeaderAction } from './ui/ModuleHeader';
export type { ItemsTableProps, ItemsTableItem, ItemsTableRef } from './ui/display/ItemsTableUnified';
export type { PrintUtilityProps, PrintUtilityDocumentData } from './ui/PrintUtility';
export type { AddressFormProps, AddressData } from './ui/AddressForm';
export type { StandardDatePickerProps } from './ui/forms/StandardDatePicker';

// ============== UTILITIES ==============
export * from './utilities';

// ============== LAYOUT ==============
export * from './layout';
