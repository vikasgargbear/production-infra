import React from 'react';
import { Check, X, Clock, AlertCircle, Ban, RefreshCw } from 'lucide-react';

export type StatusType = 
  | 'success' 
  | 'error' 
  | 'warning' 
  | 'info' 
  | 'pending' 
  | 'active'
  | 'inactive'
  | 'completed'
  | 'cancelled'
  | 'processing'
  | 'draft'
  | 'published'
  | 'archived'
  | 'custom';

export interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'light' | 'outline';
  showIcon?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

const statusConfig: Record<StatusType, {
  label: string;
  icon: React.ReactNode;
  colors: {
    solid: string;
    light: string;
    outline: string;
  };
}> = {
  success: {
    label: 'Success',
    icon: <Check className="w-3 h-3" />,
    colors: {
      solid: 'bg-green-600 text-white',
      light: 'bg-green-100 text-green-800',
      outline: 'border-green-600 text-green-600',
    },
  },
  error: {
    label: 'Error',
    icon: <X className="w-3 h-3" />,
    colors: {
      solid: 'bg-red-600 text-white',
      light: 'bg-red-100 text-red-800',
      outline: 'border-red-600 text-red-600',
    },
  },
  warning: {
    label: 'Warning',
    icon: <AlertCircle className="w-3 h-3" />,
    colors: {
      solid: 'bg-amber-600 text-white',
      light: 'bg-amber-100 text-amber-800',
      outline: 'border-amber-600 text-amber-600',
    },
  },
  info: {
    label: 'Info',
    icon: <AlertCircle className="w-3 h-3" />,
    colors: {
      solid: 'bg-blue-600 text-white',
      light: 'bg-blue-100 text-blue-800',
      outline: 'border-blue-600 text-blue-600',
    },
  },
  pending: {
    label: 'Pending',
    icon: <Clock className="w-3 h-3" />,
    colors: {
      solid: 'bg-yellow-600 text-white',
      light: 'bg-yellow-100 text-yellow-800',
      outline: 'border-yellow-600 text-yellow-600',
    },
  },
  active: {
    label: 'Active',
    icon: <Check className="w-3 h-3" />,
    colors: {
      solid: 'bg-green-600 text-white',
      light: 'bg-green-100 text-green-800',
      outline: 'border-green-600 text-green-600',
    },
  },
  inactive: {
    label: 'Inactive',
    icon: <Ban className="w-3 h-3" />,
    colors: {
      solid: 'bg-gray-600 text-white',
      light: 'bg-gray-100 text-gray-800',
      outline: 'border-gray-600 text-gray-600',
    },
  },
  completed: {
    label: 'Completed',
    icon: <Check className="w-3 h-3" />,
    colors: {
      solid: 'bg-green-600 text-white',
      light: 'bg-green-100 text-green-800',
      outline: 'border-green-600 text-green-600',
    },
  },
  cancelled: {
    label: 'Cancelled',
    icon: <X className="w-3 h-3" />,
    colors: {
      solid: 'bg-red-600 text-white',
      light: 'bg-red-100 text-red-800',
      outline: 'border-red-600 text-red-600',
    },
  },
  processing: {
    label: 'Processing',
    icon: <RefreshCw className="w-3 h-3 animate-spin" />,
    colors: {
      solid: 'bg-blue-600 text-white',
      light: 'bg-blue-100 text-blue-800',
      outline: 'border-blue-600 text-blue-600',
    },
  },
  draft: {
    label: 'Draft',
    icon: <Clock className="w-3 h-3" />,
    colors: {
      solid: 'bg-gray-600 text-white',
      light: 'bg-gray-100 text-gray-800',
      outline: 'border-gray-600 text-gray-600',
    },
  },
  published: {
    label: 'Published',
    icon: <Check className="w-3 h-3" />,
    colors: {
      solid: 'bg-green-600 text-white',
      light: 'bg-green-100 text-green-800',
      outline: 'border-green-600 text-green-600',
    },
  },
  archived: {
    label: 'Archived',
    icon: <Ban className="w-3 h-3" />,
    colors: {
      solid: 'bg-gray-600 text-white',
      light: 'bg-gray-100 text-gray-800',
      outline: 'border-gray-600 text-gray-600',
    },
  },
  custom: {
    label: 'Custom',
    icon: null,
    colors: {
      solid: 'bg-gray-600 text-white',
      light: 'bg-gray-100 text-gray-800',
      outline: 'border-gray-600 text-gray-600',
    },
  },
};

const sizeStyles = {
  xs: 'px-1.5 py-0.5 text-xs',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-sm',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'sm',
  variant = 'light',
  showIcon = true,
  icon,
  className = '',
}) => {
  const config = statusConfig[status as StatusType] || statusConfig.custom;
  const displayLabel = label || config.label || status;
  const displayIcon = icon || config.icon;
  
  const baseStyles = 'inline-flex items-center gap-1 font-medium rounded-full';
  const variantStyles = variant === 'outline' ? 'border-2' : '';
  const colorStyles = config.colors[variant];
  
  const badgeStyles = [
    baseStyles,
    sizeStyles[size],
    variantStyles,
    colorStyles,
    className,
  ].filter(Boolean).join(' ');
  
  return (
    <span className={badgeStyles}>
      {showIcon && displayIcon}
      {displayLabel}
    </span>
  );
};

// Utility function to get status color
export const getStatusColor = (status: StatusType | string, variant: 'solid' | 'light' | 'outline' = 'light'): string => {
  const config = statusConfig[status as StatusType];
  return config ? config.colors[variant] : statusConfig.custom.colors[variant];
};

// Utility function to get status icon
export const getStatusIcon = (status: StatusType | string): React.ReactNode => {
  const config = statusConfig[status as StatusType];
  return config ? config.icon : null;
};