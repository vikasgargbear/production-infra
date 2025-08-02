import React, { ReactNode } from 'react';
import { theme } from '../../../config/theme.config';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type IconPosition = 'left' | 'right';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: IconPosition;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Button Component
 * Consistent button styling across the application
 */
const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  type = 'button',
  className = '',
  ...props
}) => {
  const baseClasses = theme.components.button.base;
  const sizeClasses = theme.components.button.sizes[size];
  const variantClasses = theme.components.button.variants[variant];
  const widthClasses = fullWidth ? 'w-full' : '';
  const disabledClasses = disabled || loading ? 'opacity-50 cursor-not-allowed' : '';
  const roundedClasses = 'rounded-lg';

  const buttonClasses = `
    ${baseClasses}
    ${sizeClasses}
    ${variantClasses}
    ${widthClasses}
    ${disabledClasses}
    ${roundedClasses}
    ${className}
  `.trim();

  const LoadingSpinner: React.FC = () => (
    <svg 
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoadingSpinner />}
      {!loading && icon && iconPosition === 'left' && (
        <span className="mr-2">{icon}</span>
      )}
      {children}
      {!loading && icon && iconPosition === 'right' && (
        <span className="ml-2">{icon}</span>
      )}
    </button>
  );
};

export default Button;
