import React from 'react';
import { CheckCircle, X, Printer, Download, Send, Copy, ExternalLink, Sparkles } from 'lucide-react';

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
  const [copied, setCopied] = React.useState(false);
  
  if (!isOpen) return null;
  
  const copyInvoiceNumber = () => {
    navigator.clipboard.writeText(invoiceNumber).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }).catch(err => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = invoiceNumber;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
        {/* Header with gradient */}
        <div className="relative px-6 py-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Invoice Created!</h2>
                <p className="text-sm text-gray-600">Your invoice is ready</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Success Animation */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Invoice #{invoiceNumber}
            </h3>
            <p className="text-gray-600 text-sm">
              Created for <span className="font-medium">{customerName}</span>
            </p>
            <p className="text-2xl font-bold text-green-600 mt-2">
              ₹{totalAmount?.toLocaleString() || '0'}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="space-y-3">
            <button
              onClick={onPrint}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors font-medium"
            >
              <Printer className="w-5 h-5" />
              Print Invoice
            </button>
            
            <button
              onClick={onDownload}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl transition-colors font-medium"
            >
              <Download className="w-5 h-5" />
              Download PDF
            </button>
            
            <button
              onClick={onShare}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors font-medium"
            >
              <Send className="w-5 h-5" />
              Share via WhatsApp
            </button>
            
            <button
              onClick={copyInvoiceNumber}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${
                copied 
                  ? 'bg-green-50 text-green-700' 
                  : 'bg-purple-50 hover:bg-purple-100 text-purple-700'
              }`}
            >
              {copied ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Invoice Number
                </>
              )}
            </button>
          </div>

          {/* Invoice Details */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Invoice Details</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Invoice ID:</span>
                <span className="font-mono text-gray-900">{invoiceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="text-green-600 font-medium">Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Created:</span>
                <span className="text-gray-900">{new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="mt-6 p-4 bg-blue-50 rounded-xl">
            <h4 className="text-sm font-semibold text-blue-700 mb-2">What's Next?</h4>
            <ul className="text-sm text-blue-600 space-y-1">
              <li>• Send the invoice to your customer</li>
              <li>• Track payment status</li>
              <li>• Generate delivery challan if needed</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                onClose();
                // Navigate to invoice list or create new invoice
              }}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceSuccessModal;