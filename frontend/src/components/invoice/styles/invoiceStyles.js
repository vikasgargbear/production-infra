/**
 * Invoice Styles
 * Centralized style classes for invoice module
 */

export const invoiceStyles = {
  // Layout
  container: 'min-h-screen bg-gray-50',
  wrapper: 'max-w-7xl mx-auto px-4 py-6',
  
  // Cards
  card: 'bg-white rounded-lg shadow-sm border border-gray-200',
  cardHeader: 'px-6 py-4 border-b border-gray-100',
  cardBody: 'p-6',
  
  // Headers
  pageTitle: 'text-2xl font-bold text-gray-900',
  sectionTitle: 'text-lg font-semibold text-gray-900',
  sectionSubtitle: 'text-sm text-gray-600',
  
  // Form elements
  formGroup: 'mb-4',
  label: 'block text-sm font-medium text-gray-700 mb-1',
  input: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
  inputSmall: 'px-3 py-1.5 border border-gray-300 rounded text-sm',
  inputError: 'border-red-300 focus:ring-red-500 focus:border-red-500',
  
  // Buttons
  button: {
    primary: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors',
    secondary: 'px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors',
    danger: 'px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors',
    ghost: 'px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors',
    icon: 'p-2 hover:bg-gray-100 rounded-lg transition-colors',
    small: 'px-3 py-1 text-sm',
    disabled: 'opacity-50 cursor-not-allowed'
  },
  
  // Tables
  table: {
    wrapper: 'overflow-x-auto',
    table: 'w-full',
    header: 'bg-gray-50 border-b border-gray-200',
    headerCell: 'px-6 py-4 text-left text-xs font-medium text-gray-600 uppercase tracking-wider',
    body: 'divide-y divide-gray-100',
    row: 'hover:bg-gray-50 transition-colors',
    cell: 'px-6 py-4 text-sm text-gray-900'
  },
  
  // Status indicators
  status: {
    success: 'text-green-600 bg-green-50 border-green-200',
    warning: 'text-amber-600 bg-amber-50 border-amber-200',
    error: 'text-red-600 bg-red-50 border-red-200',
    info: 'text-blue-600 bg-blue-50 border-blue-200'
  },
  
  // Badges
  badge: {
    base: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-800'
  },
  
  // Search and dropdowns
  searchBox: 'relative',
  searchInput: 'w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
  searchIcon: 'absolute left-3 top-2.5 text-gray-400',
  dropdown: 'absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-auto',
  dropdownItem: 'px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0',
  
  // Loading states
  spinner: 'animate-spin h-5 w-5 text-blue-600',
  skeleton: 'animate-pulse bg-gray-200 rounded',
  
  // Empty states
  emptyState: 'text-center py-12',
  emptyIcon: 'mx-auto h-12 w-12 text-gray-400',
  emptyText: 'mt-2 text-sm text-gray-600',
  
  // Utility
  flexBetween: 'flex items-center justify-between',
  flexCenter: 'flex items-center justify-center',
  gap: {
    xs: 'gap-1',
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6'
  },
  
  // Responsive
  hiddenMobile: 'hidden sm:block',
  hiddenDesktop: 'sm:hidden'
};

// Helper function to combine multiple classes
export const cx = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

// Common component styles
export const componentStyles = {
  modalOverlay: 'fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4',
  modalContent: 'bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-300',
  modalHeader: 'bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 border-b border-gray-100',
  modalBody: 'p-6 overflow-y-auto max-h-[calc(90vh-120px)]',
  
  formField: 'mb-4',
  formLabel: 'block text-sm font-medium text-gray-700 mb-1',
  formInput: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
  formError: 'mt-1 text-sm text-red-600',
  
  iconButton: 'p-2 hover:bg-gray-100 rounded-lg transition-colors group',
  iconButtonDanger: 'p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors group',
};

export default invoiceStyles;