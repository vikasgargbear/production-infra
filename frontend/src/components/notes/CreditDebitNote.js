import React, { useState, useEffect, useRef } from 'react';
import { 
  X, FileText, Search, Calendar, PlusCircle, MinusCircle,
  Save, Printer, User, Hash, IndianRupee, AlertCircle,
  CheckCircle, History, Building
} from 'lucide-react';
import { customersApi, suppliersApi, ordersApi, salesApi, purchasesApi } from '../../services/api';
import { searchCache, smartSearch } from '../../utils/searchCache';
// import { notesDataTransformer } from '../../services/api/utils/notesDataTransformer';

// Import global components
import { CustomerSearch, ProductSearch, GSTCalculator, ProductCreationModal, CustomerCreationModal, ProceedToReviewComponent } from '../global';

const CreditDebitNoteV2 = ({ open = true, onClose, initialNoteType = 'credit' }) => {
  const [note, setNote] = useState({
    note_type: initialNoteType, // 'credit' or 'debit'
    note_no: '',
    date: new Date().toISOString().split('T')[0],
    party_type: 'customer', // 'customer' or 'supplier'
    party_id: '',
    party_name: '',
    party_details: null,
    amount: '',
    tax_rate: 0,
    tax_amount: 0,
    total_amount: 0,
    reason: '',
    linked_invoice_id: '',
    linked_invoice_no: '',
    description: ''
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [selectedParty, setSelectedParty] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false);
  const [invoiceSearchResults, setInvoiceSearchResults] = useState([]);

  // Keyboard shortcuts
  const shortcuts = [
    { key: 'Tab', label: 'Switch Type' },
    { key: 'Ctrl+F', label: 'Search Party' },
    { key: 'Ctrl+I', label: 'Link Invoice' },
    { key: 'Ctrl+S', label: 'Save' },
    { key: 'Ctrl+P', label: 'Print' },
    { key: 'Esc', label: 'Close' }
  ];

  useEffect(() => {
    const handleKeyPress = (e) => {
      // Tab to switch note type
      if (e.key === 'Tab' && !e.shiftKey && !e.target.tagName.match(/INPUT|TEXTAREA|SELECT/)) {
        e.preventDefault();
        setNote(prev => ({
          ...prev,
          note_type: prev.note_type === 'credit' ? 'debit' : 'credit'
        }));
      }
      // Ctrl+I to link invoice
      if (e.ctrlKey && e.key === 'i') {
        e.preventDefault();
        setShowInvoiceSearch(true);
      }
      // Ctrl+S to save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+P to print
      if (e.ctrlKey && e.key === 'p' && note.note_no) {
        e.preventDefault();
        window.print();
      }
      // Esc to close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [note]);

  // Generate note number
  useEffect(() => {
    generateNoteNumber();
  }, [note.note_type]);

  const generateNoteNumber = async () => {
    try {
      // Generate note number locally
      const prefix = note.note_type === 'credit' ? 'CN' : 'DN';
      const timestamp = Date.now();
      setNote(prev => ({ ...prev, note_no: `${prefix}-${timestamp}` }));
    } catch (error) {
      console.error('Error generating note number:', error);
      // Fallback to local generation
      const prefix = note.note_type === 'credit' ? 'CN' : 'DN';
      const timestamp = Date.now();
      setNote(prev => ({ ...prev, note_no: `${prefix}-${timestamp}` }));
    }
  };

  // Common reasons
  const creditReasons = [
    { value: 'discount', label: 'Discount Adjustment' },
    { value: 'overcharge', label: 'Overcharge Correction' },
    { value: 'quality', label: 'Quality Issues' },
    { value: 'return', label: 'Goods Return' },
    { value: 'goodwill', label: 'Goodwill Gesture' },
    { value: 'other', label: 'Other' }
  ];

  const debitReasons = [
    { value: 'undercharge', label: 'Undercharge Correction' },
    { value: 'late_payment', label: 'Late Payment Charges' },
    { value: 'service_charge', label: 'Additional Service Charge' },
    { value: 'damage', label: 'Damage/Loss Recovery' },
    { value: 'penalty', label: 'Penalty Charges' },
    { value: 'other', label: 'Other' }
  ];

  const reasons = note.note_type === 'credit' ? creditReasons : debitReasons;

  // Calculate tax and total
  useEffect(() => {
    if (note.amount) {
      const amount = parseFloat(note.amount) || 0;
      const taxAmount = (amount * note.tax_rate) / 100;
      const totalAmount = amount + taxAmount;
      
      setNote(prev => ({
        ...prev,
        tax_amount: taxAmount,
        total_amount: totalAmount
      }));
    }
  }, [note.amount, note.tax_rate]);

  const handlePartySelect = (party) => {
    setSelectedParty(party);
    setNote(prev => ({
      ...prev,
      party_id: party.id || party.customer_id || party.supplier_id,
      party_name: party.customer_name || party.supplier_name || party.name,
      party_details: party
    }));
  };

  const searchInvoices = async (query) => {
    if (!selectedParty || !query) {
      setInvoiceSearchResults([]);
      return;
    }

    try {
      let response;
      if (note.party_type === 'customer') {
        response = await salesApi.getAll({ 
          party_id: selectedParty.party_id || selectedParty.id,
          search: query,
          limit: 10
        });
      } else {
        response = await purchasesApi.getAll({ 
          party_id: selectedParty.party_id || selectedParty.id,
          search: query,
          limit: 10
        });
      }
      
      const invoices = response.data?.results || response.data || [];
      setInvoiceSearchResults(
        invoices.map(inv => ({
          id: inv.id,
          invoice_no: inv.invoice_number || inv.invoice_no,
          date: inv.invoice_date || inv.date,
          amount: inv.total_amount || inv.amount || 0,
          status: inv.status
        }))
      );
    } catch (error) {
      console.error('Error searching invoices:', error);
      setInvoiceSearchResults([]);
    }
  };

  const handleInvoiceSelect = (invoice) => {
    setSelectedInvoice(invoice);
    setNote(prev => ({
      ...prev,
      linked_invoice_id: invoice.id,
      linked_invoice_no: invoice.invoice_no
    }));
    setShowInvoiceSearch(false);
  };

  const validateForm = () => {
    if (!selectedParty) {
      setMessage('Please select a party', 'error');
      setMessageType('error');
      return false;
    }
    if (!note.amount || parseFloat(note.amount) <= 0) {
      setMessage('Please enter a valid amount', 'error');
      setMessageType('error');
      return false;
    }
    if (!note.reason) {
      setMessage('Please select a reason', 'error');
      setMessageType('error');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      // Prepare data for API
      const transformedData = {
        ...note,
        party_id: selectedParty?.id || selectedParty?.customer_id || selectedParty?.supplier_id,
        amount: parseFloat(note.amount) || 0,
        tax_rate: parseFloat(note.tax_rate) || 0
      };
      
      // Simulate API call - TODO: Implement notes API
      await new Promise(resolve => setTimeout(resolve, 1000));
      const response = { data: { success: true } };
      
      if (response.data) {
        setMessage(`${note.note_type === 'credit' ? 'Credit' : 'Debit'} note created successfully!`, 'success');
        setMessageType('success');
        
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Error saving note:', error);
      setMessage(error.response?.data?.message || 'Failed to save note', 'error');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const clearMessage = () => {
    setMessage('');
    setMessageType('');
  };

  if (!open) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                note.note_type === 'credit' 
                  ? 'bg-gradient-to-br from-green-500 to-green-600' 
                  : 'bg-gradient-to-br from-orange-500 to-orange-600'
              }`}>
                {note.note_type === 'credit' ? (
                  <PlusCircle className="w-6 h-6 text-white" />
                ) : (
                  <MinusCircle className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {note.note_type === 'credit' ? 'Credit Note' : 'Debit Note'}
                </h1>
                <p className="text-sm text-gray-500">
                  {note.note_no}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {/* Open history */}}
                className="px-3 py-1.5 text-gray-600 hover:text-gray-800 transition-colors text-sm flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                History
              </button>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Message Display */}
          {message && (
            <div className={`px-4 py-3 rounded-lg flex items-start text-sm ${
              messageType === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
              messageType === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 
              'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">{message}</div>
              <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Note Type Toggle */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={() => setNote(prev => ({ ...prev, note_type: 'credit' }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  note.note_type === 'credit' 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                Credit Note
              </button>
              <button
                onClick={() => setNote(prev => ({ ...prev, note_type: 'debit' }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  note.note_type === 'debit' 
                    ? 'bg-orange-600 text-white hover:bg-orange-700' 
                    : 'text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <MinusCircle className="w-4 h-4" />
                Debit Note
              </button>
            </div>
          </div>

          {/* Party & Basic Details */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Party & Details</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {/* Party Type Toggle */}
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium text-gray-700">Party Type:</label>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setNote(prev => ({ ...prev, party_type: 'customer' }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                        note.party_type === 'customer' 
                          ? 'bg-blue-600 text-white hover:bg-blue-700' 
                          : 'text-gray-600 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      Customer
                    </button>
                    <button
                      onClick={() => setNote(prev => ({ ...prev, party_type: 'supplier' }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                        note.party_type === 'supplier' 
                          ? 'bg-blue-600 text-white hover:bg-blue-700' 
                          : 'text-gray-600 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Building className="w-4 h-4" />
                      Supplier
                    </button>
                  </div>
                </div>

                {/* Party Selection */}
                <CustomerSearch
                  value={selectedParty}
                  onChange={handlePartySelect}
                  onCreateNew={() => {/* Handle create new */}}
                  displayMode="inline"
                  placeholder={`Select a ${note.party_type}`}
                  required
                />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={note.date}
                        onChange={(e) => setNote(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Linked Invoice
                    </label>
                    <div className="relative">
                      {selectedInvoice ? (
                        <div className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-900">
                            {selectedInvoice.invoice_no}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedInvoice(null);
                              setNote(prev => ({
                                ...prev,
                                linked_invoice_id: '',
                                linked_invoice_no: ''
                              }));
                            }}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowInvoiceSearch(true)}
                          className="w-full px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                        >
                          <FileText className="w-4 h-4" />
                          Link Invoice (Optional)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Amount Details */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Amount Details</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={note.reason}
                    onChange={(e) => setNote(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select reason</option>
                    {reasons.map(reason => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      value={note.amount}
                      onChange={(e) => setNote(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Tax Rate (%)</label>
                  <input
                    type="number"
                    value={note.tax_rate}
                    onChange={(e) => setNote(prev => ({ ...prev, tax_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0"
                    min="0"
                    max="28"
                    step="0.5"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Summary
                  </label>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Amount</span>
                        <span className="font-medium">₹{(parseFloat(note.amount) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tax Amount</span>
                        <span className="font-medium">₹{(note.tax_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-semibold">Total Amount</span>
                        <span className="font-bold text-lg">₹{(note.total_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <textarea
                    value={note.description}
                    onChange={(e) => setNote(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter additional details..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => window.print()}
              disabled={!note.note_no}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Bar */}
      <div className="bg-gray-100 border-t border-gray-200 px-6 py-2">
        <div className="flex items-center justify-center space-x-4 text-xs text-gray-600">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="flex items-center space-x-1">
              <kbd className="px-2 py-1 bg-gray-200 border border-gray-300 rounded text-xs font-mono">
                {shortcut.key}
              </kbd>
              <span>{shortcut.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice Search Modal */}
      {showInvoiceSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Link Invoice</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search invoice number..."
                onChange={(e) => searchInvoices(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
            <div className="mt-4 max-h-60 overflow-y-auto">
              {invoiceSearchResults.map(invoice => (
                <button
                  key={invoice.id}
                  onClick={() => handleInvoiceSelect(invoice)}
                  className="w-full text-left p-3 hover:bg-gray-50 rounded-lg"
                >
                  <p className="font-medium text-gray-900">{invoice.invoice_no}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(invoice.date).toLocaleDateString()} • ₹{invoice.amount.toFixed(2)}
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowInvoiceSearch(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditDebitNoteV2;