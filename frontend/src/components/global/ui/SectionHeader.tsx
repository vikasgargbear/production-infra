import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type IconSize = 'sm' | 'md' | 'lg';
type ColorVariant = 'blue' | 'gray' | 'purple' | 'green' | 'indigo' | 'orange' | 'red';

export interface SectionHeaderProps {
    title: string;
    icon?: LucideIcon;
    iconSize?: IconSize;
    color?: ColorVariant;
    actions?: ReactNode;
    className?: string;
    subtitle?: string;
}

// ==================== COMPONENT ====================

/**
 * SectionHeader - Global component for consistent section headers across all modules
 * Ensures unified styling for form sections throughout the application
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    icon: Icon,
    iconSize = 'sm',
    color = 'blue',
    actions = null,
    className = '',
    subtitle
}) => {
    const iconSizes: Record<IconSize, string> = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6'
    };

    const colorClasses: Record<ColorVariant, string> = {
        blue: 'text-blue-700',
        gray: 'text-gray-700',
        purple: 'text-purple-700',
        green: 'text-green-700',
        indigo: 'text-indigo-700',
        orange: 'text-orange-700',
        red: 'text-red-700'
    };

    return (
        <div className={`flex items-center justify-between mb-3 ${className}`}>
            <div>
                <h3 className={`text-sm font-semibold ${colorClasses[color]} uppercase tracking-wider flex items-center`}>
                    {Icon && <Icon className={`${iconSizes[iconSize]} mr-2`} />}
                    {title}
                </h3>
                {subtitle && (
                    <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
                )}
            </div>
            {actions && (
                <div className="flex items-center gap-2">
                    {actions}
                </div>
            )}
        </div>
    );
};

export default SectionHeader;
