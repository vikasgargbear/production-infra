import React from 'react';
import { Package, TrendingUp, Star, BarChart3 } from 'lucide-react';

const ProductAnalytics: React.FC = () => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Analytics</h1>
        <p className="text-gray-600">Product performance, trends, and profitability analysis</p>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <Package className="h-8 w-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Total Products</p>
            <p className="text-xl font-bold">1,234</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <Star className="h-8 w-8 text-yellow-600 mb-2" />
            <p className="text-sm text-gray-600">Top Performers</p>
            <p className="text-xl font-bold">87</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <TrendingUp className="h-8 w-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Fast Moving</p>
            <p className="text-xl font-bold">156</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <BarChart3 className="h-8 w-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Avg Margin</p>
            <p className="text-xl font-bold">23.5%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductAnalytics;