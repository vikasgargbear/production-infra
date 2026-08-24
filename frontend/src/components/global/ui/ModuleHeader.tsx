/**
 * ModuleHeader Component
 * Global header for all modules (Invoice, Challan, Sales Order, etc.)
 */

import React from 'react';
import { ArrowLeft, LucideIcon } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

export interface ModuleHeaderAction {
    label: string;
    icon?: LucideIcon | React.ReactElement;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'default' | 'primary' | 'success' | 'secondary';
    className?: string;
    title?: string;
}

export interface ModuleHeaderProps {
    title: string;
    documentNumber?: string;
    status?: string;
    icon?: LucideIcon;
    iconColor?: string;
    onClose?: () => void;
    /** @deprecated History buttons removed from create flows. Use dedicated history pages instead. */
    historyType?: string;
    additionalActions?: ModuleHeaderAction[];
    showSaveDraft?: boolean;
    onSaveDraft?: () => void;
    className?: string;
}

// ==================== COMPONENT ====================

const ModuleHeader: React.FC<ModuleHeaderProps> = ({
    title,
    documentNumber,
    status,
    icon: Icon,
    iconColor = "text-blue-600",
    onClose,
    historyType: _historyType, // deprecated, no longer rendered
    additionalActions = [],
    showSaveDraft = false,
    onSaveDraft,
    className = ""
}) => {
    const getStatusColor = (statusValue: string | undefined): string => {
        const statusLower = statusValue?.toLowerCase() || '';
        switch (statusLower) {
            case 'delivered':
            case 'paid':
            case 'completed':
                return 'bg-green-100 text-green-700';
            case 'dispatched':
            case 'shipped':
            case 'processing':
                return 'bg-blue-100 text-blue-700';
            case 'pending':
            case 'draft':
                return 'bg-gray-100 text-gray-700';
            case 'cancelled':
            case 'failed':
                return 'bg-red-100 text-red-700';
            default:
                return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <div className={`bg-white border-b border-gray-200 ${className}`}>
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                {/* Left side - Back button, Title and info */}
                <div className="flex min-w-0 flex-wrap items-center gap-2 min-h-[36px] sm:gap-3">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
                            title="Back (Esc)"
                            aria-label="Go back"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
                        </button>
                    )}
                    {Icon && (
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50">
                            <Icon className={`w-4 h-4 ${iconColor}`} />
                        </div>
                    )}
                    <h1 className="min-w-0 truncate text-base font-semibold text-gray-900 leading-none sm:text-lg">{title}</h1>
                    {documentNumber && (
                        <div className="max-w-[10rem] px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center sm:max-w-none sm:px-3">
                            <span className="truncate text-xs font-medium text-blue-700 leading-none sm:text-sm">{documentNumber}</span>
                        </div>
                    )}
                    {status && (
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium leading-none ${getStatusColor(status)}`}>
                            {status.toUpperCase()}
                        </div>
                    )}
                </div>

                {/* Right side - Actions */}
                <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:justify-end sm:pb-0">
                    {showSaveDraft && onSaveDraft && (
                        <button
                            onClick={onSaveDraft}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Save Draft
                        </button>
                    )}

                    {additionalActions.map((action, index) => {
                        const ActionIcon = action?.icon;
                        const isElement = React.isValidElement(ActionIcon);
                        return (
                            <button
                                key={index}
                                onClick={action.onClick}
                                disabled={action.disabled}
                                className={`min-h-10 shrink-0 px-4 py-2 text-sm rounded-lg transition-colors flex items-center ${action.variant === 'primary'
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400'
                                    : action.variant === 'success'
                                        ? 'bg-green-500 text-white hover:bg-green-600 disabled:bg-gray-400'
                                        : action.variant === 'secondary'
                                            ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                            : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                                    } ${action.className || ''}`}
                                title={action.title}
                            >
                                {ActionIcon ? (
                                    isElement ? (
                                        React.cloneElement(ActionIcon as React.ReactElement, {
                                            className: `w-4 h-4 ${action.label ? 'mr-1.5' : ''} ${(ActionIcon as React.ReactElement).props?.className || ''}`
                                        })
                                    ) : (
                                        React.createElement(ActionIcon as LucideIcon, { className: `w-4 h-4 ${action.label ? 'mr-1.5' : ''}` })
                                    )
                                ) : null}
                                {action.label}
                            </button>
                        );
                    })}

                </div>
            </div>
        </div>
    );
};

export default ModuleHeader;
