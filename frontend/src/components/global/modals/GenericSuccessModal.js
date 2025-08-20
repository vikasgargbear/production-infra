import React from 'react';
import { CheckCircle, X, Printer, Download, Send, Copy, ExternalLink, Sparkles } from 'lucide-react';

/**
 * Generic Success Modal Component
 * Can be used across all modules (Invoice, Sales Order, Challan, etc.)
 */
const GenericSuccessModal = ({ 
  isOpen, 
  onClose, 
  title = "Success!",
  documentNumber, 
  documentId,
  documentType = "document", // "invoice", "sales-order", "challan", etc.
  customerName,
  totalAmount,
  onPrint,
  onDownload,
  onWhatsApp,
  additionalActions = [], // Custom action buttons
  showCopy = true,
  autoCloseDelay = null // Auto close after X seconds
}) => {
  const [copied, setCopied] = React.useState(false);
  
  // Auto close functionality
  React.useEffect(() => {
    if (isOpen && autoCloseDelay) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay * 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseDelay, onClose]);
  
  if (!isOpen) return null;
  
  const copyDocumentNumber = () => {
    if (!documentNumber) return;
    
    navigator.clipboard.writeText(documentNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = documentNumber;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Dynamic colors based on document type
  const getDocumentTypeConfig = (type) => {
    switch (type) {
      case 'invoice':
        return {
          gradient: 'from-green-50 to-emerald-50',
          iconBg: 'from-green-500 to-emerald-600',
          primaryColor: 'green'
        };
      case 'sales-order':
        return {
          gradient: 'from-purple-50 to-violet-50',
          iconBg: 'from-purple-500 to-violet-600',
          primaryColor: 'purple'
        };
      case 'challan':
        return {
          gradient: 'from-blue-50 to-cyan-50',
          iconBg: 'from-blue-500 to-cyan-600',
          primaryColor: 'blue'
        };
      case 'purchase-order':
        return {
          gradient: 'from-orange-50 to-amber-50',
          iconBg: 'from-orange-500 to-amber-600',
          primaryColor: 'orange'
        };
      default:
        return {
          gradient: 'from-gray-50 to-slate-50',
          iconBg: 'from-gray-500 to-slate-600',
          primaryColor: 'gray'
        };
    }
  };

  const config = getDocumentTypeConfig(documentType);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
        {/* Header with dynamic gradient */}
        <div className={`relative px-6 py-6 bg-gradient-to-r ${config.gradient} rounded-t-2xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 bg-gradient-to-br ${config.iconBg} rounded-xl flex items-center justify-center`}>
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-600 capitalize">{documentType.replace('-', ' ')} created successfully</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          {/* Document Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            {documentNumber && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {documentType.charAt(0).toUpperCase() + documentType.slice(1).replace('-', ' ')} Number:
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-gray-900">{documentNumber}</span>
                  {showCopy && (
                    <button
                      onClick={copyDocumentNumber}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                      title="Copy number"
                    >
                      {copied ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {customerName && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Customer:</span>
                <span className="text-sm text-gray-900">{customerName}</span>
              </div>
            )}
            
            {totalAmount && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Amount:</span>
                <span className="text-sm font-semibold text-gray-900">₹{totalAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {onPrint && (
              <button
                onClick={onPrint}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            )}
            
            {onWhatsApp && (
              <button
                onClick={onWhatsApp}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
                WhatsApp
              </button>
            )}
            
            {onDownload && (
              <button
                onClick={onDownload}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            
            {/* Additional custom actions */}
            {additionalActions.map((action, index) => (
              <button
                key={index}
                onClick={action.onClick}
                className={`flex items-center justify-center gap-2 px-4 py-3 ${action.className || 'bg-gray-600 hover:bg-gray-700 text-white'} rounded-lg transition-colors`}
              >
                {action.icon && <action.icon className="w-4 h-4" />}
                {action.label}
              </button>
            ))}
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full py-3 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default GenericSuccessModal;