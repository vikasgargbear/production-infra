import React from 'react';
import { FileText, Package, ShoppingCart, Calendar, LucideIcon } from 'lucide-react';
import { useSales } from '../../../contexts/SalesContext';
import { DatePicker } from '../../global';

type SalesType = 'invoice' | 'challan' | 'sales-order';

interface SalesIconConfig {
  icon: LucideIcon;
  title: string;
  label: string;
}

const SalesHeader: React.FC = () => {
  const { salesType, salesData, setSalesField } = useSales();

  const salesConfig: Record<SalesType, SalesIconConfig> = {
    invoice: {
      icon: FileText,
      title: 'New Invoice',
      label: 'Invoice'
    },
    challan: {
      icon: Package,
      title: 'New Delivery Challan',
      label: 'Challan'
    },
    'sales-order': {
      icon: ShoppingCart,
      title: 'New Sales Order',
      label: 'Order'
    }
  };

  const config = salesConfig[salesType as SalesType] || salesConfig.invoice;
  const Icon = config.icon;

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-6 py-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Icon className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {config.title}
            </h1>
            <div className="flex items-center space-x-4 mt-1">
              <span className="text-lg font-medium text-blue-600">
                {config.label} #{salesData.document_no}
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
            <DatePicker
              value={salesData.document_date}
              onChange={(value) => setSalesField('document_date', value)}
              size="sm"
            />
          </div>

          {salesType === 'sales-order' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                Delivery Date
              </label>
              <DatePicker
                value={salesData.delivery_date}
                onChange={(value) => setSalesField('delivery_date', value)}
                size="sm"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesHeader;
