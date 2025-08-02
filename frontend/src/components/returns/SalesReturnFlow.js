import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Search, Package, Calendar, X, AlertCircle, CheckCircle, 
  RotateCcw, FileText, User, ChevronRight, Save, Printer, History
} from 'lucide-react';
import { 
  CustomerSearch, ProductSearchSimple, ItemsTable, ModuleHeader,
  DatePicker, Select, NumberInput, NotesSection, useToast, InvoiceSearch
} from '../global';
import { returnsApi, invoicesApi, customersApi } from '../../services/api';
import ReturnItemsTable from './components/ReturnItemsTable';
import ReturnSummary from './components/ReturnSummary';
import CreditNotePreview from './components/CreditNotePreview';

// Return reason codes as per the requirements doc
const RETURN_REASONS = [
  { value: 'EXPIRED', label: 'Expired Product' },
  { value: 'DAMAGED', label: 'Damaged Product' },
  { value: 'WRONG_PRODUCT', label: 'Wrong Product Delivered' },
  { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
  { value: 'NOT_REQUIRED', label: 'Not Required' },
  { value: 'EXCESS_STOCK', label: 'Excess Stock' },
  { value: 'RATE_DIFFERENCE', label: 'Rate Difference' },
  { value: 'OTHER', label: 'Other' }
];

const SalesReturnFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Refs for keyboard navigation
  const customerSearchRef = useRef(null);
  const invoiceSearchRef = useRef(null);
  const firstInputRef = useRef(null);

  // Return data state
  const [returnData, setReturnData] = useState({
    return_no: '',
    return_date: new Date().toISOString().split('T')[0],
    customer_id: '',
    customer_details: null,
    invoice_id: '',
    invoice_no: '',
    invoice_date: '',
    original_invoice: null,
    items: [],
    return_reason: '',
    return_reason_notes: '',
    subtotal_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    credit_note_no: '',
    status: 'PENDING',
    include_gst: true, // Default to including GST
    credit_adjustment_type: 'future' // 'future' or 'existing_dues'
  });

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnableInvoices, setReturnableInvoices] = useState([]);
  const [customerDues, setCustomerDues] = useState(0);

  // Generate return number
  const generateReturnNumber = () => {
    const timestamp = Date.now();
    return `RET-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
  };

  // Initialize return number
  useEffect(() => {
    setReturnData(prev => ({
      ...prev,
      return_no: generateReturnNumber()
    }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            if (customerSearchRef.current) {
              customerSearchRef.current.focus();
            }
            break;
          case 'i':
            e.preventDefault();
            if (invoiceSearchRef.current) {
              invoiceSearchRef.current.focus();
            }
            break;
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              handleSaveReturn();
            } else {
              handleProceedToReview();
            }
            break;
          case 'p':
            e.preventDefault();
            if (currentStep === 2) {
              handlePrint();
            }
            break;
        }
      }
      
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  // Focus first input on mount
  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, []);

  // Handle customer selection
  const handleCustomerSelect = async (customer) => {
    console.log('Customer selected:', customer);
    setSelectedCustomer(customer);
    setReturnData(prev => ({
      ...prev,
      customer_id: customer.id || customer.customer_id || customer.party_id,
      customer_details: customer
    }));

    // Fetch customer outstanding balance
    try {
      const response = await customersApi.getOutstandingBalance(
        customer.id || customer.customer_id || customer.party_id
      );
      if (response.success) {
        setCustomerDues(response.data.outstanding_amount || 0);
      }
    } catch (error) {
      console.error('Error fetching customer dues:', error);
      setCustomerDues(0);
    }
  };

  // Handle invoice selection
  const handleInvoiceSelect = async (invoice) => {
    setSelectedInvoice(invoice);
    
    // Fetch invoice details if items not included
    let invoiceWithItems = invoice;
    if (!invoice.items) {
      try {
        setLoading(true);
        const response = await invoicesApi.getById(invoice.invoice_id || invoice.id);
        if (response.success) {
          invoiceWithItems = response.data;
        }
      } catch (error) {
        toast.error('Failed to fetch invoice details');
        console.error('Error fetching invoice details:', error);
        return;
      } finally {
        setLoading(false);
      }
    }
    
    setReturnData(prev => ({
      ...prev,
      invoice_id: invoiceWithItems.invoice_id || invoiceWithItems.id,
      invoice_no: invoiceWithItems.invoice_number || invoiceWithItems.invoice_no,
      invoice_date: invoiceWithItems.invoice_date,
      original_invoice: invoiceWithItems,
      items: (invoiceWithItems.items || []).map((item, index) => ({
        ...item,
        id: item.item_id || item.id || `item-${index}`,
        product_id: item.product_id,
        product_name: item.product_name || item.product?.name,
        batch_id: item.batch_id,
        rate: item.rate || item.sale_price || item.price || item.unit_price,
        tax_percent: item.tax_percent || item.gst_percent || 18,
        quantity: item.quantity,
        return_quantity: 0,
        max_returnable_qty: item.quantity - (item.returned_quantity || 0),
        return_reason: '',
        selected: false,
        hsn_code: item.hsn_code || ''
      }))
    }));
  };

  // Update return item
  const updateReturnItem = (itemId, field, value) => {
    console.log('updateReturnItem called:', { itemId, field, value });
    setReturnData(prev => {
      console.log('Current items before update:', prev.items);
      const updatedItems = prev.items.map(item => {
        if (item.id === itemId) {
          console.log('Found item to update:', { 
            id: item.id, 
            currentValue: item[field], 
            newValue: value,
            field: field
          });
          const updatedItem = { ...item, [field]: value };
          console.log('Updated item:', updatedItem);
          return updatedItem;
        }
        return item;
      });
      console.log('All items after update:', updatedItems);
      return {
        ...prev,
        items: updatedItems
      };
    });
  };

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    returnData.items.forEach(item => {
      if (item.selected && item.return_quantity > 0) {
        const itemTotal = item.return_quantity * item.rate;
        // Always calculate tax for return amount (both GST and non-GST customers paid it)
        // Only exclude if GST customer explicitly chooses to exclude
        const itemTax = (!selectedCustomer?.gst_number || returnData.include_gst) 
          ? (itemTotal * item.tax_percent) / 100 
          : 0;
        subtotal += itemTotal;
        taxAmount += itemTax;
      }
    });

    const total = subtotal + taxAmount;

    setReturnData(prev => ({
      ...prev,
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      total_amount: total
    }));
  };

  // Watch for item changes and recalculate
  useEffect(() => {
    calculateTotals();
  }, [returnData.items, selectedCustomer, returnData.include_gst]);

  // Validate return
  const validateReturn = () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return false;
    }

    if (!selectedInvoice) {
      toast.error('Please select an invoice');
      return false;
    }

    const hasSelectedItems = returnData.items.some(item => 
      item.selected && item.return_quantity > 0
    );

    if (!hasSelectedItems) {
      toast.error('Please select items to return');
      return false;
    }

    if (!returnData.return_reason) {
      toast.error('Please select a return reason');
      return false;
    }

    // Validate quantities
    for (const item of returnData.items) {
      if (item.selected && item.return_quantity > item.max_returnable_qty) {
        toast.error(`Return quantity exceeds available quantity for ${item.product_name}`);
        return false;
      }
    }

    return true;
  };

  // Proceed to review
  const handleProceedToReview = () => {
    if (validateReturn()) {
      setCurrentStep(2);
      window.scrollTo(0, 0);
    }
  };

  // Save return
  const handleSaveReturn = async () => {
    if (!validateReturn()) return;

    setSaving(true);
    try {
      const returnPayload = {
        ...returnData,
        // Items will be filtered and transformed in the API transformer
      };

      const response = await returnsApi.createSaleReturn(returnPayload);
      
      if (response.data) {
        const { credit_note_no, has_gst, message } = response.data;
        
        if (credit_note_no) {
          toast.success(`Sales return created successfully with GST Credit Note: ${credit_note_no}`);
        } else if (has_gst === false) {
          toast.success('Sales return created successfully (No GST credit note - customer does not have GST)');
        } else {
          toast.success(message || 'Sales return created successfully');
        }
      } else {
        toast.success('Sales return created successfully');
      }
      
      // Reset form or close
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (error) {
      toast.error(error.message || 'Failed to create return');
      console.error('Error creating return:', error);
    } finally {
      setSaving(false);
    }
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Step 1: Create Return
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Sales Return"
            subtitle="Process customer returns"
            onClose={onClose}
            actions={[
              {
                label: 'History',
                icon: History,
                onClick: () => {},
                shortcut: 'Ctrl+H'
              }
            ]}
          />

          {/* Quick Actions Bar */}
          <div className="bg-red-50 px-4 py-2 text-sm text-red-700 border-b border-red-200">
            Keyboard shortcuts: <strong>Ctrl+R</strong> - Search Customer | <strong>Ctrl+I</strong> - Search Invoice | <strong>Ctrl+S</strong> - Proceed | <strong>Esc</strong> - Close
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Return Header */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Sales Return</h2>
                    <p className="text-lg text-gray-600 mt-2">Return No: <span className="font-semibold">{returnData.return_no}</span></p>
                  </div>
                  <div className="w-64">
                    <DatePicker
                      value={returnData.return_date}
                      onChange={(date) => setReturnData(prev => ({ ...prev, return_date: date }))}
                      label="Return Date"
                      size="lg"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Customer Selection */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Select Customer</h3>
                  {!selectedCustomer ? (
                    <CustomerSearch
                      ref={customerSearchRef}
                      onChange={handleCustomerSelect}
                      placeholder="Search customer by name, phone..."
                      className="w-full"
                      showCreateButton={true}
                    />
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-gray-900">{selectedCustomer.customer_name || selectedCustomer.name}</h4>
                        <p className="text-sm text-gray-600">{selectedCustomer.phone}</p>
                        <p className="text-sm text-gray-600">{selectedCustomer.address}</p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedCustomer(null);
                          setSelectedInvoice(null);
                          setReturnData(prev => ({
                            ...prev,
                            customer_id: '',
                            customer_details: null,
                            invoice_id: '',
                            items: []
                          }));
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Invoice Selection */}
                {selectedCustomer && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Select Invoice</h3>
                    {!selectedInvoice ? (
                      <InvoiceSearch
                        ref={invoiceSearchRef}
                        customerId={selectedCustomer.id || selectedCustomer.customer_id || selectedCustomer.party_id}
                        invoiceType="SALES"
                        onSelect={handleInvoiceSelect}
                        placeholder="Search invoice by number, date, or product..."
                        autoFocus={true}
                        showDetails={true}
                        filters={{ status: ['PAID', 'PARTIAL'], returnable: true }}
                        onError={(error) => toast.error(error.message)}
                      />
                    ) : (
                      <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            Invoice #{selectedInvoice.invoice_number || selectedInvoice.invoice_no}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Date: {new Date(selectedInvoice.invoice_date).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-600">
                            Amount: ₹{selectedInvoice.total_amount || selectedInvoice.grand_total}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedInvoice(null);
                            setReturnData(prev => ({
                              ...prev,
                              invoice_id: '',
                              items: []
                            }));
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Return Reason - Moved Above Items */}
              {selectedInvoice && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Return Details</h3>
                  
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Return Reason <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={returnData.return_reason}
                      onChange={(value) => setReturnData(prev => ({ ...prev, return_reason: value }))}
                      options={RETURN_REASONS}
                      placeholder="Select reason..."
                    />
                  </div>

                  {/* GST Toggle for GST customers */}
                  {selectedCustomer && selectedCustomer.gst_number && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={returnData.include_gst}
                          onChange={(e) => setReturnData(prev => ({ ...prev, include_gst: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Include GST in return amount (Customer sees total amount paid)
                        </span>
                      </label>
                      <p className="text-xs text-gray-600 mt-1 ml-7">
                        When checked, the return amount will include GST. Uncheck to show base amount only.
                      </p>
                    </div>
                  )}
                  
                  {/* Credit Adjustment Option */}
                  {customerDues > 0 && (
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Credit Adjustment</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Customer has outstanding dues of ₹{customerDues.toFixed(2)}
                      </p>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="creditAdjustment"
                            value="existing_dues"
                            checked={returnData.credit_adjustment_type === 'existing_dues'}
                            onChange={(e) => setReturnData(prev => ({ 
                              ...prev, 
                              credit_adjustment_type: e.target.value 
                            }))}
                            className="mr-2 text-blue-600"
                          />
                          <span className="text-sm">
                            Adjust against existing dues (₹{Math.min(returnData.total_amount, customerDues).toFixed(2)} will be adjusted)
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="creditAdjustment"
                            value="future"
                            checked={returnData.credit_adjustment_type === 'future'}
                            onChange={(e) => setReturnData(prev => ({ 
                              ...prev, 
                              credit_adjustment_type: e.target.value 
                            }))}
                            className="mr-2 text-blue-600"
                          />
                          <span className="text-sm">Keep as credit for future invoices</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Return Items */}
              {selectedInvoice && returnData.items.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Select Items to Return</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Check the items you want to return and specify quantities
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Select all items
                          returnData.items.forEach(item => {
                            updateReturnItem(item.id, 'selected', true);
                            updateReturnItem(item.id, 'return_quantity', item.max_returnable_qty);
                          });
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          // Deselect all items
                          returnData.items.forEach(item => {
                            updateReturnItem(item.id, 'selected', false);
                            updateReturnItem(item.id, 'return_quantity', 0);
                          });
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <ReturnItemsTable
                    items={returnData.items}
                    onUpdateItem={updateReturnItem}
                    customer={selectedCustomer}
                    includeGst={returnData.include_gst}
                  />
                </div>
              )}



              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToReview}
                  disabled={!returnData.items.some(item => item.selected && item.return_quantity > 0)}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Proceed to Review
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Review and Confirm
  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        <ModuleHeader
          title="Review Sales Return"
          subtitle="Confirm and generate credit note"
          onClose={onClose}
          actions={[
            {
              label: 'Back',
              icon: ArrowLeft,
              onClick: () => setCurrentStep(1)
            },
            {
              label: 'Print',
              icon: Printer,
              onClick: handlePrint,
              shortcut: 'Ctrl+P'
            }
          ]}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6">
            <CreditNotePreview
              returnData={returnData}
              customer={selectedCustomer}
              invoice={selectedInvoice}
              includeGst={returnData.include_gst}
              customerDues={customerDues}
            />
            
            {/* Notes Section */}
            <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <NotesSection
                value={returnData.return_reason_notes}
                onChange={(value) => setReturnData(prev => ({ 
                  ...prev, 
                  return_reason_notes: value 
                }))}
                placeholder="Add any additional notes about this return..."
                title="Return Notes"
                rows={4}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-white">
          <div className="text-lg font-semibold text-gray-900">
            Total Return Amount: ₹{returnData.total_amount.toFixed(2)}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back to Edit
            </button>
            <button
              onClick={handleSaveReturn}
              disabled={saving}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Generate Credit Note
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesReturnFlow;