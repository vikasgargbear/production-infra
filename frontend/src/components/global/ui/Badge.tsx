import React, { ReactNode } from 'react';
import { theme } from '../../../config/theme.config';

// ==================== TYPE DEFINITIONS ====================

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
type BadgeSize = 'sm' | 'md' | 'lg';
type StatusType = 'active' | 'inactive' | 'pending' | 'completed' | 'failed' | 'draft' | 'paid' | 'unpaid' | 'partial';

export interface BadgeProps {
    children: ReactNode;
    variant?: BadgeVariant;
    size?: BadgeSize;
    dot?: boolean;
    removable?: boolean;
    onRemove?: () => void;
    className?: string;
}

export interface BadgeGroupProps {
    children: ReactNode;
    className?: string;
}

export interface SimpleStatusBadgeProps {
    status: StatusType | string;
    className?: string;
}

// ==================== COMPONENTS ====================

/**
 * Badge Component
 * Consistent badge/status indicator styling across the application
 */
const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    dot = false,
    removable = false,
    onRemove,
    className = ''
}) => {
    const themeConfig = theme as any;
    const baseClasses = themeConfig.components?.badge?.base || 'inline-flex items-center font-medium rounded-full';
    const variantClasses = themeConfig.components?.badge?.variants?.[variant] || 'bg-blue-100 text-blue-800';

    const sizeClasses: Record<BadgeSize, string> = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-xs px-2.5 py-0.5',
        lg: 'text-sm px-3 py-1'
    };

    const dotColors: Record<string, string> = {
        success: 'bg-green-600',
        danger: 'bg-red-600',
        warning: 'bg-amber-600',
        primary: 'bg-blue-600',
        secondary: 'bg-gray-600',
        info: 'bg-cyan-600'
    };

    const badgeClasses = `${baseClasses} ${variantClasses} ${sizeClasses[size]} ${className}`.trim();

    return (
        <span className={badgeClasses}>
            {dot && (
                <span
                    className={`w-2 h-2 rounded-full mr-1.5 inline-block ${dotColors[variant] || 'bg-blue-600'}`}
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

/**
 * BadgeGroup - Badge group for displaying multiple badges
 */
export const BadgeGroup: React.FC<BadgeGroupProps> = ({ children, className = '' }) => (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
        {children}
    </div>
);

/**
 * SimpleStatusBadge - Simple status badge with predefined meanings
 */
export const SimpleStatusBadge: React.FC<SimpleStatusBadgeProps> = ({ status, className = '' }) => {
    const statusConfig: Record<StatusType, { variant: BadgeVariant; label: string }> = {
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

    const config = statusConfig[status as StatusType] || { variant: 'secondary' as BadgeVariant, label: status };

    return (
        <Badge variant={config.variant} dot className={className}>
            {config.label}
        </Badge>
    );
};

export default Badge;
