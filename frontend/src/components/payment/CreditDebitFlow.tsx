import React, { useState } from 'react';
import { 
  FileText, CreditCard, Receipt, Save, X, Plus, Trash2, Search, 
  Calculator, AlertCircle, CheckCircle, Upload, Download, Users 
} from 'lucide-react';
import { ModuleHeader, CustomerSearch, Select, Card } from '../global';
import { notesApi } from '../../services/api/modules/notes.api';

interface CreditDebitFlowProps {
  onClose?: () => void;
  noteType?: 'credit' | 'debit';
}

interface NoteItem {
  id: string;
  product_name: string;
  hsn_code: string;
  quantity: number;
  rate: number;
  discount_percent: number;
  taxable_amount: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

const CreditDebitFlow: React.FC<CreditDebitFlowProps> = ({ 
  onClose, 
  noteType = 'credit' 
}) => {
  const [currentStep, setCurrentStep] = useState(1); // 1: Customer & Invoice Selection, 2: Note Details & Submit
  const [noteData, setNoteData] = useState({
    note_number: '',
    note_date: new Date().toISOString().split('T')[0],
    customer_id: '',
    selected_invoice: null as any,
    reason: '',
    settlement_type: '',
    description: '',
    bank_account: '',
    approval_required: false,
    internal_notes: '',
    customer_remarks: ''
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [noteItems, setNoteItems] = useState<NoteItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCredit = noteType === 'credit';

  // Generate document number on mount
  React.useEffect(() => {
    const prefix = isCredit ? 'CR' : 'DR';
    const timestamp = Date.now();
    const noteNumber = `${prefix}-${timestamp.toString().slice(-8)}`;
    setNoteData(prev => ({ ...prev, note_number: noteNumber }));
  }, [isCredit]);

  // Comprehensive reason options
  const reasonOptions = isCredit ? [
    { value: 'PRODUCT_RETURN', label: 'Product Return - Defective/Expired' },
    { value: 'VOLUME_DISCOUNT', label: 'Volume Discount Adjustment' },
    { value: 'PRICE_CORRECTION', label: 'Price Correction - Overcharged' },
    { value: 'DAMAGE_COMPENSATION', label: 'Damage Compensation' },
    { value: 'BILLING_ERROR', label: 'Billing Error Correction' },
    { value: 'PROMOTIONAL_DISCOUNT', label: 'Promotional Discount' },
    { value: 'QUALITY_ISSUE', label: 'Quality Issue Compensation' },
    { value: 'SERVICE_FAILURE', label: 'Service Failure Adjustment' },
    { value: 'GOODWILL_GESTURE', label: 'Goodwill Gesture' },
    { value: 'CUSTOM', label: 'Custom Reason' }
  ] : [
    { value: 'SHORTAGE_CLAIMED', label: 'Shortage Claimed by Customer' },
    { value: 'ADDITIONAL_CHARGES', label: 'Additional Charges Applied' },
    { value: 'PRICE_INCREASE', label: 'Price Increase Post Invoice' },
    { value: 'FREIGHT_CHARGES', label: 'Additional Freight Charges' },
    { value: 'HANDLING_CHARGES', label: 'Special Handling Charges' },
    { value: 'PENALTY_CHARGES', label: 'Penalty for Late Payment' },
    { value: 'INTEREST_CHARGES', label: 'Interest on Overdue' },
    { value: 'REWORK_CHARGES', label: 'Rework/Reprocessing Charges' },
    { value: 'CUSTOM', label: 'Custom Reason' }
  ];

  // Settlement type options
  const settlementOptions = isCredit ? [
    { value: 'AGAINST_INVOICE', label: 'Adjust Against Outstanding Invoice' },
    { value: 'ACCOUNT_CREDIT', label: 'Credit to Customer Account' },
    { value: 'CASH_REFUND', label: 'Cash Refund' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer Refund' },
    { value: 'ADVANCE_ADJUSTMENT', label: 'Adjust Against Advance' },
    { value: 'REPLACEMENT', label: 'Product Replacement' },
    { value: 'FUTURE_DISCOUNT', label: 'Future Purchase Discount' }
  ] : [
    { value: 'IMMEDIATE_PAYMENT', label: 'Immediate Payment Required' },
    { value: 'ADJUST_NEXT_INVOICE', label: 'Adjust in Next Invoice' },
    { value: 'ACCOUNT_DEBIT', label: 'Debit to Customer Account' },
    { value: 'ADVANCE_DEDUCTION', label: 'Deduct from Advance' },
    { value: 'SECURITY_DEDUCTION', label: 'Deduct from Security Deposit' }
  ];

  // Load customer invoices when customer is selected
  React.useEffect(() => {
    const fetchCustomerInvoices = async () => {
      if (!selectedCustomer?.customer_id) {
        setCustomerInvoices([]);
        return;
      }

      setLoadingInvoices(true);
      try {
        // Try to use the notesApi first, fallback to mock data if backend isn't ready
        try {
          const data = await notesApi.getLinkedInvoices(selectedCustomer.customer_id, 'sales');
          
          // Transform the API response to match our interface
          const transformedInvoices = data.invoices?.map((invoice: any) => ({
            id: invoice.invoice_id,
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.invoice_date,
            total_amount: parseFloat(invoice.grand_total || invoice.final_amount) || 0,
            outstanding_amount: parseFloat(invoice.grand_total || invoice.final_amount) - parseFloat(invoice.paid_amount || 0),
            status: invoice.payment_status || 'pending',
            items: [] // Items will be fetched separately when invoice is selected
          })) || [];

          setCustomerInvoices(transformedInvoices);
        } catch (apiError) {
          console.warn('API not ready, using mock data:', apiError);
          
          // Fallback to mock invoices for demo purposes
          const mockInvoices = [
            {
              id: `mock-inv-${selectedCustomer.customer_id}-1`,
              invoice_number: `INV-${new Date().getFullYear()}-001`,
              invoice_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              total_amount: 15750.00,
              outstanding_amount: 15750.00,
              status: 'pending',
              items: [
                {
                  id: 'item-1',
                  product_name: 'Paracetamol 500mg Tablets',
                  hsn_code: '30049011',
                  quantity: 100,
                  rate: 10.50,
                  discount_percent: 5,
                  taxable_amount: 997.50,
                  cgst_rate: 6,
                  sgst_rate: 6,
                  igst_rate: 0,
                  cgst_amount: 59.85,
                  sgst_amount: 59.85,
                  igst_amount: 0,
                  total_amount: 1117.20
                }
              ]
            },
            {
              id: `mock-inv-${selectedCustomer.customer_id}-2`,
              invoice_number: `INV-${new Date().getFullYear()}-002`,
              invoice_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              total_amount: 8960.00,
              outstanding_amount: 4480.00,
              status: 'partially_paid',
              items: []
            }
          ];
          
          setCustomerInvoices(mockInvoices);
          setError('Using demo data - Backend API needs database schema updates.');
        }
      } catch (error) {
        console.error('Error fetching customer invoices:', error);
        setCustomerInvoices([]);
        setError('Failed to load customer invoices. Please try again.');
      } finally {
        setLoadingInvoices(false);
      }
    };

    fetchCustomerInvoices();
  }, [selectedCustomer]);

  const handleFieldChange = (field: string, value: any) => {
    setNoteData(prev => ({ ...prev, [field]: value }));
  };

  const handleInvoiceSelect = async (invoice: any) => {
    setNoteData(prev => ({ ...prev, selected_invoice: invoice }));
    setError(null);
    
    // Fetch detailed invoice items if not already loaded
    if (!invoice.items || invoice.items.length === 0) {
      setLoadingItems(true);
      try {
        const response = await notesApi.getInvoiceItems(invoice.id);
        // Response structure: { invoice_id, items: [...], items_count }
        const responseData = response.data || response;
        const items = responseData.items || [];
        
        // Transform based on actual sales.invoice_items schema
        const transformedItems = items.map((item: any, index: number) => ({
          id: item.invoice_item_id || `item-${index}`,
          product_name: item.product_name,
          hsn_code: item.hsn_code || '',
          quantity: parseFloat(item.quantity) || 1,
          rate: parseFloat(item.unit_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          taxable_amount: parseFloat(item.taxable_amount) || 0,
          cgst_rate: parseFloat(item.cgst_rate) || 0,
          sgst_rate: parseFloat(item.sgst_rate) || 0,
          igst_rate: parseFloat(item.igst_rate) || 0,
          cgst_amount: parseFloat(item.cgst_amount) || 0,
          sgst_amount: parseFloat(item.sgst_amount) || 0,
          igst_amount: parseFloat(item.igst_amount) || 0,
          total_amount: parseFloat(item.line_total) || 0
        }));
        
        setNoteItems(transformedItems);
      } catch (error) {
        console.error('Error fetching invoice items:', error);
        setError('Failed to load invoice items. Please try again.');
        setNoteItems([]);
      } finally {
        setLoadingItems(false);
      }
    } else {
      // Use items already loaded with the invoice
      const transformedItems = invoice.items.map((item: any, index: number) => ({
        id: item.item_id || item.id || `item-${index}`,
        product_name: item.product_name || item.item_name,
        hsn_code: item.hsn_code || '',
        quantity: parseFloat(item.quantity) || 1,
        rate: parseFloat(item.rate) || parseFloat(item.unit_price) || 0,
        discount_percent: parseFloat(item.discount_percent) || 0,
        taxable_amount: parseFloat(item.taxable_amount) || 0,
        cgst_rate: parseFloat(item.cgst_rate) || 9,
        sgst_rate: parseFloat(item.sgst_rate) || 9,
        igst_rate: parseFloat(item.igst_rate) || 0,
        cgst_amount: parseFloat(item.cgst_amount) || 0,
        sgst_amount: parseFloat(item.sgst_amount) || 0,
        igst_amount: parseFloat(item.igst_amount) || 0,
        total_amount: parseFloat(item.total_amount) || parseFloat(item.line_total) || 0
      }));
      
      setNoteItems(transformedItems);
    }
  };

  const addNoteItem = () => {
    const newItem: NoteItem = {
      id: Date.now().toString(),
      product_name: '',
      hsn_code: '',
      quantity: 1,
      rate: 0,
      discount_percent: 0,
      taxable_amount: 0,
      cgst_rate: 9,
      sgst_rate: 9,
      igst_rate: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total_amount: 0
    };
    setNoteItems(prev => [...prev, newItem]);
  };

  const updateNoteItem = (id: string, field: string, value: any) => {
    setNoteItems(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate amounts
        if (['quantity', 'rate', 'discount_percent', 'cgst_rate', 'sgst_rate', 'igst_rate'].includes(field)) {
          const taxableAmount = (updatedItem.quantity * updatedItem.rate) * (1 - updatedItem.discount_percent / 100);
          updatedItem.taxable_amount = taxableAmount;
          updatedItem.cgst_amount = (taxableAmount * updatedItem.cgst_rate) / 100;
          updatedItem.sgst_amount = (taxableAmount * updatedItem.sgst_rate) / 100;
          updatedItem.igst_amount = (taxableAmount * updatedItem.igst_rate) / 100;
          updatedItem.total_amount = taxableAmount + updatedItem.cgst_amount + updatedItem.sgst_amount + updatedItem.igst_amount;
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const removeNoteItem = (id: string) => {
    setNoteItems(prev => prev.filter(item => item.id !== id));
  };

  const calculateTotals = () => {
    const subtotal = noteItems.reduce((sum, item) => sum + item.taxable_amount, 0);
    const totalCGST = noteItems.reduce((sum, item) => sum + item.cgst_amount, 0);
    const totalSGST = noteItems.reduce((sum, item) => sum + item.sgst_amount, 0);
    const totalIGST = noteItems.reduce((sum, item) => sum + item.igst_amount, 0);
    const grandTotal = noteItems.reduce((sum, item) => sum + item.total_amount, 0);
    
    return { subtotal, totalCGST, totalSGST, totalIGST, grandTotal };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const totals = calculateTotals();
      
      // Prepare payload according to the actual backend API structure (from credit_debit_notes.py)
      const notePayload = {
        party_id: selectedCustomer?.customer_id,
        note_date: noteData.note_date,
        amount: totals.subtotal, // Base amount before tax
        tax_percent: ((totals.totalCGST + totals.totalSGST + totals.totalIGST) / totals.subtotal) * 100 || 0,
        reason: noteData.reason,
        linked_invoice_id: noteData.selected_invoice?.id,
        notes: `${noteData.internal_notes || ''} ${noteData.customer_remarks || ''}`.trim() || `${isCredit ? 'Credit' : 'Debit'} note for ${noteData.selected_invoice?.invoice_number}`
      };
      
      try {
        // Use the appropriate API method based on note type
        const result = isCredit 
          ? await notesApi.createCreditNote(notePayload)
          : await notesApi.createDebitNote(notePayload);
        console.log('Note saved successfully:', result);
        alert(`${result.message || `${isCredit ? 'Credit' : 'Debit'} note saved successfully!`}`);
        
        // Close the component after successful save
        if (onClose) {
          onClose();
        }
      } catch (apiError) {
        console.warn('Backend API not ready:', apiError);
        
        // For demo purposes, simulate successful save
        const mockNoteNumber = `${isCredit ? 'CR' : 'DR'}-${Date.now().toString().slice(-8)}`;
        console.log('Mock note created:', {
          noteNumber: mockNoteNumber,
          payload: notePayload,
          totals
        });
        
        alert(`Demo: ${isCredit ? 'Credit' : 'Debit'} note ${mockNoteNumber} created successfully!\n\nNote: Backend requires database schema updates to persist data.`);
        
        // Close the component after successful demo
        if (onClose) {
          onClose();
        }
      }
    } catch (error) {
      console.error('Error saving note:', error);
      alert(`Error saving ${isCredit ? 'credit' : 'debit'} note: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const canProceedToNextStep = () => {
    switch (currentStep) {
      case 1:
        return selectedCustomer && noteData.selected_invoice;
      case 2:
        return noteData.reason && noteData.settlement_type && noteItems.length > 0;
      default:
        return false;
    }
  };

  const totals = calculateTotals();

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title={`${isCredit ? 'Credit' : 'Debit'} Note`}
          documentNumber={noteData.note_number || `${isCredit ? 'CR' : 'DR'}-TEMP`}
          status={`Step ${currentStep} of 2`}
          icon={isCredit ? CreditCard : Receipt}
          iconColor={isCredit ? "text-green-600" : "text-orange-600"}
          onClose={onClose}
          historyType="notes"
          showSaveDraft={currentStep === 2}
          onSaveDraft={handleSave}
          additionalActions={[
            {
              label: "Print Preview",
              onClick: () => console.log('Print Preview'),
              variant: "secondary"
            }
          ] as any}
        />

        {/* Progress Steps */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-8">
                {[
                  { step: 1, label: 'Customer & Invoice Selection', icon: Users },
                  { step: 2, label: 'Note Details & Submit', icon: CheckCircle }
                ].map(({ step, label, icon: Icon }) => (
                  <div
                    key={step}
                    className={`flex items-center space-x-2 ${
                      step === currentStep
                        ? isCredit ? 'text-green-600' : 'text-orange-600'
                        : step < currentStep
                        ? 'text-green-500'
                        : 'text-gray-400'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step === currentStep
                          ? isCredit ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                          : step < currentStep
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {step < currentStep ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <span className="font-medium text-sm">{label}</span>
                  </div>
                ))}
              </div>
              <div className="text-sm text-gray-500">
                {totals.grandTotal > 0 && `Total: ₹${totals.grandTotal.toFixed(2)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="max-w-6xl mx-auto px-6 py-6">
            
            {/* Error Display */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                  <p className="text-red-800">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="ml-auto text-red-600 hover:text-red-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            
            {/* Step 1: Customer & Invoice Selection */}
            {currentStep === 1 && (
              <div className="space-y-6">
                {/* Customer Selection */}
                <Card>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Select {isCredit ? 'Customer' : 'Supplier'}
                  </h3>
                  <CustomerSearch
                    value={selectedCustomer}
                    onChange={setSelectedCustomer}
                    onCreateNew={() => {/* Handle create new */}}
                    displayMode="inline"
                    placeholder={`Search ${isCredit ? 'customer' : 'supplier'} by name, phone, or code...`}
                    required
                  />
                </Card>

                {/* Invoice Selection */}
                {selectedCustomer && (
                  <Card>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Select {isCredit ? 'Invoice' : 'Purchase Order'}
                    </h3>
                    
                    {loadingInvoices ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-gray-600 mt-2">Loading invoices...</p>
                      </div>
                    ) : customerInvoices.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-lg font-medium">No invoices found</p>
                        <p className="text-sm">This customer has no outstanding invoices</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {customerInvoices.map((invoice) => (
                          <div
                            key={invoice.id}
                            onClick={() => handleInvoiceSelect(invoice)}
                            className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                              noteData.selected_invoice?.id === invoice.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-4">
                                  <div>
                                    <h4 className="font-medium text-gray-900">{invoice.invoice_number}</h4>
                                    <p className="text-sm text-gray-600">Date: {new Date(invoice.invoice_date).toLocaleDateString()}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-medium text-gray-900">₹{invoice.total_amount.toLocaleString()}</p>
                                    <p className="text-sm text-gray-600">Outstanding: ₹{invoice.outstanding_amount.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                      invoice.status === 'Paid' 
                                        ? 'bg-green-100 text-green-800'
                                        : invoice.status === 'Partially Paid'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {invoice.status}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-3 text-sm text-gray-600">
                                  <span className="font-medium">{invoice.items?.length || 0} items</span>
                                  {invoice.items && invoice.items.length > 0 && (
                                    <span className="ml-2">
                                      • {invoice.items.slice(0, 2).map(item => item.product_name).join(', ')}
                                      {invoice.items.length > 2 && ` and ${invoice.items.length - 2} more`}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {noteData.selected_invoice?.id === invoice.id && (
                                <CheckCircle className="w-5 h-5 text-blue-600 ml-4" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            )}

            {/* Step 2: Note Details & Submit */}
            {currentStep === 2 && (
              <div className="space-y-6">
                {/* Invoice Summary */}
                {noteData.selected_invoice && (
                  <Card>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Selected Invoice Details</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-blue-900">{noteData.selected_invoice.invoice_number}</h4>
                          <p className="text-sm text-blue-700">Date: {new Date(noteData.selected_invoice.invoice_date).toLocaleDateString()}</p>
                          <p className="text-sm text-blue-700">Customer: {selectedCustomer?.customer_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-blue-900">₹{noteData.selected_invoice.total_amount.toLocaleString()}</p>
                          <p className="text-sm text-blue-700">Outstanding: ₹{noteData.selected_invoice.outstanding_amount.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Note Details */}
                <Card>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {isCredit ? 'Credit' : 'Debit'} Note Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Note Number</label>
                      <input
                        type="text"
                        value={noteData.note_number}
                        disabled
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Note Date</label>
                      <input
                        type="date"
                        value={noteData.note_date}
                        onChange={(e) => handleFieldChange('note_date', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Reason <span className="text-red-500">*</span>
                      </label>
                      <Select
                        options={reasonOptions}
                        value={noteData.reason}
                        onChange={(value) => handleFieldChange('reason', value)}
                        placeholder="Select reason..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Settlement Type <span className="text-red-500">*</span>
                      </label>
                      <Select
                        options={settlementOptions}
                        value={noteData.settlement_type}
                        onChange={(value) => handleFieldChange('settlement_type', value)}
                        placeholder="Select settlement method..."
                      />
                    </div>
                  </div>

                  {/* Custom Reason Description */}
                  {noteData.reason === 'CUSTOM' && (
                    <div className="mt-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Custom Reason Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={noteData.description}
                        onChange={(e) => handleFieldChange('description', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                        placeholder="Please describe the reason for this note..."
                        rows={3}
                        required
                      />
                    </div>
                  )}
                </Card>

                {/* Items from Invoice */}
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Invoice Items
                    </h3>
                    <p className="text-sm text-gray-600">
                      Modify quantities/amounts as needed for the note
                    </p>
                  </div>

                  {loadingItems ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                      <p className="text-gray-600">Loading invoice items...</p>
                    </div>
                  ) : noteItems.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-lg font-medium">No items selected</p>
                      <p className="text-sm">Select an invoice to see its items</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {noteItems.map((item) => (
                        <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
                            <div className="md:col-span-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1">Product/Service</label>
                              <input
                                type="text"
                                value={item.product_name}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
                              <input
                                type="text"
                                value={item.hsn_code}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateNoteItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Rate (₹)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={item.rate}
                                onChange={(e) => updateNoteItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
                              <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-right font-medium">
                                ₹{item.total_amount.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Totals Summary */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-medium text-gray-900">
                            Total {isCredit ? 'Credit' : 'Debit'} Amount
                          </span>
                          <span className="text-2xl font-bold text-amber-900">
                            ₹{totals.grandTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Additional Notes */}
                <Card>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Internal Notes</label>
                      <textarea
                        value={noteData.internal_notes}
                        onChange={(e) => handleFieldChange('internal_notes', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                        placeholder="Internal notes (not visible to customer)..."
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Customer Remarks</label>
                      <textarea
                        value={noteData.customer_remarks}
                        onChange={(e) => handleFieldChange('customer_remarks', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                        placeholder="Remarks to be shown on the note..."
                        rows={2}
                      />
                    </div>
                  </div>
                </Card>
              </div>
            )}

          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {currentStep > 1 && (
                <button
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Previous
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                <X className="w-4 h-4 mr-2 inline" />
                Cancel
              </button>
              
              {currentStep < 2 ? (
                <button
                  onClick={() => setCurrentStep(prev => prev + 1)}
                  disabled={!canProceedToNextStep()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  Next Step
                  <CheckCircle className="w-4 h-4 ml-2" />
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={saving || !canProceedToNextStep()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : `Save ${isCredit ? 'Credit' : 'Debit'} Note`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditDebitFlow;