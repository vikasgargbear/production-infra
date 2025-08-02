import React from 'react';
import { Truck, CreditCard, MapPin, Hash, Building } from 'lucide-react';

const InvoiceSummaryTop = ({ invoice, onInvoiceUpdate }) => {
  const handleFieldChange = (field, value) => {
    onInvoiceUpdate({ [field]: value });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">DELIVERY & PAYMENT DETAILS</h3>
      
      {/* First Row - Payment, Delivery, Charges */}
      <div className="grid grid-cols-3 gap-6 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Payment Method</label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={invoice.payment_mode || ''}
              onChange={(e) => handleFieldChange('payment_mode', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              required
            >
              <option value="">Select Payment Method</option>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
              <option value="advance">Advance</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Delivery Type</label>
          <div className="relative">
            <Truck className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={invoice.delivery_type || 'PICKUP'}
              onChange={(e) => handleFieldChange('delivery_type', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="PICKUP">Pickup</option>
              <option value="SAME_DAY">Same Day</option>
              <option value="NEXT_DAY">Next Day</option>
              <option value="EXPRESS">Express</option>
              <option value="STANDARD">Standard</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Delivery Charges</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">₹</span>
            <input
              type="number"
              value={invoice.delivery_charges || invoice.other_charges || ''}
              onChange={(e) => handleFieldChange('delivery_charges', parseFloat(e.target.value) || 0)}
              className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>
        </div>
      </div>

      {/* Second Row - Transport Company, Vehicle, LR */}
      <div className="grid grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Transport Company</label>
          <div className="relative">
            <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={invoice.transport_company || ''}
              onChange={(e) => handleFieldChange('transport_company', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Company name"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Vehicle Number</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={invoice.vehicle_number || ''}
              onChange={(e) => handleFieldChange('vehicle_number', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="MH-01-AB-1234"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">LR Number</label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={invoice.lr_number || ''}
              onChange={(e) => handleFieldChange('lr_number', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="LR123456"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceSummaryTop;