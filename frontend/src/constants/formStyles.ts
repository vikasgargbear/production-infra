/**
 * Consistent form styling classes for all components
 * Use these constants to ensure uniform input appearance across the application
 */

export const FORM_STYLES = {
  // Base input styling (text, email, number, etc.)
  input: 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed placeholder-gray-400',
  
  // Select dropdown styling
  select: 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed',
  
  // Textarea styling
  textarea: 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed placeholder-gray-400 resize-none',
  
  // Checkbox styling
  checkbox: 'w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed',
  
  // Radio button styling
  radio: 'w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed',
  
  // Label styling
  label: 'block text-sm font-medium text-gray-700 mb-1',
  labelRequired: 'block text-sm font-medium text-gray-700 mb-1 after:content-["*"] after:ml-0.5 after:text-red-500',
  
  // Helper and error text
  helperText: 'mt-1 text-xs text-gray-500',
  errorText: 'mt-1 text-xs text-red-600',
  successText: 'mt-1 text-xs text-green-600',
  
  // Input with error state
  inputError: 'w-full px-3 py-2 text-sm border border-red-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 placeholder-gray-400',
  
  // Input with success state
  inputSuccess: 'w-full px-3 py-2 text-sm border border-green-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 placeholder-gray-400',
  
  // Size variants
  inputSm: 'w-full px-2 py-1 text-xs border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed',
  inputLg: 'w-full px-4 py-3 text-base border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed',
  
  // Form group spacing
  formGroup: 'space-y-1',
  formRow: 'grid grid-cols-2 gap-4',
  
  // Button styles for consistency with forms
  button: {
    primary: 'px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
    secondary: 'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
    danger: 'px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
  }
};

/**
 * Helper function to get form field classes
 */
export const getFormFieldClass = (
  type: 'input' | 'select' | 'textarea' | 'checkbox' | 'radio',
  variant?: 'default' | 'error' | 'success',
  size?: 'sm' | 'md' | 'lg'
): string => {
  let baseClass = FORM_STYLES[type] || FORM_STYLES.input;
  
  // Apply variant
  if (variant === 'error' && type === 'input') {
    baseClass = FORM_STYLES.inputError;
  } else if (variant === 'success' && type === 'input') {
    baseClass = FORM_STYLES.inputSuccess;
  }
  
  // Apply size
  if (size === 'sm' && type === 'input') {
    baseClass = FORM_STYLES.inputSm;
  } else if (size === 'lg' && type === 'input') {
    baseClass = FORM_STYLES.inputLg;
  }
  
  return baseClass;
};

// Export as default for easier imports
export default FORM_STYLES;