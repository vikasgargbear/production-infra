/**
 * Credit/Debit Notes Module
 * Central export for all notes-related components
 */

// Main Components
export { default as CreditDebitNote } from './CreditDebitNote';
export { default as NotesHub } from './NotesHub';
export { default as CreditNoteEntry } from './components/CreditNoteEntry';
export { default as DebitNoteEntry } from './components/DebitNoteEntry';

// Sub Components
export { default as NoteTypeSelector } from './components/NoteTypeSelector';
export { default as NoteDetails } from './components/NoteDetails';
export { default as NoteItemsTable } from './components/NoteItemsTable';
export { default as NoteAdjustment } from './components/NoteAdjustment';
export { default as NoteSummary } from './components/NoteSummary';

// Note Constants
export const NOTE_TYPES = {
  CREDIT: 'credit',
  DEBIT: 'debit'
} as const;

export const NOTE_REASONS = {
  RETURN: 'Product Return',
  PRICE_ADJUSTMENT: 'Price Adjustment',
  QUALITY_ISSUE: 'Quality Issue',
  DISCOUNT: 'Discount',
  TAX_ADJUSTMENT: 'Tax Adjustment',
  DAMAGE: 'Damage',
  SHORT_SUPPLY: 'Short Supply',
  OTHER: 'Other'
} as const;

export const NOTE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
  ADJUSTED: 'adjusted'
} as const;

// Type definitions
export type NoteType = typeof NOTE_TYPES[keyof typeof NOTE_TYPES];
export type NoteReason = typeof NOTE_REASONS[keyof typeof NOTE_REASONS];
export type NoteStatus = typeof NOTE_STATUS[keyof typeof NOTE_STATUS];

interface NoteAdjustment {
  amount: number;
}

interface Note {
  status: NoteStatus;
  amount: number;
  balance: number;
  adjustments?: NoteAdjustment[];
}

interface ValidationResult {
  valid: boolean;
  message?: string;
}

// Note validation utilities
export const validateNoteAmount = (amount: string | number, maxAmount?: string | number): ValidationResult => {
  if (!amount || isNaN(Number(amount)) || parseFloat(amount.toString()) <= 0) {
    return { valid: false, message: 'Amount must be greater than 0' };
  }
  if (maxAmount && parseFloat(amount.toString()) > parseFloat(maxAmount.toString())) {
    return { valid: false, message: `Amount cannot exceed ${maxAmount}` };
  }
  return { valid: true };
};

export const canAdjustNote = (note: Note): boolean => {
  return note.status === NOTE_STATUS.APPROVED && note.balance > 0;
};

export const calculateNoteBalance = (note: Note): number => {
  const adjustedAmount = note.adjustments?.reduce((sum, adj) => sum + adj.amount, 0) || 0;
  return note.amount - adjustedAmount;
};

// API
export { notesApi } from '../../services/api/modules/notes.api';

// Data Transformer
export { notesDataTransformer } from '../../services/api/utils/notesDataTransformer';

// Component interfaces
interface NotesComponents {
  CreditNoteEntry: React.ComponentType<any>;
  DebitNoteEntry: React.ComponentType<any>;
  NoteTypeSelector: React.ComponentType<any>;
  NoteDetails: React.ComponentType<any>;
  NoteItemsTable: React.ComponentType<any>;
  NoteAdjustment: React.ComponentType<any>;
  NoteSummary: React.ComponentType<any>;
}

interface NotesConstants {
  NOTE_TYPES: typeof NOTE_TYPES;
  NOTE_REASONS: typeof NOTE_REASONS;
  NOTE_STATUS: typeof NOTE_STATUS;
}

interface NotesUtils {
  validateNoteAmount: typeof validateNoteAmount;
  canAdjustNote: typeof canAdjustNote;
  calculateNoteBalance: typeof calculateNoteBalance;
}

// Default export
interface NotesModule {
  CreditDebitNote: React.ComponentType<any>;
  NotesHub: React.ComponentType<any>;
  components: NotesComponents;
  constants: NotesConstants;
  utils: NotesUtils;
}

const NotesModule: NotesModule = {
  CreditDebitNote,
  NotesHub,
  components: {
    CreditNoteEntry,
    DebitNoteEntry,
    NoteTypeSelector,
    NoteDetails,
    NoteItemsTable,
    NoteAdjustment,
    NoteSummary
  },
  constants: {
    NOTE_TYPES,
    NOTE_REASONS,
    NOTE_STATUS
  },
  utils: {
    validateNoteAmount,
    canAdjustNote,
    calculateNoteBalance
  }
};

export default NotesModule;