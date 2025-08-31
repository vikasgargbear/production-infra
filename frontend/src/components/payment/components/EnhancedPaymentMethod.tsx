import React, { useState } from 'react';
import { 
  Wallet, CreditCard, Smartphone, Building2, Banknote, 
  Plus, X, CheckCircle, AlertCircle, Calculator, Split,
  QrCode, IndianRupee, ChevronDown, ArrowRight
} from 'lucide-react';

interface PaymentMethod {
  id: string;
  type: 'cash' | 'upi' | 'card' | 'bank' | 'cheque';
  amount: number;
  reference?: string;
  bankName?: string;
  transactionId?: string;
  chequeNumber?: string;
  chequeDate?: string;
}

interface EnhancedPaymentMethodProps {
  totalAmount: number;
  onPaymentMethodsChange: (methods: PaymentMethod[]) => void;
  defaultMethod?: string;
}

const EnhancedPaymentMethod: React.FC<EnhancedPaymentMethodProps> = ({
  totalAmount,
  onPaymentMethodsChange,
  defaultMethod = 'cash'
}) => {
  const [selectedMode, setSelectedMode] = useState<'single' | 'split'>('single');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { id: '1', type: defaultMethod as any, amount: totalAmount }
  ]);
  const [showSplitDetails, setShowSplitDetails] = useState(false);

  // Payment method configurations with better colors and icons
  const methodConfigs = {
    cash: {
      label: 'Cash',
      icon: Banknote,
      color: 'emerald',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      textColor: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      hoverBg: 'hover:bg-emerald-100',
      selectedBg: 'bg-emerald-100 border-emerald-400',
      requiresRef: false,
      placeholder: 'Cash payment received'
    },
    upi: {
      label: 'UPI',
      icon: QrCode,
      color: 'purple',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-700',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      hoverBg: 'hover:bg-purple-100',
      selectedBg: 'bg-purple-100 border-purple-400',
      requiresRef: true,
      placeholder: 'Enter UPI transaction ID',
      refLabel: 'UPI Reference'
    },
    card: {
      label: 'Card',
      icon: CreditCard,
      color: 'blue',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      hoverBg: 'hover:bg-blue-100',
      selectedBg: 'bg-blue-100 border-blue-400',
      requiresRef: true,
      placeholder: 'Last 4 digits of card',
      refLabel: 'Card Reference'
    },
    bank: {
      label: 'Bank Transfer',
      icon: Building2,
      color: 'indigo',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-700',
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      hoverBg: 'hover:bg-indigo-100',
      selectedBg: 'bg-indigo-100 border-indigo-400',
      requiresRef: true,
      placeholder: 'Enter transaction reference',
      refLabel: 'Transaction ID',
      requiresBank: true
    },
    cheque: {
      label: 'Cheque',
      icon: Wallet,
      color: 'amber',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      textColor: 'text-amber-700',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      hoverBg: 'hover:bg-amber-100',
      selectedBg: 'bg-amber-100 border-amber-400',
      requiresRef: true,
      placeholder: 'Enter cheque number',
      refLabel: 'Cheque Number',
      requiresBank: true,
      requiresDate: true
    }
  };

  const totalAllocated = paymentMethods.reduce((sum, method) => sum + (method.amount || 0), 0);
  const remaining = totalAmount - totalAllocated;
  const isFullyAllocated = Math.abs(remaining) < 0.01;

  const handleSingleMethodSelect = (type: string) => {
    const newMethod: PaymentMethod = {
      id: '1',
      type: type as any,
      amount: totalAmount
    };
    setPaymentMethods([newMethod]);
    onPaymentMethodsChange([newMethod]);
  };

  const handleSplitMethodUpdate = (index: number, field: string, value: any) => {
    const updated = [...paymentMethods];
    updated[index] = { ...updated[index], [field]: value };
    setPaymentMethods(updated);
    onPaymentMethodsChange(updated);
  };

  const addSplitMethod = () => {
    const newMethod: PaymentMethod = {
      id: Date.now().toString(),
      type: 'cash',
      amount: remaining > 0 ? remaining : 0
    };
    setPaymentMethods([...paymentMethods, newMethod]);
  };

  const removeSplitMethod = (index: number) => {
    const updated = paymentMethods.filter((_, i) => i !== index);
    setPaymentMethods(updated);
    onPaymentMethodsChange(updated);
  };

  const autoDistribute = () => {
    const methodCount = paymentMethods.length;
    if (methodCount === 0) return;
    
    const amountPerMethod = Math.floor(totalAmount / methodCount);
    const remainder = totalAmount - (amountPerMethod * methodCount);
    
    const updated = paymentMethods.map((method, index) => ({
      ...method,
      amount: index === 0 ? amountPerMethod + remainder : amountPerMethod
    }));
    
    setPaymentMethods(updated);
    onPaymentMethodsChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Mode Selection */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
          <Wallet className="w-5 h-5 mr-2 text-indigo-600" />
          Payment Method
        </h3>
        
        {/* Mode Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => {
              setSelectedMode('single');
              setShowSplitDetails(false);
              setPaymentMethods([{ id: '1', type: defaultMethod as any, amount: totalAmount }]);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              selectedMode === 'single'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Single Payment
          </button>
          <button
            onClick={() => {
              setSelectedMode('split');
              setShowSplitDetails(true);
              setPaymentMethods([
                { id: '1', type: 'cash', amount: Math.floor(totalAmount / 2) },
                { id: '2', type: 'upi', amount: Math.ceil(totalAmount / 2) }
              ]);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center ${
              selectedMode === 'split'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Split className="w-4 h-4 mr-1" />
            Split Payment
          </button>
        </div>
      </div>

      {/* Total Amount Display */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-4 border border-indigo-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Total Amount</span>
          <span className="text-2xl font-bold text-indigo-600 flex items-center">
            <IndianRupee className="w-5 h-5" />
            {totalAmount.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Single Payment Mode */}
      {selectedMode === 'single' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 mb-3">Select payment method:</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(methodConfigs).map(([type, config]) => {
              const Icon = config.icon;
              const isSelected = paymentMethods[0]?.type === type;
              
              return (
                <button
                  key={type}
                  onClick={() => handleSingleMethodSelect(type)}
                  className={`relative p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? config.selectedBg
                      : `${config.bgColor} ${config.borderColor} ${config.hoverBg}`
                  }`}
                >
                  {isSelected && (
                    <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-green-600" />
                  )}
                  <div className={`${config.iconBg} w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2`}>
                    <Icon className={`w-6 h-6 ${config.iconColor}`} />
                  </div>
                  <p className={`font-medium ${config.textColor}`}>{config.label}</p>
                  {defaultMethod === type && (
                    <span className="text-xs text-gray-500 mt-1 block">(Default)</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Reference Input for Selected Method */}
          {paymentMethods[0] && methodConfigs[paymentMethods[0].type].requiresRef && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {methodConfigs[paymentMethods[0].type].refLabel}
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={paymentMethods[0].reference || ''}
                  onChange={(e) => handleSplitMethodUpdate(0, 'reference', e.target.value)}
                  placeholder={methodConfigs[paymentMethods[0].type].placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              {methodConfigs[paymentMethods[0].type].requiresBank && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={paymentMethods[0].bankName || ''}
                    onChange={(e) => handleSplitMethodUpdate(0, 'bankName', e.target.value)}
                    placeholder="Enter bank name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              )}

              {methodConfigs[paymentMethods[0].type].requiresDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cheque Date
                  </label>
                  <input
                    type="date"
                    value={paymentMethods[0].chequeDate || ''}
                    onChange={(e) => handleSplitMethodUpdate(0, 'chequeDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Split Payment Mode */}
      {selectedMode === 'split' && showSplitDetails && (
        <div className="space-y-4">
          {/* Allocation Status */}
          <div className={`p-3 rounded-lg border ${
            isFullyAllocated
              ? 'bg-green-50 border-green-200'
              : remaining > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {isFullyAllocated ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                    <span className="text-green-700 font-medium">Fully Allocated</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className={`w-5 h-5 mr-2 ${
                      remaining > 0 ? 'text-amber-600' : 'text-red-600'
                    }`} />
                    <span className={`font-medium ${
                      remaining > 0 ? 'text-amber-700' : 'text-red-700'
                    }`}>
                      {remaining > 0
                        ? `₹${remaining.toFixed(2)} remaining`
                        : `₹${Math.abs(remaining).toFixed(2)} over-allocated`
                      }
                    </span>
                  </>
                )}
              </div>
              <button
                onClick={autoDistribute}
                className="text-sm px-3 py-1 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
              >
                <Calculator className="w-3 h-3 mr-1" />
                Auto Distribute
              </button>
            </div>
          </div>

          {/* Split Methods */}
          <div className="space-y-3">
            {paymentMethods.map((method, index) => {
              const config = methodConfigs[method.type];
              const Icon = config.icon;
              
              return (
                <div
                  key={method.id}
                  className={`p-4 rounded-lg border-2 ${config.bgColor} ${config.borderColor}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className={`${config.iconBg} w-10 h-10 rounded-full flex items-center justify-center mr-3`}>
                        <Icon className={`w-5 h-5 ${config.iconColor}`} />
                      </div>
                      <select
                        value={method.type}
                        onChange={(e) => handleSplitMethodUpdate(index, 'type', e.target.value)}
                        className={`font-medium ${config.textColor} bg-transparent border-0 focus:ring-0 cursor-pointer`}
                      >
                        {Object.entries(methodConfigs).map(([type, cfg]) => (
                          <option key={type} value={type}>{cfg.label}</option>
                        ))}
                      </select>
                    </div>
                    {paymentMethods.length > 1 && (
                      <button
                        onClick={() => removeSplitMethod(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Amount
                      </label>
                      <div className="relative">
                        <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="number"
                          value={method.amount || ''}
                          onChange={(e) => handleSplitMethodUpdate(index, 'amount', parseFloat(e.target.value) || 0)}
                          className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          step="0.01"
                        />
                      </div>
                    </div>

                    {config.requiresRef && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {config.refLabel}
                        </label>
                        <input
                          type="text"
                          value={method.reference || ''}
                          onChange={(e) => handleSplitMethodUpdate(index, 'reference', e.target.value)}
                          placeholder={config.placeholder}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {config.requiresBank && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={method.bankName || ''}
                        onChange={(e) => handleSplitMethodUpdate(index, 'bankName', e.target.value)}
                        placeholder="Enter bank name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Another Method */}
          {paymentMethods.length < 4 && (
            <button
              onClick={addSplitMethod}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors flex items-center justify-center text-gray-600 hover:text-indigo-600"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Another Payment Method
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      {selectedMode === 'split' && paymentMethods.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Payment Summary</h4>
          {paymentMethods.map((method, index) => {
            const config = methodConfigs[method.type];
            return (
              <div key={method.id} className="flex items-center justify-between text-sm">
                <span className={`${config.textColor} font-medium`}>
                  {config.label}
                  {method.reference && <span className="text-gray-500 ml-2">({method.reference})</span>}
                </span>
                <span className="font-semibold">₹{(method.amount || 0).toFixed(2)}</span>
              </div>
            );
          })}
          <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
            <span className="font-semibold text-gray-700">Total</span>
            <span className={`font-bold text-lg ${
              isFullyAllocated ? 'text-green-600' : 'text-red-600'
            }`}>
              ₹{totalAllocated.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedPaymentMethod;