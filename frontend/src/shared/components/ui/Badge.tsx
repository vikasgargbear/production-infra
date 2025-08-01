import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  rounded?: boolean;
  dot?: boolean;
  dotPosition?: 'left' | 'right';
  className?: string;
}

const variantStyles = {
  default: 'bg-gray-100 text-gray-800',
  primary: 'bg-blue-100 text-blue-800',
  secondary: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-cyan-100 text-cyan-800',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-sm',
  lg: 'px-3 py-1 text-sm',
};

const dotStyles = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  rounded = false,
  dot = false,
  dotPosition = 'left',
  className = '',
}) => {
  const baseStyles = 'inline-flex items-center font-medium';
  const roundedStyles = rounded ? 'rounded-full' : 'rounded';
  
  const badgeStyles = [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    roundedStyles,
    className,
  ].filter(Boolean).join(' ');
  
  const dotElement = dot && (
    <span
      className={`${dotStyles[size]} rounded-full bg-current ${
        dotPosition === 'left' ? 'mr-1.5' : 'ml-1.5'
      }`}
    />
  );
  
  return (
    <span className={badgeStyles}>
      {dot && dotPosition === 'left' && dotElement}
      {children}
      {dot && dotPosition === 'right' && dotElement}
    </span>
  );
};

// Notification Badge component
export interface NotificationBadgeProps {
  count: number;
  max?: number;
  showZero?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'red' | 'blue' | 'green' | 'yellow';
  className?: string;
  children?: React.ReactNode;
}

const notificationSizeStyles = {
  sm: 'min-w-[1.25rem] h-5 text-xs',
  md: 'min-w-[1.5rem] h-6 text-sm',
  lg: 'min-w-[1.75rem] h-7 text-sm',
};

const notificationColorStyles = {
  red: 'bg-red-600 text-white',
  blue: 'bg-blue-600 text-white',
  green: 'bg-green-600 text-white',
  yellow: 'bg-yellow-600 text-white',
};

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count,
  max = 99,
  showZero = false,
  size = 'md',
  color = 'red',
  className = '',
  children,
}) => {
  if (count === 0 && !showZero) {
    return <>{children}</>;
  }
  
  const displayCount = count > max ? `${max}+` : count;
  
  const badgeElement = (
    <span
      className={`
        inline-flex items-center justify-center
        px-2 rounded-full font-medium
        ${notificationSizeStyles[size]}
        ${notificationColorStyles[color]}
        ${className}
      `}
    >
      {displayCount}
    </span>
  );
  
  if (!children) {
    return badgeElement;
  }
  
  return (
    <div className="relative inline-flex">
      {children}
      <span className="absolute -top-2 -right-2">
        {badgeElement}
      </span>
    </div>
  );
};