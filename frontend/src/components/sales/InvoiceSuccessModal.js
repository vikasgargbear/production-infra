import React from 'react';
import { CheckCircle, X, Printer, Download, Send, Copy, ExternalLink } from 'lucide-react';

const InvoiceSuccessModal = ({ 
  isOpen, 
  onClose, 
  invoiceNumber, 
  invoiceId,
  customerName,
  totalAmount,
  onPrint,
  onDownload,
  onShare
}) => {
  if (!isOpen) return null;

  const copyInvoiceNumber = () => {
    navigator.clipboard.writeText(invoiceNumber);
    // You could add a toast notification here
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 transform transition-all">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Invoice Created!</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Success Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
          </div>

          {/* Invoice Details */}
          <div className="text-center mb-6">
            <p className="text-gray-600 mb-2">Invoice successfully created for</p>
            <p className="text-lg font-semibold text-gray-900 mb-1">{customerName}</p>
            
            <div className="flex items-center justify-center gap-2 mt-4 mb-2">
              <span className="text-sm text-gray-500">Invoice No:</span>
              <span className="font-mono font-semibold text-gray-900">{invoiceNumber}</span>
              <button
                onClick={copyInvoiceNumber}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Copy invoice number"
              >
                <Copy className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="text-2xl font-bold text-gray-900">
              ₹{totalAmount?.toFixed(0) || '0'}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={onPrint}
                className="flex flex-col items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Printer className="w-5 h-5 text-gray-600" />
                <span className="text-xs text-gray-600">Print</span>
              </button>
              
              <button
                onClick={onDownload}
                className="flex flex-col items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Download className="w-5 h-5 text-gray-600" />
                <span className="text-xs text-gray-600">Download</span>
              </button>
              
              <button
                onClick={onShare}
                className="flex flex-col items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Send className="w-5 h-5 text-gray-600" />
                <span className="text-xs text-gray-600">Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
          <div className="flex gap-3">
            <button
              onClick={() => {
                // Create new invoice
                window.location.reload();
              }}
              className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Create Another
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceSuccessModal;