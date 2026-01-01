import React, { ReactNode } from 'react';

// ==================== TYPE DEFINITIONS ====================

type ColumnCount = 1 | 2 | 3 | 4 | 6;
type GapSize = 'sm' | 'md' | 'lg' | 'xl';

export interface FormGridProps {
    children: ReactNode;
    columns?: ColumnCount;
    gap?: GapSize;
    responsive?: boolean;
    className?: string;
}

export interface FormFieldProps {
    label?: string;
    required?: boolean;
    error?: string | null;
    helper?: string | null;
    className?: string;
    children: ReactNode;
}

// ==================== COMPONENTS ====================

/**
 * FormGrid - Global component for consistent form layouts
 * Provides responsive grid layouts with standardized spacing
 */
const FormGrid: React.FC<FormGridProps> = ({
    children,
    columns = 3,
    gap = 'md',
    responsive = true,
    className = ''
}) => {
    const gapClasses: Record<GapSize, string> = {
        sm: 'gap-2',
        md: 'gap-4',
        lg: 'gap-6',
        xl: 'gap-8'
    };

    const getGridClass = (): string => {
        if (!responsive) {
            return `grid-cols-${columns}`;
        }

        switch (columns) {
            case 1:
                return 'grid-cols-1';
            case 2:
                return 'grid-cols-1 md:grid-cols-2';
            case 3:
                return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
            case 4:
                return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
            case 6:
                return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6';
            default:
                return `grid-cols-${columns}`;
        }
    };

    return (
        <div className={`grid ${getGridClass()} ${gapClasses[gap]} ${className}`}>
            {children}
        </div>
    );
};

/**
 * FormField - Wrapper for individual form fields within FormGrid
 * Ensures consistent spacing and layout for form elements
 */
export const FormField: React.FC<FormFieldProps> = ({
    label,
    required = false,
    error = null,
    helper = null,
    className = '',
    children
}) => {
    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            {children}
            {helper && !error && (
                <p className="mt-1 text-xs text-gray-500">{helper}</p>
            )}
            {error && (
                <p className="mt-1 text-xs text-red-600">{error}</p>
            )}
        </div>
    );
};

export default FormGrid;
