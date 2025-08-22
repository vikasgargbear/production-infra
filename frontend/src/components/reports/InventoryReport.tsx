import React from 'react';
import { Package, AlertTriangle, TrendingDown, BarChart3 } from 'lucide-react';

const InventoryReport: React.FC = () => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Inventory Report</h1>
        <p className="text-gray-600">Stock levels, movement analysis, and expiry tracking</p>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <Package className="h-8 w-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Total SKUs</p>
            <p className="text-xl font-bold">1,234</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <BarChart3 className="h-8 w-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Stock Value</p>
            <p className="text-xl font-bold">₹45,67,890</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <AlertTriangle className="h-8 w-8 text-yellow-600 mb-2" />
            <p className="text-sm text-gray-600">Low Stock Items</p>
            <p className="text-xl font-bold">47</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <TrendingDown className="h-8 w-8 text-red-600 mb-2" />
            <p className="text-sm text-gray-600">Expiring Soon</p>
            <p className="text-xl font-bold">12</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryReport;