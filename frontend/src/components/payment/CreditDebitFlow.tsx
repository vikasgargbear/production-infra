import React from 'react';
import { 
  FileText, CreditCard, Receipt
} from 'lucide-react';
import { ModuleHub } from '../global';
import CreditNoteFlow from './components/CreditNoteFlow';
import DebitNoteFlow from './components/DebitNoteFlow';

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
  const notesModules = [
    {
      id: 'credit-note',
      label: 'Credit Note',
      fullLabel: 'Create Credit Note',
      description: 'Reduce customer liability',
      icon: CreditCard,
      color: 'green',
      component: CreditNoteFlow
    },
    {
      id: 'debit-note',
      label: 'Debit Note', 
      fullLabel: 'Create Debit Note',
      description: 'Increase customer liability',
      icon: Receipt,
      color: 'orange',
      component: DebitNoteFlow
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose}
      title="Credit/Debit Notes"
      subtitle="Financial Adjustments"
      icon={FileText}
      modules={notesModules}
      defaultModule={noteType === 'debit' ? 'debit-note' : 'credit-note'}
    />
  );
};

export default CreditDebitFlow;