import React from 'react';
import { FileText } from 'lucide-react';
import { CanonicalWriteNotice, ModuleHeader } from '../../global';


interface CreditDebitFlowProps {
  onClose: () => void;
  open?: boolean;
  noteType?: 'credit' | 'debit';
}

const CreditDebitFlow: React.FC<CreditDebitFlowProps> = ({
  onClose,
  open = true,
  noteType = 'credit'
}) => {
  if (!open) return null;

  return (
    <div className="h-full bg-gray-50">
      <ModuleHeader
        title="Credit & Debit Notes"
        icon={FileText}
        iconColor="text-blue-600"
        onClose={onClose}
      />
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <CanonicalWriteNotice
          title="Financial adjustments are read-only"
          description="Credit and debit note creation is unavailable until one canonical command can post the note, tax adjustment, customer balance, and journal entry atomically. No legacy request or local draft will be created."
        />
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Credit and debit note guidance">
          <section className={`rounded-md border bg-white p-4 ${noteType === 'credit' ? 'border-blue-300' : 'border-gray-200'}`}>
            <h2 className="font-medium text-gray-900">Credit note</h2>
            <p className="mt-1 text-sm text-gray-600">Reduces a customer receivable after an approved return or billing adjustment.</p>
          </section>
          <section className={`rounded-md border bg-white p-4 ${noteType === 'debit' ? 'border-blue-300' : 'border-gray-200'}`}>
            <h2 className="font-medium text-gray-900">Debit note</h2>
            <p className="mt-1 text-sm text-gray-600">Increases a customer receivable through a reviewed financial adjustment.</p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default CreditDebitFlow;
