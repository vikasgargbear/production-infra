import React from 'react';

/**
 * FormGrid - Global component for consistent form layouts
 * Provides responsive grid layouts with standardized spacing
 */
const FormGrid = ({ 
  children, 
  columns = 3, // 1, 2, 3, 4, 6
  gap = 'md', // sm: gap-2, md: gap-4, lg: gap-6
  responsive = true,
  className = ''
}) => {
  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
    xl: 'gap-8'
  };

  const getGridClass = () => {
    if (!responsive) {
      return `grid-cols-${columns}`;
    }

    // Responsive grid patterns for world-class UX
    switch (columns) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 md:grid-cols-2';
      case 3:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      case 4:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
      case 6:
        return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6';
      default:
        return `grid-cols-${columns}`;
    }
  };

  return (
    <div className={`grid ${getGridClass()} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
};

/**
 * FormField - Wrapper for individual form fields within FormGrid
 * Ensures consistent spacing and layout for form elements
 */
export const FormField = ({ 
  label, 
  required = false, 
  error = null,
  helper = null,
  className = '',
  children 
}) => {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-600 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {helper && !error && (
        <p className="mt-1 text-xs text-gray-500">{helper}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

export default FormGrid;