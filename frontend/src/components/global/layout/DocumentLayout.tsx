import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import ModuleHeader, { ModuleHeaderAction } from '../ui/ModuleHeader';
import DocumentFooter from '../ui/display/DocumentFooter';

// ==================== TYPE DEFINITIONS ====================

interface Shortcut {
    keys: string;
    action: string;
}

interface FooterProps {
    totalItems?: number;
    totalAmount?: number;
    subtotalAmount?: number;
    taxAmount?: number;
    grandTotal?: number;
    onCancel?: () => void;
    onContinue?: () => void;
    cancelLabel?: string;
    continueLabel?: string;
    [key: string]: unknown;
}

interface AdditionalAction {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'primary' | 'success' | 'secondary';
    className?: string;
    icon?: LucideIcon | React.ReactElement;
    disabled?: boolean;
    title?: string;
}

export interface DocumentLayoutProps {
    // Header props
    title: string;
    documentNumber?: string;
    status?: string;
    icon?: LucideIcon;
    iconColor?: string;
    onClose?: () => void;
    historyType?: string;
    showSaveDraft?: boolean;
    onSaveDraft?: () => void;
    additionalActions?: ModuleHeaderAction[];

    // Layout props
    maxWidth?: string;
    backgroundColor?: string;

    // Keyboard shortcuts
    shortcuts?: Shortcut[];

    // Footer props (optional - can be null for custom footer)
    footer?: 'default' | ReactNode | null;
    footerProps?: FooterProps;

    // Content
    children: ReactNode;
    className?: string;
}

// ==================== COMPONENT ====================

/**
 * DocumentLayout - Global layout wrapper for all document flows
 * Ensures consistent spacing, widths, and structure across all modules
 * 
 * This component enforces world-class UX standards:
 * - Consistent max-width containers
 * - Proper spacing and padding
 * - Responsive behavior
 * - Keyboard shortcuts section
 */
const DocumentLayout: React.FC<DocumentLayoutProps> = ({
    // Header props
    title,
    documentNumber,
    status = 'draft',
    icon,
    iconColor = 'text-blue-600',
    onClose,
    historyType,
    showSaveDraft = false,
    onSaveDraft,
    additionalActions = [],

    // Layout props
    maxWidth = 'max-w-6xl',
    backgroundColor = 'bg-blue-50',

    // Keyboard shortcuts
    shortcuts = [],

    // Footer props (optional - can be null for custom footer)
    footer = null,
    footerProps = {},

    // Content
    children,
    className = ''
}) => {
    // Default shortcuts if none provided
    const defaultShortcuts = shortcuts.length > 0 ? shortcuts : [
        { keys: 'Ctrl+S', action: 'Save' },
        { keys: 'Esc', action: 'Close' }
    ];

    return (
        <div className={`h-full ${backgroundColor}`}>
            <div className="h-full flex flex-col">

                {/* Header - Always consistent */}
                <ModuleHeader
                    title={title}
                    documentNumber={documentNumber}
                    status={status}
                    icon={icon}
                    iconColor={iconColor}
                    onClose={onClose}
                    historyType={historyType}
                    showSaveDraft={showSaveDraft}
                    onSaveDraft={onSaveDraft}
                    additionalActions={additionalActions}
                />

                {/* Keyboard Shortcuts Help */}
                {defaultShortcuts.length > 0 && (
                    <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
                        Keyboard shortcuts: {defaultShortcuts.map((shortcut, index) => (
                            <span key={index}>
                                {index > 0 && ' | '}
                                <strong>{shortcut.keys}</strong> - {shortcut.action}
                            </span>
                        ))}
                    </div>
                )}

                {/* Content Area - Consistent width and padding */}
                <div className={`flex-1 overflow-y-auto ${backgroundColor}`}>
                    <div className={`${maxWidth} mx-auto px-6 py-6 ${className}`}>
                        {children}
                    </div>
                </div>

                {/* Footer - Optional */}
                {footer !== null && (
                    footer === 'default' ? (
                        <DocumentFooter {...footerProps} />
                    ) : (
                        footer
                    )
                )}

            </div>
        </div>
    );
};

export default DocumentLayout;
