import React from 'react';
import { User, ChevronDown, X } from 'lucide-react';
import { CustomerSearch, Badge } from '../global';

/**
 * CompactCustomerSelector Component
 * Space-efficient customer selection with inline display
 */
const CompactCustomerSelector = ({ 
  selectedCustomer, 
  onCustomerSelect,
  onClear,
  placeholder = "Select a customer",
  className = '',
  error 
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelect = (customer) => {
    onCustomerSelect(customer);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onClear) onClear();
  };

  if (selectedCustomer) {
    return (
      <div className={`bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 ${className}`.trim()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <p className="font-medium text-gray-900">{selectedCustomer.customer_name}</p>
                <span className="text-sm text-gray-500">#{selectedCustomer.customer_code}</span>
                {selectedCustomer.gst_number && (
                  <Badge variant="secondary" size="sm">GST: {selectedCustomer.gst_number}</Badge>
                )}
              </div>
              {selectedCustomer.address && (
                <p className="text-sm text-gray-600 mt-0.5">
                  {selectedCustomer.address}, {selectedCustomer.city}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClear}
            className="p-1 hover:bg-blue-100 rounded transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        {selectedCustomer.outstanding_amount > 0 && (
          <div className="mt-2 pt-2 border-t border-blue-100 flex items-center justify-between text-sm">
            <span className="text-gray-600">Outstanding Amount:</span>
            <Badge variant="warning" size="sm">
              ₹{selectedCustomer.outstanding_amount.toFixed(2)}
            </Badge>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`.trim()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 border rounded-lg flex items-center justify-between transition-colors ${
          error ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
      >
        <div className="flex items-center space-x-3">
          <User className="w-5 h-5 text-gray-400" />
          <span className="text-gray-500">{placeholder}</span>
        </div>
        <ChevronDown className="w-5 h-5 text-gray-400" />
      </button>
      
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}

      {isOpen && (
        <div className="absolute z-10 mt-2 w-full">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
            <CustomerSearch
              value={null}
              onChange={handleSelect}
              displayMode="inline"
              showCreateButton={true}
              placeholder="Search by name, code, or phone..."
              autoFocus={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CompactCustomerSelector;