import React from 'react';
import { theme } from '../../../config/theme.config';

/**
 * Badge Component
 * Consistent badge/status indicator styling across the application
 */
const Badge = ({
  children,
  variant = 'primary',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  className = ''
}) => {
  const baseClasses = theme.components.badge.base;
  const variantClasses = theme.components.badge.variants[variant];
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-0.5',
    lg: 'text-sm px-3 py-1'
  };

  const badgeClasses = `
    ${baseClasses}
    ${variantClasses}
    ${sizeClasses[size]}
    ${className}
  `.trim();

  return (
    <span className={badgeClasses}>
      {dot && (
        <span 
          className={`w-2 h-2 rounded-full mr-1.5 inline-block ${
            variant === 'success' ? 'bg-green-600' :
            variant === 'danger' ? 'bg-red-600' :
            variant === 'warning' ? 'bg-amber-600' :
            'bg-blue-600'
          }`} 
        />
      )}
      {children}
      {removable && onRemove && (
        <button
          onClick={onRemove}
          className="ml-1.5 -mr-1 hover:text-gray-700 focus:outline-none"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </span>
  );
};

// Badge group for displaying multiple badges
export const BadgeGroup = ({ children, className = '' }) => (
  <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
    {children}
  </div>
);

// Simple status badge with predefined meanings
export const SimpleStatusBadge = ({ status, className = '' }) => {
  const statusConfig = {
    active: { variant: 'success', label: 'Active' },
    inactive: { variant: 'secondary', label: 'Inactive' },
    pending: { variant: 'warning', label: 'Pending' },
    completed: { variant: 'success', label: 'Completed' },
    failed: { variant: 'danger', label: 'Failed' },
    draft: { variant: 'secondary', label: 'Draft' },
    paid: { variant: 'success', label: 'Paid' },
    unpaid: { variant: 'danger', label: 'Unpaid' },
    partial: { variant: 'warning', label: 'Partial' }
  };

  const config = statusConfig[status] || { variant: 'secondary', label: status };

  return (
    <Badge variant={config.variant} dot className={className}>
      {config.label}
    </Badge>
  );
};

export default Badge;