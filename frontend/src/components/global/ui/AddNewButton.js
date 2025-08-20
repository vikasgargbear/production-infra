import React from 'react';
import { Plus, Sparkles } from 'lucide-react';

/**
 * AddNewButton - A modern, user-friendly button for adding new items
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
      bg-gradient-to-r from-indigo-500 to-purple-600
      text-white shadow-md hover:shadow-lg
      hover:from-indigo-600 hover:to-purple-700
      focus:ring-indigo-500
      transform hover:-translate-y-0.5
    `,
    secondary: `
      bg-gradient-to-r from-gray-100 to-gray-200
      text-gray-700 border border-gray-300
      hover:from-gray-200 hover:to-gray-300
      focus:ring-gray-500
      hover:shadow-md
    `,
    ghost: `
      text-indigo-600 hover:text-indigo-700
      hover:bg-indigo-50 rounded-lg
      focus:ring-indigo-500
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
      {/* Sparkle effect for primary variant */}
      {variant === 'primary' && (
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}
      
      {/* Icon */}
      <div className="relative z-10">
        {variant === 'primary' ? (
          <Sparkles className={`${iconClasses[size]} group-hover:rotate-12 transition-transform duration-200`} />
        ) : (
          <Plus className={`${iconClasses[size]} group-hover:scale-110 transition-transform duration-200`} />
        )}
      </div>
      
      {/* Label */}
      <span className="relative z-10 font-semibold">
        {label}
      </span>
      
      {/* Subtle glow effect for primary variant */}
      {variant === 'primary' && (
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/20 to-purple-400/20 rounded-lg blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}
    </button>
  );
};

export default AddNewButton; 