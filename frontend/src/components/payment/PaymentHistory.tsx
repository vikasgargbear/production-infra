import React from 'react';
import { History, Search, Filter, Download } from 'lucide-react';

interface PaymentHistoryProps {
  onClose?: () => void;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({ onClose }) => {
  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-gray-600" />
                <h1 className="text-xl font-semibold text-gray-900">Payment History</h1>
              </div>
              <div className="flex items-center gap-3">
                <button className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filter
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
            <History className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Payment History</h2>
            <p className="text-gray-500 mb-4">View and manage all payment transactions</p>
            <p className="text-sm text-gray-400">Coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentHistory;