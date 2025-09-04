import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Save, AlertCircle, RefreshCw, Loader2
} from 'lucide-react';
import { DatePicker, Button } from '../../global';
import { notesApi } from '../../../services/api/modules/notes.api';
import CreditNoteFormPage from './CreditNoteFormPage';
import CreditNoteReviewPage from './CreditNoteReviewPage';

interface CreditNoteFlowProps {
  onClose?: () => void;
  open?: boolean;
}

interface NoteItem {
  id: string;
  product_name: string;
  hsn_code: string;
  quantity: number;
  rate: number;
  discount_percent: number;
  total_amount: number;
}

const CreditNoteFlow: React.FC<CreditNoteFlowProps> = ({ onClose }) => {
  // Remove step-based navigation to match global ERP patterns
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [noteItems, setNoteItems] = useState<NoteItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Pagination and filter state
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceFilters, setInvoiceFilters] = useState({
    dateFrom: '',
    dateTo: '',
    status: 'all',
    minAmount: '',
    maxAmount: ''
  });
  const [invoicePagination, setInvoicePagination] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [createWithoutInvoice, setCreateWithoutInvoice] = useState(false);
  const [showReviewPage, setShowReviewPage] = useState(false);

  const [noteData, setNoteData] = useState({
    note_number: `CR-${Date.now().toString().slice(-6)}`,
    note_date: new Date().toISOString().split('T')[0],
    reason: '',
    settlement_type: '',
    selected_invoice: null as any,
    internal_notes: '',
    customer_remarks: ''
  });

  // Load reason and settlement options from API
  const [reasonOptions, setReasonOptions] = useState<any[]>([]);
  const [settlementOptions, setSettlementOptions] = useState<any[]>([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [reasonsResponse, settlementsResponse] = await Promise.all([
        notesApi.getCreditNoteReasons(),
        notesApi.getSettlementTypes()
      ]);

      if (reasonsResponse?.data) {
        setReasonOptions(reasonsResponse.data);
      }
      if (settlementsResponse?.data) {
        setSettlementOptions(settlementsResponse.data);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      // Fallback to basic options if API fails
      setReasonOptions([
        { value: 'discount', label: 'Additional Discount Given' },
        { value: 'price_adjustment', label: 'Price Adjustment/Correction' },
        { value: 'overcharge', label: 'Overcharge/Billing Error' },
        { value: 'quality_issue', label: 'Quality Issue/Defective Goods' },
        { value: 'goodwill', label: 'Goodwill Gesture' },
        { value: 'promotional', label: 'Promotional/Marketing Credit' },
        { value: 'return_goods', label: 'Goods Returned' },
        { value: 'cancel_order', label: 'Order Cancellation' },
        { value: 'shortage', label: 'Short Supply/Quantity Issue' },
        { value: 'expired_goods', label: 'Expired/Damaged Goods' },
        { value: 'wrong_dispatch', label: 'Wrong Product Dispatched' },
        { value: 'early_payment', label: 'Early Payment Discount' },
        { value: 'volume_discount', label: 'Volume/Bulk Discount' },
        { value: 'settlement', label: 'Settlement of Dispute' },
        { value: 'waiver', label: 'Penalty/Interest Waiver' },
        { value: 'scheme_benefit', label: 'Scheme/Offer Benefit' },
        { value: 'transport_issue', label: 'Transport/Delivery Issue' },
        { value: 'other', label: 'Other Reason' }
      ]);
      setSettlementOptions([
        { value: 'adjust_future', label: 'Adjust in Future Invoices' },
        { value: 'account_credit', label: 'Account Credit Balance' },
        { value: 'cash_refund', label: 'Cash Refund' },
        { value: 'bank_transfer', label: 'Bank Transfer/NEFT/RTGS' },
        { value: 'cheque_refund', label: 'Cheque Refund' },
        { value: 'upi_refund', label: 'UPI/Digital Payment Refund' },
        { value: 'credit_card', label: 'Credit Card Refund' },
        { value: 'replacement_goods', label: 'Replacement Goods' },
        { value: 'store_credit', label: 'Store Credit/Gift Voucher' },
        { value: 'offset_payables', label: 'Offset Against Payables' },
        { value: 'manual_adjustment', label: 'Manual Journal Adjustment' },
        { value: 'no_settlement', label: 'No Settlement Required' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await loadInitialData();
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Load customer invoices when customer is selected
  useEffect(() => {
    const fetchCustomerInvoices = async () => {
      const customerId = selectedCustomer?.id || selectedCustomer?.customer_id || selectedCustomer?.party_id;
      if (!customerId) {
        setCustomerInvoices([]);
        setInvoicePagination(null);
        return;
      }

      setLoadingInvoices(true);
      try {
        const data = await notesApi.getLinkedInvoices(
          customerId, 
          'sales'
        );
        
        let allInvoices = data.invoices?.map((invoice: any) => ({
          id: invoice.invoice_id || invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          total_amount: parseFloat(invoice.final_amount || invoice.grand_total || invoice.total_amount) || 0,
          outstanding_amount: parseFloat(invoice.credit_amount || 
            (parseFloat(invoice.final_amount || invoice.grand_total || invoice.total_amount || 0) - 
             parseFloat(invoice.paid_amount || 0))),
          status: invoice.payment_status || 'pending',
          items: invoice.items || []
        })) || [];

        // Apply frontend filters
        if (invoiceFilters.dateFrom) {
          allInvoices = allInvoices.filter(invoice => 
            new Date(invoice.invoice_date) >= new Date(invoiceFilters.dateFrom)
          );
        }
        
        if (invoiceFilters.dateTo) {
          allInvoices = allInvoices.filter(invoice => 
            new Date(invoice.invoice_date) <= new Date(invoiceFilters.dateTo)
          );
        }
        
        if (invoiceFilters.status !== 'all') {
          allInvoices = allInvoices.filter(invoice => 
            invoice.status.toLowerCase() === invoiceFilters.status.toLowerCase()
          );
        }
        
        if (invoiceFilters.minAmount) {
          allInvoices = allInvoices.filter(invoice => 
            invoice.total_amount >= parseFloat(invoiceFilters.minAmount)
          );
        }
        
        if (invoiceFilters.maxAmount) {
          allInvoices = allInvoices.filter(invoice => 
            invoice.total_amount <= parseFloat(invoiceFilters.maxAmount)
          );
        }

        // Apply frontend pagination
        const limit = 5;
        const totalCount = allInvoices.length;
        const totalPages = Math.ceil(totalCount / limit);
        const offset = (invoicePage - 1) * limit;
        const paginatedInvoices = allInvoices.slice(offset, offset + limit);

        setCustomerInvoices(paginatedInvoices);
        setInvoicePagination({
          page: invoicePage,
          limit: limit,
          total_count: totalCount,
          total_pages: totalPages,
          has_next: invoicePage < totalPages,
          has_prev: invoicePage > 1
        });
      } catch (error) {
        console.error('Error fetching customer invoices:', error);
        setError('Failed to load customer invoices. Please try again.');
      } finally {
        setLoadingInvoices(false);
      }
    };

    fetchCustomerInvoices();
  }, [selectedCustomer, invoicePage, invoiceFilters]);

  const handleFieldChange = (field: string, value: any) => {
    setNoteData(prev => ({ ...prev, [field]: value }));
  };

  const handleInvoiceSelect = async (invoice: any) => {
    setNoteData(prev => ({ ...prev, selected_invoice: invoice }));
    
    // Load invoice items
    setLoadingItems(true);
    try {
      const itemsData = await notesApi.getInvoiceItems(invoice.id);
      
      const transformedItems = itemsData.items?.map((item: any, index: number) => ({
        id: item.invoice_item_id || `item-${index}`,
        product_name: item.product_name,
        hsn_code: item.hsn_code || '',
        quantity: item.quantity || 0,
        rate: parseFloat(item.unit_price || item.rate || 0),
        discount_percent: parseFloat(item.discount_percent || 0),
        total_amount: parseFloat(item.line_total || item.total_amount || 0)
      })) || [];
      
      setNoteItems(transformedItems);
    } catch (error) {
      console.error('Error loading invoice items:', error);
      setError('Failed to load invoice items. Please try again.');
      setNoteItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const updateNoteItem = (itemId: string, field: string, value: any) => {
    setNoteItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const updated = { ...item, [field]: value };
        // Recalculate total when quantity changes
        if (field === 'quantity') {
          updated.total_amount = updated.quantity * updated.rate * (1 - updated.discount_percent / 100);
        }
        return updated;
      }
      return item;
    }));
  };

  const calculateTotals = () => {
    const subtotal = noteItems.reduce((sum, item) => sum + item.total_amount, 0);
    const taxAmount = subtotal * 0.18; // Assuming 18% GST
    const grandTotal = subtotal + taxAmount;
    
    return {
      subtotal,
      taxAmount,
      grandTotal
    };
  };

  // Check if ready to show review page
  const canShowReview = () => {
    const basicFieldsValid = selectedCustomer && noteData.reason && noteData.settlement_type;
    
    if (createWithoutInvoice) {
      // For standalone credit notes, require description and amount
      return basicFieldsValid && 
             noteItems.length > 0 && 
             noteItems[0].product_name.trim() !== '' && 
             noteItems[0].total_amount > 0;
    } else {
      // For invoice-linked credit notes, require items selection
      return basicFieldsValid && noteItems.length > 0;
    }
  };

  // Simple validation for saving
  const canSave = () => {
    return canShowReview(); // Same logic, but called from review page
  };

  const handleSave = async () => {
    if (!canSave()) {
      setError('Please complete all required fields');
      return;
    }

    setSaving(true);
    setError(null);
    
    try {
      const payload = {
        party_id: selectedCustomer.id || selectedCustomer.customer_id || selectedCustomer.party_id,
        note_date: noteData.note_date,
        amount: calculateTotals().grandTotal,
        reason: noteData.reason,
        linked_invoice_id: noteData.selected_invoice?.id,
        notes: noteData.customer_remarks,
        items: noteItems.map(item => ({
          product_name: item.product_name,
          hsn_code: item.hsn_code,
          quantity: item.quantity,
          rate: item.rate,
          total_amount: item.total_amount
        }))
      };

      await notesApi.createCreditNote(payload);
      
      // Success feedback
      if (onClose) onClose();
      
    } catch (error) {
      console.error('Error saving note:', error);
      setError(`Error saving credit note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  if (isLoading) {
    return (
      <div className="h-full bg-green-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading credit note form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col max-w-6xl mx-auto">
        {/* Header - Similar to Sales Flow */}
        <div className="bg-green-50 border-b border-green-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <CreditCard className="w-6 h-6 text-green-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  New Credit Note
                </h1>
                <div className="flex items-center space-x-4 mt-1">
                  <span className="text-lg font-medium text-green-600">
                    Credit Note #{noteData.note_number}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-600">{new Date(noteData.note_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-3 py-2 border border-green-300 rounded-md bg-white text-green-700 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <DatePicker
                label="Note Date"
                value={new Date(noteData.note_date)}
                onChange={(date) => handleFieldChange('note_date', date ? date.toISOString().split('T')[0] : '')}
                size="sm"
                className="w-40"
              />
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+F</strong> - Search Invoice | <strong>Ctrl+S</strong> - Save Draft | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="px-6 py-6">
            
            {/* Error Display */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                    <span className="text-red-800">{error}</span>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-sm text-red-600 hover:text-red-800 underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Credit Note Form or Review Page */}
            {!showReviewPage ? (
              <CreditNoteFormPage
                selectedCustomer={selectedCustomer}
                setSelectedCustomer={setSelectedCustomer}
                noteData={noteData}
                handleFieldChange={handleFieldChange}
                reasonOptions={reasonOptions}
                settlementOptions={settlementOptions}
                createWithoutInvoice={createWithoutInvoice}
                setCreateWithoutInvoice={setCreateWithoutInvoice}
                noteItems={noteItems}
                setNoteItems={setNoteItems}
                updateNoteItem={updateNoteItem}
                customerInvoices={customerInvoices}
                loadingInvoices={loadingInvoices}
                showFilters={showFilters}
                setShowFilters={setShowFilters}
                invoiceFilters={invoiceFilters}
                setInvoiceFilters={setInvoiceFilters}
                setInvoicePage={setInvoicePage}
                invoicePagination={invoicePagination}
                invoicePage={invoicePage}
                handleInvoiceSelect={handleInvoiceSelect}
                loadingItems={loadingItems}
                totals={totals}
              />
            ) : (
              <CreditNoteReviewPage
                selectedCustomer={selectedCustomer}
                noteData={noteData}
                noteItems={noteItems}
                reasonOptions={reasonOptions}
                settlementOptions={settlementOptions}
                totals={totals}
                handleFieldChange={handleFieldChange}
              />
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between space-x-4">
            <div>
              {showReviewPage && (
                <Button
                  variant="ghost"
                  onClick={() => setShowReviewPage(false)}
                >
                  ← Back to Form
                </Button>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="secondary"
                onClick={onClose}
              >
                Cancel
              </Button>
              {showReviewPage ? (
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={saving || !canSave()}
                  loading={saving}
                  icon={saving ? undefined : <Save className="w-4 h-4" />}
                >
                  {saving ? 'Creating...' : 'Create Credit Note'}
                </Button>
              ) : (
                canShowReview() && (
                  <Button
                    variant="primary"
                    onClick={() => setShowReviewPage(true)}
                    className="px-8"
                  >
                    Continue to Review
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditNoteFlow;