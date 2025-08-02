import React from 'react';
import { FileText, Package, ShoppingCart } from 'lucide-react';
import { useSales } from '../../../contexts/SalesContext';

const SalesTypeSelector = () => {
  const { salesType, setSalesType } = useSales();

  const salesTypes = [
    {
      id: 'invoice',
      label: 'Invoice',
      icon: FileText,
      color: 'blue',
      description: 'Tax invoice for sales'
    },
    {
      id: 'challan',
      label: 'Challan',
      icon: Package,
      color: 'gray',
      description: 'Delivery challan'
    },
    {
      id: 'sales-order',
      label: 'Sales Order',
      icon: ShoppingCart,
      color: 'gray',
      description: 'Order confirmation'
    }
  ];

  return (
    <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
      {salesTypes.map((type) => {
        const Icon = type.icon;
        const isActive = salesType === type.id;
        
        return (
          <button
            key={type.id}
            onClick={() => setSalesType(type.id)}
            className={`
              flex items-center space-x-2 px-4 py-2 rounded-md transition-all duration-200
              ${isActive 
                ? `bg-${type.color}-500 text-white shadow-sm` 
                : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }
            `}
            style={isActive ? {
              backgroundColor: type.id === 'invoice' ? '#3B82F6' : 
                             type.id === 'challan' ? '#6B7280' : 
                             '#6B7280'
            } : {}}
          >
            <Icon className="w-4 h-4" />
            <span className="font-medium">{type.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SalesTypeSelector;