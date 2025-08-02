/**
 * Global Components Index
 * Export all reusable global components from a single location
 */

// Search Components
export { CustomerSearch } from './search/CustomerSearch';
export { ProductSearch } from './search/ProductSearch';
export { default as ProductSearchSimple } from './search/ProductSearchSimple';
export { default as PartySearch } from './search/PartySearch';
export { default as SupplierSearch } from './SupplierSearch';
export { default as PurchaseProductSearch } from './PurchaseProductSearch';
export { default as InvoiceSearch } from './search/InvoiceSearch';
export { default as PurchaseSearch } from './search/PurchaseSearch';
export { default as HistoricalDataSearch } from './search/HistoricalDataSearch';

// Table Components
export { default as PharmaItemsTable } from './PharmaItemsTable';

// Modal Components
export { default as BatchSelector } from './modals/BatchSelector';
export { default as ProductCreationModal } from './modals/ProductCreationModal';
export { default as CustomerCreationModal } from './modals/CustomerCreationModal';
export { default as SupplierCreationModal } from './modals/SupplierCreationModal';

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

// Re-export common components that are already global
export { default as BaseModal } from '../common/BaseModal';
export { default as ProductSearchInput } from '../common/ProductSearchInput';

// UI Components - NEW
export * from './ui';
export { 
  // Forms
  Select,
  DatePicker,
  NumberInput,
  CurrencyInput,
  Button,
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
  Badge,
  BadgeGroup,
  SimpleStatusBadge,
  // Layout
  ModuleHeader,
  ViewHistoryButton,
  // Feedback
  Toast,
  ToastProvider,
  useToast
} from './ui';

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