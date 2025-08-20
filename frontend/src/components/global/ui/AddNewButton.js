import React from 'react';
import { Plus } from 'lucide-react';

/**
 * AddNewButton - Enterprise-grade button for adding new items
 * 
 * @param {Object} props
 * @param {string} props.label - Button label (e.g., "Create Supplier", "Create Product")
 * @param {Function} props.onClick - Click handler
 * @param {string} props.variant - Button variant: 'primary' | 'secondary' | 'ghost'
 * @param {string} props.size - Button size: 'sm' | 'md' | 'lg'
 * @param {boolean} props.disabled - Whether button is disabled
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.showIcon - Whether to show the plus icon
 */
const AddNewButton = ({ 
  label, 
  onClick, 
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  showIcon = true
}) => {
  const baseClasses = `
    inline-flex items-center justify-center gap-2 font-medium rounded
    transition-colors duration-150
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:opacity-50 disabled:cursor-not-allowed
    relative
  `;

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
    lg: 'px-4 py-2.5 text-sm'
  };

  const variantClasses = {
    primary: `
      bg-blue-600 text-white
      hover:bg-blue-700
      focus:ring-blue-500
      shadow-sm
    `,
    secondary: `
      bg-white text-gray-700
      border border-gray-300
      hover:bg-gray-50
      focus:ring-gray-500
    `,
    ghost: `
      text-blue-600 hover:text-blue-700
      hover:bg-blue-50
      focus:ring-blue-500
    `
  };

  const iconClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-4 h-4'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseClasses}
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {/* Icon OR Label, not both - cleaner UX */}
      {showIcon && variant === 'icon-only' ? (
        <Plus className={`${iconClasses[size]}`} />
      ) : (
        <span className="font-medium">
          {label}
        </span>
      )}
    </button>
  );
};

export default AddNewButton; 