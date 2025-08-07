import React, { useState } from 'react';
import { 
  ChevronRight, CheckCircle, AlertCircle, Calendar, 
  TrendingUp, FileText, Clock, ArrowUpRight, ArrowDownRight 
} from 'lucide-react';

interface GSTBalancedProps {
  open?: boolean;
  onClose?: () => void;
}

const GSTBalanced: React.FC<GSTBalancedProps> = () => {
  const [selectedPeriod] = useState('January 2025');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900">GST Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{selectedPeriod}</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Key Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Tax Payable Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-500">Tax Payable</span>
              <ArrowUpRight className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-semibold text-gray-900">₹60,000</div>
            <div className="text-sm text-gray-500 mt-1">Due by 20th Jan</div>
          </div>

          {/* Input Credit Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-500">Input Credit</span>
              <ArrowDownRight className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-2xl font-semibold text-gray-900">₹24,000</div>
            <div className="text-sm text-gray-500 mt-1">Available</div>
          </div>

          {/* Compliance Score */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-500">Compliance</span>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-2xl font-semibold text-gray-900">100%</div>
            <div className="text-sm text-gray-500 mt-1">All returns filed</div>
          </div>
        </div>

        {/* Returns Section */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Returns Status</h2>
          </div>
          
          <div className="divide-y divide-gray-100">
            {/* GSTR-1 */}
            <div 
              className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => console.log('GSTR-1')}
            >
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                <div>
                  <div className="font-medium text-gray-900">GSTR-1</div>
                  <div className="text-sm text-gray-500">Outward Supplies</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">₹3,60,000</div>
                  <div className="text-xs text-green-600">Filed on 10 Jan</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* GSTR-3B */}
            <div 
              className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => console.log('File GSTR-3B')}
            >
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-amber-500 mr-3" />
                <div>
                  <div className="font-medium text-gray-900">GSTR-3B</div>
                  <div className="text-sm text-gray-500">Summary Return</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">₹60,000</div>
                  <div className="text-xs text-amber-600">Due on 20 Jan</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* GSTR-2A */}
            <div 
              className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => console.log('GSTR-2A')}
            >
              <div className="flex items-center">
                <FileText className="w-5 h-5 text-blue-500 mr-3" />
                <div>
                  <div className="font-medium text-gray-900">GSTR-2A</div>
                  <div className="text-sm text-gray-500">Auto-drafted Supplies</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">₹2,40,000</div>
                  <div className="text-xs text-blue-600">View Details</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <button className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left">
            <FileText className="w-5 h-5 text-blue-500 mb-2" />
            <div className="font-medium text-gray-900">File Return</div>
            <div className="text-xs text-gray-500">Quick filing</div>
          </button>
          
          <button className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left">
            <TrendingUp className="w-5 h-5 text-green-500 mb-2" />
            <div className="font-medium text-gray-900">View Reports</div>
            <div className="text-xs text-gray-500">Tax analysis</div>
          </button>
          
          <button className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left">
            <Calendar className="w-5 h-5 text-purple-500 mb-2" />
            <div className="font-medium text-gray-900">Calendar</div>
            <div className="text-xs text-gray-500">Due dates</div>
          </button>
          
          <button className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left">
            <Clock className="w-5 h-5 text-amber-500 mb-2" />
            <div className="font-medium text-gray-900">History</div>
            <div className="text-xs text-gray-500">Past filings</div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GSTBalanced;