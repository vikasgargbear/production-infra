import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Plus, CreditCard, Receipt, CheckCircle, AlertTriangle, ArrowLeft,
  Search, Calendar, Save, Printer, X, Edit2, Trash2
} from 'lucide-react';
import {
  Button,
  Card,
  CardSection,
  Select,
  DatePicker,
  DataTable,
  SummaryCard,
  CustomerSearch,
  InvoiceSelector,
  useToast,
  NotesSection
} from '../../global';
import { theme, classes } from '../../../config/theme.config';
import { notesApi } from '../../../services/api';
import { invoicesApi } from '../../../services/api';

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
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

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
  const [showItemsSection, setShowItemsSection] = useState(false);

  const isCredit = noteType === 'credit';

  // Generate note number
  const generateNoteNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${isCredit ? 'CN' : 'DN'}-${dateStr}${randomNum}`;
  };

  useEffect(() => {
    setNoteData(prev => ({
      ...prev,
      note_number: generateNoteNumber()
    }));
  }, []);

  // Tab configuration
  const tabs = [
    {
      id: 'create',
      label: `Create ${isCredit ? 'Credit' : 'Debit'} Note`,
      icon: Plus
    },
    {
      id: 'list',
      label: `${isCredit ? 'Credit' : 'Debit'} Notes List`,
      icon: FileText
    }
  ];

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
      customer_id: customer.id || customer.customer_id,
      customer_name: customer.name || customer.customer_name
    }));
  };

  // Handle invoice selection from InvoiceSelector
  const handleInvoiceSelect = async (invoice: any) => {
    if (!invoice) return;

    setSelectedInvoice(invoice);
    setNoteData(prev => ({
      ...prev,
      invoice_id: invoice.id || invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date
    }));

    setShowItemsSection(true);

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
          const gstPercent = (item.cgst_rate || 0) + (item.sgst_rate || 0) + (item.igst_rate || 0) || item.tax_percent || 0;
          const quantity = parseFloat(item.quantity || 0);
          const unit_price = parseFloat(item.unit_price || item.unit_price || 0);
          const discount = parseFloat(item.discount_percent || 0);

          // Calculate amount
          const baseAmount = quantity * unit_price;
          const discountAmount = baseAmount * (discount / 100);
          const taxableAmount = baseAmount - discountAmount;
          const taxAmount = taxableAmount * (gstPercent / 100);
          const totalAmount = taxableAmount + taxAmount;

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
    let subtotal = 0;
    let taxTotal = 0;

    items.filter(item => item.selected).forEach(item => {
      const baseAmount = item.quantity * item.unit_price;
      const discountAmount = baseAmount * (item.discount_percent / 100);
      const taxableAmount = baseAmount - discountAmount;
      const taxAmount = taxableAmount * (item.tax_percent / 100);

      subtotal += taxableAmount;
      taxTotal += taxAmount;
    });

    const total = subtotal + taxTotal;

    setNoteData(prev => ({
      ...prev,
      subtotal: Math.round(subtotal * 100) / 100,
      tax_amount: Math.round(taxTotal * 100) / 100,
      total_amount: Math.round(total * 100) / 100
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
    const baseAmount = item.quantity * item.unit_price;
    const discountAmount = baseAmount * (item.discount_percent / 100);
    const taxableAmount = baseAmount - discountAmount;
    const taxAmount = taxableAmount * (item.tax_percent / 100);
    item.amount = taxableAmount + taxAmount;

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

  // Remove item
  const removeItem = (index: number) => {
    const updatedItems = noteData.items.filter((_, i) => i !== index);
    setNoteData(prev => ({ ...prev, items: updatedItems }));
    calculateTotals(updatedItems);
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!noteData.customer_id) {
      toast.error('Please select a customer');
      return;
    }

    if (!noteData.invoice_id) {
      toast.error('Please select an invoice');
      return;
    }

    if (!noteData.reason) {
      toast.error('Please select a reason');
      return;
    }

    const selectedItems = noteData.items.filter(item => item.selected);
    if (selectedItems.length === 0) {
      toast.error('Please select at least one item');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...noteData,
        note_type: noteType.toUpperCase(),
        items: selectedItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
          tax_percent: item.tax_percent,
          amount: item.amount
        }))
      };

      const response = await notesApi.createCreditDebitNote(payload);

      if (response.data?.success || response.data || response.status === 200) {
        toast.success(`${isCredit ? 'Credit' : 'Debit'} note created successfully`);

        // Reset form
        setNoteData({
          note_number: generateNoteNumber(),
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
        setSelectedCustomer(null);
        setSelectedInvoice(null);
        setShowItemsSection(false);

        // Switch to list tab
        setActiveTab('list');
      }
    } catch (error: any) {
      toast.error(error.message || `Failed to create ${noteType} note`);
    } finally {
      setSaving(false);
    }
  };

  // Calculate summary data
  const summaryItems = [
    { label: 'Subtotal', value: noteData.subtotal, isBold: false },
    { label: 'Tax Amount', value: noteData.tax_amount, isBold: false },
    {
      label: `Total ${isCredit ? 'Credit' : 'Debit'} Amount`,
      value: noteData.total_amount,
      isTotal: true,
      color: isCredit ? theme.colors.secondary.DEFAULT : theme.colors.warning.DEFAULT
    }
  ];

  return (
    <div className={classes.pageContainer}>
      <div className={classes.contentWrapper}>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Back"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
              )}

              {isCredit ? (
                <CreditCard className="w-8 h-8 text-green-600" />
              ) : (
                <Receipt className="w-8 h-8 text-orange-600" />
              )}
              <div>
                <h1 className={classes.pageTitle}>
                  {isCredit ? 'Credit' : 'Debit'} Notes Management
                </h1>
                <p className={classes.bodyText}>
                  Create and manage {isCredit ? 'credit' : 'debit'} notes for invoices
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as 'create' | 'list')}
                    className={`
                      flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors
                      ${activeTab === tab.id
                        ? `border-${isCredit ? 'green' : 'orange'}-500 text-${isCredit ? 'green' : 'orange'}-600`
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5 mr-2" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Create Note Tab */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Section */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardSection title="Basic Information">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Note Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={classes.formLabel}>Note Number</label>
                        <input
                          type="text"
                          value={noteData.note_number}
                          className={`${theme.components.input.base} mt-1 bg-gray-50`}
                          readOnly
                        />
                      </div>

                      <div>
                        <label className={classes.formLabel}>Note Date *</label>
                        <DatePicker
                          value={noteData.note_date}
                          onChange={(date) => setNoteData(prev => ({
                            ...prev,
                            note_date: typeof date === 'string' ? date : date?.toISOString().split('T')[0] || ''
                          }))}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    {/* Customer Selection */}
                    <div>
                      <label className={classes.formLabel}>Customer *</label>
                      <CustomerSearch
                        value={selectedCustomer}
                        onChange={handleCustomerSelect}
                        placeholder="Search customer by name, phone or ID..."
                        className="mt-1"
                      />
                    </div>

                    {/* Invoice Selection */}
                    {selectedCustomer && (
                      <div>
                        <label className={classes.formLabel}>Select Invoice *</label>
                        <InvoiceSelector
                          customerId={selectedCustomer.id || selectedCustomer.customer_id}
                          onSelect={handleInvoiceSelect}
                        />
                      </div>
                    )}

                    {/* Reason and Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={classes.formLabel}>Reason *</label>
                        <Select
                          options={reasonOptions}
                          value={noteData.reason}
                          onChange={(reason) => setNoteData(prev => ({ ...prev, reason }))}
                          placeholder="Select reason..."
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label className={classes.formLabel}>Notes</label>
                        <textarea
                          value={noteData.notes}
                          onChange={(e) => setNoteData(prev => ({ ...prev, notes: e.target.value }))}
                          className={`${theme.components.input.base} h-20 resize-none mt-1`}
                          placeholder="Additional notes..."
                          rows={3}
                        />
                      </div>
                    </div>
                  </form>
                </CardSection>
              </Card>

              {/* Items Section */}
              {showItemsSection && noteData.items.length > 0 && (
                <Card>
                  <CardSection title="Invoice Items">
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
                            className={`p-4 border rounded-lg ${item.selected ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
                              }`}
                          >
                            <div className="flex items-start justify-between">
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
                                        className={`${theme.components.input.base} mt-1`}
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
                                      <p className="mt-1 font-medium text-blue-600">
                                        ₹{item.amount.toFixed(2)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => removeItem(index)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                                title="Remove item"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardSection>
                </Card>
              )}

              {/* Action Buttons */}
              {showItemsSection && (
                <div className="flex justify-end space-x-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowItemsSection(false);
                      setSelectedInvoice(null);
                      setNoteData(prev => ({
                        ...prev,
                        invoice_id: '',
                        invoice_number: '',
                        invoice_date: '',
                        items: [],
                        subtotal: 0,
                        tax_amount: 0,
                        total_amount: 0
                      }));
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={saving || noteData.items.filter(i => i.selected).length === 0}
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Create {isCredit ? 'Credit' : 'Debit'} Note
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Summary Section */}
            <div>
              <Card>
                <CardSection title="Note Summary">
                  {noteData.total_amount > 0 ? (
                    <div className="space-y-4">
                      {/* Selected Invoice Info */}
                      {selectedInvoice && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium text-gray-700">Invoice Details</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Invoice: {selectedInvoice.invoice_number}
                          </p>
                          <p className="text-xs text-gray-500">
                            Date: {new Date(selectedInvoice.invoice_date).toLocaleDateString()}
                          </p>
                        </div>
                      )}

                      {/* Amount Summary */}
                      <SummaryCard
                        title={`${isCredit ? 'Credit' : 'Debit'} Amount Breakdown`}
                        items={summaryItems}
                        variant="detailed"
                      />

                      {/* Additional Info */}
                      <div className={`p-3 rounded-lg ${isCredit ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                        }`}>
                        <p className={`text-sm font-medium ${isCredit ? 'text-green-800' : 'text-orange-800'
                          }`}>
                          {isCredit
                            ? 'This amount will be credited to customer account'
                            : 'This amount will be added to customer dues'
                          }
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className={classes.bodyText}>
                        Select invoice items to see summary
                      </p>
                    </div>
                  )}
                </CardSection>
              </Card>
            </div>
          </div>
        )}

        {/* List Tab */}
        {activeTab === 'list' && (
          <Card>
            <CardSection title={`${isCredit ? 'Credit' : 'Debit'} Notes`}>
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">
                  {isCredit ? 'Credit' : 'Debit'} notes list will appear here
                </p>
              </div>
            </CardSection>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CreditDebitNoteSimple;