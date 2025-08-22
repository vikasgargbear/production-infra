import React from 'react';
import { Users, UserPlus, UserCheck, TrendingUp } from 'lucide-react';

const CustomerAnalytics: React.FC = () => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Customer Analytics</h1>
        <p className="text-gray-600">Customer behavior, segmentation, and lifetime value</p>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <Users className="h-8 w-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Total Customers</p>
            <p className="text-xl font-bold">567</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <UserPlus className="h-8 w-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">New This Month</p>
            <p className="text-xl font-bold">45</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <UserCheck className="h-8 w-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Active Customers</p>
            <p className="text-xl font-bold">423</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <TrendingUp className="h-8 w-8 text-indigo-600 mb-2" />
            <p className="text-sm text-gray-600">Avg Lifetime Value</p>
            <p className="text-xl font-bold">₹45,670</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerAnalytics;