import React from 'react';
import { Truck, Calendar, MapPin, Hash, Phone, User, FileText, Package } from 'lucide-react';

const ChallanSummaryTop = ({ challan, onChallanUpdate }) => {
  const handleFieldChange = (field, value) => {
    onChallanUpdate({ [field]: value });
  };

  const handleTransportFieldChange = (field, value) => {
    onChallanUpdate({
      transport_details: {
        ...challan.transport_details,
        [field]: value
      }
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">TRANSPORT & DELIVERY DETAILS</h3>
      
      {/* First Row - Transport Company, Vehicle, Driver */}
      <div className="grid grid-cols-3 gap-6 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Transport Company</label>
          <div className="relative">
            <Truck className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={challan.transport_details?.transporter_name || ''}
              onChange={(e) => handleTransportFieldChange('transporter_name', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Transport company name"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Vehicle Number</label>
          <div className="relative">
            <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={challan.transport_details?.vehicle_no || ''}
              onChange={(e) => handleTransportFieldChange('vehicle_no', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="MH-01-AB-1234"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Driver Details</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={challan.transport_details?.driver_name || ''}
              onChange={(e) => handleTransportFieldChange('driver_name', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Driver name"
            />
          </div>
        </div>
      </div>

      {/* Second Row - LR Details, Driver Phone, E-way Bill */}
      <div className="grid grid-cols-3 gap-6 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">LR Number</label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={challan.transport_details?.lr_no || ''}
              onChange={(e) => handleTransportFieldChange('lr_no', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="LR/Docket number"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Driver Phone</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="tel"
              value={challan.transport_details?.driver_phone || ''}
              onChange={(e) => handleTransportFieldChange('driver_phone', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="9876543210"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">E-way Bill No</label>
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={challan.transport_details?.eway_bill_no || ''}
              onChange={(e) => handleTransportFieldChange('eway_bill_no', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="E-way bill number"
            />
          </div>
        </div>
      </div>

      {/* Third Row - Charges */}
      <div className="grid grid-cols-4 gap-6 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Freight Charges</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">₹</span>
            <input
              type="number"
              value={challan.transport_details?.freight_charges || ''}
              onChange={(e) => handleTransportFieldChange('freight_charges', parseFloat(e.target.value) || 0)}
              className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Loading Charges</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">₹</span>
            <input
              type="number"
              value={challan.transport_details?.loading_charges || ''}
              onChange={(e) => handleTransportFieldChange('loading_charges', parseFloat(e.target.value) || 0)}
              className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Other Charges</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">₹</span>
            <input
              type="number"
              value={challan.transport_details?.other_charges || ''}
              onChange={(e) => handleTransportFieldChange('other_charges', parseFloat(e.target.value) || 0)}
              className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Weight (Kg)</label>
          <input
            type="text"
            value={challan.transport_details?.weight || ''}
            onChange={(e) => handleTransportFieldChange('weight', e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
      </div>

      {/* Delivery Details */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">Delivery Address</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <textarea
            value={challan.delivery_address || ''}
            onChange={(e) => handleFieldChange('delivery_address', e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            placeholder="Complete delivery address..."
            rows={2}
          />
        </div>
      </div>
    </div>
  );
};

export default ChallanSummaryTop;