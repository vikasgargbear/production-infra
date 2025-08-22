import React from 'react';
import { ShoppingCart, TrendingUp, Package, DollarSign } from 'lucide-react';

const PurchaseReport: React.FC = () => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Purchase Report</h1>
        <p className="text-gray-600">Purchase analytics and supplier performance metrics</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <ShoppingCart className="h-8 w-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Total Purchases</p>
            <p className="text-xl font-bold">₹8,45,670</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <Package className="h-8 w-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Total Orders</p>
            <p className="text-xl font-bold">234</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <DollarSign className="h-8 w-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Avg Order Value</p>
            <p className="text-xl font-bold">₹3,614</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseReport;