import React, { useState } from 'react';
import { 
  PlusCircle, MinusCircle, X
} from 'lucide-react';
import CreditDebitNote from './CreditDebitNote';
import { ModuleSidebar } from '../common';

const NotesHub = ({ open = true, onClose }) => {
  const [activeModule, setActiveModule] = useState('credit-note');

  if (!open) return null;

  const notesModules = [
    {
      id: 'credit-note',
      label: 'Credit Note',
      description: 'Issue credit',
      icon: PlusCircle,
      gradient: 'from-green-500 to-green-600'
    },
    {
      id: 'debit-note',
      label: 'Debit Note',
      description: 'Issue debit',
      icon: MinusCircle,
      gradient: 'from-orange-500 to-orange-600'
    }
  ];

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex">
      {/* Top Right Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
        title="Close (Esc)"
      >
        <X className="w-6 h-6 text-gray-600" />
      </button>

      {/* Sidebar */}
      <ModuleSidebar 
        modules={notesModules}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
      />
      
      {/* Main Content */}
      <div className="flex-1">
        <CreditDebitNote 
          open={true}
          onClose={onClose}
          initialNoteType={activeModule === 'credit-note' ? 'credit' : 'debit'}
          key={activeModule}
        />
      </div>
    </div>
  );
};

export default NotesHub;