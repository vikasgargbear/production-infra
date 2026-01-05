import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Search, Package, Calendar, X, AlertCircle, CheckCircle,
  RotateCcw, FileText, Building2, ChevronRight, Save, Printer, History, Truck, Plus, Trash2
} from 'lucide-react';
import {
  SupplierSearch, ProductSearchSimple, ModuleHeader,
  DatePicker, Select, NumberInput, NotesSection, useToast, ViewHistoryButton,
  ProceedToReviewComponent, StandardDatePicker, ItemsTable
} from '../global';
import { returnsApi, purchasesApi, suppliersApi, settingsApi, metadataApi } from '../../services/api';
import PurchaseReturnSelector from './ui/PurchaseReturnSelector';
import DebitNotePreview from './ui/DebitNotePreview';
import offlineStorage from '../../services/offlineStorage';

const PurchaseReturnFlowV2 = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const historyButtonRef = useRef(null);
  const toast = useToast();

  // Refs for keyboard navigation
  const supplierSearchRef = useRef(null);
  const invoiceSearchRef = useRef(null);
  const firstInputRef = useRef(null);

  // Return data state - matching sales return structure
  const [returnData, setReturnData] = useState({
    return_no: '',
    return_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    supplier_details: null,
    supplier_invoice_id: '',
    invoice_no: '',
    invoice_date: '',
    original_invoice: null,
    items: [],
    return_reason: '',
    return_reason_notes: '',
    return_method: 'debit_note', // Default to debit note
    subtotal_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    debit_note_no: '',
    status: 'PENDING',
    include_gst: true,
    transport_details: {
      transport_mode: '',
      vehicle_no: '',
      transporter_name: '',
      lr_no: ''
    }
  });

  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnReasons, setReturnReasons] = useState([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showInvoiceSection, setShowInvoiceSection] = useState(true);
  const [manualItemCounter, setManualItemCounter] = useState(1);
  const [returnableInvoices, setReturnableInvoices] = useState([]);
  const [availableBatches, setAvailableBatches] = useState({});

  // Load return reasons from system settings
  useEffect(() => {
    const loadReturnReasons = async () => {
      // First set default reasons immediately
      const defaultReasons = [
        { value: 'EXPIRED', label: 'Expired Product' },
        { value: 'DAMAGED', label: 'Damaged/Defective Product' },
        { value: 'WRONG_PRODUCT', label: 'Wrong Product Received' },
        { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
        { value: 'EXCESS_ORDER', label: 'Excess Order' },
        { value: 'NEAR_EXPIRY', label: 'Near Expiry' },
        { value: 'RATE_DISPUTE', label: 'Rate Dispute' },
        { value: 'SCHEME_ISSUE', label: 'Scheme/Discount Issue' },
        { value: 'OTHER', label: 'Other' }
      ];
      setReturnReasons(defaultReasons);

      // Then try to load from backend in background
      try {
        const cached = await offlineStorage.getOffline('purchase_return_reasons', { persistent: true });
        if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
          setReturnReasons(cached.data);
        }

        const response = await metadataApi.getReturnReasons();
        const fetchedReasons = response.data?.purchase_return_reasons || [];

        if (Array.isArray(fetchedReasons) && fetchedReasons.length > 0) {
          setReturnReasons(fetchedReasons);
          await offlineStorage.storeOffline('purchase_return_reasons', fetchedReasons, { persistent: true });
        }
      } catch (error) {
      }
    };

    loadReturnReasons();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            if (supplierSearchRef.current) {
              supplierSearchRef.current.focus();
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
            if (currentStep === 1) {
              handleProceedToReview();
            } else if (currentStep === 2) {
              handleSaveReturn();
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
        if (currentStep === 2) setCurrentStep(1);
        else onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  // Handle invoice selection
  const handleInvoiceSelect = async (invoice) => {
    if (!invoice) return;

    setSelectedInvoice(invoice);
    setReturnData(prev => ({
      ...prev,
      supplier_invoice_id: invoice.supplier_invoice_id || invoice.invoice_id,
      invoice_no: invoice.supplier_invoice_number || invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      original_invoice: invoice
    }));

    // Load invoice items if not already loaded
    try {
      setLoading(true);
      const response = await returnsApi.getSupplierInvoiceReturnableItems(
        invoice.supplier_invoice_id || invoice.invoice_id
      );

      if (response.data.items) {

        const mappedItems = response.data.items.map(item => {
          return {
            ...item,
            id: item.invoice_item_id || item.id,
            invoice_item_id: item.invoice_item_id,
            return_quantity: parseFloat(item.returnable_quantity || 0), // Pre-fill with max returnable
            selected: true, // Pre-select all
            rate: item.unit_price || item.rate || item.unit_price || 0,
            unit_price: item.unit_price || item.rate || item.unit_price || 0,
            unit_price: item.unit_price || item.rate || item.unit_price || 0,
            tax_percent: item.tax_percent || 18,
            discount_percent: item.discount_percent || 0,
            max_returnable_qty: parseFloat(item.returnable_quantity || 0),
            batch_id: item.batch_id,
            batch_number: item.batch_number,
            disposition: 'RESTOCK',
            restock: true
          };
        });

        setReturnData(prev => ({
          ...prev,
          items: mappedItems
        }));
      }
    } catch (error) {
      toast.error('Failed to load invoice items');
    } finally {
      setLoading(false);
    }
  };

  // Handle supplier selection
  const handleSupplierSelect = async (supplier) => {
    if (!supplier) {
      setSelectedSupplier(null);
      setSelectedInvoice(null);
      setShowInvoiceSection(true);
      setShowManualEntry(false);
      setReturnData(prev => ({
        ...prev,
        supplier_id: '',
        supplier_details: null,
        supplier_invoice_id: '',
        items: []
      }));
      return;
    }

    const fullSupplier = {
      ...supplier,
      supplier_name: supplier.supplier_name || supplier.name,
      address: supplier.address || supplier.billing_address || '',
      phone: supplier.phone || supplier.mobile || '',
      gst_number: supplier.gst_number || supplier.gst_number || ''
    };

    setSelectedSupplier(fullSupplier);
    setSelectedInvoice(null);
    setShowInvoiceSection(true);
    setShowManualEntry(false);

    const supplierId = supplier.supplier_id || supplier.id || supplier.party_id;

    setReturnData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_details: fullSupplier,
      supplier_invoice_id: '',
      items: []
    }));

    // Fetch returnable invoices
    try {
      setLoading(true);
      const response = await purchasesApi.getReturnableInvoices({
        supplier_id: supplierId
      });
      setReturnableInvoices(response.data?.invoices || []);
    } catch (error) {
      toast.error('Failed to fetch supplier invoices');
    } finally {
      setLoading(false);
    }
  };

  // Skip invoice selection for manual entry
  const handleSkipInvoiceSelection = () => {
    setShowInvoiceSection(false);
    setShowManualEntry(true);
    setSelectedInvoice(null);
    setReturnData(prev => ({
      ...prev,
      supplier_invoice_id: '',
      invoice_no: '',
      items: []
    }));
  };

  // Add manual item
  const handleAddManualItem = () => {
    const newItem = {
      id: `manual_${manualItemCounter}`,
      product_id: null,
      product_name: '',
      batch_number: '',
      quantity: 0,
      return_quantity: 0,
      rate: 0,
      unit_price: 0,
      unit_price: 0,
      tax_percent: 18,
      discount_percent: 0,
      selected: true,
      is_manual: true,
      max_returnable_qty: 999999
    };

    setReturnData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
    setManualItemCounter(prev => prev + 1);
  };

  // Update return item
  const updateReturnItem = (itemId, field, value) => {
    setReturnData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId || item.invoice_item_id === itemId) {
          const updated = { ...item, [field]: value };
          return updated;
        }
        return item;
      })
    }));
  };

  // Use effect to recalculate totals when items change
  React.useEffect(() => {
    let subtotal = 0;
    let taxAmount = 0;

    returnData.items.forEach(item => {
      if (item.selected && item.return_quantity > 0) {
        const returnQty = parseFloat(item.return_quantity) || 0;
        const rate = parseFloat(item.rate) || parseFloat(item.unit_price) || parseFloat(item.unit_price) || 0;
        const taxPercent = parseFloat(item.tax_percent) || parseFloat(item.gst_percent) || 0;

        const itemTotal = returnQty * rate;
        const itemTax = returnData.include_gst ? (itemTotal * taxPercent / 100) : 0;

        subtotal += itemTotal;
        taxAmount += itemTax;
      }
    });

    setReturnData(prev => ({
      ...prev,
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      total_amount: subtotal + taxAmount
    }));
  }, [returnData.items, returnData.include_gst]);

  // Remove manual item
  const removeManualItem = (itemId) => {
    setReturnData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    returnData.items.forEach(item => {
      if (item.selected && item.return_quantity > 0) {
        const returnQty = parseFloat(item.return_quantity) || 0;
        const rate = parseFloat(item.rate) || parseFloat(item.unit_price) || parseFloat(item.unit_price) || 0;
        const taxPercent = parseFloat(item.tax_percent) || parseFloat(item.gst_percent) || 0;

        const itemTotal = returnQty * rate;
        const itemTax = returnData.include_gst ? (itemTotal * taxPercent / 100) : 0;

        subtotal += itemTotal;
        taxAmount += itemTax;
      }
    });

    setReturnData(prev => ({
      ...prev,
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      total_amount: subtotal + taxAmount
    }));
  };

  // Validate return
  const validateReturn = () => {
    if (!returnData.supplier_id) {
      toast.error('Please select a supplier');
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
      // Debug logging

      const filteredItems = returnData.items.filter(item => {
        const hasQuantity = parseFloat(item.return_quantity) > 0;
        return item.selected && hasQuantity;
      });

      const returnPayload = {
        ...returnData,
        purchase_id: selectedInvoice?.supplier_invoice_id || selectedInvoice?.invoice_id,  // Set purchase_id for transformer
        reason: returnData.return_reason,  // Transformer expects 'reason' not 'return_reason'
        original_purchase: selectedInvoice,  // Keep for reference
        items: filteredItems
          .map(item => {
            const mappedItem = {
              invoice_item_id: item.invoice_item_id || item.id,
              product_id: item.product_id,
              batch_id: item.batch_id,
              batch_number: item.batch_number,
              return_quantity: item.return_quantity,  // Transformer expects this
              quantity: item.return_quantity,  // Backend expects this
              rate: item.rate || item.unit_price || item.unit_price || 0,
              unit_price: item.unit_price || item.rate || item.unit_price || 0,
              cost_per_unit: item.rate || item.unit_price || item.unit_price || 0,  // Transformer expects this
              discount_percent: item.discount_percent || 0,
              tax_percent: item.tax_percent || item.gst_percent || 0,
              return_reason: item.return_reason || returnData.return_reason,
              selected: true,
              restock: item.restock !== false,
              disposition: item.restock !== false ? 'RESTOCK' : 'DESTROY'
            };
            return mappedItem;
          })
      };

      const response = await returnsApi.createPurchaseReturn(returnPayload);

      toast.success('Purchase return created successfully');

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      toast.error(error.message || 'Failed to create return');
    } finally {
      setSaving(false);
    }
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Step 1: Create Return - Sales Return Style
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Purchase Return"
            subtitle="Create return to supplier"
            documentNumber={returnData.return_no}
            status="draft"
            icon={RotateCcw}
            iconColor="text-orange-600"
            onClose={onClose}
            historyType="return"
          />

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Top Section - Date, Reason, Method */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex gap-6">
                  {/* Left side - Return Date */}
                  <div className="w-64">
                    <DatePicker
                      value={returnData.return_date}
                      onChange={(date) => setReturnData(prev => ({ ...prev, return_date: date }))}
                      label="Return Date"
                      size="lg"
                      className="w-full"
                    />
                  </div>

                  {/* Right side - Return Reason and Method */}
                  <div className="flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Reason <span className="text-red-500">*</span>
                        </label>
                        <Select
                          value={returnData.return_reason}
                          onChange={(value) => setReturnData(prev => ({ ...prev, return_reason: value }))}
                          options={returnReasons}
                          placeholder="Select return reason..."
                          size="lg"
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Method <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={returnData.return_method || 'debit_note'}
                          onChange={(e) => setReturnData(prev => ({ ...prev, return_method: e.target.value }))}
                          className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="debit_note">Debit Note (Recommended)</option>
                          <option value="replacement">Replacement</option>
                          <option value="refund">Refund (Requires Approval)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Supplier & Invoice Selection */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                {/* Supplier Section */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center">
                    <Building2 className="w-4 h-4 mr-2" />
                    SUPPLIER
                  </h3>
                  <SupplierSearch
                    value={selectedSupplier || null}
                    onChange={handleSupplierSelect}
                    displayMode="inline"
                    placeholder="Search supplier by name, phone, or code..."
                    required
                    clearable={true}
                  />
                </div>

                {/* Show option to select invoice if skipped */}
                {selectedSupplier && !showInvoiceSection && showManualEntry && (
                  <div className="mb-4">
                    <button
                      onClick={() => {
                        setShowInvoiceSection(true);
                        setShowManualEntry(false);
                        setReturnData(prev => ({ ...prev, items: [] }));
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      ← Back to Invoice Selection
                    </button>
                  </div>
                )}

                {/* Invoice Section */}
                {selectedSupplier && showInvoiceSection && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center">
                        <FileText className="w-4 h-4 mr-2" />
                        SELECT SUPPLIER INVOICE
                      </h3>
                      <button
                        onClick={handleSkipInvoiceSelection}
                        className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Skip Invoice Selection
                      </button>
                    </div>

                    {/* Show selected invoice if any */}
                    {selectedInvoice && (
                      <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center mb-4">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            Invoice #{selectedInvoice.supplier_invoice_number || selectedInvoice.invoice_number}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Date: {new Date(selectedInvoice.invoice_date).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-600">
                            Amount: ₹{(selectedInvoice.total_amount || selectedInvoice.invoice_amount || 0).toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedInvoice(null);
                            setReturnData(prev => ({
                              ...prev,
                              supplier_invoice_id: '',
                              items: []
                            }));
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    )}

                    {/* Invoice Selector */}
                    {!selectedInvoice && (
                      <PurchaseReturnSelector
                        invoices={returnableInvoices}
                        onInvoiceSelect={handleInvoiceSelect}
                        loading={loading}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Return Items */}
              {(selectedInvoice || showManualEntry) && returnData.items.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Package className="w-5 h-5 mr-2 text-blue-600" />
                      Return Items
                    </h3>
                    {showManualEntry && (
                      <button
                        onClick={handleAddManualItem}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add Item
                      </button>
                    )}
                  </div>

                  <ItemsTable
                    items={returnData.items}
                    onUpdateItem={updateReturnItem}
                    onRemoveItem={showManualEntry ? removeManualItem : null}
                    showRestock={true}
                    isManualEntry={showManualEntry}
                  />
                </div>
              )}

              {/* Manual Entry Option */}
              {showManualEntry && returnData.items.length === 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="text-center py-8">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 mb-4">No items added yet</p>
                    <button
                      onClick={handleAddManualItem}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-5 h-5" />
                      Add First Item
                    </button>
                  </div>
                </div>
              )}

              {/* Additional Notes */}
              {(selectedInvoice || showManualEntry) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <NotesSection
                    value={returnData.return_reason_notes}
                    onChange={(value) => setReturnData(prev => ({ ...prev, return_reason_notes: value }))}
                    placeholder="Add any additional notes about this return..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white border-t border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {returnData.items.filter(item => item.selected).length} items selected
                </span>
                <span className="text-lg font-semibold">
                  Total: ₹{returnData.total_amount.toLocaleString()}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToReview}
                  disabled={!returnData.items.some(item => item.selected && item.return_quantity > 0)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Proceed to Review
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
          title="Review Purchase Return"
          subtitle="Confirm and generate debit note"
          documentNumber={returnData.return_no}
          status="pending"
          icon={CheckCircle}
          iconColor="text-green-600"
          onClose={onClose}
        />

        {/* Content - Following Global UI Pattern (no sidebar) */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">
            {/* Main Debit Note Preview */}
            <DebitNotePreview
              returnData={returnData}
              supplier={selectedSupplier}
              purchase={selectedInvoice}
            />

            {/* Return Notes Section - Below preview */}
            <div className="mt-6 bg-white rounded-lg shadow-sm border border-blue-200 p-6">
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

            {/* Important Notice - Below notes */}
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-900 mb-1">Important</p>
                  <p className="text-yellow-700">
                    Once confirmed, a debit note will be generated and the supplier will be notified.
                    The return amount of <span className="font-bold">₹{returnData.total_amount.toFixed(2)}</span> will be adjusted against future purchases.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Using Global Component */}
        <ProceedToReviewComponent
          currentStep={2}
          canProceed={true}
          onBack={() => setCurrentStep(1)}
          onProceed={handleSaveReturn}
          onReset={null}
          totalItems={returnData.items.filter(item => item.selected).length}
          totalAmount={returnData.total_amount}
          proceedText="Generate Debit Note"
          backText="Back"
          saving={saving}
        />
      </div>
    </div>
  );
};

export default PurchaseReturnFlowV2;