import React from 'react';
import { BarChart3, TrendingUp, Download, Calendar } from 'lucide-react';

interface PaymentReportsProps {
  onClose?: () => void;
}

const PaymentReports: React.FC<PaymentReportsProps> = ({ onClose }) => {
  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-gray-600" />
                <h1 className="text-xl font-semibold text-gray-900">Payment Reports</h1>
              </div>
              <div className="flex items-center gap-3">
                <button className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date Range
                </button>
                <button className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Payment Analytics</h2>
            <p className="text-gray-500 mb-4">Comprehensive payment reports and insights</p>
            <p className="text-sm text-gray-400">Coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentReports;