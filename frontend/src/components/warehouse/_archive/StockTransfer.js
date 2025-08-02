import React from 'react';
import { ArrowRightLeft, Construction, Wrench } from 'lucide-react';

const StockTransfer = ({ open = true, onClose }) => {
  if (!open) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Stock Transfer</h1>
              <p className="text-sm text-gray-600">Inter-branch transfers</p>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <span className="text-xl">×</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-100 rounded-full mb-6">
              <Construction className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Coming Soon</h2>
            <p className="text-lg text-gray-600 mb-8">
              We're working on the Stock Transfer feature. It will be available soon!
            </p>
            <div className="inline-flex items-center space-x-2 text-sm text-gray-500">
              <Wrench className="w-4 h-4" />
              <span>Under Development</span>
            </div>
            
            <div className="mt-12 p-6 bg-purple-50 rounded-lg text-left max-w-2xl mx-auto">
              <h3 className="font-semibold text-purple-900 mb-3">What to expect:</h3>
              <ul className="space-y-2 text-purple-800">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Transfer stock between branches/warehouses</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Track transfers in real-time</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Generate transfer documents</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Manage transfer approvals</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockTransfer;