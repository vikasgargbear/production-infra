import React, { useState, useEffect } from 'react';
import { Calculator, X, IndianRupee, Percent, Info, Copy, Check } from 'lucide-react';
import InvoiceCalculator from '../../../services/invoiceCalculator';
import { INVOICE_CONFIG } from '../../../config/invoice.config';
import { APP_CONFIG, formatCurrency } from '../../../config/app.config';
import { cx } from '../../invoice/styles/invoiceStyles';

/**
 * Global GST Calculator Component
 * 
 * Props:
 * - isOpen: Boolean to show/hide the modal (for modal mode)
 * - onClose: Function called when modal is closed
 * - mode: 'modal' | 'inline' | 'widget' (default: 'modal')
 * - defaultGST: Default GST percentage (default: 12)
 * - onCalculate: Callback with calculation results
 * - showCGSTSGST: Show CGST/SGST breakdown (default: true)
 * - showCopyButtons: Show copy buttons for results (default: true)
 * - className: Additional CSS classes
 * - companyGSTIN: Company GSTIN for interstate calculation
 * - customerGSTIN: Customer GSTIN for interstate calculation
 */

const GSTCalculator = ({
  isOpen = true,
  onClose,
  mode = 'modal',
  defaultGST = INVOICE_CONFIG.GST.DEFAULT_RATE,
  onCalculate,
  showCGSTSGST = true,
  showCopyButtons = true,
  className = '',
  companyGSTIN,
  customerGSTIN
}) => {
  const [amount, setAmount] = useState('');
  const [gstPercent, setGstPercent] = useState(defaultGST.toString());
  const [calculationType, setCalculationType] = useState('exclusive'); // 'exclusive' or 'inclusive'
  const [calculatedResult, setCalculatedResult] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  // Determine GST type based on GSTINs
  const gstType = companyGSTIN && customerGSTIN 
    ? InvoiceCalculator.determineGSTType(companyGSTIN, customerGSTIN)
    : INVOICE_CONFIG.GST.TYPES.INTRA_STATE;

  const isInterstate = gstType === INVOICE_CONFIG.GST.TYPES.INTER_STATE;

  // Calculate GST
  const calculate = () => {
    const amountValue = parseFloat(amount);
    const gstValue = parseFloat(gstPercent);
    
    if (!amountValue || isNaN(amountValue) || !gstValue || isNaN(gstValue)) {
      setCalculatedResult(null);
      return;
    }

    let result;
    
    if (calculationType === 'exclusive') {
      // Amount is pre-GST, calculate GST on top
      const gstAmount = (amountValue * gstValue) / 100;
      const totalAmount = amountValue + gstAmount;
      
      result = {
        baseAmount: amountValue,
        gstAmount: gstAmount,
        totalAmount: totalAmount,
        gstPercent: gstValue,
        cgstAmount: isInterstate ? 0 : gstAmount / 2,
        sgstAmount: isInterstate ? 0 : gstAmount / 2,
        igstAmount: isInterstate ? gstAmount : 0
      };
    } else {
      // Amount includes GST, extract GST
      const baseAmount = amountValue / (1 + gstValue / 100);
      const gstAmount = amountValue - baseAmount;
      
      result = {
        baseAmount: baseAmount,
        gstAmount: gstAmount,
        totalAmount: amountValue,
        gstPercent: gstValue,
        cgstAmount: isInterstate ? 0 : gstAmount / 2,
        sgstAmount: isInterstate ? 0 : gstAmount / 2,
        igstAmount: isInterstate ? gstAmount : 0
      };
    }

    setCalculatedResult(result);
    
    if (onCalculate) {
      onCalculate(result);
    }
  };

  // Auto-calculate on input change
  useEffect(() => {
    calculate();
  }, [amount, gstPercent, calculationType]);

  // Copy to clipboard
  const copyToClipboard = (value, field) => {
    navigator.clipboard.writeText(value.toString());
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Reset calculator
  const reset = () => {
    setAmount('');
    setGstPercent(defaultGST.toString());
    setCalculationType('exclusive');
    setCalculatedResult(null);
  };

  // Render calculator content
  const renderContent = () => (
    <div className={cx('space-y-4', mode === 'widget' ? 'p-4' : '')}>
      {/* Calculation Type Toggle */}
      <div className="flex rounded-lg overflow-hidden border border-gray-200">
        <button
          onClick={() => setCalculationType('exclusive')}
          className={cx(
            'flex-1 px-4 py-2 text-sm font-medium transition-colors',
            calculationType === 'exclusive'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          )}
        >
          Add GST
        </button>
        <button
          onClick={() => setCalculationType('inclusive')}
          className={cx(
            'flex-1 px-4 py-2 text-sm font-medium transition-colors',
            calculationType === 'inclusive'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          )}
        >
          Extract GST
        </button>
      </div>

      {/* GST Type Indicator */}
      {(companyGSTIN || customerGSTIN) && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
          <Info className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-blue-700">
            {isInterstate ? 'Interstate Transaction (IGST)' : 'Intrastate Transaction (CGST/SGST)'}
          </span>
        </div>
      )}

      {/* Input Fields */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {calculationType === 'exclusive' ? 'Pre-GST Amount' : 'Amount (Including GST)'} (₹)
        </label>
        <div className="relative">
          <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            step="0.01"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          GST Percentage (%)
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Percent className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={gstPercent}
              onChange={(e) => setGstPercent(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
            >
              {INVOICE_CONFIG.GST.RATES.map(rate => (
                <option key={rate} value={rate}>{rate}%</option>
              ))}
            </select>
          </div>
          <input
            type="number"
            value={gstPercent}
            onChange={(e) => setGstPercent(e.target.value)}
            placeholder="Custom"
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            step="0.01"
            min="0"
            max="100"
          />
        </div>
      </div>

      {/* Results */}
      {calculatedResult && (
        <div className="mt-6 space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Calculation Results</h3>
            
            {/* Base Amount */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Base Amount:</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">
                  {formatCurrency(calculatedResult.baseAmount)}
                </span>
                {showCopyButtons && (
                  <button
                    onClick={() => copyToClipboard(calculatedResult.baseAmount.toFixed(2), 'base')}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {copiedField === 'base' ? (
                      <Check className="w-3 h-3 text-green-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* GST Breakdown */}
            {showCGSTSGST && !isInterstate && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">CGST ({calculatedResult.gstPercent / 2}%):</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(calculatedResult.cgstAmount)}
                    </span>
                    {showCopyButtons && (
                      <button
                        onClick={() => copyToClipboard(calculatedResult.cgstAmount.toFixed(2), 'cgst')}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {copiedField === 'cgst' ? (
                          <Check className="w-3 h-3 text-green-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">SGST ({calculatedResult.gstPercent / 2}%):</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(calculatedResult.sgstAmount)}
                    </span>
                    {showCopyButtons && (
                      <button
                        onClick={() => copyToClipboard(calculatedResult.sgstAmount.toFixed(2), 'sgst')}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {copiedField === 'sgst' ? (
                          <Check className="w-3 h-3 text-green-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* IGST for interstate */}
            {isInterstate && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">IGST ({calculatedResult.gstPercent}%):</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(calculatedResult.igstAmount)}
                  </span>
                  {showCopyButtons && (
                    <button
                      onClick={() => copyToClipboard(calculatedResult.igstAmount.toFixed(2), 'igst')}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      {copiedField === 'igst' ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-gray-400" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Total GST */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total GST ({calculatedResult.gstPercent}%):</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">
                  {formatCurrency(calculatedResult.gstAmount)}
                </span>
                {showCopyButtons && (
                  <button
                    onClick={() => copyToClipboard(calculatedResult.gstAmount.toFixed(2), 'gst')}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {copiedField === 'gst' ? (
                      <Check className="w-3 h-3 text-green-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Total Amount */}
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm text-gray-700 font-medium">Total Amount:</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-lg">
                  {formatCurrency(calculatedResult.totalAmount)}
                </span>
                {showCopyButtons && (
                  <button
                    onClick={() => copyToClipboard(calculatedResult.totalAmount.toFixed(2), 'total')}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {copiedField === 'total' ? (
                      <Check className="w-3 h-3 text-green-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Summary */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              {calculationType === 'exclusive' 
                ? `₹${amount} + ${gstPercent}% GST = ${formatCurrency(calculatedResult.totalAmount)}`
                : `₹${amount} includes ${gstPercent}% GST of ${formatCurrency(calculatedResult.gstAmount)}`
              }
            </p>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex justify-between items-center pt-2">
        <button
          onClick={reset}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium"
        >
          Clear
        </button>
        <p className="text-xs text-gray-500">
          {calculationType === 'exclusive' 
            ? 'Enter amount to add GST'
            : 'Enter amount to extract GST'
          }
        </p>
      </div>
    </div>
  );

  // Render based on mode
  if (mode === 'inline') {
    return (
      <div className={cx('bg-white rounded-lg shadow-sm', className)}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">GST Calculator</h3>
          </div>
        </div>
        <div className="p-4">
          {renderContent()}
        </div>
      </div>
    );
  }

  if (mode === 'widget') {
    return (
      <div className={cx('bg-white rounded-lg shadow-sm border border-gray-200', className)}>
        {renderContent()}
      </div>
    );
  }

  // Default modal mode
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">GST Calculator</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default GSTCalculator;