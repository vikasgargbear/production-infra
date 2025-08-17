import React, { useState } from 'react';
import CreditDebitFlow from '../payment/CreditDebitFlow';

interface CreditDebitNoteFlowProps {
  open?: boolean;
  onClose?: () => void;
}

const CreditDebitNoteFlow: React.FC<CreditDebitNoteFlowProps> = ({ open = true, onClose }) => {
  const [noteType, setNoteType] = useState<'credit' | 'debit'>('credit');

  if (!open) return null;

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Tab Selector */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex space-x-8">
              <button
                onClick={() => setNoteType('credit')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  noteType === 'credit'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Credit Note
              </button>
              <button
                onClick={() => setNoteType('debit')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  noteType === 'debit'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Debit Note
              </button>
            </div>
          </div>
        </div>

        {/* Note Component */}
        <div className="flex-1">
          <CreditDebitFlow 
            noteType={noteType} 
            onClose={onClose || (() => {})}
          />
        </div>
      </div>
    </div>
  );
};

export default CreditDebitNoteFlow;