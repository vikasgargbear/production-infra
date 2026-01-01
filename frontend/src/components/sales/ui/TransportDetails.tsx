import React from 'react';
import { Truck, FileText, Calendar, Hash } from 'lucide-react';
import { useSales } from '../../../contexts/SalesContext';

interface TransportDetailsData {
  transporter_name: string;
  vehicle_no: string;
  lr_no: string;
  dispatch_date: string;
}

const TransportDetails: React.FC = () => {
  const { salesType, salesData, setTransportField } = useSales();

  // Only show for challan
  if (salesType !== 'challan') {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <div className="flex items-center space-x-2 mb-3">
        <Truck className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-medium text-gray-900">Transport Details</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            <Truck className="w-3 h-3 inline mr-1" />
            Transporter Name
          </label>
          <input
            type="text"
            value={salesData.transport_details.transporter_name}
            onChange={(e) => setTransportField('transporter_name', e.target.value)}
            placeholder="Enter transporter name"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            <Hash className="w-3 h-3 inline mr-1" />
            Vehicle No
          </label>
          <input
            type="text"
            value={salesData.transport_details.vehicle_no}
            onChange={(e) => setTransportField('vehicle_no', e.target.value)}
            placeholder="e.g., MH12AB1234"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            <FileText className="w-3 h-3 inline mr-1" />
            LR No
          </label>
          <input
            type="text"
            value={salesData.transport_details.lr_no}
            onChange={(e) => setTransportField('lr_no', e.target.value)}
            placeholder="LR number"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            <Calendar className="w-3 h-3 inline mr-1" />
            Dispatch Date
          </label>
          <input
            type="date"
            value={salesData.transport_details.dispatch_date}
            onChange={(e) => setTransportField('dispatch_date', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
};

export default TransportDetails;