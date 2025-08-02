import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'white' | 'gray' | 'current';
  className?: string;
  label?: string;
  labelPosition?: 'bottom' | 'right';
}

const sizeStyles = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

const colorStyles = {
  primary: 'text-blue-600',
  secondary: 'text-gray-600',
  white: 'text-white',
  gray: 'text-gray-400',
  current: 'text-current',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  color = 'primary',
  className = '',
  label,
  labelPosition = 'bottom',
}) => {
  const spinnerElement = (
    <Loader2
      className={`animate-spin ${sizeStyles[size]} ${colorStyles[color]} ${className}`}
      aria-hidden="true"
    />
  );
  
  if (!label) {
    return spinnerElement;
  }
  
  return (
    <div
      className={`inline-flex items-center gap-2 ${
        labelPosition === 'bottom' ? 'flex-col' : ''
      }`}
      role="status"
    >
      {spinnerElement}
      <span className={`text-sm ${colorStyles[color]}`}>{label}</span>
    </div>
  );
};

// Loading overlay component
export interface LoadingOverlayProps {
  loading: boolean;
  children: React.ReactNode;
  spinner?: React.ReactNode;
  blur?: boolean;
  opacity?: number;
  className?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  loading,
  children,
  spinner,
  blur = true,
  opacity = 0.75,
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      {children}
      
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{
            backgroundColor: `rgba(255, 255, 255, ${opacity})`,
            backdropFilter: blur ? 'blur(2px)' : undefined,
          }}
        >
          {spinner || <Spinner size="lg" />}
        </div>
      )}
    </div>
  );
};

// Skeleton loader component
export interface SkeletonProps {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  className?: string;
  animation?: 'pulse' | 'wave' | 'none';
  count?: number;
  spacing?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  className = '',
  animation = 'pulse',
  count = 1,
  spacing = '0.5rem',
}) => {
  const baseStyles = 'bg-gray-200';
  
  const variantStyles = {
    text: 'rounded',
    rectangular: 'rounded',
    circular: 'rounded-full',
  };
  
  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };
  
  const skeletonElement = (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${animationStyles[animation]} ${className}`}
      style={{
        width: width || (variant === 'circular' ? height : '100%'),
        height: height || (variant === 'text' ? '1rem' : '100%'),
      }}
    />
  );
  
  if (count === 1) {
    return skeletonElement;
  }
  
  return (
    <div className="space-y-2" style={{ gap: spacing }}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>{skeletonElement}</div>
      ))}
    </div>
  );
};