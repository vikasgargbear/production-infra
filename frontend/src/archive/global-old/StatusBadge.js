import React from 'react';
import { Check, X, Clock, AlertCircle, Ban, RefreshCw } from 'lucide-react';

/**
 * StatusBadge Component
 * A reusable badge for displaying status with appropriate colors and icons
 * 
 * @param {String} status - Status type
 * @param {String} label - Custom label (overrides default)
 * @param {String} size - Badge size (sm, md, lg)
 * @param {Boolean} showIcon - Show status icon
 * @param {String} className - Additional classes
 */
const StatusBadge = ({
  status,
  label,
  size = 'md',
  showIcon = true,
  className = ''
}) => {
  // Status configurations
  const statusConfig = {
    // General
    active: { label: 'Active', color: 'green', icon: Check },
    inactive: { label: 'Inactive', color: 'gray', icon: Ban },
    pending: { label: 'Pending', color: 'yellow', icon: Clock },
    processing: { label: 'Processing', color: 'blue', icon: RefreshCw },
    
    // Documents
    draft: { label: 'Draft', color: 'gray', icon: Clock },
    approved: { label: 'Approved', color: 'green', icon: Check },
    rejected: { label: 'Rejected', color: 'red', icon: X },
    cancelled: { label: 'Cancelled', color: 'red', icon: Ban },
    
    // Payments
    paid: { label: 'Paid', color: 'green', icon: Check },
    unpaid: { label: 'Unpaid', color: 'orange', icon: AlertCircle },
    partial: { label: 'Partial', color: 'yellow', icon: Clock },
    overdue: { label: 'Overdue', color: 'red', icon: AlertCircle },
    
    // Orders
    confirmed: { label: 'Confirmed', color: 'green', icon: Check },
    shipped: { label: 'Shipped', color: 'blue', icon: Check },
    delivered: { label: 'Delivered', color: 'green', icon: Check },
    returned: { label: 'Returned', color: 'orange', icon: RefreshCw },
    
    // Stock
    'in-stock': { label: 'In Stock', color: 'green', icon: Check },
    'low-stock': { label: 'Low Stock', color: 'yellow', icon: AlertCircle },
    'out-of-stock': { label: 'Out of Stock', color: 'red', icon: X },
    expired: { label: 'Expired', color: 'red', icon: AlertCircle },
    
    // Generic
    success: { label: 'Success', color: 'green', icon: Check },
    warning: { label: 'Warning', color: 'yellow', icon: AlertCircle },
    error: { label: 'Error', color: 'red', icon: X },
    info: { label: 'Info', color: 'blue', icon: AlertCircle }
  };

  const config = statusConfig[status] || statusConfig.info;
  const Icon = config.icon;
  const displayLabel = label || config.label;

  // Color classes
  const colorClasses = {
    green: 'bg-green-100 text-green-800 border-green-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    gray: 'bg-gray-100 text-gray-800 border-gray-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200'
  };

  const iconColorClasses = {
    green: 'text-green-600',
    red: 'text-red-600',
    yellow: 'text-yellow-600',
    blue: 'text-blue-600',
    gray: 'text-gray-600',
    orange: 'text-orange-600'
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  };

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        ${colorClasses[config.color]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {showIcon && (
        <Icon className={`${iconSizeClasses[size]} ${iconColorClasses[config.color]}`} />
      )}
      {displayLabel}
    </span>
  );
};

export default StatusBadge;