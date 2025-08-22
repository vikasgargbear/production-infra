import React from 'react';
import { DollarSign, TrendingUp, CreditCard, PiggyBank } from 'lucide-react';

const FinancialReport: React.FC = () => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Financial Report</h1>
        <p className="text-gray-600">Revenue, expenses, and cash flow analysis</p>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <DollarSign className="h-8 w-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Total Revenue</p>
            <p className="text-xl font-bold">₹24,56,780</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <TrendingUp className="h-8 w-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Gross Profit</p>
            <p className="text-xl font-bold">₹6,45,230</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <CreditCard className="h-8 w-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Receivables</p>
            <p className="text-xl font-bold">₹3,21,450</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <PiggyBank className="h-8 w-8 text-indigo-600 mb-2" />
            <p className="text-sm text-gray-600">Cash Balance</p>
            <p className="text-xl font-bold">₹8,76,540</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialReport;