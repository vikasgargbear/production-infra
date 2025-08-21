import React from 'react';
import { X } from 'lucide-react';

/**
 * CloseButton - A consistent close button component with improved UX
 * 
 * Features:
 * - Hover animations
 * - Better visual feedback
 * - Consistent styling
 * - Keyboard accessibility
 * 
 * @param {Function} onClick - Function to call when clicked
 * @param {string} className - Additional CSS classes
 * @param {string} size - Size variant ('sm', 'md', 'lg')
 * @param {boolean} showTooltip - Whether to show tooltip
 */
const CloseButton = ({ 
  onClick, 
  className = '', 
  size = 'md',
  showTooltip = true 
}) => {
  const sizeClasses = {
    sm: 'p-1.5 w-7 h-7',
    md: 'p-2 w-9 h-9',
    lg: 'p-2.5 w-10 h-10'
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <button
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        text-gray-400 hover:text-gray-600 
        hover:bg-gray-100 active:bg-gray-200
        rounded-lg transition-all duration-200 
        hover:shadow-sm active:scale-95
        flex items-center justify-center
        focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-opacity-50
        ${className}
      `}
      title={showTooltip ? "Close (Esc)" : undefined}
    >
      <X className={`${iconSizes[size]} transition-transform duration-200 hover:rotate-90`} />
    </button>
  );
};

export default CloseButton;