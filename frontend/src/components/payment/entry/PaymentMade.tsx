import React from 'react';
import { CreditCard } from 'lucide-react';

interface PaymentMadeProps {
  onClose?: () => void;
}

const PaymentMade: React.FC<PaymentMadeProps> = ({ onClose }) => {
  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Content */}
        <div className="flex-1 p-6">
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Payment Made</h2>
            <p className="text-gray-500 mb-4">Record supplier payments</p>
            <p className="text-sm text-gray-400">Coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentMade;