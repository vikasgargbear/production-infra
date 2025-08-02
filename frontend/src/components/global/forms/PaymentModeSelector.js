import React, { useState } from 'react';
import { CreditCard, Banknote, Smartphone, Building2, FileText, MoreHorizontal } from 'lucide-react';

const PaymentModeSelector = ({ 
  value, 
  onChange, 
  disabled = false,
  showAdvanced = true,
  className = ""
}) => {
  const [customMode, setCustomMode] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const paymentModes = [
    {
      id: 'cash',
      label: 'Cash',
      icon: Banknote,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'Cash payment'
    },
    {
      id: 'cheque',
      label: 'Cheque',
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      description: 'Bank cheque'
    },
    {
      id: 'upi',
      label: 'UPI',
      icon: Smartphone,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      description: 'UPI transfer'
    },
    {
      id: 'bank_transfer',
      label: 'Bank Transfer',
      icon: Building2,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
      description: 'NEFT/RTGS/IMPS'
    },
    {
      id: 'credit_adjustment',
      label: 'Credit Adjustment',
      icon: CreditCard,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      description: 'Credit note adjustment'
    }
  ];

  if (showAdvanced) {
    paymentModes.push({
      id: 'others',
      label: 'Others',
      icon: MoreHorizontal,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      description: 'Custom payment mode'
    });
  }

  const handleModeSelect = (mode) => {
    if (mode.id === 'others') {
      setShowCustomInput(true);
      return;
    }
    
    onChange({
      mode: mode.id,
      label: mode.label,
      requiresReference: ['cheque', 'upi', 'bank_transfer'].includes(mode.id)
    });
    setShowCustomInput(false);
  };

  const handleCustomModeSubmit = () => {
    if (customMode.trim()) {
      onChange({
        mode: 'custom',
        label: customMode.trim(),
        requiresReference: true
      });
      setShowCustomInput(false);
      setCustomMode('');
    }
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        Payment Mode *
      </label>
      
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {paymentModes.map((mode) => {
          const Icon = mode.icon;
          const isSelected = value?.mode === mode.id || 
                           (mode.id === 'others' && value?.mode === 'custom');
          
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleModeSelect(mode)}
              disabled={disabled}
              className={`p-4 border-2 rounded-lg transition-all duration-200 text-left group hover:shadow-md ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-gray-200 hover:border-gray-300'
              } ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isSelected ? 'bg-blue-100' : mode.bgColor
                }`}>
                  <Icon className={`w-5 h-5 ${
                    isSelected ? 'text-blue-600' : mode.color
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-medium ${
                    isSelected ? 'text-blue-900' : 'text-gray-900'
                  }`}>
                    {mode.label}
                  </h4>
                  <p className={`text-xs ${
                    isSelected ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    {mode.description}
                  </p>
                </div>
              </div>
              
              {isSelected && (
                <div className="mt-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center ml-auto">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Custom Mode Input */}
      {showCustomInput && (
        <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter Custom Payment Mode
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={customMode}
              onChange={(e) => setCustomMode(e.target.value)}
              placeholder="e.g., Gift Voucher, Credit Card, etc."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleCustomModeSubmit()}
            />
            <button
              type="button"
              onClick={handleCustomModeSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={!customMode.trim()}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCustomInput(false);
                setCustomMode('');
              }}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reference Number Hint */}
      {value?.requiresReference && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <span className="font-medium">Reference number required</span> for {value.label} payments
          </p>
        </div>
      )}
    </div>
  );
};

export default PaymentModeSelector;