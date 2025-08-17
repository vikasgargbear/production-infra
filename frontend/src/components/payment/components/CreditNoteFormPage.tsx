import React from 'react';
import { Filter, Calculator, CheckCircle, FileText } from 'lucide-react';
import { CustomerSearch, Select, Card } from '../../global';

interface CreditNoteFormPageProps {
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
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  invoiceFilters: any;
  setInvoiceFilters: (filters: any) => void;
  setInvoicePage: (page: number) => void;
  invoicePagination: any;
  invoicePage: number;
  handleInvoiceSelect: (invoice: any) => void;
  loadingItems: boolean;
  totals: any;
}

const CreditNoteFormPage: React.FC<CreditNoteFormPageProps> = ({
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
  showFilters,
  setShowFilters,
  invoiceFilters,
  setInvoiceFilters,
  setInvoicePage,
  invoicePagination,
  invoicePage,
  handleInvoiceSelect,
  loadingItems,
  totals
}) => {
  return (
    <div className="space-y-6">
      {/* Customer Selection */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Selection</h3>
        <CustomerSearch
          value={selectedCustomer}
          onChange={setSelectedCustomer}
          placeholder="Search customer by name, phone, or GST number..."
          className="w-full"
        />
        {selectedCustomer && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900">{selectedCustomer.customer_name}</h4>
            <p className="text-sm text-blue-700">Phone: {selectedCustomer.phone}</p>
            {selectedCustomer.gst_number && (
              <p className="text-sm text-blue-700">GST: {selectedCustomer.gst_number}</p>
            )}
          </div>
        )}
      </Card>

      {/* Note Details */}
      {selectedCustomer && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Credit Note Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Credit Note</label>
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

      {/* Invoice Selection */}
      {selectedCustomer && noteData.reason && noteData.settlement_type && (
        <Card>
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Select Invoice (Optional)
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              You can create a credit note without linking it to a specific invoice, or select an invoice to link this credit note.
            </p>
            
            {/* Create without invoice toggle */}
            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={createWithoutInvoice}
                  onChange={(e) => {
                    setCreateWithoutInvoice(e.target.checked);
                    if (e.target.checked) {
                      // Clear invoice selection and add a default item
                      handleFieldChange('selected_invoice', null);
                      setNoteItems([{
                        id: 'standalone-1',
                        product_name: 'Credit Note Amount',
                        hsn_code: '',
                        quantity: 1,
                        rate: 0,
                        discount_percent: 0,
                        total_amount: 0
                      }]);
                    } else {
                      // Clear standalone items
                      setNoteItems([]);
                    }
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Create credit note without selecting an invoice
                </span>
              </label>
            </div>
            
            {/* Show invoice selection only if not creating standalone */}
            {!createWithoutInvoice && (
              <>
                {/* Compact Filters */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Filter className="w-4 h-4" />
                    <span>Filter Invoices</span>
                    <span className="text-xs text-gray-400">({customerInvoices.length} shown)</span>
                  </button>
                  {(invoiceFilters.dateFrom || invoiceFilters.dateTo || invoiceFilters.status !== 'all' || invoiceFilters.minAmount || invoiceFilters.maxAmount) && (
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceFilters({
                          dateFrom: '',
                          dateTo: '',
                          status: 'all',
                          minAmount: '',
                          maxAmount: ''
                        });
                        setInvoicePage(1);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
                
                {showFilters && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
                        <input
                          type="date"
                          value={invoiceFilters.dateFrom}
                          onChange={(e) => {
                            setInvoiceFilters(prev => ({ ...prev, dateFrom: e.target.value }));
                            setInvoicePage(1);
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
                        <input
                          type="date"
                          value={invoiceFilters.dateTo}
                          onChange={(e) => {
                            setInvoiceFilters(prev => ({ ...prev, dateTo: e.target.value }));
                            setInvoicePage(1);
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                        <select
                          value={invoiceFilters.status}
                          onChange={(e) => {
                            setInvoiceFilters(prev => ({ ...prev, status: e.target.value }));
                            setInvoicePage(1);
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                        >
                          <option value="all">All</option>
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Amount Range</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            placeholder="Min"
                            value={invoiceFilters.minAmount}
                            onChange={(e) => {
                              setInvoiceFilters(prev => ({ ...prev, minAmount: e.target.value }));
                              setInvoicePage(1);
                            }}
                            className="w-1/2 px-2 py-1.5 text-sm border border-gray-300 rounded"
                          />
                          <input
                            type="number"
                            placeholder="Max"
                            value={invoiceFilters.maxAmount}
                            onChange={(e) => {
                              setInvoiceFilters(prev => ({ ...prev, maxAmount: e.target.value }));
                              setInvoicePage(1);
                            }}
                            className="w-1/2 px-2 py-1.5 text-sm border border-gray-300 rounded"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {loadingInvoices ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-gray-600 mt-2">Loading invoices...</p>
                  </div>
                ) : customerInvoices.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">No invoices found</p>
                    <p className="text-sm">
                      {Object.values(invoiceFilters).some(v => v && v !== 'all') ? 'No invoices match the selected filters' : 'This customer has no outstanding invoices'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-4">
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
                            </div>
                            {noteData.selected_invoice?.id === invoice.id && (
                              <CheckCircle className="w-5 h-5 text-blue-600 ml-4" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination Controls */}
                    {invoicePagination && invoicePagination.total_pages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <div className="text-sm text-gray-600">
                          Showing {customerInvoices.length} of {invoicePagination.total_count} invoices
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setInvoicePage(Math.max(1, invoicePage - 1))}
                            disabled={!invoicePagination.has_prev}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <span className="text-sm text-gray-600">
                            Page {invoicePage} of {invoicePagination.total_pages}
                          </span>
                          <button
                            onClick={() => setInvoicePage(Math.min(invoicePagination.total_pages, invoicePage + 1))}
                            disabled={!invoicePagination.has_next}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Standalone credit note form */}
            {createWithoutInvoice && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-900 mb-3">Credit Note Details</h4>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <input
                        type="text"
                        value={noteItems[0]?.product_name || ''}
                        onChange={(e) => {
                          if (noteItems.length > 0) {
                            updateNoteItem(noteItems[0].id, 'product_name', e.target.value);
                          }
                        }}
                        placeholder="e.g., Billing adjustment, Service credit, etc."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Credit Amount (₹)</label>
                      <input
                        type="number"
                        value={noteItems[0]?.total_amount || 0}
                        onChange={(e) => {
                          const amount = parseFloat(e.target.value) || 0;
                          if (noteItems.length > 0) {
                            updateNoteItem(noteItems[0].id, 'total_amount', amount);
                            updateNoteItem(noteItems[0].id, 'rate', amount);
                          }
                        }}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  {noteItems.length > 0 && noteItems[0].total_amount > 0 && (
                    <div className="mt-4 pt-4 border-t border-yellow-300">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-gray-900">Total Credit Amount:</span>
                        <span className="text-xl font-bold text-green-600">₹{totals.grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Invoice Items */}
      {noteData.selected_invoice && (
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
              <p className="text-lg font-medium">No items available</p>
              <p className="text-sm">This invoice has no items</p>
            </div>
          ) : (
            <div className="space-y-4">
              {noteItems.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
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
                    Total Credit Amount
                  </span>
                  <span className="text-xl font-bold text-amber-900">
                    ₹{totals.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default CreditNoteFormPage;