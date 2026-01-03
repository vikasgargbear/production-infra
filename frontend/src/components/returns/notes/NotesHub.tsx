import React from 'react';
import {
  FileEdit, PlusCircle, MinusCircle
} from 'lucide-react';
import { ModuleHub } from '../../global';
import CreditDebitNoteSimple from './CreditDebitNoteSimple';

interface NotesHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface NotesModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const NotesHub: React.FC<NotesHubProps> = ({ open = true, onClose }) => {
  const notesModules: NotesModule[] = [
    {
      id: 'credit-note',
      label: 'Credit Note',
      fullLabel: 'Create Credit Note',
      description: 'Issue credit to customers',
      icon: PlusCircle,
      color: 'green',
      component: () => <CreditDebitNoteSimple noteType="credit" onClose={onClose} />
    },
    {
      id: 'debit-note',
      label: 'Debit Note',
      fullLabel: 'Create Debit Note',
      description: 'Issue debit to suppliers',
      icon: MinusCircle,
      color: 'orange',
      component: () => <CreditDebitNoteSimple noteType="debit" onClose={onClose} />
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Credit/Debit Notes"
      subtitle="Financial adjustments and corrections"
      icon={FileEdit}
      modules={notesModules}
      defaultModule="credit-note"
    />
  );
};

export default NotesHub;