/**
 * Common UI Components
 * Export all common components for easy importing
 */

// Core Components
export { default as EmptyState } from './EmptyState';
export { default as LoadingState, SkeletonLoader } from './LoadingState';
export { default as CompactCustomerSelector } from './CompactCustomerSelector';

// Form Components
export { default as FormInput, FormGroup, FormRow, FormSection } from './FormInput';

// Layout Components
export { default as PageHeader, PageTitle, SectionHeader } from './PageHeader';
export { default as ActionButtons, StepNavigation } from './ActionButtons';

// Display Components
export { default as SummaryDisplay, GSTBreakdown, InvoiceSummary } from './SummaryDisplay';
export { default as KeyboardShortcut, KeyboardHint, KeyboardShortcutsPanel } from './KeyboardShortcut';
export { default as KeyboardShortcutBar } from './KeyboardShortcutBar';

// Navigation Components
export { default as ModuleSidebar } from './ModuleSidebar';

// Re-export theme configuration
export { theme, classes, getThemeValue } from '../../config/theme.config';