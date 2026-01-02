import React from 'react';
import { Truck, CreditCard, MapPin, Hash, Building } from 'lucide-react';

interface Invoice {
  payment_mode?: string;
  delivery_type?: string;
  delivery_charges?: number;
  other_charges?: number;
  transport_company?: string;
  vehicle_number?: string;
}

interface InvoiceSummaryTopProps {
  invoice: Invoice;
  onInvoiceUpdate: (updates: Partial<Invoice>) => void;
}

const InvoiceSummaryTop: React.FC<InvoiceSummaryTopProps> = ({ invoice, onInvoiceUpdate }) => {
  const handleFieldChange = (field: keyof Invoice, value: string | number) => {
    onInvoiceUpdate({ [field]: value });
  };

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 px-1">DELIVERY & PAYMENT DETAILS</h3>
      <div className="bg-white rounded-lg border border-gray-200 p-3">
      
        {/* First Row - Payment, Delivery, Charges */}
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={invoice.payment_mode || ''}
                onChange={(e) => handleFieldChange('payment_mode', e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Type</label>
          <div className="relative">
            <Truck className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={invoice.delivery_type || 'PICKUP'}
                onChange={(e) => handleFieldChange('delivery_type', e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Charges</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">₹</span>
              <input
                type="number"
                value={invoice.delivery_charges || invoice.other_charges || ''}
                onChange={(e) => handleFieldChange('delivery_charges', parseFloat(e.target.value) || 0)}
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>
        </div>
      </div>

        {/* Second Row - Transport Company, Vehicle, LR */}
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Transport Company</label>
          <div className="relative">
            <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={invoice.transport_company || ''}
                onChange={(e) => handleFieldChange('transport_company', e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Company name"
            />
          </div>
        </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle Number</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={invoice.vehicle_number || ''}
                onChange={(e) => handleFieldChange('vehicle_number', e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="MH-01-AB-1234"
            />
          </div>
        </div>

          <div></div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceSummaryTop;