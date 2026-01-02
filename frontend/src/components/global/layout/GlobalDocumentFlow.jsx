import React, { useState, useEffect } from 'react';
import ModuleHeader from '../ui/ModuleHeader';
import documentNumberGenerator from '../../../services/offline/documents/documentNumberGenerator';

/**
 * GlobalDocumentFlow - Universal layout component for all document flows
 * Provides consistent header, auto-generated numbers, and layout across all modules
 * 
 * Supports: Invoice, Purchase, Purchase Order, GRN, Returns, Sales Order, Challan
 */
const GlobalDocumentFlow = ({
  children,

  // Document Configuration
  documentType = 'invoice', // 'invoice', 'purchase', 'purchase-order', 'grn', 'return', 'sales-order', 'challan'
  title,
  documentNumber,
  status = 'draft',

  // Auto-generation
  autoGenerateNumber = true,
  onNumberGenerated,

  // Header Configuration  
  icon,
  iconColor,
  onClose,
  additionalActions = [],

  // Shortcuts & Help
  shortcutColor = 'blue',
  shortcuts = [],

  // Layout
  className = '',
  maxWidth = 'max-w-6xl'
}) => {

  const [generatedNumber, setGeneratedNumber] = useState(documentNumber || '');
  const [isGenerating, setIsGenerating] = useState(autoGenerateNumber && !documentNumber);

  // Document type configurations
  const documentConfigs = {
    'invoice': {
      title: 'Invoice',
      icon: 'FileText',
      color: 'blue',
      prefix: 'INV',
      serviceMethod: 'generateInvoiceNumber'
    },
    'purchase': {
      title: 'Purchase Entry',
      icon: 'FileText',
      color: 'green',
      prefix: 'PUR',
      serviceMethod: 'generatePurchaseNumber'
    },
    'purchase-order': {
      title: 'Purchase Order',
      icon: 'Package',
      color: 'purple',
      prefix: 'PO',
      serviceMethod: 'generatePurchaseOrderNumber'
    },
    'grn': {
      title: 'Goods Receipt',
      icon: 'Package',
      color: 'orange',
      prefix: 'GRN',
      serviceMethod: 'generateGRNNumber'
    },
    'return': {
      title: 'Purchase Return',
      icon: 'RotateCcw',
      color: 'red',
      prefix: 'RET',
      serviceMethod: 'generateReturnNumber'
    },
    'sales-return': {
      title: 'Sales Return',
      icon: 'RotateCcw',
      color: 'red',
      prefix: 'SRN',
      serviceMethod: 'generateSalesReturnNumber'
    },
    'sales-order': {
      title: 'Sales Order',
      icon: 'ShoppingCart',
      color: 'teal',
      prefix: 'SO',
      serviceMethod: 'generateSalesOrderNumber'
    },
    'challan': {
      title: 'Delivery Challan',
      icon: 'Truck',
      color: 'indigo',
      prefix: 'DC',
      serviceMethod: 'generateChallanNumber'
    }
  };

  const config = documentConfigs[documentType] || documentConfigs['invoice'];
  const finalTitle = title || config.title;
  const finalColor = shortcutColor || config.color;
  const finalIconColor = iconColor || `text-${config.color}-600`;

  // Auto-generate document number
  useEffect(() => {
    if (autoGenerateNumber && !documentNumber) {
      const generateNumber = async () => {
        try {
          setIsGenerating(true);
          const serviceMethod = config.serviceMethod;
          const number = await documentNumberGenerator[serviceMethod]();
          setGeneratedNumber(number);
          onNumberGenerated?.(number);
        } catch (error) {
          // Fallback
          const fallbackNumber = `${config.prefix}-${Date.now().toString().slice(-8)}`;
          setGeneratedNumber(fallbackNumber);
          onNumberGenerated?.(fallbackNumber);
        } finally {
          setIsGenerating(false);
        }
      };

      generateNumber();
    }
  }, [autoGenerateNumber, documentNumber, documentType, config, onNumberGenerated]);

  // Default shortcuts based on document type
  const defaultShortcuts = {
    'invoice': [
      { key: 'Ctrl+N', action: 'Add Customer' },
      { key: 'Ctrl+F', action: 'Search Products' },
      { key: 'Ctrl+S', action: 'Save' },
      { key: 'Esc', action: 'Close' }
    ],
    'purchase': [
      { key: 'Ctrl+S', action: 'Review & Save' },
      { key: 'Esc', action: 'Close' }
    ],
    'purchase-order': [
      { key: 'Ctrl+S', action: 'Save Order' },
      { key: 'Ctrl+P', action: 'Print' },
      { key: 'Esc', action: 'Close' }
    ],
    'grn': [
      { key: 'Ctrl+S', action: 'Save Receipt' },
      { key: 'Esc', action: 'Close' }
    ],
    'return': [
      { key: 'Ctrl+S', action: 'Save Return' },
      { key: 'Esc', action: 'Close' }
    ]
  };

  const finalShortcuts = shortcuts.length > 0 ? shortcuts : (defaultShortcuts[documentType] || []);
  const displayNumber = generatedNumber || documentNumber || (isGenerating ? 'Generating...' : `${config.prefix}-TEMP`);

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">

        {/* Header - Consistent across all modules */}
        <ModuleHeader
          title={finalTitle}
          documentNumber={displayNumber}
          status={status}
          icon={icon}
          iconColor={finalIconColor}
          onClose={onClose}
          historyType={documentType}
          additionalActions={additionalActions}
        />

        {/* Keyboard Shortcuts Help */}
        {finalShortcuts.length > 0 && (
          <div className={`bg-${finalColor}-50 px-4 py-2 text-xs text-${finalColor}-700 border-b border-${finalColor}-200`}>
            Keyboard shortcuts: {finalShortcuts.map((shortcut, index) => (
              <span key={index}>
                <strong>{shortcut.key}</strong> - {shortcut.action}
                {index < finalShortcuts.length - 1 ? ' | ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className={`${maxWidth} mx-auto px-6 py-6 ${className}`}>
            {children}
          </div>
        </div>

      </div>
    </div>
  );
};

/**
 * Pre-configured document flow components for common use cases
 */
export const InvoiceFlow = (props) => (
  <GlobalDocumentFlow {...props} documentType="invoice" />
);

export const PurchaseFlow = (props) => (
  <GlobalDocumentFlow {...props} documentType="purchase" />
);

export const PurchaseOrderFlow = (props) => (
  <GlobalDocumentFlow {...props} documentType="purchase-order" />
);

export const GRNFlow = (props) => (
  <GlobalDocumentFlow {...props} documentType="grn" />
);

export const ReturnFlow = (props) => (
  <GlobalDocumentFlow {...props} documentType="return" />
);

export const SalesReturnFlow = (props) => (
  <GlobalDocumentFlow {...props} documentType="sales-return" />
);

export const SalesOrderFlow = (props) => (
  <GlobalDocumentFlow {...props} documentType="sales-order" />
);

export const ChallanFlow = (props) => (
  <GlobalDocumentFlow {...props} documentType="challan" />
);

export default GlobalDocumentFlow;