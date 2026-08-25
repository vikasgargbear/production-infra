import React from 'react';
import { FileText } from 'lucide-react';
import { CanonicalWriteNotice, ModuleHeader } from '../../global';

interface FinancialJournalFlowProps {
  onClose?: () => void;
}

/**
 * A general journal is intentionally unavailable until it has the same
 * prepare/review/approve/execute/readback authority as the published core
 * commands. Do not render a locally calculated draft or call retired integer
 * journal/account endpoints: either would present the browser as an accounting
 * authority.
 */
const FinancialJournalFlow: React.FC<FinancialJournalFlowProps> = ({ onClose }) => (
  <div className="h-full bg-slate-50">
    <ModuleHeader
      title="Journal Entry"
      status="Unavailable"
      icon={FileText}
      iconColor="text-slate-600"
      onClose={onClose}
      showSaveDraft={false}
    />
    <main className="mx-auto max-w-3xl p-6">
      <CanonicalWriteNotice action="Posting a journal entry" />
      <p className="mt-4 text-sm text-slate-600">
        No journal number, account balance, tax value, or posting result is
        generated in this browser. This screen will be enabled only after an
        authoritative canonical command and exact journal readback are published.
      </p>
    </main>
  </div>
);

export default FinancialJournalFlow;
