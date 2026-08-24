import React, { useState, useEffect, ReactNode, SetStateAction, Dispatch } from 'react';
import { LucideIcon } from 'lucide-react';
import ModuleHeader, { ModuleHeaderAction } from '../ui/ModuleHeader';
import DocumentFooter from '../ui/display/DocumentFooter';
import { useToast } from '../ui/feedback/Toast';

// ==================== TYPE DEFINITIONS ====================

type DocumentType =
    | 'invoice'
    | 'purchase'
    | 'challan'
    | 'sales-order'
    | 'purchase-order'
    | 'grn'
    | 'sales-return'
    | 'purchase-return'
    | 'stock-adjustment'
    | 'stock-transfer';

interface DocumentConfig {
    title: string;
    icon: string;
    color: string;
    prefix: string;
    serviceMethod: string;
    saveLabel: string;
    historyType: string;
}

interface Shortcut {
    key: string;
    action: string;
}

interface FooterTotals {
    itemCount?: number;
    totalAmount?: number;
    subtotal?: number;
    tax?: number;
    roundOff?: number;
    grandTotal?: number;
}

interface DocumentData {
    documentNumber?: string;
    status?: string;
    [key: string]: unknown;
}

interface AdditionalAction {
    label: string;
    onClick: () => void;
    variant?: string;
    className?: string;
    icon?: React.ComponentType<{ className?: string }>;
}

export interface GlobalDocumentFlowProps {
    // Document Configuration
    documentType?: DocumentType;
    title?: string;
    documentData?: DocumentData;
    onDocumentUpdate?: Dispatch<SetStateAction<DocumentData>> | ((updater: (prev: DocumentData) => DocumentData) => void);

    // Auto-generation
    autoGenerateNumber?: boolean;

    // Header Configuration
    icon?: LucideIcon;
    iconColor?: string;
    onClose?: () => void;
    additionalActions?: ModuleHeaderAction[];

    // Two-Step Flow
    currentStep?: number;
    onStepChange?: (step: number) => void;

    // Step 1: Create/Edit Content
    createContent?: ReactNode;

    // Step 2: Review Content
    reviewContent?: ReactNode;

    // Validation & Actions
    canProceedToReview?: () => boolean;
    onSave?: () => void;
    onPrint?: () => void;
    isSaving?: boolean;
    saveLabel?: string;

    // Footer Configuration
    footerTotals?: FooterTotals;

    // Layout
    className?: string;
    maxWidth?: string;

    // Keyboard Shortcuts (per step)
    keyboardShortcuts?: Record<number, Shortcut[]>;
}

// ==================== COMPONENT ====================

/**
 * GlobalDocumentFlow - Universal two-step document creation flow
 * Based on InvoiceFlow pattern but made truly global
 * 
 * Features:
 * - Two-step flow: Create → Review
 * - Backend-authoritative document numbers
 * - Consistent keyboard shortcuts
 * - Universal layout and footer
 * - Progress tracking
 */
const GlobalDocumentFlow: React.FC<GlobalDocumentFlowProps> = ({
    // Document Configuration
    documentType = 'invoice',
    title,
    documentData,

    // Header Configuration  
    icon,
    iconColor,
    onClose,
    additionalActions = [],

    // Two-Step Flow
    currentStep = 1,
    onStepChange,

    // Step 1: Create/Edit Content
    createContent,

    // Step 2: Review Content
    reviewContent,

    // Validation & Actions
    canProceedToReview,
    onSave,
    onPrint,
    isSaving = false,
    saveLabel,

    // Footer Configuration
    footerTotals = {},

    // Layout
    className = '',
    maxWidth = 'max-w-6xl',

    // Keyboard Shortcuts (per step)
    keyboardShortcuts = {}
}) => {
    const toast = useToast();

    const [localStep, setLocalStep] = useState<number>(currentStep);

    // Document type configurations
    const documentConfigs: Record<DocumentType, DocumentConfig> = {
        'invoice': {
            title: 'Invoice',
            icon: 'FileText',
            color: 'blue',
            prefix: 'INV',
            serviceMethod: 'generateInvoiceNumber',
            saveLabel: 'Generate Invoice',
            historyType: 'invoice'
        },
        'purchase': {
            title: 'Purchase Entry',
            icon: 'FileText',
            color: 'green',
            prefix: 'PUR',
            serviceMethod: 'generatePurchaseNumber',
            saveLabel: 'Create Purchase',
            historyType: 'purchase'
        },
        'challan': {
            title: 'Delivery Challan',
            icon: 'Truck',
            color: 'indigo',
            prefix: 'DC',
            serviceMethod: 'generateChallanNumber',
            saveLabel: 'Generate Challan',
            historyType: 'challan'
        },
        'sales-order': {
            title: 'Sales Order',
            icon: 'ShoppingCart',
            color: 'teal',
            prefix: 'SO',
            serviceMethod: 'generateSalesOrderNumber',
            saveLabel: 'Create Order',
            historyType: 'sales-order'
        },
        'purchase-order': {
            title: 'Purchase Order',
            icon: 'Package',
            color: 'purple',
            prefix: 'PO',
            serviceMethod: 'generatePurchaseOrderNumber',
            saveLabel: 'Create PO',
            historyType: 'purchase-order'
        },
        'grn': {
            title: 'Goods Receipt',
            icon: 'Package',
            color: 'orange',
            prefix: 'GRN',
            serviceMethod: 'generateGRNNumber',
            saveLabel: 'Create GRN',
            historyType: 'grn'
        },
        'sales-return': {
            title: 'Sales Return',
            icon: 'RotateCcw',
            color: 'red',
            prefix: 'SRN',
            serviceMethod: 'generateSalesReturnNumber',
            saveLabel: 'Process Return',
            historyType: 'sales-return'
        },
        'purchase-return': {
            title: 'Purchase Return',
            icon: 'RotateCcw',
            color: 'red',
            prefix: 'PRN',
            serviceMethod: 'generatePurchaseReturnNumber',
            saveLabel: 'Process Return',
            historyType: 'purchase-return'
        },
        'stock-adjustment': {
            title: 'Stock Adjustment',
            icon: 'Package',
            color: 'amber',
            prefix: 'ADJ',
            serviceMethod: 'generateAdjustmentNumber',
            saveLabel: 'Generate Adjustment',
            historyType: 'stock-adjustment'
        },
        'stock-transfer': {
            title: 'Stock Transfer',
            icon: 'Package',
            color: 'indigo',
            prefix: 'ST',
            serviceMethod: 'generateTransferNumber',
            saveLabel: 'Save Transfer',
            historyType: 'stock-transfer'
        }
    };

    const config = documentConfigs[documentType] || documentConfigs['invoice'];
    const finalTitle = title || config.title;
    const finalIconColor = iconColor || 'text-blue-600';

    // Handle step changes
    const handleStepChange = (newStep: number): void => {
        setLocalStep(newStep);
        onStepChange?.(newStep);
    };

    // Default keyboard shortcuts per step
    const defaultShortcuts: Record<number, Shortcut[]> = {
        1: [
            { key: 'Ctrl+N', action: 'Add Customer' },
            { key: 'Ctrl+F', action: 'Search Products' },
            { key: 'Esc', action: 'Close' }
        ],
        2: [
            ...(onSave ? [{ key: 'Ctrl+S', action: `Save ${config.title}` }] : []),
            ...(onPrint ? [{ key: 'Ctrl+P', action: 'Print' }] : []),
            { key: 'Esc', action: 'Close' }
        ]
    };

    const currentShortcuts = keyboardShortcuts[localStep] || defaultShortcuts[localStep] || [];
    // Final document numbers are assigned only by a successful backend command.
    const displayNumber = documentData?.documentNumber || `${config.prefix}-DRAFT`;

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent): void => {
            // Ctrl+S - Save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                if (localStep === 2 && onSave) {
                    onSave();
                }
            }

            // Ctrl+P - Prevent browser print dialog (print only available after generation)
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
            }

            // Escape - Close or go back
            if (e.key === 'Escape') {
                if (localStep === 2) {
                    handleStepChange(1);
                } else {
                    onClose?.();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [localStep, onSave, onPrint, onClose]);

    // Handle proceed to review
    const handleProceedToReview = (): void => {
        if (canProceedToReview?.() === false) {
            toast?.error?.('Please complete all required fields');
            return;
        }
        handleStepChange(2);
    };

    // Additional actions for header based on step
    const stepActions: ModuleHeaderAction[] = localStep === 2 ? [
        {
            label: "← Back to Edit",
            onClick: () => handleStepChange(1),
            variant: "default" as const,
            className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg shadow-sm"
        },
        ...additionalActions
    ] : additionalActions;

    return (
        <div className="h-full bg-gray-50">
            <div className="h-full flex flex-col">

                {/* Header - Consistent across all modules */}
                <ModuleHeader
                    title={finalTitle}
                    documentNumber={displayNumber}
                    status={localStep === 2 ? 'review' : documentData?.status || 'draft'}
                    icon={icon}
                    iconColor={finalIconColor}
                    onClose={onClose}
                    historyType={config.historyType}
                    additionalActions={stepActions}
                    // Draft persistence is not implemented. Do not present a no-op action.
                    showSaveDraft={false}
                />

                {/* Keyboard Shortcuts Help */}
                {currentShortcuts.length > 0 && (
                    <div className="hidden bg-white px-4 py-2 text-xs text-gray-600 border-b border-gray-200 sm:block">
                        Keyboard shortcuts: {currentShortcuts.map((shortcut, index) => (
                            <span key={index}>
                                <strong>{shortcut.key}</strong> - {shortcut.action}
                                {index < currentShortcuts.length - 1 ? ' | ' : ''}
                            </span>
                        ))}
                    </div>
                )}

                {/* Content Area - Step-based */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    <div className={`${maxWidth} mx-auto px-3 py-4 sm:px-6 sm:py-6 ${className}`}>
                        {localStep === 1 ? createContent : reviewContent}
                    </div>
                </div>

                {/* Footer - Different for each step */}
                {localStep === 1 ? (
                    <DocumentFooter
                        totalItems={footerTotals.itemCount || 0}
                        totalAmount={footerTotals.totalAmount || 0}
                        onCancel={onClose}
                        onContinue={handleProceedToReview}
                        cancelLabel="Reset"
                        continueLabel="Continue"
                        continueDisabled={canProceedToReview?.() === false}
                        continueButtonColor="blue"
                    />
                ) : (
                    <DocumentFooter
                        totalItems={footerTotals.itemCount || 0}
                        subtotalAmount={footerTotals.subtotal || 0}
                        taxAmount={footerTotals.tax || 0}
                        roundOffAmount={footerTotals.roundOff || 0}
                        grandTotal={footerTotals.grandTotal || 0}
                        showActionButtons={true}
                        showPrintOptions={false}
                        onSave={onSave}
                        isSaving={isSaving}
                        saveLabel={config.saveLabel || saveLabel || 'Save'}
                    />
                )}

            </div>
        </div>
    );
};

export default GlobalDocumentFlow;
