/**
 * Payment Data Transformer
 * Handles data transformation between frontend and backend for payments
 */

export const paymentDataTransformer = {
  /**
   * Transform payment from frontend to backend format
   */
  transformPaymentToBackend: (paymentData) => {
    console.log('🔍 TRANSFORMER: Input data:', JSON.stringify(paymentData, null, 2));
    // Map payment modes
    const paymentModeMap = {
      'CASH': 'cash',
      'UPI': 'upi',
      'BANK_TRANSFER': 'bank_transfer',
      'CHEQUE': 'cheque',
      'CARD': 'card',
      'RTGS_NEFT': 'rtgs_neft'
    };

    // Handle multi-payment mode structure from EnterprisePaymentEntry
    if (paymentData.payment_modes && Array.isArray(paymentData.payment_modes)) {
      // Calculate total amount from payment modes if not provided
      const totalAmount = paymentData.total_amount || 
        paymentData.payment_modes.reduce((sum, mode) => 
          sum + (parseFloat(mode.amount) || 0), 0
        );
      
      console.log('🔍 TRANSFORMER: Multi-payment mode detected, total amount:', totalAmount);
      
      const transformed = {
        party_id: paymentData.customer_id || paymentData.party_id,
        party_type: paymentData.payment_type || paymentData.party_type || 'customer',
        payment_date: paymentData.payment_date || paymentData.date || new Date().toISOString().split('T')[0],
        amount: parseFloat(totalAmount || 0),
        payment_modes: paymentData.payment_modes, // Keep the array structure
        reference_number: paymentData.reference_number || '',
        bank_name: paymentData.bank_name || '',
        transaction_id: paymentData.transaction_id || '',
        remarks: paymentData.remarks || paymentData.notes || '',
        collector_name: paymentData.collector_name || null,
        route: paymentData.route || null,
        // Invoice allocations
        allocations: paymentData.invoice_allocations?.map(allocation => ({
          invoice_id: allocation.invoice_id,
          allocated_amount: parseFloat(allocation.amount || allocation.allocated_amount || 0)
        })) || [],
        // Attachment
        attachment: paymentData.attachment || null,
        attachment_name: paymentData.attachment_name || null
      };
      
      console.log('🔍 TRANSFORMER: Multi-payment output:', JSON.stringify(transformed, null, 2));
      return transformed;
    }

    // Legacy single payment mode structure
    return {
      party_id: paymentData.customer_id || paymentData.party_id,
      party_type: paymentData.party_type || 'customer',
      payment_date: paymentData.payment_date || paymentData.date || new Date().toISOString().split('T')[0],
      amount: parseFloat(paymentData.amount || 0),
      payment_mode: paymentModeMap[paymentData.payment_mode] || paymentData.payment_mode || 'cash',
      reference_number: paymentData.reference_number || '',
      bank_name: paymentData.bank_name || '',
      transaction_id: paymentData.transaction_id || '',
      remarks: paymentData.remarks || paymentData.notes || '',
      // Invoice allocations
      allocations: paymentData.allocations?.map(allocation => ({
        invoice_id: allocation.invoice_id,
        allocated_amount: parseFloat(allocation.allocated_amount || 0)
      })) || [],
      // Attachment
      attachment: paymentData.attachment || null,
      attachment_name: paymentData.attachment_name || null
    };
  },

  /**
   * Transform payment from backend to frontend format
   */
  transformPaymentToFrontend: (paymentData) => {
    // Map payment modes
    const paymentModeMap = {
      'cash': 'CASH',
      'upi': 'UPI',
      'bank_transfer': 'BANK_TRANSFER',
      'cheque': 'CHEQUE',
      'card': 'CARD',
      'rtgs_neft': 'RTGS_NEFT'
    };

    return {
      id: paymentData.id,
      receipt_no: paymentData.receipt_number || paymentData.payment_number,
      customer_id: paymentData.party_id,
      customer_name: paymentData.party_name || '',
      party_type: paymentData.party_type || 'customer',
      date: paymentData.payment_date,
      amount: paymentData.amount || 0,
      payment_mode: paymentModeMap[paymentData.payment_mode] || paymentData.payment_mode || 'CASH',
      reference_number: paymentData.reference_number || '',
      bank_name: paymentData.bank_name || '',
      transaction_id: paymentData.transaction_id || '',
      notes: paymentData.remarks || '',
      status: paymentData.status || 'completed',
      allocations: paymentData.allocations?.map(allocation => ({
        invoice_id: allocation.invoice_id,
        invoice_no: allocation.invoice_number || '',
        allocated_amount: allocation.allocated_amount || 0
      })) || [],
      attachment: paymentData.attachment || null,
      attachment_name: paymentData.attachment_name || null,
      created_at: paymentData.created_at,
      updated_at: paymentData.updated_at
    };
  },

  /**
   * Transform invoice data for outstanding display
   */
  transformInvoiceToFrontend: (invoiceData) => {
    return {
      id: invoiceData.id,
      invoice_no: invoiceData.invoice_number || invoiceData.invoice_no,
      invoice_date: invoiceData.invoice_date || invoiceData.date,
      total_amount: invoiceData.total_amount || 0,
      paid_amount: invoiceData.paid_amount || 0,
      amount_due: invoiceData.outstanding_amount || invoiceData.amount_due || 
                  (invoiceData.total_amount - (invoiceData.paid_amount || 0)),
      allocated_amount: 0, // Will be set by frontend
      days_overdue: invoiceData.days_overdue || 0,
      status: invoiceData.payment_status || invoiceData.status
    };
  },

  /**
   * Validate payment data
   */
  validatePaymentData: (paymentData) => {
    const errors = [];
    
    if (!paymentData.party_id) {
      errors.push('Customer/Party is required');
    }
    
    // Handle multi-payment mode validation
    if (paymentData.payment_modes && Array.isArray(paymentData.payment_modes)) {
      // Check if at least one valid payment mode exists
      const hasValidPaymentMode = paymentData.payment_modes.some(mode => 
        mode.mode && mode.amount && parseFloat(mode.amount) > 0
      );
      
      if (!hasValidPaymentMode) {
        errors.push('At least one payment mode with valid amount is required');
      }
      
      // Validate total amount 
      if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
        errors.push('Total payment amount must be greater than 0');
      }
      
      // Validate each payment mode
      paymentData.payment_modes.forEach((mode, index) => {
        if (mode.mode && mode.amount) {
          // Reference validation removed as per frontend requirements
          // Bank validation also removed for simplicity
        }
      });
    } else {
      // Legacy single payment mode validation
      if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
        errors.push('Valid payment amount is required');
      }
      
      if (!paymentData.payment_mode) {
        errors.push('Payment mode is required');
      }
      
      // Mode-specific validations removed as per frontend requirements
    }
    
    if (!paymentData.payment_date) {
      errors.push('Payment date is required');
    }
    
    // Validate allocations
    if (paymentData.allocations && paymentData.allocations.length > 0) {
      const totalAllocated = paymentData.allocations.reduce((sum, alloc) => 
        sum + parseFloat(alloc.allocated_amount || 0), 0
      );
      
      const totalAmount = parseFloat(paymentData.amount || 0);
      if (totalAllocated > totalAmount) {
        errors.push('Total allocated amount cannot exceed payment amount');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  /**
   * Transform payment list to frontend format
   */
  transformPaymentListToFrontend: (paymentsList) => {
    return paymentsList.map(payment => 
      paymentDataTransformer.transformPaymentToFrontend(payment)
    );
  },

  /**
   * Calculate allocation summary
   */
  calculateAllocationSummary: (payment) => {
    const totalAllocated = payment.allocations?.reduce((sum, alloc) => 
      sum + parseFloat(alloc.allocated_amount || 0), 0
    ) || 0;
    
    const unallocatedAmount = parseFloat(payment.amount || 0) - totalAllocated;
    
    return {
      payment_amount: parseFloat(payment.amount || 0),
      total_allocated: totalAllocated,
      unallocated_amount: unallocatedAmount,
      allocation_percentage: payment.amount > 0 ? (totalAllocated / payment.amount * 100) : 0
    };
  },

  /**
   * Transform payment analytics data
   */
  transformAnalyticsToFrontend: (analyticsData) => {
    return {
      total_collected: analyticsData.total_collected || 0,
      total_pending: analyticsData.total_pending || 0,
      collection_rate: analyticsData.collection_rate || 0,
      payment_modes: analyticsData.payment_modes?.map(mode => ({
        mode: mode.payment_mode,
        count: mode.count || 0,
        amount: mode.total_amount || 0,
        percentage: mode.percentage || 0
      })) || [],
      daily_collections: analyticsData.daily_collections?.map(day => ({
        date: day.date,
        amount: day.amount || 0,
        count: day.payment_count || 0
      })) || [],
      top_payers: analyticsData.top_payers?.map(payer => ({
        party_id: payer.party_id,
        party_name: payer.party_name,
        total_paid: payer.total_amount || 0,
        payment_count: payer.payment_count || 0
      })) || []
    };
  }
};

// Export individual functions for convenience
export const {
  transformPaymentToBackend,
  transformPaymentToFrontend,
  transformInvoiceToFrontend,
  validatePaymentData,
  transformPaymentListToFrontend,
  calculateAllocationSummary,
  transformAnalyticsToFrontend
} = paymentDataTransformer;