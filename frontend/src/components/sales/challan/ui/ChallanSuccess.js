import React from 'react';
import { CheckCircle, Printer, Share2, Plus, Home, FileText } from 'lucide-react';

const ChallanSuccess = ({ challanId, onNewChallan, onClose }) => {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md mx-auto p-8">
        {/* Success Icon */}
        <div className="mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center mx-auto animate-bounce-once">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
        </div>

        {/* Success Message */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Challan Created Successfully!</h2>
        <p className="text-gray-600 mb-2">
          Your delivery challan <span className="font-semibold text-gray-900">{challanId}</span> has been saved.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          The challan is ready for dispatch and tracking.
        </p>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Printer className="w-5 h-5 mr-2 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Print Challan</span>
          </button>
          <button
            onClick={() => {
              // Share functionality
              if (navigator.share) {
                navigator.share({
                  title: `Delivery Challan ${challanId}`,
                  text: `Delivery challan ${challanId} has been created.`,
                });
              } else {
                // Fallback - copy to clipboard
                navigator.clipboard.writeText(`Delivery Challan ${challanId} created`);
                alert('Challan details copied to clipboard!');
              }
            }}
            className="flex items-center justify-center px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Share2 className="w-5 h-5 mr-2 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Share</span>
          </button>
        </div>

        {/* Main Actions */}
        <div className="space-y-3">
          <button
            onClick={onNewChallan}
            className="w-full px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all flex items-center justify-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create New Challan
          </button>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
          >
            <Home className="w-5 h-5 mr-2" />
            Back to Home
          </button>
        </div>

        {/* Additional Info */}
        <div className="mt-8 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <div className="flex items-start space-x-3">
            <FileText className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-sm font-medium text-orange-900">Next Steps</p>
              <ul className="mt-1 text-xs text-orange-800 space-y-1">
                <li>• Dispatch the goods with the printed challan</li>
                <li>• Update delivery status when goods are delivered</li>
                <li>• Convert to invoice after delivery confirmation</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChallanSuccess;