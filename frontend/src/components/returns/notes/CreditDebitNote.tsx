import React, { useState, useEffect } from 'react';
import {
  FileText, CreditCard, Receipt, CheckCircle, User, Package, Plus
} from 'lucide-react';
import {
  Button,
  Card,
  Select,
  CustomerSearch,
  InvoiceSearch,
  useToast,
  ModuleHeader,
  ProceedToReviewComponent,
  StandardDatePicker
} from '../../global';
import { useDocumentSave } from '../../global/hooks/useDocumentSave';
import { notesApi } from '../../../services/api';
import { invoicesApi } from '../../../services/api';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { DOC_TYPES, documentNumberGenerator } from '../../../services/offline';
import EnterpriseCalculator from '../../../services/enterpriseCalculator';
import { showFinancialEntryNotification } from '../../../utils/financialEntryNotifier';

interface CreditDebitNoteSimpleProps {
  noteType?: 'credit' | 'debit';
  onClose?: () => void;
}

interface NoteItem {
  id?: string;
  product_id: string;
  product_name: string;
  batch_number?: string;
  quantity: number;
  original_quantity?: number;
  max_quantity?: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  amount: number;
  selected?: boolean;
}

interface NoteData {
  note_number?: string;
  note_date: string;
  customer_id: string;
  customer_name?: string;
  invoice_id: string;
  invoice_number?: string;
  invoice_date?: string;
  reason: string;
  items: NoteItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string;
  status?: string;
}

const CreditDebitNoteSimple: React.FC<CreditDebitNoteSimpleProps> = ({
  noteType = 'credit',
  onClose
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const { isOnline } = useNetworkStatus();

  const [noteData, setNoteData] = useState<NoteData>({
    note_date: new Date().toISOString().split('T')[0],
    customer_id: '',
    invoice_id: '',
    reason: '',
    items: [],
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    notes: '',
    status: 'PENDING'
  });

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  const isCredit = noteType === 'credit';
  const themeColor = isCredit ? 'green' : 'orange';

  // Generate note number
  const generateNoteNumber = async () => {
    return documentNumberGenerator.generateNumber(
      isCredit ? DOC_TYPES.CREDIT_NOTE : DOC_TYPES.DEBIT_NOTE,
      false
    );
  };

  useEffect(() => {
    const loadNoteNumber = async () => {
      const nextNumber = await generateNoteNumber();
      setNoteData(prev => ({
        ...prev,
        note_number: nextNumber
      }));
    };

    void loadNoteNumber();
  }, [isCredit]);

  // Reason options
  const reasonOptions = isCredit ? [
    { value: 'RETURN', label: 'Product Return' },
    { value: 'DISCOUNT', label: 'Additional Discount' },
    { value: 'DAMAGE_COMPENSATION', label: 'Damage Compensation' },
    { value: 'PRICE_ADJUSTMENT', label: 'Price Adjustment' },
    { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
    { value: 'OTHER', label: 'Other' }
  ] : [
    { value: 'SHORTAGE', label: 'Shortage in Delivery' },
    { value: 'DAMAGE', label: 'Damaged Goods' },
    { value: 'PRICE_INCREASE', label: 'Price Increase' },
    { value: 'ADDITIONAL_CHARGES', label: 'Additional Charges' },
    { value: 'OTHER', label: 'Other' }
  ];

  // Handle customer selection
  const handleCustomerSelect = (customer: any) => {
    setSelectedCustomer(customer);
    setNoteData(prev => ({
      ...prev,
      customer_id: customer?.id || customer?.customer_id || '',
      customer_name: customer?.name || customer?.customer_name || ''
    }));
    // Clear invoice selection when customer changes
    setSelectedInvoice(null);
    setNoteData(prev => ({
      ...prev,
      invoice_id: '',
      items: []
    }));
  };

  // Handle invoice selection
  const handleInvoiceSelect = async (invoice: any) => {
    if (!invoice) return;

    setSelectedInvoice(invoice);
    setNoteData(prev => ({
      ...prev,
      invoice_id: invoice.id || invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date
    }));

    // Load invoice items
    try {
      setLoading(true);
      let fullInvoice;

      // Check if items are already loaded
      if (invoice.items && invoice.items.length > 0) {
        fullInvoice = { data: invoice };
      } else {
        // Load full invoice details
        const response = await invoicesApi.getById(invoice.id || invoice.invoice_id);
        fullInvoice = { data: response?.data || response };
        if (!fullInvoice.data) {
          throw new Error('Failed to load invoice details');
        }
      }

      if (fullInvoice?.data?.items) {
        const items = fullInvoice.data.items.map((item: any) => {
          const quantity = parseFloat(item.quantity || 0);
          const unit_price = parseFloat(item.unit_price || item.unit_price || 0);
          const discount = parseFloat(item.discount_percent || 0);
          const calculatedItem = EnterpriseCalculator.calculateItem(item);
          const gstPercent = calculatedItem.gst_percent || calculatedItem.tax_percent || 0;
          const totalAmount = calculatedItem.total_amount || 0;

          return {
            id: item.id || item.invoice_item_id,
            product_id: item.product_id,
            product_name: item.product_name || item.item_name,
            batch_number: item.batch_number || item.batch_number,
            quantity: quantity,
            original_quantity: quantity,
            unit_price: unit_price,
            discount_percent: discount,
            tax_percent: gstPercent,
            amount: totalAmount,
            selected: true,
            max_quantity: quantity
          };
        });

        setNoteData(prev => ({
          ...prev,
          items: items
        }));

        calculateTotals(items);
      }
    } catch (error) {
      toast.error('Failed to load invoice items');
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const calculateTotals = (items: NoteItem[]) => {
    const calculation = EnterpriseCalculator.calculateNoteTotals(items, {
      selected_only: true,
      quantity_field: 'quantity',
      round_final_amount: false
    });
    const totals = calculation.totals;

    setNoteData(prev => ({
      ...prev,
      subtotal: totals.subtotal_amount || totals.subtotal || 0,
      tax_amount: totals.tax_amount || totals.total_tax_amount || 0,
      total_amount: totals.total_amount || totals.final_amount || 0
    }));
  };

  // Update item quantity
  const updateItemQuantity = (index: number, newQuantity: number) => {
    const updatedItems = [...noteData.items];
    const item = updatedItems[index];

    // Ensure quantity doesn't exceed original
    const maxQty = item.max_quantity || item.original_quantity || item.quantity;
    item.quantity = Math.min(Math.max(0, newQuantity), maxQty);

    // Recalculate amount for this item
    item.amount = EnterpriseCalculator.calculateReturnLine(item, {
      include_gst: true,
      quantity_field: 'quantity'
    }).total_amount;

    setNoteData(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Toggle item selection
  const toggleItemSelection = (index: number) => {
    const updatedItems = [...noteData.items];
    updatedItems[index].selected = !updatedItems[index].selected;
    setNoteData(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Validation
  const canProceedToReview = () => {
    return !!selectedCustomer &&
      !!noteData.invoice_id &&
      !!noteData.reason &&
      noteData.items.filter(item => item.selected).length > 0;
  };

  const { saving, handleSave: handleSaveNote } = useDocumentSave({
    docTypeKey: isCredit ? DOC_TYPES.CREDIT_NOTE : DOC_TYPES.DEBIT_NOTE,
    idbStoreName: 'credit_debit_notes',
    entityType: 'credit_debit_notes',
    serverIdField: 'note_id',
    docNumberField: 'note_number',
    isOnline,

    validate: () => {
      if (!canProceedToReview()) return 'Please complete all required fields';
      return null;
    },

    getDocNumber: async () => noteData.note_number || generateNoteNumber(),

    preparePayload: () => {
      const selectedItems = noteData.items.filter(item => item.selected);
      return {
        note_type: noteType,
        party_type: 'customer',
        party_id: parseInt(String(noteData.customer_id)),
        note_date: noteData.note_date,
        amount: noteData.total_amount,
        reason: noteData.reason,
        reference_invoice_id: noteData.invoice_id ? parseInt(String(noteData.invoice_id)) : undefined,
        notes: noteData.notes || '',
        items: selectedItems.map(item => ({
          product_id: item.product_id ? parseInt(String(item.product_id)) : undefined,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
          gst_percent: item.tax_percent,
          line_total: item.amount
        }))
      };
    },

    apiCall: (data: any) => notesApi.create(data),

    onSuccess: (_tempId: string, docNo: string) => {
      setNoteData(prev => ({ ...prev, note_number: docNo }));
      toast.success(`${isCredit ? 'Credit' : 'Debit'} note saved${isOnline ? '' : ' offline'}`);
      if (onClose) onClose();
    },

    onServerSuccess: (response: any, _tempId: string, docNo: string, payload: any) => {
      showFinancialEntryNotification({
        title: `${isCredit ? 'Credit' : 'Debit'} Note Posted`,
        reference: response?.data?.note_number || docNo,
        amount: payload.amount,
        status: 'confirmed',
        impacts: [
          `${isCredit ? 'Credit' : 'Debit'} note is committed to the backend ledger.`,
          'Party outstanding balances are adjusted against the selected document.',
          'Tax-adjusted values are available for downstream reconciliation and reporting.'
        ]
      });
    },

    onSyncQueued: (_tempId: string, docNo: string, payload: any) => {
      showFinancialEntryNotification({
        title: `${isCredit ? 'Credit' : 'Debit'} Note Saved Locally`,
        reference: docNo,
        amount: payload.amount,
        status: 'queued',
        impacts: [
          'The note is stored locally and queued for backend posting.',
          'Visible document history will fully reconcile after sync succeeds.',
          'Final ledger and GST confirmation will appear after sync.'
        ]
      });
    }
  });

  // Handle submit
  const handleSubmit = async () => {
    await handleSaveNote();
  };

  // Step 1: Create Note
  const createContent = (
    <div className="space-y-6">
      {/* Date Section */}
      <div className="grid grid-cols-2 gap-4">
        <StandardDatePicker
          label="Note Date"
          value={noteData.note_date}
          onChange={(value) => setNoteData(prev => ({ ...prev, note_date: value }))}
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Reason *</label>
          <Select
            options={reasonOptions}
            value={noteData.reason}
            onChange={(reason) => setNoteData(prev => ({ ...prev, reason: reason as string }))}
            placeholder="Select reason..."
          />
        </div>
      </div>

      {/* Customer Section - Standard Pattern */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold text-${themeColor}-700 uppercase tracking-wider flex items-center`}>
            <User className="w-4 h-4 mr-2" />
            CUSTOMER *
          </h3>
        </div>
        {/* White card wrapper - consistent styling */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <CustomerSearch
            value={selectedCustomer}
            onChange={handleCustomerSelect as any}
            displayMode="compact"
            placeholder="Search customer by name, phone or ID..."
            showCreateButton={false}
            clearable={true}
          />
        </div>
      </div>

      {/* Invoice Selection */}
      {selectedCustomer && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold text-${themeColor}-700 uppercase tracking-wider flex items-center`}>
              <FileText className="w-4 h-4 mr-2" />
              SELECT INVOICE *
            </h3>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {selectedInvoice ? (
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <div>
                  <p className="font-medium text-gray-900">{selectedInvoice.invoice_number}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(selectedInvoice.invoice_date).toLocaleDateString('en-IN')} •
                    ₹{selectedInvoice.final_amount?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <button
                  onClick={() => setShowInvoiceModal(true)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Change
                </button>
              </div>
            ) : (
              <InvoiceSearch
                onSelect={handleInvoiceSelect}
                customerId={selectedCustomer?.customer_id || selectedCustomer?.id}
                placeholder="Search invoice by number..."
                autoFocus={false}
              />
            )}
          </div>
        </div>
      )}

      {/* Invoice search now inline above - no modal needed */}

      {/* Items Section */}
      {noteData.items.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold text-${themeColor}-700 uppercase tracking-wider flex items-center`}>
              <Package className="w-4 h-4 mr-2" />
              SELECT ITEMS FOR {isCredit ? 'CREDIT' : 'DEBIT'} NOTE
            </h3>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading invoice items...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {noteData.items.map((item, index) => (
                  <div
                    key={index}
                    className={`p-4 border rounded-lg ${item.selected ? `border-${themeColor}-200 bg-${themeColor}-50` : 'border-gray-200 bg-gray-50'
                      }`}
                  >
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItemSelection(index)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{item.product_name}</p>
                        {item.batch_number && (
                          <p className="text-sm text-gray-500">Batch: {item.batch_number}</p>
                        )}
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <label className="text-xs text-gray-500">Quantity</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(index, parseFloat(e.target.value) || 0)}
                              min={0}
                              max={item.max_quantity}
                              disabled={!item.selected}
                              className="w-full mt-1 px-2 py-1 border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Rate</label>
                            <p className="mt-1 font-medium">₹{item.unit_price.toFixed(2)}</p>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Tax %</label>
                            <p className="mt-1 font-medium">{item.tax_percent}%</p>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Amount</label>
                            <p className={`mt-1 font-medium text-${themeColor}-600`}>
                              ₹{item.amount.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">Additional Notes</label>
        <textarea
          value={noteData.notes}
          onChange={(e) => setNoteData(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg h-20 resize-none"
          placeholder="Additional notes..."
          rows={3}
        />
      </div>
    </div>
  );

  // Step 2: Review
  const reviewContent = (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className={`bg-${themeColor}-50 border border-${themeColor}-200 rounded-lg p-6`}>
        <h3 className={`text-lg font-semibold text-${themeColor}-900 mb-4`}>
          {isCredit ? 'Credit' : 'Debit'} Note Summary
        </h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className={`text-sm text-${themeColor}-700`}>Note Number</p>
            <p className="font-semibold">{noteData.note_number}</p>
          </div>
          <div>
            <p className={`text-sm text-${themeColor}-700`}>Note Date</p>
            <p className="font-semibold">{new Date(noteData.note_date).toLocaleDateString('en-IN')}</p>
          </div>
          <div>
            <p className={`text-sm text-${themeColor}-700`}>Customer</p>
            <p className="font-semibold">{selectedCustomer?.customer_name || selectedCustomer?.name}</p>
          </div>
          <div>
            <p className={`text-sm text-${themeColor}-700`}>Invoice</p>
            <p className="font-semibold">{noteData.invoice_number}</p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-medium">₹{noteData.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax Amount:</span>
            <span className="font-medium">₹{noteData.tax_amount.toFixed(2)}</span>
          </div>
          <div className={`flex justify-between text-lg font-bold text-${themeColor}-700 pt-2 border-t`}>
            <span>Total {isCredit ? 'Credit' : 'Debit'} Amount:</span>
            <span>₹{noteData.total_amount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Selected Items */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="font-semibold mb-3">Selected Items ({noteData.items.filter(i => i.selected).length})</h4>
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Item</th>
              <th className="text-center py-2">Qty</th>
              <th className="text-right py-2">Rate</th>
              <th className="text-right py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {noteData.items.filter(i => i.selected).map((item, index) => (
              <tr key={index} className="border-b">
                <td className="py-2">{item.product_name}</td>
                <td className="text-center py-2">{item.quantity}</td>
                <td className="text-right py-2">₹{item.unit_price.toFixed(2)}</td>
                <td className="text-right py-2 font-medium">₹{item.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info Notice */}
      <div className={`p-4 rounded-lg ${isCredit ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
        <p className={`text-sm font-medium ${isCredit ? 'text-green-800' : 'text-orange-800'}`}>
          <CheckCircle className="w-4 h-4 inline mr-2" />
          {isCredit
            ? 'This amount will be credited to customer account'
            : 'This amount will be added to customer dues'
          }
        </p>
      </div>
    </div>
  );

  return (
    <div className={`h-full bg-${themeColor}-50`}>
      <div className="h-full flex flex-col">
        {/* Header - Using Global ModuleHeader for Consistency */}
        <ModuleHeader
          title={`${isCredit ? 'Credit' : 'Debit'} Note`}
          documentNumber={noteData.note_number || ''}
          status={currentStep === 1 ? 'draft' : 'review'}
          icon={isCredit ? CreditCard : Receipt}
          iconColor={`text-${themeColor}-600`}
          onClose={onClose}
          historyType={isCredit ? 'credit_note' : 'debit_note'}
        />

        {/* Keyboard Shortcuts Help */}
        <div className={`bg-${themeColor}-50 px-4 py-2 text-xs text-${themeColor}-700 border-b border-${themeColor}-200`}>
          Keyboard shortcuts: <strong>Ctrl+S</strong> - {currentStep === 1 ? 'Proceed to Review' : 'Save'} | <strong>Esc</strong> - {currentStep === 2 ? 'Back to Edit' : 'Close'}
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto bg-${themeColor}-50`}>
          <div className="max-w-6xl mx-auto px-6 py-6">
            {currentStep === 1 ? createContent : reviewContent}
          </div>
        </div>

        {/* Footer - Using Global Component for Consistency */}
        <ProceedToReviewComponent
          currentStep={currentStep}
          canProceed={currentStep === 1 ? canProceedToReview() : true}
          onBack={currentStep === 2 ? () => setCurrentStep(1) : undefined}
          onProceed={currentStep === 1 ? () => setCurrentStep(2) : handleSubmit}
          onReset={() => {
            void generateNoteNumber().then((nextNumber) => {
              setNoteData({
                note_number: nextNumber,
                note_date: new Date().toISOString().split('T')[0],
                customer_id: '',
                invoice_id: '',
                reason: '',
                items: [],
                subtotal: 0,
                tax_amount: 0,
                total_amount: 0,
                notes: '',
                status: 'PENDING'
              });
            });
            setSelectedCustomer(null);
            setSelectedInvoice(null);
          }}
          totalItems={noteData.items.filter(i => i.selected).length}
          totalAmount={noteData.total_amount}
          proceedText={currentStep === 1 ? 'Proceed to Review' : `Create ${isCredit ? 'Credit' : 'Debit'} Note`}
          saving={saving}
        />
      </div>
    </div>
  );
};

export default CreditDebitNoteSimple;
