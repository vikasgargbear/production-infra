import React, { ReactNode, ButtonHTMLAttributes } from 'react';
import { Loader2, LucideIcon } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';
type IconPosition = 'left' | 'right';

export interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    children?: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: LucideIcon;
    iconPosition?: IconPosition;
    loading?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
}

// ==================== COMPONENT ====================

/**
 * ActionButton - Global component for consistent button styling
 * Ensures unified button appearance and behavior across all modules
 */
const ActionButton: React.FC<ActionButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconPosition = 'left',
    loading = false,
    disabled = false,
    fullWidth = false,
    onClick,
    type = 'button',
    className = '',
    ...props
}) => {
    const sizeClasses: Record<ButtonSize, string> = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base'
    };

    const variantClasses: Record<ButtonVariant, string> = {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
        secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300',
        success: 'bg-green-600 hover:bg-green-700 text-white shadow-sm',
        warning: 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-sm',
        danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
        ghost: 'bg-transparent hover:bg-gray-100 text-gray-700'
    };

    const iconSizes: Record<ButtonSize, string> = {
        sm: 'w-3.5 h-3.5',
        md: 'w-4 h-4',
        lg: 'w-5 h-5'
    };

    const isDisabled = disabled || loading;

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={isDisabled}
            className={`
                ${sizeClasses[size]}
                ${variantClasses[variant]}
                ${fullWidth ? 'w-full' : ''}
                rounded-lg font-medium transition-colors
                flex items-center justify-center gap-2
                disabled:opacity-50 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                ${className}
            `}
            {...props}
        >
            {loading && iconPosition === 'left' && (
                <Loader2 className={`${iconSizes[size]} animate-spin`} />
            )}
            {!loading && Icon && iconPosition === 'left' && (
                <Icon className={iconSizes[size]} />
            )}
            {children}
            {!loading && Icon && iconPosition === 'right' && (
                <Icon className={iconSizes[size]} />
            )}
            {loading && iconPosition === 'right' && (
                <Loader2 className={`${iconSizes[size]} animate-spin`} />
            )}
        </button>
    );
};

export default ActionButton;
