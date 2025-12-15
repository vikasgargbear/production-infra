import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModuleHeader from '../ui/ModuleHeader';
import DocumentFooter from '../ui/display/DocumentFooter';
import documentNumberService from '../../../services/offline/documents/documentNumberService';
import { useToast } from '../ui/feedback/Toast';

/**
 * EnhancedGlobalDocumentFlow - Universal two-step document creation flow
 * Based on InvoiceFlow pattern but made truly global
 * 
 * Features:
 * - Two-step flow: Create → Review
 * - Auto document number generation
 * - Consistent keyboard shortcuts
 * - Universal layout and footer
 * - Progress tracking
 */
const EnhancedGlobalDocumentFlow = ({
  // Document Configuration
  documentType = 'invoice', // 'invoice', 'purchase', 'challan', 'sales-order', etc.
  title,
  documentData,
  onDocumentUpdate,

  // Auto-generation
  autoGenerateNumber = true,

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
  saveLabel, // Custom save button label

  // Footer Configuration
  footerTotals = {},

  // Layout
  className = '',
  maxWidth = 'max-w-6xl',

  // Keyboard Shortcuts (per step)
  keyboardShortcuts = {}
}) => {
  const toast = useToast();

  const [generatedNumber, setGeneratedNumber] = useState('');
  const [localStep, setLocalStep] = useState(currentStep);
  const [isGenerating, setIsGenerating] = useState(false);

  // Document type configurations
  const documentConfigs = {
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
    }
  };

  const config = documentConfigs[documentType] || documentConfigs['invoice'];
  const finalTitle = title || config.title;
  const finalColor = config.color;
  const finalIconColor = iconColor || `text-${config.color}-600`;

  // Handle step changes
  const handleStepChange = (newStep) => {
    setLocalStep(newStep);
    onStepChange?.(newStep);
  };

  // Auto-generate document number - only once on mount
  const [hasGeneratedNumber, setHasGeneratedNumber] = useState(false);

  useEffect(() => {
    // Only generate once when component mounts and conditions are met
    if (autoGenerateNumber && !documentData?.documentNumber && !hasGeneratedNumber) {
      const generateNumber = async () => {
        try {
          setIsGenerating(true);
          setHasGeneratedNumber(true); // Mark as generated to prevent re-runs

          const serviceMethod = config.serviceMethod;
          let number = null;

          // Try to use the service if it exists
          if (documentNumberService && documentNumberService[serviceMethod]) {
            try {
              number = await documentNumberService[serviceMethod]();
            } catch (serviceError) {
              // Service failed, use fallback
            }
          }

          // Use fallback if service didn't provide a number
          if (!number) {
            number = `${config.prefix}-${Date.now().toString().slice(-8)}`;
          }

          setGeneratedNumber(number);
          if (onDocumentUpdate) {
            onDocumentUpdate(prev => ({ ...prev, documentNumber: number }));
          }
        } catch (error) {
          // Even on error, mark as generated to prevent infinite retries
          setHasGeneratedNumber(true);
        } finally {
          setIsGenerating(false);
        }
      };

      generateNumber();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerateNumber]); // Only depend on autoGenerateNumber prop

  // Default keyboard shortcuts per step
  const defaultShortcuts = {
    1: [ // Create/Edit step
      { key: 'Ctrl+N', action: 'Add Customer' },
      { key: 'Ctrl+F', action: 'Search Products' },
      { key: 'Ctrl+S', action: 'Save Draft' },
      { key: 'Esc', action: 'Close' }
    ],
    2: [ // Review step
      { key: 'Ctrl+S', action: `Save ${config.title}` },
      { key: 'Ctrl+P', action: 'Print' },
      { key: 'Esc', action: 'Close' }
    ]
  };

  const currentShortcuts = keyboardShortcuts[localStep] || defaultShortcuts[localStep] || [];
  const displayNumber = documentData?.documentNumber || generatedNumber || (isGenerating ? 'Generating...' : `${config.prefix}-DRAFT`);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+S - Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (localStep === 2 && onSave) {
          onSave();
        }
      }

      // Ctrl+P - Print (step 2 only)
      if (e.ctrlKey && e.key === 'p' && localStep === 2) {
        e.preventDefault();
        if (onPrint) {
          onPrint();
        }
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
  const handleProceedToReview = () => {
    if (canProceedToReview?.() === false) {
      toast?.error?.('Please complete all required fields');
      return;
    }
    handleStepChange(2);
  };

  // Additional actions for header based on step
  const stepActions = localStep === 2 ? [
    {
      label: "← Back to Edit",
      onClick: () => handleStepChange(1),
      variant: "default",
      className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg shadow-sm"
    },
    ...additionalActions
  ] : additionalActions;

  return (
    <div className={`h-full bg-${finalColor}-50`}>
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
          showSaveDraft={localStep === 1}
          onSaveDraft={() => {
            // TODO: Implement draft saving
          }}
        />

        {/* Keyboard Shortcuts Help */}
        {currentShortcuts.length > 0 && (
          <div className={`bg-${finalColor}-50 px-4 py-2 text-xs text-${finalColor}-700 border-b border-${finalColor}-200`}>
            Keyboard shortcuts: {currentShortcuts.map((shortcut, index) => (
              <span key={index}>
                <strong>{shortcut.key}</strong> - {shortcut.action}
                {index < currentShortcuts.length - 1 ? ' | ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Content Area - Step-based */}
        <div className={`flex-1 overflow-y-auto bg-${finalColor}-50`}>
          <div className={`${maxWidth} mx-auto px-6 py-6 ${className}`}>
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
            continueButtonColor={finalColor}
          />
        ) : (
          <DocumentFooter
            totalItems={footerTotals.itemCount || 0}
            subtotalAmount={footerTotals.subtotal || 0}
            taxAmount={footerTotals.tax || 0}
            roundOffAmount={footerTotals.roundOff || 0}
            grandTotal={footerTotals.grandTotal || 0}
            showActionButtons={true}
            onPrint={onPrint}
            onSave={onSave}
            isSaving={isSaving}
            saveLabel={config.saveLabel || saveLabel || 'Save'}
          />
        )}

      </div>
    </div>
  );
};

export default EnhancedGlobalDocumentFlow;