import React from 'react';
import { FileText } from 'lucide-react';

interface InvoiceFlowProps {
  onClose?: () => void;
}

const InvoiceFlow: React.FC<InvoiceFlowProps> = ({ onClose }) => {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-6 h-6 text-blue-600" />
        <h2 className="text-2xl font-semibold">Invoice Management</h2>
      </div>
      
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          Invoice module is currently being updated. Please check back later.
        </p>
      </div>
      
      {onClose && (
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          Close
        </button>
      )}
    </div>
  );
};

export default InvoiceFlow;