/**
 * PurchaseHeader - Refactored to Props Pattern
 * 
 * Receives purchase data and handlers from parent (via usePurchaseTransaction)
 */

import React from 'react';
import { PURCHASE_CONFIG } from '../../../config/purchase.config';

interface PurchaseData {
  purchase_number?: string;
  invoice_number: string;
  invoice_date: string;
  payment_mode: string;
  [key: string]: any;
}

interface PurchaseHeaderProps {
  /** Purchase document data */
  purchase: PurchaseData;
  /** Handler for field changes */
  onFieldChange: (field: string, value: any) => void;
  /** Handler for setting errors */
  onSetError?: (field: string, error: string) => void;
  /** Handler for clearing errors */
  onClearError?: (field: string) => void;
  /** Handler for field blur */
  onFieldBlur?: (field: string) => void;
  /** Validation errors */
  errors?: Record<string, string>;
}

const PurchaseHeader: React.FC<PurchaseHeaderProps> = ({
  purchase,
  onFieldChange,
  onSetError,
  onClearError,
  onFieldBlur,
  errors = {}
}) => {

  const handleFieldChange = (field: string, value: string): void => {
    onFieldChange(field, value);

    // Basic validation
    if (field === 'invoice_number' && value.trim()) {
      onClearError?.(field);
    }
    if (field === 'invoice_date' && value) {
      onClearError?.(field);
    }
  };

  const handleFieldBlur = (field: string): void => {
    onFieldBlur?.(field);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">INVOICE DETAILS</h3>
        {purchase.purchase_number && (
          <span className="text-sm text-gray-600">
            Purchase #: <span className="font-medium">{purchase.purchase_number}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Invoice Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice Number *
          </label>
          <input
            type="text"
            value={purchase.invoice_number || ''}
            onChange={(e) => handleFieldChange('invoice_number', e.target.value)}
            onBlur={() => handleFieldBlur('invoice_number')}
            placeholder="Enter invoice number"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${errors.invoice_number ? 'border-red-500' : 'border-gray-300'
              }`}
          />
          {errors.invoice_number && (
            <p className="mt-1 text-sm text-red-600">{errors.invoice_number}</p>
          )}
        </div>

        {/* Invoice Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice Date *
          </label>
          <input
            type="date"
            value={purchase.invoice_date || ''}
            onChange={(e) => handleFieldChange('invoice_date', e.target.value)}
            onBlur={() => handleFieldBlur('invoice_date')}
            max={new Date().toISOString().split('T')[0]}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${errors.invoice_date ? 'border-red-500' : 'border-gray-300'
              }`}
          />
          {errors.invoice_date && (
            <p className="mt-1 text-sm text-red-600">{errors.invoice_date}</p>
          )}
        </div>

        {/* Payment Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Mode *
          </label>
          <select
            value={purchase.payment_mode || 'cash'}
            onChange={(e) => handleFieldChange('payment_mode', e.target.value)}
            onBlur={() => handleFieldBlur('payment_mode')}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${errors.payment_mode ? 'border-red-500' : 'border-gray-300'
              }`}
          >
            {PURCHASE_CONFIG.PAYMENT_MODES.map(mode => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
          {errors.payment_mode && (
            <p className="mt-1 text-sm text-red-600">{errors.payment_mode}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseHeader;