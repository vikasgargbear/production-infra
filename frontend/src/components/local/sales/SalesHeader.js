import React from 'react';
import { FileText, Package, ShoppingCart, Calendar } from 'lucide-react';
import { useSales } from '../../../contexts/SalesContext';

const SalesHeader = () => {
  const { salesType, salesData, setSalesField } = useSales();

  const getIcon = () => {
    switch (salesType) {
      case 'invoice':
        return FileText;
      case 'challan':
        return Package;
      case 'sales-order':
        return ShoppingCart;
      default:
        return FileText;
    }
  };

  const getTitle = () => {
    switch (salesType) {
      case 'invoice':
        return 'New Invoice';
      case 'challan':
        return 'New Delivery Challan';
      case 'sales-order':
        return 'New Sales Order';
      default:
        return 'New Document';
    }
  };

  const getDocumentLabel = () => {
    switch (salesType) {
      case 'invoice':
        return 'Invoice';
      case 'challan':
        return 'Challan';
      case 'sales-order':
        return 'Order';
      default:
        return 'Document';
    }
  };

  const Icon = getIcon();

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-6 py-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Icon className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {getTitle()}
            </h1>
            <div className="flex items-center space-x-4 mt-1">
              <span className="text-lg font-medium text-blue-600">
                {getDocumentLabel()} #{salesData.document_no}
              </span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-600">
                {new Date(salesData.document_date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />
              Date
            </label>
            <input
              type="date"
              value={salesData.document_date}
              onChange={(e) => setSalesField('document_date', e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {salesType === 'sales-order' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                Delivery Date
              </label>
              <input
                type="date"
                value={salesData.delivery_date}
                onChange={(e) => setSalesField('delivery_date', e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesHeader;