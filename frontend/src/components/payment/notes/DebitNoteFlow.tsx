import React, { useState } from 'react';
import {
  Receipt, Save, Calendar, Filter, Calculator, AlertCircle, CheckCircle, Users, FileText, FileInput
} from 'lucide-react';
import { CustomerSearch, Select, Card, DatePicker, Button } from '../../global';
import CustomerCreationB2B from '../../global/creation/CustomerCreationB2B';
import { notesApi, invoicesApi } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

interface DebitNoteFlowProps {
  onClose?: () => void;
  open?: boolean;
}

interface NoteItem {
  id: string;
  product_name: string;
  hsn_code: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  total_amount: number;
}

const DebitNoteFlow: React.FC<DebitNoteFlowProps> = ({ onClose }) => {
  // Remove step-based navigation to match global ERP patterns
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [noteItems, setNoteItems] = useState<NoteItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

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

  const [noteData, setNoteData] = useState({
    note_number: `DR-${Date.now().toString().slice(-6)}`,
    note_date: new Date().toISOString().split('T')[0],
    reason: '',
    settlement_type: '',
    selected_invoice: null as any,
    internal_notes: '',
    customer_remarks: ''
  });

  const reasonOptions = [
    { value: 'undercharge', label: 'Undercharge Correction' },
    { value: 'late_payment', label: 'Late Payment Charges' },
    { value: 'service_charge', label: 'Additional Service Charge' },
    { value: 'price_increase', label: 'Price Increase Adjustment' },
    { value: 'penalty', label: 'Penalty Charges' },
    { value: 'other', label: 'Other' }
  ];

  const settlementOptions = [
    { value: 'add_future', label: 'Add to Future Invoices' },
    { value: 'immediate_payment', label: 'Immediate Payment Required' },
    { value: 'account_debit', label: 'Account Debit Balance' },
    { value: 'bank_transfer', label: 'Bank Transfer/NEFT/RTGS' },
    { value: 'cash_payment', label: 'Cash Payment' },
    { value: 'cheque_payment', label: 'Cheque Payment' },
    { value: 'upi_payment', label: 'UPI/Digital Payment' },
    { value: 'credit_card', label: 'Credit Card Payment' },
    { value: 'offset_receivables', label: 'Offset Against Receivables' },
    { value: 'penalty_charge', label: 'Penalty/Late Fee Charge' },
    { value: 'manual_adjustment', label: 'Manual Journal Adjustment' },
    { value: 'terms_adjustment', label: 'Payment Terms Adjustment' }
  ];

  // Load customer invoices when customer is selected
  React.useEffect(() => {
    const fetchCustomerInvoices = async () => {
      const customerId = selectedCustomer?.id || selectedCustomer?.customer_id || selectedCustomer?.party_id;
      if (!customerId) {
        setCustomerInvoices([]);
        setInvoicePagination(null);
        return;
      }

      setLoadingInvoices(true);
      try {
        // Use invoicesApi to get customer invoices for linking
        const response = await invoicesApi.getAll({ customer_id: customerId, limit: 100 });
        const responseData = (response as any).data || response;

        let allInvoices = (responseData.invoices || responseData.data || responseData || []).map((invoice: any) => ({
          id: invoice.invoice_id || invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          total_amount: parseFloat(invoice.total_amount || invoice.final_amount) || 0,
          outstanding_amount: parseFloat(invoice.total_amount || invoice.final_amount) - parseFloat(invoice.paid_amount || 0),
          status: invoice.payment_status || 'pending',
          items: []
        }));

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

    setLoadingItems(true);
    try {
      const response = await notesApi.getInvoiceItems(invoice.id);
      const data = (response as any).data || response;

      const transformedItems = (data.items || data || []).map((item: any) => ({
        id: item.id || item.item_id,
        product_name: item.product_name || item.name,
        hsn_code: item.hsn_code || item.hsn,
        quantity: parseFloat(item.quantity || 0),
        unit_price: parseFloat(item.unit_price || item.unit_price || 0),
        discount_percent: parseFloat(item.discount_percent || 0),
        total_amount: parseFloat(item.line_total || item.total_amount || 0)
      })) || [];

      setNoteItems(transformedItems);

      // Store invoice items offline for future use
      await offlineStorage.storeOffline(`invoice_items_${invoice.id}`, transformedItems, {
        persistent: true
      });

    } catch (error) {

      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline(`invoice_items_${invoice.id}`, { persistent: true });

      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for invoice items
        setNoteItems(offlineData.data);
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load invoice items. Please check your connection and try again.');
        setNoteItems([]);
      }
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
          updated.total_amount = updated.quantity * updated.unit_price * (1 - updated.discount_percent / 100);
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

  // Simple validation for single-page flow
  const canSave = () => {
    return selectedCustomer && noteData.reason && noteData.settlement_type;
  };

  const handleSave = async () => {
    if (!canSave()) {
      setError('Please complete all required fields');
      return;
    }

    setSaving(true);
    try {
      await notesApi.createCreditDebitNote({
        note_type: 'debit',
        party_id: selectedCustomer.id || selectedCustomer.customer_id || selectedCustomer.party_id,
        party_type: 'customer',
        note_date: noteData.note_date,
        amount: calculateTotals().grandTotal,
        reason: noteData.reason,
        reference_invoice_id: noteData.selected_invoice?.id,
        notes: noteData.customer_remarks,
        items: noteItems.map(item => ({
          description: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.total_amount
        }))
      });

      // Success feedback
      setError(null);
      if (onClose) onClose();

    } catch (error) {
      alert(`Error saving debit note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div className="h-full bg-orange-50">
      <div className="h-full flex flex-col max-w-6xl mx-auto">
        {/* Header - Similar to Sales Flow */}
        <div className="bg-orange-50 border-b border-orange-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Receipt className="w-6 h-6 text-orange-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  New Debit Note
                </h1>
                <div className="flex items-center space-x-4 mt-1">
                  <span className="text-lg font-medium text-orange-600">
                    Debit Note #{noteData.note_number}
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
                type="button"
                className="px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
              >
                <FileInput className="w-4 h-4 text-gray-600" />
                <span className="text-sm">Import from Invoice</span>
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
        <div className="bg-orange-50 px-4 py-2 text-xs text-orange-700 border-b border-orange-200">
          Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+F</strong> - Search Invoice | <strong>Ctrl+S</strong> - Save Draft | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-orange-50">
          <div className="px-6 py-6">

            {/* Error Display */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                  <span className="text-red-800">{error}</span>
                </div>
              </div>
            )}

            {/* Debit Note Form - Single Page Flow */}
            <div className="space-y-6">
              {/* Customer Selection - Standard Pattern */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wider flex items-center">
                    <Users className="w-4 h-4 mr-2" />
                    CUSTOMER
                  </h3>
                  <button
                    onClick={() => setShowCustomerModal(true)}
                    className="min-w-[140px] px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Create Customer
                  </button>
                </div>
                {/* White card wrapper - consistent styling */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <CustomerSearch
                    value={selectedCustomer}
                    onChange={setSelectedCustomer}
                    displayMode="compact"
                    placeholder="Search customer by name, phone, or GST number..."
                    showCreateButton={false}
                    clearable={true}
                  />
                </div>
              </div>

              {/* Note Details */}
              {selectedCustomer && (
                <Card>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Debit Note Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Debit Note</label>
                      <Select
                        value={noteData.reason}
                        onChange={(value) => handleFieldChange('reason', value)}
                        options={reasonOptions}
                        placeholder="Select reason..."
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Settlement Method</label>
                      <Select
                        value={noteData.settlement_type}
                        onChange={(value) => handleFieldChange('settlement_type', value)}
                        options={settlementOptions}
                        placeholder="Select settlement method..."
                        className="w-full"
                      />
                    </div>
                  </div>
                </Card>
              )}

              {/* Invoice Selection & Items - Similar to Credit Note but with orange theme */}
              {selectedCustomer && noteData.reason && noteData.settlement_type && (
                <Card>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Select Invoice
                    </h3>

                    {/* Filters Section - Same as Credit Note */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">Filter Invoices</span>
                      </div>
                      {/* ... Same filter implementation as Credit Note ... */}
                    </div>
                  </div>

                  {/* Invoice List - Same structure but different selection behavior */}
                  {loadingInvoices ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="text-gray-600 mt-2">Loading invoices...</p>
                    </div>
                  ) : (
                    /* ... Same invoice list implementation ... */
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-lg font-medium">Debit Note Implementation</p>
                      <p className="text-sm">Similar to Credit Note but with debit-specific logic</p>
                    </div>
                  )}
                </Card>
              )}
            </div>

            {/* Additional sections when note is configured */}
            {noteData.reason && noteData.settlement_type && (
              <div className="space-y-6">
                <Card>
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">Review Debit Note</h3>
                  <div className="text-center py-8 text-gray-500">
                    <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">Debit Note Review</p>
                    <p className="text-sm">Similar review structure to Credit Note</p>
                  </div>
                </Card>
              </div>
            )}

          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-end space-x-4">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || !selectedCustomer || !noteData.reason || !noteData.settlement_type}
              loading={saving}
              icon={saving ? undefined : <Save className="w-4 h-4" />}
            >
              {saving ? 'Creating...' : 'Create Debit Note'}
            </Button>
          </div>
        </div>
      </div>

      {/* Customer Creation Modal */}
      {showCustomerModal && (
        <CustomerCreationB2B
          onClose={() => setShowCustomerModal(false)}
          onCustomerCreated={(customer) => {
            setSelectedCustomer(customer);
            setShowCustomerModal(false);
            // You can add toast notification here if needed
          }}
        />
      )}
    </div>
  );
};

export default DebitNoteFlow;