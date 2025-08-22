/**
 * Global Components Index
 * Export all reusable global components from a single location
 */

// Search Components
export { CustomerSearch } from './search/CustomerSearch';
// ProductSearch.tsx removed - was broken (batch selection not implemented)
export { default as ProductSearchSimple } from './search/ProductSearchSimple';
export { default as PartySearch } from './search/PartySearch';
export { default as SupplierSearch } from './search/SupplierSearch';
export { default as PurchaseProductSearch } from './PurchaseProductSearch';
export { default as InvoiceSearch } from './search/InvoiceSearch';
export { default as PurchaseSearch } from './search/PurchaseSearch';
export { default as HistoricalDataSearch } from './search/HistoricalDataSearch';

// Table Components
export { default as PharmaItemsTable } from './PharmaItemsTable';

// Modal Components
export { default as BatchSelector } from './modals/BatchSelector';
export { default as ProductCreationModal } from './modals/ProductCreationModal';
export { default as CustomerCreationB2B } from './ui/forms/CustomerCreationB2B';
export { default as SupplierCreationModal } from './modals/SupplierCreationModal';
export { default as GenericSuccessModal } from './modals/GenericSuccessModal';

// Calculator Components
export { default as GSTCalculator } from './calculators/GSTCalculator';

// Display Components
export { default as OutstandingInvoicesTable } from './display/OutstandingInvoicesTable';

// Action Components
export { default as ProceedToReviewComponent } from './components/ProceedToReviewComponent';

// Form Components  
export { default as PackTypeSelector } from './PackTypeSelector';
export { default as MonthYearPicker } from './MonthYearPicker';
export { default as PaymentModeSelector } from './forms/PaymentModeSelector';
export { default as NotesSection } from './forms/NotesSection';
export { default as AddressForm } from './ui/AddressForm';

// Re-export common components that are already global
export { default as BaseModal } from '../common/BaseModal';
export { default as ProductSearchInput } from '../common/ProductSearchInput';
export { default as CloseButton } from './ui/CloseButton';

// Layout Components - NEW
export { 
  default as GlobalLayout,
  ContentCard,
  PageHeader, 
  FormSection,
  StatsGrid 
} from './layout/GlobalLayout';

// Document Flow Components - NEW
export { 
  default as GlobalDocumentFlow,
  InvoiceFlow,
  PurchaseFlow,
  PurchaseOrderFlow,
  GRNFlow,
  ReturnFlow,
  SalesReturnFlow,
  SalesOrderFlow,
  ChallanFlow
} from './layout/GlobalDocumentFlow';

// Enhanced Document Flow - NEW
export { default as EnhancedGlobalDocumentFlow } from './layout/EnhancedGlobalDocumentFlow';

// NEW Global Layout Components for World-Class UX
export { default as DocumentLayout } from './layout/DocumentLayout';
export { default as SectionHeader } from './ui/SectionHeader';
export { default as FormGrid, FormField } from './ui/FormGrid';
export { default as ActionButton } from './ui/ActionButton';
export { default as ContentSection } from './ui/ContentSection';

// UI Components - NEW
export * from './ui';
export { default as Button } from './ui/Button.tsx';
export { 
  // Forms
  Select,
  DatePicker,
  NumberInput,
  CurrencyInput,
  SearchBar,
  // Display
  DataTable,
  StatusBadge,
  SummaryCard,
  InvoiceSummary,
  PaymentSummary,
  OrderSummary,
  ItemsTable,
  Card,
  CardSection,
  Pagination,
  Badge,
  BadgeGroup,
  SimpleStatusBadge,
  DocumentFooter,
  DocumentSummaryTop,
  PDFUploadCard,
  // Layout
  ModuleHeader,
  ViewHistoryButton,
  AddressSelector,
  AddressFormEnhanced,
  // Feedback
  Toast,
  ToastProvider,
  useToast
} from './ui';

// Filter Components - NEW
export { default as InlineFilterPanel } from './InlineFilterPanel';

// Ledger Components - temporarily commented out as ledger is empty
// export * from './ledger';
// export {
//   PartyLedgerBalance,
//   PartyStatement,
//   OutstandingBills,
//   AgingAnalysis
// } from './ledger';

// Navigation Components
export * from './navigation';
export {
  ModuleHub,
  EnhancedSidebar
} from './navigation';

// Export component types for TypeScript support (if needed in future)
export const GlobalComponentTypes = {
  SEARCH: 'search',
  MODAL: 'modal',
  CALCULATOR: 'calculator',
  FORM: 'form',
  DISPLAY: 'display',
  UI: 'ui'
};