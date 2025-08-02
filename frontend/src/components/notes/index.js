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

// Note Utilities
export const NOTE_TYPES = {
  CREDIT: 'credit',
  DEBIT: 'debit'
};

export const NOTE_REASONS = {
  RETURN: 'Product Return',
  PRICE_ADJUSTMENT: 'Price Adjustment',
  QUALITY_ISSUE: 'Quality Issue',
  DISCOUNT: 'Discount',
  TAX_ADJUSTMENT: 'Tax Adjustment',
  DAMAGE: 'Damage',
  SHORT_SUPPLY: 'Short Supply',
  OTHER: 'Other'
};

export const NOTE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
  ADJUSTED: 'adjusted'
};

// Note validation utilities
export const validateNoteAmount = (amount, maxAmount) => {
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    return { valid: false, message: 'Amount must be greater than 0' };
  }
  if (maxAmount && parseFloat(amount) > parseFloat(maxAmount)) {
    return { valid: false, message: `Amount cannot exceed ${maxAmount}` };
  }
  return { valid: true };
};

export const canAdjustNote = (note) => {
  return note.status === NOTE_STATUS.APPROVED && note.balance > 0;
};

export const calculateNoteBalance = (note) => {
  const adjustedAmount = note.adjustments?.reduce((sum, adj) => sum + adj.amount, 0) || 0;
  return note.amount - adjustedAmount;
};

// API
export { notesApi } from '../../services/api/modules/notes.api';

// Data Transformer
export { notesDataTransformer } from '../../services/api/utils/notesDataTransformer';

// Default export
const NotesModule = {
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