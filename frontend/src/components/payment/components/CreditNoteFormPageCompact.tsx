import React, { useState, useRef, useEffect } from 'react';
import { 
  User, FileText, Calendar, CreditCard, AlertCircle, 
  CheckCircle, X, ChevronRight, Calculator, Info
} from 'lucide-react';
import { CustomerSearch, Card } from '../../global';

interface CreditNoteFormPageCompactProps {
  selectedCustomer: any;
  setSelectedCustomer: (customer: any) => void;
  noteData: any;
  handleFieldChange: (field: string, value: any) => void;
  reasonOptions: any[];
  settlementOptions: any[];
  createWithoutInvoice: boolean;
  setCreateWithoutInvoice: (value: boolean) => void;
  noteItems: any[];
  setNoteItems: (items: any[]) => void;
  updateNoteItem: (itemId: string, field: string, value: any) => void;
  customerInvoices: any[];
  loadingInvoices: boolean;
  handleInvoiceSelect: (invoice: any) => void;
  loadingItems: boolean;
  totals: any;
  includeGST: boolean;
  onIncludeGSTChange: (value: boolean) => void;
}

const CreditNoteFormPageCompact: React.FC<CreditNoteFormPageCompactProps> = ({
  selectedCustomer,
  setSelectedCustomer,
  noteData,
  handleFieldChange,
  reasonOptions,
  settlementOptions,
  createWithoutInvoice,
  setCreateWithoutInvoice,
  noteItems,
  setNoteItems,
  updateNoteItem,
  customerInvoices,
  loadingInvoices,
  handleInvoiceSelect,
  loadingItems,
  totals,
  includeGST,
  onIncludeGSTChange
}) => {
  const [activeSection, setActiveSection] = useState<string>('customer');
  const dateRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);

  // Auto-advance to next section after customer selection
  useEffect(() => {
    if (selectedCustomer && activeSection === 'customer') {
      setActiveSection('details');
      // Focus on date field
      setTimeout(() => dateRef.current?.focus(), 100);
    }
  }, [selectedCustomer]);

  // Simplified reason options (consistent with sales return)
  const simplifiedReasons = [
    { value: 'price_adjustment', label: 'Price Adjustment' },
    { value: 'quality_issue', label: 'Quality Issue' },
    { value: 'return_goods', label: 'Goods Returned' },
    { value: 'discount', label: 'Additional Discount' },
    { value: 'other', label: 'Other' }
  ];

  // Simplified settlement options
  const simplifiedSettlements = [
    { value: 'credit_note', label: 'Credit Note' },
    { value: 'refund', label: 'Refund' }
  ];

  const handleRemoveItem = (itemId: string) => {
    setNoteItems(noteItems.filter(item => item.id !== itemId));
  };

  const isFormValid = () => {
    return selectedCustomer && 
           noteData.date && 
           noteData.reason && 
           noteData.settlement_type &&
           (createWithoutInvoice || noteData.selected_invoice) &&
           (!createWithoutInvoice ? noteItems.some(item => item.quantity > 0) : noteData.amount > 0);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Compact Step Indicator */}
      <div className="flex items-center space-x-2 mb-4 bg-white rounded-lg p-2 shadow-sm">
        <div 
          className={`flex items-center space-x-1 px-3 py-1.5 rounded cursor-pointer transition-colors ${
            activeSection === 'customer' ? 'bg-blue-100 text-blue-700' : 
            selectedCustomer ? 'bg-green-50 text-green-700' : 'text-gray-500'
          }`}
          onClick={() => setActiveSection('customer')}
        >
          <User className="w-4 h-4" />
          <span className="text-sm font-medium">Customer</span>
          {selectedCustomer && <CheckCircle className="w-3 h-3 ml-1" />}
        </div>
        
        <ChevronRight className="w-4 h-4 text-gray-400" />
        
        <div 
          className={`flex items-center space-x-1 px-3 py-1.5 rounded cursor-pointer transition-colors ${
            activeSection === 'details' ? 'bg-blue-100 text-blue-700' : 
            noteData.reason && noteData.settlement_type ? 'bg-green-50 text-green-700' : 'text-gray-500'
          }`}
          onClick={() => selectedCustomer && setActiveSection('details')}
        >
          <FileText className="w-4 h-4" />
          <span className="text-sm font-medium">Details</span>
          {noteData.reason && noteData.settlement_type && <CheckCircle className="w-3 h-3 ml-1" />}
        </div>
        
        <ChevronRight className="w-4 h-4 text-gray-400" />
        
        <div 
          className={`flex items-center space-x-1 px-3 py-1.5 rounded cursor-pointer transition-colors ${
            activeSection === 'invoice' ? 'bg-blue-100 text-blue-700' : 
            noteData.selected_invoice ? 'bg-green-50 text-green-700' : 'text-gray-500'
          }`}
          onClick={() => selectedCustomer && noteData.reason && setActiveSection('invoice')}
        >
          <Calculator className="w-4 h-4" />
          <span className="text-sm font-medium">Invoice & Items</span>
          {noteData.selected_invoice && <CheckCircle className="w-3 h-3 ml-1" />}
        </div>
      </div>

      {/* Customer Selection - Compact when filled */}
      {activeSection === 'customer' && (
        <Card className="mb-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Select Customer
            </h3>
            <CustomerSearch
              onSelect={(customer) => {
                setSelectedCustomer(customer);
                handleFieldChange('customer_id', customer.id);
              }}
              selectedCustomer={selectedCustomer}
              placeholder="Search by name, phone, or ID..."
              className="w-full"
            />
          </div>
        </Card>
      )}

      {/* Compact Customer Display */}
      {selectedCustomer && activeSection !== 'customer' && (
        <div className="bg-blue-50 rounded-lg p-2 mb-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <User className="w-4 h-4 text-blue-600" />
            <div>
              <span className="font-medium text-sm">{selectedCustomer.name}</span>
              <span className="text-xs text-gray-600 ml-2">
                {selectedCustomer.phone} | Balance: ₹{selectedCustomer.outstanding_balance || 0}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setActiveSection('customer');
            }}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Change
          </button>
        </div>
      )}

      {/* Details Section - Auto-focused */}
      {selectedCustomer && activeSection === 'details' && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Credit Note Details
          </h3>
          
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Date</label>
              <input
                ref={dateRef}
                type="date"
                value={noteData.date || ''}
                onChange={(e) => handleFieldChange('date', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-600 mb-1">Reason</label>
              <select
                ref={reasonRef}
                value={noteData.reason || ''}
                onChange={(e) => {
                  handleFieldChange('reason', e.target.value);
                  if (noteData.settlement_type) {
                    setActiveSection('invoice');
                  }
                }}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select reason</option>
                {simplifiedReasons.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs text-gray-600 mb-1">Settlement</label>
              <select
                value={noteData.settlement_type || ''}
                onChange={(e) => {
                  handleFieldChange('settlement_type', e.target.value);
                  if (noteData.reason) {
                    setActiveSection('invoice');
                  }
                }}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select type</option>
                {simplifiedSettlements.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {noteData.reason && noteData.settlement_type && (
            <button
              onClick={() => setActiveSection('invoice')}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              Continue to Invoice Selection <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          )}
        </Card>
      )}

      {/* Compact Details Display */}
      {noteData.reason && noteData.settlement_type && activeSection !== 'details' && (
        <div className="bg-green-50 rounded-lg p-2 mb-3 flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm">
            <span className="text-gray-600">Date: <strong>{noteData.date}</strong></span>
            <span className="text-gray-600">Reason: <strong>{simplifiedReasons.find(r => r.value === noteData.reason)?.label}</strong></span>
            <span className="text-gray-600">Settlement: <strong>{simplifiedSettlements.find(s => s.value === noteData.settlement_type)?.label}</strong></span>
          </div>
          <button
            onClick={() => setActiveSection('details')}
            className="text-xs text-green-600 hover:text-green-800"
          >
            Edit
          </button>
        </div>
      )}

      {/* Invoice Selection & Items - Compact Table View */}
      {selectedCustomer && noteData.reason && noteData.settlement_type && activeSection === 'invoice' && (
        <Card>
          <div className="space-y-4">
            {/* Header with GST Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Select Invoice & Items
              </h3>
              
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeGST}
                    onChange={(e) => onIncludeGSTChange(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Include GST</span>
                </label>
                
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createWithoutInvoice}
                    onChange={(e) => setCreateWithoutInvoice(e.target.checked)}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Create without invoice</span>
                </label>
              </div>
            </div>

            {/* Invoice List - Compact Table */}
            {!createWithoutInvoice && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {loadingInvoices ? (
                  <div className="p-4 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : customerInvoices.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No invoices found for this customer
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left"></th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Invoice #</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Date</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Amount</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Credit</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customerInvoices.map((invoice) => (
                        <tr 
                          key={invoice.id}
                          className={`hover:bg-gray-50 cursor-pointer ${
                            noteData.selected_invoice?.id === invoice.id ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => handleInvoiceSelect(invoice)}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              checked={noteData.selected_invoice?.id === invoice.id}
                              onChange={() => handleInvoiceSelect(invoice)}
                              className="h-4 w-4 text-blue-600"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">{invoice.invoice_number}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {new Date(invoice.invoice_date).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-right">₹{invoice.total_amount?.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-orange-600">
                            ₹{invoice.credit_amount?.toLocaleString() || 0}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                              invoice.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                              invoice.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {invoice.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Selected Invoice Items */}
            {noteData.selected_invoice && !createWithoutInvoice && (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-blue-50 rounded-lg p-2">
                  <span className="text-sm font-medium">
                    Invoice #{noteData.selected_invoice.invoice_number} Items
                  </span>
                  <button
                    onClick={() => {
                      handleFieldChange('selected_invoice', null);
                      setNoteItems([]);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Clear Selection
                  </button>
                </div>

                {loadingItems ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : noteItems.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Product</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Original Qty</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">Return Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Rate</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">Amount</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {noteItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2">
                              <div>
                                <div className="font-medium">{item.product_name}</div>
                                {item.batch_number && (
                                  <div className="text-xs text-gray-500">Batch: {item.batch_number}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center text-gray-600">
                              {item.original_quantity}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                value={item.quantity || 0}
                                onChange={(e) => updateNoteItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                min="0"
                                max={item.max_quantity}
                                className="w-16 px-1 py-0.5 text-center border border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                value={item.rate || 0}
                                onChange={(e) => updateNoteItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                                min="0"
                                className="w-20 px-1 py-0.5 text-right border border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              ₹{((item.quantity || 0) * (item.rate || 0)).toFixed(2)}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No items in this invoice
                  </div>
                )}

                {/* Totals Summary */}
                {noteItems.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-medium">₹{totals.subtotal.toFixed(2)}</span>
                      </div>
                      {includeGST && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600">GST:</span>
                            <span className="font-medium">₹{totals.taxTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-base font-semibold pt-1 border-t">
                            <span>Total:</span>
                            <span>₹{totals.grandTotal.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manual Amount Entry */}
            {createWithoutInvoice && (
              <div className="space-y-3">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-start space-x-2">
                    <Info className="w-4 h-4 text-orange-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-orange-800 font-medium">Manual Credit Note</p>
                      <p className="text-xs text-orange-700 mt-1">
                        Enter the credit amount manually without linking to an invoice
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Credit Amount</label>
                    <input
                      type="number"
                      value={noteData.amount || ''}
                      onChange={(e) => handleFieldChange('amount', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter amount"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Notes</label>
                    <input
                      type="text"
                      value={noteData.notes || ''}
                      onChange={(e) => handleFieldChange('notes', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default CreditNoteFormPageCompact;