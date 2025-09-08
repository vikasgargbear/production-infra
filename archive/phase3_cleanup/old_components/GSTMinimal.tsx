import React, { useState } from 'react';
import { ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';

interface GSTMinimalProps {
  open?: boolean;
  onClose?: () => void;
}

const GSTMinimal: React.FC<GSTMinimalProps> = () => {
  const [selectedPeriod] = useState('January 2025');

  return (
    <div className="min-h-screen bg-white">
      {/* Simple header */}
      <div className="border-b border-gray-100">
        <div className="px-6 py-4">
          <h1 className="text-lg font-medium text-gray-900">GST</h1>
          <p className="text-sm text-gray-500">{selectedPeriod}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-6">
        {/* Single payable amount - the most important info */}
        <div className="text-center py-12 border-b border-gray-100">
          <div className="text-3xl font-light text-gray-900">₹60,000</div>
          <div className="text-sm text-gray-500 mt-2">Tax payable</div>
        </div>

        {/* Simple list of returns */}
        <div className="py-6 space-y-4">
          <div 
            className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50 -mx-3 px-3 rounded-lg"
            onClick={() => console.log('GSTR-1')}
          >
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
              <div>
                <div className="text-gray-900">GSTR-1</div>
                <div className="text-sm text-gray-500">Filed</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>

          <div 
            className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50 -mx-3 px-3 rounded-lg"
            onClick={() => console.log('File GSTR-3B')}
          >
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-3" />
              <div>
                <div className="text-gray-900">GSTR-3B</div>
                <div className="text-sm text-gray-500">Due 20 Jan</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTMinimal;