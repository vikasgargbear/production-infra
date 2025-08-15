import React from 'react';
import { ArrowDownToLine, Construction, Wrench } from 'lucide-react';
import { ModuleHeader } from '../global';

const StockMovement = ({ open = true, onClose }) => {
  if (!open) return null;

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Stock Movement"
          subtitle="Receive and issue stock"
          icon={ArrowDownToLine}
          iconColor="text-teal-600"
          onClose={onClose}
          historyType="stock"
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-100 rounded-full mb-6">
              <Construction className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Coming Soon</h2>
            <p className="text-lg text-gray-600 mb-8">
              We're working on the Stock Movement feature. It will be available soon!
            </p>
            <div className="inline-flex items-center space-x-2 text-sm text-gray-500">
              <Wrench className="w-4 h-4" />
              <span>Under Development</span>
            </div>
            
            <div className="mt-12 p-6 bg-blue-50 rounded-lg text-left max-w-2xl mx-auto">
              <h3 className="font-semibold text-blue-900 mb-3">What to expect:</h3>
              <ul className="space-y-2 text-blue-800">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Quick stock receiving from suppliers</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Stock issue tracking for sales and internal use</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Batch-wise movement tracking</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Movement history and reports</span>
                </li>
              </ul>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockMovement;