import React from 'react';
import { Plus } from 'lucide-react';

/**
 * AddNewButton - A modern, professional button for adding new items
 * 
 * @param {Object} props
 * @param {string} props.label - Button label (e.g., "New Product", "New Supplier")
 * @param {Function} props.onClick - Click handler
 * @param {string} props.variant - Button variant: 'primary' | 'secondary' | 'ghost'
 * @param {string} props.size - Button size: 'sm' | 'md' | 'lg'
 * @param {boolean} props.disabled - Whether button is disabled
 * @param {string} props.className - Additional CSS classes
 */
const AddNewButton = ({ 
  label, 
  onClick, 
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = ''
}) => {
  const baseClasses = `
    inline-flex items-center gap-2 font-medium rounded-lg
    transition-all duration-200 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    group relative overflow-hidden
  `;

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base'
  };

  const variantClasses = {
    primary: `
      bg-blue-600 text-white shadow-sm hover:bg-blue-700
      focus:ring-blue-500 hover:shadow-md
      transform hover:-translate-y-0.5
    `,
    secondary: `
      bg-gray-100 text-gray-700 border border-gray-300
      hover:bg-gray-200 hover:border-gray-400
      focus:ring-gray-500 hover:shadow-sm
    `,
    ghost: `
      text-blue-600 hover:text-blue-700
      hover:bg-blue-50 rounded-lg
      focus:ring-blue-500
    `
  };

  const iconClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
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
      {/* Icon */}
      <div className="relative z-10">
        <Plus className={`${iconClasses[size]} group-hover:scale-110 transition-transform duration-200`} />
      </div>
      
      {/* Label */}
      <span className="relative z-10 font-semibold">
        {label}
      </span>
    </button>
  );
};

export default AddNewButton; 