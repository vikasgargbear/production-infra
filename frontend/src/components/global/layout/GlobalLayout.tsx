import React, { ReactNode, useState, MouseEvent as ReactMouseEvent } from 'react';
import { getCardClasses } from '../../../config/design-system.config';

// ==================== TYPE DEFINITIONS ====================

type LayoutVariant = 'default' | 'compact' | 'spacious';
type CardPadding = 'compact' | 'standard' | 'spacious';

interface VariantConfig {
    container: string;
    inner: string;
    content: string;
    contentInner: string;
    spacing: string;
}

export interface GlobalLayoutProps {
    children: ReactNode;
    title?: string;
    subtitle?: string;
    icon?: React.ComponentType<{ className?: string }>;
    headerActions?: ReactNode;
    className?: string;
    variant?: LayoutVariant;
}

export interface ContentCardProps {
    children: ReactNode;
    title?: string;
    subtitle?: string;
    actions?: ReactNode;
    icon?: React.ComponentType<{ className?: string }>;
    className?: string;
    padding?: CardPadding;
}

export interface PageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.ComponentType<{ className?: string }>;
    actions?: ReactNode;
    breadcrumbs?: ReactNode;
    className?: string;
}

export interface FormSectionProps {
    title?: string;
    subtitle?: string;
    icon?: React.ComponentType<{ className?: string }>;
    children: ReactNode;
    className?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
}

interface StatChange {
    type: 'increase' | 'decrease';
    value: string;
}

interface Stat {
    label: string;
    value: string | number;
    change?: StatChange;
    icon?: React.ComponentType<{ className?: string }>;
    iconBg?: string;
    iconColor?: string;
}

export interface StatsGridProps {
    stats: Stat[];
    className?: string;
}

// ==================== COMPONENTS ====================

/**
 * GlobalLayout Component
 * Provides consistent spacing and layout structure across all modules
 * Based on the successful Sales module design
 */
const GlobalLayout: React.FC<GlobalLayoutProps> = ({
    children,
    title,
    subtitle,
    icon: Icon,
    headerActions,
    className = '',
    variant = 'default'
}) => {

    const variants: Record<LayoutVariant, VariantConfig> = {
        default: {
            container: 'h-full min-h-0 overflow-hidden bg-gray-50',
            inner: 'flex h-full min-h-0 flex-col',
            content: 'min-h-0 flex-1 overflow-y-auto bg-gray-50',
            contentInner: 'max-w-6xl mx-auto px-4 py-4 sm:px-6 sm:py-6',
            spacing: 'space-y-6'
        },
        compact: {
            container: 'h-full min-h-0 overflow-hidden bg-gray-50',
            inner: 'flex h-full min-h-0 flex-col',
            content: 'min-h-0 flex-1 overflow-y-auto bg-gray-50',
            contentInner: 'max-w-6xl mx-auto px-4 py-4',
            spacing: 'space-y-4'
        },
        spacious: {
            container: 'h-full min-h-0 overflow-hidden bg-gray-50',
            inner: 'flex h-full min-h-0 flex-col',
            content: 'min-h-0 flex-1 overflow-y-auto bg-gray-50',
            contentInner: 'max-w-7xl mx-auto px-8 py-8',
            spacing: 'space-y-8'
        }
    };

    const currentVariant = variants[variant];

    return (
        <div className={`${currentVariant.container} ${className}`}>
            <div className={currentVariant.inner}>

                {/* Header Section - Simple like ModuleHeader/Sales */}
                {(title || Icon || headerActions) && (
                    <div className="bg-white border-b border-gray-200">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                            {/* Left side - Title and info */}
                            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                                {Icon && <Icon className="w-5 h-5 text-blue-600" />}
                                <div className="min-w-0">
                                    <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
                                    {subtitle && (
                                        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
                                    )}
                                </div>
                            </div>

                            {/* Right side - Actions */}
                            {headerActions && (
                                <div className="flex shrink-0 items-center gap-2">
                                    {headerActions}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className={currentVariant.content}>
                    <div className={currentVariant.contentInner}>
                        <div className={currentVariant.spacing}>
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * ContentCard Component
 * Consistent card styling for content sections
 */
export const ContentCard: React.FC<ContentCardProps> = ({
    children,
    title,
    subtitle,
    actions,
    icon: Icon,
    className = '',
    padding = 'standard'
}) => {
    const cardClasses = getCardClasses(padding);

    return (
        <div className={`${cardClasses.container} ${className}`}>
            {(title || actions) && (
                <div className={cardClasses.header}>
                    <div className="flex items-center justify-between">
                        <div>
                            {title && (
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                    {Icon && <Icon className="w-5 h-5 mr-2 text-gray-600" />}
                                    {title}
                                </h3>
                            )}
                            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
                        </div>
                        {actions && (
                            <div className="flex items-center gap-2">
                                {actions}
                            </div>
                        )}
                    </div>
                </div>
            )}
            <div className={cardClasses.content}>
                {children}
            </div>
        </div>
    );
};

/**
 * PageHeader Component
 * Consistent header for pages without full GlobalLayout
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    icon: Icon,
    actions,
    breadcrumbs,
    className = ''
}) => {
    return (
        <div className={`bg-white border-b border-gray-200 shadow-sm ${className}`}>
            <div className="max-w-6xl mx-auto px-6 py-6">
                {breadcrumbs && (
                    <div className="mb-4">
                        <nav className="flex text-sm text-gray-500">
                            {breadcrumbs}
                        </nav>
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        {Icon && (
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                                <Icon className="w-6 h-6 text-white" />
                            </div>
                        )}
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                            {subtitle && (
                                <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
                            )}
                        </div>
                    </div>

                    {actions && (
                        <div className="flex items-center gap-3">
                            {actions}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * FormSection Component
 * Consistent form section styling
 */
export const FormSection: React.FC<FormSectionProps> = ({
    title,
    subtitle,
    icon: Icon,
    children,
    className = '',
    collapsible = false,
    defaultOpen = true
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    if (collapsible) {
        return (
            <details
                className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}
                open={isOpen}
            >
                <summary
                    className="px-6 py-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-between"
                    onClick={(e: ReactMouseEvent) => {
                        e.preventDefault();
                        setIsOpen(!isOpen);
                    }}
                >
                    <div className="flex items-center space-x-3">
                        {Icon && <Icon className="w-5 h-5 text-blue-600" />}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
                        </div>
                    </div>
                    <div className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </summary>
                {isOpen && (
                    <div className="p-6">
                        {children}
                    </div>
                )}
            </details>
        );
    }

    return (
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
            {title && (
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center space-x-3">
                        {Icon && <Icon className="w-5 h-5 text-blue-600" />}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
                        </div>
                    </div>
                </div>
            )}
            <div className="p-6">
                {children}
            </div>
        </div>
    );
};

/**
 * StatsGrid Component  
 * Consistent stats display
 */
export const StatsGrid: React.FC<StatsGridProps> = ({ stats, className = '' }) => {
    return (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ${className}`}>
            {stats.map((stat, index) => {
                const StatIcon = stat.icon;
                return (
                    <div
                        key={index}
                        className="bg-white rounded-lg border border-gray-200 px-6 py-4 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">{stat.label}</p>
                                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                {stat.change && (
                                    <p className={`text-sm ${stat.change.type === 'increase' ? 'text-green-600' : 'text-red-600'}`}>
                                        {stat.change.value}
                                    </p>
                                )}
                            </div>
                            {StatIcon && (
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.iconBg || 'bg-blue-100'}`}>
                                    <StatIcon className={`w-5 h-5 ${stat.iconColor || 'text-blue-600'}`} />
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default GlobalLayout;
