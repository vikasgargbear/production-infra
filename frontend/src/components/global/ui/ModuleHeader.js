import React from 'react';
import { X } from 'lucide-react';
import ViewHistoryButton from './ViewHistoryButton';

/**
 * Global Module Header Component
 * Provides consistent header layout across all modules
 * 
 * Props:
 * - title: Main title (e.g., "Delivery Challan", "Invoice")
 * - documentNumber: Document number to display
 * - status: Optional status badge
 * - icon: Icon component to display
 * - iconColor: Color class for icon (default: "text-blue-600")
 * - onClose: Function to call when close button is clicked
 * - historyType: Type for ViewHistoryButton ('invoice', 'challan', 'payment', 'purchase')
 * - additionalActions: Array of additional action buttons to show
 * - showSaveDraft: Show save draft button
 * - onSaveDraft: Function to call when save draft is clicked
 */
const ModuleHeader = ({
  title,
  documentNumber,
  status,
  icon: Icon,
  iconColor = "text-blue-600",
  onClose,
  historyType,
  additionalActions = [],
  showSaveDraft = false,
  onSaveDraft,
  className = ""
}) => {
  const getStatusColor = (statusValue) => {
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
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left side - Title and info */}
        <div className="flex items-center gap-4">
          {Icon && <Icon className={`w-5 h-5 ${iconColor}`} />}
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          {documentNumber && (
            <div className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-medium text-blue-700">{documentNumber}</span>
            </div>
          )}
          {status && (
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
              {status.toUpperCase()}
            </div>
          )}
        </div>
        
        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {showSaveDraft && onSaveDraft && (
            <button
              onClick={onSaveDraft}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Save Draft
            </button>
          )}
          
          {additionalActions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                action.variant === 'primary' 
                  ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400' 
                  : action.variant === 'success'
                  ? 'bg-green-500 text-white hover:bg-green-600 disabled:bg-gray-400'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              } ${action.className || ''}`}
              title={action.title}
            >
              {action.icon && <action.icon className="w-4 h-4 inline-block mr-1" />}
              {action.label}
            </button>
          ))}
          
          {historyType && (
            <ViewHistoryButton 
              historyType={historyType}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center gap-2 ml-2"
              buttonText="History"
            />
          )}
          
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-gray-100 rounded-lg ml-2 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModuleHeader;