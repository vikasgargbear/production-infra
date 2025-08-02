/**
 * Credit/Debit Notes Data Transformer
 * Handles data transformation between frontend and backend for notes
 */

export const notesDataTransformer = {
  /**
   * Transform credit note from frontend to backend format
   */
  transformCreditNoteToBackend: (noteData) => {
    return {
      note_number: noteData.note_no,
      note_date: noteData.date,
      party_id: noteData.party_id,
      party_type: noteData.party_type,
      amount: parseFloat(noteData.amount || 0),
      tax_rate: parseFloat(noteData.tax_rate || 0),
      tax_amount: parseFloat(noteData.tax_amount || 0),
      total_amount: parseFloat(noteData.total_amount || 0),
      reason: noteData.reason,
      description: noteData.description || '',
      linked_invoice_id: noteData.linked_invoice_id || null,
      status: 'draft'
    };
  },

  /**
   * Transform debit note from frontend to backend format
   */
  transformDebitNoteToBackend: (noteData) => {
    return {
      note_number: noteData.note_no,
      note_date: noteData.date,
      party_id: noteData.party_id,
      party_type: noteData.party_type,
      amount: parseFloat(noteData.amount || 0),
      tax_rate: parseFloat(noteData.tax_rate || 0),
      tax_amount: parseFloat(noteData.tax_amount || 0),
      total_amount: parseFloat(noteData.total_amount || 0),
      reason: noteData.reason,
      description: noteData.description || '',
      linked_purchase_id: noteData.linked_invoice_id || null, // For supplier debit notes
      status: 'draft'
    };
  },

  /**
   * Transform credit note from backend to frontend format
   */
  transformCreditNoteToFrontend: (noteData) => {
    return {
      id: noteData.id,
      note_type: 'credit',
      note_no: noteData.note_number,
      date: noteData.note_date,
      party_type: noteData.party_type || 'customer',
      party_id: noteData.party_id,
      party_name: noteData.party_name || '',
      party_details: noteData.party || null,
      amount: noteData.amount || 0,
      tax_rate: noteData.tax_rate || 0,
      tax_amount: noteData.tax_amount || 0,
      total_amount: noteData.total_amount || 0,
      reason: noteData.reason || '',
      linked_invoice_id: noteData.linked_invoice_id || '',
      linked_invoice_no: noteData.linked_invoice?.invoice_number || '',
      description: noteData.description || '',
      status: noteData.status || 'draft',
      created_at: noteData.created_at,
      updated_at: noteData.updated_at
    };
  },

  /**
   * Transform debit note from backend to frontend format
   */
  transformDebitNoteToFrontend: (noteData) => {
    return {
      id: noteData.id,
      note_type: 'debit',
      note_no: noteData.note_number,
      date: noteData.note_date,
      party_type: noteData.party_type || 'supplier',
      party_id: noteData.party_id,
      party_name: noteData.party_name || '',
      party_details: noteData.party || null,
      amount: noteData.amount || 0,
      tax_rate: noteData.tax_rate || 0,
      tax_amount: noteData.tax_amount || 0,
      total_amount: noteData.total_amount || 0,
      reason: noteData.reason || '',
      linked_invoice_id: noteData.linked_purchase_id || '',
      linked_invoice_no: noteData.linked_purchase?.invoice_number || '',
      description: noteData.description || '',
      status: noteData.status || 'draft',
      created_at: noteData.created_at,
      updated_at: noteData.updated_at
    };
  },

  /**
   * Transform list of notes to frontend format
   */
  transformNotesListToFrontend: (notesList, noteType) => {
    const transformer = noteType === 'credit' 
      ? notesDataTransformer.transformCreditNoteToFrontend 
      : notesDataTransformer.transformDebitNoteToFrontend;
    
    return notesList.map(note => transformer(note));
  },

  /**
   * Validate credit/debit note data
   */
  validateNoteData: (noteData) => {
    const errors = [];
    
    if (!noteData.party_id) {
      errors.push('Party is required');
    }
    
    if (!noteData.amount || parseFloat(noteData.amount) <= 0) {
      errors.push('Valid amount is required');
    }
    
    if (!noteData.reason) {
      errors.push('Reason is required');
    }
    
    if (!noteData.date) {
      errors.push('Date is required');
    }
    
    if (noteData.tax_rate < 0 || noteData.tax_rate > 28) {
      errors.push('Tax rate must be between 0 and 28%');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  /**
   * Transform adjustment data for applying notes
   */
  transformAdjustmentToBackend: (adjustmentData) => {
    return {
      invoice_id: adjustmentData.invoice_id,
      adjustment_amount: parseFloat(adjustmentData.amount || 0),
      adjustment_date: adjustmentData.date || new Date().toISOString().split('T')[0],
      remarks: adjustmentData.remarks || ''
    };
  },

  /**
   * Transform pending adjustments from backend
   */
  transformPendingAdjustmentsToFrontend: (data) => {
    return {
      party_id: data.party_id,
      party_name: data.party_name,
      party_type: data.party_type,
      total_pending_credit: data.total_pending_credit || 0,
      total_pending_debit: data.total_pending_debit || 0,
      net_adjustment: (data.total_pending_credit || 0) - (data.total_pending_debit || 0),
      pending_notes: data.pending_notes?.map(note => ({
        id: note.id,
        note_no: note.note_number,
        date: note.note_date,
        amount: note.remaining_amount || note.total_amount,
        type: note.note_type
      })) || []
    };
  }
};

// Export individual functions for convenience
export const {
  transformCreditNoteToBackend,
  transformDebitNoteToBackend,
  transformCreditNoteToFrontend,
  transformDebitNoteToFrontend,
  transformNotesListToFrontend,
  validateNoteData,
  transformAdjustmentToBackend,
  transformPendingAdjustmentsToFrontend
} = notesDataTransformer;