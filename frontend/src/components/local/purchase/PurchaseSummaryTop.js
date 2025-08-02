import React from 'react';
import { FileText, Calendar, CreditCard, Package, Building, Hash } from 'lucide-react';
import { PURCHASE_CONFIG } from '../../../config/purchase.config';

const PurchaseSummaryTop = ({ purchase }) => {
  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
      default:
        return 'bg-red-100 text-red-800';
    }
  };

  const paymentMode = PURCHASE_CONFIG.PAYMENT_MODES.find(m => m.value === purchase.payment_mode)?.label || 'Cash';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Invoice Number */}
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Invoice No</p>
            <p className="font-semibold text-gray-900">{purchase.invoice_number || '-'}</p>
          </div>
        </div>

        {/* Supplier */}
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Building className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Supplier</p>
            <p className="font-semibold text-gray-900 truncate" title={purchase.supplier_name}>
              {purchase.supplier_name || '-'}
            </p>
          </div>
        </div>

        {/* Date */}
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Date</p>
            <p className="font-semibold text-gray-900">{formatDate(purchase.invoice_date)}</p>
          </div>
        </div>

        {/* Items */}
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Package className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Items</p>
            <p className="font-semibold text-gray-900">{purchase.items?.length || 0}</p>
          </div>
        </div>

        {/* Payment */}
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <CreditCard className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Payment</p>
            <p className="font-semibold text-gray-900">{paymentMode}</p>
          </div>
        </div>

        {/* Amount */}
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Hash className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Amount</p>
            <p className="font-semibold text-gray-900">₹{(purchase.final_amount || 0).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Payment Status Badge */}
      {purchase.payment_status && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(purchase.payment_status)}`}>
            {purchase.payment_status.charAt(0).toUpperCase() + purchase.payment_status.slice(1)}
          </span>
        </div>
      )}
    </div>
  );
};

export default PurchaseSummaryTop;