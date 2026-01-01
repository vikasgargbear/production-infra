import React from 'react';
import { Truck, Package, Calendar, FileText, User, ShoppingCart } from 'lucide-react';

interface OrderStatus {
  value: string;
  label: string;
  color: string;
}

interface SalesOrder {
  order_status?: string;
  delivery_date?: string;
  reference_no?: string;
  sales_person?: string;
  delivery_type?: string;
  priority?: string;
  terms_conditions?: string;
}

interface SalesOrderSummaryTopProps {
  salesOrder: SalesOrder;
  onOrderUpdate: (updates: Partial<SalesOrder>) => void;
}

const SalesOrderSummaryTop: React.FC<SalesOrderSummaryTopProps> = ({ salesOrder, onOrderUpdate }) => {
  const handleFieldChange = (field: keyof SalesOrder, value: string) => {
    onOrderUpdate({ [field]: value });
  };

  const orderStatuses: OrderStatus[] = [
    { value: 'Pending', label: 'Pending', color: 'yellow' },
    { value: 'Confirmed', label: 'Confirmed', color: 'blue' },
    { value: 'Processing', label: 'Processing', color: 'indigo' },
    { value: 'Ready', label: 'Ready to Ship', color: 'purple' },
    { value: 'Delivered', label: 'Delivered', color: 'green' },
    { value: 'Cancelled', label: 'Cancelled', color: 'red' }
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">ORDER & DELIVERY DETAILS</h3>
      
      {/* First Row - Status, Delivery Date, Reference */}
      <div className="grid grid-cols-3 gap-6 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Order Status</label>
          <div className="relative">
            <ShoppingCart className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={salesOrder.order_status || 'Pending'}
              onChange={(e) => handleFieldChange('order_status', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {orderStatuses.map(status => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Expected Delivery Date *</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={salesOrder.delivery_date || ''}
              onChange={(e) => handleFieldChange('delivery_date', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Customer PO Reference</label>
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={salesOrder.reference_no || ''}
              onChange={(e) => handleFieldChange('reference_no', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="PO-12345"
            />
          </div>
        </div>
      </div>

      {/* Second Row - Sales Person, Delivery Type, Priority */}
      <div className="grid grid-cols-3 gap-6 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Sales Person</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={salesOrder.sales_person || ''}
              onChange={(e) => handleFieldChange('sales_person', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Sales representative"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Delivery Type</label>
          <div className="relative">
            <Truck className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={salesOrder.delivery_type || 'STANDARD'}
              onChange={(e) => handleFieldChange('delivery_type', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="PICKUP">Customer Pickup</option>
              <option value="STANDARD">Standard Delivery</option>
              <option value="EXPRESS">Express Delivery</option>
              <option value="SAME_DAY">Same Day Delivery</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Order Priority</label>
          <div className="relative">
            <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={salesOrder.priority || 'NORMAL'}
              onChange={(e) => handleFieldChange('priority', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="LOW">Low Priority</option>
              <option value="NORMAL">Normal Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">Terms & Conditions</label>
        <textarea
          value={salesOrder.terms_conditions || ''}
          onChange={(e) => handleFieldChange('terms_conditions', e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          placeholder="Add any terms and conditions for this order..."
          rows={3}
        />
      </div>
    </div>
  );
};

export default SalesOrderSummaryTop;