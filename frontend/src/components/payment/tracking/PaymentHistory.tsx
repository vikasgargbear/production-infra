import React, { useEffect } from 'react';
import { History, Search, Filter, Download, X } from 'lucide-react';
import { ModuleHeader } from '../global';

interface PaymentHistoryProps {
  onClose?: () => void;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({ onClose }) => {
  // ESC key handler for better UX
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Payment History"
          documentNumber=""
          status="active"
          icon={History}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="payment"
          showSaveDraft={false}
          onSaveDraft={() => {}}
        />

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